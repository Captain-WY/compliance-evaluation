"""案件详情 - 结案登记 Service (切片 2.S9).

实现 2 个方法: get_info / submit
- get_info: 读 case_closures 最新记录 + cases 状态
- submit: 插入/更新 case_closures + 将 cases.case_status 置为 CLOSED
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.exceptions import BusinessException, NotFoundException
from ..enums import CaseStatus, ClosureStatus, ClosureType, label_of
from ..models.case_closures import CaseClosure
from ..models.cases import Case
from ..models.sys_users import SysUser
from ..schemas.case_closing import (
    ClosingInfoRequest,
    ClosingInfoResponse,
    ClosingSubmitRequest,
    ClosingSubmitResponse,
    ClosureVO,
)
from .audit_log_service import write_audit_log
from .case_detail_ext_service import _compute_permissions


# =============================================================================
# 通用工具
# =============================================================================


async def _load_case_or_404(
    session: AsyncSession, tenant_id: str, case_id: str
) -> Case:
    stmt = select(Case).where(
        and_(
            Case.id == case_id,
            Case.tenant_id == tenant_id,
            Case.is_deleted.is_(False),
        )
    )
    case = (await session.execute(stmt)).scalar_one_or_none()
    if case is None:
        raise NotFoundException(resource="案件", resource_id=case_id)
    return case


async def _require_member(
    session: AsyncSession, tenant_id: str, case_id: str, user: SysUser
) -> Case:
    """读权限: 案件成员即可."""
    case = await _load_case_or_404(session, tenant_id, case_id)
    perms = await _compute_permissions(session, tenant_id, case_id, user.id, case=case)
    excluded = {
        "case_id", "user_role_in_case", "has_legal_admin",
        "has_sys_admin", "case_closed",
    }
    if not any(v for k, v in perms.model_dump().items() if k not in excluded):
        raise NotFoundException(resource="案件", resource_id=case_id)
    return case


async def _require_close_case(
    session: AsyncSession, tenant_id: str, case_id: str, user: SysUser
) -> Case:
    """写权限: can_close_case (D7)."""
    case = await _load_case_or_404(session, tenant_id, case_id)
    perms = await _compute_permissions(session, tenant_id, case_id, user.id, case=case)
    if not perms.can_close_case:
        raise BusinessException(
            code=4013, message="无权执行结案登记 (缺少 can_close_case)"
        )
    return case


async def _load_latest_closure(
    session: AsyncSession, tenant_id: str, case_id: str
) -> CaseClosure | None:
    stmt = (
        select(CaseClosure)
        .where(
            and_(
                CaseClosure.case_id == case_id,
                CaseClosure.tenant_id == tenant_id,
                CaseClosure.is_deleted.is_(False),
            )
        )
        .order_by(CaseClosure.created_at.desc(), CaseClosure.id.desc())
        .limit(1)
    )
    return (await session.execute(stmt)).scalar_one_or_none()


def _closure_to_vo(row: CaseClosure, approved_by_name: str | None) -> ClosureVO:
    return ClosureVO(
        id=row.id,
        case_id=row.case_id,
        closure_date=row.closure_date,
        closure_type=ClosureType(row.closure_type),
        closure_type_name=label_of(row.closure_type, ClosureType),
        status=ClosureStatus(row.status or "DRAFT"),
        status_name=label_of(row.status or "DRAFT", ClosureStatus),
        review_summary=row.review_summary,
        improvement_plan=row.improvement_plan,
        checklist_data=dict(row.checklist_data) if row.checklist_data else None,
        approved_by=row.approved_by,
        approved_by_name=approved_by_name,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


# =============================================================================
# 1. /closing/info
# =============================================================================


async def get_info(
    session: AsyncSession,
    tenant_id: str,
    payload: ClosingInfoRequest,
    user: SysUser,
) -> ClosingInfoResponse:
    case = await _require_member(session, tenant_id, payload.case_id, user)
    closure = await _load_latest_closure(session, tenant_id, payload.case_id)

    approved_by_name: str | None = None
    if closure and closure.approved_by:
        ru = (
            await session.execute(
                select(SysUser.real_name, SysUser.username).where(
                    SysUser.id == closure.approved_by,
                    SysUser.tenant_id == tenant_id,
                )
            )
        ).first()
        if ru:
            approved_by_name = ru[0] or ru[1] or closure.approved_by

    case_status_enum = CaseStatus(case.case_status or "PENDING")
    return ClosingInfoResponse(
        case_id=payload.case_id,
        registered=closure is not None,
        closure=_closure_to_vo(closure, approved_by_name) if closure else None,
        case_status=case_status_enum,
        case_status_name=label_of(case_status_enum, CaseStatus),
        close_date=case.close_date,
    )


# =============================================================================
# 2. /closing/submit
# =============================================================================


async def submit(
    session: AsyncSession,
    tenant_id: str,
    payload: ClosingSubmitRequest,
    user: SysUser,
) -> ClosingSubmitResponse:
    async with session.begin():
        case = await _require_close_case(session, tenant_id, payload.case_id, user)

        # ARCHIVED 状态拒 (全局只读锁已由 _compute_permissions 拦截, 此处双保险)
        if case.case_status == CaseStatus.ARCHIVED.value:
            raise BusinessException(
                code=4014, message="案件已归档, 不可修改结案登记"
            )

        existing = await _load_latest_closure(session, tenant_id, payload.case_id)

        # 已 APPROVED 且案件已 CLOSED: 仅允许 LEGAL_ADMIN/SYS_ADMIN 修改 (防意外覆盖)
        if (
            existing
            and existing.status == ClosureStatus.APPROVED.value
            and case.case_status == CaseStatus.CLOSED.value
        ):
            perms = await _compute_permissions(
                session, tenant_id, payload.case_id, user.id, case=case
            )
            if not (perms.has_legal_admin or perms.has_sys_admin):
                raise BusinessException(
                    code=4013,
                    message="结案已定稿, 修改需 LEGAL_ADMIN 或 SYS_ADMIN 角色",
                )

        action_type = "UPDATE" if existing else "CREATE"

        if existing:
            # 更新已有记录
            prev_status = existing.status
            prev_closure_date = existing.closure_date
            existing.closure_date = payload.closure_date
            existing.closure_type = payload.closure_type.value
            existing.review_summary = payload.review_summary
            existing.improvement_plan = payload.improvement_plan
            existing.checklist_data = payload.checklist_data
            existing.status = payload.status.value
            existing.updated_by = user.id
            # APPROVED → 设 approved_by; 降级回 DRAFT → 清空 approved_by
            if payload.status == ClosureStatus.APPROVED:
                existing.approved_by = user.id
            else:
                existing.approved_by = None
            closure_row = existing
        else:
            closure_row = CaseClosure(
                id=f"cls_{uuid.uuid4().hex[:12]}",
                tenant_id=tenant_id,
                case_id=payload.case_id,
                closure_date=payload.closure_date,
                closure_type=payload.closure_type.value,
                checklist_data=payload.checklist_data,
                review_summary=payload.review_summary,
                improvement_plan=payload.improvement_plan,
                status=payload.status.value,
                approved_by=user.id if payload.status == ClosureStatus.APPROVED else None,
                created_by=user.id,
                updated_by=user.id,
            )
            session.add(closure_row)

        await session.flush()

        # 更新 cases.case_status = CLOSED + close_date
        case.case_status = CaseStatus.CLOSED.value
        case.close_date = payload.closure_date
        case.updated_by = user.id

        # 审计 CLOSURE.CREATE 或 UPDATE
        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=payload.case_id,
            operator=user,
            action_module="CLOSURE",
            action_type=action_type,
            action_detail=(
                f"结案登记 类型={payload.closure_type.value} "
                f"日期={payload.closure_date.isoformat()} 状态={payload.status.value}"
            ),
            target_record_id=closure_row.id,
            before_data=(
                {
                    "existed": True,
                    "status": prev_status,
                    "closure_date": prev_closure_date.isoformat() if prev_closure_date else None,
                }
                if existing
                else {"existed": False}
            ),
            after_data={
                "closure_type": closure_row.closure_type,
                "status": closure_row.status,
                "closure_date": closure_row.closure_date.isoformat(),
            },
        )

    return ClosingSubmitResponse(
        case_id=payload.case_id,
        closure_id=closure_row.id,
        case_status=CaseStatus.CLOSED,
        case_status_name=label_of(CaseStatus.CLOSED, CaseStatus),
        closure_status=payload.status,
        closure_status_name=label_of(payload.status, ClosureStatus),
        warnings=[],
    )
