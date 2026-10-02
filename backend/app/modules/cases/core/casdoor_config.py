"""
Casdoor SDK Configuration Module.

Provides centralized configuration for Casdoor authentication integration.
"""
import os
from urllib.parse import urlparse
from dataclasses import dataclass


@dataclass
class CasdoorConfig:
    """
    Casdoor SDK configuration class.

    Manages connection settings for Casdoor authentication service.
    Supports both default values and environment variable configuration.
    """

    endpoint: str = "http://localhost:8001"
    client_id: str = ""
    client_secret: str = ""
    organization: str = "built-in"
    application: str = "app-built-in"
    jwt_public_key: str | None = None
    cert_path: str = "casdoor_cert.pem"

    def __post_init__(self):
        """Validate configuration after initialization."""
        self._validate()

    def _validate(self):
        """Validate configuration values."""
        if not self.endpoint:
            raise ValueError("endpoint is required")

        if not self.client_id:
            raise ValueError("client_id is required")

        if not self.client_secret:
            raise ValueError("client_secret is required")

        # Validate endpoint is a valid URL
        parsed = urlparse(self.endpoint)
        if not parsed.scheme or not parsed.netloc:
            raise ValueError("endpoint must be a valid URL")

    @classmethod
    def from_env(cls) -> "CasdoorConfig":
        """
        Create configuration from environment variables.

        Environment variables:
        - CASDOOR_ENDPOINT: Casdoor service endpoint
        - CASDOOR_CLIENT_ID: OAuth client ID
        - CASDOOR_CLIENT_SECRET: OAuth client secret
        - CASDOOR_ORGANIZATION: Organization name (optional)
        - CASDOOR_APPLICATION: Application name (optional)

        Returns:
            CasdoorConfig instance

        Example:
            config = CasdoorConfig.from_env()
        """
        endpoint = os.getenv("CASDOOR_ENDPOINT", cls.endpoint)
        client_id = os.getenv("CASDOOR_CLIENT_ID", cls.client_id)
        client_secret = os.getenv("CASDOOR_CLIENT_SECRET", cls.client_secret)
        organization = os.getenv("CASDOOR_ORGANIZATION", cls.organization)
        application = os.getenv("CASDOOR_APPLICATION", cls.application)

        return cls(
            endpoint=endpoint,
            client_id=client_id,
            client_secret=client_secret,
            organization=organization,
            application=application
        )

    def get_jwt_public_key_url(self) -> str:
        """
        Get URL for fetching JWT public key.

        Returns:
            Full URL to JWT public key endpoint
        """
        return f"{self.endpoint}/api/jwt-public-key"

    def get_login_url(self) -> str:
        """
        Get URL for login endpoint.

        Returns:
            Full URL to login endpoint
        """
        return f"{self.endpoint}/api/login"

    def get_user_info_url(self, user_id: str) -> str:
        """
        Get URL for user info endpoint.

        Args:
            user_id: User UUID

        Returns:
            Full URL to user info endpoint
        """
        return f"{self.endpoint}/api/get-user?id={user_id}"

    def __repr__(self) -> str:
        """String representation (hides sensitive data)."""
        return (
            f"CasdoorConfig("
            f"endpoint='{self.endpoint}', "
            f"client_id='{self.client_id}', "
            f"client_secret='***', "  # Hide secret
            f"organization='{self.organization}', "
            f"application='{self.application}')"
        )