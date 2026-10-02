from sqlalchemy import Column, String, Date, Text, DateTime
from app.modules.cases.core.database import Base
from .base import TenantMixin


class FinancialSnapshot(TenantMixin, Base):
    __tablename__ = "financial_snapshots"

    snapshot_name = Column(String(128), nullable=False)
    period = Column(String(32), nullable=False)
    snapshot_date = Column(Date, nullable=False)
    status = Column(String(32), default="GENERATING", nullable=True)
    locked_at = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text, nullable=True)
