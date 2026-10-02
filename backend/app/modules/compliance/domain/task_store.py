from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.modules.compliance.core.errors import AppError, ForbiddenError
from app.modules.compliance.domain.auth_store import AuthUserRecord, SeedAuthStore
from app.modules.compliance.domain.dictionaries import validate_code, validate_codes
from app.modules.compliance.domain.seed_time import relative_date_iso, relative_datetime_iso


@dataclass
class UnifiedTaskActionTargetRecord:
    kind: str
    menu_id: str
    app_path: str
    public_path: str
    params: dict[str, str] = field(default_factory=dict)
    action: str = ""
    supported: bool = True


@dataclass
class UnifiedTaskRecord:
    task_id: str
    category: str
    action_type: str
    title: str
    description: str
    priority: str
    due_date: str
    status: str
    source_id: str
    action_target: UnifiedTaskActionTargetRecord
    created_at: str
    scope: str
    scoped_org_id: str | None = None
    assigned_user_id: str | None = None
    reviewer_role_ids: list[str] = field(default_factory=list)
    project_id: str | None = None


# ---------------------------------------------------------------------------
# Module-level helpers so DB-backed read models can reuse the same permission
# and view logic without depending on the in-memory SeedTaskStore instance.
# ---------------------------------------------------------------------------


def ensure_task_permission(user: AuthUserRecord, auth_store: SeedAuthStore) -> None:
    if (
        auth_store.has_permission(user, "PERM-TASK-HQ")
        or auth_store.has_permission(user, "PERM-TASK-BRANCH")
        or auth_store.has_permission(user, "PERM-SYSTEM-ADMIN")
    ):
        return
    raise ForbiddenError()


def can_see_task(
    task: UnifiedTaskRecord,
    user: AuthUserRecord,
    auth_store: SeedAuthStore,
) -> bool:
    if auth_store.has_permission(user, "PERM-SYSTEM-ADMIN"):
        return True
    if task.assigned_user_id == user.user_id:
        return True
    if task.scope == "hq" and auth_store.has_permission(user, "PERM-TASK-HQ"):
        return bool(set(task.reviewer_role_ids).intersection(user.role_ids))
    if task.scope == "branch" and auth_store.has_permission(user, "PERM-TASK-BRANCH"):
        return bool(task.scoped_org_id and auth_store.org_in_scope(user, task.scoped_org_id))
    return False


def matches_keyword(task: UnifiedTaskRecord, keyword: str | None) -> bool:
    if not keyword:
        return True
    normalized = keyword.lower()
    return normalized in task.title.lower() or normalized in task.description.lower()


def task_view(task: UnifiedTaskRecord) -> dict[str, Any]:
    return {
        "taskId": task.task_id,
        "category": task.category,
        "actionType": task.action_type,
        "title": task.title,
        "description": task.description,
        "priority": task.priority,
        "dueDate": task.due_date,
        "status": task.status,
        "sourceId": task.source_id,
        "actionTarget": target_view(task.action_target),
        "createdAt": task.created_at,
        "scope": task.scope,
        "scopedOrgId": task.scoped_org_id,
        "assignedUserId": task.assigned_user_id,
        "reviewerRoleIds": task.reviewer_role_ids,
        "projectId": task.project_id,
    }


def target_view(target: UnifiedTaskActionTargetRecord) -> dict[str, Any]:
    validate_code(target.kind, category="task_action_target_kind", field="actionTarget.kind")
    return {
        "kind": target.kind,
        "menuId": target.menu_id,
        "appPath": target.app_path,
        "publicPath": target.public_path,
        "params": target.params,
        "action": target.action,
    }


# ---------------------------------------------------------------------------
# In-memory seed store (legacy / non-DB-runtime fallback)
# ---------------------------------------------------------------------------


class SeedTaskStore:
    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self.tasks = self._build_tasks()

    def task_page(
        self,
        *,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        category: str | None = None,
        status: str | None = None,
        priority: str | None = None,
        keyword: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        ensure_task_permission(user, auth_store)
        validate_codes(
            (category, "task_category", "category"),
            (status, "task_status", "status"),
            (priority, "task_priority", "priority"),
        )
        visible = [
            task
            for task in self.tasks.values()
            if can_see_task(task, user, auth_store)
            and (category is None or task.category == category)
            and (status is None or task.status == status)
            and (priority is None or task.priority == priority)
            and matches_keyword(task, keyword)
        ]
        visible.sort(key=lambda item: (item.due_date, item.created_at, item.task_id))
        start = (page - 1) * page_size
        end = start + page_size
        items = [task_view(task) for task in visible[start:end]]
        return {
            "items": items,
            "page": page,
            "pageSize": page_size,
            "total": len(visible),
        }

    def count_read_model(
        self,
        *,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        category: str | None = None,
        status: str | None = None,
        group_by: str | None = None,
    ) -> dict[str, Any]:
        ensure_task_permission(user, auth_store)
        validate_codes(
            (category, "task_category", "category"),
            (status, "task_status", "status"),
        )
        if group_by is not None and group_by not in {"category", "status"}:
            raise AppError(
                code="VALIDATION_ERROR",
                message="groupBy must be category or status",
                status_code=422,
                details={
                    "field": "groupBy",
                    "received": group_by,
                    "allowedValues": ["category", "status"],
                },
            )
        visible = [
            task
            for task in self.tasks.values()
            if can_see_task(task, user, auth_store)
            and (category is None or task.category == category)
            and (status is None or task.status == status)
        ]
        by_category: dict[str, int] = {}
        by_status: dict[str, int] = {}
        for task in visible:
            by_category[task.category] = by_category.get(task.category, 0) + 1
            by_status[task.status] = by_status.get(task.status, 0) + 1
        open_tasks = [task for task in visible if task.status != "DONE"]
        payload: dict[str, Any] = {
            "total": len(visible),
            "totalOpen": len(open_tasks),
            "byCategory": by_category,
            "byStatus": by_status,
        }
        if group_by == "category":
            payload["groups"] = by_category
        elif group_by == "status":
            payload["groups"] = by_status
        return payload

    def target_for_task(
        self,
        *,
        task_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        task = self.tasks.get(task_id)
        if not task:
            raise AppError(code="TASK_NOT_FOUND", message="Task not found", status_code=404)
        ensure_task_permission(user, auth_store)
        if not can_see_task(task, user, auth_store):
            raise ForbiddenError()
        if not task.action_target.supported:
            raise AppError(
                code="TARGET_ROUTE_NOT_SUPPORTED",
                message="Task target route is not supported",
                status_code=422,
            )
        return target_view(task.action_target)

    def upsert_task(self, task: UnifiedTaskRecord) -> None:
        validate_codes(
            (task.category, "task_category", "category"),
            (task.status, "task_status", "status"),
            (task.priority, "task_priority", "priority"),
        )
        self.tasks[task.task_id] = task

    def get_task_record(self, task_id: str) -> UnifiedTaskRecord | None:
        return self.tasks.get(task_id)

    def all_task_records(self) -> list[UnifiedTaskRecord]:
        return list(self.tasks.values())

    def find_tasks_by_source_or_project(
        self,
        *,
        task_ids: set[str] | None = None,
        source_ids: set[str] | None = None,
        project_ids: set[str] | None = None,
    ) -> list[UnifiedTaskRecord]:
        task_ids = task_ids or set()
        source_ids = source_ids or set()
        project_ids = project_ids or set()
        return [
            task
            for task in self.tasks.values()
            if task.task_id in task_ids
            or task.source_id in source_ids
            or (task.project_id is not None and task.project_id in project_ids)
        ]

    def has_visible_project_task(
        self,
        *,
        project_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        exclude_task_id: str | None = None,
    ) -> bool:
        return any(
            task.project_id == project_id
            and task.task_id != exclude_task_id
            and can_see_task(task, user, auth_store)
            for task in self.tasks.values()
        )

    def _build_tasks(self) -> dict[str, UnifiedTaskRecord]:
        records = [
            UnifiedTaskRecord(
                task_id="TASK-HQ-PLAN-REVIEW-001",
                category="INSPECTION",
                action_type="REVIEW",
                title="Review inspection plan draft",
                description="P0 inspection mainline plan needs headquarters review.",
                priority="HIGH",
                due_date=relative_date_iso(11),
                status="PENDING",
                source_id="INSP-PLAN-WLZQ-2026-AML-001",
                scope="hq",
                scoped_org_id="WLZQ-HQ-COMPLIANCE",
                reviewer_role_ids=[
                    "ROLE_COMPLIANCE_DIRECTOR",
                    "ROLE_COMPLIANCE_MANAGER",
                    "ROLE_INSPECTION_LEAD",
                    "ROLE_INSPECTOR",
                ],
                project_id="INSP-PLAN-WLZQ-2026-AML-001",
                created_at=relative_datetime_iso(hour=9, minute=0),
                action_target=UnifiedTaskActionTargetRecord(
                    kind="route",
                    menu_id="hq-plans",
                    app_path="/hq/inspection/plans/INSP-PLAN-WLZQ-2026-AML-001",
                    public_path="/compliance/hq/inspection/plans/INSP-PLAN-WLZQ-2026-AML-001",
                    params={"inspectionPlanId": "INSP-PLAN-WLZQ-2026-AML-001"},
                    action="INSPECTION_PLAN_OPEN",
                ),
            ),
            UnifiedTaskRecord(
                task_id="TASK-HQ-EXECUTION-001",
                category="INSPECTION",
                action_type="REVIEW",
                title="Open execution workspace",
                description="Headquarters monitors branch evidence progress.",
                priority="MEDIUM",
                due_date=relative_date_iso(13),
                status="PENDING",
                source_id="INSP-PLAN-WLZQ-2026-AML-001",
                scope="hq",
                scoped_org_id="WLZQ-HQ-COMPLIANCE",
                reviewer_role_ids=["ROLE_COMPLIANCE_MANAGER", "ROLE_INSPECTION_LEAD"],
                project_id="INSP-PLAN-WLZQ-2026-AML-001",
                created_at=relative_datetime_iso(hour=9, minute=10),
                action_target=UnifiedTaskActionTargetRecord(
                    kind="route",
                    menu_id="hq-monitor",
                    app_path=(
                        "/hq/inspection/execution/INSP-PLAN-WLZQ-2026-AML-001"
                        "/branches/WLZQ-RBC-GZ-NANSHA"
                    ),
                    public_path=(
                        "/compliance/hq/inspection/execution/INSP-PLAN-WLZQ-2026-AML-001"
                        "/branches/WLZQ-RBC-GZ-NANSHA"
                    ),
                    params={
                        "inspectionPlanId": "INSP-PLAN-WLZQ-2026-AML-001",
                        "branchId": "WLZQ-RBC-GZ-NANSHA",
                    },
                    action="EXECUTION_OPEN_WORKSPACE",
                ),
            ),
            UnifiedTaskRecord(
                task_id="TASK-HQ-ASSESSMENT-001",
                category="ASSESSMENT",
                action_type="REVIEW",
                title="Future assessment review placeholder",
                description="Future-compatible assessment task fixture without workflow mutation.",
                priority="LOW",
                due_date=relative_date_iso(20),
                status="PENDING",
                source_id="ASSESSMENT-GUARDRAIL-001",
                scope="hq",
                scoped_org_id="WLZQ-HQ-COMPLIANCE",
                reviewer_role_ids=["ROLE_COMPLIANCE_MANAGER"],
                project_id="ASSESSMENT-GUARDRAIL-001",
                created_at=relative_datetime_iso(hour=9, minute=20),
                action_target=UnifiedTaskActionTargetRecord(
                    kind="route",
                    menu_id="hq-tasks",
                    app_path="/hq/tasks",
                    public_path="/compliance/hq/tasks",
                    params={"category": "ASSESSMENT"},
                    action="TASK_FILTER_OR_SEARCH",
                ),
            ),
            UnifiedTaskRecord(
                task_id="TASK-BR-EVIDENCE-001",
                category="INSPECTION",
                action_type="SUBMIT",
                title="Submit inspection evidence",
                description="Branch compliance officer submits materials for one requirement.",
                priority="HIGH",
                due_date=relative_date_iso(12),
                status="PENDING",
                source_id="REQ-WLZQ-AML-001",
                scope="branch",
                scoped_org_id="WLZQ-RBC-GZ-NANSHA",
                assigned_user_id="USER-BRANCH-COMP-001",
                project_id="INSP-PLAN-WLZQ-2026-AML-001",
                created_at=relative_datetime_iso(hour=9, minute=30),
                action_target=UnifiedTaskActionTargetRecord(
                    kind="route",
                    menu_id="branch-upload",
                    app_path=(
                        "/branch/inspection/materials/INSP-PLAN-WLZQ-2026-AML-001"
                        "/requirements/REQ-WLZQ-AML-001"
                    ),
                    public_path=(
                        "/compliance/branch/inspection/materials/INSP-PLAN-WLZQ-2026-AML-001"
                        "/requirements/REQ-WLZQ-AML-001"
                    ),
                    params={
                        "inspectionPlanId": "INSP-PLAN-WLZQ-2026-AML-001",
                        "requirementId": "REQ-WLZQ-AML-001",
                    },
                    action="EVIDENCE_UPLOAD",
                ),
            ),
            UnifiedTaskRecord(
                task_id="TASK-BR-EVIDENCE-SIT-IMPL-01",
                category="INSPECTION",
                action_type="SUBMIT",
                title="Submit SIT-IMPL-01 inspection evidence",
                description=(
                    "Branch compliance officer submits materials for the SIT "
                    "implementation-stage review backbone."
                ),
                priority="HIGH",
                due_date=relative_date_iso(12),
                status="PENDING",
                source_id="REQ-SIT-SEED-0015-NANSHA-001",
                scope="branch",
                scoped_org_id="WLZQ-RBC-GZ-NANSHA",
                assigned_user_id="USER-BRANCH-COMP-001",
                project_id="INSP-PLAN-SEED-0015",
                created_at=relative_datetime_iso(hour=9, minute=35),
                action_target=UnifiedTaskActionTargetRecord(
                    kind="route",
                    menu_id="branch-upload",
                    app_path=(
                        "/branch/inspection/materials/INSP-PLAN-SEED-0015"
                        "/requirements/REQ-SIT-SEED-0015-NANSHA-001"
                    ),
                    public_path=(
                        "/compliance/branch/inspection/materials/INSP-PLAN-SEED-0015"
                        "/requirements/REQ-SIT-SEED-0015-NANSHA-001"
                    ),
                    params={
                        "inspectionPlanId": "INSP-PLAN-SEED-0015",
                        "requirementId": "REQ-SIT-SEED-0015-NANSHA-001",
                    },
                    action="EVIDENCE_UPLOAD",
                ),
            ),
            UnifiedTaskRecord(
                task_id="TASK-BR-RECTIFICATION-001",
                category="ISSUE",
                action_type="RECTIFY",
                title="Submit rectification feedback",
                description="Branch submits rectification feedback for assigned issue.",
                priority="MEDIUM",
                due_date=relative_date_iso(15),
                status="PENDING",
                source_id="RECT-WLZQ-AML-001",
                scope="branch",
                scoped_org_id="WLZQ-RBC-GZ-NANSHA",
                assigned_user_id="USER-BRANCH-COMP-001",
                project_id="INSP-PLAN-WLZQ-2026-AML-001",
                created_at=relative_datetime_iso(hour=9, minute=40),
                action_target=UnifiedTaskActionTargetRecord(
                    kind="route",
                    menu_id="branch-ledger",
                    app_path="/branch/issues/rectifications/RECT-WLZQ-AML-001",
                    public_path="/compliance/branch/issues/rectifications/RECT-WLZQ-AML-001",
                    params={"rectificationId": "RECT-WLZQ-AML-001"},
                    action="RECTIFICATION_SUBMIT_FEEDBACK",
                ),
            ),
            UnifiedTaskRecord(
                task_id="TASK-HQ-UNSUPPORTED-001",
                category="ISSUE",
                action_type="REVIEW",
                title="Unsupported route fixture",
                description="Contract guard for unsupported target route handling.",
                priority="LOW",
                due_date=relative_date_iso(22),
                status="PENDING",
                source_id="UNSUPPORTED-ROUTE-001",
                scope="hq",
                scoped_org_id="WLZQ-HQ-COMPLIANCE",
                reviewer_role_ids=["ROLE_INSPECTION_LEAD"],
                created_at=relative_datetime_iso(hour=9, minute=50),
                action_target=UnifiedTaskActionTargetRecord(
                    kind="route",
                    menu_id="unsupported-route",
                    app_path="/unsupported/route",
                    public_path="/compliance/unsupported/route",
                    params={"sourceId": "UNSUPPORTED-ROUTE-001"},
                    action="UNSUPPORTED_ROUTE",
                    supported=False,
                ),
            ),
        ]
        return {task.task_id: task for task in records}


task_store = SeedTaskStore()
