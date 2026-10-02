"""
核心配置模块
使用 Pydantic BaseSettings 管理环境变量配置
"""
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    """应用配置类"""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )

    # 应用配置
    APP_NAME: str = "SLD-CMS"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    ENVIRONMENT: str = "development"

    # API 配置
    API_V1_PREFIX: str = "/api/v1"
    API_BFF_V1_PREFIX: str = "/api/bff/v1"  # BFF (Backend For Frontend) 层, 服务前端定制化场景
    SECRET_KEY: str = ""
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours

    # 数据库配置
    DATABASE_URL: str = "postgresql+asyncpg://localhost/case_business"
    DATABASE_POOL_SIZE: int = 10
    DATABASE_MAX_OVERFLOW: int = 20

    # Redis 配置
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_PASSWORD: str = ""

    # MinIO 配置
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = ""
    MINIO_SECRET_KEY: str = ""
    MINIO_BUCKET: str = "case-documents"
    MINIO_SECURE: bool = False
    # MinIO 公网访问地址（用于生成前端直传的 presigned URL，浏览器需能解析）
    MINIO_PUBLIC_ENDPOINT: str = ""  # 空则回退到 MINIO_ENDPOINT

    # Elasticsearch 配置（内部索引）
    ELASTICSEARCH_URL: str = "http://localhost:9200"
    ELASTICSEARCH_INDEX_PREFIX: str = "sldcms"

    # 外部类案检索 ES 配置（WP-AI-03）
    EXTERNAL_CASE_ES_ENABLED: bool = False
    EXTERNAL_CASE_ES_URL: str = ""
    EXTERNAL_CASE_ES_INDEX: str = "doc_document_ycc"
    EXTERNAL_CASE_ES_USERNAME: str = ""
    EXTERNAL_CASE_ES_PASSWORD: str = ""
    EXTERNAL_CASE_ES_VERIFY_CERTS: bool = False
    EXTERNAL_CASE_ES_REQUEST_TIMEOUT: float = 5.0

    # LLM 配置（Legal Brain / 类案分析）
    # ============================================================
    # 在哪里录入 API Key：
    #   1. 开发环境：直接在本文件中设置 LLM_API_KEY=sk-xxx
    #   2. 生产环境：通过操作系统环境变量注入 export LLM_API_KEY=sk-xxx
    #   3. K8s/容器：通过 Secret 挂载为环境变量，绝不写入代码仓库
    # ============================================================
    LLM_ENABLED: bool = False                        # LLM 总开关
    LLM_PROVIDER_TYPE: str = "openai_compatible"     # openai_compatible | qwen | deepseek
    LLM_API_KEY: str = ""                            # API Key（核心敏感配置）
    LLM_BASE_URL: str = ""                           # 自定义 API 地址（空则按 provider_type 推断）
    LLM_DEFAULT_MODEL: str = "gpt-4o"                # 默认模型
    LLM_TEMPERATURE: float = 0.3                     # 温度 (0-2)
    LLM_MAX_TOKENS: int = 4096                       # 最大输出 token
    LLM_REQUEST_TIMEOUT: float = 60.0                # 请求超时（秒）
    LLM_FALLBACK_TO_RULES: bool = True               # LLM 失败时是否降级规则化生成

    # CORS 配置
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:3003",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:3002",
        "http://127.0.0.1:3003",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ]
    CORS_ALLOW_CREDENTIALS: bool = True
    CORS_ALLOW_METHODS: List[str] = ["*"]
    CORS_ALLOW_HEADERS: List[str] = ["*"]

    # JWT 配置
    JWT_SECRET_KEY: str = ""
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    # 日志配置
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"

    # 文件上传配置
    MAX_UPLOAD_SIZE: int = 104857600  # 100MB
    ALLOWED_EXTENSIONS: List[str] = [
        ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
        ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".webp",
        ".txt", ".rtf", ".csv", ".md",
        ".mp3", ".mp4", ".wav", ".avi", ".mov", ".wmv",
        ".zip", ".rar", ".7z", ".tar", ".gz",
    ]

    # 开发模式：绕过 Casdoor JWT 验证（仅用于 E2E/API 测试）
    DEV_MODE: bool = False


@lru_cache()
def get_settings() -> Settings:
    """
    获取配置实例（单例模式）
    使用 lru_cache 确保配置只加载一次
    """
    return Settings()


# 全局配置实例
settings = get_settings()