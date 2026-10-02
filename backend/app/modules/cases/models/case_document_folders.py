from sqlalchemy import Column, String, Boolean, Integer
from app.modules.cases.core.database import Base
from .base import TenantMixin


class CaseDocumentFolder(TenantMixin, Base):
    __tablename__ = "case_document_folders"

    case_id = Column(String(36), nullable=False)
    parent_id = Column(String(36), nullable=True)
    folder_name = Column(String(128), nullable=False)
    sort_order = Column(Integer, default=0, nullable=True)
    is_system = Column(Boolean, default=False, nullable=True)
