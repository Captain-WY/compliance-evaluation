from sqlalchemy import Column, String, Boolean
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import synonym
from app.core.database import CommonBase as Base
from .base import TenantMixin


class SysUser(TenantMixin, Base):
    __tablename__ = "sys_users"

    username = Column(String(64), nullable=False)
    real_name = Column(String(64), nullable=False)
    email = Column(String(128), nullable=True)
    phone = Column(String(32), nullable=True)
    avatar_url = Column(String(512), nullable=True)
    employee_no = Column(String(64), nullable=True)
    department_id = Column(String(36), nullable=True)
    title = Column(String(64), nullable=True)
    status = Column(String(32), default="ACTIVE", nullable=True)

    user_id = synonym('id')
    display_name = synonym('real_name')
    org_id = synonym('department_id')
    external_subject_id = Column(String(160), unique=True, nullable=True)
    active = Column(Boolean, default=True, nullable=False)
    sync_source = Column(String(80), default='casdoor', nullable=False)
    last_synced_at = Column(String(80), nullable=True)
    extra = Column(JSONB, default=dict, nullable=False)
