from datetime import date, datetime
from typing import Any

from sqlalchemy import Date, DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, synonym

from app.modules.compliance.core.db import Base
from app.modules.compliance.models.auth import AuditMixin


class EvidenceRequirementModel(AuditMixin, Base):
    __tablename__ = "evidence_requirements"

    requirement_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    inspection_plan_id: Mapped[str] = mapped_column(String(120), nullable=False)
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    required_tags: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    target_org_ids: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    target_org_snapshots: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB, nullable=True)


from app.core.database import CommonBase


class FileAssetModel(AuditMixin, CommonBase):
    __tablename__ = "file_assets"

    id = synonym('file_id')
    filename = synonym('file_name')
    owner_id = synonym('uploaded_by_ref')
    org_id: Mapped[str] = mapped_column(String(80), default='')
    file_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    file_name: Mapped[str] = mapped_column(String(500), nullable=False)
    content_type: Mapped[str] = mapped_column(String(160), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_key: Mapped[str] = mapped_column(String(1000), nullable=False)
    checksum: Mapped[str] = mapped_column(String(128), nullable=False)
    uploaded_by_ref: Mapped[str] = mapped_column(String(80), nullable=False)
    uploaded_by_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    uploaded_at_ref: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    scan_status: Mapped[str] = mapped_column(String(40), nullable=False)


class EvidenceSubmissionModel(AuditMixin, Base):
    __tablename__ = "evidence_submissions"

    evidence_submission_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    requirement_id: Mapped[str] = mapped_column(String(120), nullable=False)
    inspection_plan_id: Mapped[str] = mapped_column(String(120), nullable=False)
    branch_id: Mapped[str] = mapped_column(String(120), nullable=False)
    branch_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    file_ids: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    submitted_by_ref: Mapped[str] = mapped_column(String(80), nullable=False)
    submitted_by_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    submitted_at_ref: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    hq_feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    related_issue_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    reviewed_by_ref: Mapped[str | None] = mapped_column(String(80), nullable=True)
    reviewed_by_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    reviewed_at_ref: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    review_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    review_idempotency_key: Mapped[str | None] = mapped_column(String(160), nullable=True)


class WorkingPaperModel(AuditMixin, Base):
    __tablename__ = "working_papers"

    working_paper_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    inspection_plan_id: Mapped[str] = mapped_column(String(120), nullable=False)
    paper_code: Mapped[str] = mapped_column(String(120), nullable=False)
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    category: Mapped[str] = mapped_column(String(120), nullable=False)
    inspector_user_id: Mapped[str] = mapped_column(String(80), nullable=False)
    inspector_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    guidelines: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    procedure: Mapped[str] = mapped_column(Text, nullable=False)
    result: Mapped[str] = mapped_column(String(80), nullable=False)
    execution_record: Mapped[str] = mapped_column(Text, nullable=False)
    file_ids: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    evidence_list: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    converted_issue_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    related_issue_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    update_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    extra_metadata: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
