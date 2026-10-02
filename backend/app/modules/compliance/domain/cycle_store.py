from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.modules.compliance.core.errors import AppError, ForbiddenError, NotFoundError
from app.modules.compliance.domain.auth_store import AuthUserRecord, SeedAuthStore
from app.modules.compliance.domain.dictionaries import validate_codes
from app.modules.compliance.domain.scheme_store import scheme_store
from app.modules.compliance.domain.seed_time import relative_date_iso, relative_datetime_iso
from app.modules.compliance.domain.task_store import (
    UnifiedTaskActionTargetRecord,
    UnifiedTaskRecord,
    task_store,
)


@dataclass
class CycleTargetRecord:
    cycle_target_id: str
    cycle_id: str
    org_id: str
    org_snapshot: dict[str, Any]
    target_status: str = "PENDING_DISPATCH"
    reporting_task_id: str | None = None
    review_task_id: str | None = None
    review_status: str | None = None
    result_id: str | None = None


@dataclass
class ReportingTaskRecord:
    reporting_task_id: str
    cycle_id: str
    cycle_target_id: str
    target_org_id: str
    unified_task_id: str
    status: str
    due_date: str


@dataclass
class DispatchEventRecord:
    dispatch_event_id: str
    cycle_id: str
    event_type: str
    target_org_ids: list[str]
    message: str
    created_by_ref: str
    event_created_at: str


@dataclass
class AssessmentCycleRecord:
    cycle_id: str
    cycle_code: str
    cycle_name: str
    scheme_id: str
    scheme_snapshot: dict[str, Any]
    year: int
    period_start: str
    period_end: str
    status: str
    dispatch_mode: str
    selected_target_org_ids: list[str]
    created_by_ref: str
    created_at: str
    dispatched_by_ref: str | None = None
    dispatched_at_ref: str | None = None
    closed_at_ref: str | None = None
    archived_reason: str | None = None
    targets: dict[str, CycleTargetRecord] = field(default_factory=dict)
    reporting_tasks: dict[str, ReportingTaskRecord] = field(default_factory=dict)
    dispatch_events: list[DispatchEventRecord] = field(default_factory=list)


class SeedCycleStore:
    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self.cycles: dict[str, AssessmentCycleRecord] = {}

    def cycle_page(
        self,
        *,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        status: str | None = None,
        scheme_id: str | None = None,
        year: int | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        self._require_read(user, auth_store)
        validate_codes((status, "assessment_cycle_rollup_status", "status"))
        records = [
            cycle
            for cycle in self.cycles.values()
            if self._can_read_cycle(cycle, user, auth_store)
            and (status is None or cycle.status == status)
            and (scheme_id is None or cycle.scheme_id == scheme_id)
            and (year is None or cycle.year == year)
        ]
        records.sort(key=lambda item: (item.year, item.cycle_code), reverse=True)
        start = (page - 1) * page_size
        end = start + page_size
        return {
            "items": [self.cycle_summary(cycle) for cycle in records[start:end]],
            "page": page,
            "pageSize": page_size,
            "total": len(records),
        }

    def create_cycle(
        self,
        *,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        payload: dict[str, Any],
        allow_scheduled: bool = False,
    ) -> dict[str, Any]:
        self._require_dispatch(user, auth_store)
        dispatch_mode = payload.get("dispatchMode", "MANUAL")
        validate_codes(
            (
                dispatch_mode,
                "assessment_dispatch_mode",
                "dispatchMode",
            ),
        )
        if dispatch_mode != "MANUAL" and not allow_scheduled:
            raise AppError(
                code="VALIDATION_ERROR",
                message="Only MANUAL dispatch is active in first P1",
                status_code=422,
            )
        scheme = scheme_store.active_scheme_snapshot(payload["schemeId"])
        target_org_ids = list(dict.fromkeys(payload.get("targetOrgIds") or []))
        self._validate_target_orgs(target_org_ids, user, auth_store)
        self._validate_scheme_targets(scheme["schemeSnapshot"], target_org_ids)
        cycle_id = f"ACYC-{len(self.cycles) + 1:04d}"
        cycle_code = payload.get("cycleCode") or f"WLZQ-ACYC-{len(self.cycles) + 1:04d}"
        if any(item.cycle_code == cycle_code for item in self.cycles.values()):
            raise AppError(code="DUPLICATE_CYCLE_CODE", message="周期编码已存在", status_code=409)
        cycle = AssessmentCycleRecord(
            cycle_id=cycle_id,
            cycle_code=cycle_code,
            cycle_name=payload["cycleName"],
            scheme_id=payload["schemeId"],
            scheme_snapshot=scheme["schemeSnapshot"],
            year=payload["year"],
            period_start=payload["periodStart"],
            period_end=payload["periodEnd"],
            status="DRAFT",
            dispatch_mode=dispatch_mode,
            selected_target_org_ids=target_org_ids,
            created_by_ref=user.user_id,
            created_at=relative_datetime_iso(),
        )
        self._recompute_rollup(cycle)
        self.cycles[cycle_id] = cycle
        return self.cycle_detail(cycle)

    def cycle_detail_for_user(
        self,
        *,
        cycle_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        self._require_read(user, auth_store)
        cycle = self._get_cycle(cycle_id)
        if not self._can_read_cycle(cycle, user, auth_store):
            raise ForbiddenError()
        return self.cycle_detail(cycle)

    def dispatch_cycle(
        self,
        *,
        cycle_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        self._require_dispatch(user, auth_store)
        cycle = self._get_cycle(cycle_id)
        if cycle.targets:
            raise AppError(
                code="INVALID_STATE",
                message="Cycle has already been dispatched",
                status_code=409,
            )
        target_org_ids = list(
            dict.fromkeys(payload.get("targetOrgIds") or cycle.selected_target_org_ids),
        )
        if not target_org_ids:
            raise AppError(
                code="VALIDATION_ERROR",
                message="Dispatch requires targetOrgIds",
                status_code=422,
            )
        self._validate_target_orgs(target_org_ids, user, auth_store)
        self._validate_scheme_targets(cycle.scheme_snapshot, target_org_ids)
        due_date = payload.get("dueDate") or relative_date_iso(14)
        for index, org_id in enumerate(target_org_ids, start=1):
            target_id = f"{cycle.cycle_id}-TARGET-{index:03d}"
            reporting_task_id = f"{cycle.cycle_id}-REPORT-{index:03d}"
            unified_task_id = f"TASK-ASSESS-{cycle.cycle_id}-{index:03d}"
            target = CycleTargetRecord(
                cycle_target_id=target_id,
                cycle_id=cycle.cycle_id,
                org_id=org_id,
                org_snapshot=auth_store.org_snapshot(org_id),
                target_status="TASK_CREATED",
                reporting_task_id=reporting_task_id,
            )
            cycle.targets[target_id] = target
            cycle.reporting_tasks[reporting_task_id] = ReportingTaskRecord(
                reporting_task_id=reporting_task_id,
                cycle_id=cycle.cycle_id,
                cycle_target_id=target_id,
                target_org_id=org_id,
                unified_task_id=unified_task_id,
                status="NOT_STARTED",
                due_date=due_date,
            )
            task_store.upsert_task(
                UnifiedTaskRecord(
                    task_id=unified_task_id,
                    category="ASSESSMENT",
                    action_type="SUBMIT",
                    title=f"{cycle.cycle_name} 填报任务",
                    description="Branch assessment reporting task generated by manual dispatch.",
                    priority="HIGH",
                    due_date=due_date,
                    status="PENDING",
                    source_id=reporting_task_id,
                    scope="branch",
                    scoped_org_id=org_id,
                    assigned_user_id=None,
                    project_id=cycle.cycle_id,
                    created_at=relative_datetime_iso(),
                    action_target=UnifiedTaskActionTargetRecord(
                        kind="route",
                        menu_id="branch-reporting",
                        app_path="/branch/assessment/reporting",
                        public_path="/compliance/branch/assessment/reporting",
                        params={
                            "cycleId": cycle.cycle_id,
                            "cycleTargetId": target_id,
                            "reportingTaskId": reporting_task_id,
                            "targetOrgId": org_id,
                        },
                        action="ASSESSMENT_REPORTING_OPEN",
                    ),
                ),
            )
        cycle.selected_target_org_ids = target_org_ids
        cycle.dispatched_by_ref = user.user_id
        cycle.dispatched_at_ref = relative_datetime_iso()
        self._append_event(
            cycle,
            event_type="DISPATCHED",
            target_org_ids=target_org_ids,
            message=payload.get("message", "Manual dispatch"),
            user_id=user.user_id,
        )
        self._recompute_rollup(cycle)
        return self.cycle_detail(cycle)

    def send_reminder(
        self,
        *,
        cycle_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        self._require_dispatch(user, auth_store)
        cycle = self._get_cycle(cycle_id)
        if not cycle.targets:
            raise AppError(
                code="INVALID_STATE",
                message="Cycle must be dispatched before reminders can be sent",
                status_code=409,
                details={"cycleId": cycle_id, "status": cycle.status},
            )
        target_org_ids = list(
            dict.fromkeys(
                payload.get("targetOrgIds") or [target.org_id for target in cycle.targets.values()],
            ),
        )
        if not target_org_ids:
            raise AppError(
                code="VALIDATION_ERROR",
                message="Reminder requires targetOrgIds",
                status_code=422,
            )
        cycle_target_org_ids = {target.org_id for target in cycle.targets.values()}
        invalid_target_org_ids = [
            org_id for org_id in target_org_ids if org_id not in cycle_target_org_ids
        ]
        if invalid_target_org_ids:
            raise AppError(
                code="VALIDATION_ERROR",
                message="Reminder target org must belong to dispatched cycle targets",
                status_code=422,
                details={"orgIds": invalid_target_org_ids},
            )
        self._validate_target_orgs(target_org_ids, user, auth_store)
        self._append_event(
            cycle,
            event_type="REMINDER_SENT",
            target_org_ids=target_org_ids,
            message=payload.get("message", ""),
            user_id=user.user_id,
        )
        return self.cycle_detail(cycle)

    def publish_results(
        self,
        *,
        cycle_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        self._require_result_hq(user, auth_store)
        cycle = self._get_cycle(cycle_id)
        raise AppError(
            code="INVALID_STATE",
            message="Result publication requires approved reviews in later packets",
            status_code=409,
            details={"cycleId": cycle.cycle_id, "status": cycle.status},
        )

    def archive_cycle(
        self,
        *,
        cycle_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        reason: str,
    ) -> dict[str, Any]:
        self._require_dispatch(user, auth_store)
        cycle = self._get_cycle(cycle_id)
        if cycle.status != "CLOSED":
            raise AppError(
                code="INVALID_TRANSITION",
                message="Only CLOSED cycles can be archived",
                status_code=409,
                details={"cycleId": cycle_id, "status": cycle.status},
            )
        cycle.status = "ARCHIVED"
        cycle.archived_reason = reason
        return self.cycle_detail(cycle)

    def cycle_summary(self, cycle: AssessmentCycleRecord) -> dict[str, Any]:
        return {
            "cycleId": cycle.cycle_id,
            "cycleCode": cycle.cycle_code,
            "cycleName": cycle.cycle_name,
            "schemeId": cycle.scheme_id,
            "year": cycle.year,
            "periodStart": cycle.period_start,
            "periodEnd": cycle.period_end,
            "status": cycle.status,
            "dispatchMode": cycle.dispatch_mode,
            "targetCount": len(cycle.targets),
            "selectedTargetCount": len(cycle.selected_target_org_ids),
            "dispatchedAtRef": cycle.dispatched_at_ref,
        }

    def cycle_detail(self, cycle: AssessmentCycleRecord) -> dict[str, Any]:
        return {
            **self.cycle_summary(cycle),
            "schemeSnapshot": cycle.scheme_snapshot,
            "selectedTargetOrgIds": cycle.selected_target_org_ids,
            "createdByRef": cycle.created_by_ref,
            "createdAt": cycle.created_at,
            "dispatchedByRef": cycle.dispatched_by_ref,
            "closedAtRef": cycle.closed_at_ref,
            "archivedReason": cycle.archived_reason,
            "targets": [self._target_view(target) for target in cycle.targets.values()],
            "reportingTasks": [
                self._reporting_task_view(task) for task in cycle.reporting_tasks.values()
            ],
            "dispatchEvents": [self._event_view(event) for event in cycle.dispatch_events],
        }

    def _append_event(
        self,
        cycle: AssessmentCycleRecord,
        *,
        event_type: str,
        target_org_ids: list[str],
        message: str,
        user_id: str,
    ) -> None:
        event = DispatchEventRecord(
            dispatch_event_id=f"{cycle.cycle_id}-EVENT-{len(cycle.dispatch_events) + 1:03d}",
            cycle_id=cycle.cycle_id,
            event_type=event_type,
            target_org_ids=target_org_ids,
            message=message,
            created_by_ref=user_id,
            event_created_at=relative_datetime_iso(),
        )
        cycle.dispatch_events.append(event)

    @staticmethod
    def _recompute_rollup(cycle: AssessmentCycleRecord) -> None:
        if cycle.status == "ARCHIVED":
            return
        statuses = {target.target_status for target in cycle.targets.values()}
        if not statuses:
            cycle.status = "DRAFT"
        elif statuses <= {"PENDING_DISPATCH", "TASK_CREATED"}:
            cycle.status = "DISPATCHED"
        elif statuses & {"REPORTING", "SUBMITTED"}:
            cycle.status = "REPORTING"
        elif "UNDER_REVIEW" in statuses:
            cycle.status = "REVIEWING"
        elif "APPEALED" in statuses:
            cycle.status = "APPEALING"
        elif "RESULT_PENDING_CONFIRMATION" in statuses:
            cycle.status = "RESULT_CONFIRMING"
        elif statuses == {"CLOSED"}:
            cycle.status = "CLOSED"

    def _validate_target_orgs(
        self,
        org_ids: list[str],
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> None:
        if not org_ids:
            raise AppError(
                code="VALIDATION_ERROR",
                message="targetOrgIds are required",
                status_code=422,
            )
        missing = [org_id for org_id in org_ids if org_id not in auth_store.orgs]
        if missing:
            raise AppError(
                code="VALIDATION_ERROR",
                message="Target org not found",
                status_code=422,
                details={"orgIds": missing},
            )
        data_scope = auth_store.primary_data_scope_for_roles(user.role_ids)
        out_of_scope = [
            org_id
            for org_id in org_ids
            if data_scope != "all" and not auth_store.org_in_scope(user, org_id)
        ]
        if out_of_scope:
            raise ForbiddenError("Target org is outside user data scope")

    @staticmethod
    def _validate_scheme_targets(
        scheme_snapshot: dict[str, Any],
        target_org_ids: list[str],
    ) -> None:
        groups = scheme_snapshot.get("targetGroups", [])
        has_all_branches = any(
            group.get("scopeMode") == "ALL_BRANCHES" for group in groups
        )
        if has_all_branches:
            return
        manual_member_org_ids = {
            member.get("orgId")
            for group in groups
            if group.get("scopeMode") == "MANUAL_SELECTION"
            for member in group.get("members", [])
        }
        if not manual_member_org_ids:
            raise AppError(
                code="VALIDATION_ERROR",
                message="Scheme snapshot must define manual target members",
                status_code=422,
                details={"schemeId": scheme_snapshot.get("schemeId")},
            )
        outside_scheme = [
            org_id for org_id in target_org_ids if org_id not in manual_member_org_ids
        ]
        if outside_scheme:
            raise AppError(
                code="VALIDATION_ERROR",
                message="Target org is outside scheme target scope",
                status_code=422,
                details={"orgIds": outside_scheme},
            )

    @staticmethod
    def _can_read_cycle(
        cycle: AssessmentCycleRecord,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> bool:
        if auth_store.has_permission(user, "PERM-P1-ASSESSMENT-CYCLE-DISPATCH"):
            return True
        if not auth_store.has_permission(user, "PERM-P1-ASSESSMENT-CYCLE-READ"):
            return False
        return task_store.has_visible_project_task(
            project_id=cycle.cycle_id,
            user=user,
            auth_store=auth_store,
        )

    def _get_cycle(self, cycle_id: str) -> AssessmentCycleRecord:
        cycle = self.cycles.get(cycle_id)
        if not cycle:
            raise NotFoundError("Assessment cycle not found")
        return cycle

    @staticmethod
    def _target_view(target: CycleTargetRecord) -> dict[str, Any]:
        return {
            "cycleTargetId": target.cycle_target_id,
            "cycleId": target.cycle_id,
            "orgId": target.org_id,
            "orgSnapshot": target.org_snapshot,
            "targetStatus": target.target_status,
            "reportingTaskId": target.reporting_task_id,
            "reviewTaskId": target.review_task_id,
            "reviewStatus": target.review_status,
            "resultId": target.result_id,
        }

    @staticmethod
    def _reporting_task_view(task: ReportingTaskRecord) -> dict[str, Any]:
        return {
            "reportingTaskId": task.reporting_task_id,
            "cycleId": task.cycle_id,
            "cycleTargetId": task.cycle_target_id,
            "targetOrgId": task.target_org_id,
            "unifiedTaskId": task.unified_task_id,
            "status": task.status,
            "dueDate": task.due_date,
        }

    @staticmethod
    def _event_view(event: DispatchEventRecord) -> dict[str, Any]:
        return {
            "dispatchEventId": event.dispatch_event_id,
            "cycleId": event.cycle_id,
            "eventType": event.event_type,
            "targetOrgIds": event.target_org_ids,
            "message": event.message,
            "createdByRef": event.created_by_ref,
            "eventCreatedAt": event.event_created_at,
        }

    @staticmethod
    def _require_read(user: AuthUserRecord, auth_store: SeedAuthStore) -> None:
        if auth_store.has_permission(
            user,
            "PERM-P1-ASSESSMENT-CYCLE-READ",
        ) or auth_store.has_permission(
            user,
            "PERM-P1-ASSESSMENT-CYCLE-DISPATCH",
        ):
            return
        raise ForbiddenError()

    @staticmethod
    def _require_dispatch(user: AuthUserRecord, auth_store: SeedAuthStore) -> None:
        auth_store.require_permission(user, "PERM-P1-ASSESSMENT-CYCLE-DISPATCH")

    @staticmethod
    def _require_result_hq(user: AuthUserRecord, auth_store: SeedAuthStore) -> None:
        auth_store.require_permission(user, "PERM-P1-ASSESSMENT-RESULT-HQ")


cycle_store = SeedCycleStore()
