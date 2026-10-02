from sqlalchemy import Column, String, Numeric, Text
from sqlalchemy.orm import validates

from app.modules.cases.core.database import Base
from app.modules.cases.enums.case_enums import ClueSourceType, ClueStatus

from .base import TenantMixin


class CaseClue(TenantMixin, Base):
    __tablename__ = "case_clues"

    clue_title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    source_type = Column(String(32), nullable=False)
    source_id = Column(String(36), nullable=True)
    business_line = Column(String(64), nullable=True)
    estimated_amount = Column(Numeric(15, 2), nullable=True)
    currency = Column(String(16), default="CNY", nullable=True)
    opponent_name = Column(String(128), nullable=True)
    status = Column(String(32), default=ClueStatus.NEW.value, nullable=True)
    assignee_id = Column(String(36), nullable=True)
    converted_case_id = Column(String(36), nullable=True)
    closed_reason = Column(Text, nullable=True)

    # ---- 2.S10-PRE Enum 校验 ----

    @validates("status")
    def _validate_status(self, _key: str, value: str | None) -> str | None:
        if value is None:
            return value
        allowed = {e.value for e in ClueStatus}
        if value not in allowed:
            raise ValueError(
                f"status={value!r} not in ClueStatus enum. allowed={sorted(allowed)}"
            )
        return value

    # ---- 2.S15-PRE Enum 校验 ----

    @validates("source_type")
    def _validate_source_type(self, _key: str, value: str | None) -> str | None:
        if value is None:
            return value
        allowed = {e.value for e in ClueSourceType}
        if value not in allowed:
            raise ValueError(
                f"source_type={value!r} not in ClueSourceType. allowed={sorted(allowed)}"
            )
        return value
