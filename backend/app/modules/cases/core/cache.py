"""
缓存管理器
提供 Redis 和本地缓存的双层缓存机制
"""
from typing import Optional, Any
import json


class CacheManager:
    """缓存管理器 - Redis + 本地双层缓存"""

    def __init__(self, redis_url: Optional[str] = None):
        """
        初始化缓存管理器

        Args:
            redis_url: Redis 连接 URL，如果为 None 则只使用本地缓存
        """
        self._redis_client = None
        self._local_cache: dict = {}
        self._redis_url = redis_url

    async def get(self, key: str) -> Optional[str]:
        """
        获取缓存值

        Args:
            key: 缓存键

        Returns:
            缓存值，不存在返回 None
        """
        # 1. 先查本地缓存
        if key in self._local_cache:
            return self._local_cache[key]

        # 2. 如果 Redis 可用，查 Redis
        if self._redis_client:
            try:
                value = await self._redis_client.get(key)
                if value:
                    # 写入本地缓存
                    self._local_cache[key] = value
                    return value
            except Exception:
                # Redis 错误时忽略，返回 None
                pass

        return None

    async def set(self, key: str, value: str, ex: int = 3600) -> None:
        """
        设置缓存值

        Args:
            key: 缓存键
            value: 缓存值
            ex: 过期时间（秒），默认 1 小时
        """
        # 1. 写入本地缓存
        self._local_cache[key] = value

        # 2. 如果 Redis 可用，写入 Redis
        if self._redis_client:
            try:
                await self._redis_client.set(key, value, ex=ex)
            except Exception:
                # Redis 错误时忽略
                pass

    async def delete(self, key: str) -> None:
        """
        删除缓存

        Args:
            key: 缓存键
        """
        # 1. 删除本地缓存
        if key in self._local_cache:
            del self._local_cache[key]

        # 2. 如果 Redis 可用，删除 Redis 缓存
        if self._redis_client:
            try:
                await self._redis_client.delete(key)
            except Exception:
                # Redis 错误时忽略
                pass

    async def exists(self, key: str) -> bool:
        """
        检查缓存是否存在

        Args:
            key: 缓存键

        Returns:
            True 如果存在，否则 False
        """
        # 1. 检查本地缓存
        if key in self._local_cache:
            return True

        # 2. 如果 Redis 可用，检查 Redis
        if self._redis_client:
            try:
                result = await self._redis_client.exists(key)
                return result > 0
            except Exception:
                # Redis 错误时返回 False
                pass

        return False


# 全局缓存管理器实例
_cache_manager: Optional[CacheManager] = None


def get_cache_manager() -> CacheManager:
    """
    获取全局缓存管理器实例

    Returns:
        CacheManager 实例
    """
    global _cache_manager
    if _cache_manager is None:
        _cache_manager = CacheManager()
    return _cache_manager