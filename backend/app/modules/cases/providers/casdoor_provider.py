"""
Casdoor Provider Module (ACL Layer).

Provides abstraction layer for Casdoor API interactions.
Follows ACL pattern to prevent direct third-party SDK imports in Service layer.
"""
import httpx
from typing import Protocol
from dataclasses import dataclass
from app.modules.cases.core.casdoor_config import CasdoorConfig
from app.modules.cases.core.config import settings
from app.modules.cases.core.exceptions import BusinessException


@dataclass
class AuthResult:
    """Authentication result from Casdoor."""
    status: str
    msg: str
    data: dict


@dataclass
class TokenResponse:
    """OAuth token response."""
    access_token: str
    refresh_token: str
    token_type: str
    expires_in: int


@dataclass
class UserInfo:
    """User information from Casdoor."""
    id: str
    name: str
    username: str
    email: str | None
    phone: str | None
    avatar: str | None
    organization: str


@dataclass
class TokenPayload:
    """JWT token payload."""
    sub: str  # User ID
    iss: str  # Issuer
    exp: int  # Expiration time
    iat: int  # Issued at
    name: str
    username: str


@dataclass
class UserResult:
    """User creation result."""
    status: str
    user_id: str
    msg: str


class ICasdoorProvider(Protocol):
    """Protocol defining Casdoor provider interface."""

    async def login(
        username: str, password: str, organization: str
    ) -> AuthResult: ...

    async def get_oauth_token(code: str) -> TokenResponse: ...

    async def get_user_info(user_id: str) -> UserInfo: ...

    async def validate_jwt_token(token: str) -> TokenPayload: ...

    async def create_user(user_data: dict) -> UserResult: ...

    async def update_user_status(user_id: str, is_forbidden: bool) -> bool: ...


class CasdoorProvider:
    """
    Casdoor API provider implementation.

    Provides HTTP client wrapper for Casdoor API calls.
    Implements ACL pattern to isolate third-party dependencies.
    """

    def __init__(self, config: CasdoorConfig):
        """
        Initialize Casdoor provider.

        Args:
            config: Casdoor configuration instance
        """
        self.config = config
        self.endpoint = config.endpoint
        self.client_id = config.client_id
        self.client_secret = config.client_secret
        self.organization = config.organization
        self.application = config.application

        # HTTP client (will be configured with timeout, retries)
        self._client = httpx.AsyncClient(timeout=30.0)

    async def login(
        self, username: str, password: str, organization: str
    ) -> AuthResult:
        """
        Login to Casdoor and get OAuth token using password grant.

        This method uses Casdoor's OAuth token endpoint with password grant type
        to directly obtain JWT tokens without authorization code flow.

        Args:
            username: User login name
            password: User password
            organization: Organization name

        Returns:
            AuthResult with status, tokens, and user data

        Raises:
            BusinessException: If login fails
        """
        import jwt
        import uuid as uuid_module
        from datetime import datetime, timedelta

        # DEV_MODE: bypass Casdoor for testing

        # Use OAuth token endpoint with password grant type
        token_url = f"{self.endpoint}/api/login/oauth/access_token"

        token_payload = {
            "grant_type": "password",
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "username": f"{organization}/{username}",  # Casdoor expects organization/username format
            "password": password,
            "scope": "openid"
        }

        try:
            # Request token using password grant
            token_response = await self._client.post(
                token_url,
                data=token_payload,  # Use form data for OAuth
                headers={"Content-Type": "application/x-www-form-urlencoded"}
            )

            if token_response.status_code != 200:
                content_type = token_response.headers.get("content-type", "")
                error_data = token_response.json() if "json" in content_type else {}
                error_msg = error_data.get("error_description", error_data.get("message", "登录失败"))
                return AuthResult(
                    status="error",
                    msg=error_msg,
                    data={}
                )

            token_data = token_response.json()

            # Return AuthResult with tokens
            return AuthResult(
                status="ok",
                msg="登录成功",
                data={
                    "access_token": token_data["access_token"],
                    "refresh_token": token_data["refresh_token"],
                    "token_type": token_data.get("token_type", "Bearer"),
                    "expires_in": token_data["expires_in"],
                    "user_identifier": f"{organization}/{username}"
                }
            )

        except httpx.HTTPError as e:
            return AuthResult(
                status="error",
                msg=f"网络请求失败: {str(e)}",
                data={}
            )

    async def get_oauth_token(self, code: str) -> TokenResponse:
        """
        Get OAuth token from authorization code.

        Args:
            code: OAuth authorization code

        Returns:
            TokenResponse with access and refresh tokens

        Raises:
            BusinessException: If token request fails
        """
        url = f"{self.endpoint}/api/oauth/token"

        payload = {
            "grant_type": "authorization_code",
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "code": code
        }

        try:
            response = await self._client.post(url, json=payload)
            response.raise_for_status()

            data = response.json()

            return TokenResponse(
                access_token=data["access_token"],
                refresh_token=data["refresh_token"],
                token_type=data.get("token_type", "Bearer"),
                expires_in=data["expires_in"]
            )

        except httpx.HTTPError as e:
            raise BusinessException(
                code=5001,
                message=f"获取 OAuth token 失败: {str(e)}"
            )

    async def get_user_info(self, user_id: str) -> UserInfo | None:
        """
        Get user information from Casdoor.

        Args:
            user_id: User UUID

        Returns:
            UserInfo with user details

        Raises:
            BusinessException: If user not found
        """
        # Casdoor API endpoint for getting user info
        # Format: /api/get-user?owner={organization}&id={user_id}
        url = f"{self.endpoint}/api/get-user"

        # Casdoor uses owner (organization) and id parameters
        params = {
            "owner": self.organization,
            "id": user_id
        }

        try:
            response = await self._client.get(url, params=params)

            if response.status_code != 200:
                # Log error but don't fail login
                print(f"Warning: Failed to get user info from Casdoor: {response.status_code}")
                return None

            data = response.json()

            return UserInfo(
                id=data.get("id", user_id),
                name=data.get("name", ""),
                username=data.get("username", ""),
                email=data.get("email"),
                phone=data.get("phone"),
                avatar=data.get("avatar"),
                organization=data.get("owner", self.organization)
            )

        except Exception as e:
            # Log error but don't fail login
            print(f"Warning: Exception while getting user info: {str(e)}")
            return None

    def _get_public_key_from_cert(self) -> str | None:
        """Extract RSA public key from X.509 certificate file."""
        import os
        from cryptography import x509
        from cryptography.hazmat.primitives import serialization

        cert_path = getattr(self.config, 'cert_path', None)
        if not cert_path:
            return None

        # Try relative to backend dir
        backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        paths_to_try = [
            cert_path,
            os.path.join(backend_dir, cert_path),
            os.path.join(os.getcwd(), cert_path),
        ]

        for path in paths_to_try:
            if os.path.exists(path):
                try:
                    with open(path, "rb") as f:
                        cert = x509.load_pem_x509_certificate(f.read())
                    public_key = cert.public_key()
                    pem = public_key.public_bytes(
                        encoding=serialization.Encoding.PEM,
                        format=serialization.PublicFormat.SubjectPublicKeyInfo
                    )
                    return pem.decode("utf-8")
                except Exception:
                    continue
        return None

    async def validate_jwt_token(self, token: str) -> TokenPayload:
        """
        Validate JWT token from Casdoor.

        Args:
            token: JWT token string

        Returns:
            TokenPayload with decoded claims

        Raises:
            BusinessException: If token invalid
        """
        import os
        import jwt as pyjwt

        # DEV_MODE: bypass Casdoor for testing
        if settings.DEV_MODE:
            try:
                payload = pyjwt.decode(token, "dev-secret-key", algorithms=["HS256"], options={"verify_aud": False})
                return TokenPayload(
                    sub=payload["sub"],
                    iss=payload.get("iss", "casdoor"),
                    exp=payload["exp"],
                    iat=payload["iat"],
                    name=payload.get("name", ""),
                    username=payload.get("name", "")
                )
            except Exception as e:
                raise BusinessException(
                    code=5003,
                    message=f"JWT token 验证失败: {str(e)}"
                )

        # Production: validate JWT with Casdoor public key
        public_key = self._get_public_key_from_cert()

        try:
            if public_key:
                payload = pyjwt.decode(
                    token,
                    public_key,
                    algorithms=["RS256"],
                    options={"verify_aud": False}
                )
            else:
                # Fallback: decode without signature verification
                payload = pyjwt.decode(token, options={"verify_signature": False})

            return TokenPayload(
                sub=payload.get("sub", ""),
                iss=payload.get("iss", "casdoor"),
                exp=payload.get("exp", 0),
                iat=payload.get("iat", 0),
                name=payload.get("name", ""),
                username=payload.get("name", "")
            )
        except Exception as e:
            raise BusinessException(
                code=5003,
                message=f"JWT token 验证失败: {str(e)}"
            )

    async def create_user(self, user_data: dict) -> UserResult:
        """
        Create user in Casdoor.

        Args:
            user_data: User creation data

        Returns:
            UserResult with status and user ID

        Raises:
            BusinessException: If user creation fails
        """
        url = f"{self.endpoint}/api/add-user"

        payload = {
            "organization": user_data.get("organization", self.organization),
            "name": user_data["name"],
            "username": user_data["username"],
            "password": user_data["password"],
            "type": "normal"
        }

        try:
            response = await self._client.post(url, json=payload)
            response.raise_for_status()

            data = response.json()

            if data.get("status") == "ok":
                return UserResult(
                    status="ok",
                    user_id=data["data"]["id"],
                    msg="用户创建成功"
                )
            else:
                raise BusinessException(
                    code=5004,
                    message=data.get("msg", "用户创建失败")
                )

        except httpx.HTTPError as e:
            raise BusinessException(
                code=5004,
                message=f"创建用户失败: {str(e)}"
            )

    async def update_user_status(
        self, user_id: str, is_forbidden: bool
    ) -> bool:
        """
        Update user status (enable/disable).

        Args:
            user_id: User UUID
            is_forbidden: True to disable, False to enable

        Returns:
            True if update successful

        Raises:
            BusinessException: If update fails
        """
        url = f"{self.endpoint}/api/update-user"

        payload = {
            "id": user_id,
            "isForbidden": is_forbidden
        }

        try:
            response = await self._client.post(url, json=payload)
            response.raise_for_status()

            data = response.json()

            return data.get("status") == "ok"

        except httpx.HTTPError as e:
            raise BusinessException(
                code=5005,
                message=f"更新用户状态失败: {str(e)}"
            )

    async def close(self):
        """Close HTTP client."""
        await self._client.aclose()

    async def __aenter__(self):
        """Async context manager entry."""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self.close()