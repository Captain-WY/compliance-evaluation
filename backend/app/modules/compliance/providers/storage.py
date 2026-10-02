from __future__ import annotations

import hmac
from dataclasses import dataclass
from datetime import UTC, datetime
from hashlib import sha256
from typing import Any, Protocol
from urllib.parse import quote, urlsplit

import httpx


@dataclass(frozen=True)
class StoredObject:
    storage_key: str
    content_type: str
    size: int
    checksum: str | None = None
    bucket: str | None = None


@dataclass(frozen=True)
class PresignedDownload:
    url: str
    expires_in_seconds: int


class StorageConfigurationError(RuntimeError):
    """Raised when a selected storage provider cannot be constructed safely."""


class ObjectStorageProvider(Protocol):
    async def ensure_bucket_exists(self) -> None:
        """Ensure the selected bucket exists when the provider supports buckets."""

    async def put_object(
        self,
        *,
        key: str,
        content: bytes,
        content_type: str,
    ) -> StoredObject:
        """Store object content and return its storage metadata."""

    async def delete_object(self, *, key: str) -> None:
        """Delete object content when supported."""

    def presign_get_object(self, *, key: str, expires_in_seconds: int) -> PresignedDownload:
        """Return a short-lived authorized download URL."""


class InMemoryObjectStorageProvider:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}
        self.metadata: dict[str, StoredObject] = {}

    def reset(self) -> None:
        self.objects = {}
        self.metadata = {}

    async def ensure_bucket_exists(self) -> None:
        return None

    async def put_object(
        self,
        *,
        key: str,
        content: bytes,
        content_type: str,
    ) -> StoredObject:
        self.objects[key] = content
        stored = StoredObject(
            storage_key=key,
            content_type=content_type,
            size=len(content),
            checksum=sha256(content).hexdigest(),
            bucket="memory",
        )
        self.metadata[key] = stored
        return stored

    async def delete_object(self, *, key: str) -> None:
        self.objects.pop(key, None)
        self.metadata.pop(key, None)

    def presign_get_object(self, *, key: str, expires_in_seconds: int) -> PresignedDownload:
        return PresignedDownload(
            url=f"memory://{quote(key, safe='/-_.~')}",
            expires_in_seconds=expires_in_seconds,
        )


class S3ObjectStorageProvider:
    def __init__(
        self,
        *,
        endpoint: str,
        bucket: str,
        region: str,
        access_key: str,
        secret_key: str,
        session_token: str | None = None,
        key_prefix: str = "",
        request_timeout_seconds: float = 10.0,
        public_endpoint: str | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.endpoint = endpoint.rstrip("/")
        self.public_endpoint = public_endpoint.rstrip("/") if public_endpoint else None
        self.bucket = bucket
        self.region = region
        self.access_key = access_key
        self.secret_key = secret_key
        self.session_token = session_token
        self.key_prefix = key_prefix.strip("/")
        self.request_timeout_seconds = request_timeout_seconds
        self._transport = transport

    @classmethod
    def from_settings(cls, settings: Any) -> S3ObjectStorageProvider:
        missing = [
            name
            for name in ("s3_endpoint", "s3_bucket", "s3_access_key", "s3_secret_key")
            if not getattr(settings, name, None)
        ]
        if missing:
            raise StorageConfigurationError(
                f"S3 storage mode requires configured values: {', '.join(missing)}",
            )
        return cls(
            endpoint=settings.s3_endpoint,
            bucket=settings.s3_bucket,
            region=settings.s3_region,
            access_key=settings.s3_access_key,
            secret_key=settings.s3_secret_key,
            session_token=settings.s3_session_token,
            key_prefix=settings.s3_key_prefix,
            request_timeout_seconds=settings.s3_request_timeout_seconds,
            public_endpoint=getattr(settings, "s3_public_endpoint", None),
        )

    async def ensure_bucket_exists(self) -> None:
        headers = self._signed_headers_for_uri(
            method="HEAD",
            canonical_uri=self._bucket_uri,
            payload=b"",
        )
        response = await self._request_url("HEAD", self._bucket_url, headers=headers)
        if response.status_code in {200, 204}:
            return
        if response.status_code != 404:
            raise RuntimeError(f"S3 bucket check failed with status {response.status_code}")
        create_headers = self._signed_headers_for_uri(
            method="PUT",
            canonical_uri=self._bucket_uri,
            payload=b"",
        )
        created = await self._request_url("PUT", self._bucket_url, headers=create_headers)
        if created.status_code not in {200, 201, 204, 409}:
            raise RuntimeError(f"S3 bucket create failed with status {created.status_code}")

    async def put_object(
        self,
        *,
        key: str,
        content: bytes,
        content_type: str,
    ) -> StoredObject:
        storage_key = self._storage_key(key)
        checksum = sha256(content).hexdigest()
        headers = self._signed_headers(
            method="PUT",
            key=storage_key,
            payload=content,
            content_type=content_type,
            extra_headers={
                "x-amz-meta-checksum-sha256": checksum,
                "x-amz-meta-scan-status": "SCAN_DEFERRED",
            },
        )
        response = await self._request("PUT", storage_key, content=content, headers=headers)
        if response.status_code not in {200, 201}:
            raise RuntimeError(
                f"S3 put object failed with status {response.status_code}",
            )
        return StoredObject(
            storage_key=storage_key,
            content_type=content_type,
            size=len(content),
            checksum=checksum,
            bucket=self.bucket,
        )

    async def delete_object(self, *, key: str) -> None:
        headers = self._signed_headers(method="DELETE", key=key, payload=b"")
        response = await self._request("DELETE", key, headers=headers)
        if response.status_code not in {200, 202, 204, 404}:
            raise RuntimeError(
                f"S3 delete object failed with status {response.status_code}",
            )

    def presign_get_object(self, *, key: str, expires_in_seconds: int) -> PresignedDownload:
        expires = max(60, min(expires_in_seconds, 3600))
        now = datetime.now(UTC)
        amz_date = now.strftime("%Y%m%dT%H%M%SZ")
        date_stamp = now.strftime("%Y%m%d")
        credential_scope = self._credential_scope(date_stamp)
        params = {
            "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
            "X-Amz-Credential": f"{self.access_key}/{credential_scope}",
            "X-Amz-Date": amz_date,
            "X-Amz-Expires": str(expires),
            "X-Amz-SignedHeaders": "host",
        }
        if self.session_token:
            params["X-Amz-Security-Token"] = self.session_token
        canonical_query = self._canonical_query(params)
        canonical_request = "\n".join(
            [
                "GET",
                self._canonical_uri(key),
                canonical_query,
                f"host:{self._presign_host}\n",
                "host",
                "UNSIGNED-PAYLOAD",
            ],
        )
        signature = self._signature(
            date_stamp,
            amz_date,
            credential_scope,
            canonical_request,
        )
        query = f"{canonical_query}&X-Amz-Signature={signature}"
        return PresignedDownload(
            url=f"{self._public_object_url(key)}?{query}",
            expires_in_seconds=expires,
        )

    async def _request(
        self,
        method: str,
        key: str,
        *,
        content: bytes | None = None,
        headers: dict[str, str],
    ) -> httpx.Response:
        async with httpx.AsyncClient(
            transport=self._transport,
            timeout=self.request_timeout_seconds,
        ) as client:
            return await client.request(
                method,
                self._object_url(key),
                content=content,
                headers=headers,
            )

    async def _request_url(
        self,
        method: str,
        url: str,
        *,
        content: bytes | None = None,
        headers: dict[str, str],
    ) -> httpx.Response:
        async with httpx.AsyncClient(
            transport=self._transport,
            timeout=self.request_timeout_seconds,
        ) as client:
            return await client.request(method, url, content=content, headers=headers)

    def _signed_headers(
        self,
        *,
        method: str,
        key: str,
        payload: bytes,
        content_type: str | None = None,
        extra_headers: dict[str, str] | None = None,
    ) -> dict[str, str]:
        now = datetime.now(UTC)
        amz_date = now.strftime("%Y%m%dT%H%M%SZ")
        date_stamp = now.strftime("%Y%m%d")
        payload_hash = sha256(payload).hexdigest()
        headers = {
            "host": self._host,
            "x-amz-content-sha256": payload_hash,
            "x-amz-date": amz_date,
        }
        if content_type:
            headers["content-type"] = content_type
        if self.session_token:
            headers["x-amz-security-token"] = self.session_token
        if extra_headers:
            headers.update(extra_headers)

        canonical_headers, signed_headers = self._canonical_headers(headers)
        credential_scope = self._credential_scope(date_stamp)
        canonical_request = "\n".join(
            [
                method,
                self._canonical_uri(key),
                "",
                canonical_headers,
                signed_headers,
                payload_hash,
            ],
        )
        signature = self._signature(
            date_stamp,
            amz_date,
            credential_scope,
            canonical_request,
        )
        headers["authorization"] = (
            "AWS4-HMAC-SHA256 "
            f"Credential={self.access_key}/{credential_scope}, "
            f"SignedHeaders={signed_headers}, Signature={signature}"
        )
        return headers

    def _signed_headers_for_uri(
        self,
        *,
        method: str,
        canonical_uri: str,
        payload: bytes,
    ) -> dict[str, str]:
        now = datetime.now(UTC)
        amz_date = now.strftime("%Y%m%dT%H%M%SZ")
        date_stamp = now.strftime("%Y%m%d")
        payload_hash = sha256(payload).hexdigest()
        headers = {
            "host": self._host,
            "x-amz-content-sha256": payload_hash,
            "x-amz-date": amz_date,
        }
        if self.session_token:
            headers["x-amz-security-token"] = self.session_token
        canonical_headers, signed_headers = self._canonical_headers(headers)
        credential_scope = self._credential_scope(date_stamp)
        canonical_request = "\n".join(
            [
                method,
                canonical_uri,
                "",
                canonical_headers,
                signed_headers,
                payload_hash,
            ],
        )
        signature = self._signature(
            date_stamp,
            amz_date,
            credential_scope,
            canonical_request,
        )
        headers["authorization"] = (
            "AWS4-HMAC-SHA256 "
            f"Credential={self.access_key}/{credential_scope}, "
            f"SignedHeaders={signed_headers}, Signature={signature}"
        )
        return headers

    def _signature(
        self,
        date_stamp: str,
        amz_date: str,
        credential_scope: str,
        canonical_request: str,
    ) -> str:
        string_to_sign = "\n".join(
            [
                "AWS4-HMAC-SHA256",
                amz_date,
                credential_scope,
                sha256(canonical_request.encode("utf-8")).hexdigest(),
            ],
        )
        signing_key = self._signing_key(date_stamp)
        return hmac.new(signing_key, string_to_sign.encode("utf-8"), "sha256").hexdigest()

    def _signing_key(self, date_stamp: str) -> bytes:
        date_key = hmac.new(
            f"AWS4{self.secret_key}".encode(),
            date_stamp.encode(),
            "sha256",
        ).digest()
        region_key = hmac.new(date_key, self.region.encode(), "sha256").digest()
        service_key = hmac.new(region_key, b"s3", "sha256").digest()
        return hmac.new(service_key, b"aws4_request", "sha256").digest()

    def _storage_key(self, key: str) -> str:
        if not self.key_prefix:
            return key
        return f"{self.key_prefix}/{key.lstrip('/')}"

    def _object_url(self, key: str) -> str:
        return f"{self.endpoint}{self._canonical_uri(key)}"

    def _public_object_url(self, key: str) -> str:
        base = self.public_endpoint or self.endpoint
        return f"{base}{self._canonical_uri(key)}"

    def _canonical_uri(self, key: str) -> str:
        encoded_bucket = quote(self.bucket, safe="-_.~")
        encoded_key = quote(key, safe="/-_.~")
        return f"/{encoded_bucket}/{encoded_key}"

    @property
    def _bucket_uri(self) -> str:
        return f"/{quote(self.bucket, safe='-_.~')}"

    @property
    def _bucket_url(self) -> str:
        return f"{self.endpoint}{self._bucket_uri}"

    def _credential_scope(self, date_stamp: str) -> str:
        return f"{date_stamp}/{self.region}/s3/aws4_request"

    def _canonical_headers(self, headers: dict[str, str]) -> tuple[str, str]:
        normalized = {
            key.lower(): " ".join(value.strip().split())
            for key, value in headers.items()
        }
        signed_header_names = sorted(normalized)
        canonical_headers = "".join(
            f"{name}:{normalized[name]}\n" for name in signed_header_names
        )
        return canonical_headers, ";".join(signed_header_names)

    def _canonical_query(self, params: dict[str, str]) -> str:
        encoded = [
            (quote(key, safe="-_.~"), quote(value, safe="-_.~"))
            for key, value in params.items()
        ]
        return "&".join(f"{key}={value}" for key, value in sorted(encoded))

    @property
    def _host(self) -> str:
        return urlsplit(self.endpoint).netloc

    @property
    def _presign_host(self) -> str:
        return urlsplit(self.public_endpoint or self.endpoint).netloc


def build_object_storage_provider(settings: Any) -> ObjectStorageProvider:
    mode = settings.storage_mode.strip().lower()
    if mode in {"memory", "in-memory", "local"}:
        return object_storage_provider
    if mode == "s3":
        return S3ObjectStorageProvider.from_settings(settings)
    raise StorageConfigurationError(f"Unsupported storage mode: {settings.storage_mode}")


object_storage_provider = InMemoryObjectStorageProvider()
