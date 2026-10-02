from sqlalchemy import Column, String, BigInteger, Text
from sqlalchemy.orm import validates
from app.core.database import CommonBase as Base
from .base import TenantMixin
from ..enums.case_enums import AttachmentBusinessType, StorageProvider


_ALLOWED_BUSINESS_TYPE = {e.value for e in AttachmentBusinessType}
_ALLOWED_STORAGE_PROVIDER = {e.value for e in StorageProvider}


class SysAttachment(TenantMixin, Base):
    __tablename__ = "sys_attachments"

    business_type = Column(String(64), nullable=False)
    business_id = Column(String(36), nullable=False)
    file_name = Column(String(255), nullable=False)
    file_extension = Column(String(32), nullable=True)
    file_size = Column(BigInteger, nullable=True)
    mime_type = Column(String(128), nullable=True)
    storage_provider = Column(String(32), default="OSS", nullable=True)
    file_url = Column(String(1024), nullable=False)
    uploader_id = Column(String(36), nullable=True)
    description = Column(Text, nullable=True)

    @validates("business_type")
    def validate_business_type(self, key, value):
        if value is None:
            return value
        if value not in _ALLOWED_BUSINESS_TYPE:
            raise ValueError(f"sys_attachments.business_type={value!r} 非法，允许值: {sorted(_ALLOWED_BUSINESS_TYPE)}")
        return value

    @validates("storage_provider")
    def validate_storage_provider(self, key, value):
        if value is None:
            return value
        if value not in _ALLOWED_STORAGE_PROVIDER:
            raise ValueError(f"sys_attachments.storage_provider={value!r} 非法，允许值: {sorted(_ALLOWED_STORAGE_PROVIDER)}")
        return value
