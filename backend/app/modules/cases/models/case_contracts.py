"""Case Contracts Model.

字段与 docs/design/v1/db/16_case_counsels_and_contracts.md §2.2 对齐.
status 枚举通过 @validates 校验. currency 复用 CurrencyCode (2.S6-PRE).
fee_type 暂未设计 Enum, 留到后续切片 (可选择 S11 财务看板时补).
(2.S7-PRE, 2026-04-20, 决策 D1/D3).
"""
from sqlalchemy import Column, Date, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import validates

from app.modules.cases.core.database import Base
from app.modules.cases.enums.case_enums import ContractStatus, CurrencyCode

from .base import TenantMixin


class CaseContract(TenantMixin, Base):
    __tablename__ = "case_contracts"

    case_id = Column(String(36), nullable=False)
    contract_no = Column(String(64), nullable=True)
    contract_name = Column(String(255), nullable=False)
    law_firm_id = Column(String(36), nullable=False)
    sign_date = Column(Date, nullable=True)
    fee_type = Column(String(32), nullable=False)                    # P2 Enum: FeeType (未注册)
    currency = Column(String(16), default="CNY", nullable=True)      # Enum: CurrencyCode (2.S6)
    total_amount = Column(Numeric(15, 2), nullable=True)
    contingency_rate = Column(Numeric(5, 4), nullable=True)
    payment_terms = Column(Text, nullable=True)
    status = Column(String(32), default="SIGNED", nullable=True)     # Enum: ContractStatus
    # D1=A: attachment_ids 存储 case_documents.id 列表 (复用 S5 卷宗, 非 sys_attachments)
    attachment_ids = Column(JSONB, nullable=True)

    # ---- Enum 校验 (2.S7-PRE) ----

    @validates("status")
    def _validate_status(self, _key: str, value):
        if value is None:
            return value
        allowed = {e.value for e in ContractStatus}
        if value not in allowed:
            raise ValueError(
                f"status={value!r} not in ContractStatus enum. allowed={sorted(allowed)}"
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
