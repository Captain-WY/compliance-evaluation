from sqlalchemy import Column, String, Boolean, Integer, Text
from app.modules.cases.core.database import Base
from .base import TenantMixin


class ProcessTemplate(TenantMixin, Base):
    __tablename__ = "process_templates"

    case_type_code = Column(String(64), nullable=False)
    stage_code = Column(String(64), nullable=False)
    stage_name = Column(String(128), nullable=False)
    sort_order = Column(Integer, default=0, nullable=True)
    is_required = Column(Boolean, default=True, nullable=True)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=True)
