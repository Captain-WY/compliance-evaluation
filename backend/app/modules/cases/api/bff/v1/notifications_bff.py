"""通知管理 BFF 路由 (2.S18).

挂载前缀: /api/bff/v1/notifications
全 POST，除 SSE 端点（GET，BFF 例外）。
"""
from __future__ import annotations

import asyncio
import json
from typing import AsyncGenerator

# 应用关闭信号 — 由 main.py lifespan 在 shutdown 阶段设置，通知所有 SSE 连接退出
sse_shutdown_event: asyncio.Event = asyncio.Event()

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ....core.config import get_settings
from ....core.database import get_db
from ....core.deps import get_current_user
from ....models.sys_users import SysUser
from ....schemas.notifications import (
    NotificationListRequest,
    MarkReadRequest,
    MarkAllReadRequest,
)
from ....services import notification_service

router = APIRouter()


@router.post("/list")
async def list_notifications(
    req: NotificationListRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await notification_service.list_notifications(
        req=req,
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        db=db,
    )
    return {"code": 200, "message": "获取成功", "data": data.model_dump()}


@router.post("/unread-count")
async def get_unread_count(
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await notification_service.get_unread_count(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        db=db,
    )
    return {"code": 200, "message": "获取成功", "data": data.model_dump()}


@router.post("/mark-read")
async def mark_read(
    req: MarkReadRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await notification_service.mark_read(
        req=req,
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        db=db,
    )
    return {"code": 200, "message": "标记已读成功", "data": None}


@router.post("/mark-all-read")
async def mark_all_read(
    req: MarkAllReadRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    count = await notification_service.mark_all_read(
        req=req,
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        db=db,
    )
    return {"code": 200, "message": "全部已读成功", "data": {"markedCount": count}}


async def _sse_event_generator(user_id: str, tenant_id: str) -> AsyncGenerator[str, None]:
    """SSE 事件流生成器，每 30 秒发送心跳 ping，支持优雅关闭.

    将 30s sleep 拆成 30×1s，每秒检查 sse_shutdown_event，
    确保服务关闭时连接在 ≤1s 内退出而不阻塞 uvicorn 的 graceful shutdown。
    """
    try:
        while not sse_shutdown_event.is_set():
            ping_event = json.dumps({"type": "ping", "userId": user_id})
            yield f"event: ping\ndata: {ping_event}\n\n"
            for _ in range(30):
                if sse_shutdown_event.is_set():
                    return
                await asyncio.sleep(1)
    except (asyncio.CancelledError, GeneratorExit):
        return


async def _get_sse_user(
    token: str = Query(..., description="Casdoor JWT access token (EventSource 不支持 header，从 query param 传入)"),
) -> SysUser:
    """SSE 专用认证：从 query param 读取 token，复用 get_current_user 逻辑."""
    from fastapi.security import HTTPAuthorizationCredentials
    fake_credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    return await get_current_user(credentials=fake_credentials)


@router.get("/sse")
async def notification_sse(
    request: Request,
    current_user: SysUser = Depends(_get_sse_user),
):
    """SSE 实时通知推送端点（D4=SSE，BFF 例外 GET 端点）."""
    settings = get_settings()
    origin = request.headers.get("origin", "")
    allowed_origin = origin if origin in settings.CORS_ORIGINS else settings.CORS_ORIGINS[0]

    return StreamingResponse(
        _sse_event_generator(user_id=current_user.id, tenant_id=current_user.tenant_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": allowed_origin,
            "Access-Control-Allow-Credentials": "true",
        },
    )
