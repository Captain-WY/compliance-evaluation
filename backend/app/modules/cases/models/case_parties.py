"""Case Parties Model.

字段与 docs/design/v1/db/06_case_parties.md 对齐。
party_type / identity_type 枚举通过 @validates 校验, 详见 ENUM_FIELD_CATALOG.md §4.1。
"""
from sqlalchemy import Column, String, Boolean, Integer, Numeric, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import validates

from app.modules.cases.core.database import Base
from app.modules.cases.enums.case_enums import IdentityType, PartyType

from .base import TenantMixin


class CaseParty(TenantMixin, Base):
    __tablename__ = "case_parties"

    case_id = Column(String(36), nullable=False)

    # 1. 核心身份与阵营
    party_type = Column(String(64), nullable=False)  # Enum: PartyType
    is_our_side = Column(Boolean, default=False, nullable=True)
    party_name = Column(String(255), nullable=False)

    # 2. 主体详细信息
    identity_type = Column(String(64), nullable=False)  # Enum: IdentityType
    identity_number = Column(String(128), nullable=True)
    legal_representative = Column(String(128), nullable=True)

    # 3. 联系与送达
    contact_number = Column(String(64), nullable=True)
    service_address = Column(String(512), nullable=True)

    # 4. 诉求与答辩
    claim_amount = Column(Numeric(15, 2), nullable=True)
    claim_details = Column(Text, nullable=True)

    # 5. 外部代理人信息
    agent_name = Column(String(128), nullable=True)
    agent_law_firm = Column(String(255), nullable=True)
    agent_contact = Column(String(64), nullable=True)

    # 6. 扩展与控制
    sort_order = Column(Integer, default=0, nullable=True)
    extended_data = Column(JSONB, nullable=True)

    # ---- Enum 校验 ----

    @validates("party_type")
    def _validate_party_type(self, _key: str, value: str) -> str:
        allowed = {e.value for e in PartyType}
        if value not in allowed:
            raise ValueError(
                f"party_type={value!r} not in PartyType enum. allowed={sorted(allowed)}"
            )
        return value

    @validates("identity_type")
    def _validate_identity_type(self, _key: str, value: str) -> str:
        allowed = {e.value for e in IdentityType}
        if value not in allowed:
            raise ValueError(
                f"identity_type={value!r} not in IdentityType enum. allowed={sorted(allowed)}"
            )
        return value
