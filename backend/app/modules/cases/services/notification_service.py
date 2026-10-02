"""通知管理 Service (2.S18).

端点映射:
  POST /notifications/list          → list_notifications
  POST /notifications/unread-count  → get_unread_count
  POST /notifications/mark-read     → mark_read
  POST /notifications/mark-all-read → mark_all_read
  GET  /notifications/sse           → (router 层直接实现 SSE 流)
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.exceptions import BusinessException
from ..enums.case_enums import NotifyType
from ..enums.labels import label_of
from ..models.sys_notifications import SysNotification
from ..schemas.notifications import (
    NotificationListRequest,
    NotificationListResponse,
    NotificationItem,
    UnreadCountResponse,
    MarkReadRequest,
    MarkAllReadRequest,
)

_VALID_NOTIFY_TYPES = {e.value for e in NotifyType}


def _notification_item(n: SysNotification) -> NotificationItem:
    return NotificationItem(
        notificationId=n.id,
        notifyType=n.notify_type,
        notifyTypeName=label_of(n.notify_type) if n.notify_type else "",
        title=n.title,
        content=n.content,
        referenceUrl=n.reference_url,
        isRead=n.is_read or False,
        readAt=n.read_at.isoformat() if n.read_at else None,
        createdAt=n.created_at.isoformat() if n.created_at else "",
    )


async def list_notifications(
    req: NotificationListRequest,
    tenant_id: str,
    user_id: str,
    db: AsyncSession,
) -> NotificationListResponse:
    stmt = (
        select(SysNotification)
        .where(
            SysNotification.is_deleted == False,
            SysNotification.tenant_id == tenant_id,
            SysNotification.user_id == user_id,
        )
    )
    if req.notifyType:
        stmt = stmt.where(SysNotification.notify_type == req.notifyType)
    if req.isRead is not None:
        stmt = stmt.where(SysNotification.is_read == req.isRead)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar_one()

    stmt = stmt.order_by(SysNotification.created_at.desc())
    stmt = stmt.offset((req.page - 1) * req.pageSize).limit(req.pageSize)
    rows = (await db.execute(stmt)).scalars().all()

    return NotificationListResponse(
        total=total,
        page=req.page,
        pageSize=req.pageSize,
        items=[_notification_item(n) for n in rows],
    )


async def get_unread_count(
    tenant_id: str,
    user_id: str,
    db: AsyncSession,
) -> UnreadCountResponse:
    stmt = select(func.count()).where(
        SysNotification.is_deleted == False,
        SysNotification.tenant_id == tenant_id,
        SysNotification.user_id == user_id,
        SysNotification.is_read == False,
    )
    count = (await db.execute(stmt)).scalar_one()
    return UnreadCountResponse(unreadCount=count)


async def mark_read(
    req: MarkReadRequest,
    tenant_id: str,
    user_id: str,
    db: AsyncSession,
) -> None:
    async with db.begin():
        stmt = select(SysNotification).where(
            SysNotification.is_deleted == False,
            SysNotification.tenant_id == tenant_id,
            SysNotification.id == req.notificationId,
        )
        notif = (await db.execute(stmt)).scalar_one_or_none()
        if not notif:
            raise BusinessException(code=5400, message="通知不存在")
        if notif.user_id != user_id:
            raise BusinessException(code=5401, message="无权操作此通知")

        now = datetime.now(timezone.utc)
        await db.execute(
            update(SysNotification)
            .where(SysNotification.id == req.notificationId)
            .values(is_read=True, read_at=now, updated_at=now)
        )


async def mark_all_read(
    req: MarkAllReadRequest,
    tenant_id: str,
    user_id: str,
    db: AsyncSession,
) -> int:
    where_clauses = [
        SysNotification.is_deleted == False,
        SysNotification.tenant_id == tenant_id,
        SysNotification.user_id == user_id,
        SysNotification.is_read == False,
    ]
    if req.notifyType:
        where_clauses.append(SysNotification.notify_type == req.notifyType)

    now = datetime.now(timezone.utc)
    async with db.begin():
        result = await db.execute(
            update(SysNotification)
            .where(*where_clauses)
            .values(is_read=True, read_at=now, updated_at=now)
        )
    return result.rowcount


async def push_notification(
    tenant_id: str,
    user_id: str,
    notify_type: str,
    title: str,
    content: str | None,
    reference_url: str | None,
    db: AsyncSession,
) -> SysNotification:
    """内部工具方法：在现有事务内创建通知记录（由审批/告警等 service 调用）."""
    notif = SysNotification(
        tenant_id=tenant_id,
        user_id=user_id,
        notify_type=notify_type,
        title=title,
        content=content,
        reference_url=reference_url,
        is_read=False,
    )
    db.add(notif)
    await db.flush()
    return notif
