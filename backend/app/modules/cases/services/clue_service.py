"""线索管理 Service (2.S15).

端点映射:
  POST /clues/list              → list_clues
  POST /clues/detail            → get_clue
  POST /clues/create            → create_clue
  POST /clues/update            → update_clue
  POST /clues/assign            → assign_clue
  POST /clues/close             → close_clue
  POST /clues/prepare-for-case  → prepare_for_case

状态机:
  NEW ──(assign)──> FOLLOWING
  NEW/FOLLOWING ──(close REJECTED)──> REJECTED (终态)
  NEW/FOLLOWING ──(close CLOSED)──>   CLOSED   (终态)
  NEW/FOLLOWING ──(cases/create source_clue_id)──> CONVERTED (终态, 由 S10 写入)
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.exceptions import BusinessException
from ..enums.case_enums import ClueSourceType, ClueStatus
from ..enums.labels import label_of
from ..models.case_clues import CaseClue
from ..models.inbox_emails import InboxEmail
from ..models.sys_users import SysUser
from ..services.audit_log_service import write_audit_log

_SENTINEL_CASE_ID = "_GLOBAL_"

_TERMINAL_STATUSES = {ClueStatus.CONVERTED.value, ClueStatus.REJECTED.value, ClueStatus.CLOSED.value}


def _clue_item(c: CaseClue) -> dict:
    return {
        "clue_id": c.id,
        "clue_title": c.clue_title,
        "source_type": c.source_type,
        "source_type_name": label_of(c.source_type) if c.source_type else "",
        "status": c.status,
        "status_name": label_of(c.status) if c.status else "",
        "estimated_amount": c.estimated_amount,
        "currency": c.currency,
        "opponent_name": c.opponent_name,
        "assignee_id": c.assignee_id,
        "created_at": c.created_at,
    }


def _clue_detail(c: CaseClue) -> dict:
    return {
        "clue_id": c.id,
        "clue_title": c.clue_title,
        "description": c.description,
        "source_type": c.source_type,
        "source_type_name": label_of(c.source_type) if c.source_type else "",
        "source_id": c.source_id,
        "business_line": c.business_line,
        "estimated_amount": c.estimated_amount,
        "currency": c.currency,
        "opponent_name": c.opponent_name,
        "status": c.status,
        "status_name": label_of(c.status) if c.status else "",
        "assignee_id": c.assignee_id,
        "converted_case_id": c.converted_case_id,
        "closed_reason": c.closed_reason,
        "created_at": c.created_at,
        "updated_at": c.updated_at,
    }


async def _get_clue_or_404(session: AsyncSession, clue_id: str, tenant_id: str) -> CaseClue:
    row = (
        await session.execute(
            select(CaseClue).where(
                CaseClue.id == clue_id,
                CaseClue.tenant_id == tenant_id,
                CaseClue.is_deleted.is_(False),
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise BusinessException(code=4300, message=f"线索 {clue_id} 不存在")
    return row


async def list_clues(
    session: AsyncSession,
    *,
    tenant_id: str,
    status: str | None,
    source_type: str | None,
    assignee_id: str | None,
    keyword: str | None,
    page: int,
    page_size: int,
) -> dict:
    filters = [CaseClue.tenant_id == tenant_id, CaseClue.is_deleted.is_(False)]
    if status:
        filters.append(CaseClue.status == status)
    if source_type:
        filters.append(CaseClue.source_type == source_type)
    if assignee_id:
        filters.append(CaseClue.assignee_id == assignee_id)
    if keyword:
        kw = f"%{keyword}%"
        filters.append(or_(CaseClue.clue_title.ilike(kw), CaseClue.opponent_name.ilike(kw)))

    total = (
        await session.execute(select(func.count(CaseClue.id)).where(*filters))
    ).scalar() or 0

    rows = (
        await session.execute(
            select(CaseClue)
            .where(*filters)
            .order_by(CaseClue.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).scalars().all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [_clue_item(r) for r in rows],
    }


async def get_clue(session: AsyncSession, *, clue_id: str, tenant_id: str) -> dict:
    clue = await _get_clue_or_404(session, clue_id, tenant_id)
    return _clue_detail(clue)


async def create_clue(
    session: AsyncSession,
    *,
    tenant_id: str,
    operator: SysUser,
    clue_title: str,
    description: str | None,
    source_type: str,
    source_id: str | None,
    business_line: str | None,
    estimated_amount: Decimal | None,
    currency: str | None,
    opponent_name: str | None,
    assignee_id: str | None,
) -> dict:
    # source_type 枚举合法性（避免 @validates 抛 ValueError → 500）
    allowed_source = {e.value for e in ClueSourceType}
    if source_type not in allowed_source:
        raise BusinessException(
            code=4306,
            message=f"source_type={source_type!r} 非法，允许值: {sorted(allowed_source)}",
        )

    # 4301: EMAIL 来源必须有 source_id
    if source_type == ClueSourceType.EMAIL.value and not source_id:
        raise BusinessException(code=4301, message="EMAIL 来源线索必须提供 sourceId")

    # 4302: source_id 必须指向真实 inbox_emails 记录
    if source_id:
        email_exists = (
            await session.execute(
                select(InboxEmail.id).where(
                    InboxEmail.id == source_id,
                    InboxEmail.tenant_id == tenant_id,
                    InboxEmail.is_deleted.is_(False),
                )
            )
        ).scalar_one_or_none()
        if not email_exists:
            raise BusinessException(code=4302, message=f"sourceId={source_id!r} 不存在或不属于当前租户")

    async with session.begin_nested():
        clue = CaseClue(
            tenant_id=tenant_id,
            clue_title=clue_title,
            description=description,
            source_type=source_type,
            source_id=source_id,
            business_line=business_line,
            estimated_amount=estimated_amount,
            currency=currency or "CNY",
            opponent_name=opponent_name,
            status=ClueStatus.NEW.value,
            assignee_id=assignee_id,
            created_by=operator.id,
            updated_by=operator.id,
        )
        session.add(clue)
        await session.flush()

        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=_SENTINEL_CASE_ID,
            operator=operator,
            action_module="CLUE",
            action_type="CREATE",
            action_detail=f"新建线索: {clue_title}",
            target_record_id=clue.id,
            after_data={"clue_title": clue_title, "source_type": source_type, "status": ClueStatus.NEW.value},
        )

    return {"clue_id": clue.id, "status": clue.status, "created_at": clue.created_at}


async def update_clue(
    session: AsyncSession,
    *,
    tenant_id: str,
    operator: SysUser,
    clue_id: str,
    clue_title: str | None,
    description: str | None,
    business_line: str | None,
    estimated_amount: Decimal | None,
    currency: str | None,
    opponent_name: str | None,
) -> dict:
    clue = await _get_clue_or_404(session, clue_id, tenant_id)

    before = {
        "clue_title": clue.clue_title,
        "description": clue.description,
        "business_line": clue.business_line,
        "estimated_amount": str(clue.estimated_amount) if clue.estimated_amount else None,
        "currency": clue.currency,
        "opponent_name": clue.opponent_name,
    }

    async with session.begin_nested():
        if clue_title is not None:
            clue.clue_title = clue_title
        if description is not None:
            clue.description = description
        if business_line is not None:
            clue.business_line = business_line
        if estimated_amount is not None:
            clue.estimated_amount = estimated_amount
        if currency is not None:
            clue.currency = currency
        if opponent_name is not None:
            clue.opponent_name = opponent_name
        clue.updated_by = operator.id
        clue.updated_at = datetime.now(timezone.utc)

        after = {
            "clue_title": clue.clue_title,
            "description": clue.description,
            "business_line": clue.business_line,
            "estimated_amount": str(clue.estimated_amount) if clue.estimated_amount else None,
            "currency": clue.currency,
            "opponent_name": clue.opponent_name,
        }

        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=_SENTINEL_CASE_ID,
            operator=operator,
            action_module="CLUE",
            action_type="UPDATE",
            action_detail=f"更新线索基础信息: {clue_id}",
            target_record_id=clue_id,
            before_data=before,
            after_data=after,
        )

    return {"clue_id": clue_id, "updated_at": clue.updated_at}


async def assign_clue(
    session: AsyncSession,
    *,
    tenant_id: str,
    operator: SysUser,
    clue_id: str,
    assignee_id: str,
) -> dict:
    clue = await _get_clue_or_404(session, clue_id, tenant_id)

    async with session.begin_nested():
        clue.assignee_id = assignee_id
        # NEW → FOLLOWING 自动流转
        if clue.status == ClueStatus.NEW.value:
            clue.status = ClueStatus.FOLLOWING.value
        clue.updated_by = operator.id
        clue.updated_at = datetime.now(timezone.utc)

        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=_SENTINEL_CASE_ID,
            operator=operator,
            action_module="CLUE",
            action_type="UPDATE",
            action_detail=f"分配跟进人: {assignee_id}",
            target_record_id=clue_id,
            after_data={"assignee_id": assignee_id, "status": clue.status},
        )

    return {"clue_id": clue_id, "assignee_id": assignee_id, "status": clue.status}


async def close_clue(
    session: AsyncSession,
    *,
    tenant_id: str,
    operator: SysUser,
    clue_id: str,
    target_status: str,
    closed_reason: str | None,
) -> dict:
    # 4304: 只允许 REJECTED/CLOSED
    if target_status not in {ClueStatus.REJECTED.value, ClueStatus.CLOSED.value}:
        raise BusinessException(code=4304, message=f"targetStatus 非法，只允许 REJECTED/CLOSED，实际={target_status!r}")

    clue = await _get_clue_or_404(session, clue_id, tenant_id)

    # 4303: 已处于终态
    if clue.status in _TERMINAL_STATUSES:
        raise BusinessException(code=4303, message=f"线索已处于终态 {clue.status}，不允许再次关闭")

    async with session.begin_nested():
        clue.status = target_status
        clue.closed_reason = closed_reason
        clue.updated_by = operator.id
        clue.updated_at = datetime.now(timezone.utc)

        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=_SENTINEL_CASE_ID,
            operator=operator,
            action_module="CLUE",
            action_type="UPDATE",
            action_detail=f"关闭线索 → {target_status}",
            target_record_id=clue_id,
            after_data={"status": target_status, "closed_reason": closed_reason},
        )

    return {"clue_id": clue_id, "status": clue.status}


async def prepare_for_case(
    session: AsyncSession,
    *,
    tenant_id: str,
    clue_id: str,
) -> dict:
    clue = await _get_clue_or_404(session, clue_id, tenant_id)

    # 4305: 已 CONVERTED 的线索不可再次预填
    if clue.status == ClueStatus.CONVERTED.value:
        raise BusinessException(code=4305, message="线索已 CONVERTED，请直接查看已关联案件")

    return {
        "clue_id": clue_id,
        "clue_title": clue.clue_title,
        "prefill_data": {
            "case_name": clue.clue_title,
            "business_line": clue.business_line,
            "estimated_amount": clue.estimated_amount,
            "currency": clue.currency,
            "opponent_name": clue.opponent_name,
            "source_clue_id": clue_id,
            "case_type_code": "CIVIL_LITIGATION",
        },
    }
