"""资产保全台账 Pydantic Schema (切片 2.S12).

对齐 docs/design/v1/api/04_asset_preservation/00_asset_preservation_api_plan.md v1.1.

7 个端点:
    1. POST /assets/preservations/list         — 列表查询
    2. POST /assets/preservations/detail       — 单条详情
    3. POST /assets/preservations/create       — 新建保全
    4. POST /assets/preservations/extend       — 续期 (D1=A: 就地更新)
    5. POST /assets/preservations/release      — 解除 (D3=A: 非强制文书)
    6. POST /assets/preservations/realize      — 变现 (D4=B: 强制写 financial_transactions)
    7. POST /assets/preservations/expiry-alerts — 到期预警看板 (D5=A: 单端点)

权限: D6 案件成员级 (OWNER/CO_COUNSEL 写, 成员读, 管理层全租户)
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator


# ---------------------------------------------------------------------------
# 通用结构
# ---------------------------------------------------------------------------

class PaginationRequest(BaseModel):
    page: int = Field(default=1, ge=1)
    size: int = Field(default=20, ge=1, le=100)


class PaginationMeta(BaseModel):
    total: int
    page: int
    size: int


class ExtendHistoryEntry(BaseModel):
    extended_at: datetime
    previous_expire_date: date
    new_expire_date: date
    operator_id: str
    reason: str | None = None


# ---------------------------------------------------------------------------
# 1. POST /preservations/list
# ---------------------------------------------------------------------------

class ListPreservationsRequest(BaseModel):
    case_id: str | None = None
    status_filter: list[str] | None = None
    asset_type: str | None = None
    expiring_within_days: int | None = Field(default=None, ge=0, le=3650)
    pagination: PaginationRequest = Field(default_factory=PaginationRequest)


class PreservationListItem(BaseModel):
    id: str
    case_id: str
    internal_case_no: str | None = None
    case_name: str | None = None
    asset_type: str
    asset_type_name: str
    asset_name: str
    preservation_type: str
    preservation_type_name: str
    status: str
    effective_status: str
    effective_status_name: str
    start_date: date
    expire_date: date
    days_until_expiry: int
    estimated_value: Decimal | None = None
    currency: str
    execution_court: str | None = None
    is_expiring_soon: bool
    owner_party_id: str
    owner_party_name: str | None = None


class ListSummary(BaseModel):
    total_estimated_value: Decimal | None = None
    active_count: int
    expiring_30d_count: int
    expired_count: int
    released_count: int
    realized_count: int


class ListPreservationsResponse(BaseModel):
    total: int
    page: int
    size: int
    items: list[PreservationListItem]
    summary: ListSummary


# ---------------------------------------------------------------------------
# 2. POST /preservations/detail
# ---------------------------------------------------------------------------

class DetailPreservationRequest(BaseModel):
    preservation_id: str


class PreservationDetailVO(PreservationListItem):
    asset_identifiers: dict[str, Any] | None = None
    realized_value: Decimal | None = None
    ruling_document_id: str | None = None
    description: str | None = None
    extend_history: list[ExtendHistoryEntry] = Field(default_factory=list)
    created_at: datetime | None = None
    created_by: str | None = None
    updated_at: datetime | None = None


class DetailPreservationResponse(BaseModel):
    data: PreservationDetailVO


# ---------------------------------------------------------------------------
# 3. POST /preservations/create
# ---------------------------------------------------------------------------

class CreatePreservationRequest(BaseModel):
    case_id: str
    owner_party_id: str
    asset_type: str
    asset_name: str = Field(min_length=1, max_length=255)
    asset_identifiers: dict[str, Any] | None = None
    preservation_type: str
    start_date: date
    expire_date: date
    estimated_value: Decimal | None = Field(default=None, ge=0)
    currency: str = "CNY"
    execution_court: str | None = Field(default=None, max_length=128)
    ruling_document_id: str | None = None
    description: str | None = None
    process_node_id: str | None = None

    @model_validator(mode="after")
    def expire_after_start(self) -> "CreatePreservationRequest":
        if self.expire_date <= self.start_date:
            raise ValueError("expire_date 必须晚于 start_date")
        return self


class CreatePreservationResponse(BaseModel):
    preservation_id: str
    case_id: str
    status: str
    effective_status: str
    created_at: datetime


# ---------------------------------------------------------------------------
# 4. POST /preservations/extend
# ---------------------------------------------------------------------------

class ExtendPreservationRequest(BaseModel):
    preservation_id: str
    new_expire_date: date
    reason: str | None = Field(default=None, max_length=500)


class ExtendPreservationResponse(BaseModel):
    preservation_id: str
    previous_expire_date: date
    new_expire_date: date
    effective_status: str
    updated_at: datetime


# ---------------------------------------------------------------------------
# 5. POST /preservations/release
# ---------------------------------------------------------------------------

class ReleasePreservationRequest(BaseModel):
    preservation_id: str
    release_date: date
    release_reason: str | None = Field(default=None, max_length=500)
    ruling_document_id: str | None = None


class ReleasePreservationResponse(BaseModel):
    preservation_id: str
    status: str
    effective_status: str
    released_at: date
    updated_at: datetime


# ---------------------------------------------------------------------------
# 6. POST /preservations/realize
# ---------------------------------------------------------------------------

class RealizePreservationRequest(BaseModel):
    preservation_id: str
    realized_value: Decimal = Field(gt=0)
    realize_date: date
    remarks: str | None = Field(default=None, max_length=500)


class RealizePreservationResponse(BaseModel):
    preservation_id: str
    status: str
    effective_status: str
    estimated_value: Decimal | None = None
    realized_value: Decimal
    recovery_rate: float | None = None
    recovery_transaction_id: str
    updated_at: datetime


# ---------------------------------------------------------------------------
# 7. POST /preservations/expiry-alerts
# ---------------------------------------------------------------------------

class ExpiryAlertsRequest(BaseModel):
    days_threshold: int = Field(default=30, ge=0, le=365)
    case_id: str | None = None
    pagination: PaginationRequest = Field(default_factory=PaginationRequest)


class AlertSummary(BaseModel):
    overdue_count: int
    expiring_7d_count: int
    expiring_30d_count: int
    total_at_risk_value: Decimal | None = None
    currency: str = "CNY"


class ExpiryAlertItem(BaseModel):
    id: str
    case_id: str
    internal_case_no: str | None = None
    case_name: str | None = None
    asset_type: str
    asset_type_name: str
    asset_name: str
    preservation_type: str
    preservation_type_name: str
    effective_status: str
    effective_status_name: str
    expire_date: date
    days_until_expiry: int
    estimated_value: Decimal | None = None
    currency: str
    is_overdue: bool
    alert_level: str


class ExpiryAlertsResponse(BaseModel):
    summary: AlertSummary
    total: int
    page: int
    size: int
    items: list[ExpiryAlertItem]
