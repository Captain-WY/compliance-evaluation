from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.compliance.domain.scheduler_store import (
    AssessmentScheduleRecord,
    ScheduleExecutionRecord,
    ScheduleRetryEventRecord,
    ScheduleRuleRecord,
    assessment_scheduler_store,
)
from app.modules.compliance.models import (
    AssessmentScheduleExecutionModel,
    AssessmentScheduleModel,
    AssessmentScheduleRetryEventModel,
    AssessmentScheduleRuleModel,
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


class SchedulerRuntimeRepository:
    """Persist P2 assessment scheduler runtime state behind the existing P1 stores."""

    async def hydrate_scheduler_store(self, session: AsyncSession) -> None:
        schedule_rows = list(
            (
                await session.scalars(
                    select(AssessmentScheduleModel).where(
                        AssessmentScheduleModel.is_deleted.is_(False),
                    ),
                )
            ).all(),
        )
        if not schedule_rows:
            return
        rule_rows = list(
            (
                await session.scalars(
                    select(AssessmentScheduleRuleModel).where(
                        AssessmentScheduleRuleModel.is_deleted.is_(False),
                    ),
                )
            ).all(),
        )
        execution_rows = list(
            (
                await session.scalars(
                    select(AssessmentScheduleExecutionModel).where(
                        AssessmentScheduleExecutionModel.is_deleted.is_(False),
                    ),
                )
            ).all(),
        )
        retry_rows = list(
            (
                await session.scalars(
                    select(AssessmentScheduleRetryEventModel).where(
                        AssessmentScheduleRetryEventModel.is_deleted.is_(False),
                    ),
                )
            ).all(),
        )
        rules = {row.rule_id: self.rule_record_from_model(row) for row in rule_rows}
        assessment_scheduler_store.hydrate(
            schedules={
                row.schedule_id: self.schedule_record_from_model(row, rules)
                for row in schedule_rows
            },
            executions={
                row.execution_id: self.execution_record_from_model(row)
                for row in execution_rows
            },
            retry_events={
                row.retry_event_id: self.retry_event_record_from_model(row)
                for row in retry_rows
            },
        )

    async def save_runtime_state(self, session: AsyncSession) -> None:
        for schedule in assessment_scheduler_store.schedules.values():
            await session.merge(self.schedule_model_from_record(schedule))
            await session.merge(self.rule_model_from_record(schedule.draft_rule, schedule, "DRAFT"))
            if schedule.active_rule:
                await session.merge(
                    self.rule_model_from_record(schedule.active_rule, schedule, "ACTIVE"),
                )
        for execution in assessment_scheduler_store.executions.values():
            await session.merge(self.execution_model_from_record(execution))
        for event in assessment_scheduler_store.retry_events.values():
            await session.merge(self.retry_event_model_from_record(event))
        await session.flush()

    @staticmethod
    def rule_record_from_model(row: AssessmentScheduleRuleModel) -> ScheduleRuleRecord:
        return ScheduleRuleRecord(
            rule_id=row.rule_id,
            frequency=row.frequency,
            working_day_offset=row.working_day_offset,
            fire_time=row.fire_time,
            timezone=row.timezone,
            calendar_code=row.calendar_code,
            valid_from=row.valid_from,
            valid_until=row.valid_until,
        )

    @staticmethod
    def schedule_record_from_model(
        row: AssessmentScheduleModel,
        rules: dict[str, ScheduleRuleRecord],
    ) -> AssessmentScheduleRecord:
        return AssessmentScheduleRecord(
            schedule_id=row.schedule_id,
            scheme_id=row.scheme_id,
            template_id=row.template_id,
            template_version_id=row.template_version_id,
            snapshot_hash=row.snapshot_hash,
            dispatch_mode=row.dispatch_mode,
            status=row.status,
            draft_rule=rules[row.draft_rule_id],
            active_rule=rules.get(row.active_rule_id or ""),
            target_org_ids=list(row.target_org_ids),
            target_scope_snapshot=list(row.target_scope_snapshot),
            predicted_next_fire_at=_iso(row.predicted_next_fire_at),
            last_execution_id=row.last_execution_id,
            created_by_ref=row.created_by_ref,
            updated_by_ref=row.updated_by_ref,
            version=row.version,
            audit_events=list(row.audit_events),
        )

    @staticmethod
    def schedule_model_from_record(record: AssessmentScheduleRecord) -> AssessmentScheduleModel:
        now = _now()
        return AssessmentScheduleModel(
            created_by=record.created_by_ref,
            updated_by=record.updated_by_ref,
            created_at=now,
            updated_at=now,
            is_deleted=False,
            schedule_id=record.schedule_id,
            scheme_id=record.scheme_id,
            template_id=record.template_id,
            template_version_id=record.template_version_id,
            snapshot_hash=record.snapshot_hash,
            dispatch_mode=record.dispatch_mode,
            status=record.status,
            draft_rule_id=record.draft_rule.rule_id,
            active_rule_id=record.active_rule.rule_id if record.active_rule else None,
            target_org_ids=list(record.target_org_ids),
            target_scope_snapshot=list(record.target_scope_snapshot),
            predicted_next_fire_at=_dt(record.predicted_next_fire_at),
            last_execution_id=record.last_execution_id,
            created_by_ref=record.created_by_ref,
            updated_by_ref=record.updated_by_ref,
            version=record.version,
            audit_events=list(record.audit_events),
        )

    @staticmethod
    def rule_model_from_record(
        record: ScheduleRuleRecord,
        schedule: AssessmentScheduleRecord,
        status: str,
    ) -> AssessmentScheduleRuleModel:
        now = _now()
        return AssessmentScheduleRuleModel(
            created_by=schedule.updated_by_ref,
            updated_by=schedule.updated_by_ref,
            created_at=now,
            updated_at=now,
            is_deleted=False,
            rule_id=record.rule_id,
            schedule_id=schedule.schedule_id,
            rule_status=status,
            frequency=record.frequency,
            working_day_offset=record.working_day_offset,
            fire_time=record.fire_time,
            timezone=record.timezone,
            calendar_code=record.calendar_code,
            valid_from=record.valid_from,
            valid_until=record.valid_until,
            rule_snapshot={
                "frequency": record.frequency,
                "workingDayOffset": record.working_day_offset,
                "fireTime": record.fire_time,
                "timezone": record.timezone,
                "calendarCode": record.calendar_code,
            },
        )

    @staticmethod
    def execution_record_from_model(
        row: AssessmentScheduleExecutionModel,
    ) -> ScheduleExecutionRecord:
        return ScheduleExecutionRecord(
            execution_id=row.execution_id,
            schedule_id=row.schedule_id,
            scheduled_at=_iso(row.scheduled_at) or "",
            started_at=_iso(row.started_at),
            finished_at=_iso(row.finished_at),
            status=row.status,
            cycle_id=row.cycle_id,
            retry_of_execution_id=row.retry_of_execution_id,
            target_count=row.target_count,
            created_cycle_id=row.created_cycle_id,
            dispatch_event_ids=list(row.dispatch_event_ids),
            generated_task_count=row.generated_task_count,
            error_code=row.error_code,
            error_message=row.error_message,
            guard_result=dict(row.guard_result),
            duplicate_prevention_key=row.duplicate_prevention_key,
            rule_snapshot=dict(row.rule_snapshot),
            scheme_snapshot=dict(row.scheme_snapshot),
            target_scope_snapshot=list(row.target_scope_snapshot),
            workflow_snapshot=dict(row.workflow_snapshot),
        )

    @staticmethod
    def execution_model_from_record(
        record: ScheduleExecutionRecord,
    ) -> AssessmentScheduleExecutionModel:
        now = _now()
        return AssessmentScheduleExecutionModel(
            created_by=None,
            updated_by=None,
            created_at=now,
            updated_at=now,
            is_deleted=False,
            execution_id=record.execution_id,
            schedule_id=record.schedule_id,
            scheduled_at=_dt(record.scheduled_at) or now,
            started_at=_dt(record.started_at),
            finished_at=_dt(record.finished_at),
            status=record.status,
            cycle_id=record.cycle_id,
            retry_of_execution_id=record.retry_of_execution_id,
            target_count=record.target_count,
            created_cycle_id=record.created_cycle_id,
            dispatch_event_ids=list(record.dispatch_event_ids),
            generated_task_count=record.generated_task_count,
            error_code=record.error_code,
            error_message=record.error_message,
            guard_result=dict(record.guard_result),
            duplicate_prevention_key=record.duplicate_prevention_key,
            rule_snapshot=dict(record.rule_snapshot),
            scheme_snapshot=dict(record.scheme_snapshot),
            target_scope_snapshot=list(record.target_scope_snapshot),
            workflow_snapshot=dict(record.workflow_snapshot),
        )

    @staticmethod
    def retry_event_record_from_model(
        row: AssessmentScheduleRetryEventModel,
    ) -> ScheduleRetryEventRecord:
        return ScheduleRetryEventRecord(
            retry_event_id=row.retry_event_id,
            original_execution_id=row.original_execution_id,
            retry_execution_id=row.retry_execution_id,
            requested_by=row.requested_by,
            actor_snapshot=dict(row.actor_snapshot),
            reason=row.reason,
            request_id=row.request_id,
            idempotency_key=row.idempotency_key,
            created_at=_iso(row.event_created_at) or "",
            duplicate=row.duplicate,
            failure_details=dict(row.failure_details),
        )

    @staticmethod
    def retry_event_model_from_record(
        record: ScheduleRetryEventRecord,
    ) -> AssessmentScheduleRetryEventModel:
        now = _now()
        created_at = _dt(record.created_at) or now
        return AssessmentScheduleRetryEventModel(
            created_by=record.requested_by,
            updated_by=record.requested_by,
            created_at=created_at,
            updated_at=created_at,
            is_deleted=False,
            retry_event_id=record.retry_event_id,
            original_execution_id=record.original_execution_id,
            retry_execution_id=record.retry_execution_id,
            requested_by=record.requested_by,
            actor_snapshot=dict(record.actor_snapshot),
            reason=record.reason,
            request_id=record.request_id,
            idempotency_key=record.idempotency_key,
            event_created_at=created_at,
            duplicate=record.duplicate,
            failure_details=dict(record.failure_details),
        )


scheduler_runtime_repository = SchedulerRuntimeRepository()
