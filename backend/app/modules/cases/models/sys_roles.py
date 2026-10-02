from sqlalchemy import Column, String, Text
from sqlalchemy.orm import validates
from app.core.database import CommonBase as Base
from app.modules.cases.enums.case_enums import SystemEntityStatus
from .base import TenantMixin


class SysRole(TenantMixin, Base):
    __tablename__ = "sys_roles"

    role_code = Column(String(64), nullable=False)
    role_name = Column(String(128), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(32), default="ACTIVE", nullable=True)

    @validates("status")
    def validate_status(self, key: str, value: str | None) -> str | None:
        if value is None:
            return value
        allowed = {e.value for e in SystemEntityStatus}
        if value not in allowed:
            raise ValueError(f"status={value!r} 非法，允许值: {sorted(allowed)}")
        return value
