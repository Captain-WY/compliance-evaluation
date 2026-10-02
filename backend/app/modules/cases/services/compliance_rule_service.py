"""合规规则 Service (2.S13).

端点对应:
  - POST /compliance/rules/list   → list_rules()
  - POST /compliance/rules/save   → save_rule()
  - POST /compliance/rules/toggle → toggle_rule()

D1=A: CRUD only, 规则执行引擎推迟到 S15+.
Q5:   upsert by rule_code: 先 SELECT 再 INSERT/UPDATE, 不用 ON CONFLICT.
Q7:   DRAFT 状态不允许 toggle (4201).
"""
from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.exceptions import BusinessException, NotFoundException
from ..enums.case_enums import RuleStatus
from ..enums.labels import label_of as get_label
from ..models.compliance_rules import ComplianceRule
from ..models.sys_users import SysUser
from ..schemas.compliance_s13 import (
    RuleItem,
    RuleListRequest,
    RuleListResponse,
    RuleSaveRequest,
    RuleSaveResponse,
    RuleToggleRequest,
    RuleToggleResponse,
)
from .audit_log_service import write_audit_log

_SENTINEL_CASE_ID = "00000000-0000-0000-0000-000000000000"


async def list_rules(
    session: AsyncSession,
    *,
    tenant_id: str,
    req: RuleListRequest,
) -> RuleListResponse:
    """分页获取合规规则列表."""
    base_q = select(ComplianceRule).where(
        ComplianceRule.is_deleted == False,
        ComplianceRule.tenant_id == tenant_id,
    )
    if req.ruleType:
        base_q = base_q.where(ComplianceRule.rule_type == req.ruleType)
    if req.status:
        base_q = base_q.where(ComplianceRule.status == req.status)

    total: int = (
        await session.execute(select(func.count()).select_from(base_q.subquery()))
    ).scalar_one()

    offset = (req.page - 1) * req.pageSize
    rules = (
        await session.execute(base_q.offset(offset).limit(req.pageSize))
    ).scalars().all()

    items = [
        RuleItem(
            ruleId=str(r.id),
            ruleCode=r.rule_code,
            ruleName=r.rule_name,
            ruleType=r.rule_type,
            ruleType_name=get_label(r.rule_type),
            actionType=r.action_type,
            actionType_name=get_label(r.action_type),
            ruleLogic=r.rule_logic,
            actionConfig=r.action_config,
            status=r.status,
            status_name=get_label(r.status),
        )
        for r in rules
    ]
    return RuleListResponse(total=total, page=req.page, pageSize=req.pageSize, items=items)


async def save_rule(
    session: AsyncSession,
    *,
    tenant_id: str,
    user: SysUser,
    req: RuleSaveRequest,
) -> RuleSaveResponse:
    """新建或更新合规规则 (upsert by ruleCode, Q5)."""
    async with session.begin():
        if req.ruleId:
            rule: Optional[ComplianceRule] = await session.get(ComplianceRule, req.ruleId)
            if not rule or rule.is_deleted or str(rule.tenant_id) != tenant_id:
                raise NotFoundException(f"合规规则 {req.ruleId} 不存在")
            is_new = False
        else:
            existing = (
                await session.execute(
                    select(ComplianceRule).where(
                        ComplianceRule.rule_code == req.ruleCode,
                        ComplianceRule.tenant_id == tenant_id,
                        ComplianceRule.is_deleted == False,
                    )
                )
            ).scalar_one_or_none()

            if existing:
                rule = existing
                is_new = False
            else:
                rule = ComplianceRule(
                    id=str(uuid.uuid4()),
                    tenant_id=tenant_id,
                    status=RuleStatus.ACTIVE.value,
                    created_by=str(user.id),
                )
                session.add(rule)
                is_new = True

        rule.rule_code = req.ruleCode
        rule.rule_name = req.ruleName
        rule.rule_type = req.ruleType
        rule.action_type = req.actionType
        rule.rule_logic = req.ruleLogic
        rule.action_config = req.actionConfig
        rule.updated_by = str(user.id)

        action_type = "CREATE" if is_new else "UPDATE"
        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=_SENTINEL_CASE_ID,
            operator=user,
            action_module="COMPLIANCE_RULE",
            action_type=action_type,
            action_detail=f"规则 {action_type}: ruleCode={req.ruleCode}",
        )

    return RuleSaveResponse(
        ruleId=str(rule.id),
        ruleCode=rule.rule_code,
        ruleName=rule.rule_name,
        ruleType=rule.rule_type,
        ruleType_name=get_label(rule.rule_type),
        actionType=rule.action_type,
        actionType_name=get_label(rule.action_type),
        status=rule.status,
        status_name=get_label(rule.status),
        ruleLogic=rule.rule_logic,
        actionConfig=rule.action_config,
    )


async def toggle_rule(
    session: AsyncSession,
    *,
    tenant_id: str,
    user: SysUser,
    req: RuleToggleRequest,
) -> RuleToggleResponse:
    """切换规则启停状态 (ACTIVE ↔ INACTIVE). DRAFT 不允许 toggle (4201, Q7)."""
    rule: Optional[ComplianceRule] = await session.get(ComplianceRule, req.ruleId)
    if not rule or rule.is_deleted or str(rule.tenant_id) != tenant_id:
        raise NotFoundException(f"合规规则 {req.ruleId} 不存在")

    if rule.status == RuleStatus.DRAFT.value:
        raise BusinessException(code=4201, message="草稿状态规则不允许切换启停")

    async with session.begin():
        if rule.status == RuleStatus.ACTIVE.value:
            rule.status = RuleStatus.INACTIVE.value
        else:
            rule.status = RuleStatus.ACTIVE.value
        rule.updated_by = str(user.id)

        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=_SENTINEL_CASE_ID,
            operator=user,
            action_module="COMPLIANCE_RULE",
            action_type="UPDATE",
            action_detail=f"规则状态切换: ruleId={req.ruleId}, newStatus={rule.status}",
        )

    return RuleToggleResponse(
        ruleId=req.ruleId,
        status=rule.status,
        status_name=get_label(rule.status),
    )
