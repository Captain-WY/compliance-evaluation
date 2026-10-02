from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.compliance.core.config import get_settings
from app.modules.compliance.core.db import get_session
from app.modules.compliance.core.responses import success_response
from app.modules.compliance.dependencies.auth import AuthStoreDep, CurrentUserDep
from app.modules.compliance.domain.notification_store import notification_store
from app.modules.compliance.repositories.notification_runtime import notification_runtime_repository

router = APIRouter(prefix="/notifications", tags=["notifications"])
DbSessionDep = Annotated[AsyncSession, Depends(get_session)]


def _database_mode() -> bool:
    return get_settings().notification_runtime_persistence == "database"


async def _hydrate_notifications(session: AsyncSession) -> None:
    if _database_mode():
        await notification_runtime_repository.hydrate_notification_store(session)


async def _commit_runtime(session: AsyncSession) -> None:
    if _database_mode():
        await session.commit()


@router.get("", name="notification-list")
async def notification_list(
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
    type: Annotated[str | None, Query()] = None,
    is_read: Annotated[bool | None, Query(alias="isRead")] = None,
    source_module: Annotated[str | None, Query(alias="sourceModule")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 20,
) -> dict:
    await _hydrate_notifications(session)
    page_data = notification_store.notification_page(
        user=user,
        auth_store=auth_store,
        type=type,
        is_read=is_read,
        source_module=source_module,
        page=page,
        page_size=page_size,
    )
    return success_response(page_data, request)


@router.get("/unread-count", name="notification-unread-count")
async def notification_unread_count(
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_notifications(session)
    unread_count = notification_store.unread_count(user=user, auth_store=auth_store)
    return success_response(unread_count, request)


@router.post("/{notificationId}/read", name="notification-mark-read")
async def notification_mark_read(
    notification_id: Annotated[str, Path(alias="notificationId")],
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_notifications(session)
    notification = notification_store.mark_read(
        notification_id=notification_id,
        user=user,
        auth_store=auth_store,
    )
    state = notification_store.recipient_states[(notification_id, user.user_id)]
    if _database_mode():
        await notification_runtime_repository.save_recipient_state(session, state)
    await _commit_runtime(session)
    return success_response(notification, request)


@router.post("/mark-all-read", name="notification-mark-all-read")
async def notification_mark_all_read(
    request: Request,
    user: CurrentUserDep,
    auth_store: AuthStoreDep,
    session: DbSessionDep,
) -> dict:
    await _hydrate_notifications(session)
    result = notification_store.mark_all_read(user=user, auth_store=auth_store)
    if _database_mode():
        await notification_runtime_repository.save_user_recipient_states(session, user.user_id)
    await _commit_runtime(session)
    return success_response(result, request)
