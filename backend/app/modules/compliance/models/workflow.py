from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.modules.compliance.core.db import Base
from app.modules.compliance.models.auth import AuditMixin


class WorkflowTemplateModel(AuditMixin, Base):
    __tablename__ = "workflow_templates"

    template_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    name: Mapped[str] = mapped_column(String(240), nullable=False)
    domain: Mapped[str] = mapped_column(String(40), nullable=False)
    scope_mode: Mapped[str] = mapped_column(String(60), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    schema_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    chains_json: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)
    created_by_ref: Mapped[str] = mapped_column(String(80), nullable=False)
    updated_by_ref: Mapped[str] = mapped_column(String(80), nullable=False)
    current_version_id: Mapped[str | None] = mapped_column(String(140), nullable=True)
    last_validation_summary: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
    )


class WorkflowTemplateVersionModel(AuditMixin, Base):
    __tablename__ = "workflow_template_versions"

    template_version_id: Mapped[str] = mapped_column(String(140), primary_key=True)
    template_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("workflow_templates.template_id"),
        nullable=False,
    )
    version_no: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    snapshot_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    snapshot_hash: Mapped[str] = mapped_column(String(80), nullable=False)
    target_scope_snapshot: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
    )
    published_by_ref: Mapped[str] = mapped_column(String(80), nullable=False)
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class WorkflowTemplateAuditEventModel(AuditMixin, Base):
    __tablename__ = "workflow_template_audit_events"

    audit_event_id: Mapped[str] = mapped_column(String(140), primary_key=True)
    template_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("workflow_templates.template_id"),
        nullable=False,
    )
    event_type: Mapped[str] = mapped_column(String(60), nullable=False)
    actor_user_id: Mapped[str] = mapped_column(String(80), nullable=False)
    actor_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    template_version_id: Mapped[str | None] = mapped_column(String(140), nullable=True)
    snapshot_hash: Mapped[str | None] = mapped_column(String(80), nullable=True)
    route_summary: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    target_scope_snapshot: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
    )
    validation_summary: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    event_created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
