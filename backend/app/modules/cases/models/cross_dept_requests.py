from sqlalchemy import Column, String, Text, DateTime
from sqlalchemy.dialects.postgresql import JSONB
from app.modules.cases.core.database import Base
from .base import TenantMixin


class CrossDeptRequest(TenantMixin, Base):
    __tablename__ = "cross_dept_requests"

    case_id = Column(String(36), nullable=False)
    request_no = Column(String(64), nullable=False)
    title = Column(String(255), nullable=False)
    request_content = Column(Text, nullable=False)
    target_dept_id = Column(String(36), nullable=False)
    target_role_id = Column(String(36), nullable=True)
    assignee_id = Column(String(36), nullable=True)
    deadline = Column(DateTime(timezone=True), nullable=False)
    status = Column(String(32), default="PENDING", nullable=True)
    response_content = Column(Text, nullable=True)
    attachment_ids = Column(JSONB, nullable=True)
