"""案件详情 - 外聘律师 Tab Pydantic Schema (切片 2.S7).

字段严格对齐 docs/design/v1/db/16_case_counsels_and_contracts.md
+ docs/design/v1/db/31_external_counsels_and_templates.md
+ docs/design/v1/api/02_case_center/08_case_detail_counsels_api_plan.md.

5 BFF 端点:
    1. /cases/counsels/list             — INTERNAL + EXTERNAL 合并视图 (读)
    2. /cases/counsels/internal/assign  — 指派内部律师 (写, 快照 sys_users)
    3. /cases/counsels/external/assign  — 指派外部律师 (写, 快照 law_firm + external_lawyer + 黑名单拦截)
    4. /cases/counsels/unassign         — status=TERMINATED (写, 可选打分, 幂等拒重复)
    5. /cases/contracts/attach          — 一体式创建合同 (写, contract + attachment_ids + 可选 bind_counsel)

Enum 字段 (CounselType / CounselRoleInCase / CounselStatus / ContractStatus / CurrencyCode)
由 app.modules.cases.enums.case_enums 提供.

权限 (D4=A `can_manage_members`):
    - 读 (list) 开放给所有案件成员 (含 EXTERNAL_COUNSEL 自查)
    - 写 (assign/unassign/attach) 需 can_manage_members (OWNER/LEGAL_ADMIN/SYS_ADMIN 默认)
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.modules.cases.enums.case_enums import (
    ContractStatus,
    CounselRoleInCase,
    CounselStatus,
    CounselType,
    CurrencyCode,
)


# =============================================================================
# 1. 通用 VO: CounselVO (INTERNAL + EXTERNAL 统一视图)
# =============================================================================


class CounselVO(BaseModel):
    """代理律师视图对象.

    统一 INTERNAL (内部法务, lawyer_id=sys_users.id) 和 EXTERNAL (外部律师,
    lawyer_id=external_lawyers.id) 两种来源; 前端按 counsel_type 区分 UI 展示.
    与 2.S2.b 的 ExternalCounselVO 不同 — 后者是 sidebar 专用 (含 source 字段
    合并 case_members.EXTERNAL_COUNSEL), 本 VO 仅从 case_counsels 表读取.
    """

    model_config = ConfigDict(from_attributes=True)

    id: str
    case_id: str
    counsel_type: CounselType
    counsel_type_name: str | None = None
    lawyer_id: str = Field(description="INTERNAL→sys_users.id / EXTERNAL→external_lawyers.id (D2 双源)")
    lawyer_name: str = Field(description="快照字段, 防止主数据变更导致历史失真")
    law_firm_id: str | None = None
    law_firm_name: str | None = Field(None, description="快照, INTERNAL 律师为 None")
    role_in_case: CounselRoleInCase | None = None
    role_in_case_name: str | None = None
    contract_id: str | None = None
    contact_phone: str | None = None
    contact_email: str | None = None
    status: CounselStatus
    status_name: str | None = None
    performance_rating: int | None = Field(None, ge=1, le=5)
    evaluation_comment: str | None = None
    created_at: datetime | None = None


# =============================================================================
# 2. /counsels/list — 合并视图
# =============================================================================


class CounselsListRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    case_id: str = Field(..., max_length=36)
    status_filter: list[CounselStatus] | None = Field(
        None,
        description="状态过滤, 缺省 = 全部非软删",
    )


class CounselsListResponse(BaseModel):
    case_id: str
    total: int
    internal_counsels: list[CounselVO] = Field(default_factory=list)
    external_counsels: list[CounselVO] = Field(default_factory=list)


# =============================================================================
# 3. /counsels/internal/assign
# =============================================================================


class CounselInternalAssignRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    case_id: str = Field(..., max_length=36)
    user_id: str = Field(..., max_length=36, description="sys_users.id (D2 INTERNAL 指向)")
    role_in_case: CounselRoleInCase = CounselRoleInCase.LEAD
    contact_phone: str | None = Field(None, max_length=32)
    contact_email: str | None = Field(None, max_length=128)


class CounselInternalAssignResponse(BaseModel):
    counsel: CounselVO
    warnings: list[str] = Field(default_factory=list)


# =============================================================================
# 4. /counsels/external/assign
# =============================================================================


class CounselExternalAssignRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    case_id: str = Field(..., max_length=36)
    external_lawyer_id: str = Field(..., max_length=36, description="external_lawyers.id (D2 EXTERNAL 指向)")
    role_in_case: CounselRoleInCase = CounselRoleInCase.LEAD
    contract_id: str | None = Field(None, max_length=36, description="可选, case_contracts.id")
    contact_phone: str | None = Field(None, max_length=32)
    contact_email: str | None = Field(None, max_length=128)


class CounselExternalAssignResponse(BaseModel):
    counsel: CounselVO
    warnings: list[str] = Field(default_factory=list)


# =============================================================================
# 5. /counsels/unassign
# =============================================================================


class CounselUnassignRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    counsel_id: str = Field(..., max_length=36)
    reason: str | None = Field(None, max_length=500)
    performance_rating: int | None = Field(None, ge=1, le=5, description="可选结案评分 (1-5 星)")
    evaluation_comment: str | None = Field(None, max_length=1000)


class CounselUnassignResponse(BaseModel):
    counsel_id: str
    status: CounselStatus = CounselStatus.TERMINATED
    status_name: str | None = None
    warnings: list[str] = Field(default_factory=list)


# =============================================================================
# 6. /contracts/attach (D3=C 一体式)
# =============================================================================


class ContractVO(BaseModel):
    """合同视图对象 (case_contracts 表映射)."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    case_id: str
    contract_no: str | None = None
    contract_name: str
    law_firm_id: str
    law_firm_name: str | None = Field(None, description="Service 层 join 填充 (law_firms.firm_name)")
    sign_date: date | None = None
    fee_type: str = Field(description="FIXED / HOURLY / CONTINGENCY / MIXED (D7 Enum 延后)")
    currency: CurrencyCode
    currency_name: str | None = None
    total_amount: Decimal | None = None
    contingency_rate: Decimal | None = None
    payment_terms: str | None = None
    status: ContractStatus
    status_name: str | None = None
    attachment_ids: list[str] = Field(
        default_factory=list,
        description="case_documents.id 列表 (D1=A)",
    )
    created_at: datetime | None = None


FeeTypeLiteral = Literal["FIXED", "HOURLY", "CONTINGENCY", "MIXED"]


class ContractAttachRequest(BaseModel):
    """D3=C 一体式: 创建合同 + attachment_ids + 可选 bind_counsel_id."""

    model_config = ConfigDict(extra="forbid")

    case_id: str = Field(..., max_length=36)
    contract_no: str | None = Field(None, max_length=64)
    contract_name: str = Field(..., min_length=1, max_length=255)
    law_firm_id: str = Field(..., max_length=36)
    sign_date: date | None = None
    fee_type: FeeTypeLiteral = Field(
        ...,
        description="FIXED 固定 / HOURLY 计时 / CONTINGENCY 风险代理 / MIXED 混合",
    )
    currency: CurrencyCode = CurrencyCode.CNY
    total_amount: Decimal | None = Field(None, ge=Decimal(0))
    contingency_rate: Decimal | None = Field(None, ge=Decimal(0), le=Decimal(1))
    payment_terms: str | None = Field(None, max_length=2000)
    status: ContractStatus = ContractStatus.SIGNED
    attachment_ids: list[str] = Field(
        default_factory=list,
        description="case_documents.id 列表; Service 层校验 doc 属本案 (D1=A)",
    )
    bind_counsel_id: str | None = Field(
        None,
        max_length=36,
        description="可选, 同步更新 case_counsels[counsel_id].contract_id = new_contract.id",
    )


class ContractAttachResponse(BaseModel):
    contract: ContractVO
    bound_counsel_id: str | None = Field(
        None,
        description="若 bind_counsel_id 传入且更新成功, 回显该 counsel_id",
    )
    warnings: list[str] = Field(default_factory=list)
