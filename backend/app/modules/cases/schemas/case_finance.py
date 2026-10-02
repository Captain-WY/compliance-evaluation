"""案件详情 - 财务 Tab Pydantic Schema (切片 2.S6).

字段严格对齐 docs/design/v1/db/{08_financial_transactions, 09_estimated_liabilities,
20_case_budgets, 21_business_line_budgets, 22_financial_snapshots}.md 与
docs/design/v1/api/02_case_center/05_case_detail_finance_api_plan.md.

6 BFF 端点:
    1. /cases/finance/snapshot          — 案件财务快照 (读)
    2. /cases/finance/update            — 更新财务基础数据 (写)
    3. /cases/finance/provisions/add    — 新增计提 (写, PROVISION/ADJUSTMENT/REVERSAL)
    4. /cases/finance/provisions/history — 计提流水 (读)
    5. /cases/finance/spend/record      — 费用登记 (写, 悲观锁 D1=A)
    6. /cases/finance/spend/list        — 本案件费用明细 (读)

Enum 字段 (FundDirection / TransactionStatus / LiabilityActionType / RiskProbability /
LiabilityApprovalStatus / CurrencyCode) 由 app.modules.cases.enums.case_enums 提供.

权限 (D4'-1):
    - 读端点 → can_view_finance
    - 写端点 → can_edit_base_info (+ 隐式 can_view_finance)
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.modules.cases.enums.case_enums import (
    CurrencyCode,
    FundDirection,
    LiabilityActionType,
    LiabilityApprovalStatus,
    RiskProbability,
    TransactionStatus,
)


# =============================================================================
# 1. 分页公共
# =============================================================================


class FinancePagination(BaseModel):
    model_config = ConfigDict(extra="forbid")
    page: int = Field(1, ge=1)
    size: int = Field(50, ge=1, le=200)


# =============================================================================
# 2. /finance/snapshot — 案件财务快照
# =============================================================================


class ClaimsSnapshot(BaseModel):
    our_claim_amount: Decimal = Field(Decimal(0), description="本诉诉请总额")
    counter_claim_amount: Decimal = Field(Decimal(0), description="反诉诉请总额")
    currency: CurrencyCode = CurrencyCode.CNY


class JudgmentsSnapshot(BaseModel):
    first_instance_amount: Decimal | None = None
    second_instance_amount: Decimal | None = None
    final_amount: Decimal | None = None
    principal: Decimal | None = None
    interest: Decimal | None = None
    penalty: Decimal | None = None


class RecoveriesSnapshot(BaseModel):
    recovered_amount: Decimal = Field(Decimal(0))
    recovery_rate: float = Field(0.0, ge=0.0, le=1.0, description="recovered / final")


class ProvisionsSnapshot(BaseModel):
    current_amount: Decimal = Field(Decimal(0), description="最新一条 provision 的 current_amount")
    approval_status: LiabilityApprovalStatus | None = None
    approval_status_name: str | None = None
    last_provision_date: date | None = None


class LegalFeesSnapshot(BaseModel):
    budget_amount: Decimal = Field(Decimal(0), description="本案件预算 (case_budgets.total_budget)")
    paid_amount: Decimal = Field(Decimal(0), description="已支付 OUT/EXECUTED 合计")
    pending_amount: Decimal = Field(Decimal(0), description="OUT/PENDING+APPROVED 合计")
    currency: CurrencyCode = CurrencyCode.CNY
    currency_name: str = "人民币"


class FinanceSnapshotRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    case_id: str = Field(..., max_length=36)


class FinanceSnapshotResponse(BaseModel):
    case_id: str
    claims: ClaimsSnapshot
    judgments: JudgmentsSnapshot
    recoveries: RecoveriesSnapshot
    provisions: ProvisionsSnapshot
    legal_fees: LegalFeesSnapshot
    warnings: list[str] = Field(default_factory=list, description="状态警告 (D6=B)")


# =============================================================================
# 3. /finance/update — 更新财务基础数据
# =============================================================================


class FinanceUpdateFields(BaseModel):
    """案件级可更新的财务字段白名单 (PATCH 语义, 落到 cases 主表)."""

    model_config = ConfigDict(extra="forbid")

    target_amount: Decimal | None = Field(None, description="目标金额 / 一审主诉请")
    provision_amount: Decimal | None = Field(None, description="汇总预计负债金额 (冗余)")
    # 预留: 判决金额落 extended_data.judgment.*
    judgment_amount: Decimal | None = None
    judgment_principal: Decimal | None = None
    judgment_interest: Decimal | None = None
    judgment_penalty: Decimal | None = None
    judgment_date: date | None = None
    notes: str | None = Field(None, max_length=2000)


class FinanceUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    case_id: str = Field(..., max_length=36)
    fields: FinanceUpdateFields


class FinanceUpdateResponse(BaseModel):
    case_id: str
    updated_fields: list[str]
    warnings: list[str] = Field(default_factory=list)


# =============================================================================
# 4. /finance/provisions/add — 新增计提
# =============================================================================


class ProvisionAddRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    case_id: str = Field(..., max_length=36)
    action_type: LiabilityActionType
    adjustment_amount: Decimal = Field(
        ...,
        description="PROVISION/ADJUSTMENT 正负均可; REVERSAL 会被后端覆盖为 -previous_amount",
    )
    currency: CurrencyCode = CurrencyCode.CNY
    assessment_date: date
    risk_probability: RiskProbability
    basis_of_estimate: str = Field(..., min_length=1, max_length=2000)
    attachment_ids: list[str] = Field(default_factory=list)


class ProvisionVO(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    case_id: str
    action_type: LiabilityActionType
    action_type_name: str | None = None
    previous_amount: Decimal = Decimal(0)
    adjustment_amount: Decimal
    current_amount: Decimal
    currency: CurrencyCode
    currency_name: str | None = None
    assessment_date: date
    risk_probability: RiskProbability
    risk_probability_name: str | None = None
    basis_of_estimate: str
    attachment_ids: list[str] = Field(default_factory=list)
    approval_status: LiabilityApprovalStatus
    approval_status_name: str | None = None
    approved_by: str | None = None
    approved_by_name: str | None = Field(
        None,
        description="审批人姓名快照; 2.S6 主切片无审批流实现, 始终为 None; 留待 S18 统一审批引擎回填",
    )
    approved_at: datetime | None = None
    created_at: datetime | None = None


class ProvisionAddResponse(BaseModel):
    provision: ProvisionVO
    warnings: list[str] = Field(default_factory=list)


# =============================================================================
# 5. /finance/provisions/history — 流水查询
# =============================================================================


class ProvisionHistoryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    case_id: str = Field(..., max_length=36)
    pagination: FinancePagination | None = None


class ProvisionHistoryResponse(BaseModel):
    case_id: str
    total: int
    page: int
    size: int
    items: list[ProvisionVO] = Field(default_factory=list)


# =============================================================================
# 6. /finance/spend/record — 费用登记 (悲观锁 D1=A)
# =============================================================================


class SpendRecordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    case_id: str = Field(..., max_length=36)
    transaction_type: str = Field(
        ...,
        description="费用类型, 对齐字典 EXPENSE_TYPE (LAWYER_FEE / COURT_FEE / PRESERVATION_FEE ...)",
        min_length=1,
        max_length=64,
    )
    amount: Decimal = Field(..., gt=Decimal(0), description="支出金额, 必须 > 0")
    currency: CurrencyCode = CurrencyCode.CNY
    apply_date: date | None = None
    counterparty_name: str | None = Field(None, max_length=255)
    voucher_no: str | None = Field(None, max_length=64)
    description: str | None = Field(None, max_length=2000)
    process_node_id: str | None = Field(None, max_length=36)
    associated_party_id: str | None = Field(None, max_length=36)


class SpendTransactionVO(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    case_id: str
    transaction_type: str
    transaction_type_name: str | None = None
    fund_direction: FundDirection
    fund_direction_name: str | None = None
    amount: Decimal
    currency: CurrencyCode
    currency_name: str | None = None
    transaction_status: TransactionStatus
    transaction_status_name: str | None = None
    apply_date: date | None = None
    transaction_date: date | None = None
    counterparty_name: str | None = None
    voucher_no: str | None = None
    description: str | None = None
    process_node_id: str | None = None
    associated_party_id: str | None = None
    created_at: datetime | None = None


class SpendRecordResponse(BaseModel):
    transaction: SpendTransactionVO
    budget_used: Decimal = Field(Decimal(0), description="业务线已用 (含本次)")
    budget_remaining: Decimal = Field(Decimal(0), description="业务线剩余 (扣完本次后)")
    warnings: list[str] = Field(default_factory=list)


# =============================================================================
# 7. /finance/spend/list — 本案件费用明细
# =============================================================================


class SpendListRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    case_id: str = Field(..., max_length=36)
    transaction_type: str | None = None
    transaction_status: TransactionStatus | None = None
    pagination: FinancePagination | None = None


class SpendListResponse(BaseModel):
    case_id: str
    total: int
    page: int
    size: int
    items: list[SpendTransactionVO] = Field(default_factory=list)
    total_out_executed: Decimal = Field(Decimal(0), description="已支付合计")
    total_out_pending: Decimal = Field(Decimal(0), description="待付合计")
