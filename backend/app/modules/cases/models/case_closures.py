"""Case Closures Model.

字段与 docs/design/v1/db/17_case_strategies_and_closures.md 对齐.
closure_type / status 枚举通过 @validates 校验 (2.S9-PRE, 2026-04-21).
"""
from sqlalchemy import Column, Date, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import validates

from app.modules.cases.core.database import Base
from app.modules.cases.enums.case_enums import ClosureStatus, ClosureType

from .base import TenantMixin


class CaseClosure(TenantMixin, Base):
    __tablename__ = "case_closures"

    case_id = Column(String(36), nullable=False)
    closure_date = Column(Date, nullable=False)
    closure_type = Column(String(32), nullable=False)                # Enum: ClosureType
    checklist_data = Column(JSONB, nullable=False)
    review_summary = Column(Text, nullable=False)
    improvement_plan = Column(Text, nullable=True)
    status = Column(String(32), default="DRAFT", nullable=True)      # Enum: ClosureStatus
    approved_by = Column(String(36), nullable=True)

    # ---- Enum 校验 (2.S9-PRE) ----

    @validates("closure_type")
    def _validate_closure_type(self, _key: str, value: str) -> str:
        allowed = {e.value for e in ClosureType}
        if value not in allowed:
            raise ValueError(
                f"closure_type={value!r} not in ClosureType enum. allowed={sorted(allowed)}"
            )
        return value

    @validates("status")
    def _validate_status(self, _key: str, value):
        if value is None:
            return value
        allowed = {e.value for e in ClosureStatus}
        if value not in allowed:
            raise ValueError(
                f"status={value!r} not in ClosureStatus enum. allowed={sorted(allowed)}"
            )
        return value
