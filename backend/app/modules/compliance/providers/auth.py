from dataclasses import dataclass
from typing import Any, Protocol


@dataclass(frozen=True)
class ExternalIdentity:
    subject_id: str
    username: str
    display_name: str
    email: str | None = None
    phone: str | None = None
    active: bool = True
    organization: str | None = None
    application: str | None = None
    raw_claims: dict[str, Any] | None = None


class IdentityProvider(Protocol):
    async def verify_token(self, token: str) -> ExternalIdentity:
        """Verify a JWT/OAuth2 token and return an external identity."""


class LoginIdentityProvider(Protocol):
    async def login(self, username: str, password: str) -> ExternalIdentity:
        """Authenticate with an external identity provider and return an identity."""


class AuthorizationProvider(Protocol):
    async def enforce(
        self,
        subject: str,
        resource: str,
        action: str,
        domain: str | None = None,
    ) -> bool:
        """Return whether the subject can perform action on resource."""
