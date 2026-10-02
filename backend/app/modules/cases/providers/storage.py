"""
存储服务防腐层
抽象 MinIO/S3 兼容的对象存储服务
"""
from abc import ABC, abstractmethod
from typing import BinaryIO, Optional
from dataclasses import dataclass


@dataclass
class FileInfo:
    """文件信息"""
    filename: str
    size: int
    content_type: str
    url: str


class IStorageProvider(ABC):
    """
    存储服务接口

    防腐层设计原则：
    - 抽象存储操作，隔离底层实现（MinIO/S3/RustFS）
    - 业务层通过接口调用，不直接依赖第三方 SDK
    - 便于替换存储服务实现
    """

    @abstractmethod
    async def upload_file(
        self,
        file: BinaryIO,
        filename: str,
        bucket: str,
        content_type: Optional[str] = None
    ) -> str:
        """
        上传文件

        Args:
            file: 文件二进制流
            filename: 文件名
            bucket: 存储桶名称
            content_type: 内容类型

        Returns:
            str: 文件访问 URL

        Raises:
            StorageException: 上传失败
        """
        pass

    @abstractmethod
    async def download_file(self, bucket: str, filename: str) -> bytes:
        """
        下载文件

        Args:
            bucket: 存储桶名称
            filename: 文件名

        Returns:
            bytes: 文件内容

        Raises:
            FileNotFoundException: 文件不存在
        """
        pass

    @abstractmethod
    async def delete_file(self, bucket: str, filename: str) -> bool:
        """
        删除文件

        Args:
            bucket: 存储桶名称
            filename: 文件名

        Returns:
            bool: 是否删除成功
        """
        pass

    @abstractmethod
    async def get_file_url(
        self,
        bucket: str,
        filename: str,
        expires: int = 3600,
        response_headers: dict[str, str] | None = None,
    ) -> str:
        """
        获取文件访问 URL（临时签名 URL）

        Args:
            bucket: 存储桶名称
            filename: 文件名
            expires: URL 有效期（秒）
            response_headers: 可选，附加到 presigned URL 的响应头
                (如 {"response-content-disposition": "inline; filename=\"xxx.pdf\""})

        Returns:
            str: 临时访问 URL
        """
        pass

    @abstractmethod
    async def file_exists(self, bucket: str, filename: str) -> bool:
        """
        检查文件是否存在

        Args:
            bucket: 存储桶名称
            filename: 文件名

        Returns:
            bool: 文件是否存在
        """
        pass

    @abstractmethod
    async def get_presigned_put_url(
        self,
        bucket: str,
        object_key: str,
        expires_in: int = 900,
        content_type: str | None = None,
        content_length: int | None = None,
    ) -> str:
        """生成 presigned PUT URL，供前端客户端直传文件 (D1 简化直传)。

        Args:
            bucket: 存储桶名称
            object_key: 对象键（相对路径）
            expires_in: 有效期秒数，默认 15 分钟
            content_type: 可选，约束上传文件的 Content-Type
            content_length: 可选，回传给前端作为请求头参考

        Returns:
            str: presigned PUT URL
        """
        pass


class StorageException(Exception):
    """存储服务异常"""
    pass


class FileNotFoundException(StorageException):
    """文件不存在异常"""
    pass