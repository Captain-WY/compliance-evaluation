"""WP-P0-BE-06 — Compliance Issue Hub & Rectification Loop SQLAlchemy models.

Entities:
  ComplianceIssueModel       — Central issue hub durable record
  IssueSupervisionEventModel — HQ supervision event
  RectificationRecordModel   — Rectification workflow record
  RectificationFeedbackModel — Branch feedback with evidence
"""

from datetime import date, datetime
from typing import Any

from sqlalchemy import Date, DateTime, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.modules.compliance.core.db import Base
from app.modules.compliance.models.auth import AuditMixin


class ComplianceIssueModel(AuditMixin, Base):
    __tablename__ = "compliance_issues"

    issue_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    issue_code: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    source_type: Mapped[str] = mapped_column(String(40), nullable=False)
    source_id: Mapped[str] = mapped_column(String(120), nullable=False)
    source_project: Mapped[str] = mapped_column(String(240), nullable=False)
    business_line: Mapped[str] = mapped_column(String(80), nullable=False)
    responsible_org_id: Mapped[str] = mapped_column(String(120), nullable=False)
    responsible_dept: Mapped[str] = mapped_column(String(240), nullable=False)
    responsible_org_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    risk_level: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(80), nullable=False)
    discovery_date: Mapped[date] = mapped_column(Date, nullable=False)
    sla_deadline: Mapped[date] = mapped_column(Date, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    rectification_advice: Mapped[str] = mapped_column(Text, nullable=False)
    basis_rule: Mapped[str] = mapped_column(Text, nullable=False)


class IssueSupervisionEventModel(AuditMixin, Base):
    __tablename__ = "issue_supervision_events"

    supervision_event_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    issue_id: Mapped[str] = mapped_column(String(120), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    channel: Mapped[str] = mapped_column(String(40), nullable=False)
    created_by_ref: Mapped[str] = mapped_column(String(80), nullable=False)
    created_by_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    created_at_ref: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    integration_event_id: Mapped[str | None] = mapped_column(String(120), nullable=True)


class RectificationRecordModel(AuditMixin, Base):
    __tablename__ = "rectification_records"

    rectification_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    source_issue_id: Mapped[str] = mapped_column(String(120), nullable=False)
    responsible_org_id: Mapped[str] = mapped_column(String(120), nullable=False)
    responsible_org_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    issue_description: Mapped[str] = mapped_column(Text, nullable=False)
    rectification_goal: Mapped[str] = mapped_column(Text, nullable=False)
    risk_level: Mapped[str] = mapped_column(String(40), nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(80), nullable=False)
    extension: Mapped[str] = mapped_column(String(40), nullable=False, default="NONE")
    hq_reject_reason: Mapped[str | None] = mapped_column(Text, nullable=True)


class RectificationFeedbackModel(AuditMixin, Base):
    __tablename__ = "rectification_feedbacks"

    feedback_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    rectification_id: Mapped[str] = mapped_column(String(120), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    file_ids: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    submitted_by_ref: Mapped[str] = mapped_column(String(80), nullable=False)
    submitted_by_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    submitted_at_ref: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
