"""智能收件箱 Service (2.S15).

端点映射:
  POST /inbox/emails/list            → list_emails
  POST /inbox/emails/detail          → get_email_detail  (副作用: 自动 mark-read)
  POST /inbox/emails/mark-read       → mark_read
  POST /inbox/emails/convert-to-clue → convert_to_clue
  POST /inbox/emails/link-to-case    → link_to_case
  POST /inbox/emails/ignore          → ignore_email

处理状态机 (终态不可逆):
  UNPROCESSED ──(convert-to-clue)──> CONVERTED_TO_CLUE
  UNPROCESSED ──(link-to-case)──>    LINKED_TO_CASE
  UNPROCESSED ──(ignore)──>          IGNORED
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.exceptions import BusinessException
from ..enums.case_enums import AiRecommendation, ClueSourceType, ClueStatus, InboxEmailProcessingStatus
from ..enums.labels import label_of
from ..models.case_clues import CaseClue
from ..models.inbox_emails import InboxEmail
from ..models.sys_users import SysUser
from ..services.audit_log_service import write_audit_log

_SENTINEL_CASE_ID = "_GLOBAL_"

# 终态集合：已处理的邮件不可再处理
_PROCESSED_STATUSES = {
    InboxEmailProcessingStatus.CONVERTED_TO_CLUE.value,
    InboxEmailProcessingStatus.LINKED_TO_CASE.value,
    InboxEmailProcessingStatus.IGNORED.value,
}

_D4_STUB_SUMMARY_TPL = "[AI 摘要 Stub] 邮件来自 {sender}，主题：{subject}"


def _ai_summary_stub(email: InboxEmail) -> str:
    return _D4_STUB_SUMMARY_TPL.format(
        sender=email.sender_address or "",
        subject=email.subject or "",
    )


def _email_item(e: InboxEmail) -> dict:
    ai_tags: list[str] = e.ai_tags if isinstance(e.ai_tags, list) else []
    return {
        "email_id": e.id,
        "subject": e.subject,
        "sender_address": e.sender_address,
        "sender_name": e.sender_name,
        "received_at": e.received_at,
        "has_attachments": e.has_attachments or False,
        "is_read": e.is_read or False,
        "processing_status": e.processing_status,
        "processing_status_name": label_of(e.processing_status) if e.processing_status else "",
        "ai_summary": e.ai_summary or _ai_summary_stub(e),
        "ai_recommendation": e.ai_recommendation or AiRecommendation.SUGGEST_CLUE.value,
        "ai_recommendation_name": label_of(e.ai_recommendation or AiRecommendation.SUGGEST_CLUE.value),
        "ai_tags": ai_tags,
    }


def _email_detail(e: InboxEmail) -> dict:
    ai_tags: list[str] = e.ai_tags if isinstance(e.ai_tags, list) else []
    return {
        "email_id": e.id,
        "subject": e.subject,
        "sender_address": e.sender_address,
        "sender_name": e.sender_name,
        "recipient_to": e.recipient_to,
        "recipient_cc": e.recipient_cc,
        "received_at": e.received_at,
        "has_attachments": e.has_attachments or False,
        "body_html": e.body_html,
        "body_text": e.body_text,
        "is_read": e.is_read or False,
        "processing_status": e.processing_status,
        "processing_status_name": label_of(e.processing_status) if e.processing_status else "",
        "ai_summary": e.ai_summary or _ai_summary_stub(e),
        "ai_recommendation": e.ai_recommendation or AiRecommendation.SUGGEST_CLUE.value,
        "ai_recommendation_name": label_of(e.ai_recommendation or AiRecommendation.SUGGEST_CLUE.value),
        "ai_tags": ai_tags,
        "processed_by": e.processed_by,
        "processed_at": e.processed_at,
    }


async def _get_email_or_404(session: AsyncSession, email_id: str, tenant_id: str) -> InboxEmail:
    row = (
        await session.execute(
            select(InboxEmail).where(
                InboxEmail.id == email_id,
                InboxEmail.tenant_id == tenant_id,
                InboxEmail.is_deleted.is_(False),
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise BusinessException(code=4310, message=f"邮件 {email_id} 不存在")
    return row


def _guard_unprocessed(email: InboxEmail) -> None:
    """4311: 已处理的邮件不可再处理."""
    if email.processing_status in _PROCESSED_STATUSES:
        raise BusinessException(
            code=4311,
            message=f"邮件已处理 (状态={email.processing_status})，不允许重复操作",
        )


async def list_emails(
    session: AsyncSession,
    *,
    tenant_id: str,
    processing_status: str | None,
    is_read: bool | None,
    ai_recommendation: str | None,
    keyword: str | None,
    page: int,
    page_size: int,
) -> dict:
    filters = [InboxEmail.tenant_id == tenant_id, InboxEmail.is_deleted.is_(False)]
    if processing_status:
        filters.append(InboxEmail.processing_status == processing_status)
    if is_read is not None:
        filters.append(InboxEmail.is_read.is_(is_read))
    if ai_recommendation:
        filters.append(InboxEmail.ai_recommendation == ai_recommendation)
    if keyword:
        kw = f"%{keyword}%"
        filters.append(or_(InboxEmail.subject.ilike(kw), InboxEmail.sender_address.ilike(kw)))

    total = (
        await session.execute(select(func.count(InboxEmail.id)).where(*filters))
    ).scalar() or 0

    unread_count = (
        await session.execute(
            select(func.count(InboxEmail.id)).where(
                InboxEmail.tenant_id == tenant_id,
                InboxEmail.is_deleted.is_(False),
                InboxEmail.is_read.is_(False),
            )
        )
    ).scalar() or 0

    rows = (
        await session.execute(
            select(InboxEmail)
            .where(*filters)
            .order_by(InboxEmail.received_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).scalars().all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "unread_count": unread_count,
        "items": [_email_item(r) for r in rows],
    }


async def get_email_detail(
    session: AsyncSession,
    *,
    email_id: str,
    tenant_id: str,
    operator: SysUser,
) -> dict:
    """获取邮件详情，副作用：自动将 is_read 置为 True."""
    email = await _get_email_or_404(session, email_id, tenant_id)

    if not email.is_read:
        async with session.begin():
            email.is_read = True
            email.updated_by = operator.id
            email.updated_at = datetime.now(timezone.utc)

    return _email_detail(email)


async def mark_read(
    session: AsyncSession,
    *,
    email_id: str,
    tenant_id: str,
    operator: SysUser,
) -> dict:
    email = await _get_email_or_404(session, email_id, tenant_id)

    if email.is_read:
        return {"email_id": email_id, "is_read": True}

    async with session.begin():
        email.is_read = True
        email.updated_by = operator.id
        email.updated_at = datetime.now(timezone.utc)

    return {"email_id": email_id, "is_read": True}


async def convert_to_clue(
    session: AsyncSession,
    *,
    tenant_id: str,
    operator: SysUser,
    email_id: str,
    clue_title: str | None,
    description: str | None,
    assignee_id: str | None,
    estimated_amount: Decimal | None,
    opponent_name: str | None,
) -> dict:
    email = await _get_email_or_404(session, email_id, tenant_id)
    _guard_unprocessed(email)

    now = datetime.now(timezone.utc)
    title = clue_title or email.subject
    # D4=Stub: description 优先用传入值，其次用 ai_summary，再截取 body_text 500 字
    desc = description or email.ai_summary or (email.body_text[:500] if email.body_text else None)

    async with session.begin():
        clue = CaseClue(
            tenant_id=tenant_id,
            clue_title=title,
            description=desc,
            source_type=ClueSourceType.EMAIL.value,
            source_id=email_id,
            estimated_amount=estimated_amount,
            opponent_name=opponent_name,
            status=ClueStatus.NEW.value,
            assignee_id=assignee_id,
            currency="CNY",
            created_by=operator.id,
            updated_by=operator.id,
        )
        session.add(clue)
        await session.flush()

        email.processing_status = InboxEmailProcessingStatus.CONVERTED_TO_CLUE.value
        email.processed_by = operator.id
        email.processed_at = now
        email.updated_by = operator.id
        email.updated_at = now

        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=_SENTINEL_CASE_ID,
            operator=operator,
            action_module="INBOX_EMAIL",
            action_type="UPDATE",
            action_detail=f"邮件转线索: {email_id} → {clue.id}",
            target_record_id=email_id,
            after_data={"processing_status": InboxEmailProcessingStatus.CONVERTED_TO_CLUE.value, "clue_id": clue.id},
        )

    return {
        "email_id": email_id,
        "clue_id": clue.id,
        "clue_title": title,
        "processing_status": InboxEmailProcessingStatus.CONVERTED_TO_CLUE.value,
    }


async def link_to_case(
    session: AsyncSession,
    *,
    tenant_id: str,
    operator: SysUser,
    email_id: str,
    case_id: str,
    note: str | None,
) -> dict:
    from ..models.cases import Case

    email = await _get_email_or_404(session, email_id, tenant_id)
    _guard_unprocessed(email)

    # 4312: 验证案件存在且属于当前租户
    case_exists = (
        await session.execute(
            select(Case.id).where(
                Case.id == case_id,
                Case.tenant_id == tenant_id,
                Case.is_deleted.is_(False),
            )
        )
    ).scalar_one_or_none()
    if not case_exists:
        raise BusinessException(code=4312, message=f"案件 {case_id} 不存在或不属于当前租户")

    now = datetime.now(timezone.utc)
    async with session.begin():
        email.processing_status = InboxEmailProcessingStatus.LINKED_TO_CASE.value
        email.processed_by = operator.id
        email.processed_at = now
        email.updated_by = operator.id
        email.updated_at = now

        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=case_id,
            operator=operator,
            action_module="INBOX_EMAIL",
            action_type="UPDATE",
            action_detail=f"邮件关联案件: {email_id} → {case_id}",
            target_record_id=email_id,
            after_data={
                "processing_status": InboxEmailProcessingStatus.LINKED_TO_CASE.value,
                "case_id": case_id,
                "note": note,
            },
        )

    return {
        "email_id": email_id,
        "case_id": case_id,
        "processing_status": InboxEmailProcessingStatus.LINKED_TO_CASE.value,
    }


async def ignore_email(
    session: AsyncSession,
    *,
    tenant_id: str,
    operator: SysUser,
    email_id: str,
    reason: str | None,
) -> dict:
    email = await _get_email_or_404(session, email_id, tenant_id)
    _guard_unprocessed(email)

    now = datetime.now(timezone.utc)
    async with session.begin():
        email.processing_status = InboxEmailProcessingStatus.IGNORED.value
        email.processed_by = operator.id
        email.processed_at = now
        email.updated_by = operator.id
        email.updated_at = now

        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=_SENTINEL_CASE_ID,
            operator=operator,
            action_module="INBOX_EMAIL",
            action_type="UPDATE",
            action_detail=f"忽略邮件: {email_id}" + (f" 原因: {reason}" if reason else ""),
            target_record_id=email_id,
            after_data={"processing_status": InboxEmailProcessingStatus.IGNORED.value, "reason": reason},
        )

    return {
        "email_id": email_id,
        "processing_status": InboxEmailProcessingStatus.IGNORED.value,
    }
