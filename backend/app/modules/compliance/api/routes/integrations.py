from fastapi import APIRouter, Request

from app.modules.compliance.core.responses import success_response
from app.modules.compliance.dependencies.auth import AuthStoreDep, CurrentUserDep
from app.modules.compliance.domain.evidence_store import evidence_store
from app.modules.compliance.schemas.inspection import EkpReminderCreateRequest

router = APIRouter(prefix="/integrations", tags=["integrations"])


@router.post("/ekp/reminders", name="ekp-reminder-create")
async def ekp_reminder_create(
    payload: EkpReminderCreateRequest,
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
) -> dict:
    event = evidence_store.create_ekp_reminder(
        user=user,
        auth_store=auth_store,
        target_type=payload.target_type,
        target_id=payload.target_id,
        message=payload.message,
        channel=payload.channel,
    )
    return success_response(event, request)
