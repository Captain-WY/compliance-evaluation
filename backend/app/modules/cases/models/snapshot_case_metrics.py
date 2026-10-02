from sqlalchemy import Column, String, Numeric
from app.modules.cases.core.database import Base
from .base import TenantMixin


class SnapshotCaseMetric(TenantMixin, Base):
    __tablename__ = "snapshot_case_metrics"

    snapshot_id = Column(String(36), nullable=False)
    case_id = Column(String(36), nullable=False)
    frozen_business_line = Column(String(64), nullable=True)
    frozen_stage_code = Column(String(64), nullable=True)
    frozen_case_status = Column(String(32), nullable=True)
    frozen_cost = Column(Numeric(15, 2), default=0.00, nullable=True)
    frozen_liability = Column(Numeric(15, 2), default=0.00, nullable=True)
    frozen_recovery = Column(Numeric(15, 2), default=0.00, nullable=True)
    currency = Column(String(16), default="CNY", nullable=True)
