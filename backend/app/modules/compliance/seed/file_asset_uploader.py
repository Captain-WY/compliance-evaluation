"""Seed-to-storage upload bridge for physical file asset fixtures.

Runtime seed creates FileAsset metadata rows in memory/DB, but when STORAGE_MODE=s3
those rows reference S3 keys that may not exist. This module uploads physical fixture
files from e2e_tests/fixtures/files/* to the configured object store, verifying
SHA-256 checksums before upload to avoid uploading dummy/placeholder records.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
from pathlib import Path
from typing import Any

from app.modules.compliance.core.config import get_settings
from app.modules.compliance.domain.evidence_store import evidence_store
from app.modules.compliance.providers.storage import (
    InMemoryObjectStorageProvider,
    ObjectStorageProvider,
    StorageConfigurationError,
    build_object_storage_provider,
)

DEFAULT_FIXTURE_GLOB = "e2e_tests/fixtures/files"


def _resolve_default_base_dir() -> Path:
    configured_root = os.getenv("COMPLIANCE_WORKSPACE_ROOT")
    if configured_root:
        return Path(configured_root).resolve()
    # This module may be loaded from source or from an installed package.
    # The environment override above is the authoritative path in containers.
    return Path(__file__).resolve().parent.parent.parent.parent


def _discover_fixture_roots(base_dir: Path) -> list[Path]:
    """Return all subdirectories under e2e_tests/fixtures/files that may contain samples."""
    fixtures_root = base_dir / DEFAULT_FIXTURE_GLOB
    if not fixtures_root.exists():
        return []
    return [p for p in fixtures_root.iterdir() if p.is_dir()]


def _find_physical_file(fixture_roots: list[Path], file_name: str) -> Path | None:
    """Locate a physical fixture file by name across all fixture roots."""
    for root in fixture_roots:
        candidate = root / file_name
        if candidate.exists():
            return candidate
    return None


async def upload_seed_file_assets(
    *,
    provider: ObjectStorageProvider | None = None,
    base_dir: Path | None = None,
    file_assets: dict[str, Any] | None = None,
    required_file_ids: set[str] | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Upload seed fixture files to the configured object storage.

    Only files whose SHA-256 checksum matches the FileAssetRecord checksum are
    uploaded; placeholder/dummy records are skipped.
    """
    settings = get_settings()
    required = set(required_file_ids or set())

    resolved_provider = provider
    if resolved_provider is not None and isinstance(
        resolved_provider, InMemoryObjectStorageProvider
    ):
        missing_required = sorted(required)
        return {
            "status": "failed" if missing_required else "skipped",
            "reason": "in-memory provider does not require seed upload",
            "uploaded": [],
            "skipped": [],
            "errors": [],
            "missingRequired": missing_required,
        }

    if resolved_provider is None:
        mode = settings.storage_mode.strip().lower()
        if mode != "s3":
            missing_required = sorted(required)
            return {
                "status": "failed" if missing_required else "skipped",
                "reason": f"storage_mode is {settings.storage_mode!r}, not s3",
                "uploaded": [],
                "skipped": [],
                "errors": [],
                "missingRequired": missing_required,
            }
        try:
            resolved_provider = build_object_storage_provider(settings)
        except StorageConfigurationError as exc:
            missing_required = sorted(required)
            return {
                "status": "failed" if missing_required else "skipped",
                "reason": f"storage provider not configured: {exc}",
                "uploaded": [],
                "skipped": [],
                "errors": [],
                "missingRequired": missing_required,
            }
        if isinstance(resolved_provider, InMemoryObjectStorageProvider):
            missing_required = sorted(required)
            return {
                "status": "failed" if missing_required else "skipped",
                "reason": "in-memory provider does not require seed upload",
                "uploaded": [],
                "skipped": [],
                "errors": [],
                "missingRequired": missing_required,
            }

    if base_dir is None:
        base_dir = _resolve_default_base_dir()

    fixture_roots = _discover_fixture_roots(base_dir)
    if not fixture_roots:
        missing_required = sorted(required)
        return {
            "status": "failed" if missing_required else "skipped",
            "reason": f"no fixture roots found under {DEFAULT_FIXTURE_GLOB}",
            "uploaded": [],
            "skipped": [],
            "errors": [],
            "missingRequired": missing_required,
        }

    assets = file_assets if file_assets is not None else evidence_store.file_assets

    uploaded: list[str] = []
    skipped: list[dict[str, str]] = []
    errors: list[dict[str, str]] = []

    for file_id, record in assets.items():
        physical = _find_physical_file(fixture_roots, record.file_name)
        if physical is None:
            skipped.append({"fileId": file_id, "reason": "physical file not found"})
            continue

        content = physical.read_bytes()
        actual_checksum = hashlib.sha256(content).hexdigest()
        if actual_checksum != record.checksum:
            skipped.append(
                {
                    "fileId": file_id,
                    "reason": "checksum mismatch",
                    "expected": record.checksum,
                    "actual": actual_checksum,
                }
            )
            continue

        if dry_run:
            uploaded.append(file_id)
            continue

        try:
            await resolved_provider.put_object(
                key=record.storage_key,
                content=content,
                content_type=record.content_type,
            )
            uploaded.append(file_id)
        except Exception as exc:  # noqa: BLE001 - aggregate per-file errors
            errors.append({"fileId": file_id, "error": str(exc)})

    missing_required = sorted(required.difference(uploaded))
    return {
        "status": "failed" if missing_required else ("ok" if not errors else "partial"),
        "storageMode": settings.storage_mode,
        "uploaded": uploaded,
        "skipped": skipped,
        "errors": errors,
        "missingRequired": missing_required,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Upload seed file asset fixtures to the configured S3/MinIO bucket.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="List files that would be uploaded without uploading.",
    )
    parser.add_argument(
        "--base-dir",
        type=str,
        default=None,
        help="Repository root directory.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print compact JSON output.",
    )
    parser.add_argument(
        "--require-file-id",
        action="append",
        default=[],
        help=(
            "Require a seed FileAsset id to be uploaded in this run. "
            "May be provided multiple times."
        ),
    )
    args = parser.parse_args()

    base_dir = Path(args.base_dir) if args.base_dir else None
    result = asyncio.run(
        upload_seed_file_assets(
            base_dir=base_dir,
            dry_run=args.dry_run,
            required_file_ids=set(args.require_file_id),
        )
    )

    if args.json:
        print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
    else:
        print(f"Status: {result['status']}")
        print(f"Uploaded ({len(result['uploaded'])}): {', '.join(result['uploaded']) or '-'}")
        print(
            f"Skipped ({len(result['skipped'])}): "
            f"{', '.join(s['fileId'] for s in result['skipped']) or '-'}"
        )
        if result["errors"]:
            print(
                f"Errors ({len(result['errors'])}): "
                f"{', '.join(e['fileId'] for e in result['errors'])}"
            )
        if result.get("missingRequired"):
            print(
                f"Missing required ({len(result['missingRequired'])}): "
                f"{', '.join(result['missingRequired'])}"
            )

    if result.get("errors") or result.get("missingRequired"):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
