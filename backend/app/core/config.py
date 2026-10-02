from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')
    common_database_url: str = 'postgresql+asyncpg://localhost/platform_common'
    case_database_url: str = 'postgresql+asyncpg://localhost/case_business'
    compliance_database_url: str = 'postgresql+asyncpg://localhost/compliance_business'
    casdoor_endpoint: str = 'http://casdoor:8000'
    casdoor_public_endpoint: str = 'http://localhost:8000'
    casdoor_organization: str = 'compliance'
    casdoor_application: str = 'compliance-evaluation'
    casdoor_client_id: str = ''
    casdoor_client_secret: str = ''
    redis_url: str = 'redis://redis:6379/0'
    minio_endpoint: str = 'minio:9000'
    minio_access_key: str = ''
    minio_secret_key: str = ''
    minio_bucket: str = 'compliance-files'
    cors_allow_origins: str = 'http://localhost:3010'
@lru_cache
def get_settings(): return Settings()
