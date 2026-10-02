"""WP-P0-BE-06 — Compliance Issue Hub & Rectification REST endpoints.

Routes:
  GET  /issues                              — issue list with filters
  GET  /issues/{issueId}                    — issue detail with nested rectifications
  POST /issues/{issueId}/supervision-events — HQ supervision event creation
  GET  /rectifications                      — rectification list with filters
  POST /rectifications/{rectificationId}/feedback      — branch feedback
  POST /rectifications/{rectificationId}/verification  — HQ verification
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.compliance.core.config import get_settings
from app.modules.compliance.core.db import get_session
from app.modules.compliance.core.responses import success_response
from app.modules.compliance.dependencies.auth import AuthStoreDep, CurrentUserDep
from app.modules.compliance.domain.issue_project_store import issue_project_store
from app.modules.compliance.domain.rectification_store import rectification_store
from app.modules.compliance.repositories.issue_project_runtime import issue_project_runtime_repository
from app.modules.compliance.repositories.notification_runtime import notification_runtime_repository
from app.modules.compliance.schemas.inspection import (
    IssueProjectOverdueReminderRequest,
    IssueSupervisionEventCreateRequest,
    RectificationFeedbackSubmitRequest,
    RectificationVerificationRequest,
)

router = APIRouter(tags=["issues"])
DbSessionDep = Annotated[AsyncSession, Depends(get_session)]


def _database_mode() -> bool:
    return get_settings().notification_runtime_persistence == "database"


async def _hydrate_issue_project_runtime(session: AsyncSession) -> None:
    if _database_mode():
        await issue_project_runtime_repository.hydrate_reminder_events(session)


async def _commit_runtime(session: AsyncSession) -> None:
    if _database_mode():
        await session.commit()


# ---------------------------------------------------------------------------
# Issue Hub
# ---------------------------------------------------------------------------


@router.get("/issues", name="issue-list")
async def issue_list(
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    status: Annotated[str | None, Query()] = None,
    risk_level: Annotated[str | None, Query(alias="riskLevel")] = None,
    responsible_org_id: Annotated[str | None, Query(alias="responsibleOrgId")] = None,
    source: Annotated[str | None, Query()] = None,
    project_id: Annotated[str | None, Query(alias="projectId")] = None,
    business_line: Annotated[str | None, Query(alias="businessLine")] = None,
    keyword: Annotated[str | None, Query()] = None,
    due_date_start: Annotated[str | None, Query(alias="dueDateStart")] = None,
    due_date_end: Annotated[str | None, Query(alias="dueDateEnd")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 20,
) -> dict:
    result = rectification_store.issue_page(
        user=user,
        auth_store=auth_store,
        status=status,
        risk_level=risk_level,
        responsible_org_id=responsible_org_id,
        source=source,
        source_id=project_id,
        business_line=business_line,
        keyword=keyword,
        due_date_start=due_date_start,
        due_date_end=due_date_end,
        page=page,
        page_size=page_size,
    )
    return success_response(result, request)


@router.get("/issues/project-tracker", name="issue-project-tracker")
async def issue_project_tracker(
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    keyword: Annotated[str | None, Query()] = None,
    year: Annotated[int | None, Query()] = None,
    status: Annotated[str | None, Query()] = None,
    lead_dept_id: Annotated[str | None, Query(alias="leadDeptId")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 20,
) -> dict:
    result = issue_project_store.project_tracker_page(
        user=user,
        auth_store=auth_store,
        keyword=keyword,
        year=year,
        status=status,
        lead_dept_id=lead_dept_id,
        page=page,
        page_size=page_size,
    )
    return success_response(result, request)


@router.get("/issues/project-tracker/{projectId}/branches", name="issue-project-branches")
async def issue_project_branches(
    project_id: Annotated[str, Path(alias="projectId")],
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    org_id: Annotated[str | None, Query(alias="orgId")] = None,
    status: Annotated[str | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 20,
) -> dict:
    result = issue_project_store.project_branch_page(
        project_id=project_id,
        user=user,
        auth_store=auth_store,
        org_id=org_id,
        status=status,
        page=page,
        page_size=page_size,
    )
    return success_response(result, request)


@router.post(
    "/issues/project-tracker/{projectId}/overdue-reminders",
    name="issue-project-overdue-reminder",
)
async def issue_project_overdue_reminder(
    project_id: Annotated[str, Path(alias="projectId")],
    payload: IssueProjectOverdueReminderRequest,
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_issue_project_runtime(session)
    result = issue_project_store.send_overdue_reminders(
        project_id=project_id,
        user=user,
        auth_store=auth_store,
        target_org_ids=payload.target_org_ids,
        reason=payload.reason,
        request_id=payload.request_id,
        delivery_mode=payload.delivery_mode,
    )
    if _database_mode() and not result.get("duplicate"):
        record = issue_project_store.reminder_events[result["reminderEventId"]]
        await issue_project_runtime_repository.save_reminder_event(session, record)
        await notification_runtime_repository.save_notification_bundle(
            session,
            record.notification_ids,
        )
    await _commit_runtime(session)
    return success_response(result, request)


@router.get("/issues/analytics", name="issue-analytics")
async def issue_analytics(
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    period: Annotated[str | None, Query()] = None,
    business_line: Annotated[str | None, Query(alias="businessLine")] = None,
    org_id: Annotated[str | None, Query(alias="orgId")] = None,
    risk_level: Annotated[str | None, Query(alias="riskLevel")] = None,
    project_id: Annotated[str | None, Query(alias="projectId")] = None,
) -> dict:
    result = issue_project_store.analytics(
        user=user,
        auth_store=auth_store,
        period=period,
        business_line=business_line,
        org_id=org_id,
        risk_level=risk_level,
        project_id=project_id,
    )
    return success_response(result, request)


@router.get("/issues/{issueId}", name="issue-detail")
async def issue_detail(
    issue_id: Annotated[str, Path(alias="issueId")],
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
) -> dict:
    result = rectification_store.issue_detail(
        issue_id=issue_id,
        user=user,
        auth_store=auth_store,
    )
    return success_response(result, request)


@router.post("/issues/{issueId}/supervision-events", name="supervision-event-create")
async def supervision_event_create(
    issue_id: Annotated[str, Path(alias="issueId")],
    payload: IssueSupervisionEventCreateRequest,
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
) -> dict:
    result = rectification_store.create_supervision_event(
        issue_id=issue_id,
        user=user,
        auth_store=auth_store,
        message=payload.message,
        channel=payload.channel,
    )
    return success_response(result, request)


# ---------------------------------------------------------------------------
# Rectification
# ---------------------------------------------------------------------------


@router.get("/rectifications", name="rectification-list")
async def rectification_list(
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    status: Annotated[str | None, Query()] = None,
    branch_id: Annotated[str | None, Query(alias="branchId")] = None,
    issue_id: Annotated[str | None, Query(alias="issueId")] = None,
    due_date_start: Annotated[str | None, Query(alias="dueDateStart")] = None,
    due_date_end: Annotated[str | None, Query(alias="dueDateEnd")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 20,
) -> dict:
    result = rectification_store.rectification_page(
        user=user,
        auth_store=auth_store,
        status=status,
        branch_id=branch_id,
        issue_id=issue_id,
        due_date_start=due_date_start,
        due_date_end=due_date_end,
        page=page,
        page_size=page_size,
    )
    return success_response(result, request)

@router.post("/rectifications/{rectificationId}/start", name="rectification-start")
async def rectification_start(
    rectification_id: Annotated[str, Path(alias="rectificationId")],
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
) -> dict:
    result = rectification_store.start_rectification(
        rectification_id=rectification_id,
        user=user,
        auth_store=auth_store,
    )
    return success_response(result, request)

@router.post("/rectifications/{rectificationId}/archive", name="rectification-archive")
async def rectification_archive(
    rectification_id: Annotated[str, Path(alias="rectificationId")],
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
) -> dict:
    result = rectification_store.archive_rectification(
        rectification_id=rectification_id,
        user=user,
        auth_store=auth_store,
    )
    return success_response(result, request)


@router.post("/rectifications/{rectificationId}/feedback", name="rectification-feedback-submit")
async def rectification_feedback_submit(
    rectification_id: Annotated[str, Path(alias="rectificationId")],
    payload: RectificationFeedbackSubmitRequest,
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
) -> dict:
    result = rectification_store.submit_feedback(
        rectification_id=rectification_id,
        user=user,
        auth_store=auth_store,
        content=payload.content,
        file_ids=payload.file_ids,
    )
    return success_response(result, request)


@router.post(
    "/rectifications/{rectificationId}/verification",
    name="rectification-verification",
)
async def rectification_verification(
    rectification_id: Annotated[str, Path(alias="rectificationId")],
    payload: RectificationVerificationRequest,
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
) -> dict:
    result = rectification_store.verify_rectification(
        rectification_id=rectification_id,
        user=user,
        auth_store=auth_store,
        decision=payload.decision,
        reject_reason=payload.reject_reason,
    )
    return success_response(result, request)
