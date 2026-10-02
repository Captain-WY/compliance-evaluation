from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.compliance.domain.issue_project_store import (
    IssueProjectReminderEventRecord,
    issue_project_store,
)
from app.modules.compliance.models.issue_project import IssueProjectReminderEventModel


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


class IssueProjectRuntimeRepository:
    """Persist P2 issue project reminder audit rows for database-backed runtime."""

    async def hydrate_reminder_events(self, session: AsyncSession) -> None:
        rows = list(
            (
                await session.scalars(
                    select(IssueProjectReminderEventModel).where(
                        IssueProjectReminderEventModel.is_deleted.is_(False),
                    ),
                )
            ).all(),
        )
        issue_project_store.hydrate_reminder_events(
            [self.record_from_model(row) for row in rows],
        )

    async def save_reminder_event(
        self,
        session: AsyncSession,
        record: IssueProjectReminderEventRecord,
    ) -> None:
        await session.merge(self.model_from_record(record))
        await session.flush()

    @staticmethod
    def record_from_model(
        row: IssueProjectReminderEventModel,
    ) -> IssueProjectReminderEventRecord:
        return IssueProjectReminderEventRecord(
            reminder_event_id=row.reminder_event_id,
            project_id=row.project_id,
            project_title_snapshot=row.project_title_snapshot,
            target_org_ids=list(row.target_org_ids),
            target_org_snapshots=list(row.target_org_snapshots),
            reason=row.reason,
            delivery_mode=row.delivery_mode,
            status=row.status,
            request_id=row.request_id,
            idempotency_key=row.idempotency_key,
            created_by=row.created_by_ref,
            created_by_snapshot=dict(row.created_by_snapshot),
            created_at=_iso(row.event_created_at) or "",
            sent_at=_iso(row.sent_at),
            notification_ids=list(row.notification_ids),
            result_summary=dict(row.result_summary),
        )

    @staticmethod
    def model_from_record(
        record: IssueProjectReminderEventRecord,
    ) -> IssueProjectReminderEventModel:
        now = _now()
        return IssueProjectReminderEventModel(
            created_by=record.created_by,
            updated_by=record.created_by,
            created_at=_dt(record.created_at) or now,
            updated_at=now,
            is_deleted=False,
            reminder_event_id=record.reminder_event_id,
            project_id=record.project_id,
            project_title_snapshot=record.project_title_snapshot,
            target_org_ids=list(record.target_org_ids),
            target_org_snapshots=list(record.target_org_snapshots),
            reason=record.reason,
            delivery_mode=record.delivery_mode,
            status=record.status,
            request_id=record.request_id,
            idempotency_key=record.idempotency_key,
            created_by_ref=record.created_by,
            created_by_snapshot=dict(record.created_by_snapshot),
            event_created_at=_dt(record.created_at) or now,
            sent_at=_dt(record.sent_at),
            notification_ids=list(record.notification_ids),
            result_summary=dict(record.result_summary),
        )


issue_project_runtime_repository = IssueProjectRuntimeRepository()
