"""
缓存服务防腐层
抽象 Redis 缓存服务
"""
from abc import ABC, abstractmethod
from typing import Optional, Any


class ICacheProvider(ABC):
    """
    缓存服务接口

    支持基本的缓存操作
    """

    @abstractmethod
    async def get(self, key: str) -> Optional[Any]:
        """
        获取缓存值

        Args:
            key: 缓存键

        Returns:
            Optional[Any]: 缓存值，不存在返回 None
        """
        pass

    @abstractmethod
    async def set(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """
        设置缓存值

        Args:
            key: 缓存键
            value: 缓存值
            ttl: 过期时间（秒）

        Returns:
            bool: 是否设置成功
        """
        pass

    @abstractmethod
    async def delete(self, key: str) -> bool:
        """
        删除缓存

        Args:
            key: 缓存键

        Returns:
            bool: 是否删除成功
        """
        pass

    @abstractmethod
    async def exists(self, key: str) -> bool:
        """
        检查缓存是否存在

        Args:
            key: 缓存键

        Returns:
            bool: 是否存在
        """
        pass

    @abstractmethod
    async def expire(self, key: str, ttl: int) -> bool:
        """
        设置缓存过期时间

        Args:
            key: 缓存键
            ttl: 过期时间（秒）

        Returns:
            bool: 是否设置成功
        """
        pass


class CacheException(Exception):
    """缓存服务异常"""
    pass


class RedisCacheProvider(ICacheProvider):
    """
    Redis 缓存服务实现

    使用 redis-py 异步客户端
    """

    def __init__(self, redis_url: str = "redis://localhost:6379/0"):
        """
        初始化 Redis 客户端

        Args:
            redis_url: Redis 连接 URL
        """
        try:
            import redis.asyncio as redis
            self.client = redis.from_url(redis_url, decode_responses=True)
        except ImportError:
            raise CacheException("redis package not installed. Install with: pip install redis")

    async def health_check(self) -> bool:
        """
        健康检查

        Returns:
            bool: Redis 是否健康
        """
        try:
            result = await self.client.ping()
            return result is True
        except Exception as e:
            return False

    async def get(self, key: str) -> Optional[Any]:
        """
        获取缓存值

        Args:
            key: 缓存键

        Returns:
            Optional[Any]: 缓存值，不存在返回 None
        """
        try:
            value = await self.client.get(key)
            return value
        except Exception as e:
            raise CacheException(f"Failed to get key {key}: {str(e)}")

    async def set(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """
        设置缓存值

        Args:
            key: 缓存键
            value: 缓存值
            ttl: 过期时间（秒）

        Returns:
            bool: 是否设置成功
        """
        try:
            if ttl:
                await self.client.setex(key, ttl, value)
            else:
                await self.client.set(key, value)
            return True
        except Exception as e:
            raise CacheException(f"Failed to set key {key}: {str(e)}")

    async def delete(self, key: str) -> bool:
        """
        删除缓存

        Args:
            key: 缓存键

        Returns:
            bool: 是否删除成功
        """
        try:
            await self.client.delete(key)
            return True
        except Exception as e:
            raise CacheException(f"Failed to delete key {key}: {str(e)}")

    async def exists(self, key: str) -> bool:
        """
        检查缓存是否存在

        Args:
            key: 缓存键

        Returns:
            bool: 是否存在
        """
        try:
            result = await self.client.exists(key)
            return result > 0
        except Exception as e:
            raise CacheException(f"Failed to check existence of key {key}: {str(e)}")

    async def expire(self, key: str, ttl: int) -> bool:
        """
        设置缓存过期时间

        Args:
            key: 缓存键
            ttl: 过期时间（秒）

        Returns:
            bool: 是否设置成功
        """
        try:
            result = await self.client.expire(key, ttl)
            return result > 0
        except Exception as e:
            raise CacheException(f"Failed to set expiration for key {key}: {str(e)}")