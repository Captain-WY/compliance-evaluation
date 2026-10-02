from __future__ import annotations

import hashlib
from copy import deepcopy
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta
from typing import Any

from app.modules.compliance.core.errors import AppError, ForbiddenError, NotFoundError
from app.modules.compliance.domain.auth_store import AuthUserRecord, SeedAuthStore
from app.modules.compliance.domain.cycle_store import cycle_store
from app.modules.compliance.domain.scheme_store import scheme_store
from app.modules.compliance.domain.seed_time import relative_date, relative_date_iso, relative_datetime_iso
from app.modules.compliance.domain.workflow_evaluator import RouteChainEvaluator
from app.modules.compliance.domain.workflow_models import WorkflowTemplateVersionSnapshot
from app.modules.compliance.domain.workflow_store import workflow_template_store

DEFAULT_SCHEDULE_ID = "ASCHED-DRAFT-001"
ACTIVE_SCHEDULE_ID = "ASCHED-ACTIVE-001"
FAILED_EXECUTION_ID = "SCHED-EXEC-FAILED-001"


@dataclass
class ScheduleRuleRecord:
    rule_id: str
    frequency: str
    working_day_offset: int
    fire_time: str
    timezone: str
    calendar_code: str = "WEEKDAY_ONLY"
    valid_from: str | None = None
    valid_until: str | None = None


@dataclass
class AssessmentScheduleRecord:
    schedule_id: str
    scheme_id: str
    template_id: str
    template_version_id: str | None
    snapshot_hash: str | None
    dispatch_mode: str
    status: str
    draft_rule: ScheduleRuleRecord
    active_rule: ScheduleRuleRecord | None
    target_org_ids: list[str]
    target_scope_snapshot: list[dict[str, Any]]
    predicted_next_fire_at: str | None
    last_execution_id: str | None
    created_by_ref: str
    updated_by_ref: str
    version: int = 1
    audit_events: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class ScheduleExecutionRecord:
    execution_id: str
    schedule_id: str
    scheduled_at: str
    status: str
    started_at: str | None = None
    finished_at: str | None = None
    cycle_id: str | None = None
    retry_of_execution_id: str | None = None
    target_count: int = 0
    created_cycle_id: str | None = None
    dispatch_event_ids: list[str] = field(default_factory=list)
    generated_task_count: int = 0
    error_code: str | None = None
    error_message: str | None = None
    guard_result: dict[str, Any] = field(default_factory=dict)
    duplicate_prevention_key: str = ""
    rule_snapshot: dict[str, Any] = field(default_factory=dict)
    scheme_snapshot: dict[str, Any] = field(default_factory=dict)
    target_scope_snapshot: list[dict[str, Any]] = field(default_factory=list)
    workflow_snapshot: dict[str, Any] = field(default_factory=dict)


@dataclass
class ScheduleRetryEventRecord:
    retry_event_id: str
    original_execution_id: str
    retry_execution_id: str | None
    requested_by: str
    actor_snapshot: dict[str, Any]
    reason: str
    request_id: str | None
    idempotency_key: str
    created_at: str
    duplicate: bool
    failure_details: dict[str, Any] = field(default_factory=dict)


class SeedAssessmentSchedulerStore:
    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self.schedules: dict[str, AssessmentScheduleRecord] = {}
        self.executions: dict[str, ScheduleExecutionRecord] = {}
        self.retry_events: dict[str, ScheduleRetryEventRecord] = {}
        self._seed_default_records()

    def hydrate(
        self,
        *,
        schedules: dict[str, AssessmentScheduleRecord],
        executions: dict[str, ScheduleExecutionRecord],
        retry_events: dict[str, ScheduleRetryEventRecord],
    ) -> None:
        self.schedules = schedules
        self.executions = executions
        self.retry_events = retry_events

    def schedule_detail(
        self,
        *,
        schedule_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        self._require_read(user, auth_store)
        schedule = self._get_schedule(schedule_id)
        self._assert_hq_scope(user, auth_store)
        prediction = self._prediction_for(schedule)
        schedule.predicted_next_fire_at = prediction["nextFireAt"]
        return self._schedule_view(schedule, prediction=prediction)

    def save_draft(
        self,
        *,
        schedule_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        self._require_manage(user, auth_store)
        schedule = self._get_schedule(schedule_id)
        self._assert_hq_scope(user, auth_store)
        if schedule.status != "DRAFT":
            raise AppError(
                code="INVALID_STATE",
                message="Only DRAFT schedules can be edited",
                status_code=409,
                details={"scheduleId": schedule_id, "status": schedule.status},
            )
        schedule.draft_rule = self._rule_from_payload(schedule.draft_rule.rule_id, payload)
        schedule.predicted_next_fire_at = self._predict_next_fire_at(schedule.draft_rule)
        schedule.updated_by_ref = user.user_id
        schedule.version += 1
        schedule.audit_events.append(
            {
                "eventType": "SCHEDULE_DRAFT_SAVED",
                "actorUserId": user.user_id,
                "ruleSnapshot": self._rule_view(schedule.draft_rule),
                "createdAt": relative_datetime_iso(),
            },
        )
        return self._schedule_view(schedule, prediction=self._prediction_for(schedule))

    def activate(
        self,
        *,
        schedule_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        self._require_manage(user, auth_store)
        schedule = self._get_schedule(schedule_id)
        self._assert_hq_scope(user, auth_store)
        if schedule.status != "DRAFT":
            raise AppError(
                code="INVALID_STATE",
                message="Only DRAFT schedules can be activated",
                status_code=409,
                details={"scheduleId": schedule_id, "status": schedule.status},
            )
        guard = self._dispatch_preflight(schedule, user, auth_store)
        version = self._published_template_version(
            schedule.template_id,
            schedule.template_version_id,
        )
        route_summary = self._validate_route_snapshot(version, schedule, auth_store)
        schedule.status = "ACTIVE"
        schedule.active_rule = deepcopy(schedule.draft_rule)
        schedule.template_version_id = version.template_version_id
        schedule.snapshot_hash = version.snapshot_hash
        schedule.predicted_next_fire_at = self._predict_next_fire_at(schedule.active_rule)
        schedule.updated_by_ref = user.user_id
        schedule.version += 1
        schedule.audit_events.append(
            {
                "eventType": "SCHEDULE_ACTIVATED",
                "actorUserId": user.user_id,
                "firstPredictedFireAt": schedule.predicted_next_fire_at,
                "dispatchGuard": guard,
                "routeSummary": route_summary,
                "createdAt": relative_datetime_iso(),
            },
        )
        return {
            "schedule": self._schedule_view(schedule, prediction=self._prediction_for(schedule)),
            "guardResult": guard,
            "routeSummary": route_summary,
        }

    def execution_page(
        self,
        *,
        schedule_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        page: int,
        page_size: int,
    ) -> dict[str, Any]:
        self._require_read(user, auth_store)
        self._assert_hq_scope(user, auth_store)
        self._get_schedule(schedule_id)
        records = [
            execution
            for execution in self.executions.values()
            if execution.schedule_id == schedule_id
        ]
        records.sort(key=lambda item: item.scheduled_at, reverse=True)
        start = (page - 1) * page_size
        end = start + page_size
        return {
            "items": [self._execution_view(record) for record in records[start:end]],
            "page": page,
            "pageSize": page_size,
            "total": len(records),
        }

    def retry_execution(
        self,
        *,
        execution_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        self._require_retry(user, auth_store)
        self._assert_hq_scope(user, auth_store)
        execution = self._get_execution(execution_id)
        schedule = self._get_schedule(execution.schedule_id)
        duplicate = self._retry_event_for_execution(execution_id)
        if duplicate:
            return {
                "originalExecution": self._execution_view(execution),
                "retryExecution": self._execution_view(
                    self.executions[duplicate.retry_execution_id],
                )
                if duplicate.retry_execution_id
                else None,
                "retryEvent": self._retry_event_view(duplicate),
                "duplicate": True,
            }
        if execution.status != "FAILED":
            raise AppError(
                code="INVALID_STATE",
                message="Only FAILED schedule executions can be retried",
                status_code=409,
                details={"executionId": execution_id, "status": execution.status},
            )
        guard = self._dispatch_preflight(schedule, user, auth_store)
        retry_execution_id = f"SCHED-EXEC-RETRY-{len(self.executions) + 1:03d}"
        retry = ScheduleExecutionRecord(
            execution_id=retry_execution_id,
            schedule_id=schedule.schedule_id,
            scheduled_at=relative_datetime_iso(0, hour=10),
            status="QUEUED",
            retry_of_execution_id=execution.execution_id,
            target_count=len(schedule.target_org_ids),
            duplicate_prevention_key=execution.duplicate_prevention_key,
            guard_result=guard,
            rule_snapshot=self._rule_view(schedule.active_rule or schedule.draft_rule),
            scheme_snapshot=deepcopy(execution.scheme_snapshot),
            target_scope_snapshot=deepcopy(schedule.target_scope_snapshot),
            workflow_snapshot=deepcopy(execution.workflow_snapshot),
        )
        execution.status = "RETRY_REQUESTED"
        event = ScheduleRetryEventRecord(
            retry_event_id=f"SCHED-RETRY-{len(self.retry_events) + 1:03d}",
            original_execution_id=execution.execution_id,
            retry_execution_id=retry.execution_id,
            requested_by=user.user_id,
            actor_snapshot=auth_store.user_snapshot(user.user_id),
            reason=payload.get("reason") or "Retry failed schedule execution",
            request_id=payload.get("requestId"),
            idempotency_key=payload.get("idempotencyKey")
            or f"schedule-retry:{execution.execution_id}:{execution.duplicate_prevention_key}",
            created_at=relative_datetime_iso(),
            duplicate=False,
        )
        self.executions[retry.execution_id] = retry
        self.retry_events[event.retry_event_id] = event
        schedule.last_execution_id = retry.execution_id
        schedule.version += 1
        return {
            "originalExecution": self._execution_view(execution),
            "retryExecution": self._execution_view(retry),
            "retryEvent": self._retry_event_view(event),
            "duplicate": False,
        }

    def process_due_schedules(
        self,
        *,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        process_at: str | None = None,
    ) -> dict[str, Any]:
        self._require_manage(user, auth_store)
        self._assert_hq_scope(user, auth_store)
        now = self._parse_iso(process_at or relative_datetime_iso())
        processed: list[dict[str, Any]] = []
        for schedule in sorted(self.schedules.values(), key=lambda item: item.schedule_id):
            if schedule.status != "ACTIVE" or not schedule.active_rule:
                continue
            next_fire_at = schedule.predicted_next_fire_at or self._predict_next_fire_at(
                schedule.active_rule,
            )
            if self._parse_iso(next_fire_at) > now:
                processed.append(
                    {
                        "scheduleId": schedule.schedule_id,
                        "status": "SKIPPED_NOT_DUE",
                        "nextFireAt": next_fire_at,
                    },
                )
                continue
            period = self._period_for_fire_at(next_fire_at, schedule.active_rule.frequency)
            duplicate_key = self._duplicate_prevention_key(
                schedule=schedule,
                period_start=period["periodStart"],
                period_end=period["periodEnd"],
            )
            duplicate_execution = self._execution_for_duplicate_key(duplicate_key)
            if duplicate_execution:
                processed.append(
                    {
                        "scheduleId": schedule.schedule_id,
                        "status": "DUPLICATE_SKIPPED",
                        "execution": self._execution_view(duplicate_execution),
                        "duplicatePreventionKey": duplicate_key,
                    },
                )
                continue
            processed.append(
                self._execute_schedule(
                    schedule=schedule,
                    user=user,
                    auth_store=auth_store,
                    scheduled_at=next_fire_at,
                    period_start=period["periodStart"],
                    period_end=period["periodEnd"],
                    duplicate_prevention_key=duplicate_key,
                ),
            )
        return {"processed": processed, "processedAt": now.isoformat().replace("+00:00", "Z")}

    def dispatch_now(
        self,
        *,
        schedule_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        self._require_manage(user, auth_store)
        schedule = self._get_schedule(schedule_id)
        self._assert_hq_scope(user, auth_store)
        if schedule.status != "ACTIVE":
            raise AppError(
                code="INVALID_STATE",
                message="Only ACTIVE schedules can be dispatched manually",
                status_code=409,
                details={"scheduleId": schedule_id, "status": schedule.status},
            )
        payload = payload or {}
        idempotency_key = payload.get("idempotencyKey")
        now = relative_datetime_iso()
        period = self._period_for_fire_at(now, schedule.active_rule.frequency)
        duplicate_key = idempotency_key or self._duplicate_prevention_key(
            schedule=schedule,
            period_start=period["periodStart"],
            period_end=period["periodEnd"],
        )
        duplicate_execution = self._execution_for_duplicate_key(duplicate_key)
        if duplicate_execution:
            return {
                "scheduleId": schedule.schedule_id,
                "status": duplicate_execution.status,
                "execution": self._execution_view(duplicate_execution),
                "duplicate": True,
                "cycleId": duplicate_execution.created_cycle_id,
                "duplicatePreventionKey": duplicate_key,
            }
        result = self._execute_schedule(
            schedule=schedule,
            user=user,
            auth_store=auth_store,
            scheduled_at=now,
            period_start=period["periodStart"],
            period_end=period["periodEnd"],
            duplicate_prevention_key=duplicate_key,
            event_type="SCHEDULE_DISPATCH_NOW",
        )
        return {
            "scheduleId": result["scheduleId"],
            "status": result["status"],
            "execution": result["execution"],
            "duplicate": False,
            "cycleId": result["execution"]["createdCycleId"] if result["execution"] else None,
            "duplicatePreventionKey": duplicate_key,
        }

    def _execute_schedule(
        self,
        *,
        schedule: AssessmentScheduleRecord,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        scheduled_at: str,
        period_start: str,
        period_end: str,
        duplicate_prevention_key: str,
        event_type: str = "SCHEDULE_EXECUTED",
    ) -> dict[str, Any]:
        execution = ScheduleExecutionRecord(
            execution_id=f"SCHED-EXEC-AUTO-{len(self.executions) + 1:03d}",
            schedule_id=schedule.schedule_id,
            scheduled_at=scheduled_at,
            started_at=relative_datetime_iso(),
            status="RUNNING",
            target_count=len(schedule.target_org_ids),
            duplicate_prevention_key=duplicate_prevention_key,
            rule_snapshot=self._rule_view(schedule.active_rule),
            target_scope_snapshot=deepcopy(schedule.target_scope_snapshot),
        )
        self.executions[execution.execution_id] = execution
        try:
            guard = self._dispatch_preflight(schedule, user, auth_store)
            version = self._published_template_version(
                schedule.template_id,
                schedule.template_version_id,
            )
            route_summary = self._validate_route_snapshot(version, schedule, auth_store)
            cycle = cycle_store.create_cycle(
                user=user,
                auth_store=auth_store,
                payload={
                    "cycleCode": self._cycle_code_for(schedule.schedule_id, period_start),
                    "cycleName": f"{period_start[:7]} 自动调度考核",
                    "schemeId": schedule.scheme_id,
                    "year": int(period_start[:4]),
                    "periodStart": period_start,
                    "periodEnd": period_end,
                    "targetOrgIds": list(schedule.target_org_ids),
                    "dispatchMode": "SCHEDULED",
                },
                allow_scheduled=True,
            )
            dispatched = cycle_store.dispatch_cycle(
                cycle_id=cycle["cycleId"],
                user=user,
                auth_store=auth_store,
                payload={
                    "targetOrgIds": list(schedule.target_org_ids),
                    "dueDate": relative_date_iso(14),
                    "message": "Scheduled assessment dispatch",
                },
            )
            execution.status = "SUCCEEDED"
            execution.finished_at = relative_datetime_iso()
            execution.cycle_id = dispatched["cycleId"]
            execution.created_cycle_id = dispatched["cycleId"]
            execution.dispatch_event_ids = [
                item["dispatchEventId"] for item in dispatched.get("dispatchEvents", [])
            ]
            execution.generated_task_count = len(dispatched.get("reportingTasks", []))
            execution.guard_result = guard
            execution.scheme_snapshot = deepcopy(dispatched.get("schemeSnapshot", {}))
            execution.workflow_snapshot = {
                "templateVersionId": route_summary["templateVersionId"],
                "snapshotHash": version.snapshot_hash,
                "routeSummary": route_summary,
            }
            schedule.last_execution_id = execution.execution_id
            schedule.predicted_next_fire_at = self._predict_next_fire_at(schedule.active_rule)
            schedule.version += 1
            schedule.audit_events.append(
                {
                    "eventType": event_type,
                    "actorUserId": user.user_id,
                    "executionId": execution.execution_id,
                    "cycleId": execution.created_cycle_id,
                    "duplicatePreventionKey": duplicate_prevention_key,
                    "createdAt": relative_datetime_iso(),
                },
            )
        except AppError as exc:
            execution.status = "FAILED"
            execution.finished_at = relative_datetime_iso()
            execution.error_code = exc.code
            execution.error_message = exc.message
            execution.guard_result = {"status": "FAILED", "retryable": True, "code": exc.code}
            schedule.last_execution_id = execution.execution_id
        return {
            "scheduleId": schedule.schedule_id,
            "status": execution.status,
            "execution": self._execution_view(execution),
            "duplicatePreventionKey": duplicate_prevention_key,
        }

    def _dispatch_preflight(
        self,
        schedule: AssessmentScheduleRecord,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        scheme = scheme_store.active_scheme_snapshot(schedule.scheme_id)
        cycle_store._require_dispatch(user, auth_store)
        cycle_store._validate_target_orgs(schedule.target_org_ids, user, auth_store)
        cycle_store._validate_scheme_targets(scheme["schemeSnapshot"], schedule.target_org_ids)
        return {
            "status": "PASS",
            "guard": "P1_ASSESSMENT_CYCLE_DISPATCH_GUARD",
            "schemeId": schedule.scheme_id,
            "targetOrgIds": list(schedule.target_org_ids),
            "targetCount": len(schedule.target_org_ids),
        }

    def _validate_route_snapshot(
        self,
        version: WorkflowTemplateVersionSnapshot,
        schedule: AssessmentScheduleRecord,
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        evaluator = RouteChainEvaluator()
        assignments = []
        for target_org_id in schedule.target_org_ids:
            org = auth_store.orgs.get(target_org_id)
            business_line = (
                org.business_line_ids[0]
                if org and org.business_line_ids
                else "BL-WEALTH"
            )
            assignments.append(
                evaluator.resolve_initial_assignment(
                    template_version=version,
                    target_org_id=target_org_id,
                    business_line=business_line,
                ),
            )
        assignment = assignments[0]
        return {
            "templateVersionId": assignment.template_version_id,
            "routeChainId": assignment.route_chain_id,
            "firstNodeId": assignment.current_node_id,
            "approverCount": len(assignment.approvers),
            "targetCount": len(assignments),
        }

    def _published_template_version(
        self,
        template_id: str,
        template_version_id: str | None,
    ) -> WorkflowTemplateVersionSnapshot:
        candidates = [
            version
            for version in workflow_template_store.versions.values()
            if version.template_id == template_id and version.status == "PUBLISHED"
        ]
        if template_version_id:
            candidates = [
                version
                for version in candidates
                if version.template_version_id == template_version_id
            ]
        if not candidates:
            raise AppError(
                code="SCHEDULE_ROUTE_TEMPLATE_NOT_PUBLISHED",
                message="Schedule activation requires a published workflow template snapshot",
                status_code=409,
                details={"templateId": template_id, "templateVersionId": template_version_id},
            )
        selected = sorted(candidates, key=lambda item: item.version_no)[-1]
        return WorkflowTemplateVersionSnapshot.model_validate(
            {
                "templateVersionId": selected.template_version_id,
                "templateId": selected.template_id,
                "versionNo": selected.version_no,
                "status": selected.status,
                "snapshot": selected.snapshot_json,
                "snapshotHash": selected.snapshot_hash,
                "targetScopeSnapshot": selected.target_scope_snapshot,
                "publishedAt": selected.published_at,
            },
        )

    def _prediction_for(self, schedule: AssessmentScheduleRecord) -> dict[str, Any]:
        rule = (
            schedule.active_rule
            if schedule.status == "ACTIVE" and schedule.active_rule
            else schedule.draft_rule
        )
        next_fire_at = self._predict_next_fire_at(rule)
        return {
            "nextFireAt": next_fire_at,
            "calendarPolicy": rule.calendar_code,
            "timezone": rule.timezone,
            "workingDayOffset": rule.working_day_offset,
            "serverComputed": True,
        }

    def _predict_next_fire_at(self, rule: ScheduleRuleRecord) -> str:
        base = relative_date(1)
        period_start = self._next_period_start(base, rule.frequency)
        fire_date = self._nth_weekday(period_start, rule.working_day_offset)
        hour, minute = [int(part) for part in rule.fire_time.split(":", 1)]
        return datetime.combine(fire_date, time(hour, minute, tzinfo=UTC)).isoformat().replace(
            "+00:00",
            "Z",
        )

    @staticmethod
    def _parse_iso(raw: str) -> datetime:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=UTC)
        return parsed

    def _period_for_fire_at(self, fire_at: str, frequency: str) -> dict[str, str]:
        fire_date = self._parse_iso(fire_at).date()
        if frequency == "MONTHLY":
            start = fire_date.replace(day=1)
            end = self._add_months(start, 1) - timedelta(days=1)
        elif frequency == "QUARTERLY":
            month = ((fire_date.month - 1) // 3) * 3 + 1
            start = date(fire_date.year, month, 1)
            end = self._add_months(start, 3) - timedelta(days=1)
        elif frequency == "HALF_YEARLY":
            month = 1 if fire_date.month <= 6 else 7
            start = date(fire_date.year, month, 1)
            end = self._add_months(start, 6) - timedelta(days=1)
        elif frequency == "YEARLY":
            start = date(fire_date.year, 1, 1)
            end = date(fire_date.year, 12, 31)
        else:
            raise AppError(
                code="VALIDATION_ERROR",
                message="Unsupported schedule frequency",
                status_code=422,
                details={"frequency": frequency},
            )
        return {"periodStart": start.isoformat(), "periodEnd": end.isoformat()}

    @staticmethod
    def _add_months(value: date, months: int) -> date:
        month = value.month + months
        year = value.year
        while month > 12:
            year += 1
            month -= 12
        return date(year, month, 1)

    @staticmethod
    def _cycle_code_for(schedule_id: str, period_start: str) -> str:
        suffix = hashlib.sha1(f"{schedule_id}:{period_start}".encode()).hexdigest()[:8]
        return f"WLZQ-SCHED-{period_start[:7]}-{suffix}".upper()

    @staticmethod
    def _duplicate_prevention_key(
        *,
        schedule: AssessmentScheduleRecord,
        period_start: str,
        period_end: str,
    ) -> str:
        targets = ",".join(sorted(schedule.target_org_ids))
        digest = hashlib.sha1(targets.encode()).hexdigest()[:12]
        return (
            f"schedule:{schedule.schedule_id}:period:{period_start}:{period_end}:"
            f"targets:{digest}"
        )

    def _execution_for_duplicate_key(
        self,
        duplicate_prevention_key: str,
    ) -> ScheduleExecutionRecord | None:
        for execution in self.executions.values():
            if (
                execution.duplicate_prevention_key == duplicate_prevention_key
                and execution.status in {"QUEUED", "RUNNING", "SUCCEEDED", "RETRY_REQUESTED"}
            ):
                return execution
        return None

    @staticmethod
    def _next_period_start(base: date, frequency: str) -> date:
        month = base.month
        year = base.year
        if frequency == "MONTHLY":
            month += 1
        elif frequency == "QUARTERLY":
            month = ((month - 1) // 3 + 1) * 3 + 1
        elif frequency == "HALF_YEARLY":
            month = 7 if month <= 6 else 13
        elif frequency == "YEARLY":
            year += 1
            month = 1
        else:
            raise AppError(
                code="VALIDATION_ERROR",
                message="Unsupported schedule frequency",
                status_code=422,
                details={"frequency": frequency},
            )
        while month > 12:
            year += 1
            month -= 12
        return date(year, month, 1)

    @staticmethod
    def _nth_weekday(period_start: date, offset: int) -> date:
        if offset < 1 or offset > 23:
            raise AppError(
                code="VALIDATION_ERROR",
                message="workingDayOffset must be between 1 and 23 for weekday-only calendar",
                status_code=422,
            )
        cursor = period_start
        seen = 0
        while True:
            if cursor.weekday() < 5:
                seen += 1
                if seen == offset:
                    return cursor
            cursor += timedelta(days=1)

    def _rule_from_payload(self, rule_id: str, payload: dict[str, Any]) -> ScheduleRuleRecord:
        frequency = payload.get("frequency", "QUARTERLY")
        working_day_offset = int(payload.get("workingDayOffset", 5))
        fire_time = payload.get("fireTime", "10:00")
        try:
            hour, minute = [int(part) for part in fire_time.split(":", 1)]
        except (AttributeError, ValueError) as exc:
            raise AppError(
                code="VALIDATION_ERROR",
                message="fireTime must be HH:mm",
                status_code=422,
            ) from exc
        if hour < 0 or hour > 23 or minute < 0 or minute > 59:
            raise AppError(
                code="VALIDATION_ERROR",
                message="fireTime must be HH:mm",
                status_code=422,
            )
        timezone = payload.get("timezone", "Asia/Shanghai")
        if timezone != "Asia/Shanghai":
            raise AppError(
                code="VALIDATION_ERROR",
                message="Unsupported schedule timezone",
                status_code=422,
                details={"timezone": timezone},
            )
        calendar_code = payload.get("calendarCode", "WEEKDAY_ONLY")
        if calendar_code != "WEEKDAY_ONLY":
            raise AppError(
                code="VALIDATION_ERROR",
                message="Unsupported schedule calendarCode",
                status_code=422,
                details={"calendarCode": calendar_code},
            )
        valid_from = payload.get("validFrom")
        valid_until = payload.get("validUntil")
        try:
            valid_from_date = date.fromisoformat(valid_from) if valid_from else None
            valid_until_date = date.fromisoformat(valid_until) if valid_until else None
        except ValueError as exc:
            raise AppError(
                code="VALIDATION_ERROR",
                message="validFrom and validUntil must be ISO dates",
                status_code=422,
            ) from exc
        if valid_from_date and valid_until_date and valid_from_date > valid_until_date:
            raise AppError(
                code="VALIDATION_ERROR",
                message="validFrom must be before or equal to validUntil",
                status_code=422,
            )
        self._nth_weekday(relative_date(1).replace(day=1), working_day_offset)
        return ScheduleRuleRecord(
            rule_id=rule_id,
            frequency=frequency,
            working_day_offset=working_day_offset,
            fire_time=fire_time,
            timezone=timezone,
            calendar_code=calendar_code,
            valid_from=valid_from,
            valid_until=valid_until,
        )

    def _seed_default_records(self) -> None:
        draft_rule = ScheduleRuleRecord(
            rule_id="ASCHED-DRAFT-001-RULE-DRAFT",
            frequency="QUARTERLY",
            working_day_offset=5,
            fire_time="10:00",
            timezone="Asia/Shanghai",
            valid_from=relative_date_iso(0),
        )
        active_rule = ScheduleRuleRecord(
            rule_id="ASCHED-ACTIVE-001-RULE-ACTIVE",
            frequency="MONTHLY",
            working_day_offset=3,
            fire_time="09:00",
            timezone="Asia/Shanghai",
            valid_from=relative_date_iso(-30),
        )
        target_scope = [
            {
                "scopeMode": "MANUAL_SELECTION",
                "targetOrgIds": ["WLZQ-RBC-GZ-NANSHA"],
                "source": "p1_scheme_snapshot",
            },
        ]
        self.schedules[DEFAULT_SCHEDULE_ID] = AssessmentScheduleRecord(
            schedule_id=DEFAULT_SCHEDULE_ID,
            scheme_id="ASCH-SEED-2026",
            template_id="WFT-ASSESS-DEFAULT",
            template_version_id=None,
            snapshot_hash=None,
            dispatch_mode="SCHEDULED",
            status="DRAFT",
            draft_rule=draft_rule,
            active_rule=None,
            target_org_ids=["WLZQ-RBC-GZ-NANSHA"],
            target_scope_snapshot=target_scope,
            predicted_next_fire_at=self._predict_next_fire_at(draft_rule),
            last_execution_id=None,
            created_by_ref="SYSTEM-SEED",
            updated_by_ref="SYSTEM-SEED",
        )
        self.schedules[ACTIVE_SCHEDULE_ID] = AssessmentScheduleRecord(
            schedule_id=ACTIVE_SCHEDULE_ID,
            scheme_id="ASCH-SEED-2026",
            template_id="WFT-ASSESS-DEFAULT",
            template_version_id="WFT-ASSESS-DEFAULT-V001",
            snapshot_hash="seeded_pending_publish",
            dispatch_mode="SCHEDULED",
            status="ACTIVE",
            draft_rule=deepcopy(active_rule),
            active_rule=active_rule,
            target_org_ids=["WLZQ-RBC-GZ-NANSHA"],
            target_scope_snapshot=target_scope,
            predicted_next_fire_at=relative_datetime_iso(-1, hour=9),
            last_execution_id=FAILED_EXECUTION_ID,
            created_by_ref="SYSTEM-SEED",
            updated_by_ref="SYSTEM-SEED",
        )
        self.executions["SCHED-EXEC-SUCCESS-001"] = ScheduleExecutionRecord(
            execution_id="SCHED-EXEC-SUCCESS-001",
            schedule_id=ACTIVE_SCHEDULE_ID,
            scheduled_at=relative_datetime_iso(-7, hour=9),
            started_at=relative_datetime_iso(-7, hour=9),
            finished_at=relative_datetime_iso(-7, hour=9, minute=10),
            status="SUCCEEDED",
            cycle_id="ACYC-SCHED-FIXTURE-001",
            target_count=1,
            created_cycle_id="ACYC-SCHED-FIXTURE-001",
            dispatch_event_ids=["ACYC-SCHED-FIXTURE-001-EVENT-001"],
            generated_task_count=1,
            duplicate_prevention_key="schedule:ASCHED-ACTIVE-001:success-fixture",
            guard_result={"status": "PASS", "guard": "P1_ASSESSMENT_CYCLE_DISPATCH_GUARD"},
            rule_snapshot=self._rule_view(active_rule),
            target_scope_snapshot=target_scope,
        )
        self.executions[FAILED_EXECUTION_ID] = ScheduleExecutionRecord(
            execution_id=FAILED_EXECUTION_ID,
            schedule_id=ACTIVE_SCHEDULE_ID,
            scheduled_at=relative_datetime_iso(-1, hour=9),
            started_at=relative_datetime_iso(-1, hour=9),
            finished_at=relative_datetime_iso(-1, hour=9, minute=1),
            status="FAILED",
            target_count=1,
            error_code="P1_DISPATCH_GUARD_PRECHECK_FAILED",
            error_message="Controlled fixture failure before P1 dispatch artifact creation.",
            duplicate_prevention_key="schedule:ASCHED-ACTIVE-001:failed-fixture",
            guard_result={
                "status": "FAILED",
                "guard": "P1_ASSESSMENT_CYCLE_DISPATCH_GUARD",
                "retryable": True,
            },
            rule_snapshot=self._rule_view(active_rule),
            target_scope_snapshot=target_scope,
        )

    def _schedule_view(
        self,
        schedule: AssessmentScheduleRecord,
        *,
        prediction: dict[str, Any],
    ) -> dict[str, Any]:
        latest = self.executions.get(schedule.last_execution_id or "")
        return {
            "scheduleId": schedule.schedule_id,
            "schemeId": schedule.scheme_id,
            "templateId": schedule.template_id,
            "templateVersionId": schedule.template_version_id,
            "snapshotHash": schedule.snapshot_hash,
            "dispatchMode": schedule.dispatch_mode,
            "status": schedule.status,
            "draftRule": self._rule_view(schedule.draft_rule),
            "activeRule": self._rule_view(schedule.active_rule) if schedule.active_rule else None,
            "targetOrgIds": list(schedule.target_org_ids),
            "targetScopeSnapshot": deepcopy(schedule.target_scope_snapshot),
            "predictedNextFireAt": prediction["nextFireAt"],
            "prediction": prediction,
            "eligibility": {
                "status": "PASS" if schedule.status in {"DRAFT", "ACTIVE"} else "BLOCKED",
                "guards": ["P1_ASSESSMENT_CYCLE_DISPATCH_GUARD", "P2_WORKFLOW_TEMPLATE_SNAPSHOT"],
            },
            "latestExecution": self._execution_view(latest) if latest else None,
            "version": schedule.version,
            "auditSummary": {
                "eventCount": len(schedule.audit_events),
                "lastEventType": (
                    schedule.audit_events[-1]["eventType"] if schedule.audit_events else None
                ),
            },
        }

    @staticmethod
    def _rule_view(rule: ScheduleRuleRecord | None) -> dict[str, Any]:
        if rule is None:
            return {}
        return {
            "ruleId": rule.rule_id,
            "frequency": rule.frequency,
            "workingDayOffset": rule.working_day_offset,
            "fireTime": rule.fire_time,
            "timezone": rule.timezone,
            "calendarCode": rule.calendar_code,
            "validFrom": rule.valid_from,
            "validUntil": rule.valid_until,
        }

    def _execution_view(self, execution: ScheduleExecutionRecord | None) -> dict[str, Any] | None:
        if execution is None:
            return None
        return {
            "executionId": execution.execution_id,
            "scheduleId": execution.schedule_id,
            "scheduledAt": execution.scheduled_at,
            "startedAt": execution.started_at,
            "finishedAt": execution.finished_at,
            "status": execution.status,
            "cycleId": execution.cycle_id,
            "retryOfExecutionId": execution.retry_of_execution_id,
            "targetCount": execution.target_count,
            "createdCycleId": execution.created_cycle_id,
            "dispatchEventIds": list(execution.dispatch_event_ids),
            "generatedTaskCount": execution.generated_task_count,
            "errorCode": execution.error_code,
            "errorMessage": execution.error_message,
            "guardResult": deepcopy(execution.guard_result),
            "duplicatePreventionKey": execution.duplicate_prevention_key,
        }

    @staticmethod
    def _retry_event_view(event: ScheduleRetryEventRecord) -> dict[str, Any]:
        return {
            "retryEventId": event.retry_event_id,
            "originalExecutionId": event.original_execution_id,
            "retryExecutionId": event.retry_execution_id,
            "requestedBy": event.requested_by,
            "actorSnapshot": deepcopy(event.actor_snapshot),
            "reason": event.reason,
            "requestId": event.request_id,
            "idempotencyKey": event.idempotency_key,
            "createdAt": event.created_at,
            "duplicate": event.duplicate,
            "failureDetails": deepcopy(event.failure_details),
        }

    @staticmethod
    def _require_read(user: AuthUserRecord, auth_store: SeedAuthStore) -> None:
        auth_store.require_permission(user, "PERM-P2-ASSESSMENT-SCHEDULE-READ")

    @staticmethod
    def _require_manage(user: AuthUserRecord, auth_store: SeedAuthStore) -> None:
        auth_store.require_permission(user, "PERM-P2-ASSESSMENT-SCHEDULE-MANAGE")

    @staticmethod
    def _require_retry(user: AuthUserRecord, auth_store: SeedAuthStore) -> None:
        auth_store.require_permission(user, "PERM-P2-ASSESSMENT-SCHEDULE-RETRY")

    @staticmethod
    def _assert_hq_scope(user: AuthUserRecord, auth_store: SeedAuthStore) -> None:
        if auth_store.primary_data_scope_for_roles(user.role_ids) != "all":
            raise ForbiddenError("HQ scheduler APIs require all data scope")

    def _retry_event_for_execution(self, execution_id: str) -> ScheduleRetryEventRecord | None:
        return next(
            (
                event
                for event in self.retry_events.values()
                if event.original_execution_id == execution_id and event.retry_execution_id
            ),
            None,
        )

    def _get_schedule(self, schedule_id: str) -> AssessmentScheduleRecord:
        schedule = self.schedules.get(schedule_id)
        if not schedule:
            raise NotFoundError("Assessment schedule not found")
        return schedule

    def _get_execution(self, execution_id: str) -> ScheduleExecutionRecord:
        execution = self.executions.get(execution_id)
        if not execution:
            raise NotFoundError("Schedule execution not found")
        return execution


assessment_scheduler_store = SeedAssessmentSchedulerStore()
