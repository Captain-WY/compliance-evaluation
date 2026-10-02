from typing import Annotated

from fastapi import APIRouter, Depends, Path, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.compliance.core.config import get_settings
from app.modules.compliance.core.db import get_session
from app.modules.compliance.core.responses import success_response
from app.modules.compliance.dependencies.auth import AuthStoreDep, CurrentUserDep
from app.modules.compliance.domain.workflow_store import workflow_template_store
from app.modules.compliance.repositories.workflow_runtime import workflow_runtime_repository
from app.modules.compliance.schemas.workflow import WorkflowTemplateDraftUpdateRequest

router = APIRouter(prefix="/workflow/templates", tags=["workflow"])
DbSessionDep = Annotated[AsyncSession, Depends(get_session)]


def _database_mode() -> bool:
    return get_settings().workflow_runtime_persistence == "database"


async def _hydrate_workflow_templates(session: AsyncSession) -> None:
    if _database_mode():
        await workflow_runtime_repository.hydrate_workflow_template_store(session)


async def _save_runtime_state(session: AsyncSession) -> None:
    if _database_mode():
        await workflow_runtime_repository.save_runtime_state(session)


async def _commit_runtime(session: AsyncSession) -> None:
    if _database_mode():
        await session.commit()


@router.get("", name="workflow-template-list")
async def workflow_template_list(
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_workflow_templates(session)
    page_data = workflow_template_store.template_page(user=user, auth=auth_store)
    return success_response(page_data, request)


@router.get("/{templateId}", name="workflow-template-detail")
async def workflow_template_detail(
    template_id: Annotated[str, Path(alias="templateId")],
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_workflow_templates(session)
    detail = workflow_template_store.template_detail(
        template_id=template_id,
        user=user,
        auth=auth_store,
    )
    return success_response(detail, request)


@router.patch("/{templateId}", name="workflow-template-save-draft")
async def workflow_template_save_draft(
    template_id: Annotated[str, Path(alias="templateId")],
    payload: WorkflowTemplateDraftUpdateRequest,
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_workflow_templates(session)
    detail = workflow_template_store.save_draft(
        template_id=template_id,
        user=user,
        auth=auth_store,
        payload=payload.model_dump(by_alias=True, exclude_none=True, exclude_unset=True),
    )
    await _save_runtime_state(session)
    await _commit_runtime(session)
    return success_response(detail, request)


@router.post("/{templateId}/validate", name="workflow-template-validate")
async def workflow_template_validate(
    template_id: Annotated[str, Path(alias="templateId")],
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_workflow_templates(session)
    result = workflow_template_store.validate(
        template_id=template_id,
        user=user,
        auth=auth_store,
    )
    await _save_runtime_state(session)
    await _commit_runtime(session)
    return success_response(result, request)


@router.post("/{templateId}/publish", name="workflow-template-publish")
async def workflow_template_publish(
    template_id: Annotated[str, Path(alias="templateId")],
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_workflow_templates(session)
    result = workflow_template_store.publish(
        template_id=template_id,
        user=user,
        auth=auth_store,
    )
    await _save_runtime_state(session)
    await _commit_runtime(session)
    return success_response(result, request)
