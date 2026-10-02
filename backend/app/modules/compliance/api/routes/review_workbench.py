from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.compliance.core.config import get_settings
from app.modules.compliance.core.db import get_session
from app.modules.compliance.core.responses import success_response
from app.modules.compliance.dependencies.auth import AuthStoreDep, CurrentUserDep
from app.modules.compliance.domain.cycle_store import cycle_store
from app.modules.compliance.domain.review_store import review_store
from app.modules.compliance.domain.unified_review_store import (
    UnifiedReviewTaskReadModel,
    unified_review_store,
)
from app.modules.compliance.repositories.assessment_runtime import assessment_runtime_repository
from app.modules.compliance.repositories.task_runtime import task_runtime_repository
from app.modules.compliance.schemas.review_workbench import (
    UnifiedReviewBatchDecisionRequest,
    UnifiedReviewDecisionRequest,
    UnifiedReviewSaveRequest,
)

router = APIRouter(prefix="/review-workbench", tags=["review-workbench"])
DbSessionDep = Annotated[AsyncSession, Depends(get_session)]


def _runtime_db_enabled() -> bool:
    return get_settings().assessment_runtime_persistence == "database"


async def _task_read_model_for_unified_review(
    session: AsyncSession,
) -> UnifiedReviewTaskReadModel | None:
    if not _runtime_db_enabled():
        return None

    await assessment_runtime_repository.hydrate_cycle_store(session)
    task_ids: set[str] = set()
    source_ids: set[str] = set()
    project_ids: set[str] = set()

    for source in review_store.review_tasks.values():
        task_ids.add(source.unified_task_id)
        source_ids.add(source.reporting_task_id)
        project_ids.add(source.cycle_id)
        cycle = cycle_store.cycles.get(source.cycle_id)
        if cycle is None:
            continue
        reporting_task = cycle.reporting_tasks.get(source.reporting_task_id)
        if reporting_task is not None:
            task_ids.add(reporting_task.unified_task_id)

    records = await task_runtime_repository.find_tasks_by_source_or_project(
        session,
        task_ids=task_ids,
        source_ids=source_ids,
        project_ids=project_ids,
    )
    return UnifiedReviewTaskReadModel(records)


@router.get("/tasks", name="review-workbench-task-list")
async def review_workbench_task_list(
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
    bucket: Annotated[str | None, Query()] = None,
    source_org_id: Annotated[str | None, Query(alias="sourceOrgId")] = None,
    category: Annotated[str | None, Query()] = None,
    urgent_only: Annotated[bool | None, Query(alias="urgentOnly")] = None,
    keyword: Annotated[str | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 20,
) -> dict:
    task_read_model = await _task_read_model_for_unified_review(session)
    page_data = unified_review_store.review_page(
        user=user,
        auth_store=auth_store,
        task_read_model=task_read_model,
        bucket=bucket,
        source_org_id=source_org_id,
        category=category,
        urgent_only=urgent_only,
        keyword=keyword,
        page=page,
        page_size=page_size,
    )
    return success_response(page_data, request)


@router.get("/tasks/{reviewTaskId}", name="review-workbench-task-detail")
async def review_workbench_task_detail(
    review_task_id: Annotated[str, Path(alias="reviewTaskId")],
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    task_read_model = await _task_read_model_for_unified_review(session)
    detail = unified_review_store.review_detail(
        review_task_id=review_task_id,
        user=user,
        auth_store=auth_store,
        task_read_model=task_read_model,
    )
    return success_response(detail, request)


@router.patch("/tasks/{reviewTaskId}", name="review-workbench-task-save")
async def review_workbench_task_save(
    review_task_id: Annotated[str, Path(alias="reviewTaskId")],
    payload: UnifiedReviewSaveRequest,
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    task_read_model = await _task_read_model_for_unified_review(session)
    detail = unified_review_store.save_review(
        review_task_id=review_task_id,
        user=user,
        auth_store=auth_store,
        comment=payload.comment,
        version=payload.version,
        task_read_model=task_read_model,
    )
    return success_response(detail, request)


@router.post("/tasks/{reviewTaskId}/decision", name="review-workbench-task-decision")
async def review_workbench_task_decision(
    review_task_id: Annotated[str, Path(alias="reviewTaskId")],
    payload: UnifiedReviewDecisionRequest,
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    task_read_model = await _task_read_model_for_unified_review(session)
    detail = unified_review_store.decide(
        review_task_id=review_task_id,
        user=user,
        auth_store=auth_store,
        decision=payload.decision,
        reason=payload.reason,
        comment=payload.comment,
        version=payload.version,
        request_id=payload.request_id or request.headers.get("X-Request-Id"),
        idempotency_key=payload.idempotency_key,
        task_read_model=task_read_model,
    )
    return success_response(detail, request)


@router.post("/tasks/batch-decision", name="review-workbench-task-batch-decision")
async def review_workbench_task_batch_decision(
    payload: UnifiedReviewBatchDecisionRequest,
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    task_read_model = await _task_read_model_for_unified_review(session)
    result = unified_review_store.batch_decide(
        user=user,
        auth_store=auth_store,
        items=[item.as_store_payload() for item in payload.items],
        decision=payload.decision,
        reason=payload.reason,
        request_id=payload.request_id or request.headers.get("X-Request-Id"),
        task_read_model=task_read_model,
    )
    return success_response(result, request)

