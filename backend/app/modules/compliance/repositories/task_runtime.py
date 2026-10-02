from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.compliance.core.errors import AppError, ForbiddenError
from app.modules.compliance.domain.auth_store import AuthUserRecord, SeedAuthStore
from app.modules.compliance.domain.dictionaries import validate_codes
from app.modules.compliance.domain.task_store import (
    UnifiedTaskActionTargetRecord,
    UnifiedTaskRecord,
    can_see_task,
    ensure_task_permission,
    matches_keyword,
    target_view,
    task_store,
    task_view,
)
from app.modules.compliance.models.task import UnifiedTaskModel


class TaskRuntimeRepository:
    """DB-backed read model for UnifiedTask.

    When ``ASSESSMENT_RUNTIME_PERSISTENCE=database`` the task list/count/detail
    endpoints should query this repository instead of the in-memory
    ``task_store`` so that tasks created by dispatch on one worker are visible
    to requests served by another worker.

    The write helpers intentionally do not commit. Business routes/workers
    should call them inside the same transaction that owns the surrounding
    domain mutation.
    """

    async def save_task(
        self,
        session: AsyncSession,
        task_id: str,
        *,
        updated_by: str | None = None,
    ) -> UnifiedTaskModel:
        task = task_store.tasks.get(task_id)
        if task is None:
            raise AppError(
                code="TASK_NOT_FOUND",
                message="Task not found in runtime task store",
                status_code=404,
                details={"taskId": task_id},
            )

        row = self.record_to_model(task, updated_by=updated_by)
        existing = await session.get(UnifiedTaskModel, task_id)
        if existing is not None:
            row.created_by = existing.created_by
            row.created_at = existing.created_at
            row.deleted_at = existing.deleted_at
            row.deleted_by = existing.deleted_by
        merged = await session.merge(row)
        await session.flush()
        return merged

    async def save_task_bundle(
        self,
        session: AsyncSession,
        task_ids: Sequence[str],
        *,
        updated_by: str | None = None,
    ) -> list[UnifiedTaskModel]:
        missing = [task_id for task_id in task_ids if task_id not in task_store.tasks]
        if missing:
            raise AppError(
                code="TASK_NOT_FOUND",
                message="Some tasks were not found in runtime task store",
                status_code=404,
                details={"taskIds": missing},
            )
        saved: list[UnifiedTaskModel] = []
        for task_id in task_ids:
            saved.append(await self.save_task(session, task_id, updated_by=updated_by))
        return saved

    @staticmethod
    def record_to_model(
        task: UnifiedTaskRecord,
        *,
        updated_by: str | None = None,
    ) -> UnifiedTaskModel:
        actor = updated_by or "SYSTEM-RUNTIME"
        now = datetime.now(tz=UTC)
        validate_codes(
            (task.category, "task_category", "category"),
            (task.status, "task_status", "status"),
            (task.priority, "task_priority", "priority"),
        )
        return UnifiedTaskModel(
            created_by=actor,
            updated_by=actor,
            created_at=now,
            updated_at=now,
            is_deleted=False,
            deleted_at=None,
            deleted_by=None,
            task_id=task.task_id,
            category=task.category,
            action_type=task.action_type,
            title=task.title,
            description=task.description,
            priority=task.priority,
            due_date=_parse_date_or_none(task.due_date),
            status=task.status,
            source_id=task.source_id,
            scope=task.scope,
            scoped_org_id=task.scoped_org_id,
            assigned_user_id=task.assigned_user_id,
            reviewer_role_ids=list(task.reviewer_role_ids),
            project_id=task.project_id,
            action_target={
                "kind": task.action_target.kind,
                "menuId": task.action_target.menu_id,
                "appPath": task.action_target.app_path,
                "publicPath": task.action_target.public_path,
                "params": dict(task.action_target.params),
                "action": task.action_target.action,
                "supported": task.action_target.supported,
            },
            task_created_at=_parse_datetime(task.created_at),
        )

    async def task_page(
        self,
        session: AsyncSession,
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
        rows = await self._fetch_tasks(
            session,
            category=category,
            status=status,
            priority=priority,
        )
        tasks = [self._row_to_record(row) for row in rows]
        visible = [
            task
            for task in tasks
            if can_see_task(task, user, auth_store) and matches_keyword(task, keyword)
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

    async def count_read_model(
        self,
        session: AsyncSession,
        *,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        category: str | None = None,
        status: str | None = None,
        group_by: str | None = None,
    ) -> dict[str, Any]:
        from app.modules.compliance.core.errors import AppError

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
        rows = await self._fetch_tasks(session, category=category, status=status)
        tasks = [self._row_to_record(row) for row in rows]
        visible = [
            task
            for task in tasks
            if can_see_task(task, user, auth_store)
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

    async def target_for_task(
        self,
        session: AsyncSession,
        *,
        task_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        row = await session.get(UnifiedTaskModel, task_id)
        if row is None or row.is_deleted:
            raise AppError(code="TASK_NOT_FOUND", message="Task not found", status_code=404)
        ensure_task_permission(user, auth_store)
        task = self._row_to_record(row)
        if not can_see_task(task, user, auth_store):
            raise ForbiddenError()
        if not task.action_target.supported:
            raise AppError(
                code="TARGET_ROUTE_NOT_SUPPORTED",
                message="Task target route is not supported",
                status_code=422,
            )
        return target_view(task.action_target)

    async def get_task_record(
        self,
        session: AsyncSession,
        task_id: str,
    ) -> UnifiedTaskRecord | None:
        row = await session.get(UnifiedTaskModel, task_id)
        if row is None or row.is_deleted:
            return None
        return self._row_to_record(row)

    async def visible_project_tasks(
        self,
        session: AsyncSession,
        *,
        project_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        exclude_task_id: str | None = None,
    ) -> list[UnifiedTaskRecord]:
        rows = await self._fetch_tasks_by_source_or_project(
            session,
            project_ids={project_id},
        )
        tasks = [self._row_to_record(row) for row in rows]
        return [
            task
            for task in tasks
            if task.task_id != exclude_task_id and can_see_task(task, user, auth_store)
        ]

    async def has_visible_project_task(
        self,
        session: AsyncSession,
        *,
        project_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        exclude_task_id: str | None = None,
    ) -> bool:
        return bool(
            await self.visible_project_tasks(
                session,
                project_id=project_id,
                user=user,
                auth_store=auth_store,
                exclude_task_id=exclude_task_id,
            ),
        )

    async def find_tasks_by_source_or_project(
        self,
        session: AsyncSession,
        *,
        task_ids: set[str] | None = None,
        source_ids: set[str] | None = None,
        project_ids: set[str] | None = None,
    ) -> list[UnifiedTaskRecord]:
        rows = await self._fetch_tasks_by_source_or_project(
            session,
            task_ids=task_ids,
            source_ids=source_ids,
            project_ids=project_ids,
        )
        return [self._row_to_record(row) for row in rows]

    async def _fetch_tasks(
        self,
        session: AsyncSession,
        *,
        category: str | None = None,
        status: str | None = None,
        priority: str | None = None,
    ) -> list[UnifiedTaskModel]:
        stmt = select(UnifiedTaskModel).where(UnifiedTaskModel.is_deleted.is_(False))
        if category is not None:
            stmt = stmt.where(UnifiedTaskModel.category == category)
        if status is not None:
            stmt = stmt.where(UnifiedTaskModel.status == status)
        if priority is not None:
            stmt = stmt.where(UnifiedTaskModel.priority == priority)
        result = await session.scalars(stmt)
        return list(result.all())

    async def _fetch_tasks_by_source_or_project(
        self,
        session: AsyncSession,
        *,
        task_ids: set[str] | None = None,
        source_ids: set[str] | None = None,
        project_ids: set[str] | None = None,
    ) -> list[UnifiedTaskModel]:
        predicates = []
        if task_ids:
            predicates.append(UnifiedTaskModel.task_id.in_(task_ids))
        if source_ids:
            predicates.append(UnifiedTaskModel.source_id.in_(source_ids))
        if project_ids:
            predicates.append(UnifiedTaskModel.project_id.in_(project_ids))
        if not predicates:
            return []
        stmt = select(UnifiedTaskModel).where(
            UnifiedTaskModel.is_deleted.is_(False),
            or_(*predicates),
        )
        result = await session.scalars(stmt)
        rows = list(result.all())
        rows.sort(key=lambda item: (item.project_id or "", item.source_id, item.task_id))
        return rows

    @staticmethod
    def _row_to_record(row: UnifiedTaskModel) -> UnifiedTaskRecord:
        target = row.action_target or {}
        return UnifiedTaskRecord(
            task_id=row.task_id,
            category=row.category,
            action_type=row.action_type,
            title=row.title,
            description=row.description,
            priority=row.priority,
            due_date=row.due_date.isoformat() if row.due_date else "",
            status=row.status,
            source_id=row.source_id,
            scope=row.scope,
            scoped_org_id=row.scoped_org_id,
            assigned_user_id=row.assigned_user_id,
            reviewer_role_ids=list(row.reviewer_role_ids) if row.reviewer_role_ids else [],
            project_id=row.project_id,
            created_at=row.task_created_at.isoformat() if row.task_created_at else "",
            action_target=UnifiedTaskActionTargetRecord(
                kind=target.get("kind", "route"),
                menu_id=target.get("menuId", ""),
                app_path=target.get("appPath", ""),
                public_path=target.get("publicPath", ""),
                params=dict(target.get("params") or {}),
                action=target.get("action", ""),
                supported=target.get("supported", True),
            ),
        )


task_runtime_repository = TaskRuntimeRepository()


def _parse_datetime(raw: str | datetime | date) -> datetime:
    if isinstance(raw, datetime):
        return raw if raw.tzinfo else raw.replace(tzinfo=UTC)
    if isinstance(raw, date):
        return datetime(raw.year, raw.month, raw.day, tzinfo=UTC)
    parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def _parse_date_or_none(raw: str | date | None) -> date | None:
    if raw is None or raw == "":
        return None
    if isinstance(raw, date):
        return raw
    return date.fromisoformat(raw.split("T", 1)[0])
