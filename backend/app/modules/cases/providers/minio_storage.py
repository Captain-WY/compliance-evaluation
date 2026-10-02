"""
MinIO 存储服务实现
"""
from typing import BinaryIO, Optional
from io import BytesIO
from minio import Minio
from minio.error import S3Error
from .storage import IStorageProvider, FileInfo, StorageException, FileNotFoundException


class MinIOStorageProvider(IStorageProvider):
    """MinIO 存储服务实现"""

    def __init__(
        self,
        endpoint: str,
        access_key: str,
        secret_key: str,
        secure: bool = False,
        public_endpoint: str | None = None,
    ):
        """
        初始化 MinIO 客户端

        Args:
            endpoint: MinIO 服务地址 (内部容器网络地址, 用于实际读写)
            access_key: 访问密钥
            secret_key: 秘密密钥
            secure: 是否使用 HTTPS
            public_endpoint: 公网访问地址 (用于生成浏览器可解析的 presigned URL)
        """
        self.client = Minio(
            endpoint,
            access_key=access_key,
            secret_key=secret_key,
            secure=secure
        )
        # 用于生成 presigned URL 的客户端 (签名中使用的 host 必须与浏览器访问的一致)
        self._public_client: Minio | None = None
        if public_endpoint and public_endpoint != endpoint:
            self._public_client = Minio(
                public_endpoint,
                access_key=access_key,
                secret_key=secret_key,
                secure=secure,
                region="us-east-1",
            )

    async def upload_file(
        self,
        file: BinaryIO,
        filename: str,
        bucket: str,
        content_type: Optional[str] = None
    ) -> str:
        """上传文件到 MinIO"""
        try:
            # 确保 bucket 存在
            if not self.client.bucket_exists(bucket):
                self.client.make_bucket(bucket)

            # 获取文件大小
            file.seek(0, 2)  # 移动到文件末尾
            size = file.tell()
            file.seek(0)  # 回到文件开头

            # 上传文件
            self.client.put_object(
                bucket,
                filename,
                file,
                size,
                content_type=content_type or "application/octet-stream"
            )

            # 返回访问 URL
            # MinIO client uses BaseURL object with 'host' attribute
            host = self.client._base_url.host
            return f"http://{host}/{bucket}/{filename}"

        except S3Error as e:
            raise StorageException(f"上传文件失败: {str(e)}")

    async def download_file(self, bucket: str, filename: str) -> bytes:
        """从 MinIO 下载文件"""
        try:
            response = self.client.get_object(bucket, filename)
            return response.read()
        except S3Error as e:
            if e.code == "NoSuchKey":
                raise FileNotFoundException(f"文件不存在: {filename}")
            raise StorageException(f"下载文件失败: {str(e)}")

    async def delete_file(self, bucket: str, filename: str) -> bool:
        """从 MinIO 删除文件"""
        try:
            self.client.remove_object(bucket, filename)
            return True
        except S3Error as e:
            raise StorageException(f"删除文件失败: {str(e)}")

    async def get_file_url(
        self,
        bucket: str,
        filename: str,
        expires: int = 3600,
        response_headers: dict[str, str] | None = None,
    ) -> str:
        """获取 MinIO 文件临时访问 URL"""
        try:
            from datetime import timedelta
            client = self._public_client or self.client
            url = client.presigned_get_object(
                bucket,
                filename,
                expires=timedelta(seconds=expires),
                response_headers=response_headers,
            )
            return url
        except S3Error as e:
            raise StorageException(f"获取文件 URL 失败: {str(e)}")

    async def file_exists(self, bucket: str, filename: str) -> bool:
        """检查文件是否存在"""
        try:
            self.client.stat_object(bucket, filename)
            return True
        except S3Error:
            return False

    # =========================================================================
    # 2.S5 扩展: presigned PUT + stat + object_exists 别名
    # =========================================================================

    async def get_presigned_put_url(
        self,
        bucket: str,
        object_key: str,
        expires_in: int = 900,
        content_type: str | None = None,
        content_length: int | None = None,
    ) -> str:
        """生成 presigned PUT URL, 供前端直传 (2.S5 决策 D1).

        Args:
            bucket: MinIO bucket
            object_key: 对象 key (D5: `{tenant_id}/{case_id}/{doc_id}/v{ver}/{name}`)
            expires_in: 过期秒数, 默认 15 分钟
            content_type: 可选, 用于签 header (MinIO 签名不含 body 但可约束 Content-Type)
            content_length: 可选, 作为 headers 回传给前端

        Returns:
            presigned URL 字符串 (PUT 请求时前端直接上传 body)
        """
        try:
            from datetime import timedelta

            # 确保 bucket 存在 (首次使用会自动创建)
            if not self.client.bucket_exists(bucket):
                self.client.make_bucket(bucket)

            client = self._public_client or self.client
            url = client.presigned_put_object(
                bucket,
                object_key,
                expires=timedelta(seconds=expires_in),
            )
            return url
        except S3Error as e:
            raise StorageException(f"生成 presigned PUT URL 失败: {str(e)}")

    async def stat_object(self, bucket: str, object_key: str) -> dict:
        """获取对象元信息 (size / etag / content_type).

        Returns:
            {"size": int, "etag": str, "content_type": str | None}
        """
        try:
            obj = self.client.stat_object(bucket, object_key)
            return {
                "size": int(obj.size or 0),
                "etag": obj.etag or "",
                "content_type": obj.content_type,
            }
        except S3Error as e:
            if e.code == "NoSuchKey":
                raise FileNotFoundException(f"对象不存在: {object_key}")
            raise StorageException(f"获取对象元信息失败: {str(e)}")

    async def object_exists(self, bucket: str, object_key: str) -> bool:
        """`file_exists` 的别名, 保持设计文档接口命名一致."""
        return await self.file_exists(bucket, object_key)