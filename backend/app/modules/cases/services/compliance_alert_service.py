"""合规预警 Service (2.S13).

端点对应:
  - POST /compliance/alerts/list   → list_alerts()
  - POST /compliance/alerts/handle → handle_alert()

D3 对齐:
  action=CONVERT_TO_TASK → status=REPORTED, 创建 reporting_task (D6 字段映射)
  action=DISMISS         → status=EXEMPTED, 记录 handling_note

D7 权限: LEGAL_LAWYER 只能查看自身案件 (MY_CASES JOIN).
错误码: 4202 终态重复处理; 4203 DISMISS 无 notes.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.exceptions import BusinessException, NotFoundException
from ..enums.case_enums import ComplianceAlertStatus, ReportCategory, ReportingTaskStatus
from ..enums.labels import label_of as get_label
from ..models.case_members import CaseMember
from ..models.cases import Case
from ..models.compliance_alerts import ComplianceAlert
from ..models.compliance_rules import ComplianceRule
from ..models.reporting_tasks import ReportingTask
from ..models.sys_users import SysUser
from ..schemas.compliance_s13 import (
    AlertHandleRequest,
    AlertHandleResponse,
    AlertItem,
    AlertListRequest,
    AlertListResponse,
)
from .audit_log_service import write_audit_log


async def list_alerts(
    session: AsyncSession,
    *,
    tenant_id: str,
    user: SysUser,
    req: AlertListRequest,
) -> AlertListResponse:
    """分页获取合规预警列表 (D7: LEGAL_LAWYER 仅自身案件)."""
    base_q = (
        select(
            ComplianceAlert,
            Case.internal_case_no,
            Case.case_name,
            ComplianceRule.rule_name,
        )
        .join(Case, Case.id == ComplianceAlert.case_id)
        .join(ComplianceRule, ComplianceRule.id == ComplianceAlert.rule_id)
        .where(
            ComplianceAlert.is_deleted == False,
            ComplianceAlert.tenant_id == tenant_id,
            Case.is_deleted == False,
        )
    )

    # D7: LEGAL_LAWYER 只看自身案件 (Q2)
    if getattr(user, "role_code", None) == "LEGAL_LAWYER":
        base_q = base_q.join(
            CaseMember,
            (CaseMember.case_id == ComplianceAlert.case_id)
            & (CaseMember.user_id == str(user.id))
            & (CaseMember.status == "ACTIVE")
            & (CaseMember.is_deleted == False),
        )

    if req.status:
        base_q = base_q.where(ComplianceAlert.status == req.status)
    if req.alertLevel:
        base_q = base_q.where(ComplianceAlert.alert_level == req.alertLevel)

    total_q = select(func.count()).select_from(base_q.subquery())
    total: int = (await session.execute(total_q)).scalar_one()

    offset = (req.page - 1) * req.pageSize
    rows = (
        await session.execute(base_q.offset(offset).limit(req.pageSize))
    ).all()

    items = [
        AlertItem(
            alertId=str(alert.id),
            caseId=str(alert.case_id),
            caseCode=internal_case_no,
            caseTitle=case_name,
            ruleName=rule_name,
            alertMessage=alert.alert_message,
            alertLevel=alert.alert_level,
            alertLevel_name=get_label(alert.alert_level),
            status=alert.status,
            status_name=get_label(alert.status),
            createdAt=alert.created_at,
        )
        for alert, internal_case_no, case_name, rule_name in rows
    ]
    return AlertListResponse(total=total, page=req.page, pageSize=req.pageSize, items=items)


async def handle_alert(
    session: AsyncSession,
    *,
    tenant_id: str,
    user: SysUser,
    req: AlertHandleRequest,
) -> AlertHandleResponse:
    """处理单条合规预警 (闭环操作).

    action=CONVERT_TO_TASK: status→REPORTED + 创建 reporting_task (D6)
    action=DISMISS:         status→EXEMPTED + 记录 handling_note (4203 notes 必填)
    4202: 预警已终态 (REPORTED/EXEMPTED)
    """
    alert: Optional[ComplianceAlert] = (
        await session.get(ComplianceAlert, req.alertId)
    )
    if not alert or alert.is_deleted or str(alert.tenant_id) != tenant_id:
        raise NotFoundException(f"合规预警 {req.alertId} 不存在")

    terminal = {ComplianceAlertStatus.REPORTED.value, ComplianceAlertStatus.EXEMPTED.value}
    if alert.status in terminal:
        raise BusinessException(code=4202, message="预警已处于终态，不可重复处理")

    new_task_id: Optional[str] = None

    async with session.begin():
        if req.action == "CONVERT_TO_TASK":
            rule: Optional[ComplianceRule] = await session.get(ComplianceRule, str(alert.rule_id))
            action_config: dict = (rule.action_config or {}) if rule else {}
            report_category = action_config.get("report_category", ReportCategory.COMPLIANCE_DISCLOSURE.value)

            new_task_id = str(uuid.uuid4())
            task = ReportingTask(
                id=new_task_id,
                tenant_id=tenant_id,
                task_name=f"[预警处理] {str(alert.alert_message)[:50]}",
                report_category=report_category,
                rule_id=str(alert.rule_id),
                template_id=action_config.get("template_id"),
                assignee_id=str(user.id),
                due_date=date.today() + timedelta(days=5),
                status=ReportingTaskStatus.DATA_PREP.value,
                created_by=str(user.id),
                updated_by=str(user.id),
            )
            session.add(task)

            alert.status = ComplianceAlertStatus.REPORTED.value
            alert.reporting_task_id = new_task_id
            alert.handled_by = str(user.id)
            alert.handled_at = datetime.now(timezone.utc)
            alert.updated_by = str(user.id)

        elif req.action == "DISMISS":
            if not req.notes:
                raise BusinessException(code=4203, message="豁免操作必须填写处理备注")
            alert.status = ComplianceAlertStatus.EXEMPTED.value
            alert.handling_note = req.notes
            alert.handled_by = str(user.id)
            alert.handled_at = datetime.now(timezone.utc)
            alert.updated_by = str(user.id)

        else:
            raise BusinessException(code=4000, message=f"不支持的操作类型: {req.action}")

        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=str(alert.case_id),
            operator=user,
            action_module="COMPLIANCE_ALERT",
            action_type="UPDATE",
            action_detail=f"预警处理: action={req.action}, alertId={req.alertId}",
        )

    return AlertHandleResponse(
        alertId=req.alertId,
        status=alert.status,
        status_name=get_label(alert.status),
        newTaskId=new_task_id,
    )
