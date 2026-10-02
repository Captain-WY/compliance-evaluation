"""智能收件箱 BFF Router (2.S15).

挂载路径: POST /api/bff/v1/inbox/*

端点:
  POST /inbox/emails/list              收件箱邮件列表（分页 + 状态/已读过滤）
  POST /inbox/emails/detail            邮件详情（副作用: 自动 mark-read）
  POST /inbox/emails/mark-read         标记已读
  POST /inbox/emails/convert-to-clue   一键转线索
  POST /inbox/emails/link-to-case      关联到现有案件
  POST /inbox/emails/ignore            忽略/归档邮件
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ....core.database import get_db
from ....core.deps import get_current_user
from ....models.sys_users import SysUser
from ....schemas.inbox_emails import (
    InboxEmailConvertToClueRequest,
    InboxEmailConvertToClueResponse,
    InboxEmailDetail,
    InboxEmailDetailRequest,
    InboxEmailIgnoreRequest,
    InboxEmailIgnoreResponse,
    InboxEmailLinkToCaseRequest,
    InboxEmailLinkToCaseResponse,
    InboxEmailListRequest,
    InboxEmailListResponse,
    InboxEmailMarkReadRequest,
    InboxEmailMarkReadResponse,
)
from ....services import inbox_email_service

router = APIRouter()


@router.post("/emails/list", response_model=InboxEmailListResponse)
async def list_emails(
    body: InboxEmailListRequest,
    db: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
):
    return await inbox_email_service.list_emails(
        db,
        tenant_id=current_user.tenant_id,
        processing_status=body.processing_status,
        is_read=body.is_read,
        ai_recommendation=body.ai_recommendation,
        keyword=body.keyword,
        page=body.page,
        page_size=body.page_size,
    )


@router.post("/emails/detail", response_model=InboxEmailDetail)
async def get_email_detail(
    body: InboxEmailDetailRequest,
    db: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
):
    return await inbox_email_service.get_email_detail(
        db,
        email_id=body.email_id,
        tenant_id=current_user.tenant_id,
        operator=current_user,
    )


@router.post("/emails/mark-read", response_model=InboxEmailMarkReadResponse)
async def mark_read(
    body: InboxEmailMarkReadRequest,
    db: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
):
    return await inbox_email_service.mark_read(
        db,
        email_id=body.email_id,
        tenant_id=current_user.tenant_id,
        operator=current_user,
    )


@router.post("/emails/convert-to-clue", response_model=InboxEmailConvertToClueResponse)
async def convert_to_clue(
    body: InboxEmailConvertToClueRequest,
    db: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
):
    return await inbox_email_service.convert_to_clue(
        db,
        tenant_id=current_user.tenant_id,
        operator=current_user,
        email_id=body.email_id,
        clue_title=body.clue_title,
        description=body.description,
        assignee_id=body.assignee_id,
        estimated_amount=body.estimated_amount,
        opponent_name=body.opponent_name,
    )


@router.post("/emails/link-to-case", response_model=InboxEmailLinkToCaseResponse)
async def link_to_case(
    body: InboxEmailLinkToCaseRequest,
    db: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
):
    return await inbox_email_service.link_to_case(
        db,
        tenant_id=current_user.tenant_id,
        operator=current_user,
        email_id=body.email_id,
        case_id=body.case_id,
        note=body.note,
    )


@router.post("/emails/ignore", response_model=InboxEmailIgnoreResponse)
async def ignore_email(
    body: InboxEmailIgnoreRequest,
    db: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
):
    return await inbox_email_service.ignore_email(
        db,
        tenant_id=current_user.tenant_id,
        operator=current_user,
        email_id=body.email_id,
        reason=body.reason,
    )
