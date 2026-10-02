"""Case Counsels Model.

字段与 docs/design/v1/db/16_case_counsels_and_contracts.md §2.1 对齐.
counsel_type / role_in_case / status 枚举通过 @validates 校验
(2.S7-PRE, 2026-04-20, 决策 D2/D5).
"""
from sqlalchemy import Column, Integer, String, Text
from sqlalchemy.orm import validates

from app.modules.cases.core.database import Base
from app.modules.cases.enums.case_enums import CounselRoleInCase, CounselStatus, CounselType

from .base import TenantMixin


class CaseCounsel(TenantMixin, Base):
    __tablename__ = "case_counsels"

    case_id = Column(String(36), nullable=False)
    counsel_type = Column(String(32), nullable=False)                # Enum: CounselType
    law_firm_id = Column(String(36), nullable=True)
    law_firm_name = Column(String(128), nullable=True)
    lawyer_id = Column(String(36), nullable=False)                   # D2: INTERNAL→sys_users.id / EXTERNAL→external_lawyers.id
    lawyer_name = Column(String(64), nullable=False)
    role_in_case = Column(String(32), default="LEAD", nullable=True) # Enum: CounselRoleInCase
    contract_id = Column(String(36), nullable=True)
    contact_phone = Column(String(32), nullable=True)
    contact_email = Column(String(128), nullable=True)
    status = Column(String(32), default="ACTIVE", nullable=True)     # Enum: CounselStatus
    performance_rating = Column(Integer, nullable=True)
    evaluation_comment = Column(Text, nullable=True)

    # ---- Enum 校验 (2.S7-PRE) ----

    @validates("counsel_type")
    def _validate_counsel_type(self, _key: str, value: str) -> str:
        allowed = {e.value for e in CounselType}
        if value not in allowed:
            raise ValueError(
                f"counsel_type={value!r} not in CounselType enum. allowed={sorted(allowed)}"
            )
        return value

    @validates("role_in_case")
    def _validate_role_in_case(self, _key: str, value):
        if value is None:
            return value
        allowed = {e.value for e in CounselRoleInCase}
        if value not in allowed:
            raise ValueError(
                f"role_in_case={value!r} not in CounselRoleInCase enum. allowed={sorted(allowed)}"
            )
        return value

    @validates("status")
    def _validate_status(self, _key: str, value):
        if value is None:
            return value
        allowed = {e.value for e in CounselStatus}
        if value not in allowed:
            raise ValueError(
                f"status={value!r} not in CounselStatus enum. allowed={sorted(allowed)}"
            )
        return value
