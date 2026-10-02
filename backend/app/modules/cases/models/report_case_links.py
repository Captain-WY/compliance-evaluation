from sqlalchemy import Column, String
from app.modules.cases.core.database import Base
from .base import TenantMixin


class ReportCaseLink(TenantMixin, Base):
    __tablename__ = "report_case_links"

    reporting_task_id = Column(String(36), nullable=False)
    case_id = Column(String(36), nullable=False)
    inclusion_reason = Column(String(128), nullable=True)
