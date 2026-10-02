from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.compliance.core.config import get_settings
from app.modules.compliance.core.db import get_session
from app.modules.compliance.core.errors import AppError
from app.modules.compliance.core.responses import success_response
from app.modules.compliance.dependencies.auth import AuthStoreDep, CurrentUserDep, HqInspectionManageDep
from app.modules.compliance.domain.evidence_store import evidence_store
from app.modules.compliance.domain.inspection_plan_store import inspection_plan_store
from app.modules.compliance.domain.inspection_report_store import inspection_report_store
from app.modules.compliance.domain.issue_store import issue_store
from app.modules.compliance.repositories.inspection_report_runtime import inspection_report_runtime_repository
from app.modules.compliance.repositories.notification_runtime import notification_runtime_repository
from app.modules.compliance.repositories.task_runtime import task_runtime_repository
from app.modules.compliance.schemas.inspection import (
    AdjudicationDecisionRequest,
    AppealSubmitRequest,
    EvidenceSubmissionCreateRequest,
    EvidenceSubmissionReviewRequest,
    FactConfirmationRequest,
    InspectionPlanAcknowledgementRequest,
    InspectionPlanCreateRequest,
    InspectionPlanTransitionRequest,
    InspectionPlanUpdateRequest,
    InspectionReportBindFinalRequest,
    IssueCreateRequest,
    InspectionReportGenerateDraftRequest,
    InspectionReportReleaseRequest,
    WorkingPaperCreateRequest,
    WorkingPaperResultUpdateRequest,
)

router = APIRouter(prefix="/inspection", tags=["inspection"])
DbSessionDep = Annotated[AsyncSession, Depends(get_session)]


def _report_database_mode() -> bool:
    return get_settings().inspection_report_runtime_persistence == "database"


def _notification_database_mode() -> bool:
    return get_settings().notification_runtime_persistence == "database"


def _task_database_mode() -> bool:
    return get_settings().assessment_runtime_persistence == "database"


async def _hydrate_report_runtime(session: AsyncSession) -> None:
    if _report_database_mode():
        await inspection_report_runtime_repository.hydrate_report_store(session)


async def _save_report_runtime(session: AsyncSession) -> None:
    if _report_database_mode():
        await inspection_report_runtime_repository.save_runtime_state(session)


async def _commit_report_runtime(session: AsyncSession) -> None:
    if _report_database_mode():
        await session.commit()


@router.get("/plans", name="inspection-plan-list")
async def inspection_plan_list(
    request: Request,
    user: HqInspectionManageDep,
    auth_store: AuthStoreDep,
    year: Annotated[int | None, Query()] = None,
    type: Annotated[str | None, Query()] = None,
    frequency: Annotated[str | None, Query()] = None,
    status: Annotated[str | None, Query()] = None,
    phase: Annotated[str | None, Query()] = None,
    keyword: Annotated[str | None, Query()] = None,
    target_org_id: Annotated[str | None, Query(alias="targetOrgId")] = None,
    target_dept: Annotated[str | None, Query(alias="targetDept")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 20,
) -> dict:
    plans = inspection_plan_store.plan_page(
        user=user,
        auth_store=auth_store,
        year=year,
        type_=type,
        frequency=frequency,
        status=status,
        phase=phase,
        keyword=keyword,
        target_org_id=target_org_id,
        target_dept=target_dept,
        page=page,
        page_size=page_size,
    )
    return success_response(plans, request)


@router.post("/plans", name="inspection-plan-create")
async def inspection_plan_create(
    payload: InspectionPlanCreateRequest,
    request: Request,
    user: HqInspectionManageDep,
    auth_store: AuthStoreDep,
) -> dict:
    plan = inspection_plan_store.create_plan(
        user=user,
        auth_store=auth_store,
        payload=payload.model_dump(by_alias=True, exclude_none=True),
    )
    return success_response(plan, request)


@router.patch("/plans/{inspectionPlanId}", name="inspection-plan-update")
async def inspection_plan_update(
    inspection_plan_id: Annotated[str, Path(alias="inspectionPlanId")],
    payload: InspectionPlanUpdateRequest,
    request: Request,
    user: HqInspectionManageDep,
    auth_store: AuthStoreDep,
) -> dict:
    plan = inspection_plan_store.update_plan(
        inspection_plan_id=inspection_plan_id,
        user=user,
        auth_store=auth_store,
        payload=payload.model_dump(by_alias=True, exclude_none=True),
    )
    return success_response(plan, request)


@router.post("/plans/{inspectionPlanId}/transitions", name="inspection-plan-transition")
async def inspection_plan_transition(
    inspection_plan_id: Annotated[str, Path(alias="inspectionPlanId")],
    payload: InspectionPlanTransitionRequest,
    request: Request,
    user: HqInspectionManageDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    if payload.action == "enter_report_preparation":
        await _hydrate_report_runtime(session)
    plan = inspection_plan_store.transition_plan(
        inspection_plan_id=inspection_plan_id,
        user=user,
        auth_store=auth_store,
        action=payload.action,
        reason=payload.reason,
        comment=payload.comment,
        idempotency_key=payload.idempotency_key,
        optimistic_version=payload.optimistic_version,
        request_id=getattr(request.state, "request_id", None),
    )
    if payload.action == "enter_report_preparation":
        if _report_database_mode():
            await _save_report_runtime(session)
        side_effects = plan.get("sideEffects", {})
        task_ids = [
            *side_effects.get("createdTaskIds", []),
            *side_effects.get("closedTaskIds", []),
        ]
        notification_ids = side_effects.get("notificationIds", [])
        should_commit = _report_database_mode()
        if _task_database_mode() and task_ids:
            await task_runtime_repository.save_task_bundle(
                session,
                task_ids,
                updated_by=user.user_id,
            )
            should_commit = True
        if _notification_database_mode() and notification_ids:
            await notification_runtime_repository.save_notification_bundle(
                session,
                notification_ids,
            )
            should_commit = True
        if should_commit:
            await session.commit()
    elif payload.action in {"submit_approval", "approve"}:
        side_effects = plan.get("sideEffects", {})
        task_ids = side_effects.get("createdTaskIds", [])
        notification_ids = side_effects.get("notificationIds", [])
        should_commit = False
        if _task_database_mode() and task_ids:
            await task_runtime_repository.save_task_bundle(
                session,
                task_ids,
                updated_by=user.user_id,
            )
            should_commit = True
        if _notification_database_mode() and notification_ids:
            await notification_runtime_repository.save_notification_bundle(
                session,
                notification_ids,
            )
            should_commit = True
        if should_commit:
            await session.commit()
    return success_response(plan, request)


@router.get("/execution/summary", name="inspection-execution-summary")
async def inspection_execution_summary(
    request: Request,
    user: HqInspectionManageDep,
    auth_store: AuthStoreDep,
    year: Annotated[int | None, Query()] = None,
    status: Annotated[str | None, Query()] = None,
    phase: Annotated[str | None, Query()] = None,
    business_line: Annotated[str | None, Query(alias="businessLine")] = None,
    target_org_id: Annotated[str | None, Query(alias="targetOrgId")] = None,
) -> dict:
    summary = evidence_store.execution_summary(
        user=user,
        auth_store=auth_store,
        year=year,
        status=status,
        phase=phase,
        business_line=business_line,
        target_org_id=target_org_id,
    )
    return success_response(summary, request)


@router.get("/plans/{inspectionPlanId}/execution", name="inspection-execution-detail")
async def inspection_execution_detail(
    inspection_plan_id: Annotated[str, Path(alias="inspectionPlanId")],
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    branch_id: Annotated[str | None, Query(alias="branchId")] = None,
) -> dict:
    detail = evidence_store.execution_detail(
        inspection_plan_id=inspection_plan_id,
        user=user,
        auth_store=auth_store,
        branch_id=branch_id,
    )
    return success_response(detail, request)


@router.get(
    "/plans/{inspectionPlanId}/evidence-requirements",
    name="evidence-requirement-list",
)
async def evidence_requirement_list(
    inspection_plan_id: Annotated[str, Path(alias="inspectionPlanId")],
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
) -> dict:
    requirements = evidence_store.requirements_for_plan(
        inspection_plan_id=inspection_plan_id,
        user=user,
        auth_store=auth_store,
    )
    return success_response({"items": requirements, "total": len(requirements)}, request)


@router.post("/evidence-submissions", name="evidence-submission-create")
async def evidence_submission_create(
    payload: EvidenceSubmissionCreateRequest,
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
) -> dict:
    submission = evidence_store.create_evidence_submission(
        user=user,
        auth_store=auth_store,
        requirement_id=payload.requirement_id,
        file_ids=payload.file_ids,
    )
    return success_response(submission, request)


@router.post(
    "/evidence-submissions/{submissionId}/review",
    name="evidence-submission-review",
)
async def evidence_submission_review(
    submission_id: Annotated[str, Path(alias="submissionId")],
    payload: EvidenceSubmissionReviewRequest,
    request: Request,
    user: HqInspectionManageDep,
    auth_store: AuthStoreDep,
) -> dict:
    submission = evidence_store.review_evidence_submission(
        submission_id=submission_id,
        user=user,
        auth_store=auth_store,
        decision=payload.decision,
        feedback=payload.feedback,
        comment=payload.comment,
        idempotency_key=payload.idempotency_key,
    )
    return success_response(submission, request)


@router.get(
    "/plans/{inspectionPlanId}/working-papers",
    name="inspection-working-paper-list",
)
async def inspection_working_paper_list(
    inspection_plan_id: Annotated[str, Path(alias="inspectionPlanId")],
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
) -> dict:
    papers = evidence_store.list_working_papers(
        inspection_plan_id=inspection_plan_id,
        user=user,
        auth_store=auth_store,
    )
    return success_response(papers, request)


@router.post(
    "/plans/{inspectionPlanId}/working-papers",
    name="inspection-working-paper-create",
)
async def inspection_working_paper_create(
    inspection_plan_id: Annotated[str, Path(alias="inspectionPlanId")],
    payload: WorkingPaperCreateRequest,
    request: Request,
    user: HqInspectionManageDep,
    auth_store: AuthStoreDep,
) -> dict:
    paper = evidence_store.create_working_paper(
        inspection_plan_id=inspection_plan_id,
        user=user,
        auth_store=auth_store,
        payload=payload.model_dump(by_alias=True, exclude_none=True),
    )
    return success_response(paper, request)


@router.patch(
    "/working-papers/{workingPaperId}/result",
    name="inspection-working-paper-result-update",
)
async def inspection_working_paper_result_update(
    working_paper_id: Annotated[str, Path(alias="workingPaperId")],
    payload: WorkingPaperResultUpdateRequest,
    request: Request,
    user: HqInspectionManageDep,
    auth_store: AuthStoreDep,
) -> dict:
    paper = evidence_store.update_working_paper_result(
        working_paper_id=working_paper_id,
        user=user,
        auth_store=auth_store,
        payload=payload.model_dump(by_alias=True, exclude_none=True),
    )
    return success_response(paper, request)


@router.post("/issues", name="inspection-issue-create")
async def inspection_issue_create(
    payload: IssueCreateRequest,
    request: Request,
    user: HqInspectionManageDep,
    auth_store: AuthStoreDep,
) -> dict:
    issue = issue_store.create_issue(
        user=user,
        auth_store=auth_store,
        payload=payload.model_dump(by_alias=True, exclude_none=True),
    )
    return success_response(issue, request)


@router.get("/issues", name="inspection-issue-list")
async def inspection_issue_list(
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    status: Annotated[str | None, Query()] = None,
    inspection_plan_id: Annotated[str | None, Query(alias="inspectionPlanId")] = None,
    branch_id: Annotated[str | None, Query(alias="branchId")] = None,
    keyword: Annotated[str | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 20,
) -> dict:
    issues = issue_store.issue_page(
        user=user,
        auth_store=auth_store,
        status=status,
        inspection_plan_id=inspection_plan_id,
        branch_id=branch_id,
        keyword=keyword,
        page=page,
        page_size=page_size,
    )
    return success_response(issues, request)


@router.post("/issues/{issueId}/confirmations", name="fact-confirmation-create")
async def fact_confirmation_create(
    issue_id: Annotated[str, Path(alias="issueId")],
    payload: FactConfirmationRequest,
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
) -> dict:
    confirmation = issue_store.create_confirmation(
        issue_id=issue_id,
        user=user,
        auth_store=auth_store,
        decision=payload.decision,
        comment=payload.comment,
    )
    return success_response(confirmation, request)


@router.post("/issues/{issueId}/appeals", name="appeal-submit")
async def appeal_submit(
    issue_id: Annotated[str, Path(alias="issueId")],
    payload: AppealSubmitRequest,
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
) -> dict:
    appeal = issue_store.submit_appeal(
        issue_id=issue_id,
        user=user,
        auth_store=auth_store,
        reason=payload.reason,
        file_ids=payload.file_ids,
    )
    return success_response(appeal, request)


@router.get("/appeals", name="appeal-list")
async def appeal_list(
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    status: Annotated[str | None, Query()] = None,
    inspection_plan_id: Annotated[str | None, Query(alias="inspectionPlanId")] = None,
    branch_id: Annotated[str | None, Query(alias="branchId")] = None,
    keyword: Annotated[str | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 20,
) -> dict:
    appeals = issue_store.appeal_page(
        user=user,
        auth_store=auth_store,
        status=status,
        inspection_plan_id=inspection_plan_id,
        branch_id=branch_id,
        keyword=keyword,
        page=page,
        page_size=page_size,
    )
    return success_response(appeals, request)


@router.post("/appeals/{appealId}/decision", name="adjudication-decision-create")
async def adjudication_decision_create(
    appeal_id: Annotated[str, Path(alias="appealId")],
    payload: AdjudicationDecisionRequest,
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
) -> dict:
    decision = issue_store.decide_appeal(
        appeal_id=appeal_id,
        user=user,
        auth_store=auth_store,
        decision=payload.decision,
        decision_reason=payload.decision_reason,
    )
    return success_response(decision, request)


@router.get(
    "/plans/{inspectionPlanId}/report-workspace",
    name="inspection-report-workspace",
)
async def inspection_report_workspace(
    inspection_plan_id: Annotated[str, Path(alias="inspectionPlanId")],
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_report_runtime(session)
    workspace = inspection_report_store.workspace(
        inspection_plan_id=inspection_plan_id,
        user=user,
        auth_store=auth_store,
    )
    return success_response(workspace, request)


@router.post(
    "/plans/{inspectionPlanId}/report-versions/generate",
    name="inspection-report-generate-draft",
)
async def inspection_report_generate_draft(
    inspection_plan_id: Annotated[str, Path(alias="inspectionPlanId")],
    payload: InspectionReportGenerateDraftRequest,
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_report_runtime(session)
    version = inspection_report_store.generate_draft(
        inspection_plan_id=inspection_plan_id,
        user=user,
        auth_store=auth_store,
        payload=payload.model_dump(by_alias=True, exclude_none=True),
        request_id=getattr(request.state, "request_id", None),
    )
    await _save_report_runtime(session)
    await _commit_report_runtime(session)
    return success_response(version, request)


@router.post(
    "/plans/{inspectionPlanId}/report-versions",
    name="inspection-report-bind-final",
)
async def inspection_report_bind_final(
    inspection_plan_id: Annotated[str, Path(alias="inspectionPlanId")],
    payload: InspectionReportBindFinalRequest,
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_report_runtime(session)
    version = inspection_report_store.bind_final(
        inspection_plan_id=inspection_plan_id,
        user=user,
        auth_store=auth_store,
        payload=payload.model_dump(by_alias=True, exclude_none=True),
        request_id=getattr(request.state, "request_id", None),
    )
    await _save_report_runtime(session)
    await _commit_report_runtime(session)
    return success_response(version, request)


@router.get(
    "/plans/{inspectionPlanId}/report-versions/{reportVersionId}",
    name="inspection-report-version-detail",
)
async def inspection_report_version_detail(
    inspection_plan_id: Annotated[str, Path(alias="inspectionPlanId")],
    report_version_id: Annotated[str, Path(alias="reportVersionId")],
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_report_runtime(session)
    version = inspection_report_store.version_detail(
        inspection_plan_id=inspection_plan_id,
        report_version_id=report_version_id,
        user=user,
        auth_store=auth_store,
    )
    return success_response(version, request)


@router.post(
    "/plans/{inspectionPlanId}/report-versions/{reportVersionId}/release",
    name="inspection-report-release",
)
async def inspection_report_release(
    inspection_plan_id: Annotated[str, Path(alias="inspectionPlanId")],
    report_version_id: Annotated[str, Path(alias="reportVersionId")],
    payload: InspectionReportReleaseRequest,
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_report_runtime(session)
    workspace = inspection_report_store.release(
        inspection_plan_id=inspection_plan_id,
        report_version_id=report_version_id,
        user=user,
        auth_store=auth_store,
        payload=payload.model_dump(by_alias=True, exclude_none=True),
        request_id=getattr(request.state, "request_id", None),
    )
    rectification_task_ids = workspace.get("sideEffects", {}).get("rectificationTaskIds", [])
    await _save_report_runtime(session)
    if _task_database_mode() and rectification_task_ids:
        await task_runtime_repository.save_task_bundle(
            session,
            rectification_task_ids,
            updated_by=user.user_id,
        )
    if _report_database_mode() or (_task_database_mode() and rectification_task_ids):
        await session.commit()
    return success_response(workspace, request)


@router.get(
    "/plans/{inspectionPlanId}/report-audit-events",
    name="inspection-report-audit-list",
)
async def inspection_report_audit_list(
    inspection_plan_id: Annotated[str, Path(alias="inspectionPlanId")],
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 50,
) -> dict:
    await _hydrate_report_runtime(session)
    audit_page = inspection_report_store.audit_page(
        inspection_plan_id=inspection_plan_id,
        user=user,
        auth_store=auth_store,
        page=page,
        page_size=page_size,
    )
    return success_response(audit_page, request)


@router.get(
    "/plans/{inspectionPlanId}/report-versions/{reportVersionId}/download",
    name="inspection-report-download-deferred",
)
async def inspection_report_download_deferred(
    inspection_plan_id: Annotated[str, Path(alias="inspectionPlanId")],
    report_version_id: Annotated[str, Path(alias="reportVersionId")],
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_report_runtime(session)
    try:
        inspection_report_store.download_deferred(
            inspection_plan_id=inspection_plan_id,
            report_version_id=report_version_id,
            user=user,
            auth_store=auth_store,
            request_id=getattr(request.state, "request_id", None),
        )
    except AppError:
        await _save_report_runtime(session)
        await _commit_report_runtime(session)
        raise
    await _save_report_runtime(session)
    await _commit_report_runtime(session)
    return success_response({}, request)


@router.get("/plans/{inspectionPlanId}", name="inspection-plan-detail")
async def inspection_plan_detail(
    inspection_plan_id: Annotated[str, Path(alias="inspectionPlanId")],
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
) -> dict:
    plan = inspection_plan_store.plan_detail(
        inspection_plan_id=inspection_plan_id,
        user=user,
        auth_store=auth_store,
    )
    return success_response(plan, request)


@router.post(
    "/plans/{inspectionPlanId}/acknowledgement",
    name="inspection-plan-acknowledgement",
)
async def inspection_plan_acknowledgement(
    inspection_plan_id: Annotated[str, Path(alias="inspectionPlanId")],
    payload: InspectionPlanAcknowledgementRequest,
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    ack = inspection_plan_store.acknowledge_plan(
        inspection_plan_id=inspection_plan_id,
        user=user,
        auth_store=auth_store,
        payload=payload.model_dump(by_alias=True, exclude_none=True),
    )
    closed_task_ids = ack.get("sideEffects", {}).get("closedTaskIds", [])
    if _task_database_mode() and closed_task_ids:
        await task_runtime_repository.save_task_bundle(
            session,
            closed_task_ids,
            updated_by=user.user_id,
        )
        await session.commit()
    return success_response(ack, request)
