"""External Lawyers Model.

字段与 docs/design/v1/db/31_external_counsels_and_templates.md §2.2 对齐.
status 枚举通过 @validates 校验 (2.S7-PRE, 2026-04-20).
"""
from sqlalchemy import Column, String
from sqlalchemy.orm import validates

from app.modules.cases.core.database import Base
from app.modules.cases.enums.case_enums import LawyerStatus

from .base import TenantMixin


class ExternalLawyer(TenantMixin, Base):
    __tablename__ = "external_lawyers"

    user_id = Column(String(36), nullable=True, index=True)  # 关联 sys_users.id，S19-PRE2 D15
    firm_id = Column(String(36), nullable=False)
    lawyer_name = Column(String(64), nullable=False)
    license_number = Column(String(64), nullable=True)
    title = Column(String(64), nullable=True)
    expertise = Column(String(255), nullable=True)
    contact_phone = Column(String(32), nullable=True)
    contact_email = Column(String(128), nullable=True)
    status = Column(String(32), default="ACTIVE", nullable=True)     # Enum: LawyerStatus

    # ---- Enum 校验 (2.S7-PRE) ----

    @validates("status")
    def _validate_status(self, _key: str, value):
        if value is None:
            return value
        allowed = {e.value for e in LawyerStatus}
        if value not in allowed:
            raise ValueError(
                f"status={value!r} not in LawyerStatus enum. allowed={sorted(allowed)}"
            )
        return value
