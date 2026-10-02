"""案件详情 - 合规 Tab Pydantic Schema (切片 2.S8).

字段严格对齐 docs/design/v1/api/02_case_center/09_case_detail_compliance_api_plan.md v1.0
+ docs/design/v1/db/12_compliance_materials.md
+ docs/design/v1/db/25_alerts_and_governance.md.

4 BFF 端点:
    1. /cases/compliance/checklist        — 返回清单 (template + 已提交合并) (读)
    2. /cases/compliance/checklist/submit — 勾选结果 (写, 深度合并 extended_data.regulatory)
    3. /cases/compliance/disclosures      — 轻实现信披判定 + 历史披露 (读)
    4. /cases/compliance/attributes       — regulatory 字段汇总 (读)

Enum 字段 (ChecklistStatus / DisclosureStatus) 由 app.modules.cases.enums.case_enums 提供.

权限 (D5=A):
    - 读 (list/disclosures/attributes) → 案件成员 (含 EXTERNAL_COUNSEL)
    - 写 (checklist/submit) → `can_edit_base_info`
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.modules.cases.enums.case_enums import ChecklistStatus, DisclosureStatus, Sector


# =============================================================================
# 1. Checklist 核心 VO
# =============================================================================


class ChecklistItemVO(BaseModel):
    """检查清单单项 (template + 提交状态合并视图).

    template 字段来自 Service 层 CHECKLIST_TEMPLATES 硬编码 (D1=A);
    submitted 相关字段从 cases.extended_data.regulatory.checklist_items[] 读取并按 item_id 合并.
    """

    # Template 字段 (硬编码)
    item_id: str = Field(description="稳定 ID (如 ITEM_ANTI_MONOPOLY); 前端按此 key 提交")
    title: str = Field(description="检查项名称")
    description: str | None = Field(None, description="检查要点说明")
    required: bool = Field(True, description="是否必填 (required=True 全勾才能 COMPLETED)")
    category: str | None = Field(None, description="分组 (COMMON / MAJOR / INVESTOR / LISTED)")

    # 提交字段 (若已勾选)
    submitted: bool = False
    is_compliant: bool | None = None
    notes: str | None = None
    attachment_ids: list[str] = Field(default_factory=list)
    submitted_by: str | None = None
    submitted_by_name: str | None = None
    submitted_at: datetime | None = None


class ChecklistRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    case_id: str = Field(..., max_length=36)


class ChecklistResponse(BaseModel):
    case_id: str
    status: ChecklistStatus
    status_name: str | None = None
    total_items: int = 0
    completed_items: int = 0
    required_items: int = 0
    items: list[ChecklistItemVO] = Field(default_factory=list)


# =============================================================================
# 2. Checklist Submit (D2=A 深度合并)
# =============================================================================


class ChecklistSubmitItem(BaseModel):
    """前端提交的单项勾选数据."""

    model_config = ConfigDict(extra="forbid")
    item_id: str = Field(..., min_length=1, max_length=64)
    is_compliant: bool = Field(description="True=合规, False=不合规")
    notes: str | None = Field(None, max_length=2000)
    attachment_ids: list[str] = Field(
        default_factory=list,
        description="case_documents.id 列表; Service 层校验属本案",
    )


class ChecklistSubmitRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    case_id: str = Field(..., max_length=36)
    items: list[ChecklistSubmitItem] = Field(..., min_length=1)


class ChecklistSubmitResponse(BaseModel):
    case_id: str
    status: ChecklistStatus
    status_name: str | None = None
    updated_item_count: int
    warnings: list[str] = Field(default_factory=list)


# =============================================================================
# 3. Disclosures (D3=A 轻实现)
# =============================================================================


class DisclosureRuleHit(BaseModel):
    rule_id: str = Field(description="规则 ID (RULE_MAJOR / RULE_LISTED_BOARD / RULE_AMOUNT_THRESHOLD)")
    name: str = Field(description="规则名称")
    hit: bool


class HistoricalDisclosureVO(BaseModel):
    """历史披露记录 (来自 compliance_materials, material_type 为披露相关)."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    material_type: str
    disclosure_status: DisclosureStatus
    disclosure_status_name: str | None = None
    disclosure_date: date | None = None
    reporting_period: str | None = None
    attachment_ids: list[str] = Field(default_factory=list)
    created_at: datetime | None = None


class DisclosuresRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    case_id: str = Field(..., max_length=36)


class DisclosuresResponse(BaseModel):
    case_id: str
    disclosure_triggered: bool = Field(description="三规则全部命中 → True")
    disclosure_reason: str | None = Field(None, description="命中时的文字说明, 含法规引用")
    trigger_rules_checked: list[DisclosureRuleHit] = Field(default_factory=list)
    historical_disclosures: list[HistoricalDisclosureVO] = Field(default_factory=list)


# =============================================================================
# 4. Attributes (regulatory 汇总)
# =============================================================================


class RegulatorySubKeyVO(BaseModel):
    """cases.extended_data.regulatory 子键聚合视图.

    - S2-PRE 原 4 字段: reg_case_code / reg_cause_name / security_code / security_name
    - 2.S8 新增 4 字段: checklist_status / disclosure_triggered / disclosure_reason + 内部 items 计数
    """

    # S2-PRE 原字段
    reg_case_code: str | None = None
    reg_cause_name: str | None = None
    security_code: str | None = None
    security_name: str | None = None

    # 2.S8 新增字段
    checklist_status: ChecklistStatus | None = None
    checklist_status_name: str | None = None
    checklist_total: int = Field(0, description="template 应填总数 (按 case 属性动态)")
    checklist_completed: int = Field(0, description="已勾选必填项数")
    disclosure_triggered: bool | None = None
    disclosure_reason: str | None = None


class AttributesRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    case_id: str = Field(..., max_length=36)


class AttributesResponse(BaseModel):
    case_id: str
    # cases 主表关键字段
    is_investor_protection: bool
    is_major: bool
    sector: Sector | None = None
    sector_name: str | None = None
    target_amount: Decimal | None = None
    provision_amount: Decimal | None = None

    # extended_data.regulatory 子键
    regulatory: RegulatorySubKeyVO

    # 关联计数 (供 Tab 角标)
    related_alerts_count: int = 0
    related_materials_count: int = 0
