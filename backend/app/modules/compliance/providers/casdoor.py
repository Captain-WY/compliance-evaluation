from __future__ import annotations

import base64
import json
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

import httpx

from app.modules.compliance.core.config import Settings
from app.modules.compliance.core.errors import AppError
from app.modules.compliance.providers.auth import ExternalIdentity

JWKS_CACHE_TTL_SECONDS = 300
TokenDecoder = Callable[[str, Any, Settings], dict[str, Any]]


class CasdoorTokenVerifier:
    def __init__(
        self,
        settings: Settings,
        *,
        token_decoder: TokenDecoder | None = None,
    ) -> None:
        self.settings = settings
        self._token_decoder = token_decoder
        self._jwks_cache: tuple[float, dict[str, Any]] | None = None

    async def verify_token(self, token: str) -> dict[str, Any]:
        key_source = await self._verification_key_source(token)
        claims = self._decode_token(token, key_source)
        self._validate_claims(claims)
        return claims

    async def _verification_key_source(self, token: str) -> Any:
        if self.settings.casdoor_jwks_url:
            try:
                jwks_key = await self._jwks_key_for_token(token)
            except AppError as exc:
                if exc.code != "AUTH_PROVIDER_UNAVAILABLE" or not (
                    self.settings.casdoor_public_key_path
                ):
                    raise
                return self._public_key_from_file()
            if jwks_key is not None:
                return jwks_key
        return self._public_key_from_file()

    async def _jwks_key_for_token(self, token: str) -> dict[str, Any] | None:
        header = self._unverified_header(token)
        kid = header.get("kid")
        jwks = await self._load_jwks()
        key = self._find_jwks_key(jwks, kid)
        if key is None:
            jwks = await self._load_jwks(refresh=True)
            key = self._find_jwks_key(jwks, kid)
        return key

    async def _load_jwks(self, *, refresh: bool = False) -> dict[str, Any]:
        now = time.time()
        if (
            not refresh
            and self._jwks_cache is not None
            and now - self._jwks_cache[0] < JWKS_CACHE_TTL_SECONDS
        ):
            return self._jwks_cache[1]
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(str(self.settings.casdoor_jwks_url))
        except httpx.HTTPError as exc:
            raise AppError(
                code="AUTH_PROVIDER_UNAVAILABLE",
                message="Casdoor JWKS endpoint is unavailable",
                status_code=503,
            ) from exc
        if response.status_code >= 500:
            raise AppError(
                code="AUTH_PROVIDER_UNAVAILABLE",
                message="Casdoor JWKS endpoint is unavailable",
                status_code=503,
            )
        if response.status_code != 200:
            raise AppError(
                code="CASDOOR_TOKEN_INVALID",
                message="Casdoor JWKS endpoint did not return verification keys",
                status_code=401,
            )
        try:
            jwks = response.json()
        except ValueError as exc:
            raise AppError(
                code="CASDOOR_TOKEN_INVALID",
                message="Casdoor JWKS response is invalid",
                status_code=401,
            ) from exc
        self._jwks_cache = (now, jwks if isinstance(jwks, dict) else {})
        return self._jwks_cache[1]

    @staticmethod
    def _find_jwks_key(jwks: dict[str, Any], kid: str | None) -> dict[str, Any] | None:
        keys = [key for key in jwks.get("keys", []) if isinstance(key, dict)]
        if kid:
            return next((key for key in keys if key.get("kid") == kid), None)
        return keys[0] if len(keys) == 1 else None

    def _public_key_from_file(self) -> str:
        path = self.settings.casdoor_public_key_path
        if not path:
            raise AppError(
                code="CASDOOR_CONFIG_MISSING",
                message="Casdoor public key fallback is not configured",
                status_code=503,
            )
        try:
            return Path(path).read_text(encoding="utf-8")
        except OSError as exc:
            raise AppError(
                code="CASDOOR_CONFIG_MISSING",
                message="Casdoor public key fallback is not readable",
                status_code=503,
            ) from exc

    def _decode_token(self, token: str, key_source: Any) -> dict[str, Any]:
        if self._token_decoder is not None:
            return self._token_decoder(token, key_source, self.settings)
        try:
            import jwt
        except ImportError as exc:
            raise AppError(
                code="AUTH_PROVIDER_UNAVAILABLE",
                message="PyJWT crypto support is required for Casdoor token verification",
                status_code=503,
            ) from exc
        key = key_source
        if isinstance(key_source, dict):
            key = jwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(key_source))
        try:
            return jwt.decode(
                token,
                key,
                algorithms=["RS256"],
                audience=self.settings.casdoor_client_id,
                issuer=self._expected_issuer(),
                leeway=self.settings.casdoor_jwt_leeway_seconds,
            )
        except jwt.InvalidTokenError as exc:
            raise AppError(
                code="CASDOOR_TOKEN_INVALID",
                message="Casdoor token verification failed",
                status_code=401,
            ) from exc

    def _validate_claims(self, claims: dict[str, Any]) -> None:
        self._require_claim(claims, "sub")
        self._require_claim(claims, "name")
        self._require_claim(claims, "iss")
        self._validate_issuer(claims)
        self._validate_audience(claims)
        self._validate_expiry(claims)
        self._validate_org(claims)
        self._validate_application_if_present(claims)

    @staticmethod
    def _require_claim(claims: dict[str, Any], name: str) -> None:
        if not claims.get(name):
            raise AppError(
                code="CASDOOR_TOKEN_INVALID",
                message=f"Casdoor token is missing {name}",
                status_code=401,
            )

    def _validate_issuer(self, claims: dict[str, Any]) -> None:
        if claims.get("iss") != self._expected_issuer():
            raise AppError(
                code="CASDOOR_TOKEN_INVALID",
                message="Casdoor token issuer mismatch",
                status_code=401,
            )

    def _validate_audience(self, claims: dict[str, Any]) -> None:
        audience = claims.get("aud")
        if isinstance(audience, str):
            audience_values = [audience]
        elif isinstance(audience, list):
            audience_values = [str(item) for item in audience]
        else:
            audience_values = []
        if self.settings.casdoor_client_id not in audience_values:
            raise AppError(
                code="CASDOOR_TOKEN_INVALID",
                message="Casdoor token audience mismatch",
                status_code=401,
            )

    @staticmethod
    def _validate_expiry(claims: dict[str, Any]) -> None:
        try:
            expires_at = int(claims.get("exp", 0))
        except (TypeError, ValueError) as exc:
            raise AppError(
                code="CASDOOR_TOKEN_INVALID",
                message="Casdoor token expiry is invalid",
                status_code=401,
            ) from exc
        if expires_at <= int(time.time()):
            raise AppError(
                code="CASDOOR_TOKEN_INVALID",
                message="Casdoor token has expired",
                status_code=401,
            )

    def _validate_org(self, claims: dict[str, Any]) -> None:
        org = claims.get("owner") or claims.get("organization")
        if org != self.settings.casdoor_organization:
            raise AppError(
                code="CASDOOR_TOKEN_INVALID",
                message="Casdoor token organization mismatch",
                status_code=401,
            )

    def _validate_application_if_present(self, claims: dict[str, Any]) -> None:
        application = (
            claims.get("application")
            or claims.get("applicationName")
            or claims.get("app")
        )
        if application and application != self.settings.casdoor_application:
            raise AppError(
                code="CASDOOR_TOKEN_INVALID",
                message="Casdoor token application mismatch",
                status_code=401,
            )

    def _expected_issuer(self) -> str:
        return str(self.settings.casdoor_endpoint).rstrip("/")

    @staticmethod
    def _unverified_header(token: str) -> dict[str, Any]:
        try:
            header_segment = token.split(".", 1)[0]
            padding = "=" * (-len(header_segment) % 4)
            raw = base64.urlsafe_b64decode(header_segment + padding)
            header = json.loads(raw.decode("utf-8"))
        except (ValueError, json.JSONDecodeError) as exc:
            raise AppError(
                code="CASDOOR_TOKEN_INVALID",
                message="Casdoor token header is invalid",
                status_code=401,
            ) from exc
        return header if isinstance(header, dict) else {}


class CasdoorIdentityProvider:
    def __init__(
        self,
        settings: Settings,
        *,
        verifier: CasdoorTokenVerifier | None = None,
    ) -> None:
        self.settings = settings
        self.verifier = verifier or CasdoorTokenVerifier(settings)

    async def login(self, username: str, password: str) -> ExternalIdentity:
        token = await self._request_access_token(username, password)
        claims = await self.verifier.verify_token(token)
        return identity_from_claims(claims)

    async def _request_access_token(self, username: str, password: str) -> str:
        endpoint = str(self.settings.casdoor_endpoint).rstrip("/")
        url = f"{endpoint}/api/login/oauth/access_token"
        form = {
            "grant_type": "password",
            "client_id": self.settings.casdoor_client_id,
            "client_secret": self.settings.casdoor_client_secret,
            "username": username,
            "password": password,
            "scope": "openid",
        }
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(
                    url,
                    data=form,
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                )
        except httpx.HTTPError as exc:
            raise AppError(
                code="AUTH_PROVIDER_UNAVAILABLE",
                message="Casdoor login endpoint is unavailable",
                status_code=503,
            ) from exc
        if response.status_code in {400, 401, 403}:
            raise AppError(
                code="INVALID_CREDENTIALS",
                message="用户名或密码错误",
                status_code=401,
            )
        if response.status_code >= 500:
            raise AppError(
                code="AUTH_PROVIDER_UNAVAILABLE",
                message="Casdoor login endpoint is unavailable",
                status_code=503,
            )
        try:
            payload = response.json()
        except ValueError as exc:
            raise AppError(
                code="AUTH_PROVIDER_UNAVAILABLE",
                message="Casdoor login response is invalid",
                status_code=503,
            ) from exc
        token = payload.get("access_token") if isinstance(payload, dict) else None
        if not token:
            raise AppError(
                code="AUTH_PROVIDER_UNAVAILABLE",
                message="Casdoor login response did not include an access token",
                status_code=503,
            )
        return str(token)


def identity_from_claims(claims: dict[str, Any]) -> ExternalIdentity:
    username = str(claims.get("name") or claims.get("username") or "")
    display_name = str(
        claims.get("displayName")
        or claims.get("display_name")
        or claims.get("display_name_cn")
        or username
    )
    return ExternalIdentity(
        subject_id=str(claims["sub"]),
        username=username,
        display_name=display_name,
        email=claims.get("email"),
        phone=claims.get("phone"),
        active=bool(claims.get("isActive", claims.get("active", True))),
        organization=claims.get("owner") or claims.get("organization"),
        application=claims.get("application")
        or claims.get("applicationName")
        or claims.get("app"),
        raw_claims=claims,
    )
