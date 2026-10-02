"""Compliance Alerts Model.

字段与 docs/design/v1/db/25_alerts_and_governance.md 对齐.
alert_level / status 枚举通过 @validates 校验 (2.S8-PRE, 2026-04-20).
"""
from sqlalchemy import Column, DateTime, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import validates

from app.modules.cases.core.database import Base
from app.modules.cases.enums.case_enums import AlertLevel, ComplianceAlertStatus

from .base import TenantMixin


class ComplianceAlert(TenantMixin, Base):
    __tablename__ = "compliance_alerts"

    case_id = Column(String(36), nullable=False)
    rule_id = Column(String(36), nullable=False)
    alert_level = Column(String(16), default="MEDIUM", nullable=True)  # Enum: AlertLevel
    alert_message = Column(Text, nullable=False)
    trigger_data = Column(JSONB, nullable=True)
    status = Column(String(32), default="PENDING", nullable=True)  # Enum: ComplianceAlertStatus
    handled_by = Column(String(36), nullable=True)
    handled_at = Column(DateTime(timezone=True), nullable=True)
    handling_note = Column(Text, nullable=True)
    reporting_task_id = Column(String(36), nullable=True)

    # ---- Enum 校验 (2.S8-PRE) ----

    @validates("alert_level")
    def _validate_alert_level(self, _key: str, value):
        if value is None:
            return value
        allowed = {e.value for e in AlertLevel}
        if value not in allowed:
            raise ValueError(
                f"alert_level={value!r} not in AlertLevel enum. allowed={sorted(allowed)}"
            )
        return value

    @validates("status")
    def _validate_status(self, _key: str, value):
        if value is None:
            return value
        allowed = {e.value for e in ComplianceAlertStatus}
        if value not in allowed:
            raise ValueError(
                f"status={value!r} not in ComplianceAlertStatus enum. allowed={sorted(allowed)}"
            )
        return value
