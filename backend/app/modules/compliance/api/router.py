from fastapi import APIRouter, Body, Request

from app.modules.compliance.api.routes import (
    assessment,
    auth,
    contract,
    dashboard,
    files,
    foundation,
    health,
    inspection,
    integrations,
    issues,
    notifications,
    review_workbench,
    system,
    tasks,
    workflow,
)
from app.modules.compliance.core.responses import success_response

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(contract.router)
api_router.include_router(foundation.router)
api_router.include_router(auth.router)
api_router.include_router(system.router)
api_router.include_router(tasks.router)
api_router.include_router(assessment.router)
api_router.include_router(dashboard.router)
api_router.include_router(inspection.router)
api_router.include_router(files.router)
api_router.include_router(integrations.router)
api_router.include_router(issues.router)
api_router.include_router(notifications.router)
api_router.include_router(review_workbench.router)
api_router.include_router(workflow.router)

REQUIRED_BODY = Body(...)


@api_router.post("/_foundation/validation-sample", include_in_schema=False)
async def validation_sample(request: Request, payload: dict = REQUIRED_BODY) -> dict:
    return success_response({"received": payload}, request)
