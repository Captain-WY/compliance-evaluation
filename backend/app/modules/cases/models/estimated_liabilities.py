"""Estimated Liabilities Model.

字段与 docs/design/v1/db/09_estimated_liabilities.md 对齐.
action_type / risk_probability / approval_status / currency 枚举通过 @validates 校验
(2.S6-PRE, 2026-04-20).
"""
from sqlalchemy import Column, String, Numeric, Date, Text, DateTime
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import validates

from app.modules.cases.core.database import Base
from app.modules.cases.enums.case_enums import (
    CurrencyCode,
    LiabilityActionType,
    LiabilityApprovalStatus,
    RiskProbability,
)

from .base import TenantMixin


class EstimatedLiability(TenantMixin, Base):
    __tablename__ = "estimated_liabilities"

    case_id = Column(String(36), nullable=False)
    process_node_id = Column(String(36), nullable=True)
    action_type = Column(String(32), nullable=False)                 # Enum: LiabilityActionType
    previous_amount = Column(Numeric(15, 2), default=0, nullable=True)
    adjustment_amount = Column(Numeric(15, 2), nullable=False)
    current_amount = Column(Numeric(15, 2), nullable=False)
    currency = Column(String(16), default="CNY", nullable=True)      # Enum: CurrencyCode (可空)
    assessment_date = Column(Date, nullable=False)
    risk_probability = Column(String(32), nullable=False)            # Enum: RiskProbability
    basis_of_estimate = Column(Text, nullable=False)
    attachment_ids = Column(JSONB, nullable=True)
    approval_status = Column(String(32), default="PENDING", nullable=True)  # Enum: LiabilityApprovalStatus
    approved_by = Column(String(36), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    finance_voucher_no = Column(String(64), nullable=True)

    # ---- Enum 校验 (2.S6-PRE) ----

    @validates("action_type")
    def _validate_action_type(self, _key: str, value: str) -> str:
        allowed = {e.value for e in LiabilityActionType}
        if value not in allowed:
            raise ValueError(
                f"action_type={value!r} not in LiabilityActionType enum. allowed={sorted(allowed)}"
            )
        return value

    @validates("risk_probability")
    def _validate_risk_probability(self, _key: str, value: str) -> str:
        allowed = {e.value for e in RiskProbability}
        if value not in allowed:
            raise ValueError(
                f"risk_probability={value!r} not in RiskProbability enum. allowed={sorted(allowed)}"
            )
        return value

    @validates("approval_status")
    def _validate_approval_status(self, _key: str, value):
        if value is None:
            return value
        allowed = {e.value for e in LiabilityApprovalStatus}
        if value not in allowed:
            raise ValueError(
                f"approval_status={value!r} not in LiabilityApprovalStatus enum. allowed={sorted(allowed)}"
            )
        return value

    @validates("currency")
    def _validate_currency(self, _key: str, value):
        if value is None:
            return value
        allowed = {e.value for e in CurrencyCode}
        if value not in allowed:
            raise ValueError(
                f"currency={value!r} not in CurrencyCode enum. allowed={sorted(allowed)}"
            )
        return value
