from typing import Annotated

from fastapi import APIRouter, Path, Request

from app.modules.compliance.core.responses import success_response
from app.modules.compliance.dependencies.auth import AuthStoreDep, CurrentUserDep
from app.modules.compliance.domain.dashboard_store import dashboard_store

router = APIRouter(tags=["dashboard"])


@router.get("/assessment/dashboard/overview", name="assessment-dashboard-overview")
async def assessment_dashboard_overview(
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
) -> dict:
    result = dashboard_store.assessment_overview(user=user, auth_store=auth_store)
    return success_response(result, request)


@router.get("/dashboard/governance", name="governance-dashboard")
async def governance_dashboard(
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
) -> dict:
    result = dashboard_store.governance_dashboard(user=user, auth_store=auth_store)
    return success_response(result, request)


@router.get("/dashboard/branches/{orgId}/portrait", name="branch-portrait")
async def branch_portrait(
    org_id: Annotated[str, Path(alias="orgId")],
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
) -> dict:
    result = dashboard_store.branch_portrait(
        org_id=org_id,
        user=user,
        auth_store=auth_store,
    )
    return success_response(result, request)
