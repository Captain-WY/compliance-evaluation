from sqlalchemy import Column, String, Boolean, Integer, Text, JSON
from app.modules.cases.core.database import Base
from .base import TenantMixin


class TaskTemplate(TenantMixin, Base):
    __tablename__ = "task_templates"

    process_template_id = Column(String(36), nullable=False)
    task_code = Column(String(64), nullable=True)
    task_name = Column(String(128), nullable=False)
    task_group = Column(String(64), default="MAIN_FLOW", nullable=True)
    display_style = Column(String(32), default="TIMELINE", nullable=True)
    icon = Column(String(64), nullable=True)
    is_milestone = Column(Boolean, default=False, nullable=True)
    extended_config = Column(JSON, nullable=True)
    action_type = Column(String(32), default="NONE", nullable=True)
    action_config = Column(JSON, nullable=True)
    required_doc_types = Column(JSON, nullable=True)
    sort_order = Column(Integer, default=0, nullable=True)
    is_required = Column(Boolean, default=True, nullable=True)
    default_days_due = Column(Integer, nullable=True)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=True)
