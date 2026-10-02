"""Dashboard BFF Service (2.S19).

metrics: 实时 SQL 聚合 (cases/case_closures/financial_transactions/business_line_budgets)
alerts:  实时扫描 (process_instances/cases/cross_dept_requests)
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.business_line_budgets import BusinessLineBudget
from ..models.case_closures import CaseClosure
from ..models.cases import Case
from ..models.cross_dept_requests import CrossDeptRequest
from ..models.financial_transactions import FinancialTransaction
from ..models.process_instances import ProcessInstance
from ..schemas.dashboard import (
    AlertItem,
    DashboardAlertsRequest,
    DashboardAlertsResponse,
    DashboardMetricsRequest,
    DashboardMetricsResponse,
)

_ALERT_TYPE_NAMES = {
    "DEADLINE_APPROACHING": "期限临近",
    "MAJOR_CASE": "重大案件",
    "OVERDUE_TASK": "逾期任务",
}
_SEVERITY_NAMES = {"HIGH": "高", "MEDIUM": "中", "LOW": "低"}
_MAJOR_CASE_THRESHOLD = Decimal("50000000")
_DEADLINE_DAYS = 7


def _period_start(period: str) -> datetime:
    now = datetime.now(timezone.utc)
    if period == "WEEK":
        return now - timedelta(days=7)
    if period == "YEAR":
        return now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    # MONTH (default)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


async def get_metrics(
    req: DashboardMetricsRequest,
    tenant_id: str,
    db: AsyncSession,
) -> DashboardMetricsResponse:
    period = req.period if req.period in ("WEEK", "MONTH", "YEAR") else "MONTH"
    since = _period_start(period)
    now = datetime.now(timezone.utc)
    current_year = str(now.year)

    # activeCaseCount
    active_count: int = (
        await db.execute(
            select(func.count()).where(
                Case.is_deleted == False,
                Case.tenant_id == tenant_id,
                Case.case_status == "IN_PROGRESS",
            )
        )
    ).scalar_one()

    # totalAmount
    total_amount_raw = (
        await db.execute(
            select(func.sum(Case.target_amount)).where(
                Case.is_deleted == False,
                Case.tenant_id == tenant_id,
            )
        )
    ).scalar_one()
    total_amount = str(total_amount_raw.quantize(Decimal("0.01"))) if total_amount_raw else "0.00"

    # newCaseCount
    new_count: int = (
        await db.execute(
            select(func.count()).where(
                Case.is_deleted == False,
                Case.tenant_id == tenant_id,
                Case.created_at >= since,
            )
        )
    ).scalar_one()

    # closedCaseCount
    closed_count: int = (
        await db.execute(
            select(func.count()).where(
                Case.is_deleted == False,
                Case.tenant_id == tenant_id,
                Case.case_status == "CLOSED",
                Case.updated_at >= since,
            )
        )
    ).scalar_one()

    # winRate: JUDGMENT_WON / (JUDGMENT_WON + JUDGMENT_LOST)
    win_count: int = (
        await db.execute(
            select(func.count()).where(
                CaseClosure.is_deleted == False,
                CaseClosure.tenant_id == tenant_id,
                CaseClosure.closure_type == "JUDGMENT_WON",
            )
        )
    ).scalar_one()
    judgment_count: int = (
        await db.execute(
            select(func.count()).where(
                CaseClosure.is_deleted == False,
                CaseClosure.tenant_id == tenant_id,
                CaseClosure.closure_type.in_(["JUDGMENT_WON", "JUDGMENT_LOST"]),
            )
        )
    ).scalar_one()
    win_rate: Optional[str] = (
        str((Decimal(win_count) / Decimal(judgment_count)).quantize(Decimal("0.0001")))
        if judgment_count > 0
        else None
    )

    # budgetExecutionRate: OUT EXECUTED tx in current year / total budget in current year
    tx_sum_raw = (
        await db.execute(
            select(func.sum(FinancialTransaction.amount)).where(
                FinancialTransaction.is_deleted == False,
                FinancialTransaction.tenant_id == tenant_id,
                FinancialTransaction.fund_direction == "OUT",
                FinancialTransaction.transaction_status == "EXECUTED",
                extract("year", FinancialTransaction.transaction_date) == int(current_year),
            )
        )
    ).scalar_one()
    budget_sum_raw = (
        await db.execute(
            select(func.sum(BusinessLineBudget.total_budget)).where(
                BusinessLineBudget.is_deleted == False,
                BusinessLineBudget.tenant_id == tenant_id,
                BusinessLineBudget.fiscal_year == current_year,
            )
        )
    ).scalar_one()
    budget_rate: Optional[str] = None
    if budget_sum_raw and budget_sum_raw > 0:
        numerator = tx_sum_raw or Decimal("0")
        budget_rate = str((numerator / budget_sum_raw).quantize(Decimal("0.0001")))

    return DashboardMetricsResponse(
        period=period,
        activeCaseCount=active_count,
        totalAmount=total_amount,
        newCaseCount=new_count,
        winRate=win_rate,
        budgetExecutionRate=budget_rate,
        closedCaseCount=closed_count,
    )


async def get_alerts(
    req: DashboardAlertsRequest,
    tenant_id: str,
    db: AsyncSession,
) -> DashboardAlertsResponse:
    now = datetime.now(timezone.utc)
    deadline_threshold = now + timedelta(days=_DEADLINE_DAYS)
    page = req.page
    page_size = req.pageSize
    items: list[AlertItem] = []

    # DEADLINE_APPROACHING: process_instances.end_date in next 7 days, status=ACTIVE
    pi_rows = (
        await db.execute(
            select(ProcessInstance).where(
                ProcessInstance.is_deleted == False,
                ProcessInstance.tenant_id == tenant_id,
                ProcessInstance.status == "ACTIVE",
                ProcessInstance.end_date >= now.date(),
                ProcessInstance.end_date <= deadline_threshold.date(),
            )
        )
    ).scalars().all()

    for pi in pi_rows:
        case_name: Optional[str] = None
        if pi.case_id:
            case_row = (
                await db.execute(
                    select(Case.case_name).where(
                        Case.id == pi.case_id,
                        Case.is_deleted == False,
                    )
                )
            ).scalar_one_or_none()
            case_name = case_row

        days_left = (pi.end_date - now.date()).days
        items.append(
            AlertItem(
                alertId=f"DEADLINE_APPROACHING_{pi.id}",
                alertType="DEADLINE_APPROACHING",
                alertTypeName=_ALERT_TYPE_NAMES["DEADLINE_APPROACHING"],
                severity="HIGH",
                severityName=_SEVERITY_NAMES["HIGH"],
                title=f"案件「{case_name or '未知'}」流程节点期限还剩 {days_left} 天",
                caseId=pi.case_id,
                caseTitle=case_name,
                referenceUrl=f"/cases/{pi.case_id}/timeline" if pi.case_id else None,
                dueDate=datetime.combine(pi.end_date, datetime.min.time()).replace(tzinfo=timezone.utc).isoformat(),
                createdAt=now.isoformat(),
            )
        )

    # MAJOR_CASE: target_amount >= 5000万 AND status=IN_PROGRESS
    major_rows = (
        await db.execute(
            select(Case).where(
                Case.is_deleted == False,
                Case.tenant_id == tenant_id,
                Case.case_status == "IN_PROGRESS",
                Case.target_amount >= _MAJOR_CASE_THRESHOLD,
            )
        )
    ).scalars().all()

    for case in major_rows:
        items.append(
            AlertItem(
                alertId=f"MAJOR_CASE_{case.id}",
                alertType="MAJOR_CASE",
                alertTypeName=_ALERT_TYPE_NAMES["MAJOR_CASE"],
                severity="HIGH",
                severityName=_SEVERITY_NAMES["HIGH"],
                title=f"重大案件「{case.case_name}」标的额超过 5000 万",
                caseId=case.id,
                caseTitle=case.case_name,
                referenceUrl=f"/cases/{case.id}",
                dueDate=None,
                createdAt=now.isoformat(),
            )
        )

    # OVERDUE_TASK: cross_dept_requests.deadline < now AND status=PENDING
    overdue_rows = (
        await db.execute(
            select(CrossDeptRequest).where(
                CrossDeptRequest.is_deleted == False,
                CrossDeptRequest.tenant_id == tenant_id,
                CrossDeptRequest.status == "PENDING",
                CrossDeptRequest.deadline < now,
            )
        )
    ).scalars().all()

    for req_row in overdue_rows:
        case_name = None
        if req_row.case_id:
            case_row = (
                await db.execute(
                    select(Case.case_name).where(
                        Case.id == req_row.case_id,
                        Case.is_deleted == False,
                    )
                )
            ).scalar_one_or_none()
            case_name = case_row

        items.append(
            AlertItem(
                alertId=f"OVERDUE_TASK_{req_row.id}",
                alertType="OVERDUE_TASK",
                alertTypeName=_ALERT_TYPE_NAMES["OVERDUE_TASK"],
                severity="MEDIUM",
                severityName=_SEVERITY_NAMES["MEDIUM"],
                title=f"取证请求「{req_row.title}」已逾期",
                caseId=req_row.case_id,
                caseTitle=case_name,
                referenceUrl=f"/cases/{req_row.case_id}/evidence" if req_row.case_id else None,
                dueDate=req_row.deadline.isoformat() if req_row.deadline else None,
                createdAt=now.isoformat(),
            )
        )

    total = len(items)
    start = (page - 1) * page_size
    paged = items[start: start + page_size]

    return DashboardAlertsResponse(
        total=total,
        page=page,
        pageSize=page_size,
        items=paged,
    )
