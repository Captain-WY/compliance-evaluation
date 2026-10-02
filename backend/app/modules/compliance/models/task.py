from datetime import date, datetime
from typing import Any

from sqlalchemy import Date, DateTime, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.modules.compliance.core.db import Base
from app.modules.compliance.models.auth import AuditMixin


class UnifiedTaskModel(AuditMixin, Base):
    __tablename__ = "unified_tasks"

    task_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    category: Mapped[str] = mapped_column(String(40), nullable=False)
    action_type: Mapped[str] = mapped_column(String(40), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    priority: Mapped[str] = mapped_column(String(40), nullable=False)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    source_id: Mapped[str] = mapped_column(String(120), nullable=False)
    scope: Mapped[str] = mapped_column(String(40), nullable=False)
    scoped_org_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    assigned_user_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    reviewer_role_ids: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    project_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    action_target: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    task_created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
