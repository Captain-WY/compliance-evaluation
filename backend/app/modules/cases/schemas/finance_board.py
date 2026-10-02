"""跨案件财务看板 Pydantic Schema (切片 2.S11.a, Dashboard + Provisions + Spend+Budget).

字段严格对齐 docs/design/v1/api/03_finance_board/00_finance_board_overview.md v1.0 (含 PRE2 §9 Q1-Q15).

14 端点 (S11.b Reports 4 端点留后续):
    Dashboard (5):
        1. /finance/dashboard/kpi
        2. /finance/dashboard/trends
        3. /finance/dashboard/distribution
        4. /finance/dashboard/ranking
        5. /finance/dashboard/alerts
    Provisions (5):
        6. /finance/provisions/list
        7. /finance/provisions/summary
        8. /finance/provisions/record         (写, Q11 事务)
        9. /finance/provisions/history
        10. /finance/provisions/write-off     (写, Q11 事务)
    Spend + Budget (4):
        11. /finance/spend/list
        12. /finance/spend/record             (写, Q11 事务; Q12 不扣预算)
        13. /finance/spend/update-status      (写, Q11 事务)
        14. /finance/budget/execution

权限 (D1=C 角色级 DataRole, 详见 00 overview §3.1):
    - SYS_ADMIN / LEGAL_ADMIN / LEGAL_DIRECTOR: 全租户
    - LAWYER: 仅自己经手案件 (accessible_case_ids 过滤)
    - BUSINESS_COLLABORATOR: 仅本业务线 (business_lines 过滤)
    - EXTERNAL_COUNSEL: 4013 拒
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.modules.cases.enums.case_enums import (
    CurrencyCode,
    LiabilityActionType,
    LiabilityApprovalStatus,
    RiskLevel,
    TransactionStatus,
)


# =============================================================================
# 通用: 时间范围 / 分页 / filters
# =============================================================================


class TimeRange(BaseModel):
    """统计周期. 左闭右闭 (inclusive)."""

    model_config = ConfigDict(extra="forbid")

    start: date
    end: date


class BoardFilters(BaseModel):
    """通用业务过滤. 所有可选."""

    model_config = ConfigDict(extra="forbid")

    business_line: str | None = Field(None, max_length=64)
    case_type_code: str | None = Field(None, max_length=64)
    risk_level: RiskLevel | None = None


class BoardPagination(BaseModel):
    model_config = ConfigDict(extra="forbid")
    page: int = Field(1, ge=1)
    size: int = Field(20, ge=1, le=200)


# =============================================================================
# 1. /dashboard/kpi
# =============================================================================


class DashboardKpiRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    time_range: TimeRange
    filters: BoardFilters = Field(default_factory=BoardFilters)


class KpiYoY(BaseModel):
    """各核心指标的同比变化率 (前年同期对比). 无去年数据返 None + warnings."""

    total_claims_pct: float | None = None
    total_recovered_pct: float | None = None
    total_loss_avoided_pct: float | None = None
    total_legal_spend_pct: float | None = None


class DashboardKpiResponse(BaseModel):
    total_claims: Decimal = Field(..., description="涉诉总金额 (cases.target_amount SUM)")
    total_recovered: Decimal = Field(..., description="实际回款总金额 (financial_transactions.IN + EXECUTED)")
    total_loss_avoided: Decimal = Field(
        ...,
        description="避免损失 = 涉诉总金额 - 实际发生损失 (provisioned + paid); 法务核心绩效",
    )
    total_legal_spend: Decimal = Field(..., description="法律费用总支出 (OUT + EXECUTED)")
    yoy: KpiYoY = Field(default_factory=KpiYoY)
    warnings: list[str] = Field(default_factory=list)


# =============================================================================
# 2. /dashboard/trends
# =============================================================================


class DashboardTrendsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    metric: str = Field(
        ..., description="NEW_CLAIMS / RECOVERY_AMOUNT / LEGAL_SPEND / PROVISION_AMOUNT"
    )
    interval: str = Field("MONTH", description="MONTH / QUARTER / YEAR")
    time_range: TimeRange
    filters: BoardFilters = Field(default_factory=BoardFilters)


class TrendPoint(BaseModel):
    date: str = Field(..., description="ISO 格式 (YYYY-MM / YYYY-Q1 / YYYY)")
    value: Decimal


class DashboardTrendsResponse(BaseModel):
    metric: str
    interval: str
    points: list[TrendPoint] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


# =============================================================================
# 3. /dashboard/distribution
# =============================================================================


class DashboardDistributionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    metric: str = Field(
        ..., description="LEGAL_SPEND / NEW_CLAIMS / PROVISION_AMOUNT"
    )
    dimension: str = Field(
        ..., description="BY_BUSINESS_UNIT / BY_CASE_TYPE / BY_RISK_LEVEL"
    )
    time_range: TimeRange
    filters: BoardFilters = Field(default_factory=BoardFilters)


class DistributionItem(BaseModel):
    label: str = Field(..., description="维度取值 (如 '华东事业部')")
    value: Decimal
    percentage: float = Field(..., ge=0, le=1, description="占比 0~1")


class DashboardDistributionResponse(BaseModel):
    metric: str
    dimension: str
    items: list[DistributionItem] = Field(default_factory=list)
    total: Decimal = Field(..., description="所有 items.value 合计")


# =============================================================================
# 4. /dashboard/ranking (律所支出排行 D2 JOIN + D8 律所级)
# =============================================================================


class DashboardRankingRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    metric: str = Field(..., description="VENDOR_SPEND / PROVISION_AMOUNT")
    dimension: str = Field("BY_LAW_FIRM", description="BY_LAW_FIRM / BY_CASE / BY_CONTRACT")
    limit: int = Field(10, ge=1, le=100)
    time_range: TimeRange
    filters: BoardFilters = Field(default_factory=BoardFilters)


class RankingItem(BaseModel):
    rank: int
    name: str = Field(..., description="律所名 / 案件名 / 合同号")
    id: str | None = Field(None, description="law_firm_id / case_id / contract_id")
    value: Decimal
    extra: dict[str, Any] = Field(
        default_factory=dict, description="case_count / active_contracts 等"
    )


class DashboardRankingResponse(BaseModel):
    metric: str
    dimension: str
    items: list[RankingItem] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


# =============================================================================
# 5. /dashboard/alerts
# =============================================================================


class DashboardAlertsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    limit: int = Field(20, ge=1, le=100, description="各类预警列表最多返回条数")


class AlertCaseInfo(BaseModel):
    """预警项展示所需案件简要信息."""

    case_id: str
    internal_case_no: str
    case_name: str
    business_line: str | None = None
    risk_level: str | None = None


class BudgetOverrun(BaseModel):
    """超预算案件 (用 > total_budget * 0.9)."""

    case: AlertCaseInfo
    total_budget: Decimal
    used_amount: Decimal
    execution_rate: float = Field(..., ge=0, description="0~1+, >0.9 触发预警")


class ExecutionDelay(BaseModel):
    """判决生效但超期未回款案件 (当前简化: close_date > 6 月仍未 IN 流水)."""

    case: AlertCaseInfo
    expected_recovery: Decimal
    actual_recovery: Decimal
    days_overdue: int = Field(..., ge=0)


class ProvisionShortfall(BaseModel):
    """败诉风险极高但未计提 (HIGH/MAJOR risk_level 案件无 estimated_liabilities)."""

    case: AlertCaseInfo
    target_amount: Decimal


class DashboardAlertsResponse(BaseModel):
    budget_overruns: list[BudgetOverrun] = Field(default_factory=list)
    execution_delays: list[ExecutionDelay] = Field(default_factory=list)
    provision_shortfalls: list[ProvisionShortfall] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


# =============================================================================
# 6. /provisions/list
# =============================================================================


class ProvisionsListRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: LiabilityApprovalStatus | None = Field(
        None, description="过滤审批状态 (PENDING/APPROVED/REJECTED); None 返回全部"
    )
    risk_level: RiskLevel | None = None
    business_line: str | None = Field(None, max_length=64)
    pagination: BoardPagination = Field(default_factory=BoardPagination)


class ProvisionLedgerItem(BaseModel):
    """台账行: 一个案件一行, 聚合其 estimated_liabilities."""

    case_id: str
    internal_case_no: str
    case_name: str
    business_line: str | None = None
    risk_level: str | None = None
    case_status: str | None = None
    total_claim_amount: Decimal = Field(..., description="诉请金额 cases.target_amount")
    total_provisioned: Decimal = Field(..., description="已计提累加 (PROVISION - REVERSAL)")
    latest_provision_date: date | None = None
    approval_status: str | None = None
    currency: str = "CNY"


class ProvisionsListResponse(BaseModel):
    total: int
    page: int
    size: int
    items: list[ProvisionLedgerItem] = Field(default_factory=list)


# =============================================================================
# 7. /provisions/summary
# =============================================================================


class ProvisionsSummaryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: LiabilityApprovalStatus | None = None
    risk_level: RiskLevel | None = None
    business_line: str | None = Field(None, max_length=64)


class ProvisionsSummaryResponse(BaseModel):
    total_provisioned_amount: Decimal = Field(..., description="已 APPROVED PROVISION 累加")
    total_pending_amount: Decimal = Field(..., description="PENDING 预估总额")
    total_written_off_amount: Decimal = Field(..., description="REVERSAL 累加")
    case_count: int = Field(..., description="有计提的不同案件数")
    currency: str = "CNY"


# =============================================================================
# 8. /provisions/record (写, Q11 事务, Q13 Response 字段清单)
# =============================================================================


class ProvisionsRecordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    case_id: str = Field(..., max_length=36)
    amount: Decimal = Field(..., description="本次计提金额 (正数=补提, 负数=转回)")
    currency: CurrencyCode = CurrencyCode.CNY
    provision_date: date = Field(..., description="计提所属财务日期")
    reason: str = Field(..., min_length=1, max_length=2000, description="计提依据/原因")
    attachment_ids: list[str] = Field(default_factory=list)


class ProvisionsRecordResponse(BaseModel):
    record_id: str = Field(..., description="estimated_liabilities.id")
    case_id: str
    new_total_amount: Decimal = Field(..., description="本案件所有 PROVISION-REVERSAL 累加")
    approval_status: str = Field(..., description="LiabilityApprovalStatus (默认 PENDING)")
    created_at: datetime
    warnings: list[str] = Field(default_factory=list)


# =============================================================================
# 9. /provisions/history
# =============================================================================


class ProvisionsHistoryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    case_id: str = Field(..., max_length=36)


class ProvisionHistoryEntry(BaseModel):
    id: str = Field(..., description="estimated_liabilities.id")
    action_type: LiabilityActionType
    amount: Decimal
    assessment_date: date
    approval_status: str
    notes: str | None = None
    attachment_ids: list[str] = Field(default_factory=list)
    operator_id: str | None = None
    operator_name: str | None = None
    created_at: datetime


class ProvisionsHistoryResponse(BaseModel):
    case_id: str
    total_provisioned: Decimal = Field(..., description="累加当前总额")
    entries: list[ProvisionHistoryEntry] = Field(default_factory=list)


# =============================================================================
# 10. /provisions/write-off (写, Q11 事务)
# =============================================================================


class ProvisionsWriteOffRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    case_id: str = Field(..., max_length=36)
    actual_loss_amount: Decimal = Field(..., ge=Decimal(0), description="实际发生损失/赔付")
    write_off_date: date
    remarks: str = Field(..., min_length=1, max_length=2000)


class ProvisionsWriteOffResponse(BaseModel):
    reversal_id: str = Field(..., description="新 estimated_liabilities.id (action_type=REVERSAL)")
    case_id: str
    new_total_amount: Decimal = Field(..., description="冲销后案件总计提余额")
    balance: Decimal = Field(..., description="原计提 - 实际损失 = 差额 (正数=超提, 负数=不足)")
    created_at: datetime
    warnings: list[str] = Field(default_factory=list)


# =============================================================================
# 11. /spend/list
# =============================================================================


class SpendListRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expense_type: str | None = Field(
        None, description="LAWYER_FEE / COURT_FEE / PRESERVATION_FEE 等 sys_dicts.TRANSACTION_TYPE"
    )
    payment_status: TransactionStatus | None = Field(
        None, description="过滤 PENDING / APPROVED / EXECUTED"
    )
    business_line: str | None = Field(None, max_length=64)
    time_range: TimeRange | None = None
    pagination: BoardPagination = Field(default_factory=BoardPagination)


class SpendRecordItem(BaseModel):
    id: str
    case_id: str
    internal_case_no: str
    case_name: str
    expense_type: str
    amount: Decimal
    currency: str = "CNY"
    transaction_status: str
    payee_name: str | None = Field(None, description="Q2 JOIN 推断: case_counsels.law_firm_name 或 counterparty")
    law_firm_id: str | None = None
    due_date: date | None = None
    paid_date: date | None = None
    created_at: datetime


class SpendListResponse(BaseModel):
    total: int
    page: int
    size: int
    items: list[SpendRecordItem] = Field(default_factory=list)


# =============================================================================
# 12. /spend/record (写, Q11 事务, Q12 不扣预算)
# =============================================================================


class SpendRecordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    case_id: str = Field(..., max_length=36)
    expense_type: str = Field(..., max_length=64)
    amount: Decimal = Field(..., ge=Decimal(0))
    currency: CurrencyCode = CurrencyCode.CNY
    payee: str = Field(..., min_length=1, max_length=255, description="收款方名称")
    due_date: date | None = None
    invoice_attachment_ids: list[str] = Field(default_factory=list)
    note: str | None = Field(None, max_length=1000)


class SpendRecordResponse(BaseModel):
    spend_id: str = Field(..., description="financial_transactions.id")
    case_id: str
    transaction_status: str = Field("PENDING", description="初始 PENDING, 需走 update-status 流转")
    created_at: datetime
    warnings: list[str] = Field(default_factory=list)


# =============================================================================
# 13. /spend/update-status (写, Q11 事务)
# =============================================================================


class SpendUpdateStatusRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    spend_id: str = Field(..., max_length=36)
    new_status: TransactionStatus = Field(
        ..., description="目标状态: APPROVED / EXECUTED / REJECTED / CANCELLED"
    )
    actual_payment_date: date | None = Field(None, description="EXECUTED 时必填")
    remark: str | None = Field(None, max_length=1000)


class SpendUpdateStatusResponse(BaseModel):
    spend_id: str
    previous_status: str
    new_status: str
    updated_at: datetime
    warnings: list[str] = Field(default_factory=list)


# =============================================================================
# 14. /budget/execution
# =============================================================================


class BudgetExecutionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    year: int = Field(..., ge=2000, le=2100)
    dimension: str = Field(
        "BY_BUSINESS_UNIT",
        description="BY_BUSINESS_UNIT (业务线聚合) / BY_DEPARTMENT (部门聚合, 当前回落业务线)",
    )


class BudgetExecutionItem(BaseModel):
    dimension_name: str
    total_budget: Decimal
    consumed_amount: Decimal = Field(..., description="EXECUTED 流水 SUM")
    processing_amount: Decimal = Field(..., description="PENDING+APPROVED 流水 SUM")
    remaining_amount: Decimal = Field(..., description="total - consumed - processing")
    execution_rate: float = Field(..., ge=0, description="consumed/total, 0~1+")
    is_warning: bool = Field(..., description="Q3 execution_rate >= 0.9")


class BudgetExecutionResponse(BaseModel):
    year: int
    dimension: str
    items: list[BudgetExecutionItem] = Field(default_factory=list)
    currency: str = "CNY"


# =============================================================================
# S11.b Reports (4 端点): templates / generate / task-status / history
# =============================================================================

# Q1 决策: MVP 硬编码 3 个模板, 受 D1=C 权限过滤后返回
REPORT_TEMPLATES: list[dict] = [
    {
        "template_id": "PROVISION_LEDGER_MONTHLY",
        "template_name": "预计负债台账月报",
        "description": "按月汇总各案件计提/调整/冲销金额",
        "required_params": ["year", "month"],
    },
    {
        "template_id": "SPEND_SUMMARY_MONTHLY",
        "template_name": "法律支出汇总月报",
        "description": "按月汇总各业务线法律支出流水 (EXECUTED)",
        "required_params": ["year", "month"],
    },
    {
        "template_id": "LAWYER_FEE_SETTLEMENT",
        "template_name": "律师费结算汇总",
        "description": "按律所汇总年度/季度律师费支付情况",
        "required_params": ["year", "quarter"],
    },
]


class ReportTemplateItem(BaseModel):
    template_id: str
    template_name: str
    description: str
    required_params: list[str]


class ListReportTemplatesRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ListReportTemplatesResponse(BaseModel):
    templates: list[ReportTemplateItem]


class GenerateReportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    template_id: str = Field(..., max_length=64)
    parameters: dict[str, Any] = Field(default_factory=dict)
    format: str = Field("EXCEL", description="EXCEL (MVP 仅支持 EXCEL / CSV)")


class GenerateReportResponse(BaseModel):
    task_id: str
    status: str = Field(..., description="初始为 DRAFT, 后台异步生成中")


class ReportTaskStatusRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    task_id: str = Field(..., max_length=36)


class ReportTaskStatusResponse(BaseModel):
    task_id: str
    status: str = Field(..., description="DRAFT / PROCESSING / COMPLETED / FAILED / CANCELLED")
    progress: int | None = Field(None, ge=0, le=100, description="进度 0-100 (PROCESSING 时可选)")
    report_url: str | None = Field(None, description="COMPLETED 时的签名下载链接 (TTL=1h)")
    error_detail: str | None = Field(None, description="FAILED 时的错误摘要")
    generated_at: datetime | None = None


class ReportHistoryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    template_id: str | None = Field(None, max_length=64)
    time_range: TimeRange | None = None
    page: int = Field(1, ge=1)
    size: int = Field(20, ge=1, le=100)


class ReportHistoryItem(BaseModel):
    task_id: str
    template_id: str | None
    template_name: str
    status: str
    generated_at: datetime | None
    generated_by: str | None
    generated_by_name: str | None
    report_url: str | None = None


class ReportHistoryResponse(BaseModel):
    total: int
    page: int
    size: int
    items: list[ReportHistoryItem]
