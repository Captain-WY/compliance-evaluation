from fastapi import APIRouter, Request

from app.modules.compliance.core.responses import success_response
from app.modules.compliance.dependencies.auth import AuthServiceDep, AuthStoreDep, CurrentUserDep
from app.modules.compliance.schemas.auth import LoginRequest

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", name="auth-login")
async def login(
    payload: LoginRequest,
    request: Request,
    auth_service: AuthServiceDep,
) -> dict:
    return success_response(await auth_service.login(payload.username, payload.password), request)


@router.get("/me", name="auth-me")
async def current_user(
    request: Request,
    user: CurrentUserDep,
    store: AuthStoreDep,
) -> dict:
    return success_response(store.auth_user_view(user), request)
