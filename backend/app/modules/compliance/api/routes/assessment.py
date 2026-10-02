from typing import Annotated

from fastapi import APIRouter, Body, Depends, Path, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.compliance.core.config import get_settings
from app.modules.compliance.core.db import get_session
from app.modules.compliance.core.responses import success_response
from app.modules.compliance.dependencies.auth import AuthStoreDep, CurrentUserDep
from app.modules.compliance.domain.assessment_simulation_store import assessment_simulation_store
from app.modules.compliance.domain.cycle_store import cycle_store
from app.modules.compliance.domain.data_cockpit_store import data_cockpit_store
from app.modules.compliance.domain.indicator_store import indicator_store
from app.modules.compliance.domain.reporting_store import reporting_store
from app.modules.compliance.domain.result_store import result_store
from app.modules.compliance.domain.review_store import ReviewTaskVisibilityReadModel, review_store
from app.modules.compliance.domain.scheduler_store import assessment_scheduler_store
from app.modules.compliance.domain.scheme_store import scheme_store
from app.modules.compliance.repositories.assessment_runtime import assessment_runtime_repository
from app.modules.compliance.repositories.assessment_simulation_runtime import (
    assessment_simulation_runtime_repository,
)
from app.modules.compliance.repositories.data_cockpit_runtime import data_cockpit_runtime_repository
from app.modules.compliance.repositories.scheduler_runtime import scheduler_runtime_repository
from app.modules.compliance.repositories.task_runtime import task_runtime_repository
from app.modules.compliance.schemas.assessment import (
    ArchiveReasonRequest,
    AssessmentCycleCreateRequest,
    AssessmentCycleDispatchRequest,
    AssessmentCycleReminderRequest,
    AssessmentIndicatorDraftCreateRequest,
    AssessmentIndicatorDraftUpdateRequest,
    AssessmentLedgerImportRequest,
    AssessmentReportingSaveRequest,
    AssessmentResultConfirmRequest,
    AssessmentReviewDecisionRequest,
    AssessmentReviewSaveRequest,
    AssessmentScheduleDispatchNowRequest,
    AssessmentScheduleDraftSaveRequest,
    AssessmentSchemeArchiveRequest,
    AssessmentSchemeCommandRequest,
    AssessmentSchemeCopyRequest,
    AssessmentSchemeDraftCreatePreflightRequest,
    AssessmentSchemeDraftCreateRequest,
    AssessmentSchemeDraftUpdateRequest,
    AssessmentSchemeDraftValidateRequest,
    AssessmentSimulationRunRequest,
    DailyLedgerCreateRequest,
    DailyLedgerUpdateRequest,
    DataSyncEvidenceExportRequest,
    IgnoreDataSyncAlertRequest,
    OverwriteRerunRequest,
    RetryDataSyncRequest,
    ScheduleExecutionRetryRequest,
    ScoreAppealDecisionRequest,
    ScoreAppealSubmitRequest,
    ScoringValidationRequest,
    dump_model,
)

router = APIRouter(prefix="/assessment", tags=["assessment"])
DbSessionDep = Annotated[AsyncSession, Depends(get_session)]
SchemeCommandBody = Annotated[AssessmentSchemeCommandRequest, Body()]
SchemeCopyBody = Annotated[AssessmentSchemeCopyRequest, Body()]


def _runtime_db_enabled() -> bool:
    return get_settings().assessment_runtime_persistence == "database"


async def _hydrate_indicators(session: AsyncSession) -> None:
    if _runtime_db_enabled():
        await assessment_runtime_repository.hydrate_indicator_store(session)


async def _hydrate_schemes(session: AsyncSession) -> None:
    if _runtime_db_enabled():
        await assessment_runtime_repository.hydrate_scheme_store(session)


async def _hydrate_cycles(session: AsyncSession) -> None:
    if _runtime_db_enabled():
        await assessment_runtime_repository.hydrate_cycle_store(session)


async def _hydrate_schedules(session: AsyncSession) -> None:
    if _runtime_db_enabled():
        await scheduler_runtime_repository.hydrate_scheduler_store(session)


async def _hydrate_simulations(session: AsyncSession) -> None:
    if _runtime_db_enabled():
        await assessment_simulation_runtime_repository.hydrate_simulation_store(session)


async def _hydrate_data_cockpit(session: AsyncSession) -> None:
    if _runtime_db_enabled():
        await data_cockpit_runtime_repository.hydrate_data_cockpit_store(session)


async def _commit_runtime(session: AsyncSession) -> None:
    if _runtime_db_enabled():
        await session.commit()


async def _save_cycle_runtime(session: AsyncSession, cycle_id: str) -> None:
    if _runtime_db_enabled():
        await assessment_runtime_repository.save_cycle(session, cycle_id)
        await _commit_runtime(session)


async def _legacy_review_task_visibility(
    session: AsyncSession,
    *,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
) -> ReviewTaskVisibilityReadModel | None:
    if not _runtime_db_enabled():
        return None

    await _hydrate_cycles(session)
    records = []
    for project_id in sorted({task.cycle_id for task in review_store.review_tasks.values()}):
        records.extend(
            await task_runtime_repository.visible_project_tasks(
                session,
                project_id=project_id,
                user=user,
                auth_store=auth_store,
            ),
        )
    return ReviewTaskVisibilityReadModel(records)


@router.get("/indicators", name="assessment-indicator-list")
async def assessment_indicator_list(
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
    keyword: Annotated[str | None, Query()] = None,
    category_id: Annotated[str | None, Query(alias="categoryId")] = None,
    business_line: Annotated[str | None, Query(alias="businessLine")] = None,
    status: Annotated[str | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 20,
) -> dict:
    await _hydrate_indicators(session)
    indicators = indicator_store.indicator_page(
        user=user,
        auth_store=auth_store,
        keyword=keyword,
        category_id=category_id,
        business_line=business_line,
        status=status,
        page=page,
        page_size=page_size,
    )
    return success_response(indicators, request)


@router.post("/indicators", name="assessment-indicator-create")
async def assessment_indicator_create(
    payload: AssessmentIndicatorDraftCreateRequest,
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_indicators(session)
    indicator = indicator_store.create_indicator(
        user=user,
        auth_store=auth_store,
        payload=dump_model(payload),
    )
    if _runtime_db_enabled():
        await assessment_runtime_repository.save_indicator(session, indicator["indicatorId"])
        await _commit_runtime(session)
    return success_response(indicator, request)


@router.patch(
    "/indicators/{indicatorId}/versions/{versionId}",
    name="assessment-indicator-update-draft",
)
async def assessment_indicator_update_draft(
    indicator_id: Annotated[str, Path(alias="indicatorId")],
    version_id: Annotated[str, Path(alias="versionId")],
    payload: AssessmentIndicatorDraftUpdateRequest,
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_indicators(session)
    indicator = indicator_store.update_draft(
        indicator_id=indicator_id,
        version_id=version_id,
        user=user,
        auth_store=auth_store,
        payload=dump_model(payload),
    )
    if _runtime_db_enabled():
        await assessment_runtime_repository.save_indicator(session, indicator_id)
        await _commit_runtime(session)
    return success_response(indicator, request)


@router.post(
    "/indicators/{indicatorId}/versions/{versionId}/validate-scoring",
    name="assessment-indicator-validate-scoring",
)
async def assessment_indicator_validate_scoring(
    indicator_id: Annotated[str, Path(alias="indicatorId")],
    version_id: Annotated[str, Path(alias="versionId")],
    payload: ScoringValidationRequest,
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_indicators(session)
    result = indicator_store.validate_scoring(
        indicator_id=indicator_id,
        version_id=version_id,
        user=user,
        auth_store=auth_store,
        payload=dump_model(payload),
    )
    if _runtime_db_enabled():
        await assessment_runtime_repository.save_indicator(session, indicator_id)
        await _commit_runtime(session)
    return success_response(result, request)


@router.post(
    "/indicators/{indicatorId}/versions/{versionId}/publish",
    name="assessment-indicator-publish",
)
async def assessment_indicator_publish(
    indicator_id: Annotated[str, Path(alias="indicatorId")],
    version_id: Annotated[str, Path(alias="versionId")],
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_indicators(session)
    indicator = indicator_store.publish_version(
        indicator_id=indicator_id,
        version_id=version_id,
        user=user,
        auth_store=auth_store,
    )
    if _runtime_db_enabled():
        await assessment_runtime_repository.save_indicator(session, indicator_id)
        await _commit_runtime(session)
    return success_response(indicator, request)


@router.post(
    "/indicators/{indicatorId}/versions/{versionId}/archive",
    name="assessment-indicator-archive",
)
async def assessment_indicator_archive(
    indicator_id: Annotated[str, Path(alias="indicatorId")],
    version_id: Annotated[str, Path(alias="versionId")],
    payload: ArchiveReasonRequest,
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_indicators(session)
    indicator = indicator_store.archive_version(
        indicator_id=indicator_id,
        version_id=version_id,
        user=user,
        auth_store=auth_store,
        reason=payload.reason,
    )
    if _runtime_db_enabled():
        await assessment_runtime_repository.save_indicator(session, indicator_id)
        await _commit_runtime(session)
    return success_response(indicator, request)


@router.post(
    "/indicators/{indicatorId}/versions/{versionId}/clone",
    name="assessment-indicator-clone",
)
async def assessment_indicator_clone(
    indicator_id: Annotated[str, Path(alias="indicatorId")],
    version_id: Annotated[str, Path(alias="versionId")],
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_indicators(session)
    indicator = indicator_store.clone_version(
        indicator_id=indicator_id,
        version_id=version_id,
        user=user,
        auth_store=auth_store,
    )
    if _runtime_db_enabled():
        await assessment_runtime_repository.save_indicator(session, indicator_id)
        await _commit_runtime(session)
    return success_response(indicator, request)


@router.get("/schemes", name="assessment-scheme-list")
async def assessment_scheme_list(
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
    keyword: Annotated[str | None, Query()] = None,
    year: Annotated[int | None, Query()] = None,
    status: Annotated[str | None, Query()] = None,
    frequency: Annotated[str | None, Query()] = None,
    business_line: Annotated[str | None, Query(alias="businessLine")] = None,
    target_scope_mode: Annotated[str | None, Query(alias="targetScopeMode")] = None,
    updated_from: Annotated[str | None, Query(alias="updatedFrom")] = None,
    updated_to: Annotated[str | None, Query(alias="updatedTo")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 20,
) -> dict:
    await _hydrate_schemes(session)
    schemes = scheme_store.scheme_page(
        user=user,
        auth_store=auth_store,
        keyword=keyword,
        year=year,
        status=status,
        frequency=frequency,
        business_line=business_line,
        target_scope_mode=target_scope_mode,
        updated_from=updated_from,
        updated_to=updated_to,
        page=page,
        page_size=page_size,
    )
    return success_response(schemes, request)


@router.post("/schemes", name="assessment-scheme-create")
async def assessment_scheme_create(
    payload: AssessmentSchemeDraftCreateRequest,
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_schemes(session)
    scheme = scheme_store.create_scheme(
        user=user,
        auth_store=auth_store,
        payload=dump_model(payload),
    )
    if _runtime_db_enabled():
        await assessment_runtime_repository.save_scheme(session, scheme["schemeId"])
        await assessment_runtime_repository.save_scheme_command_keys(session)
        await _commit_runtime(session)
    return success_response(scheme, request)


@router.post("/schemes/validate", name="assessment-scheme-validate-create")
async def assessment_scheme_validate_create(
    payload: AssessmentSchemeDraftCreatePreflightRequest,
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_schemes(session)
    result = scheme_store.validate_scheme_payload(
        user=user,
        auth_store=auth_store,
        payload=dump_model(payload),
    )
    return success_response(result, request)


@router.get("/schemes/{schemeId}", name="assessment-scheme-detail")
async def assessment_scheme_detail(
    scheme_id: Annotated[str, Path(alias="schemeId")],
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_schemes(session)
    scheme = scheme_store.get_scheme_detail(
        scheme_id=scheme_id,
        user=user,
        auth_store=auth_store,
    )
    return success_response(scheme, request)


@router.post("/schemes/{schemeId}/validate", name="assessment-scheme-validate-draft")
async def assessment_scheme_validate_draft(
    scheme_id: Annotated[str, Path(alias="schemeId")],
    payload: AssessmentSchemeDraftValidateRequest,
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_schemes(session)
    result = scheme_store.validate_scheme_payload(
        user=user,
        auth_store=auth_store,
        payload=dump_model(payload),
        scheme_id=scheme_id,
    )
    return success_response(result, request)


@router.patch("/schemes/{schemeId}", name="assessment-scheme-update-draft")
async def assessment_scheme_update_draft(
    scheme_id: Annotated[str, Path(alias="schemeId")],
    payload: AssessmentSchemeDraftUpdateRequest,
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_schemes(session)
    scheme = scheme_store.update_draft(
        scheme_id=scheme_id,
        user=user,
        auth_store=auth_store,
        payload=dump_model(payload),
    )
    if _runtime_db_enabled():
        await assessment_runtime_repository.save_scheme(session, scheme_id)
        await assessment_runtime_repository.save_scheme_command_keys(session)
        await _commit_runtime(session)
    return success_response(scheme, request)


@router.post("/schemes/{schemeId}/publish", name="assessment-scheme-publish")
async def assessment_scheme_publish(
    scheme_id: Annotated[str, Path(alias="schemeId")],
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
    payload: SchemeCommandBody,
) -> dict:
    await _hydrate_schemes(session)
    scheme = scheme_store.publish_scheme(
        scheme_id=scheme_id,
        user=user,
        auth_store=auth_store,
        payload=dump_model(payload),
    )
    if _runtime_db_enabled():
        await assessment_runtime_repository.save_scheme(session, scheme_id)
        await assessment_runtime_repository.save_scheme_command_keys(session)
        await _commit_runtime(session)
    return success_response(scheme, request)


@router.post("/schemes/{schemeId}/copy", name="assessment-scheme-copy")
async def assessment_scheme_copy(
    scheme_id: Annotated[str, Path(alias="schemeId")],
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
    payload: SchemeCopyBody,
) -> dict:
    await _hydrate_schemes(session)
    scheme = scheme_store.copy_scheme(
        scheme_id=scheme_id,
        user=user,
        auth_store=auth_store,
        payload=dump_model(payload),
    )
    if _runtime_db_enabled():
        await assessment_runtime_repository.save_scheme(session, scheme["schemeId"])
        await assessment_runtime_repository.save_scheme_command_keys(session)
        await _commit_runtime(session)
    return success_response(scheme, request)


@router.delete("/schemes/{schemeId}", name="assessment-scheme-delete-draft")
async def assessment_scheme_delete_draft(
    scheme_id: Annotated[str, Path(alias="schemeId")],
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
    payload: SchemeCommandBody,
) -> dict:
    await _hydrate_schemes(session)
    result = scheme_store.delete_draft(
        scheme_id=scheme_id,
        user=user,
        auth_store=auth_store,
        payload=dump_model(payload),
    )
    if _runtime_db_enabled():
        await assessment_runtime_repository.delete_scheme(session, scheme_id)
        await assessment_runtime_repository.save_scheme_command_keys(session)
        await _commit_runtime(session)
    return success_response(result, request)


@router.post("/schemes/{schemeId}/archive", name="assessment-scheme-archive")
async def assessment_scheme_archive(
    scheme_id: Annotated[str, Path(alias="schemeId")],
    payload: AssessmentSchemeArchiveRequest,
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_schemes(session)
    scheme = scheme_store.archive_scheme(
        scheme_id=scheme_id,
        user=user,
        auth_store=auth_store,
        reason=payload.reason,
        payload=dump_model(payload),
    )
    if _runtime_db_enabled():
        await assessment_runtime_repository.save_scheme(session, scheme_id)
        await assessment_runtime_repository.save_scheme_command_keys(session)
        await _commit_runtime(session)
    return success_response(scheme, request)


@router.get("/schedules/{scheduleId}", name="assessment-schedule-detail")
async def assessment_schedule_detail(
    schedule_id: Annotated[str, Path(alias="scheduleId")],
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_schedules(session)
    detail = assessment_scheduler_store.schedule_detail(
        schedule_id=schedule_id,
        user=user,
        auth_store=auth_store,
    )
    return success_response(detail, request)


@router.patch("/schedules/{scheduleId}", name="assessment-schedule-save-draft")
async def assessment_schedule_save_draft(
    schedule_id: Annotated[str, Path(alias="scheduleId")],
    payload: AssessmentScheduleDraftSaveRequest,
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_schedules(session)
    detail = assessment_scheduler_store.save_draft(
        schedule_id=schedule_id,
        user=user,
        auth_store=auth_store,
        payload=dump_model(payload),
    )
    if _runtime_db_enabled():
        await scheduler_runtime_repository.save_runtime_state(session)
        await _commit_runtime(session)
    return success_response(detail, request)


@router.post("/schedules/{scheduleId}/activate", name="assessment-schedule-activate")
async def assessment_schedule_activate(
    schedule_id: Annotated[str, Path(alias="scheduleId")],
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_cycles(session)
    await _hydrate_schedules(session)
    result = assessment_scheduler_store.activate(
        schedule_id=schedule_id,
        user=user,
        auth_store=auth_store,
    )
    if _runtime_db_enabled():
        await scheduler_runtime_repository.save_runtime_state(session)
        await _commit_runtime(session)
    return success_response(result, request)


@router.post("/schedules/{scheduleId}/dispatch-now", name="assessment-schedule-dispatch-now")
async def assessment_schedule_dispatch_now(
    schedule_id: Annotated[str, Path(alias="scheduleId")],
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
    payload: AssessmentScheduleDispatchNowRequest | None = None,
) -> dict:
    await _hydrate_cycles(session)
    await _hydrate_schedules(session)
    result = assessment_scheduler_store.dispatch_now(
        schedule_id=schedule_id,
        user=user,
        auth_store=auth_store,
        payload=dump_model(payload) if payload else {},
    )
    if _runtime_db_enabled():
        await scheduler_runtime_repository.save_runtime_state(session)
        created_cycle_id = result.get("cycleId")
        if created_cycle_id and created_cycle_id in cycle_store.cycles:
            await assessment_runtime_repository.save_cycle(session, created_cycle_id)
        await _commit_runtime(session)
    return success_response(result, request)


@router.get("/schedules/{scheduleId}/executions", name="assessment-schedule-execution-list")
async def assessment_schedule_execution_list(
    schedule_id: Annotated[str, Path(alias="scheduleId")],
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 20,
) -> dict:
    await _hydrate_schedules(session)
    executions = assessment_scheduler_store.execution_page(
        schedule_id=schedule_id,
        user=user,
        auth_store=auth_store,
        page=page,
        page_size=page_size,
    )
    return success_response(executions, request)


@router.post("/schedule-executions/{executionId}/retry", name="assessment-schedule-execution-retry")
async def assessment_schedule_execution_retry(
    execution_id: Annotated[str, Path(alias="executionId")],
    payload: ScheduleExecutionRetryRequest,
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_cycles(session)
    await _hydrate_schedules(session)
    result = assessment_scheduler_store.retry_execution(
        execution_id=execution_id,
        user=user,
        auth_store=auth_store,
        payload=dump_model(payload),
    )
    if _runtime_db_enabled():
        await scheduler_runtime_repository.save_runtime_state(session)
        await _commit_runtime(session)
    return success_response(result, request)


@router.get("/cycles", name="assessment-cycle-list")
async def assessment_cycle_list(
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
    status: Annotated[str | None, Query()] = None,
    scheme_id: Annotated[str | None, Query(alias="schemeId")] = None,
    year: Annotated[int | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 20,
) -> dict:
    await _hydrate_cycles(session)
    cycles = cycle_store.cycle_page(
        user=user,
        auth_store=auth_store,
        status=status,
        scheme_id=scheme_id,
        year=year,
        page=page,
        page_size=page_size,
    )
    return success_response(cycles, request)


@router.post("/cycles", name="assessment-cycle-create")
async def assessment_cycle_create(
    payload: AssessmentCycleCreateRequest,
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_cycles(session)
    cycle = cycle_store.create_cycle(
        user=user,
        auth_store=auth_store,
        payload=dump_model(payload),
    )
    if _runtime_db_enabled():
        await assessment_runtime_repository.save_cycle(session, cycle["cycleId"])
        await _commit_runtime(session)
    return success_response(cycle, request)


@router.get("/cycles/{cycleId}", name="assessment-cycle-detail")
async def assessment_cycle_detail(
    cycle_id: Annotated[str, Path(alias="cycleId")],
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_cycles(session)
    cycle = cycle_store.cycle_detail_for_user(
        cycle_id=cycle_id,
        user=user,
        auth_store=auth_store,
    )
    return success_response(cycle, request)


@router.post("/cycles/{cycleId}/dispatch", name="assessment-cycle-dispatch")
async def assessment_cycle_dispatch(
    cycle_id: Annotated[str, Path(alias="cycleId")],
    payload: AssessmentCycleDispatchRequest,
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_cycles(session)
    cycle = cycle_store.dispatch_cycle(
        cycle_id=cycle_id,
        user=user,
        auth_store=auth_store,
        payload=dump_model(payload),
    )
    if _runtime_db_enabled():
        await assessment_runtime_repository.save_cycle(session, cycle_id)
        await _commit_runtime(session)
    return success_response(cycle, request)


@router.post("/cycles/{cycleId}/reminders", name="assessment-cycle-reminder")
async def assessment_cycle_reminder(
    cycle_id: Annotated[str, Path(alias="cycleId")],
    payload: AssessmentCycleReminderRequest,
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_cycles(session)
    cycle = cycle_store.send_reminder(
        cycle_id=cycle_id,
        user=user,
        auth_store=auth_store,
        payload=dump_model(payload),
    )
    if _runtime_db_enabled():
        await assessment_runtime_repository.save_cycle(session, cycle_id)
        await _commit_runtime(session)
    return success_response(cycle, request)


@router.post("/cycles/{cycleId}/publish-results", name="assessment-cycle-publish-results")
async def assessment_cycle_publish_results(
    cycle_id: Annotated[str, Path(alias="cycleId")],
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_cycles(session)
    cycle = result_store.publish_results(
        cycle_id=cycle_id,
        user=user,
        auth_store=auth_store,
    )
    await _save_cycle_runtime(session, cycle_id)
    return success_response(cycle, request)


@router.post("/cycles/{cycleId}/generate-results", name="assessment-result-generate")
async def assessment_result_generate(
    cycle_id: Annotated[str, Path(alias="cycleId")],
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_cycles(session)
    result = result_store.generate_results(
        cycle_id=cycle_id,
        user=user,
        auth_store=auth_store,
    )
    await _save_cycle_runtime(session, cycle_id)
    return success_response(result, request)


@router.post("/cycles/{cycleId}/archive", name="assessment-cycle-archive")
async def assessment_cycle_archive(
    cycle_id: Annotated[str, Path(alias="cycleId")],
    payload: ArchiveReasonRequest,
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_cycles(session)
    cycle = cycle_store.archive_cycle(
        cycle_id=cycle_id,
        user=user,
        auth_store=auth_store,
        reason=payload.reason,
    )
    if _runtime_db_enabled():
        await assessment_runtime_repository.save_cycle(session, cycle_id)
        await _commit_runtime(session)
    return success_response(cycle, request)


@router.post("/simulations", name="assessment-simulation-run")
async def assessment_simulation_run(
    payload: AssessmentSimulationRunRequest,
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_schemes(session)
    await _hydrate_simulations(session)
    run = assessment_simulation_store.run_simulation(
        user=user,
        auth_store=auth_store,
        payload=dump_model(payload),
    )
    if _runtime_db_enabled():
        await assessment_simulation_runtime_repository.save_run(session, run["simulationId"])
        await _commit_runtime(session)
    return success_response(run, request)


@router.get("/simulations/{simulationId}", name="assessment-simulation-detail")
async def assessment_simulation_detail(
    simulation_id: Annotated[str, Path(alias="simulationId")],
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_simulations(session)
    run = assessment_simulation_store.detail(
        simulation_id=simulation_id,
        user=user,
        auth_store=auth_store,
    )
    return success_response(run, request)


@router.get("/data-sources/health", name="assessment-data-source-health")
async def assessment_data_source_health(
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_data_cockpit(session)
    summary = data_cockpit_store.health_summary(user=user, auth_store=auth_store)
    return success_response(summary, request)


@router.get("/data-sync/jobs", name="assessment-data-sync-job-list")
async def assessment_data_sync_job_list(
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
    time_range: Annotated[str | None, Query(alias="timeRange")] = None,
    source: Annotated[str | None, Query()] = None,
    status: Annotated[str | None, Query()] = None,
    keyword: Annotated[str | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 20,
) -> dict:
    await _hydrate_data_cockpit(session)
    jobs = data_cockpit_store.job_page(
        user=user,
        auth_store=auth_store,
        time_range=time_range,
        source=source,
        status=status,
        keyword=keyword,
        page=page,
        page_size=page_size,
    )
    return success_response(jobs, request)


@router.get("/data-sync/jobs/{jobId}/snapshot", name="assessment-data-sync-job-snapshot")
async def assessment_data_sync_job_snapshot(
    job_id: Annotated[str, Path(alias="jobId")],
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_data_cockpit(session)
    snapshot = data_cockpit_store.snapshot(
        job_id=job_id,
        user=user,
        auth_store=auth_store,
    )
    return success_response(snapshot, request)


@router.post("/data-sync/jobs/{jobId}/retry", name="assessment-data-sync-job-retry")
async def assessment_data_sync_job_retry(
    job_id: Annotated[str, Path(alias="jobId")],
    payload: RetryDataSyncRequest,
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_data_cockpit(session)
    result = data_cockpit_store.retry_job(
        job_id=job_id,
        user=user,
        auth_store=auth_store,
        payload=dump_model(payload),
    )
    if _runtime_db_enabled():
        await data_cockpit_runtime_repository.save_runtime_state(session)
        await _commit_runtime(session)
    return success_response(result, request)


@router.post("/data-sync/alerts/{alertId}/ignore", name="assessment-data-sync-alert-ignore")
async def assessment_data_sync_alert_ignore(
    alert_id: Annotated[str, Path(alias="alertId")],
    payload: IgnoreDataSyncAlertRequest,
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_data_cockpit(session)
    result = data_cockpit_store.ignore_alert(
        alert_id=alert_id,
        user=user,
        auth_store=auth_store,
        payload=dump_model(payload),
    )
    if _runtime_db_enabled():
        await data_cockpit_runtime_repository.save_runtime_state(session)
        await _commit_runtime(session)
    return success_response(result, request)


@router.post(
    "/data-sync/jobs/{jobId}/overwrite-rerun",
    name="assessment-data-sync-overwrite-rerun",
)
async def assessment_data_sync_overwrite_rerun(
    job_id: Annotated[str, Path(alias="jobId")],
    payload: OverwriteRerunRequest,
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_data_cockpit(session)
    result = data_cockpit_store.overwrite_rerun(
        job_id=job_id,
        user=user,
        auth_store=auth_store,
        payload=dump_model(payload),
    )
    if _runtime_db_enabled():
        await data_cockpit_runtime_repository.save_runtime_state(session)
        await _commit_runtime(session)
    return success_response(result, request)


@router.post("/data-sync/exports", name="assessment-data-sync-evidence-export")
async def assessment_data_sync_evidence_export(
    payload: DataSyncEvidenceExportRequest,
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_data_cockpit(session)
    result = data_cockpit_store.request_evidence_export(
        user=user,
        auth_store=auth_store,
        payload=dump_model(payload),
    )
    if _runtime_db_enabled():
        await data_cockpit_runtime_repository.save_runtime_state(session)
        await _commit_runtime(session)
    return success_response(result, request)


@router.get("/reporting-tasks", name="assessment-reporting-list")
async def assessment_reporting_list(
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    status: Annotated[str | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 20,
) -> dict:
    tasks = reporting_store.reporting_page(
        user=user,
        auth_store=auth_store,
        status=status,
        page=page,
        page_size=page_size,
    )
    return success_response(tasks, request)


@router.get("/reporting-tasks/{reportingTaskId}", name="assessment-reporting-detail")
async def assessment_reporting_detail(
    reporting_task_id: Annotated[str, Path(alias="reportingTaskId")],
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
) -> dict:
    task = reporting_store.reporting_detail(
        reporting_task_id=reporting_task_id,
        user=user,
        auth_store=auth_store,
    )
    return success_response(task, request)


@router.patch("/reporting-tasks/{reportingTaskId}", name="assessment-reporting-save-draft")
async def assessment_reporting_save_draft(
    reporting_task_id: Annotated[str, Path(alias="reportingTaskId")],
    payload: AssessmentReportingSaveRequest,
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_cycles(session)
    task = reporting_store.save_draft(
        reporting_task_id=reporting_task_id,
        user=user,
        auth_store=auth_store,
        payload=dump_model(payload),
    )
    await _save_cycle_runtime(session, task["cycleId"])
    return success_response(task, request)


@router.post("/reporting-tasks/{reportingTaskId}/submit", name="assessment-reporting-submit")
async def assessment_reporting_submit(
    reporting_task_id: Annotated[str, Path(alias="reportingTaskId")],
    payload: AssessmentReportingSaveRequest,
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_cycles(session)
    task = reporting_store.submit(
        reporting_task_id=reporting_task_id,
        user=user,
        auth_store=auth_store,
        payload=dump_model(payload),
    )
    review_store.materialize_from_reporting(auth_store)
    await _save_cycle_runtime(session, task["cycleId"])
    return success_response(task, request)


@router.post("/reporting-tasks/{reportingTaskId}/recall", name="assessment-reporting-recall")
async def assessment_reporting_recall(
    reporting_task_id: Annotated[str, Path(alias="reportingTaskId")],
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_cycles(session)
    task = reporting_store.recall(
        reporting_task_id=reporting_task_id,
        user=user,
        auth_store=auth_store,
    )
    review_store.materialize_from_reporting(auth_store)
    await _save_cycle_runtime(session, task["cycleId"])
    return success_response(task, request)


@router.post(
    "/reporting-tasks/{reportingTaskId}/import-ledger",
    name="assessment-reporting-import-ledger",
)
async def assessment_reporting_import_ledger(
    reporting_task_id: Annotated[str, Path(alias="reportingTaskId")],
    payload: AssessmentLedgerImportRequest,
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
) -> dict:
    task = reporting_store.import_ledger(
        reporting_task_id=reporting_task_id,
        user=user,
        auth_store=auth_store,
        payload=dump_model(payload),
    )
    return success_response(task, request)


@router.get("/daily-ledger", name="assessment-daily-ledger-list")
async def assessment_daily_ledger_list(
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    status: Annotated[str | None, Query()] = None,
    include_deleted: Annotated[bool, Query(alias="includeDeleted")] = False,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 20,
) -> dict:
    entries = reporting_store.ledger_page(
        user=user,
        auth_store=auth_store,
        status=status,
        include_deleted=include_deleted,
        page=page,
        page_size=page_size,
    )
    return success_response(entries, request)


@router.post("/daily-ledger", name="assessment-daily-ledger-create")
async def assessment_daily_ledger_create(
    payload: DailyLedgerCreateRequest,
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
) -> dict:
    entry = reporting_store.create_ledger(
        user=user,
        auth_store=auth_store,
        payload=dump_model(payload),
    )
    return success_response(entry, request)


@router.patch("/daily-ledger/{ledgerEntryId}", name="assessment-daily-ledger-update")
async def assessment_daily_ledger_update(
    ledger_entry_id: Annotated[str, Path(alias="ledgerEntryId")],
    payload: DailyLedgerUpdateRequest,
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
) -> dict:
    entry = reporting_store.update_ledger(
        ledger_entry_id=ledger_entry_id,
        user=user,
        auth_store=auth_store,
        payload=dump_model(payload),
    )
    return success_response(entry, request)


@router.delete("/daily-ledger/{ledgerEntryId}", name="assessment-daily-ledger-soft-delete")
async def assessment_daily_ledger_soft_delete(
    ledger_entry_id: Annotated[str, Path(alias="ledgerEntryId")],
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
) -> dict:
    entry = reporting_store.soft_delete_ledger(
        ledger_entry_id=ledger_entry_id,
        user=user,
        auth_store=auth_store,
    )
    return success_response(entry, request)


@router.get("/review-tasks", name="assessment-review-list")
async def assessment_review_list(
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
    status: Annotated[str | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 20,
) -> dict:
    task_visibility = await _legacy_review_task_visibility(
        session,
        user=user,
        auth_store=auth_store,
    )
    tasks = review_store.review_page(
        user=user,
        auth_store=auth_store,
        task_visibility=task_visibility,
        status=status,
        page=page,
        page_size=page_size,
    )
    return success_response(tasks, request)


@router.get("/review-tasks/{reviewTaskId}", name="assessment-review-detail")
async def assessment_review_detail(
    review_task_id: Annotated[str, Path(alias="reviewTaskId")],
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    task_visibility = await _legacy_review_task_visibility(
        session,
        user=user,
        auth_store=auth_store,
    )
    task = review_store.review_detail(
        review_task_id=review_task_id,
        user=user,
        auth_store=auth_store,
        task_visibility=task_visibility,
    )
    return success_response(task, request)


@router.post("/review-tasks/{reviewTaskId}/start", name="assessment-review-start")
async def assessment_review_start(
    review_task_id: Annotated[str, Path(alias="reviewTaskId")],
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    task_visibility = await _legacy_review_task_visibility(
        session,
        user=user,
        auth_store=auth_store,
    )
    task = review_store.start_review(
        review_task_id=review_task_id,
        user=user,
        auth_store=auth_store,
        task_visibility=task_visibility,
    )
    await _save_cycle_runtime(session, task["cycleId"])
    return success_response(task, request)


@router.patch("/review-tasks/{reviewTaskId}", name="assessment-review-save")
async def assessment_review_save(
    review_task_id: Annotated[str, Path(alias="reviewTaskId")],
    payload: AssessmentReviewSaveRequest,
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    task_visibility = await _legacy_review_task_visibility(
        session,
        user=user,
        auth_store=auth_store,
    )
    task = review_store.save_review(
        review_task_id=review_task_id,
        user=user,
        auth_store=auth_store,
        payload=dump_model(payload),
        task_visibility=task_visibility,
    )
    await _save_cycle_runtime(session, task["cycleId"])
    return success_response(task, request)


@router.post("/review-tasks/{reviewTaskId}/decision", name="assessment-review-decision")
async def assessment_review_decision(
    review_task_id: Annotated[str, Path(alias="reviewTaskId")],
    payload: AssessmentReviewDecisionRequest,
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    task_visibility = await _legacy_review_task_visibility(
        session,
        user=user,
        auth_store=auth_store,
    )
    task = review_store.decide(
        review_task_id=review_task_id,
        user=user,
        auth_store=auth_store,
        payload=dump_model(payload),
        task_visibility=task_visibility,
    )
    await _save_cycle_runtime(session, task["cycleId"])
    return success_response(task, request)


@router.get("/results", name="assessment-result-list")
async def assessment_result_list(
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
    status: Annotated[str | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 20,
) -> dict:
    await _hydrate_cycles(session)
    results = result_store.result_page(
        user=user,
        auth_store=auth_store,
        status=status,
        page=page,
        page_size=page_size,
    )
    return success_response(results, request)


@router.get("/results/{resultId}", name="assessment-result-detail")
async def assessment_result_detail(
    result_id: Annotated[str, Path(alias="resultId")],
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_cycles(session)
    result = result_store.result_detail(
        result_id=result_id,
        user=user,
        auth_store=auth_store,
    )
    return success_response(result, request)


@router.post("/results/{resultId}/confirm", name="assessment-result-confirm")
async def assessment_result_confirm(
    result_id: Annotated[str, Path(alias="resultId")],
    payload: AssessmentResultConfirmRequest,
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_cycles(session)
    result = result_store.confirm_result(
        result_id=result_id,
        user=user,
        auth_store=auth_store,
        payload=dump_model(payload),
    )
    await _save_cycle_runtime(session, result["cycleId"])
    return success_response(result, request)


@router.post("/results/{resultId}/finalize", name="assessment-result-finalize")
async def assessment_result_finalize(
    result_id: Annotated[str, Path(alias="resultId")],
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_cycles(session)
    result = result_store.finalize_result(
        result_id=result_id,
        user=user,
        auth_store=auth_store,
    )
    await _save_cycle_runtime(session, result["cycleId"])
    return success_response(result, request)


@router.post("/results/{resultId}/appeals", name="assessment-score-appeal-submit")
async def assessment_score_appeal_submit(
    result_id: Annotated[str, Path(alias="resultId")],
    payload: ScoreAppealSubmitRequest,
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_cycles(session)
    appeal = result_store.submit_appeal(
        result_id=result_id,
        user=user,
        auth_store=auth_store,
        payload=dump_model(payload),
    )
    await _save_cycle_runtime(session, result_store.results[appeal["resultId"]].cycle_id)
    return success_response(appeal, request)


@router.post(
    "/score-appeals/{scoreAppealId}/decision",
    name="assessment-score-appeal-decision",
)
async def assessment_score_appeal_decision(
    score_appeal_id: Annotated[str, Path(alias="scoreAppealId")],
    payload: ScoreAppealDecisionRequest,
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_cycles(session)
    appeal = result_store.decide_appeal(
        score_appeal_id=score_appeal_id,
        user=user,
        auth_store=auth_store,
        payload=dump_model(payload),
    )
    await _save_cycle_runtime(session, result_store.results[appeal["resultId"]].cycle_id)
    return success_response(appeal, request)
