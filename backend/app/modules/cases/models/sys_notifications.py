from sqlalchemy import Column, String, Boolean, Text, DateTime
from sqlalchemy.orm import validates
from app.modules.cases.core.database import Base
from .base import TenantMixin
from ..enums.case_enums import NotifyType


_ALLOWED_NOTIFY_TYPE = {e.value for e in NotifyType}


class SysNotification(TenantMixin, Base):
    __tablename__ = "sys_notifications"

    user_id = Column(String(36), nullable=False)
    notify_type = Column(String(32), nullable=False)
    title = Column(String(128), nullable=False)
    content = Column(Text, nullable=True)
    reference_url = Column(String(512), nullable=True)
    is_read = Column(Boolean, default=False, nullable=True)
    read_at = Column(DateTime(timezone=True), nullable=True)

    @validates("notify_type")
    def validate_notify_type(self, key, value):
        if value is None:
            return value
        if value not in _ALLOWED_NOTIFY_TYPE:
            raise ValueError(f"sys_notifications.notify_type={value!r} 非法，允许值: {sorted(_ALLOWED_NOTIFY_TYPE)}")
        return value
