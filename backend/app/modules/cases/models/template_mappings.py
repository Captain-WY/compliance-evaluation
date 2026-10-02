from sqlalchemy import Column, String, Boolean
from app.modules.cases.core.database import Base
from .base import TenantMixin


class TemplateMapping(TenantMixin, Base):
    __tablename__ = "template_mappings"

    template_id = Column(String(36), nullable=False)
    target_field_name = Column(String(64), nullable=False)
    target_location = Column(String(128), nullable=False)
    source_type = Column(String(32), nullable=False)
    source_path = Column(String(255), nullable=True)
    format_rule = Column(String(64), nullable=True)
    is_required = Column(Boolean, default=True, nullable=True)
