from __future__ import annotations

import argparse
import asyncio
import json
from urllib.parse import urlsplit

from app.modules.compliance.core.config import get_settings
from app.modules.compliance.providers.storage import (
    S3ObjectStorageProvider,
    StorageConfigurationError,
    build_object_storage_provider,
)


async def ensure_bucket() -> dict[str, str]:
    provider = build_object_storage_provider(get_settings())
    if not isinstance(provider, S3ObjectStorageProvider):
        raise StorageConfigurationError("S3 bucket ensure requires STORAGE_MODE=s3")
    await provider.ensure_bucket_exists()
    return {
        "status": "ok",
        "bucket": provider.bucket,
        "endpointHost": urlsplit(provider.endpoint).netloc,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Ensure the configured S3/MinIO bucket exists.")
    parser.add_argument("command", choices=["ensure"])
    parser.add_argument("--json", action="store_true", help="Print compact JSON output.")
    args = parser.parse_args()

    if args.command == "ensure":
        result = asyncio.run(ensure_bucket())
    else:  # pragma: no cover - argparse choices prevent this branch.
        raise ValueError(args.command)

    if args.json:
        print(json.dumps(result, ensure_ascii=True, separators=(",", ":")))
    else:
        print(f"S3 bucket ready: {result['bucket']} at {result['endpointHost']}")


if __name__ == "__main__":
    main()
