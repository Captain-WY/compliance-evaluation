"""
Mock storage provider for testing
Simulates MinIO/S3 operations without actual infrastructure
"""
from typing import BinaryIO, Optional
from .storage import IStorageProvider, FileInfo, StorageException, FileNotFoundException
from io import BytesIO


class MockStorageProvider(IStorageProvider):
    """Mock storage provider for testing - Singleton pattern"""

    _instance = None
    _files = {}  # Shared class-level storage: bucket -> {filename -> bytes}

    def __new__(cls):
        """Singleton pattern - return same instance"""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        """Initialize mock storage with shared in-memory file store"""
        # Use class-level storage to persist across instances
        self.files = self._files

    async def upload_file(
        self,
        file: BinaryIO,
        filename: str,
        bucket: str,
        content_type: Optional[str] = None
    ) -> str:
        """
        Mock upload - stores file in memory

        Args:
            file: File binary stream
            filename: File name
            bucket: Bucket name
            content_type: Content type

        Returns:
            str: Mock file URL
        """
        # Initialize bucket if not exists
        if bucket not in self.files:
            self.files[bucket] = {}

        # Read file content
        file.seek(0)
        content = file.read()

        # Store in memory
        self.files[bucket][filename] = content

        # Return mock URL
        return f"http://mock-storage.local/{bucket}/{filename}"

    async def download_file(self, bucket: str, filename: str) -> bytes:
        """
        Mock download - retrieves file from memory

        Args:
            bucket: Bucket name
            filename: File name

        Returns:
            bytes: File content

        Raises:
            FileNotFoundException: File not found
        """
        if bucket not in self.files or filename not in self.files[bucket]:
            raise FileNotFoundException(f"File {filename} not found in bucket {bucket}")

        return self.files[bucket][filename]

    async def delete_file(self, bucket: str, filename: str) -> bool:
        """
        Mock delete - removes file from memory

        Args:
            bucket: Bucket name
            filename: File name

        Returns:
            bool: Success status
        """
        if bucket in self.files and filename in self.files[bucket]:
            del self.files[bucket][filename]
            return True
        return False

    async def get_file_url(
        self,
        bucket: str,
        filename: str,
        expires: int = 3600,
        response_headers: dict[str, str] | None = None,
    ) -> str:
        """
        Mock get URL - returns mock URL

        Args:
            bucket: Bucket name
            filename: File name
            expires: URL expiry (ignored in mock)
            response_headers: Ignored in mock

        Returns:
            str: Mock URL
        """
        return f"http://mock-storage.local/{bucket}/{filename}?expires={expires}"

    async def file_exists(self, bucket: str, filename: str) -> bool:
        """
        Mock file exists check

        Args:
            bucket: Bucket name
            filename: File name

        Returns:
            bool: Whether file exists
        """
        return bucket in self.files and filename in self.files[bucket]

    async def get_presigned_put_url(
        self,
        bucket: str,
        object_key: str,
        expires_in: int = 900,
        content_type: str | None = None,
        content_length: int | None = None,
    ) -> str:
        """Mock presigned PUT URL — returns a deterministic local stub URL."""
        return f"http://mock-storage.local/{bucket}/{object_key}?X-Mock-Presign=1&expires={expires_in}"