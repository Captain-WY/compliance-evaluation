from sqlalchemy import Column, String, Integer, Text
from sqlalchemy.orm import validates
from app.modules.cases.core.database import Base
from app.modules.cases.enums.case_enums import ReportCategory
from .base import TenantMixin


class ReportTemplate(TenantMixin, Base):
    __tablename__ = "report_templates"

    template_code = Column(String(64), nullable=False)
    template_name = Column(String(128), nullable=False)
    description = Column(Text, nullable=True)
    regulator_name = Column(String(64), nullable=True)
    report_category = Column(String(32), nullable=False)
    file_type = Column(String(16), nullable=False)
    file_url = Column(String(512), nullable=False)
    status = Column(String(32), default="ACTIVE", nullable=True)
    version = Column(Integer, default=1, nullable=True)

    # 2.S14-PRE D7: 补 @validates 防止非法 Enum 值写入
    @validates("report_category")
    def _validate_report_category(self, _key: str, value: str | None) -> str | None:
        if value is None:
            return value
        allowed = {e.value for e in ReportCategory}
        if value not in allowed:
            raise ValueError(
                f"report_category={value!r} not in ReportCategory enum. allowed={sorted(allowed)}"
            )
        return value

    @validates("status")
    def _validate_status(self, _key: str, value: str | None) -> str | None:
        if value is None:
            return value
        allowed = {"ACTIVE", "INACTIVE", "DRAFT"}
        if value not in allowed:
            raise ValueError(
                f"status={value!r} not allowed for ReportTemplate. allowed={sorted(allowed)}"
            )
        return value
