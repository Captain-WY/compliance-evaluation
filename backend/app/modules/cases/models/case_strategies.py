from sqlalchemy import Column, String, Numeric, Integer, Text
from sqlalchemy.dialects.postgresql import JSONB
from app.modules.cases.core.database import Base
from .base import TenantMixin


class CaseStrategy(TenantMixin, Base):
    __tablename__ = "case_strategies"

    case_id = Column(String(36), nullable=False)
    strategy_type = Column(String(32), nullable=False)
    strategy_goal = Column(String(64), nullable=True)
    estimated_win_rate = Column(Numeric(5, 2), nullable=True)
    version = Column(Integer, default=1, nullable=True)
    content = Column(Text, nullable=False)
    reference_case_ids = Column(JSONB, nullable=True)
    external_precedents = Column(JSONB, nullable=True)
    status = Column(String(32), default="DRAFT", nullable=True)
    approved_by = Column(String(36), nullable=True)
