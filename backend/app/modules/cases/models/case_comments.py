from sqlalchemy import Column, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from app.modules.cases.core.database import Base
from .base import TenantMixin


class CaseComment(TenantMixin, Base):
    __tablename__ = "case_comments"

    case_id = Column(String(36), nullable=False)
    user_id = Column(String(36), nullable=False)
    content = Column(Text, nullable=False)
    mentions = Column(JSONB, nullable=True)
    attachment_ids = Column(JSONB, nullable=True)
    reply_to_comment_id = Column(String(36), nullable=True)
