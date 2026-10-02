"""案件详情 - 结案归档 Pydantic Schema (切片 2.S9).

字段严格对齐 docs/design/v1/api/02_case_center/10_case_detail_closing_api_plan.md v2.0
+ docs/design/v1/db/17_case_strategies_and_closures.md.

6 BFF 端点:
    1. /cases/closing/info                            — 读
    2. /cases/closing/submit                          — 写, case_status → CLOSED + case_closures
    3. /cases/archiving/validate                      — 读, 6 规则聚合 (S5/S6/S7/S8 + S9×2)
    4. /cases/archiving/submit                        — 写, case_status → ARCHIVED (全局只读锁)
    5. /cases/execution/zhongben/register             — 写, extended_data.zhongben_plan
    6. /cases/execution/zhongben/reminders/setup      — 写, reminders[] 追加

权限 (D7):
    - 读 (info/validate): 案件成员
    - closing/submit / zhongben/*: `can_close_case` 或 `can_edit_base_info`
    - archiving/submit: `can_close_case` + LEGAL_ADMIN/SYS_ADMIN 双校验
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.modules.cases.enums.case_enums import CaseStatus, ClosureStatus, ClosureType, CurrencyCode


# =============================================================================
# 1. /closing/info
# =============================================================================


class ClosureVO(BaseModel):
    """case_closures 视图对象."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    case_id: str
    closure_date: date
    closure_type: ClosureType
    closure_type_name: str | None = None
    status: ClosureStatus
    status_name: str | None = None
    review_summary: str
    improvement_plan: str | None = None
    checklist_data: dict[str, Any] | None = None
    approved_by: str | None = None
    approved_by_name: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ClosingInfoRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    case_id: str = Field(..., max_length=36)


class ClosingInfoResponse(BaseModel):
    case_id: str
    registered: bool = Field(description="是否已有 case_closures 记录")
    closure: ClosureVO | None = None
    case_status: CaseStatus
    case_status_name: str | None = None
    close_date: date | None = None


# =============================================================================
# 2. /closing/submit
# =============================================================================


class ClosingSubmitRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    case_id: str = Field(..., max_length=36)
    closure_date: date
    closure_type: ClosureType
    review_summary: str = Field(..., min_length=1, max_length=5000)
    improvement_plan: str | None = Field(None, max_length=5000)
    checklist_data: dict[str, Any] = Field(
        default_factory=lambda: {
            "all_fees_paid": False,
            "preservations_released": False,
            "documents_archived": False,
        },
        description="结案自查 checklist (法务自填)",
    )
    status: ClosureStatus = ClosureStatus.DRAFT


class ClosingSubmitResponse(BaseModel):
    case_id: str
    closure_id: str
    case_status: CaseStatus
    case_status_name: str | None = None
    closure_status: ClosureStatus
    closure_status_name: str | None = None
    warnings: list[str] = Field(default_factory=list)


# =============================================================================
# 3. /archiving/validate
# =============================================================================


class CheckItemVO(BaseModel):
    """归档校验规则单项."""

    rule_id: str
    name: str
    source: str = Field(description="S5/S6/S7/S8/S9 本切片")
    passed: bool
    message: str
    details: dict[str, Any] | None = None


class ArchivingValidateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    case_id: str = Field(..., max_length=36)


class ArchivingValidateResponse(BaseModel):
    case_id: str
    can_archive: bool = Field(description="6 规则全 passed → True")
    passed_count: int
    total_count: int
    checks: list[CheckItemVO] = Field(default_factory=list)


# =============================================================================
# 4. /archiving/submit (触发全局只读锁)
# =============================================================================


class ArchivingSubmitRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    case_id: str = Field(..., max_length=36)
    archive_no: str = Field(..., min_length=1, max_length=64, description="归档号 (租户内唯一)")
    archive_note: str | None = Field(None, max_length=1000)


class ArchivingSubmitResponse(BaseModel):
    case_id: str
    case_status: CaseStatus = CaseStatus.ARCHIVED
    case_status_name: str | None = None
    archive_no: str
    archive_date: date
    warnings: list[str] = Field(default_factory=list)


# =============================================================================
# 5. /execution/zhongben/register
# =============================================================================


class ZhongBenReminderVO(BaseModel):
    """终本周期提醒单条."""

    reminder_id: str
    interval_months: int = Field(..., ge=1, le=120)
    assignee_id: str
    assignee_name: str | None = None
    created_at: str | None = None
    next_trigger_date: date | None = None
    last_sent_at: str | None = None
    note: str | None = None


class ZhongBenPlanVO(BaseModel):
    """cases.extended_data.zhongben_plan 子键视图."""

    registered: bool = False
    register_date: date | None = None
    non_executed_amount: Decimal | None = None
    currency: CurrencyCode | None = None
    currency_name: str | None = None
    attachment_ids: list[str] = Field(default_factory=list)
    ruling_no: str | None = None
    reason: str | None = None
    registered_by: str | None = None
    registered_at: str | None = None
    reminders: list[ZhongBenReminderVO] = Field(default_factory=list)


class ZhongBenRegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    case_id: str = Field(..., max_length=36)
    register_date: date
    non_executed_amount: Decimal = Field(..., ge=Decimal(0))
    currency: CurrencyCode = CurrencyCode.CNY
    attachment_ids: list[str] = Field(
        default_factory=list, description="裁定书附件 (case_documents.id)"
    )
    ruling_no: str | None = Field(None, max_length=128)
    reason: str | None = Field(None, max_length=2000)


class ZhongBenRegisterResponse(BaseModel):
    case_id: str
    zhongben_plan: ZhongBenPlanVO
    warnings: list[str] = Field(default_factory=list)


# =============================================================================
# 6. /execution/zhongben/reminders/setup
# =============================================================================


class ReminderSetupRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    case_id: str = Field(..., max_length=36)
    interval_months: int = Field(..., ge=1, le=120, description="复查周期 (1-120 月)")
    assignee_id: str = Field(..., max_length=36, description="复查责任人 sys_users.id")
    note: str | None = Field(None, max_length=500)


class ReminderSetupResponse(BaseModel):
    case_id: str
    reminder_id: str
    next_trigger_date: date
    warnings: list[str] = Field(default_factory=list)
