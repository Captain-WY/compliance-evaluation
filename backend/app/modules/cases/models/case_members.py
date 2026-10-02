"""Case Members Model.

字段与 docs/design/v1/db/13_case_members.md 对齐。
角色枚举通过 @validates 校验, 详见 docs/design/v1/db/ENUM_FIELD_CATALOG.md。
"""
from sqlalchemy import Column, String, Boolean, Date
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import validates

from app.modules.cases.core.database import Base
from app.modules.cases.enums.case_enums import CaseMemberRole, CaseMemberStatus

from .base import TenantMixin


class CaseMember(TenantMixin, Base):
    __tablename__ = "case_members"

    case_id = Column(String(36), nullable=False)
    user_id = Column(String(36), nullable=False)

    # 1. 角色与权限控制
    role_code = Column(String(32), nullable=False)  # Enum: CaseMemberRole
    custom_permissions = Column(JSONB, nullable=True)

    # 2. 状态与生命周期
    status = Column(String(32), default=CaseMemberStatus.ACTIVE.value, nullable=True)  # Enum
    join_date = Column(Date, nullable=False)
    leave_date = Column(Date, nullable=True)

    # 3. 协作与通知
    is_notification_muted = Column(Boolean, default=False, nullable=True)
    remarks = Column(String(255), nullable=True)

    # ---- Enum 校验 ----

    @validates("role_code")
    def _validate_role_code(self, _key: str, value: str) -> str:
        allowed = {e.value for e in CaseMemberRole}
        if value not in allowed:
            raise ValueError(
                f"role_code={value!r} not in CaseMemberRole enum. allowed={sorted(allowed)}"
            )
        return value

    @validates("status")
    def _validate_status(self, _key: str, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        allowed = {e.value for e in CaseMemberStatus}
        if value not in allowed:
            raise ValueError(
                f"status={value!r} not in CaseMemberStatus enum. allowed={sorted(allowed)}"
            )
        return value
