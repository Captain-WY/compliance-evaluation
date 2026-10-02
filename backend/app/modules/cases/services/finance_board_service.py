"""跨案件财务看板 Service (切片 2.S11.a Dashboard + Provisions + Spend+Budget).

D1=C 角色级 DataRole 权限核心: `_compute_board_scope(user) -> BoardScope`
D2=C 律所支出 JOIN 路径 (Q2): 流水 → 案件 → ACTIVE 外聘律师 → 律所
D7=A 实时 SQL + alembic 013 索引 (idx_fin_trans_date / idx_est_liab_action / idx_case_counsels_firm)
Q11 写操作事务边界: 全部用 `async with session.begin():`
Q12 /spend/record 不扣预算, 不用 with_for_update (扣减在 S6)
Q14 ranking 权限 scope 细化 (LAWYER 仅自己案件的律所 slice)
Q15 空数据边界: 数值返 "0", 列表返 [], YoY 返 None + warnings

14 方法 + 1 权限核心:
    _compute_board_scope                       - 权限范围计算
    dashboard_kpi / trends / distribution / ranking / alerts
    provisions_list / summary / record / history / write_off
    spend_list / record / update_status
    budget_execution
"""
from __future__ import annotations
from app.adapters.identity import case_role_codes

import io
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any

from fastapi import BackgroundTasks
from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import CommonSession

from ..core.database import AsyncSessionLocal
from ..core.exceptions import BusinessException, NotFoundException
from ..core.config import get_settings
from ..enums.case_enums import (
    LiabilityActionType,
    LiabilityApprovalStatus,
    ReportCategory,
    ReportingTaskStatus,
    RiskProbability,
    TransactionStatus,
)
from ..models.business_line_budgets import BusinessLineBudget
from ..models.case_budgets import CaseBudget
from ..models.case_counsels import CaseCounsel
from ..models.case_members import CaseMember
from ..models.cases import Case
from ..models.estimated_liabilities import EstimatedLiability
from ..models.financial_transactions import FinancialTransaction
from ..models.reporting_tasks import ReportingTask
from ..models.sys_roles import SysRole
from ..models.sys_user_roles import SysUserRole
from ..models.sys_users import SysUser
from ..providers.minio_storage import MinIOStorageProvider
from ..schemas.finance_board import (
    AlertCaseInfo,
    BoardFilters,
    BudgetExecutionItem,
    BudgetExecutionRequest,
    BudgetExecutionResponse,
    BudgetOverrun,
    DashboardAlertsRequest,
    DashboardAlertsResponse,
    DashboardDistributionRequest,
    DashboardDistributionResponse,
    DashboardKpiRequest,
    DashboardKpiResponse,
    DashboardRankingRequest,
    DashboardRankingResponse,
    DashboardTrendsRequest,
    DashboardTrendsResponse,
    DistributionItem,
    ExecutionDelay,
    GenerateReportRequest,
    GenerateReportResponse,
    KpiYoY,
    ListReportTemplatesRequest,
    ListReportTemplatesResponse,
    ProvisionHistoryEntry,
    ProvisionLedgerItem,
    ProvisionShortfall,
    ProvisionsHistoryRequest,
    ProvisionsHistoryResponse,
    ProvisionsListRequest,
    ProvisionsListResponse,
    ProvisionsRecordRequest,
    ProvisionsRecordResponse,
    ProvisionsSummaryRequest,
    ProvisionsSummaryResponse,
    ProvisionsWriteOffRequest,
    ProvisionsWriteOffResponse,
    RankingItem,
    REPORT_TEMPLATES,
    ReportHistoryItem,
    ReportHistoryRequest,
    ReportHistoryResponse,
    ReportTaskStatusRequest,
    ReportTaskStatusResponse,
    ReportTemplateItem,
    SpendListRequest,
    SpendListResponse,
    SpendRecordItem,
    SpendRecordRequest,
    SpendRecordResponse,
    SpendUpdateStatusRequest,
    SpendUpdateStatusResponse,
    TrendPoint,
)


# =============================================================================
# 常量
# =============================================================================

EXECUTION_WARNING_THRESHOLD = Decimal("0.9")  # Q3: 超预算预警阈值
EXECUTION_DELAY_DAYS_THRESHOLD = 180  # Q15: 判决后超 180 天未回款视为逾期 (6 个月)
DEFAULT_CURRENCY = "CNY"


# =============================================================================
# D1=C 权限核心: BoardScope
# =============================================================================


@dataclass(frozen=True)
class BoardScope:
    """跨案件财务看板数据可见范围 (Q1).

    scope_type:
      ALL          — 全租户 (SYS_ADMIN / LEGAL_ADMIN / LEGAL_DIRECTOR)
      MY_CASES     — 仅自己经手案件 (LAWYER 等律师角色)
      BU_CASES     — 仅本业务线案件 (BUSINESS_COLLABORATOR)
      NONE         — 拒绝访问 (EXTERNAL_COUNSEL 或无角色)

    accessible_case_ids: MY_CASES 时的过滤案件列表 (empty → 无可见)
    business_lines: BU_CASES 时的过滤业务线列表 (empty → 无可见)
    """

    scope_type: str
    accessible_case_ids: list[str] = field(default_factory=list)
    business_lines: list[str] = field(default_factory=list)
    is_admin: bool = False  # 是否全租户权限 (reports 操作需要)


async def _load_user_global_roles(
    session: AsyncSession, tenant_id: str, user_id: str
) -> set[str]:
    """复用 S3 模式: 返回用户持有的 sys_roles.role_code 集合."""
    rows = (
        await session.execute(
            select(SysRole.role_code)
            .select_from(SysUserRole)
            .join(SysRole, SysRole.id == SysUserRole.role_id)
            .where(
                SysUserRole.user_id == user_id,
                SysUserRole.tenant_id == tenant_id,
                SysRole.is_deleted.is_(False),
            )
        )
    ).all()
    return case_role_codes(r[0] for r in rows)


async def _compute_board_scope(
    session: AsyncSession, tenant_id: str, user: SysUser
) -> BoardScope:
    """D1=C 决策: 基于 sys_user_roles 角色级 DataRole 计算数据范围.

    角色映射 (对齐 seed 实际 role_code + 兼容设计文档命名, 2.S11.a PRE2 修):
      SYS_ADMIN / LEGAL_ADMIN / LEGAL_DIRECTOR / COMPLIANCE_OFFICER  → ALL
      LEGAL_LAWYER / LAWYER (+ OWNER/CO_COUNSEL case_members)         → MY_CASES
      BUSINESS_USER / BUSINESS_COLLABORATOR                           → BU_CASES
      其他 (含 EXTERNAL_COUNSEL)                                       → NONE

    Seed 实际角色: SYS_ADMIN / LEGAL_ADMIN / LEGAL_LAWYER / BUSINESS_USER /
                   COMPLIANCE_OFFICER (不含 LAWYER / LEGAL_DIRECTOR / BUSINESS_COLLABORATOR,
                   保留兼容以适配未来 seed 扩充).
    """
    global_roles = await _load_user_global_roles(session, tenant_id, user.id)

    # 全租户管理层 + 合规人员 (需要跨案件审计视图)
    if global_roles & {
        "SYS_ADMIN", "LEGAL_ADMIN", "LEGAL_DIRECTOR", "COMPLIANCE_OFFICER",
    }:
        return BoardScope(scope_type="ALL", is_admin=True)

    # 律师: 仅自己经手案件 (LEGAL_LAWYER 是 seed 标准 code; LAWYER 保留兼容)
    if global_roles & {"LEGAL_LAWYER", "LAWYER"}:
        case_ids = (
            await session.execute(
                select(CaseMember.case_id).where(
                    and_(
                        CaseMember.user_id == user.id,
                        CaseMember.tenant_id == tenant_id,
                        CaseMember.is_deleted.is_(False),
                        CaseMember.status == "ACTIVE",
                    )
                )
            )
        ).all()
        return BoardScope(
            scope_type="MY_CASES",
            accessible_case_ids=[r[0] for r in case_ids],
        )

    # 业务协作者: 仅本业务线 (BUSINESS_USER 是 seed 标准 code; BUSINESS_COLLABORATOR 保留兼容)
    if global_roles & {"BUSINESS_USER", "BUSINESS_COLLABORATOR"}:
        lines = (
            await session.execute(
                select(Case.business_line)
                .select_from(CaseMember)
                .join(Case, Case.id == CaseMember.case_id)
                .where(
                    and_(
                        CaseMember.user_id == user.id,
                        CaseMember.tenant_id == tenant_id,
                        CaseMember.is_deleted.is_(False),
                        CaseMember.status == "ACTIVE",
                        Case.business_line.is_not(None),
                    )
                )
                .distinct()
            )
        ).all()
        return BoardScope(
            scope_type="BU_CASES",
            business_lines=[r[0] for r in lines if r[0]],
        )

    return BoardScope(scope_type="NONE")


def _scope_case_filter(scope: BoardScope, case_id_col) -> Any:
    """根据 scope 返回 SQLAlchemy WHERE 表达式 (用于 case_id 维度过滤).

    ALL → TRUE; MY_CASES → case_id IN (ids); BU_CASES → 需 JOIN cases 按 business_line;
    NONE → FALSE (应由调用方提前 raise 4013)
    """
    if scope.scope_type == "ALL":
        return case_id_col.is_not(None)  # 恒真, 无过滤
    if scope.scope_type == "MY_CASES":
        if not scope.accessible_case_ids:
            # 空列表要构造永假条件 (非 IN [], 避免 SQL 语法错)
            return case_id_col == "__NO_MATCH_SENTINEL__"
        return case_id_col.in_(scope.accessible_case_ids)
    if scope.scope_type == "BU_CASES":
        # 需要 JOIN cases 按 business_line 过滤; 调用方需显式 JOIN 并传 Case.business_line
        return case_id_col == "__NEEDS_JOIN_SENTINEL__"
    # NONE → 永假 (实际调用处应已 raise)
    return case_id_col == "__SCOPE_NONE_SENTINEL__"


def _require_non_none_scope(scope: BoardScope) -> None:
    if scope.scope_type == "NONE":
        raise BusinessException(
            code=4013, message="当前角色无权访问财务看板 (EXTERNAL_COUNSEL 或无角色)"
        )


async def _scoped_case_query(scope: BoardScope, tenant_id: str) -> Any:
    """返回"本 scope 下所有可见案件 id"的子查询 (用于 JOIN 条件)."""
    if scope.scope_type == "ALL":
        return (
            select(Case.id)
            .where(and_(Case.tenant_id == tenant_id, Case.is_deleted.is_(False)))
            .subquery()
        )
    if scope.scope_type == "MY_CASES":
        ids = scope.accessible_case_ids or ["__NO_MATCH__"]
        return (
            select(Case.id)
            .where(
                and_(
                    Case.tenant_id == tenant_id,
                    Case.is_deleted.is_(False),
                    Case.id.in_(ids),
                )
            )
            .subquery()
        )
    if scope.scope_type == "BU_CASES":
        lines = scope.business_lines or ["__NO_MATCH__"]
        return (
            select(Case.id)
            .where(
                and_(
                    Case.tenant_id == tenant_id,
                    Case.is_deleted.is_(False),
                    Case.business_line.in_(lines),
                )
            )
            .subquery()
        )
    # NONE
    return (
        select(Case.id)
        .where(Case.id == "__NO_MATCH__")
        .subquery()
    )


def _apply_filters(conditions: list, filters: BoardFilters, case_alias=Case) -> None:
    """追加通用 BoardFilters 的 WHERE 条件 (case 维度)."""
    if filters.business_line:
        conditions.append(case_alias.business_line == filters.business_line)
    if filters.case_type_code:
        conditions.append(case_alias.case_type_code == filters.case_type_code)
    if filters.risk_level:
        conditions.append(case_alias.risk_level == filters.risk_level.value)


# =============================================================================
# 1. /dashboard/kpi
# =============================================================================


async def dashboard_kpi(
    session: AsyncSession,
    tenant_id: str,
    payload: DashboardKpiRequest,
    user: SysUser,
) -> DashboardKpiResponse:
    scope = await _compute_board_scope(session, tenant_id, user)
    _require_non_none_scope(scope)

    case_sq = await _scoped_case_query(scope, tenant_id)
    warnings: list[str] = []

    # total_claims: cases.target_amount SUM (scope 过滤)
    conds_case = [
        Case.tenant_id == tenant_id,
        Case.is_deleted.is_(False),
        Case.id.in_(select(case_sq.c.id)),
        Case.filing_date >= payload.time_range.start,
        Case.filing_date <= payload.time_range.end,
    ]
    _apply_filters(conds_case, payload.filters)
    claims_row = (
        await session.execute(
            select(func.coalesce(func.sum(Case.target_amount), 0)).where(and_(*conds_case))
        )
    ).scalar_one()
    total_claims = Decimal(claims_row or 0)

    # total_recovered: financial_transactions IN + EXECUTED
    conds_in = [
        FinancialTransaction.tenant_id == tenant_id,
        FinancialTransaction.is_deleted.is_(False),
        FinancialTransaction.fund_direction == "IN",
        FinancialTransaction.transaction_status == TransactionStatus.EXECUTED.value,
        FinancialTransaction.case_id.in_(select(case_sq.c.id)),
        FinancialTransaction.transaction_date >= payload.time_range.start,
        FinancialTransaction.transaction_date <= payload.time_range.end,
    ]
    recovered_row = (
        await session.execute(
            select(func.coalesce(func.sum(FinancialTransaction.amount), 0)).where(
                and_(*conds_in)
            )
        )
    ).scalar_one()
    total_recovered = Decimal(recovered_row or 0)

    # total_legal_spend: financial_transactions OUT + EXECUTED
    conds_out = [
        FinancialTransaction.tenant_id == tenant_id,
        FinancialTransaction.is_deleted.is_(False),
        FinancialTransaction.fund_direction == "OUT",
        FinancialTransaction.transaction_status == TransactionStatus.EXECUTED.value,
        FinancialTransaction.case_id.in_(select(case_sq.c.id)),
        FinancialTransaction.transaction_date >= payload.time_range.start,
        FinancialTransaction.transaction_date <= payload.time_range.end,
    ]
    spend_row = (
        await session.execute(
            select(func.coalesce(func.sum(FinancialTransaction.amount), 0)).where(
                and_(*conds_out)
            )
        )
    ).scalar_one()
    total_legal_spend = Decimal(spend_row or 0)

    # total_loss_avoided = total_claims - total_recovered (简化: 避免损失 = 涉诉 - 已回款)
    # 生产环境可引入 provisions 累加后 = claims - (recovered + provisioned_paid)
    total_loss_avoided = max(total_claims - total_recovered, Decimal(0))

    # YoY: 同期对比 (去年同期)
    def _yoy_calc(curr: Decimal, prev: Decimal) -> float | None:
        if prev <= Decimal(0):
            return None
        return float((curr - prev) / prev)

    prev_start = date(
        payload.time_range.start.year - 1,
        payload.time_range.start.month,
        payload.time_range.start.day,
    )
    prev_end = date(
        payload.time_range.end.year - 1,
        payload.time_range.end.month,
        payload.time_range.end.day,
    )

    async def _prev_period_amount(direction: str) -> Decimal:
        prev_conds = [
            FinancialTransaction.tenant_id == tenant_id,
            FinancialTransaction.is_deleted.is_(False),
            FinancialTransaction.fund_direction == direction,
            FinancialTransaction.transaction_status == TransactionStatus.EXECUTED.value,
            FinancialTransaction.case_id.in_(select(case_sq.c.id)),
            FinancialTransaction.transaction_date >= prev_start,
            FinancialTransaction.transaction_date <= prev_end,
        ]
        row = (
            await session.execute(
                select(func.coalesce(func.sum(FinancialTransaction.amount), 0)).where(
                    and_(*prev_conds)
                )
            )
        ).scalar_one()
        return Decimal(row or 0)

    prev_recovered = await _prev_period_amount("IN")
    prev_spend = await _prev_period_amount("OUT")
    yoy_recovered = _yoy_calc(total_recovered, prev_recovered)
    yoy_spend = _yoy_calc(total_legal_spend, prev_spend)
    if yoy_recovered is None or yoy_spend is None:
        warnings.append("部分指标去年同期无数据, 同比无法计算")

    return DashboardKpiResponse(
        total_claims=total_claims,
        total_recovered=total_recovered,
        total_loss_avoided=total_loss_avoided,
        total_legal_spend=total_legal_spend,
        yoy=KpiYoY(
            total_claims_pct=None,  # 简化: 案件维度无需同比
            total_recovered_pct=yoy_recovered,
            total_loss_avoided_pct=None,
            total_legal_spend_pct=yoy_spend,
        ),
        warnings=warnings,
    )


# =============================================================================
# 2. /dashboard/trends
# =============================================================================


def _format_interval(dt: datetime | date, interval: str) -> str:
    if isinstance(dt, datetime):
        dt = dt.date()
    if interval == "MONTH":
        return f"{dt.year:04d}-{dt.month:02d}"
    if interval == "QUARTER":
        q = (dt.month - 1) // 3 + 1
        return f"{dt.year:04d}-Q{q}"
    return f"{dt.year:04d}"


async def dashboard_trends(
    session: AsyncSession,
    tenant_id: str,
    payload: DashboardTrendsRequest,
    user: SysUser,
) -> DashboardTrendsResponse:
    scope = await _compute_board_scope(session, tenant_id, user)
    _require_non_none_scope(scope)
    case_sq = await _scoped_case_query(scope, tenant_id)

    # 根据 metric 选择数据源
    points_map: dict[str, Decimal] = {}

    if payload.metric in ("LEGAL_SPEND", "RECOVERY_AMOUNT"):
        direction = "OUT" if payload.metric == "LEGAL_SPEND" else "IN"
        conds = [
            FinancialTransaction.tenant_id == tenant_id,
            FinancialTransaction.is_deleted.is_(False),
            FinancialTransaction.fund_direction == direction,
            FinancialTransaction.transaction_status == TransactionStatus.EXECUTED.value,
            FinancialTransaction.case_id.in_(select(case_sq.c.id)),
            FinancialTransaction.transaction_date >= payload.time_range.start,
            FinancialTransaction.transaction_date <= payload.time_range.end,
        ]
        rows = (
            await session.execute(
                select(
                    FinancialTransaction.transaction_date,
                    FinancialTransaction.amount,
                ).where(and_(*conds))
            )
        ).all()
        for dt, amt in rows:
            if dt is None:
                continue
            key = _format_interval(dt, payload.interval)
            points_map[key] = points_map.get(key, Decimal(0)) + Decimal(amt or 0)

    elif payload.metric == "NEW_CLAIMS":
        conds = [
            Case.tenant_id == tenant_id,
            Case.is_deleted.is_(False),
            Case.id.in_(select(case_sq.c.id)),
            Case.filing_date >= payload.time_range.start,
            Case.filing_date <= payload.time_range.end,
        ]
        _apply_filters(conds, payload.filters)
        rows = (
            await session.execute(
                select(Case.filing_date, Case.target_amount).where(and_(*conds))
            )
        ).all()
        for dt, amt in rows:
            if dt is None:
                continue
            key = _format_interval(dt, payload.interval)
            points_map[key] = points_map.get(key, Decimal(0)) + Decimal(amt or 0)

    elif payload.metric == "PROVISION_AMOUNT":
        conds = [
            EstimatedLiability.tenant_id == tenant_id,
            EstimatedLiability.is_deleted.is_(False),
            EstimatedLiability.case_id.in_(select(case_sq.c.id)),
            EstimatedLiability.action_type == LiabilityActionType.PROVISION.value,
            EstimatedLiability.assessment_date >= payload.time_range.start,
            EstimatedLiability.assessment_date <= payload.time_range.end,
        ]
        rows = (
            await session.execute(
                select(
                    EstimatedLiability.assessment_date,
                    EstimatedLiability.adjustment_amount,
                ).where(and_(*conds))
            )
        ).all()
        for dt, amt in rows:
            if dt is None:
                continue
            key = _format_interval(dt, payload.interval)
            points_map[key] = points_map.get(key, Decimal(0)) + Decimal(amt or 0)
    else:
        raise BusinessException(code=4001, message=f"不支持的 metric={payload.metric!r}")

    points = [
        TrendPoint(date=k, value=v)
        for k, v in sorted(points_map.items())
    ]
    return DashboardTrendsResponse(
        metric=payload.metric,
        interval=payload.interval,
        points=points,
        warnings=[] if points else ["查询区间内无数据"],
    )


# =============================================================================
# 3. /dashboard/distribution
# =============================================================================


async def dashboard_distribution(
    session: AsyncSession,
    tenant_id: str,
    payload: DashboardDistributionRequest,
    user: SysUser,
) -> DashboardDistributionResponse:
    scope = await _compute_board_scope(session, tenant_id, user)
    _require_non_none_scope(scope)
    case_sq = await _scoped_case_query(scope, tenant_id)

    # 根据 dimension 选择分组列
    if payload.dimension == "BY_BUSINESS_UNIT":
        group_col = Case.business_line
    elif payload.dimension == "BY_CASE_TYPE":
        group_col = Case.case_type_code
    elif payload.dimension == "BY_RISK_LEVEL":
        group_col = Case.risk_level
    else:
        raise BusinessException(code=4001, message=f"不支持的 dimension={payload.dimension!r}")

    # 根据 metric 选择金额来源 — 统一 JOIN cases 以支持 group_col
    if payload.metric == "LEGAL_SPEND":
        stmt = (
            select(group_col, func.coalesce(func.sum(FinancialTransaction.amount), 0))
            .select_from(FinancialTransaction)
            .join(Case, Case.id == FinancialTransaction.case_id)
            .where(
                and_(
                    FinancialTransaction.tenant_id == tenant_id,
                    FinancialTransaction.is_deleted.is_(False),
                    FinancialTransaction.fund_direction == "OUT",
                    FinancialTransaction.transaction_status == TransactionStatus.EXECUTED.value,
                    FinancialTransaction.transaction_date >= payload.time_range.start,
                    FinancialTransaction.transaction_date <= payload.time_range.end,
                    Case.is_deleted.is_(False),
                    Case.id.in_(select(case_sq.c.id)),
                )
            )
            .group_by(group_col)
        )
    elif payload.metric == "NEW_CLAIMS":
        stmt = (
            select(group_col, func.coalesce(func.sum(Case.target_amount), 0))
            .where(
                and_(
                    Case.tenant_id == tenant_id,
                    Case.is_deleted.is_(False),
                    Case.id.in_(select(case_sq.c.id)),
                    Case.filing_date >= payload.time_range.start,
                    Case.filing_date <= payload.time_range.end,
                )
            )
            .group_by(group_col)
        )
    elif payload.metric == "PROVISION_AMOUNT":
        stmt = (
            select(group_col, func.coalesce(func.sum(EstimatedLiability.adjustment_amount), 0))
            .select_from(EstimatedLiability)
            .join(Case, Case.id == EstimatedLiability.case_id)
            .where(
                and_(
                    EstimatedLiability.tenant_id == tenant_id,
                    EstimatedLiability.is_deleted.is_(False),
                    EstimatedLiability.action_type == LiabilityActionType.PROVISION.value,
                    EstimatedLiability.assessment_date >= payload.time_range.start,
                    EstimatedLiability.assessment_date <= payload.time_range.end,
                    Case.is_deleted.is_(False),
                    Case.id.in_(select(case_sq.c.id)),
                )
            )
            .group_by(group_col)
        )
    else:
        raise BusinessException(code=4001, message=f"不支持的 metric={payload.metric!r}")

    rows = (await session.execute(stmt)).all()
    raw = [(r[0] or "UNSPECIFIED", Decimal(r[1] or 0)) for r in rows]
    total = sum((v for _, v in raw), Decimal(0))

    items: list[DistributionItem] = []
    for label, v in raw:
        pct = float(v / total) if total > 0 else 0.0
        items.append(DistributionItem(label=str(label), value=v, percentage=pct))
    # 按 value desc 排序
    items.sort(key=lambda x: x.value, reverse=True)

    return DashboardDistributionResponse(
        metric=payload.metric,
        dimension=payload.dimension,
        items=items,
        total=total,
    )


# =============================================================================
# 4. /dashboard/ranking (Q2 JOIN + Q14 scope 细化)
# =============================================================================


async def dashboard_ranking(
    session: AsyncSession,
    tenant_id: str,
    payload: DashboardRankingRequest,
    user: SysUser,
) -> DashboardRankingResponse:
    scope = await _compute_board_scope(session, tenant_id, user)
    _require_non_none_scope(scope)
    case_sq = await _scoped_case_query(scope, tenant_id)

    if payload.metric == "VENDOR_SPEND" and payload.dimension == "BY_LAW_FIRM":
        # Q2 律所支出 JOIN: 流水 → 案件 → ACTIVE 外聘律师 → 律所
        stmt = (
            select(
                CaseCounsel.law_firm_name,
                CaseCounsel.law_firm_id,
                func.coalesce(func.sum(FinancialTransaction.amount), 0).label("total_spend"),
                func.count(func.distinct(FinancialTransaction.case_id)).label("case_count"),
            )
            .select_from(FinancialTransaction)
            .join(
                CaseCounsel,
                and_(
                    CaseCounsel.case_id == FinancialTransaction.case_id,
                    CaseCounsel.status == "ACTIVE",
                    CaseCounsel.counsel_type == "EXTERNAL",
                    CaseCounsel.is_deleted.is_(False),
                ),
            )
            .where(
                and_(
                    FinancialTransaction.tenant_id == tenant_id,
                    FinancialTransaction.is_deleted.is_(False),
                    FinancialTransaction.fund_direction == "OUT",
                    FinancialTransaction.transaction_status == TransactionStatus.EXECUTED.value,
                    FinancialTransaction.transaction_date >= payload.time_range.start,
                    FinancialTransaction.transaction_date <= payload.time_range.end,
                    FinancialTransaction.case_id.in_(select(case_sq.c.id)),
                    CaseCounsel.law_firm_name.is_not(None),
                )
            )
            .group_by(CaseCounsel.law_firm_name, CaseCounsel.law_firm_id)
            .order_by(func.sum(FinancialTransaction.amount).desc())
            .limit(payload.limit)
        )
    elif payload.metric == "PROVISION_AMOUNT" and payload.dimension == "BY_CASE":
        # 案件级计提排行
        stmt = (
            select(
                Case.case_name,
                Case.id,
                func.coalesce(func.sum(EstimatedLiability.adjustment_amount), 0).label(
                    "total_spend"
                ),
                func.count(EstimatedLiability.id).label("case_count"),
            )
            .select_from(EstimatedLiability)
            .join(Case, Case.id == EstimatedLiability.case_id)
            .where(
                and_(
                    EstimatedLiability.tenant_id == tenant_id,
                    EstimatedLiability.is_deleted.is_(False),
                    EstimatedLiability.action_type == LiabilityActionType.PROVISION.value,
                    EstimatedLiability.assessment_date >= payload.time_range.start,
                    EstimatedLiability.assessment_date <= payload.time_range.end,
                    Case.is_deleted.is_(False),
                    Case.id.in_(select(case_sq.c.id)),
                )
            )
            .group_by(Case.id, Case.case_name)
            .order_by(func.sum(EstimatedLiability.adjustment_amount).desc())
            .limit(payload.limit)
        )
    else:
        raise BusinessException(
            code=4001,
            message=f"不支持的 metric+dimension 组合 ({payload.metric}/{payload.dimension})",
        )

    rows = (await session.execute(stmt)).all()
    items = [
        RankingItem(
            rank=i + 1,
            name=str(row[0] or "UNSPECIFIED"),
            id=row[1],
            value=Decimal(row[2] or 0),
            extra={"case_count": int(row[3] or 0)},
        )
        for i, row in enumerate(rows)
    ]
    return DashboardRankingResponse(
        metric=payload.metric,
        dimension=payload.dimension,
        items=items,
        warnings=[] if items else ["查询条件下无律所支出数据"],
    )


# =============================================================================
# 5. /dashboard/alerts
# =============================================================================


async def dashboard_alerts(
    session: AsyncSession,
    tenant_id: str,
    payload: DashboardAlertsRequest,
    user: SysUser,
) -> DashboardAlertsResponse:
    scope = await _compute_board_scope(session, tenant_id, user)
    _require_non_none_scope(scope)
    case_sq = await _scoped_case_query(scope, tenant_id)
    limit = payload.limit

    # 5.1 BudgetOverrun: case_budgets, used_amount = SUM(OUT+EXECUTED), execution_rate > 0.9
    budget_rows = (
        await session.execute(
            select(
                Case.id,
                Case.internal_case_no,
                Case.case_name,
                Case.business_line,
                Case.risk_level,
                CaseBudget.total_budget,
            )
            .select_from(CaseBudget)
            .join(Case, Case.id == CaseBudget.case_id)
            .where(
                and_(
                    CaseBudget.tenant_id == tenant_id,
                    CaseBudget.is_deleted.is_(False),
                    Case.is_deleted.is_(False),
                    Case.id.in_(select(case_sq.c.id)),
                )
            )
        )
    ).all()

    budget_overruns: list[BudgetOverrun] = []
    for case_id, icn, cname, bl, rl, tb in budget_rows:
        used = (
            await session.execute(
                select(func.coalesce(func.sum(FinancialTransaction.amount), 0)).where(
                    and_(
                        FinancialTransaction.tenant_id == tenant_id,
                        FinancialTransaction.is_deleted.is_(False),
                        FinancialTransaction.case_id == case_id,
                        FinancialTransaction.fund_direction == "OUT",
                        FinancialTransaction.transaction_status
                        == TransactionStatus.EXECUTED.value,
                    )
                )
            )
        ).scalar_one()
        used_amt = Decimal(used or 0)
        if tb and tb > 0:
            rate = used_amt / Decimal(tb)
            if rate >= EXECUTION_WARNING_THRESHOLD:
                budget_overruns.append(
                    BudgetOverrun(
                        case=AlertCaseInfo(
                            case_id=case_id,
                            internal_case_no=icn or "",
                            case_name=cname or "",
                            business_line=bl,
                            risk_level=rl,
                        ),
                        total_budget=Decimal(tb),
                        used_amount=used_amt,
                        execution_rate=float(rate),
                    )
                )
        if len(budget_overruns) >= limit:
            break

    # 5.2 ExecutionDelays: 已结案 (close_date 非空) 但距今超 180 天仍无 IN 流水
    today = date.today()
    delay_rows = (
        await session.execute(
            select(
                Case.id,
                Case.internal_case_no,
                Case.case_name,
                Case.business_line,
                Case.risk_level,
                Case.close_date,
                Case.target_amount,
            )
            .where(
                and_(
                    Case.tenant_id == tenant_id,
                    Case.is_deleted.is_(False),
                    Case.id.in_(select(case_sq.c.id)),
                    Case.close_date.is_not(None),
                    Case.target_amount > 0,
                )
            )
            .limit(limit * 3)  # 取多一些, 后续过滤
        )
    ).all()

    execution_delays: list[ExecutionDelay] = []
    for case_id, icn, cname, bl, rl, cld, tgt in delay_rows:
        if cld is None:
            continue
        days_overdue = (today - cld).days
        if days_overdue < EXECUTION_DELAY_DAYS_THRESHOLD:
            continue
        actual = (
            await session.execute(
                select(func.coalesce(func.sum(FinancialTransaction.amount), 0)).where(
                    and_(
                        FinancialTransaction.tenant_id == tenant_id,
                        FinancialTransaction.is_deleted.is_(False),
                        FinancialTransaction.case_id == case_id,
                        FinancialTransaction.fund_direction == "IN",
                        FinancialTransaction.transaction_status
                        == TransactionStatus.EXECUTED.value,
                    )
                )
            )
        ).scalar_one()
        actual_amt = Decimal(actual or 0)
        expected = Decimal(tgt or 0)
        if actual_amt >= expected:
            continue  # 已全回款
        execution_delays.append(
            ExecutionDelay(
                case=AlertCaseInfo(
                    case_id=case_id,
                    internal_case_no=icn or "",
                    case_name=cname or "",
                    business_line=bl,
                    risk_level=rl,
                ),
                expected_recovery=expected,
                actual_recovery=actual_amt,
                days_overdue=days_overdue,
            )
        )
        if len(execution_delays) >= limit:
            break

    # 5.3 ProvisionShortfalls: HIGH/MAJOR 风险 + 无 estimated_liabilities 且案件未归档
    shortfall_rows = (
        await session.execute(
            select(
                Case.id,
                Case.internal_case_no,
                Case.case_name,
                Case.business_line,
                Case.risk_level,
                Case.target_amount,
            )
            .outerjoin(
                EstimatedLiability,
                and_(
                    EstimatedLiability.case_id == Case.id,
                    EstimatedLiability.is_deleted.is_(False),
                    EstimatedLiability.action_type == LiabilityActionType.PROVISION.value,
                ),
            )
            .where(
                and_(
                    Case.tenant_id == tenant_id,
                    Case.is_deleted.is_(False),
                    Case.id.in_(select(case_sq.c.id)),
                    Case.risk_level.in_(["MAJOR", "IMPORTANT"]),
                    Case.case_status.in_(["PENDING", "IN_PROGRESS"]),
                    Case.target_amount > 0,
                    EstimatedLiability.id.is_(None),
                )
            )
            .limit(limit)
        )
    ).all()

    provision_shortfalls = [
        ProvisionShortfall(
            case=AlertCaseInfo(
                case_id=row[0],
                internal_case_no=row[1] or "",
                case_name=row[2] or "",
                business_line=row[3],
                risk_level=row[4],
            ),
            target_amount=Decimal(row[5] or 0),
        )
        for row in shortfall_rows
    ]

    warnings: list[str] = []
    if not budget_overruns and not execution_delays and not provision_shortfalls:
        warnings.append("当前无任何预警项")

    return DashboardAlertsResponse(
        budget_overruns=budget_overruns,
        execution_delays=execution_delays,
        provision_shortfalls=provision_shortfalls,
        warnings=warnings,
    )


# =============================================================================
# 6. /provisions/list
# =============================================================================


async def provisions_list(
    session: AsyncSession,
    tenant_id: str,
    payload: ProvisionsListRequest,
    user: SysUser,
) -> ProvisionsListResponse:
    scope = await _compute_board_scope(session, tenant_id, user)
    _require_non_none_scope(scope)
    case_sq = await _scoped_case_query(scope, tenant_id)

    page = payload.pagination.page
    size = payload.pagination.size
    offset = (page - 1) * size

    # 聚合 estimated_liabilities 按 case_id
    # net_provisioned = SUM(PROVISION + ADJUSTMENT) - SUM(REVERSAL 绝对值) — 直接用 current_amount 最新值
    # 简化: 取每个 case 最新一条 provision 记录的 current_amount

    # 先找出有 provision 记录的 cases
    ed_subq = (
        select(
            EstimatedLiability.case_id,
            func.max(EstimatedLiability.assessment_date).label("latest_date"),
            func.sum(EstimatedLiability.adjustment_amount).label("total_adj"),
            # 对 approval_status 用 MAX 取最新一条 (实际应按 created_at 排序)
            func.max(EstimatedLiability.approval_status).label("max_status"),
        )
        .where(
            and_(
                EstimatedLiability.tenant_id == tenant_id,
                EstimatedLiability.is_deleted.is_(False),
                EstimatedLiability.case_id.in_(select(case_sq.c.id)),
            )
        )
        .group_by(EstimatedLiability.case_id)
        .subquery()
    )

    base_conds = [
        Case.tenant_id == tenant_id,
        Case.is_deleted.is_(False),
        Case.id.in_(select(ed_subq.c.case_id)),
    ]
    if payload.status:
        base_conds.append(ed_subq.c.max_status == payload.status.value)
    if payload.risk_level:
        base_conds.append(Case.risk_level == payload.risk_level.value)
    if payload.business_line:
        base_conds.append(Case.business_line == payload.business_line)

    count_stmt = (
        select(func.count(Case.id))
        .select_from(Case)
        .join(ed_subq, ed_subq.c.case_id == Case.id)
        .where(and_(*base_conds))
    )
    total = (await session.execute(count_stmt)).scalar_one() or 0

    stmt = (
        select(
            Case.id,
            Case.internal_case_no,
            Case.case_name,
            Case.business_line,
            Case.risk_level,
            Case.case_status,
            Case.target_amount,
            ed_subq.c.total_adj,
            ed_subq.c.latest_date,
            ed_subq.c.max_status,
        )
        .select_from(Case)
        .join(ed_subq, ed_subq.c.case_id == Case.id)
        .where(and_(*base_conds))
        .order_by(ed_subq.c.latest_date.desc())
        .limit(size)
        .offset(offset)
    )
    rows = (await session.execute(stmt)).all()

    items = [
        ProvisionLedgerItem(
            case_id=r[0],
            internal_case_no=r[1] or "",
            case_name=r[2] or "",
            business_line=r[3],
            risk_level=r[4],
            case_status=r[5],
            total_claim_amount=Decimal(r[6] or 0),
            total_provisioned=Decimal(r[7] or 0),
            latest_provision_date=r[8],
            approval_status=r[9],
            currency=DEFAULT_CURRENCY,
        )
        for r in rows
    ]
    return ProvisionsListResponse(total=int(total), page=page, size=size, items=items)


# =============================================================================
# 7. /provisions/summary
# =============================================================================


async def provisions_summary(
    session: AsyncSession,
    tenant_id: str,
    payload: ProvisionsSummaryRequest,
    user: SysUser,
) -> ProvisionsSummaryResponse:
    scope = await _compute_board_scope(session, tenant_id, user)
    _require_non_none_scope(scope)
    case_sq = await _scoped_case_query(scope, tenant_id)

    # Provisioned: APPROVED + PROVISION
    conds_base = [
        EstimatedLiability.tenant_id == tenant_id,
        EstimatedLiability.is_deleted.is_(False),
        EstimatedLiability.case_id.in_(select(case_sq.c.id)),
    ]
    if payload.business_line:
        # 显式加 Case 软删保护 (6 铁律 #4: JOIN Case 必须带 is_deleted)
        conds_base.append(Case.business_line == payload.business_line)
        conds_base.append(Case.is_deleted.is_(False))

    def _build_conditions(action: str, status: str | None = None) -> list:
        c = list(conds_base)
        c.append(EstimatedLiability.action_type == action)
        if status:
            c.append(EstimatedLiability.approval_status == status)
        return c

    provisioned = (
        await session.execute(
            select(
                func.coalesce(func.sum(EstimatedLiability.adjustment_amount), 0)
            )
            .select_from(EstimatedLiability)
            .join(Case, Case.id == EstimatedLiability.case_id)
            .where(
                and_(
                    *_build_conditions(
                        LiabilityActionType.PROVISION.value,
                        LiabilityApprovalStatus.APPROVED.value,
                    )
                )
            )
        )
    ).scalar_one()

    pending = (
        await session.execute(
            select(
                func.coalesce(func.sum(EstimatedLiability.adjustment_amount), 0)
            )
            .select_from(EstimatedLiability)
            .join(Case, Case.id == EstimatedLiability.case_id)
            .where(
                and_(
                    *_build_conditions(
                        LiabilityActionType.PROVISION.value,
                        LiabilityApprovalStatus.PENDING.value,
                    )
                )
            )
        )
    ).scalar_one()

    written_off = (
        await session.execute(
            select(
                func.coalesce(func.sum(EstimatedLiability.adjustment_amount), 0)
            )
            .select_from(EstimatedLiability)
            .join(Case, Case.id == EstimatedLiability.case_id)
            .where(and_(*_build_conditions(LiabilityActionType.REVERSAL.value)))
        )
    ).scalar_one()

    case_cnt = (
        await session.execute(
            select(func.count(func.distinct(EstimatedLiability.case_id)))
            .select_from(EstimatedLiability)
            .join(Case, Case.id == EstimatedLiability.case_id)
            .where(and_(*conds_base))
        )
    ).scalar_one()

    return ProvisionsSummaryResponse(
        total_provisioned_amount=Decimal(provisioned or 0),
        total_pending_amount=Decimal(pending or 0),
        total_written_off_amount=Decimal(written_off or 0),
        case_count=int(case_cnt or 0),
        currency=DEFAULT_CURRENCY,
    )


# =============================================================================
# 8. /provisions/record (Q11 事务, Q13 Response)
# =============================================================================


async def _assert_case_in_scope(
    session: AsyncSession, tenant_id: str, case_id: str, scope: BoardScope
) -> Case:
    """确认 case 存在且在 scope 内, 否则 404 (防权限边界泄漏)."""
    case_obj = (
        await session.execute(
            select(Case).where(
                and_(
                    Case.id == case_id,
                    Case.tenant_id == tenant_id,
                    Case.is_deleted.is_(False),
                )
            )
        )
    ).scalar_one_or_none()
    if case_obj is None:
        raise NotFoundException(resource="案件", resource_id=case_id)
    if scope.scope_type == "MY_CASES" and case_id not in set(scope.accessible_case_ids):
        raise NotFoundException(resource="案件", resource_id=case_id)
    if scope.scope_type == "BU_CASES" and case_obj.business_line not in set(scope.business_lines):
        raise NotFoundException(resource="案件", resource_id=case_id)
    return case_obj


async def _current_provisioned_amount(
    session: AsyncSession, tenant_id: str, case_id: str
) -> Decimal:
    row = (
        await session.execute(
            select(func.coalesce(func.sum(EstimatedLiability.adjustment_amount), 0)).where(
                and_(
                    EstimatedLiability.tenant_id == tenant_id,
                    EstimatedLiability.is_deleted.is_(False),
                    EstimatedLiability.case_id == case_id,
                )
            )
        )
    ).scalar_one()
    return Decimal(row or 0)


async def provisions_record(
    session: AsyncSession,
    tenant_id: str,
    payload: ProvisionsRecordRequest,
    user: SysUser,
) -> ProvisionsRecordResponse:
    # 注: scope 计算放事务块内, 避免与 session.begin() 的 autobegin 冲突 (TROUBLESHOOTING §5.9)
    async with session.begin():
        scope = await _compute_board_scope(session, tenant_id, user)
        _require_non_none_scope(scope)
        case_obj = await _assert_case_in_scope(session, tenant_id, payload.case_id, scope)

        prev_total = await _current_provisioned_amount(session, tenant_id, payload.case_id)
        # PROVISION 正数 = 补提; 负数 = 转回 (action_type 仍为 PROVISION, adjustment 为负)
        new_total = prev_total + payload.amount
        # 确定 action_type: 正 = PROVISION; 负 = ADJUSTMENT (转回使用 ADJUSTMENT 语义)
        action = (
            LiabilityActionType.PROVISION.value
            if payload.amount >= 0
            else LiabilityActionType.ADJUSTMENT.value
        )

        record_id = f"liab_{uuid.uuid4().hex[:12]}"
        liab = EstimatedLiability(
            id=record_id,
            tenant_id=tenant_id,
            case_id=payload.case_id,
            action_type=action,
            previous_amount=prev_total,
            adjustment_amount=payload.amount,
            current_amount=new_total,
            currency=payload.currency.value,
            assessment_date=payload.provision_date,
            # Q15 风险概率回落: 若未传, 默认从 case.risk_level 推断 (MAJOR → HIGHLY_PROBABLE, 其他 → PROBABLE)
            risk_probability=(
                RiskProbability.HIGHLY_PROBABLE.value
                if case_obj.risk_level == "MAJOR"
                else RiskProbability.PROBABLE.value
            ),
            basis_of_estimate=payload.reason,
            attachment_ids=list(payload.attachment_ids or []),
            approval_status=LiabilityApprovalStatus.PENDING.value,
            created_by=user.id,
            updated_by=user.id,
        )
        session.add(liab)
        await session.flush()

        created_at_val = liab.created_at

    return ProvisionsRecordResponse(
        record_id=record_id,
        case_id=payload.case_id,
        new_total_amount=new_total,
        approval_status=LiabilityApprovalStatus.PENDING.value,
        created_at=created_at_val,
        warnings=[] if payload.amount >= 0 else ["负数 amount 已记为 ADJUSTMENT (转回)"],
    )


# =============================================================================
# 9. /provisions/history
# =============================================================================


async def provisions_history(
    session: AsyncSession,
    tenant_id: str,
    payload: ProvisionsHistoryRequest,
    user: SysUser,
) -> ProvisionsHistoryResponse:
    scope = await _compute_board_scope(session, tenant_id, user)
    _require_non_none_scope(scope)
    await _assert_case_in_scope(session, tenant_id, payload.case_id, scope)

    rows = (
        await session.execute(
            select(
                EstimatedLiability.id,
                EstimatedLiability.action_type,
                EstimatedLiability.adjustment_amount,
                EstimatedLiability.assessment_date,
                EstimatedLiability.approval_status,
                EstimatedLiability.basis_of_estimate,
                EstimatedLiability.attachment_ids,
                EstimatedLiability.created_by,
                EstimatedLiability.created_at,
            )
            .where(
                and_(
                    EstimatedLiability.tenant_id == tenant_id,
                    EstimatedLiability.is_deleted.is_(False),
                    EstimatedLiability.case_id == payload.case_id,
                )
            )
            .order_by(EstimatedLiability.created_at.desc())
        )
    ).all()

    operator_ids = {r[7] for r in rows if r[7]}
    operator_names = {}
    if operator_ids:
        async with CommonSession() as common:
            operator_names = dict((await common.execute(
                select(SysUser.id, SysUser.real_name).where(
                    SysUser.id.in_(operator_ids), SysUser.tenant_id == tenant_id,
                    SysUser.is_deleted.is_(False),
                )
            )).all())

    entries = [
        ProvisionHistoryEntry(
            id=r[0],
            action_type=LiabilityActionType(r[1]),
            amount=Decimal(r[2] or 0),
            assessment_date=r[3],
            approval_status=r[4] or "PENDING",
            notes=r[5],
            attachment_ids=list(r[6] or []),
            operator_id=r[7],
            operator_name=operator_names.get(r[7]),
            created_at=r[8],
        )
        for r in rows
    ]
    total = await _current_provisioned_amount(session, tenant_id, payload.case_id)
    return ProvisionsHistoryResponse(
        case_id=payload.case_id,
        total_provisioned=total,
        entries=entries,
    )


# =============================================================================
# 10. /provisions/write-off (Q11 事务)
# =============================================================================


async def provisions_write_off(
    session: AsyncSession,
    tenant_id: str,
    payload: ProvisionsWriteOffRequest,
    user: SysUser,
) -> ProvisionsWriteOffResponse:
    async with session.begin():
        scope = await _compute_board_scope(session, tenant_id, user)
        _require_non_none_scope(scope)
        case_obj = await _assert_case_in_scope(session, tenant_id, payload.case_id, scope)

        prev_total = await _current_provisioned_amount(session, tenant_id, payload.case_id)
        if prev_total <= Decimal(0):
            raise BusinessException(
                code=4003,
                message=f"案件 {payload.case_id} 无计提余额, 无需冲销",
            )

        # REVERSAL: adjustment_amount = -(actual_loss_amount), current_amount = prev - actual
        reversal_amount = -payload.actual_loss_amount
        new_total = prev_total + reversal_amount

        reversal_id = f"liab_{uuid.uuid4().hex[:12]}"
        liab = EstimatedLiability(
            id=reversal_id,
            tenant_id=tenant_id,
            case_id=payload.case_id,
            action_type=LiabilityActionType.REVERSAL.value,
            previous_amount=prev_total,
            adjustment_amount=reversal_amount,
            current_amount=new_total,
            currency=DEFAULT_CURRENCY,
            assessment_date=payload.write_off_date,
            risk_probability=RiskProbability.REMOTE.value,  # 已结案, 风险远
            basis_of_estimate=payload.remarks,
            approval_status=LiabilityApprovalStatus.APPROVED.value,  # 冲销直接 APPROVED
            approved_by=user.id,
            approved_at=datetime.now(timezone.utc),
            created_by=user.id,
            updated_by=user.id,
        )
        session.add(liab)
        await session.flush()
        created_at_val = liab.created_at

    balance = prev_total - payload.actual_loss_amount
    warnings: list[str] = []
    if balance < 0:
        warnings.append(f"计提不足差额 {-balance} (实际损失超计提)")
    elif balance > 0:
        warnings.append(f"计提超额差额 {balance} (实际损失小于计提)")

    return ProvisionsWriteOffResponse(
        reversal_id=reversal_id,
        case_id=payload.case_id,
        new_total_amount=new_total,
        balance=balance,
        created_at=created_at_val,
        warnings=warnings,
    )


# =============================================================================
# 11. /spend/list
# =============================================================================


async def spend_list(
    session: AsyncSession,
    tenant_id: str,
    payload: SpendListRequest,
    user: SysUser,
) -> SpendListResponse:
    scope = await _compute_board_scope(session, tenant_id, user)
    _require_non_none_scope(scope)
    case_sq = await _scoped_case_query(scope, tenant_id)

    page = payload.pagination.page
    size = payload.pagination.size
    offset = (page - 1) * size

    conds = [
        FinancialTransaction.tenant_id == tenant_id,
        FinancialTransaction.is_deleted.is_(False),
        FinancialTransaction.fund_direction == "OUT",
        FinancialTransaction.case_id.in_(select(case_sq.c.id)),
        # JOIN Case 软删保护 (6 铁律 #4)
        Case.is_deleted.is_(False),
    ]
    if payload.expense_type:
        conds.append(FinancialTransaction.transaction_type == payload.expense_type)
    if payload.payment_status:
        conds.append(
            FinancialTransaction.transaction_status == payload.payment_status.value
        )
    if payload.business_line:
        conds.append(Case.business_line == payload.business_line)
    if payload.time_range:
        conds.append(FinancialTransaction.transaction_date >= payload.time_range.start)
        conds.append(FinancialTransaction.transaction_date <= payload.time_range.end)

    # JOIN Case 取 business_line + 内部案号
    # JOIN CaseCounsel LEFT 取律所名 (Q2 优先级)
    count_stmt = (
        select(func.count(FinancialTransaction.id))
        .select_from(FinancialTransaction)
        .join(Case, Case.id == FinancialTransaction.case_id)
        .where(and_(*conds))
    )
    total = (await session.execute(count_stmt)).scalar_one() or 0

    # 子查询: 每个 case 的第一个 ACTIVE EXTERNAL counsel (D8 推断)
    counsel_subq = (
        select(
            CaseCounsel.case_id,
            func.max(CaseCounsel.law_firm_id).label("law_firm_id"),
            func.max(CaseCounsel.law_firm_name).label("law_firm_name"),
        )
        .where(
            and_(
                # 补 tenant_id 隔离 (Batch A 审计补)
                CaseCounsel.tenant_id == tenant_id,
                CaseCounsel.is_deleted.is_(False),
                CaseCounsel.status == "ACTIVE",
                CaseCounsel.counsel_type == "EXTERNAL",
            )
        )
        .group_by(CaseCounsel.case_id)
        .subquery()
    )

    stmt = (
        select(
            FinancialTransaction.id,
            FinancialTransaction.case_id,
            Case.internal_case_no,
            Case.case_name,
            FinancialTransaction.transaction_type,
            FinancialTransaction.amount,
            FinancialTransaction.currency,
            FinancialTransaction.transaction_status,
            FinancialTransaction.counterparty_name,
            counsel_subq.c.law_firm_id,
            counsel_subq.c.law_firm_name,
            FinancialTransaction.apply_date,
            FinancialTransaction.transaction_date,
            FinancialTransaction.created_at,
        )
        .select_from(FinancialTransaction)
        .join(Case, Case.id == FinancialTransaction.case_id)
        .outerjoin(counsel_subq, counsel_subq.c.case_id == FinancialTransaction.case_id)
        .where(and_(*conds))
        .order_by(FinancialTransaction.created_at.desc())
        .limit(size)
        .offset(offset)
    )
    rows = (await session.execute(stmt)).all()

    items = [
        SpendRecordItem(
            id=r[0],
            case_id=r[1],
            internal_case_no=r[2] or "",
            case_name=r[3] or "",
            expense_type=r[4] or "UNKNOWN",
            amount=Decimal(r[5] or 0),
            currency=r[6] or DEFAULT_CURRENCY,
            transaction_status=r[7] or TransactionStatus.PENDING.value,
            # Q2 优先级: law_firm_name (JOIN) > counterparty_name (字段)
            payee_name=r[10] or r[8],
            law_firm_id=r[9],
            due_date=r[11],
            paid_date=r[12],
            created_at=r[13],
        )
        for r in rows
    ]
    return SpendListResponse(total=int(total), page=page, size=size, items=items)


# =============================================================================
# 12. /spend/record (Q11 事务, Q12 不扣预算)
# =============================================================================


async def spend_record(
    session: AsyncSession,
    tenant_id: str,
    payload: SpendRecordRequest,
    user: SysUser,
) -> SpendRecordResponse:
    async with session.begin():
        scope = await _compute_board_scope(session, tenant_id, user)
        _require_non_none_scope(scope)
        await _assert_case_in_scope(session, tenant_id, payload.case_id, scope)

        spend_id = f"ft_{uuid.uuid4().hex[:12]}"
        ft = FinancialTransaction(
            id=spend_id,
            tenant_id=tenant_id,
            case_id=payload.case_id,
            transaction_type=payload.expense_type,
            fund_direction="OUT",
            amount=payload.amount,
            currency=payload.currency.value,
            transaction_status=TransactionStatus.PENDING.value,
            apply_date=payload.due_date,
            counterparty_name=payload.payee,
            description=payload.note,
            # invoice_attachment_ids 放 extended_data (financial_transactions 无专属字段)
            extended_data=(
                {"invoice_attachment_ids": list(payload.invoice_attachment_ids)}
                if payload.invoice_attachment_ids
                else None
            ),
            created_by=user.id,
            updated_by=user.id,
        )
        session.add(ft)
        await session.flush()
        created_at_val = ft.created_at

    return SpendRecordResponse(
        spend_id=spend_id,
        case_id=payload.case_id,
        transaction_status=TransactionStatus.PENDING.value,
        created_at=created_at_val,
        warnings=[],
    )


# =============================================================================
# 13. /spend/update-status (Q11 事务)
# =============================================================================


# 允许的状态流转 (guard): PENDING → APPROVED/REJECTED/CANCELLED; APPROVED → EXECUTED/CANCELLED
_STATE_MACHINE: dict[str, set[str]] = {
    "PENDING": {"APPROVED", "REJECTED", "CANCELLED"},
    "APPROVED": {"EXECUTED", "CANCELLED"},
    "EXECUTED": set(),  # 终态
    "REJECTED": set(),
    "CANCELLED": set(),
}


async def spend_update_status(
    session: AsyncSession,
    tenant_id: str,
    payload: SpendUpdateStatusRequest,
    user: SysUser,
) -> SpendUpdateStatusResponse:
    async with session.begin():
        scope = await _compute_board_scope(session, tenant_id, user)
        _require_non_none_scope(scope)
        ft = (
            await session.execute(
                select(FinancialTransaction).where(
                    and_(
                        FinancialTransaction.id == payload.spend_id,
                        FinancialTransaction.tenant_id == tenant_id,
                        FinancialTransaction.is_deleted.is_(False),
                    )
                )
            )
        ).scalar_one_or_none()
        if ft is None:
            raise NotFoundException(resource="支出流水", resource_id=payload.spend_id)

        # scope 校验: case 必须在 scope 内
        await _assert_case_in_scope(session, tenant_id, ft.case_id, scope)

        prev_status = ft.transaction_status or TransactionStatus.PENDING.value
        new_status = payload.new_status.value

        allowed_next = _STATE_MACHINE.get(prev_status, set())
        if new_status not in allowed_next:
            raise BusinessException(
                code=4003,
                message=(
                    f"非法状态流转 {prev_status} → {new_status}. "
                    f"允许: {sorted(allowed_next) or '终态, 无转移'}"
                ),
            )

        # EXECUTED 必须带 actual_payment_date
        if new_status == TransactionStatus.EXECUTED.value and not payload.actual_payment_date:
            raise BusinessException(
                code=4001, message="状态流转到 EXECUTED 必须提供 actual_payment_date"
            )

        ft.transaction_status = new_status
        if new_status == TransactionStatus.EXECUTED.value:
            ft.transaction_date = payload.actual_payment_date
        ft.updated_by = user.id

        updated_at_val = datetime.now(timezone.utc)

    return SpendUpdateStatusResponse(
        spend_id=payload.spend_id,
        previous_status=prev_status,
        new_status=new_status,
        updated_at=updated_at_val,
        warnings=[],
    )


# =============================================================================
# 14. /budget/execution
# =============================================================================


async def budget_execution(
    session: AsyncSession,
    tenant_id: str,
    payload: BudgetExecutionRequest,
    user: SysUser,
) -> BudgetExecutionResponse:
    scope = await _compute_board_scope(session, tenant_id, user)
    _require_non_none_scope(scope)
    case_sq = await _scoped_case_query(scope, tenant_id)

    # 按 business_line 聚合: business_line_budgets 年度 total; 动态计算 consumed = OUT+EXECUTED, processing = OUT+PENDING/APPROVED
    year_str = str(payload.year)
    budget_rows = (
        await session.execute(
            select(
                BusinessLineBudget.business_line,
                func.coalesce(func.sum(BusinessLineBudget.total_budget), 0),
            )
            .where(
                and_(
                    BusinessLineBudget.tenant_id == tenant_id,
                    BusinessLineBudget.is_deleted.is_(False),
                    BusinessLineBudget.fiscal_year == year_str,
                )
            )
            .group_by(BusinessLineBudget.business_line)
        )
    ).all()

    items: list[BudgetExecutionItem] = []
    for bl, tb in budget_rows:
        if not bl:
            continue
        # consumed: EXECUTED
        consumed = (
            await session.execute(
                select(func.coalesce(func.sum(FinancialTransaction.amount), 0))
                .select_from(FinancialTransaction)
                .join(Case, Case.id == FinancialTransaction.case_id)
                .where(
                    and_(
                        FinancialTransaction.tenant_id == tenant_id,
                        FinancialTransaction.is_deleted.is_(False),
                        FinancialTransaction.fund_direction == "OUT",
                        FinancialTransaction.transaction_status
                        == TransactionStatus.EXECUTED.value,
                        Case.business_line == bl,
                        Case.id.in_(select(case_sq.c.id)),
                        func.extract("year", FinancialTransaction.transaction_date)
                        == payload.year,
                    )
                )
            )
        ).scalar_one()
        # processing: PENDING + APPROVED
        processing = (
            await session.execute(
                select(func.coalesce(func.sum(FinancialTransaction.amount), 0))
                .select_from(FinancialTransaction)
                .join(Case, Case.id == FinancialTransaction.case_id)
                .where(
                    and_(
                        FinancialTransaction.tenant_id == tenant_id,
                        FinancialTransaction.is_deleted.is_(False),
                        FinancialTransaction.fund_direction == "OUT",
                        FinancialTransaction.transaction_status.in_(
                            [
                                TransactionStatus.PENDING.value,
                                TransactionStatus.APPROVED.value,
                            ]
                        ),
                        Case.business_line == bl,
                        Case.id.in_(select(case_sq.c.id)),
                        func.extract("year", FinancialTransaction.apply_date)
                        == payload.year,
                    )
                )
            )
        ).scalar_one()

        tb_d = Decimal(tb or 0)
        cons_d = Decimal(consumed or 0)
        proc_d = Decimal(processing or 0)
        remaining = tb_d - cons_d - proc_d
        rate = float(cons_d / tb_d) if tb_d > 0 else 0.0
        items.append(
            BudgetExecutionItem(
                dimension_name=bl,
                total_budget=tb_d,
                consumed_amount=cons_d,
                processing_amount=proc_d,
                remaining_amount=remaining,
                execution_rate=rate,
                is_warning=rate >= float(EXECUTION_WARNING_THRESHOLD),
            )
        )

    # 按 execution_rate 降序 (高风险在前)
    items.sort(key=lambda x: x.execution_rate, reverse=True)

    return BudgetExecutionResponse(
        year=payload.year,
        dimension=payload.dimension,
        items=items,
        currency=DEFAULT_CURRENCY,
    )


# =============================================================================
# S11.b Reports: 模板列表 / 触发生成 / 状态轮询 / 历史查询
# =============================================================================

_REPORT_BUCKET = "sld-reports"
_PRESIGNED_URL_TTL = 3600  # Q3 决策: 1 小时


def _get_report_storage() -> MinIOStorageProvider:
    """获取 MinIO Provider 实例 (同 case_dossier_service 模式)."""
    s = get_settings()
    return MinIOStorageProvider(
        endpoint=s.MINIO_ENDPOINT,
        access_key=s.MINIO_ACCESS_KEY,
        secret_key=s.MINIO_SECRET_KEY,
        secure=s.MINIO_SECURE,
    )


_TEMPLATE_NAME_MAP: dict[str, str] = {
    t["template_id"]: t["template_name"] for t in REPORT_TEMPLATES
}


# ---------------------------------------------------------------------------
# 15. /reports/templates
# ---------------------------------------------------------------------------


async def list_report_templates(
    session: AsyncSession,
    tenant_id: str,
    user: SysUser,
) -> ListReportTemplatesResponse:
    """返回当前用户可见的报告模板列表.

    权限: 仅全租户管理层 (scope_type=ALL: SYS_ADMIN/LEGAL_ADMIN/LEGAL_DIRECTOR)
    可访问报告功能. LAWYER/BUSINESS_COLLABORATOR/EXTERNAL_COUNSEL 均拒绝.
    """
    scope = await _compute_board_scope(session, tenant_id, user)
    if scope.scope_type != "ALL":
        raise BusinessException(code=4013, message="无权限访问财务看板报告，仅管理层角色可访问")

    return ListReportTemplatesResponse(
        templates=[ReportTemplateItem(**t) for t in REPORT_TEMPLATES]
    )


# ---------------------------------------------------------------------------
# 16. /reports/generate
# ---------------------------------------------------------------------------


async def generate_report(
    session: AsyncSession,
    bg_tasks: BackgroundTasks,
    tenant_id: str,
    payload: GenerateReportRequest,
    user: SysUser,
) -> GenerateReportResponse:
    """触发异步报告生成 (D3=B FastAPI BackgroundTasks).

    权限: 仅 is_admin=True (全租户管理层) 可触发生成.
    流程: 创建 DRAFT 任务行 → 返回 task_id → BackgroundTasks 后台运行.
    """
    scope = await _compute_board_scope(session, tenant_id, user)
    if not scope.is_admin:
        raise BusinessException(code=4013, message="仅管理员角色可触发报告生成")

    if payload.template_id not in _TEMPLATE_NAME_MAP:
        raise BusinessException(
            code=4000, message=f"报告模板不存在: {payload.template_id}"
        )

    task_id = str(uuid.uuid4())
    task_name = _TEMPLATE_NAME_MAP[payload.template_id]

    async with session.begin():
        task = ReportingTask(
            id=task_id,
            tenant_id=tenant_id,
            task_name=task_name,
            report_category=ReportCategory.INTERNAL_FINANCE.value,
            template_id=payload.template_id,
            assignee_id=user.id,
            due_date=date.today(),
            status=ReportingTaskStatus.DRAFT.value,
            created_by=user.id,
            updated_by=user.id,
        )
        session.add(task)

    bg_tasks.add_task(
        _generate_report_background,
        task_id=task_id,
        template_id=payload.template_id,
        parameters=payload.parameters,
        tenant_id=tenant_id,
        user_id=user.id,
    )

    return GenerateReportResponse(task_id=task_id, status=ReportingTaskStatus.DRAFT.value)


# ---------------------------------------------------------------------------
# 17. /reports/task-status
# ---------------------------------------------------------------------------


async def report_task_status(
    session: AsyncSession,
    tenant_id: str,
    payload: ReportTaskStatusRequest,
    user: SysUser,
) -> ReportTaskStatusResponse:
    """轮询报告生成任务状态 (D4=A HTTP 轮询).

    权限: 管理员可查任意任务; 非管理员只能查自己触发的任务.
    COMPLETED 时重新生成预签名 URL (TTL=1h, Q3).
    """
    scope = await _compute_board_scope(session, tenant_id, user)
    if scope.scope_type == "NONE":
        raise BusinessException(code=4013, message="无权限访问财务看板报告")

    row = (
        await session.execute(
            select(ReportingTask).where(
                and_(
                    ReportingTask.id == payload.task_id,
                    ReportingTask.tenant_id == tenant_id,
                    ReportingTask.is_deleted.is_(False),
                )
            )
        )
    ).scalar_one_or_none()

    if row is None:
        raise NotFoundException("报告任务", payload.task_id)

    if not scope.is_admin and row.assignee_id != user.id:
        raise BusinessException(code=4013, message="无权查看该报告任务")

    report_url: str | None = None
    if row.status == ReportingTaskStatus.COMPLETED.value and row.report_url:
        obj_name = f"reports/{row.id}.xlsx"
        try:
            storage = _get_report_storage()
            report_url = await storage.get_file_url(
                _REPORT_BUCKET, obj_name, expires=_PRESIGNED_URL_TTL
            )
        except Exception:
            # 预签名 URL 有时效性 (TTL=1h); 存储的 report_url 可能已过期
            # 降级返回 None, 前端应提示用户稍后重试
            report_url = None

    return ReportTaskStatusResponse(
        task_id=row.id,
        status=row.status or ReportingTaskStatus.DRAFT.value,
        progress=None,
        report_url=report_url,
        error_detail=row.error_detail,
        generated_at=row.submitted_at,
    )


# ---------------------------------------------------------------------------
# 18. /reports/history
# ---------------------------------------------------------------------------


async def report_history(
    session: AsyncSession,
    tenant_id: str,
    payload: ReportHistoryRequest,
    user: SysUser,
) -> ReportHistoryResponse:
    """历史报告列表 (D6: 仅 INTERNAL_FINANCE 类别).

    权限: 管理员见全部; 非管理员仅见自己触发的报告.
    """
    scope = await _compute_board_scope(session, tenant_id, user)
    if scope.scope_type == "NONE":
        raise BusinessException(code=4013, message="无权限访问财务看板报告")

    conditions = [
        ReportingTask.tenant_id == tenant_id,
        ReportingTask.is_deleted.is_(False),
        ReportingTask.report_category == ReportCategory.INTERNAL_FINANCE.value,
    ]
    if not scope.is_admin:
        conditions.append(ReportingTask.assignee_id == user.id)
    if payload.template_id:
        conditions.append(ReportingTask.template_id == payload.template_id)
    if payload.time_range:
        conditions.append(ReportingTask.created_at >= datetime.combine(
            payload.time_range.start, datetime.min.time()
        ).replace(tzinfo=timezone.utc))
        conditions.append(ReportingTask.created_at <= datetime.combine(
            payload.time_range.end, datetime.max.time()
        ).replace(tzinfo=timezone.utc))

    total = (
        await session.execute(
            select(func.count()).select_from(ReportingTask).where(and_(*conditions))
        )
    ).scalar_one()

    offset = (payload.page - 1) * payload.size
    rows = (
        await session.execute(
            select(ReportingTask)
            .where(and_(*conditions))
            .order_by(ReportingTask.created_at.desc())
            .offset(offset)
            .limit(payload.size)
        )
    ).scalars().all()

    # 批量获取操作人姓名
    assignee_ids = list({r.assignee_id for r in rows if r.assignee_id})
    name_map: dict[str, str] = {}
    if assignee_ids:
        name_rows = (
            await session.execute(
                select(SysUser.id, SysUser.real_name).where(
                    SysUser.id.in_(assignee_ids)
                )
            )
        ).all()
        name_map = {r[0]: r[1] for r in name_rows}

    items = [
        ReportHistoryItem(
            task_id=r.id,
            template_id=r.template_id,
            template_name=_TEMPLATE_NAME_MAP.get(r.template_id or "", r.task_name),
            status=r.status or ReportingTaskStatus.DRAFT.value,
            generated_at=r.submitted_at,
            generated_by=r.assignee_id,
            generated_by_name=name_map.get(r.assignee_id or "", None),
            report_url=r.report_url if r.status == ReportingTaskStatus.COMPLETED.value else None,
        )
        for r in rows
    ]

    return ReportHistoryResponse(
        total=total,
        page=payload.page,
        size=payload.size,
        items=items,
    )


# ---------------------------------------------------------------------------
# BackgroundTasks 异步生成器 (D3=B, Q11 每次状态更新独立事务)
# ---------------------------------------------------------------------------


async def _generate_report_background(
    task_id: str,
    template_id: str,
    parameters: dict[str, Any],
    tenant_id: str,
    user_id: str,
) -> None:
    """后台报告生成: DRAFT → PROCESSING → COMPLETED / FAILED.

    每次状态更新开独立 AsyncSession + 事务 (Q11: 不共享路由层 session).
    """
    # Step 1: DRAFT → PROCESSING
    async with AsyncSessionLocal() as session:
        async with session.begin():
            task = await session.get(ReportingTask, task_id)
            if task is None:
                return
            task.status = ReportingTaskStatus.PROCESSING.value
            task.updated_by = user_id

    try:
        # Step 2: 生成 XLSX 数据 (Q2: openpyxl)
        async with AsyncSessionLocal() as session:
            wb = await _build_report_workbook(session, tenant_id, template_id, parameters)

        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)

        # Step 3: 上传 MinIO
        storage = _get_report_storage()
        obj_name = f"reports/{task_id}.xlsx"
        await storage.upload_file(
            buf,
            obj_name,
            _REPORT_BUCKET,
            content_type=(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            ),
        )
        report_url = await storage.get_file_url(
            _REPORT_BUCKET, obj_name, expires=_PRESIGNED_URL_TTL
        )

        # Step 4: PROCESSING → COMPLETED
        async with AsyncSessionLocal() as session:
            async with session.begin():
                task = await session.get(ReportingTask, task_id)
                if task:
                    task.status = ReportingTaskStatus.COMPLETED.value
                    task.report_url = report_url
                    task.submitted_at = datetime.now(timezone.utc)
                    task.updated_by = user_id

    except Exception as exc:
        # Step 5: PROCESSING → FAILED
        async with AsyncSessionLocal() as session:
            async with session.begin():
                task = await session.get(ReportingTask, task_id)
                if task:
                    task.status = ReportingTaskStatus.FAILED.value
                    task.error_detail = str(exc)[:1000]
                    task.updated_by = user_id


async def _build_report_workbook(
    session: AsyncSession,
    tenant_id: str,
    template_id: str,
    parameters: dict[str, Any],
) -> Any:
    """按 template_id 查询数据并生成 openpyxl Workbook."""
    import openpyxl  # noqa: PLC0415 — 延迟导入, 仅后台任务调用

    wb = openpyxl.Workbook()
    ws = wb.active

    if template_id == "PROVISION_LEDGER_MONTHLY":
        year = int(parameters.get("year", date.today().year))
        month = int(parameters.get("month", date.today().month))
        ws.title = f"预计负债台账_{year}{month:02d}"
        ws.append(["案件编号", "案件名称", "业务线", "诉请金额", "已计提净额", "最新计提日期", "审批状态"])

        rows = (
            await session.execute(
                select(
                    Case.internal_case_no,
                    Case.case_name,
                    Case.business_line,
                    Case.target_amount,
                    func.coalesce(
                        func.sum(
                            case(
                                (EstimatedLiability.action_type == LiabilityActionType.REVERSAL.value,
                                 -EstimatedLiability.adjustment_amount),
                                else_=EstimatedLiability.adjustment_amount,
                            )
                        ),
                        0,
                    ).label("net_provisioned"),
                    func.max(EstimatedLiability.assessment_date).label("latest_date"),
                    func.max(EstimatedLiability.approval_status).label("approval_status"),
                )
                .select_from(Case)
                .join(EstimatedLiability, EstimatedLiability.case_id == Case.id)
                .where(
                    and_(
                        Case.tenant_id == tenant_id,
                        Case.is_deleted.is_(False),
                        EstimatedLiability.tenant_id == tenant_id,
                        EstimatedLiability.is_deleted.is_(False),
                        func.extract("year", EstimatedLiability.assessment_date) == year,
                        func.extract("month", EstimatedLiability.assessment_date) == month,
                    )
                )
                .group_by(
                    Case.internal_case_no, Case.case_name,
                    Case.business_line, Case.target_amount,
                )
            )
        ).all()
        for r in rows:
            ws.append([r[0], r[1], r[2] or "", float(r[3] or 0),
                        float(r[4] or 0), str(r[5] or ""), r[6] or ""])

    elif template_id == "SPEND_SUMMARY_MONTHLY":
        year = int(parameters.get("year", date.today().year))
        month = int(parameters.get("month", date.today().month))
        ws.title = f"法律支出汇总_{year}{month:02d}"
        ws.append(["业务线", "费用类型", "支付总额(CNY)", "笔数"])

        rows = (
            await session.execute(
                select(
                    Case.business_line,
                    FinancialTransaction.expense_type,
                    func.sum(FinancialTransaction.amount).label("total"),
                    func.count().label("cnt"),
                )
                .select_from(FinancialTransaction)
                .join(Case, Case.id == FinancialTransaction.case_id)
                .where(
                    and_(
                        FinancialTransaction.tenant_id == tenant_id,
                        FinancialTransaction.is_deleted.is_(False),
                        FinancialTransaction.fund_direction == "OUT",
                        FinancialTransaction.transaction_status == TransactionStatus.EXECUTED.value,
                        func.extract("year", FinancialTransaction.transaction_date) == year,
                        func.extract("month", FinancialTransaction.transaction_date) == month,
                    )
                )
                .group_by(Case.business_line, FinancialTransaction.expense_type)
                .order_by(Case.business_line, func.sum(FinancialTransaction.amount).desc())
            )
        ).all()
        for r in rows:
            ws.append([r[0] or "未分类", r[1] or "", float(r[2] or 0), int(r[3])])

    elif template_id == "LAWYER_FEE_SETTLEMENT":
        year = int(parameters.get("year", date.today().year))
        quarter = int(parameters.get("quarter", 1))
        month_start = (quarter - 1) * 3 + 1
        month_end = quarter * 3
        ws.title = f"律师费结算_{year}Q{quarter}"
        ws.append(["律所名称", "案件编号", "案件名称", "费用类型", "金额(CNY)", "付款日期", "状态"])

        rows = (
            await session.execute(
                select(
                    CaseCounsel.law_firm_name,
                    Case.internal_case_no,
                    Case.case_name,
                    FinancialTransaction.expense_type,
                    FinancialTransaction.amount,
                    FinancialTransaction.transaction_date,
                    FinancialTransaction.transaction_status,
                )
                .select_from(FinancialTransaction)
                .join(Case, Case.id == FinancialTransaction.case_id)
                .join(
                    CaseCounsel,
                    and_(
                        CaseCounsel.case_id == FinancialTransaction.case_id,
                        CaseCounsel.counsel_type == "EXTERNAL",
                        CaseCounsel.status == "ACTIVE",
                        CaseCounsel.is_deleted.is_(False),
                    ),
                )
                .where(
                    and_(
                        FinancialTransaction.tenant_id == tenant_id,
                        FinancialTransaction.is_deleted.is_(False),
                        FinancialTransaction.fund_direction == "OUT",
                        FinancialTransaction.transaction_status.in_(
                            [TransactionStatus.APPROVED.value, TransactionStatus.EXECUTED.value]
                        ),
                        func.extract("year", FinancialTransaction.transaction_date) == year,
                        func.extract("month", FinancialTransaction.transaction_date).between(
                            month_start, month_end
                        ),
                    )
                )
                .order_by(CaseCounsel.law_firm_name, FinancialTransaction.transaction_date)
            )
        ).all()
        for r in rows:
            ws.append([
                r[0] or "未知律所", r[1], r[2],
                r[3] or "", float(r[4] or 0), str(r[5] or ""), r[6] or "",
            ])

    else:
        ws.title = "未知模板"
        ws.append(["template_id", template_id])
        ws.append(["parameters", str(parameters)])

    return wb
