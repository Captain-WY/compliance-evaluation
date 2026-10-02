from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.compliance.domain.evidence_store import FileAssetRecord, evidence_store
from app.modules.compliance.domain.inspection_report_store import (
    InspectionReportAuditEventRecord,
    InspectionReportCommandRecord,
    InspectionReportVersionRecord,
    inspection_report_store,
)
from app.modules.compliance.models import (
    FileAssetModel,
    InspectionReportAuditEventModel,
    InspectionReportCommandKeyModel,
    InspectionReportVersionModel,
)


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.isoformat().replace("+00:00", "Z")


def _dt(value: str | None) -> datetime | None:
    if not value:
        return None
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed


def _now() -> datetime:
    return datetime.now(UTC)


class InspectionReportRuntimeRepository:
    """Persist P2 inspection report runtime state at API boundaries."""

    async def hydrate_report_store(self, session: AsyncSession) -> None:
        version_rows = list(
            (
                await session.scalars(
                    select(InspectionReportVersionModel).where(
                        InspectionReportVersionModel.is_deleted.is_(False),
                    ),
                )
            ).all(),
        )
        audit_rows = list(
            (
                await session.scalars(
                    select(InspectionReportAuditEventModel).where(
                        InspectionReportAuditEventModel.is_deleted.is_(False),
                    ),
                )
            ).all(),
        )
        command_rows = list(
            (
                await session.scalars(
                    select(InspectionReportCommandKeyModel).where(
                        InspectionReportCommandKeyModel.is_deleted.is_(False),
                    ),
                )
            ).all(),
        )
        file_asset_ids = {
            file_id
            for row in version_rows
            for file_id in [
                row.file_asset_id,
                *(row.supporting_file_asset_ids or []),
            ]
            if file_id
        }
        file_asset_ids.update(
            file_id
            for row in audit_rows
            for file_id in (row.file_asset_ids or [])
            if file_id
        )
        if file_asset_ids:
            file_asset_rows = list(
                (
                    await session.scalars(
                        select(FileAssetModel).where(
                            FileAssetModel.file_id.in_(file_asset_ids),
                            FileAssetModel.is_deleted.is_(False),
                        ),
                    )
                ).all(),
            )
            for row in file_asset_rows:
                evidence_store.file_assets[row.file_id] = self.file_asset_record_from_model(row)
        inspection_report_store.hydrate(
            versions={
                row.report_version_id: self.version_record_from_model(row)
                for row in version_rows
            },
            audit_events={
                row.report_audit_event_id: self.audit_event_record_from_model(row)
                for row in audit_rows
            },
            command_keys={
                (
                    row.inspection_plan_id,
                    row.command_type,
                    row.actor_user_id,
                    row.idempotency_key,
                ): self.command_record_from_model(row)
                for row in command_rows
            },
        )

    async def save_runtime_state(self, session: AsyncSession) -> None:
        await self._save_referenced_file_assets(session)
        for record in inspection_report_store.versions.values():
            await session.merge(self.version_model_from_record(record))
        for record in inspection_report_store.audit_events.values():
            await session.merge(self.audit_event_model_from_record(record))
        for record in inspection_report_store.command_keys.values():
            await session.merge(self.command_model_from_record(record))
        await session.flush()

    async def _save_referenced_file_assets(self, session: AsyncSession) -> None:
        file_ids = {
            file_id
            for version in inspection_report_store.versions.values()
            for file_id in [version.file_asset_id, *version.supporting_file_asset_ids]
            if file_id
        }
        for file_id in sorted(file_ids):
            asset = evidence_store.file_assets.get(file_id)
            if asset is None:
                continue
            await session.merge(self.file_asset_model_from_record(asset))

    @staticmethod
    def version_record_from_model(
        row: InspectionReportVersionModel,
    ) -> InspectionReportVersionRecord:
        return InspectionReportVersionRecord(
            report_version_id=row.report_version_id,
            inspection_plan_id=row.inspection_plan_id,
            version_no=row.version_no,
            label=row.label,
            method=row.method,
            status=row.status,
            file_asset_id=row.file_asset_id,
            supporting_file_asset_ids=list(row.supporting_file_asset_ids or []),
            source_snapshot_hash=row.source_snapshot_hash,
            source_summary=dict(row.source_summary or {}),
            created_by=row.created_by_ref,
            created_by_snapshot=dict(row.created_by_snapshot or {}),
            created_at=_iso(row.report_created_at) or "",
            remarks=row.remarks,
            released_at=_iso(row.released_at),
            released_by=row.released_by_ref,
            released_by_snapshot=(
                dict(row.released_by_snapshot) if row.released_by_snapshot else None
            ),
            optimistic_version=row.optimistic_version,
            idempotency_key=row.idempotency_key,
            payload_hash=row.payload_hash,
        )

    @staticmethod
    def version_model_from_record(
        record: InspectionReportVersionRecord,
    ) -> InspectionReportVersionModel:
        now = _now()
        created_at = _dt(record.created_at) or now
        return InspectionReportVersionModel(
            created_by=record.created_by,
            updated_by=record.released_by or record.created_by,
            created_at=created_at,
            updated_at=now,
            is_deleted=False,
            report_version_id=record.report_version_id,
            inspection_plan_id=record.inspection_plan_id,
            version_no=record.version_no,
            label=record.label,
            method=record.method,
            status=record.status,
            file_asset_id=record.file_asset_id,
            supporting_file_asset_ids=list(record.supporting_file_asset_ids),
            source_snapshot_hash=record.source_snapshot_hash,
            source_summary=dict(record.source_summary),
            created_by_ref=record.created_by,
            created_by_snapshot=dict(record.created_by_snapshot),
            report_created_at=created_at,
            remarks=record.remarks,
            released_at=_dt(record.released_at),
            released_by_ref=record.released_by,
            released_by_snapshot=(
                dict(record.released_by_snapshot) if record.released_by_snapshot else None
            ),
            optimistic_version=record.optimistic_version,
            idempotency_key=record.idempotency_key,
            payload_hash=record.payload_hash,
        )

    @staticmethod
    def audit_event_record_from_model(
        row: InspectionReportAuditEventModel,
    ) -> InspectionReportAuditEventRecord:
        return InspectionReportAuditEventRecord(
            report_audit_event_id=row.report_audit_event_id,
            inspection_plan_id=row.inspection_plan_id,
            report_version_id=row.report_version_id,
            action=row.action,
            actor_user_id=row.actor_user_id,
            actor_org_id=row.actor_org_id,
            actor_snapshot=dict(row.actor_snapshot or {}),
            occurred_at=_iso(row.occurred_at) or "",
            request_id=row.request_id,
            idempotency_key=row.idempotency_key,
            payload_hash=row.payload_hash,
            from_status=row.from_status,
            to_status=row.to_status,
            file_asset_ids=list(row.file_asset_ids or []),
            details=dict(row.details or {}),
        )

    @staticmethod
    def audit_event_model_from_record(
        record: InspectionReportAuditEventRecord,
    ) -> InspectionReportAuditEventModel:
        now = _now()
        occurred_at = _dt(record.occurred_at) or now
        return InspectionReportAuditEventModel(
            created_by=record.actor_user_id,
            updated_by=record.actor_user_id,
            created_at=occurred_at,
            updated_at=occurred_at,
            is_deleted=False,
            report_audit_event_id=record.report_audit_event_id,
            inspection_plan_id=record.inspection_plan_id,
            report_version_id=record.report_version_id,
            action=record.action,
            actor_user_id=record.actor_user_id,
            actor_org_id=record.actor_org_id,
            actor_snapshot=dict(record.actor_snapshot),
            occurred_at=occurred_at,
            request_id=record.request_id,
            idempotency_key=record.idempotency_key,
            payload_hash=record.payload_hash,
            from_status=record.from_status,
            to_status=record.to_status,
            file_asset_ids=list(record.file_asset_ids),
            details=dict(record.details),
        )

    @staticmethod
    def command_record_from_model(
        row: InspectionReportCommandKeyModel,
    ) -> InspectionReportCommandRecord:
        return InspectionReportCommandRecord(
            command_key_id=row.command_key_id,
            inspection_plan_id=row.inspection_plan_id,
            command_type=row.command_type,
            actor_user_id=row.actor_user_id,
            idempotency_key=row.idempotency_key,
            payload_hash=row.payload_hash,
            result_ref=row.result_ref,
            created_at=_iso(row.command_created_at) or "",
        )

    @staticmethod
    def command_model_from_record(
        record: InspectionReportCommandRecord,
    ) -> InspectionReportCommandKeyModel:
        now = _now()
        created_at = _dt(record.created_at) or now
        return InspectionReportCommandKeyModel(
            created_by=record.actor_user_id,
            updated_by=record.actor_user_id,
            created_at=created_at,
            updated_at=created_at,
            is_deleted=False,
            command_key_id=record.command_key_id,
            inspection_plan_id=record.inspection_plan_id,
            command_type=record.command_type,
            actor_user_id=record.actor_user_id,
            idempotency_key=record.idempotency_key,
            payload_hash=record.payload_hash,
            result_ref=record.result_ref,
            command_created_at=created_at,
        )

    @staticmethod
    def file_asset_model_from_record(record: FileAssetRecord) -> FileAssetModel:
        now = _now()
        uploaded_at = _dt(record.uploaded_at) or now
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

    @staticmethod
    def file_asset_record_from_model(row: FileAssetModel) -> FileAssetRecord:
        return FileAssetRecord(
            file_id=row.file_id,
            file_name=row.file_name,
            content_type=row.content_type,
            file_size=row.file_size,
            storage_key=row.storage_key,
            checksum=row.checksum,
            uploaded_by=row.uploaded_by_ref,
            uploaded_at=_iso(row.uploaded_at_ref) or "",
            scan_status=row.scan_status,
            uploaded_by_snapshot=dict(row.uploaded_by_snapshot or {}),
        )


inspection_report_runtime_repository = InspectionReportRuntimeRepository()
