from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.modules.compliance.core.db import Base
from app.modules.compliance.models.auth import AuditMixin


class IssueProjectReminderEventModel(AuditMixin, Base):
    __tablename__ = "issue_project_reminder_events"

    reminder_event_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    project_id: Mapped[str] = mapped_column(String(120), nullable=False)
    project_title_snapshot: Mapped[str] = mapped_column(String(240), nullable=False)
    target_org_ids: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    target_org_snapshots: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
    )
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    delivery_mode: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    request_id: Mapped[str | None] = mapped_column(String(160), nullable=True)
    idempotency_key: Mapped[str] = mapped_column(String(512), nullable=False, unique=True)
    created_by_ref: Mapped[str] = mapped_column(String(80), nullable=False)
    created_by_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    event_created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notification_ids: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    result_summary: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
