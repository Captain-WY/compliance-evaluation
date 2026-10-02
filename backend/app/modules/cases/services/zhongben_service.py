"""终本执行 (zhongben) Service (切片 2.S9).

实现 2 个方法:
    1. register         — 终本登记 (cases.extended_data.zhongben_plan 深度合并)
    2. setup_reminder   — 周期复查提醒 (reminders[] 追加)

D6=B: 存储在 cases.extended_data.zhongben_plan 子键, 零新表.
D5=B: 本切片仅存储, 定时触发留后续平台专项切片.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any

from dateutil.relativedelta import relativedelta
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.exceptions import BusinessException, NotFoundException
from ..enums import CurrencyCode, label_of
from ..models.case_documents import CaseDocument
from ..models.cases import Case
from ..models.sys_users import SysUser
from ..schemas.case_closing import (
    ReminderSetupRequest,
    ReminderSetupResponse,
    ZhongBenPlanVO,
    ZhongBenRegisterRequest,
    ZhongBenRegisterResponse,
    ZhongBenReminderVO,
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


async def _require_edit(
    session: AsyncSession, tenant_id: str, case_id: str, user: SysUser
) -> Case:
    """写权限: can_edit_base_info (D7 zhongben 使用)."""
    case = await _load_case_or_404(session, tenant_id, case_id)
    perms = await _compute_permissions(session, tenant_id, case_id, user.id, case=case)
    if not perms.can_edit_base_info:
        raise BusinessException(
            code=4013, message="无权登记终本信息 (缺少 can_edit_base_info)"
        )
    return case


def _plan_to_vo(plan: dict[str, Any]) -> ZhongBenPlanVO:
    """extended_data.zhongben_plan dict -> ZhongBenPlanVO."""
    reminders_raw = plan.get("reminders") or []
    reminders_vo: list[ZhongBenReminderVO] = []
    if isinstance(reminders_raw, list):
        for r in reminders_raw:
            if not isinstance(r, dict):
                continue
            reminders_vo.append(
                ZhongBenReminderVO(
                    reminder_id=r.get("reminder_id", ""),
                    interval_months=int(r.get("interval_months", 0) or 0),
                    assignee_id=r.get("assignee_id", ""),
                    assignee_name=r.get("assignee_name"),
                    created_at=r.get("created_at"),
                    next_trigger_date=(
                        datetime.fromisoformat(r["next_trigger_date"]).date()
                        if r.get("next_trigger_date")
                        else None
                    ),
                    last_sent_at=r.get("last_sent_at"),
                    note=r.get("note"),
                )
            )

    currency_raw = plan.get("currency")
    currency_enum: CurrencyCode | None = None
    if currency_raw:
        try:
            currency_enum = CurrencyCode(currency_raw)
        except ValueError:
            currency_enum = None

    reg_date = None
    if plan.get("register_date"):
        try:
            reg_date = datetime.fromisoformat(str(plan["register_date"])).date()
        except (ValueError, TypeError):
            reg_date = None

    non_exec_amt = None
    if plan.get("non_executed_amount") is not None:
        try:
            non_exec_amt = Decimal(str(plan["non_executed_amount"]))
        except (ValueError, TypeError):
            non_exec_amt = None

    return ZhongBenPlanVO(
        registered=bool(plan.get("registered")),
        register_date=reg_date,
        non_executed_amount=non_exec_amt,
        currency=currency_enum,
        currency_name=label_of(currency_raw, CurrencyCode) if currency_raw else None,
        attachment_ids=list(plan.get("attachment_ids") or []),
        ruling_no=plan.get("ruling_no"),
        reason=plan.get("reason"),
        registered_by=plan.get("registered_by"),
        registered_at=plan.get("registered_at"),
        reminders=reminders_vo,
    )


async def _validate_attachments(
    session: AsyncSession, tenant_id: str, case_id: str, att_ids: list[str]
) -> None:
    """校验附件属本案 (复用 S7/S8 模式)."""
    if not att_ids:
        return
    rows = (
        await session.execute(
            select(CaseDocument.id, CaseDocument.case_id).where(
                and_(
                    CaseDocument.id.in_(att_ids),
                    CaseDocument.tenant_id == tenant_id,
                    CaseDocument.is_deleted.is_(False),
                )
            )
        )
    ).all()
    found = {r[0] for r in rows}
    missing = set(att_ids) - found
    if missing:
        raise NotFoundException(
            resource="案件文档", resource_id=",".join(sorted(missing))
        )
    bad = [r[0] for r in rows if r[1] != case_id]
    if bad:
        raise BusinessException(
            code=4003, message=f"附件 {bad} 不属于本案件"
        )


# =============================================================================
# 1. /execution/zhongben/register
# =============================================================================


async def register(
    session: AsyncSession,
    tenant_id: str,
    payload: ZhongBenRegisterRequest,
    user: SysUser,
) -> ZhongBenRegisterResponse:
    async with session.begin():
        case = await _require_edit(session, tenant_id, payload.case_id, user)

        # 校验附件
        await _validate_attachments(
            session, tenant_id, payload.case_id, payload.attachment_ids
        )

        # D6=B 深度合并 extended_data.zhongben_plan (对齐 S8 regulatory 模式)
        ed = dict(case.extended_data) if isinstance(case.extended_data, dict) else {}
        zb_old: dict[str, Any] = {}
        if isinstance(ed.get("zhongben_plan"), dict):
            zb_old = dict(ed["zhongben_plan"])

        existing_reminders = zb_old.get("reminders") or []
        if not isinstance(existing_reminders, list):
            existing_reminders = []

        now_iso = datetime.now(timezone.utc).isoformat()
        zb_new = {
            "registered": True,
            "register_date": payload.register_date.isoformat(),
            "non_executed_amount": str(payload.non_executed_amount),
            "currency": payload.currency.value,
            "attachment_ids": list(payload.attachment_ids or []),
            "ruling_no": payload.ruling_no,
            "reason": payload.reason,
            "registered_by": user.id,
            "registered_at": now_iso,
            # 保留已有 reminders (D6 深度合并)
            "reminders": list(existing_reminders),
        }
        ed["zhongben_plan"] = zb_new
        case.extended_data = ed
        case.updated_by = user.id

        # 审计
        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=payload.case_id,
            operator=user,
            action_module="CLOSURE",
            action_type="CREATE",
            action_detail=(
                f"终本登记 未执行金额 {payload.non_executed_amount} "
                f"{payload.currency.value}"
                + (f" 裁定书={payload.ruling_no}" if payload.ruling_no else "")
            ),
            target_record_id=payload.case_id,
            before_data={"registered": bool(zb_old.get("registered"))},
            after_data={
                "register_date": zb_new["register_date"],
                "non_executed_amount": zb_new["non_executed_amount"],
                "attachment_count": len(zb_new["attachment_ids"]),
            },
        )

    return ZhongBenRegisterResponse(
        case_id=payload.case_id,
        zhongben_plan=_plan_to_vo(zb_new),
        warnings=[],
    )


# =============================================================================
# 2. /execution/zhongben/reminders/setup
# =============================================================================


async def setup_reminder(
    session: AsyncSession,
    tenant_id: str,
    payload: ReminderSetupRequest,
    user: SysUser,
) -> ReminderSetupResponse:
    async with session.begin():
        case = await _require_edit(session, tenant_id, payload.case_id, user)

        # 必须先 register
        ed = dict(case.extended_data) if isinstance(case.extended_data, dict) else {}
        zb_old: dict[str, Any] = {}
        if isinstance(ed.get("zhongben_plan"), dict):
            zb_old = dict(ed["zhongben_plan"])
        if not zb_old.get("registered"):
            raise BusinessException(
                code=4003,
                message="请先执行 /execution/zhongben/register 登记终本信息",
            )

        # 校验 assignee 存在
        assignee = (
            await session.execute(
                select(SysUser).where(
                    and_(
                        SysUser.id == payload.assignee_id,
                        SysUser.tenant_id == tenant_id,
                        SysUser.is_deleted.is_(False),
                    )
                )
            )
        ).scalar_one_or_none()
        if assignee is None:
            raise NotFoundException(
                resource="系统用户", resource_id=payload.assignee_id
            )

        # 计算 next_trigger_date: register_date + interval_months
        try:
            reg_date = datetime.fromisoformat(
                str(zb_old.get("register_date"))
            ).date()
        except (ValueError, TypeError):
            reg_date = date.today()
        next_trigger = reg_date + relativedelta(months=payload.interval_months)

        reminder_id = f"rem_{uuid.uuid4().hex[:12]}"
        now_iso = datetime.now(timezone.utc).isoformat()
        new_reminder = {
            "reminder_id": reminder_id,
            "interval_months": payload.interval_months,
            "assignee_id": payload.assignee_id,
            "assignee_name": assignee.real_name or assignee.username or payload.assignee_id,
            "created_at": now_iso,
            "next_trigger_date": next_trigger.isoformat(),
            "last_sent_at": None,
            "note": payload.note,
        }

        existing_reminders = zb_old.get("reminders") or []
        if not isinstance(existing_reminders, list):
            existing_reminders = []
        new_reminders = list(existing_reminders) + [new_reminder]

        zb_new = dict(zb_old)
        zb_new["reminders"] = new_reminders
        ed["zhongben_plan"] = zb_new
        case.extended_data = ed
        case.updated_by = user.id

        # 审计
        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=payload.case_id,
            operator=user,
            action_module="CLOSURE",
            action_type="UPDATE",
            action_detail=(
                f"终本周期提醒 每 {payload.interval_months} 月复查, "
                f"责任人={new_reminder['assignee_name']}"
            ),
            target_record_id=reminder_id,
            before_data={"reminders_count": len(existing_reminders)},
            after_data={
                "reminder_id": reminder_id,
                "interval_months": payload.interval_months,
                "next_trigger_date": new_reminder["next_trigger_date"],
            },
        )

    # D5=B 明确告知定时触发未实现
    return ReminderSetupResponse(
        case_id=payload.case_id,
        reminder_id=reminder_id,
        next_trigger_date=next_trigger,
        warnings=[
            "周期提醒已注册. 注: 本切片仅存储, 定时触发由后续平台切片实现"
        ],
    )
