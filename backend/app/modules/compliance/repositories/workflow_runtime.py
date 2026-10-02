from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.compliance.domain.workflow_store import (
    WorkflowTemplateAuditEventRecord,
    WorkflowTemplateRecord,
    WorkflowTemplateVersionRecord,
    workflow_template_store,
)
from app.modules.compliance.models.workflow import (
    WorkflowTemplateAuditEventModel,
    WorkflowTemplateModel,
    WorkflowTemplateVersionModel,
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


class WorkflowRuntimeRepository:
    """Persist P2 workflow route-template runtime state.

    The domain store keeps validation/state rules synchronous and deterministic;
    this repository makes SQLAlchemy the restart boundary when runtime
    persistence is enabled.
    """

    async def hydrate_workflow_template_store(self, session: AsyncSession) -> None:
        templates = list(
            (
                await session.scalars(
                    select(WorkflowTemplateModel).where(WorkflowTemplateModel.is_deleted.is_(False)),
                )
            ).all(),
        )
        if not templates:
            return
        versions = list(
            (
                await session.scalars(
                    select(WorkflowTemplateVersionModel).where(
                        WorkflowTemplateVersionModel.is_deleted.is_(False),
                    ),
                )
            ).all(),
        )
        audit_events = list(
            (
                await session.scalars(
                    select(WorkflowTemplateAuditEventModel).where(
                        WorkflowTemplateAuditEventModel.is_deleted.is_(False),
                    ),
                )
            ).all(),
        )
        workflow_template_store.hydrate(
            templates={
                row.template_id: self.template_record_from_model(row)
                for row in templates
            },
            versions={
                row.template_version_id: self.version_record_from_model(row)
                for row in versions
            },
            audit_events={
                row.audit_event_id: self.audit_event_record_from_model(row)
                for row in audit_events
            },
        )

    async def save_runtime_state(self, session: AsyncSession) -> None:
        for record in workflow_template_store.templates.values():
            await session.merge(self.template_model_from_record(record))
        for record in workflow_template_store.versions.values():
            await session.merge(self.version_model_from_record(record))
        for record in workflow_template_store.audit_events.values():
            await session.merge(self.audit_event_model_from_record(record))
        await session.flush()

    @staticmethod
    def template_record_from_model(row: WorkflowTemplateModel) -> WorkflowTemplateRecord:
        return WorkflowTemplateRecord(
            template_id=row.template_id,
            name=row.name,
            domain=row.domain,
            scope_mode=row.scope_mode,
            status=row.status,
            schema_version=row.schema_version,
            chains_json=list(row.chains_json),
            created_by_ref=row.created_by_ref,
            updated_by_ref=row.updated_by_ref,
            created_at=_iso(row.created_at) or "",
            updated_at=_iso(row.updated_at) or "",
            current_version_id=row.current_version_id,
            last_validation_summary=dict(row.last_validation_summary),
        )

    @staticmethod
    def template_model_from_record(record: WorkflowTemplateRecord) -> WorkflowTemplateModel:
        now = _now()
        return WorkflowTemplateModel(
            created_by=record.created_by_ref,
            updated_by=record.updated_by_ref,
            created_at=_dt(record.created_at) or now,
            updated_at=_dt(record.updated_at) or now,
            is_deleted=False,
            template_id=record.template_id,
            name=record.name,
            domain=record.domain,
            scope_mode=record.scope_mode,
            status=record.status,
            schema_version=record.schema_version,
            chains_json=list(record.chains_json),
            created_by_ref=record.created_by_ref,
            updated_by_ref=record.updated_by_ref,
            current_version_id=record.current_version_id,
            last_validation_summary=dict(record.last_validation_summary),
        )

    @staticmethod
    def version_record_from_model(
        row: WorkflowTemplateVersionModel,
    ) -> WorkflowTemplateVersionRecord:
        return WorkflowTemplateVersionRecord(
            template_version_id=row.template_version_id,
            template_id=row.template_id,
            version_no=row.version_no,
            status=row.status,
            snapshot_json=dict(row.snapshot_json),
            snapshot_hash=row.snapshot_hash,
            target_scope_snapshot=list(row.target_scope_snapshot),
            published_by_ref=row.published_by_ref,
            published_at=_iso(row.published_at) or "",
            archived_at=_iso(row.archived_at),
        )

    @staticmethod
    def version_model_from_record(
        record: WorkflowTemplateVersionRecord,
    ) -> WorkflowTemplateVersionModel:
        now = _now()
        return WorkflowTemplateVersionModel(
            created_by=record.published_by_ref,
            updated_by=record.published_by_ref,
            created_at=_dt(record.published_at) or now,
            updated_at=now,
            is_deleted=False,
            template_version_id=record.template_version_id,
            template_id=record.template_id,
            version_no=record.version_no,
            status=record.status,
            snapshot_json=dict(record.snapshot_json),
            snapshot_hash=record.snapshot_hash,
            target_scope_snapshot=list(record.target_scope_snapshot),
            published_by_ref=record.published_by_ref,
            published_at=_dt(record.published_at) or now,
            archived_at=_dt(record.archived_at),
        )

    @staticmethod
    def audit_event_record_from_model(
        row: WorkflowTemplateAuditEventModel,
    ) -> WorkflowTemplateAuditEventRecord:
        return WorkflowTemplateAuditEventRecord(
            audit_event_id=row.audit_event_id,
            template_id=row.template_id,
            event_type=row.event_type,
            actor_user_id=row.actor_user_id,
            actor_snapshot=dict(row.actor_snapshot),
            template_version_id=row.template_version_id,
            snapshot_hash=row.snapshot_hash,
            route_summary=dict(row.route_summary),
            target_scope_snapshot=list(row.target_scope_snapshot),
            validation_summary=dict(row.validation_summary),
            event_created_at=_iso(row.event_created_at) or "",
        )

    @staticmethod
    def audit_event_model_from_record(
        record: WorkflowTemplateAuditEventRecord,
    ) -> WorkflowTemplateAuditEventModel:
        now = _now()
        event_created_at = _dt(record.event_created_at) or now
        return WorkflowTemplateAuditEventModel(
            created_by=record.actor_user_id,
            updated_by=record.actor_user_id,
            created_at=event_created_at,
            updated_at=event_created_at,
            is_deleted=False,
            audit_event_id=record.audit_event_id,
            template_id=record.template_id,
            event_type=record.event_type,
            actor_user_id=record.actor_user_id,
            actor_snapshot=dict(record.actor_snapshot),
            template_version_id=record.template_version_id,
            snapshot_hash=record.snapshot_hash,
            route_summary=dict(record.route_summary),
            target_scope_snapshot=list(record.target_scope_snapshot),
            validation_summary=dict(record.validation_summary),
            event_created_at=event_created_at,
        )


workflow_runtime_repository = WorkflowRuntimeRepository()
