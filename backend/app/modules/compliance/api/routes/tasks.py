from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.compliance.core.config import get_settings
from app.modules.compliance.core.db import get_session
from app.modules.compliance.core.responses import success_response
from app.modules.compliance.dependencies.auth import AuthStoreDep, CurrentUserDep
from app.modules.compliance.domain.task_store import task_store
from app.modules.compliance.repositories.task_runtime import task_runtime_repository
from app.modules.compliance.schemas.task import TaskQuery

router = APIRouter(prefix="/tasks", tags=["tasks"])
DbSessionDep = Annotated[AsyncSession, Depends(get_session)]


def _runtime_db_enabled() -> bool:
    return get_settings().assessment_runtime_persistence == "database"


@router.get("", name="task-list")
async def task_list(
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
    category: Annotated[str | None, Query()] = None,
    status: Annotated[str | None, Query()] = None,
    priority: Annotated[str | None, Query()] = None,
    keyword: Annotated[str | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 20,
) -> dict:
    query = TaskQuery(
        category=category,
        status=status,
        priority=priority,
        keyword=keyword,
        page=page,
        pageSize=page_size,
    )
    if _runtime_db_enabled():
        tasks = await task_runtime_repository.task_page(
            session,
            user=user,
            auth_store=auth_store,
            category=query.category,
            status=query.status,
            priority=query.priority,
            keyword=query.keyword,
            page=query.page,
            page_size=query.page_size,
        )
    else:
        tasks = task_store.task_page(
            user=user,
            auth_store=auth_store,
            category=query.category,
            status=query.status,
            priority=query.priority,
            keyword=query.keyword,
            page=query.page,
            page_size=query.page_size,
        )
    return success_response(tasks, request)


@router.get("/counts", name="task-counts")
async def task_counts(
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
    category: Annotated[str | None, Query()] = None,
    status: Annotated[str | None, Query()] = None,
    group_by: Annotated[str | None, Query(alias="groupBy")] = None,
) -> dict:
    if _runtime_db_enabled():
        counts = await task_runtime_repository.count_read_model(
            session,
            user=user,
            auth_store=auth_store,
            category=category,
            status=status,
            group_by=group_by,
        )
    else:
        counts = task_store.count_read_model(
            user=user,
            auth_store=auth_store,
            category=category,
            status=status,
            group_by=group_by,
        )
    return success_response(counts, request)


@router.get("/{taskId}/target", name="task-target")
async def task_target(
    task_id: Annotated[str, Path(alias="taskId")],
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    if _runtime_db_enabled():
        target = await task_runtime_repository.target_for_task(
            session,
            task_id=task_id,
            user=user,
            auth_store=auth_store,
        )
    else:
        target = task_store.target_for_task(
            task_id=task_id,
            user=user,
            auth_store=auth_store,
        )
    return success_response(target, request)
