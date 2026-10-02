"""Case Budgets Model.

字段与 docs/design/v1/db/20_case_budgets.md 对齐.
currency 枚举通过 @validates 校验 (2.S6-PRE, 2026-04-20).
status 字段 (CaseBudgetStatus) 暂未设计 Enum, 留待后续切片.
"""
from sqlalchemy import Column, String, Numeric, Text
from sqlalchemy.orm import validates

from app.modules.cases.core.database import Base
from app.modules.cases.enums.case_enums import CurrencyCode

from .base import TenantMixin


class CaseBudget(TenantMixin, Base):
    __tablename__ = "case_budgets"

    case_id = Column(String(36), nullable=False)
    business_line_budget_id = Column(String(36), nullable=True)
    total_budget = Column(Numeric(15, 2), nullable=False)
    currency = Column(String(16), default="CNY", nullable=True)    # Enum: CurrencyCode (可空)
    status = Column(String(32), default="DRAFT", nullable=True)    # P2 Enum: CaseBudgetStatus (未注册)
    approval_instance_id = Column(String(36), nullable=True)
    notes = Column(Text, nullable=True)

    # ---- Enum 校验 (2.S6-PRE) ----

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
