from datetime import date, datetime
from typing import Any

from sqlalchemy import Date, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.modules.compliance.core.db import Base
from app.modules.compliance.models.auth import AuditMixin


class InspectionPlanModel(AuditMixin, Base):
    __tablename__ = "inspection_plans"

    inspection_plan_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    runtime_state: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    inspect_code: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    type: Mapped[str] = mapped_column(String(80), nullable=False)
    frequency: Mapped[str] = mapped_column(String(80), nullable=False)
    confidentiality_level: Mapped[str | None] = mapped_column(String(40), nullable=True)
    target_org_ids: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    target_dept_label: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    target_org_snapshots: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB, nullable=True)
    leader_user_id: Mapped[str] = mapped_column(String(80), nullable=False)
    leader_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    team_member_user_ids: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    team_member_snapshots: Mapped[list[dict[str, Any]] | None] = mapped_column(
        JSONB,
        nullable=True,
    )
    planned_start_date: Mapped[date] = mapped_column(Date, nullable=False)
    planned_end_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    phase: Mapped[str] = mapped_column(String(80), nullable=False)
    phase_progress: Mapped[int] = mapped_column(nullable=False, default=0)
    files: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)
    ekp_flow: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    previous_status: Mapped[str | None] = mapped_column(String(40), nullable=True)
    previous_phase: Mapped[str | None] = mapped_column(String(80), nullable=True)
    created_by_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    updated_by_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)


class IntegrationEventModel(AuditMixin, Base):
    __tablename__ = "integration_events"

    integration_event_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    type: Mapped[str] = mapped_column(String(80), nullable=False)
    target_type: Mapped[str] = mapped_column(String(80), nullable=False)
    target_id: Mapped[str] = mapped_column(String(120), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    created_by_ref: Mapped[str] = mapped_column(String(80), nullable=False)
    created_by_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    event_created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    external_ref: Mapped[str | None] = mapped_column(Text, nullable=True)


class InspectionPlanAcknowledgementModel(AuditMixin, Base):
    __tablename__ = "inspection_plan_acknowledgements"
    __table_args__ = (
        UniqueConstraint(
            "inspection_plan_id",
            "target_org_id",
            name="uq_inspection_plan_ack_plan_org",
        ),
        Index(
            "ix_inspection_plan_ack_plan_id",
            "inspection_plan_id",
        ),
    )

    acknowledgement_id: Mapped[str] = mapped_column(String(140), primary_key=True)
    inspection_plan_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("inspection_plans.inspection_plan_id"),
        nullable=False,
    )
    target_org_id: Mapped[str] = mapped_column(String(80), nullable=False)
    ack_status: Mapped[str] = mapped_column(String(40), nullable=False, default="ACKNOWLEDGED")
    acknowledged_by: Mapped[str] = mapped_column(String(80), nullable=False)
    acknowledged_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    liaison_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    liaison_phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    liaison_title: Mapped[str | None] = mapped_column(String(80), nullable=True)
    created_by_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)


class InspectionReportVersionModel(AuditMixin, Base):
    __tablename__ = "inspection_report_versions"
    __table_args__ = (
        UniqueConstraint(
            "inspection_plan_id",
            "version_no",
            name="uq_inspection_report_versions_plan_version",
        ),
        Index(
            "ix_inspection_report_versions_plan_status",
            "inspection_plan_id",
            "status",
        ),
    )

    report_version_id: Mapped[str] = mapped_column(String(140), primary_key=True)
    inspection_plan_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("inspection_plans.inspection_plan_id"),
        nullable=False,
    )
    version_no: Mapped[str] = mapped_column(String(40), nullable=False)
    label: Mapped[str] = mapped_column(String(240), nullable=False)
    method: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    file_asset_id: Mapped[str | None] = mapped_column(
        String(120), nullable=True,
    )
    supporting_file_asset_ids: Mapped[list[str]] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
    )
    source_snapshot_hash: Mapped[str] = mapped_column(String(80), nullable=False)
    source_summary: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    created_by_ref: Mapped[str] = mapped_column(String(80), nullable=False)
    created_by_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    report_created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    released_by_ref: Mapped[str | None] = mapped_column(String(80), nullable=True)
    released_by_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    optimistic_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    idempotency_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    payload_hash: Mapped[str | None] = mapped_column(String(80), nullable=True)


class InspectionReportAuditEventModel(AuditMixin, Base):
    __tablename__ = "inspection_report_audit_events"
    __table_args__ = (
        Index(
            "ix_inspection_report_audit_events_plan_occurred",
            "inspection_plan_id",
            "occurred_at",
        ),
    )

    report_audit_event_id: Mapped[str] = mapped_column(String(140), primary_key=True)
    inspection_plan_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("inspection_plans.inspection_plan_id"),
        nullable=False,
    )
    report_version_id: Mapped[str | None] = mapped_column(
        String(140),
        ForeignKey("inspection_report_versions.report_version_id"),
        nullable=True,
    )
    action: Mapped[str] = mapped_column(String(60), nullable=False)
    actor_user_id: Mapped[str] = mapped_column(String(80))
    actor_org_id: Mapped[str] = mapped_column(String(80))
    actor_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    request_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    payload_hash: Mapped[str | None] = mapped_column(String(80), nullable=True)
    from_status: Mapped[str | None] = mapped_column(String(40), nullable=True)
    to_status: Mapped[str | None] = mapped_column(String(40), nullable=True)
    file_asset_ids: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    details: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)


class InspectionReportCommandKeyModel(AuditMixin, Base):
    __tablename__ = "inspection_report_command_keys"
    __table_args__ = (
        UniqueConstraint(
            "inspection_plan_id",
            "command_type",
            "actor_user_id",
            "idempotency_key",
            name="uq_inspection_report_command_keys_scope",
        ),
    )

    command_key_id: Mapped[str] = mapped_column(String(140), primary_key=True)
    inspection_plan_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("inspection_plans.inspection_plan_id"),
        nullable=False,
    )
    command_type: Mapped[str] = mapped_column(String(60), nullable=False)
    actor_user_id: Mapped[str] = mapped_column(String(80))
    idempotency_key: Mapped[str] = mapped_column(String(512), nullable=False)
    payload_hash: Mapped[str] = mapped_column(String(80), nullable=False)
    result_ref: Mapped[str] = mapped_column(String(160), nullable=False)
    command_created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
