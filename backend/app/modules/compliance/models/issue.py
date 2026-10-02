from datetime import date, datetime
from typing import Any

from sqlalchemy import Date, DateTime, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.modules.compliance.core.db import Base
from app.modules.compliance.models.auth import AuditMixin


class InspectionIssueModel(AuditMixin, Base):
    __tablename__ = "inspection_issues"

    issue_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    inspection_plan_id: Mapped[str] = mapped_column(String(120), nullable=False)
    branch_id: Mapped[str] = mapped_column(String(120), nullable=False)
    branch_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    issue_code: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    risk_level: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    basis_rule: Mapped[str] = mapped_column(Text, nullable=False)
    appeal_deadline: Mapped[date] = mapped_column(Date, nullable=False)
    validity: Mapped[str] = mapped_column(String(40), nullable=False)


class FactConfirmationModel(AuditMixin, Base):
    __tablename__ = "fact_confirmations"

    confirmation_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    issue_id: Mapped[str] = mapped_column(String(120), nullable=False)
    branch_id: Mapped[str] = mapped_column(String(120), nullable=False)
    decision: Mapped[str] = mapped_column(String(80), nullable=False)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    confirmed_by_ref: Mapped[str] = mapped_column(String(80), nullable=False)
    confirmed_by_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    branch_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    confirmed_at_ref: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class IssueAppealModel(AuditMixin, Base):
    __tablename__ = "issue_appeals"

    appeal_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    issue_id: Mapped[str] = mapped_column(String(120), nullable=False)
    branch_id: Mapped[str] = mapped_column(String(120), nullable=False)
    branch_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    file_ids: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    status: Mapped[str] = mapped_column(String(80), nullable=False)
    submitted_by_ref: Mapped[str] = mapped_column(String(80), nullable=False)
    submitted_by_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    submitted_at_ref: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class AdjudicationDecisionModel(AuditMixin, Base):
    __tablename__ = "adjudication_decisions"

    decision_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    appeal_id: Mapped[str] = mapped_column(String(120), nullable=False)
    decision: Mapped[str] = mapped_column(String(40), nullable=False)
    decision_reason: Mapped[str] = mapped_column(Text, nullable=False)
    decided_by_ref: Mapped[str] = mapped_column(String(80), nullable=False)
    decided_by_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    decided_at_ref: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
