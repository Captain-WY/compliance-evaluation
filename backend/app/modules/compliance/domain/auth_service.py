from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.modules.compliance.core.config import Settings
from app.modules.compliance.core.errors import AppError
from app.modules.compliance.domain.auth_store import SeedAuthStore
from app.modules.compliance.providers.auth import LoginIdentityProvider


class AuthLoginService:
    async def login(self, username: str, password: str) -> dict[str, Any]:
        raise NotImplementedError


@dataclass
class LocalAuthLoginService(AuthLoginService):
    store: SeedAuthStore

    async def login(self, username: str, password: str) -> dict[str, Any]:
        return self.store.login(username, password)


@dataclass
class CasdoorAuthLoginService(AuthLoginService):
    store: SeedAuthStore
    settings: Settings
    identity_provider: LoginIdentityProvider

    async def login(self, username: str, password: str) -> dict[str, Any]:
        validate_casdoor_settings(self.settings)
        identity = await self.identity_provider.login(username, password)
        return self.store.login_with_external_identity(
            identity,
            strict_local_user=self.settings.casdoor_strict_local_user,
        )


def build_auth_service(settings: Settings, store: SeedAuthStore) -> AuthLoginService:
    mode = normalized_auth_mode(settings)
    if mode == "local":
        return LocalAuthLoginService(store=store)
    if mode == "casdoor":
        return CasdoorAuthLoginService(
            store=store,
            settings=settings,
            identity_provider=casdoor_identity_provider_factory(settings),
        )
    raise AppError(
        code="AUTH_CONFIG_INVALID",
        message="AUTH_MODE must be local or casdoor",
        status_code=503,
    )


def normalized_auth_mode(settings: Settings) -> str:
    return settings.auth_mode.strip().lower()


def validate_casdoor_settings(settings: Settings) -> None:
    required = {
        "CASDOOR_ENDPOINT": settings.casdoor_endpoint,
        "CASDOOR_CLIENT_ID": settings.casdoor_client_id,
        "CASDOOR_CLIENT_SECRET": settings.casdoor_client_secret,
        "CASDOOR_ORGANIZATION": settings.casdoor_organization,
        "CASDOOR_APPLICATION": settings.casdoor_application,
    }
    missing = [name for name, value in required.items() if not value]
    if not settings.casdoor_jwks_url and not settings.casdoor_public_key_path:
        missing.append("CASDOOR_JWKS_URL_OR_PUBLIC_KEY_PATH")
    if missing:
        raise AppError(
            code="CASDOOR_CONFIG_MISSING",
            message="Casdoor authentication is not fully configured",
            status_code=503,
            details={"missing": missing},
        )


def casdoor_identity_provider_factory(settings: Settings) -> LoginIdentityProvider:
    from app.modules.compliance.providers.casdoor import CasdoorIdentityProvider

    return CasdoorIdentityProvider(settings=settings)
