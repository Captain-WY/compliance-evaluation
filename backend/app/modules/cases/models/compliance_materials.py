"""Compliance Materials Model.

字段与 docs/design/v1/db/12_compliance_materials.md 对齐.
disclosure_status / approval_status 枚举通过 @validates 校验
(2.S8-PRE, 2026-04-20).
"""
from sqlalchemy import Boolean, Column, Date, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import validates

from app.modules.cases.core.database import Base
from app.modules.cases.enums.case_enums import ComplianceMaterialStatus, DisclosureStatus

from .base import TenantMixin


class ComplianceMaterial(TenantMixin, Base):
    __tablename__ = "compliance_materials"

    case_id = Column(String(36), nullable=False)
    material_type = Column(String(64), nullable=False)
    reporting_period = Column(String(32), nullable=True)
    target_audience = Column(String(128), nullable=True)
    reg_cause_code = Column(String(64), nullable=True)
    involved_security_code = Column(String(64), nullable=True)
    involved_security_name = Column(String(128), nullable=True)
    board_sector = Column(String(64), nullable=True)
    is_ipf_involved = Column(Boolean, default=False, nullable=True)
    amount_without_interest = Column(Numeric(15, 2), nullable=True)
    amount_with_interest = Column(Numeric(15, 2), nullable=True)
    materiality_threshold_met = Column(Boolean, nullable=True)
    disclosure_status = Column(String(32), default="NOT_REQUIRED", nullable=True)  # Enum: DisclosureStatus
    disclosure_date = Column(Date, nullable=True)
    content_draft = Column(Text, nullable=True)
    content_final = Column(Text, nullable=True)
    approval_status = Column(String(32), default="DRAFT", nullable=True)  # Enum: ComplianceMaterialStatus
    approved_by = Column(String(36), nullable=True)
    attachment_ids = Column(JSONB, nullable=True)

    # ---- Enum 校验 (2.S8-PRE) ----

    @validates("disclosure_status")
    def _validate_disclosure_status(self, _key: str, value):
        if value is None:
            return value
        allowed = {e.value for e in DisclosureStatus}
        if value not in allowed:
            raise ValueError(
                f"disclosure_status={value!r} not in DisclosureStatus enum. allowed={sorted(allowed)}"
            )
        return value

    @validates("approval_status")
    def _validate_approval_status(self, _key: str, value):
        if value is None:
            return value
        allowed = {e.value for e in ComplianceMaterialStatus}
        if value not in allowed:
            raise ValueError(
                f"approval_status={value!r} not in ComplianceMaterialStatus enum. allowed={sorted(allowed)}"
            )
        return value
