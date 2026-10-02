from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.compliance.domain.evidence_store import FileAssetRecord
from app.modules.compliance.models import FileAssetModel


class FileAssetRuntimeRepository:
    async def save_file_asset(
        self,
        session: AsyncSession,
        asset: FileAssetRecord,
    ) -> None:
        await session.merge(self.file_asset_model_from_record(asset))
        await session.flush()

    @staticmethod
    def file_asset_model_from_record(record: FileAssetRecord) -> FileAssetModel:
        uploaded_at = _parse_datetime(record.uploaded_at)
        return FileAssetModel(
            created_by=record.uploaded_by,
            updated_by=record.uploaded_by,
            created_at=uploaded_at,
            updated_at=uploaded_at,
            is_deleted=False,
            file_id=record.file_id,
            file_name=record.file_name,
            content_type=record.content_type,
            file_size=record.file_size,
            storage_key=record.storage_key,
            checksum=record.checksum,
            uploaded_by_ref=record.uploaded_by,
            uploaded_by_snapshot=dict(record.uploaded_by_snapshot),
            uploaded_at_ref=uploaded_at,
            scan_status=record.scan_status,
        )


def _parse_datetime(raw: str) -> datetime:
    parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


file_asset_runtime_repository = FileAssetRuntimeRepository()
