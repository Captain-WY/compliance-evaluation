"""Document Auth Request Model (授权申请工作流).

字段对齐 docs/design/v1/db/15_document_permissions.md §2.2.
2.S5-PRE (2026-04-19): 3 个 Enum 字段 (target_type / requested_permission / status) 加 @validates.
"""
from sqlalchemy import Column, Integer, String, Text
from sqlalchemy.orm import validates

from app.modules.cases.core.database import Base
from app.modules.cases.enums.case_enums import AuthRequestStatus, PermissionTargetType, PermissionType

from .base import TenantMixin


class DocumentAuthRequest(TenantMixin, Base):
    __tablename__ = "document_auth_requests"

    case_id = Column(String(36), nullable=False)
    target_type = Column(String(32), nullable=False)  # Enum: PermissionTargetType
    target_id = Column(String(36), nullable=False)
    requested_permission = Column(String(32), nullable=False)  # Enum: PermissionType
    applicant_id = Column(String(36), nullable=False)
    reason = Column(Text, nullable=False)
    requested_duration_days = Column(Integer, nullable=True)
    status = Column(String(32), default=AuthRequestStatus.PENDING.value, nullable=True)
    approval_instance_id = Column(String(36), nullable=True)  # D8 预留, 本期不对接
    reviewer_id = Column(String(36), nullable=True)
    review_comment = Column(Text, nullable=True)

    @validates("target_type")
    def _validate_target_type(self, _key: str, value: str) -> str:
        allowed = {e.value for e in PermissionTargetType}
        if value not in allowed:
            raise ValueError(
                f"target_type={value!r} not in PermissionTargetType. allowed={sorted(allowed)}"
            )
        return value

    @validates("requested_permission")
    def _validate_requested_permission(self, _key: str, value: str) -> str:
        allowed = {e.value for e in PermissionType}
        if value not in allowed:
            raise ValueError(
                f"requested_permission={value!r} not in PermissionType. allowed={sorted(allowed)}"
            )
        return value

    @validates("status")
    def _validate_status(self, _key: str, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        allowed = {e.value for e in AuthRequestStatus}
        if value not in allowed:
            raise ValueError(
                f"status={value!r} not in AuthRequestStatus. allowed={sorted(allowed)}"
            )
        return value
