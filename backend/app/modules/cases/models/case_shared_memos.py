from sqlalchemy import Column, String, Boolean, Text, DateTime
from app.modules.cases.core.database import Base
from .base import TenantMixin


class CaseSharedMemo(TenantMixin, Base):
    __tablename__ = "case_shared_memos"

    case_id = Column(String(36), nullable=False)
    content = Column(Text, nullable=False)
    is_checked = Column(Boolean, default=False, nullable=True)
    last_edited_by = Column(String(36), nullable=False)
    last_edited_at = Column(DateTime(timezone=True), nullable=True)
