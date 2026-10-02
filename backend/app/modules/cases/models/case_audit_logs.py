from sqlalchemy import Column, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from app.modules.cases.core.database import Base
from .base import TenantMixin


class CaseAuditLog(TenantMixin, Base):
    __tablename__ = "case_audit_logs"

    case_id = Column(String(36), nullable=False)
    operator_id = Column(String(36), nullable=False)
    operator_name = Column(String(64), nullable=False)
    action_module = Column(String(32), nullable=False)
    action_type = Column(String(32), nullable=False)
    action_detail = Column(String(255), nullable=False)
    target_record_id = Column(String(36), nullable=True)
    before_data = Column(JSONB, nullable=True)
    after_data = Column(JSONB, nullable=True)
    ip_address = Column(String(64), nullable=True)
    user_agent = Column(String(512), nullable=True)
