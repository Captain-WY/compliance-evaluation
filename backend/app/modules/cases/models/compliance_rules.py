from sqlalchemy import Column, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import validates
from app.modules.cases.core.database import Base
from app.modules.cases.enums.case_enums import RuleActionType, RuleStatus, RuleType
from .base import TenantMixin


class ComplianceRule(TenantMixin, Base):
    __tablename__ = "compliance_rules"

    rule_code = Column(String(64), nullable=False)
    rule_name = Column(String(128), nullable=False)
    description = Column(Text, nullable=True)
    rule_type = Column(String(32), nullable=False)
    rule_logic = Column(JSONB, nullable=True)
    action_type = Column(String(32), nullable=False)
    action_config = Column(JSONB, nullable=True)
    status = Column(String(32), default="ACTIVE", nullable=True)

    @validates("rule_type")
    def validate_rule_type(self, _key: str, value) -> str:
        if value is None:
            return value
        allowed = {e.value for e in RuleType}
        if value not in allowed:
            raise ValueError(f"rule_type={value!r} not in RuleType enum. allowed={sorted(allowed)}")
        return value

    @validates("action_type")
    def validate_action_type(self, _key: str, value) -> str:
        if value is None:
            return value
        allowed = {e.value for e in RuleActionType}
        if value not in allowed:
            raise ValueError(f"action_type={value!r} not in RuleActionType enum. allowed={sorted(allowed)}")
        return value

    @validates("status")
    def validate_status(self, _key: str, value) -> str:
        if value is None:
            return value
        allowed = {e.value for e in RuleStatus}
        if value not in allowed:
            raise ValueError(f"status={value!r} not in RuleStatus enum. allowed={sorted(allowed)}")
        return value
