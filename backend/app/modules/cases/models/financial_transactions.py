"""Financial Transactions Model.

字段与 docs/design/v1/db/08_financial_transactions.md 对齐.
fund_direction / transaction_status / currency 枚举通过 @validates 校验,
详见 ENUM_FIELD_CATALOG.md §4.4 (2.S6-PRE, 2026-04-20).
"""
from sqlalchemy import Column, String, Numeric, Date, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import validates

from app.modules.cases.core.database import Base
from app.modules.cases.enums.case_enums import CurrencyCode, FundDirection, TransactionStatus

from .base import TenantMixin


class FinancialTransaction(TenantMixin, Base):
    __tablename__ = "financial_transactions"

    case_id = Column(String(36), nullable=False)
    process_node_id = Column(String(36), nullable=True)
    associated_party_id = Column(String(36), nullable=True)
    transaction_type = Column(String(64), nullable=False)
    fund_direction = Column(String(16), nullable=False)            # Enum: FundDirection
    amount = Column(Numeric(15, 2), nullable=False)
    currency = Column(String(16), default="CNY", nullable=True)    # Enum: CurrencyCode (可空)
    transaction_status = Column(String(32), default="PENDING", nullable=True)  # Enum: TransactionStatus
    apply_date = Column(Date, nullable=True)
    transaction_date = Column(Date, nullable=True)
    counterparty_name = Column(String(255), nullable=True)
    bank_account = Column(String(128), nullable=True)
    bank_name = Column(String(128), nullable=True)
    voucher_no = Column(String(64), nullable=True)
    description = Column(Text, nullable=True)
    extended_data = Column(JSONB, nullable=True)

    # ---- Enum 校验 (2.S6-PRE) ----

    @validates("fund_direction")
    def _validate_fund_direction(self, _key: str, value: str) -> str:
        allowed = {e.value for e in FundDirection}
        if value not in allowed:
            raise ValueError(
                f"fund_direction={value!r} not in FundDirection enum. allowed={sorted(allowed)}"
            )
        return value

    @validates("transaction_status")
    def _validate_transaction_status(self, _key: str, value):
        if value is None:
            return value
        allowed = {e.value for e in TransactionStatus}
        if value not in allowed:
            raise ValueError(
                f"transaction_status={value!r} not in TransactionStatus enum. allowed={sorted(allowed)}"
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
