from sqlalchemy import Column, String, Integer, Text
from sqlalchemy.orm import validates
from app.modules.cases.core.database import Base
from app.modules.cases.enums.case_enums import TemplateFileType, SystemEntityStatus
from .base import TenantMixin


class LegalDocTemplate(TenantMixin, Base):
    __tablename__ = "legal_doc_templates"

    template_name = Column(String(128), nullable=False)
    category = Column(String(64), nullable=False)
    description = Column(Text, nullable=True)
    file_url = Column(String(512), nullable=False)
    file_type = Column(String(16), nullable=False)
    version = Column(Integer, default=1, nullable=True)
    status = Column(String(32), default="ACTIVE", nullable=True)

    @validates("category")
    def validate_category(self, key: str, value: str | None) -> str | None:
        if value is None:
            return value
        # 允许 sys_dicts 中动态扩展的分类，不再硬编码限制为 Enum 值
        if not value or len(value.strip()) == 0:
            raise ValueError("category 不能为空")
        return value

    @validates("file_type")
    def validate_file_type(self, key: str, value: str | None) -> str | None:
        if value is None:
            return value
        allowed = {e.value for e in TemplateFileType}
        if value not in allowed:
            raise ValueError(f"file_type={value!r} 非法，允许值: {sorted(allowed)}")
        return value

    @validates("status")
    def validate_status(self, key: str, value: str | None) -> str | None:
        if value is None:
            return value
        allowed = {e.value for e in SystemEntityStatus}
        if value not in allowed:
            raise ValueError(f"status={value!r} 非法，允许值: {sorted(allowed)}")
        return value
