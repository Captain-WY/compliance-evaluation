from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Compliance Backend"
    app_env: str = "local"
    app_git_sha: str = "unknown"
    app_build_time: str = "unknown"
    database_url: str = "postgresql+asyncpg://localhost/compliance_business"
    cors_allow_origins: str = "http://localhost:3010,http://127.0.0.1:3010"
    jwt_issuer: str | None = None
    jwt_audience: str | None = None
    auth_mode: str = "casdoor"
    casdoor_endpoint: str | None = None
    casdoor_client_id: str | None = None
    casdoor_client_secret: str | None = None
    casdoor_organization: str | None = None
    casdoor_application: str | None = None
    casdoor_jwks_url: str | None = None
    casdoor_public_key_path: str | None = None
    casdoor_jwt_leeway_seconds: int = 30
    casdoor_sync_on_login: bool = False
    casdoor_strict_local_user: bool = True
    assessment_runtime_persistence: str = "database"
    notification_runtime_persistence: str = "database"
    workflow_runtime_persistence: str = "database"
    inspection_report_runtime_persistence: str = "database"
    casbin_model_path: str | None = None
    storage_mode: str = "s3"
    upload_max_file_size_bytes: int = 100 * 1024 * 1024
    s3_endpoint: str | None = None
    s3_public_endpoint: str | None = None
    s3_region: str = "us-east-1"
    s3_bucket: str = "compliance-evidence"
    s3_access_key: str | None = None
    s3_secret_key: str | None = None
    s3_session_token: str | None = None
    s3_key_prefix: str = ""
    s3_presigned_get_expires_seconds: int = 600
    s3_request_timeout_seconds: float = 10.0
    scheduler_worker_user_id: str = "USER-HQ-ADMIN-001"
    scheduler_worker_interval_seconds: int = 300

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origins(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.cors_allow_origins.split(",")
            if origin.strip()
        ]


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    from app.core.config import get_settings as platform_settings
    shared=platform_settings()
    settings.database_url=shared.compliance_database_url
    settings.s3_endpoint='http://'+shared.minio_endpoint
    settings.s3_access_key=shared.minio_access_key
    settings.s3_secret_key=shared.minio_secret_key
    settings.s3_bucket=shared.minio_bucket
    import os
    settings.s3_public_endpoint=os.getenv('MINIO_PUBLIC_ENDPOINT',settings.s3_endpoint)
    if not settings.s3_public_endpoint.startswith(('http://','https://')):
        settings.s3_public_endpoint='http://'+settings.s3_public_endpoint
    return settings
