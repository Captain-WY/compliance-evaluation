from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.compliance.domain.data_cockpit_store import (
    DataSyncAlertRecord,
    DataSyncJobRecord,
    DataSyncLogRecord,
    DataSyncRerunRequestRecord,
    DataSyncSnapshotRecord,
    ExportArtifactRecord,
    ExportAuditEventRecord,
    ExternalDataConnectorBindingRecord,
    ExternalDataSourceRecord,
    data_cockpit_store,
)
from app.modules.compliance.models import (
    DataSyncAlertModel,
    DataSyncJobModel,
    DataSyncLogModel,
    DataSyncRerunRequestModel,
    DataSyncSnapshotModel,
    ExportArtifactModel,
    ExportAuditEventModel,
    ExternalDataConnectorBindingModel,
    ExternalDataSourceModel,
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


class DataCockpitRuntimeRepository:
    """Persist P2 sandbox data cockpit state without production connector side effects."""

    async def hydrate_data_cockpit_store(self, session: AsyncSession) -> None:
        source_rows = await self._rows(session, ExternalDataSourceModel)
        if not source_rows:
            return
        binding_rows = await self._rows(session, ExternalDataConnectorBindingModel)
        job_rows = await self._rows(session, DataSyncJobModel)
        log_rows = await self._rows(session, DataSyncLogModel)
        snapshot_rows = await self._rows(session, DataSyncSnapshotModel)
        alert_rows = await self._rows(session, DataSyncAlertModel)
        rerun_rows = await self._rows(session, DataSyncRerunRequestModel)
        export_rows = await self._rows(session, ExportArtifactModel)
        export_audit_rows = await self._rows(session, ExportAuditEventModel)
        data_cockpit_store.hydrate(
            sources={row.source_id: self.source_record_from_model(row) for row in source_rows},
            bindings={
                row.binding_id: self.binding_record_from_model(row) for row in binding_rows
            },
            jobs={row.job_id: self.job_record_from_model(row) for row in job_rows},
            logs={row.log_id: self.log_record_from_model(row) for row in log_rows},
            snapshots={
                row.snapshot_id: self.snapshot_record_from_model(row) for row in snapshot_rows
            },
            alerts={row.alert_id: self.alert_record_from_model(row) for row in alert_rows},
            rerun_requests={
                row.rerun_request_id: self.rerun_record_from_model(row) for row in rerun_rows
            },
            export_artifacts={
                row.export_id: self.export_record_from_model(row) for row in export_rows
            },
            export_audit_events={
                row.export_audit_event_id: self.export_audit_record_from_model(row)
                for row in export_audit_rows
            },
        )

    async def save_runtime_state(self, session: AsyncSession) -> None:
        for source in data_cockpit_store.sources.values():
            await session.merge(self.source_model_from_record(source))
        for binding in data_cockpit_store.bindings.values():
            await session.merge(self.binding_model_from_record(binding))
        for job in data_cockpit_store.jobs.values():
            await session.merge(self.job_model_from_record(job))
        for snapshot in data_cockpit_store.snapshots.values():
            await session.merge(self.snapshot_model_from_record(snapshot))
        for alert in data_cockpit_store.alerts.values():
            await session.merge(self.alert_model_from_record(alert))
        for log in data_cockpit_store.logs.values():
            await session.merge(self.log_model_from_record(log))
        for rerun in data_cockpit_store.rerun_requests.values():
            await session.merge(self.rerun_model_from_record(rerun))
        for artifact in data_cockpit_store.export_artifacts.values():
            await session.merge(self.export_model_from_record(artifact))
        for event in data_cockpit_store.export_audit_events.values():
            await session.merge(self.export_audit_model_from_record(event))
        await session.flush()

    @staticmethod
    async def _rows(session: AsyncSession, model: type) -> list:
        return list(
            (
                await session.scalars(
                    select(model).where(model.is_deleted.is_(False)),
                )
            ).all(),
        )

    @staticmethod
    def source_record_from_model(row: ExternalDataSourceModel) -> ExternalDataSourceRecord:
        return ExternalDataSourceRecord(
            source_id=row.source_id,
            source_code=row.source_code,
            source_name=row.source_name,
            owner_dept_snapshot=dict(row.owner_dept_snapshot),
            connector_type=row.connector_type,
            health_status=row.health_status,
            last_heartbeat_at=_iso(row.last_heartbeat_at),
            sandbox_only=row.sandbox_only,
        )

    @staticmethod
    def source_model_from_record(record: ExternalDataSourceRecord) -> ExternalDataSourceModel:
        now = _now()
        return ExternalDataSourceModel(
            created_by="SYSTEM-SEED",
            updated_by="SYSTEM-SEED",
            created_at=now,
            updated_at=now,
            is_deleted=False,
            source_id=record.source_id,
            source_code=record.source_code,
            source_name=record.source_name,
            owner_dept_snapshot=dict(record.owner_dept_snapshot),
            connector_type=record.connector_type,
            health_status=record.health_status,
            last_heartbeat_at=_dt(record.last_heartbeat_at),
            sandbox_only=record.sandbox_only,
        )

    @staticmethod
    def binding_record_from_model(
        row: ExternalDataConnectorBindingModel,
    ) -> ExternalDataConnectorBindingRecord:
        return ExternalDataConnectorBindingRecord(
            binding_id=row.binding_id,
            source_id=row.source_id,
            binding_type=row.binding_type,
            endpoint_alias=row.endpoint_alias,
            config_snapshot=dict(row.config_snapshot),
            created_at=_iso(row.binding_created_at) or "",
            sandbox_only=row.sandbox_only,
        )

    @staticmethod
    def binding_model_from_record(
        record: ExternalDataConnectorBindingRecord,
    ) -> ExternalDataConnectorBindingModel:
        now = _now()
        return ExternalDataConnectorBindingModel(
            created_by="SYSTEM-SEED",
            updated_by="SYSTEM-SEED",
            created_at=now,
            updated_at=now,
            is_deleted=False,
            binding_id=record.binding_id,
            source_id=record.source_id,
            binding_type=record.binding_type,
            endpoint_alias=record.endpoint_alias,
            config_snapshot=dict(record.config_snapshot),
            binding_created_at=_dt(record.created_at) or now,
            sandbox_only=record.sandbox_only,
        )

    @staticmethod
    def job_record_from_model(row: DataSyncJobModel) -> DataSyncJobRecord:
        return DataSyncJobRecord(
            job_id=row.job_id,
            source_id=row.source_id,
            source_code=row.source_code,
            indicator_id=row.indicator_id,
            indicator_name=row.indicator_name,
            cycle_id=row.cycle_id,
            status=row.status,
            records=row.records,
            error_code=row.error_code,
            error_message=row.error_message,
            started_at=_iso(row.started_at) or "",
            finished_at=_iso(row.finished_at),
            has_snapshot=row.has_snapshot,
            sandbox_only=row.sandbox_only,
        )

    @staticmethod
    def job_model_from_record(record: DataSyncJobRecord) -> DataSyncJobModel:
        now = _now()
        return DataSyncJobModel(
            created_by="SYSTEM-SEED",
            updated_by="SYSTEM-SEED",
            created_at=now,
            updated_at=now,
            is_deleted=False,
            job_id=record.job_id,
            source_id=record.source_id,
            source_code=record.source_code,
            indicator_id=record.indicator_id,
            indicator_name=record.indicator_name,
            cycle_id=record.cycle_id,
            status=record.status,
            records=record.records,
            error_code=record.error_code,
            error_message=record.error_message,
            started_at=_dt(record.started_at) or now,
            finished_at=_dt(record.finished_at),
            has_snapshot=record.has_snapshot,
            sandbox_only=record.sandbox_only,
        )

    @staticmethod
    def log_record_from_model(row: DataSyncLogModel) -> DataSyncLogRecord:
        return DataSyncLogRecord(
            log_id=row.log_id,
            job_id=row.job_id,
            source_id=row.source_id,
            event_type=row.event_type,
            message=row.message,
            actor_user_id=row.actor_user_id,
            created_at=_iso(row.event_created_at) or "",
            command_type=row.command_type,
            request_id=row.request_id,
            payload_hash=row.payload_hash,
            metadata=dict(row.log_metadata),
        )

    @staticmethod
    def log_model_from_record(record: DataSyncLogRecord) -> DataSyncLogModel:
        now = _now()
        created_at = _dt(record.created_at) or now
        return DataSyncLogModel(
            created_by=record.actor_user_id,
            updated_by=record.actor_user_id,
            created_at=created_at,
            updated_at=created_at,
            is_deleted=False,
            log_id=record.log_id,
            job_id=record.job_id,
            source_id=record.source_id,
            event_type=record.event_type,
            message=record.message,
            actor_user_id=record.actor_user_id,
            event_created_at=created_at,
            command_type=record.command_type,
            request_id=record.request_id,
            payload_hash=record.payload_hash,
            log_metadata=dict(record.metadata),
        )

    @staticmethod
    def snapshot_record_from_model(row: DataSyncSnapshotModel) -> DataSyncSnapshotRecord:
        return DataSyncSnapshotRecord(
            snapshot_id=row.snapshot_id,
            job_id=row.job_id,
            payload_hash=row.payload_hash,
            record_count=row.record_count,
            redaction_policy=row.redaction_policy,
            captured_at=_iso(row.captured_at) or "",
            sample_rows=list(row.sample_rows),
            omitted_fields=list(row.omitted_fields),
            file_id=row.file_id,
            sandbox_only=row.sandbox_only,
        )

    @staticmethod
    def snapshot_model_from_record(record: DataSyncSnapshotRecord) -> DataSyncSnapshotModel:
        now = _now()
        return DataSyncSnapshotModel(
            created_by="SYSTEM-SEED",
            updated_by="SYSTEM-SEED",
            created_at=now,
            updated_at=now,
            is_deleted=False,
            snapshot_id=record.snapshot_id,
            job_id=record.job_id,
            payload_hash=record.payload_hash,
            record_count=record.record_count,
            redaction_policy=record.redaction_policy,
            captured_at=_dt(record.captured_at) or now,
            sample_rows=list(record.sample_rows),
            omitted_fields=list(record.omitted_fields),
            file_id=record.file_id,
            sandbox_only=record.sandbox_only,
        )

    @staticmethod
    def alert_record_from_model(row: DataSyncAlertModel) -> DataSyncAlertRecord:
        return DataSyncAlertRecord(
            alert_id=row.alert_id,
            job_id=row.job_id,
            source_id=row.source_id,
            status=row.status,
            severity=row.severity,
            message=row.message,
            created_at=_iso(row.alert_created_at) or "",
            ignored_by=row.ignored_by,
            ignored_at=_iso(row.ignored_at),
            resolved_at=_iso(row.resolved_at),
            audit_events=list(row.audit_events),
        )

    @staticmethod
    def alert_model_from_record(record: DataSyncAlertRecord) -> DataSyncAlertModel:
        now = _now()
        return DataSyncAlertModel(
            created_by=record.ignored_by,
            updated_by=record.ignored_by,
            created_at=now,
            updated_at=now,
            is_deleted=False,
            alert_id=record.alert_id,
            job_id=record.job_id,
            source_id=record.source_id,
            status=record.status,
            severity=record.severity,
            message=record.message,
            alert_created_at=_dt(record.created_at) or now,
            ignored_by=record.ignored_by,
            ignored_at=_dt(record.ignored_at),
            resolved_at=_dt(record.resolved_at),
            audit_events=list(record.audit_events),
        )

    @staticmethod
    def rerun_record_from_model(row: DataSyncRerunRequestModel) -> DataSyncRerunRequestRecord:
        return DataSyncRerunRequestRecord(
            rerun_request_id=row.rerun_request_id,
            job_id=row.job_id,
            source_id=row.source_id,
            indicator_id=row.indicator_id,
            cycle_id=row.cycle_id,
            source_window_key=row.source_window_key,
            status=row.status,
            requested_by=row.requested_by,
            actor_snapshot=dict(row.actor_snapshot),
            reason=row.reason,
            request_id=row.request_id,
            payload_hash=row.payload_hash,
            approval_marker=row.approval_marker,
            risk_acknowledgement=row.risk_acknowledgement,
            audit_event_id=row.audit_event_id,
            created_at=_iso(row.request_created_at) or "",
            sandbox_only=row.sandbox_only,
        )

    @staticmethod
    def rerun_model_from_record(record: DataSyncRerunRequestRecord) -> DataSyncRerunRequestModel:
        now = _now()
        created_at = _dt(record.created_at) or now
        return DataSyncRerunRequestModel(
            created_by=record.requested_by,
            updated_by=record.requested_by,
            created_at=created_at,
            updated_at=created_at,
            is_deleted=False,
            rerun_request_id=record.rerun_request_id,
            job_id=record.job_id,
            source_id=record.source_id,
            indicator_id=record.indicator_id,
            cycle_id=record.cycle_id,
            source_window_key=record.source_window_key,
            status=record.status,
            requested_by=record.requested_by,
            actor_snapshot=dict(record.actor_snapshot),
            reason=record.reason,
            request_id=record.request_id,
            payload_hash=record.payload_hash,
            approval_marker=record.approval_marker,
            risk_acknowledgement=record.risk_acknowledgement,
            audit_event_id=record.audit_event_id,
            request_created_at=created_at,
            sandbox_only=record.sandbox_only,
        )

    @staticmethod
    def export_record_from_model(row: ExportArtifactModel) -> ExportArtifactRecord:
        return ExportArtifactRecord(
            export_id=row.export_id,
            export_type=row.export_type,
            format=row.format,
            filter_snapshot=dict(row.filter_snapshot),
            status=row.status,
            requested_by=row.requested_by,
            request_id=row.request_id,
            redaction_policy=row.redaction_policy,
            evidence_label=row.evidence_label,
            created_at=_iso(row.export_created_at) or "",
            file_id=row.file_id,
            download_url=row.download_url,
            expires_at=_iso(row.expires_at),
            checksum=row.checksum,
            sandbox_only=row.sandbox_only,
            formal_artifact=row.formal_artifact,
            signed_artifact=row.signed_artifact,
        )

    @staticmethod
    def export_model_from_record(record: ExportArtifactRecord) -> ExportArtifactModel:
        now = _now()
        created_at = _dt(record.created_at) or now
        return ExportArtifactModel(
            created_by=record.requested_by,
            updated_by=record.requested_by,
            created_at=created_at,
            updated_at=created_at,
            is_deleted=False,
            export_id=record.export_id,
            export_type=record.export_type,
            format=record.format,
            filter_snapshot=dict(record.filter_snapshot),
            status=record.status,
            requested_by=record.requested_by,
            request_id=record.request_id,
            redaction_policy=record.redaction_policy,
            evidence_label=record.evidence_label,
            export_created_at=created_at,
            file_id=record.file_id,
            download_url=record.download_url,
            expires_at=_dt(record.expires_at),
            checksum=record.checksum,
            sandbox_only=record.sandbox_only,
            formal_artifact=record.formal_artifact,
            signed_artifact=record.signed_artifact,
        )

    @staticmethod
    def export_audit_record_from_model(row: ExportAuditEventModel) -> ExportAuditEventRecord:
        return ExportAuditEventRecord(
            export_audit_event_id=row.export_audit_event_id,
            export_id=row.export_id,
            requested_by=row.requested_by,
            actor_snapshot=dict(row.actor_snapshot),
            filter_snapshot=dict(row.filter_snapshot),
            redaction_policy=row.redaction_policy,
            access_metadata=dict(row.access_metadata),
            created_at=_iso(row.event_created_at) or "",
        )

    @staticmethod
    def export_audit_model_from_record(
        record: ExportAuditEventRecord,
    ) -> ExportAuditEventModel:
        now = _now()
        created_at = _dt(record.created_at) or now
        return ExportAuditEventModel(
            created_by=record.requested_by,
            updated_by=record.requested_by,
            created_at=created_at,
            updated_at=created_at,
            is_deleted=False,
            export_audit_event_id=record.export_audit_event_id,
            export_id=record.export_id,
            requested_by=record.requested_by,
            actor_snapshot=dict(record.actor_snapshot),
            filter_snapshot=dict(record.filter_snapshot),
            redaction_policy=record.redaction_policy,
            access_metadata=dict(record.access_metadata),
            event_created_at=created_at,
        )


data_cockpit_runtime_repository = DataCockpitRuntimeRepository()
