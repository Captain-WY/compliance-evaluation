from sqlalchemy import Column, String, Integer, Text, DateTime
from sqlalchemy.orm import validates
from app.modules.cases.core.database import Base
from .base import TenantMixin
from ..enums.case_enums import ApprovalTaskStatus


_ALLOWED_STATUS = {e.value for e in ApprovalTaskStatus}


class ApprovalTask(TenantMixin, Base):
    __tablename__ = "approval_tasks"

    instance_id = Column(String(36), nullable=False)
    node_name = Column(String(64), nullable=False)
    node_sort = Column(Integer, default=1, nullable=True)
    approver_id = Column(String(36), nullable=False)
    status = Column(String(32), default="PENDING", nullable=True)
    comment = Column(Text, nullable=True)
    processed_at = Column(DateTime(timezone=True), nullable=True)

    @validates("status")
    def validate_status(self, key, value):
        if value is None:
            return value
        if value not in _ALLOWED_STATUS:
            raise ValueError(f"approval_tasks.status={value!r} 非法，允许值: {sorted(_ALLOWED_STATUS)}")
        return value
