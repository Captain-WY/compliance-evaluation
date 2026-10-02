from sqlalchemy import Column, String, DateTime
from sqlalchemy.orm import validates
from app.modules.cases.core.database import Base
from .base import TenantMixin
from ..enums.case_enums import ApprovalInstanceStatus


_ALLOWED_STATUS = {e.value for e in ApprovalInstanceStatus}


class ApprovalInstance(TenantMixin, Base):
    __tablename__ = "approval_instances"

    business_type = Column(String(64), nullable=False)
    business_id = Column(String(36), nullable=False)
    title = Column(String(255), nullable=False)
    process_code = Column(String(64), nullable=True)
    external_process_id = Column(String(128), nullable=True)
    status = Column(String(32), default="IN_PROGRESS", nullable=True)
    applicant_id = Column(String(36), nullable=False)
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    @validates("status")
    def validate_status(self, key, value):
        if value is None:
            return value
        if value not in _ALLOWED_STATUS:
            raise ValueError(f"approval_instances.status={value!r} 非法，允许值: {sorted(_ALLOWED_STATUS)}")
        return value
