"""Document Permission Model (卷宗权限授予).

字段对齐 docs/design/v1/db/15_document_permissions.md.
2.S5-PRE (2026-04-19): 3 个 Enum 字段 (target_type / grantee_type / permission_type)
加 @validates 校验.
"""
from sqlalchemy import Column, DateTime, String
from sqlalchemy.orm import validates

from app.modules.cases.core.database import Base
from app.modules.cases.enums.case_enums import GranteeType, PermissionTargetType, PermissionType

from .base import TenantMixin


class DocumentPermission(TenantMixin, Base):
    __tablename__ = "document_permissions"

    case_id = Column(String(36), nullable=False)
    target_type = Column(String(32), nullable=False)  # Enum: PermissionTargetType
    target_id = Column(String(36), nullable=False)
    grantee_type = Column(String(32), nullable=False)  # Enum: GranteeType
    grantee_id = Column(String(36), nullable=False)
    permission_type = Column(String(32), nullable=False)  # Enum: PermissionType
    expire_at = Column(DateTime(timezone=True), nullable=True)
    granted_by = Column(String(36), nullable=False)
    source_request_id = Column(String(36), nullable=True)

    @validates("target_type")
    def _validate_target_type(self, _key: str, value: str) -> str:
        allowed = {e.value for e in PermissionTargetType}
        if value not in allowed:
            raise ValueError(
                f"target_type={value!r} not in PermissionTargetType. allowed={sorted(allowed)}"
            )
        return value

    @validates("grantee_type")
    def _validate_grantee_type(self, _key: str, value: str) -> str:
        allowed = {e.value for e in GranteeType}
        if value not in allowed:
            raise ValueError(
                f"grantee_type={value!r} not in GranteeType. allowed={sorted(allowed)}"
            )
        return value

    @validates("permission_type")
    def _validate_permission_type(self, _key: str, value: str) -> str:
        allowed = {e.value for e in PermissionType}
        if value not in allowed:
            raise ValueError(
                f"permission_type={value!r} not in PermissionType. allowed={sorted(allowed)}"
            )
        return value
