"""
防腐层 Providers 包

提供外部服务的抽象接口，隔离第三方 SDK 依赖
"""
from .storage import IStorageProvider, FileInfo, StorageException, FileNotFoundException
from .minio_storage import MinIOStorageProvider
from .search import ISearchProvider, SearchException
from .llm import ILLMProvider, LLMException, get_llm_provider
from .cache import ICacheProvider, CacheException

__all__ = [
    # Storage
    "IStorageProvider",
    "FileInfo",
    "MinIOStorageProvider",
    "StorageException",
    "FileNotFoundException",
    # Search
    "ISearchProvider",
    "SearchException",
    # LLM
    "ILLMProvider",
    "LLMException",
    "get_llm_provider",
    # Cache
    "ICacheProvider",
    "CacheException",
]