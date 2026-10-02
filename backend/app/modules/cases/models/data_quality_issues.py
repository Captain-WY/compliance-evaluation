from sqlalchemy import Column, String, Text, DateTime
from sqlalchemy.orm import validates
from app.modules.cases.core.database import Base
from app.modules.cases.enums.case_enums import IssueSeverity, IssueStatus, IssueType
from .base import TenantMixin


class DataQualityIssue(TenantMixin, Base):
    __tablename__ = "data_quality_issues"

    case_id = Column(String(36), nullable=False)
    issue_type = Column(String(64), nullable=False)   # Enum: IssueType
    field_name = Column(String(64), nullable=True)
    severity = Column(String(16), default="WARNING", nullable=True)   # Enum: IssueSeverity
    description = Column(Text, nullable=False)
    status = Column(String(32), default="PENDING", nullable=True)   # Enum: IssueStatus
    resolved_by = Column(String(36), nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)

    @validates("issue_type")
    def validate_issue_type(self, _key: str, value) -> str:
        if value is None:
            return value
        allowed = {e.value for e in IssueType}
        if value not in allowed:
            raise ValueError(f"issue_type={value!r} not in IssueType enum. allowed={sorted(allowed)}")
        return value

    @validates("severity")
    def validate_severity(self, _key: str, value) -> str:
        if value is None:
            return value
        allowed = {e.value for e in IssueSeverity}
        if value not in allowed:
            raise ValueError(f"severity={value!r} not in IssueSeverity enum. allowed={sorted(allowed)}")
        return value

    @validates("status")
    def validate_status(self, _key: str, value) -> str:
        if value is None:
            return value
        allowed = {e.value for e in IssueStatus}
        if value not in allowed:
            raise ValueError(f"status={value!r} not in IssueStatus enum. allowed={sorted(allowed)}")
        return value
