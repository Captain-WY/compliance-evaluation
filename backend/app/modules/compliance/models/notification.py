from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.modules.compliance.core.db import Base
from app.modules.compliance.models.auth import AuditMixin


class NotificationMessageModel(AuditMixin, Base):
    __tablename__ = "notification_messages"

    notification_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    source_module: Mapped[str] = mapped_column(String(40), nullable=False)
    source_entity_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    source_entity_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    type: Mapped[str] = mapped_column(String(40), nullable=False)
    severity: Mapped[str] = mapped_column(String(40), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    action_target: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    created_by_ref: Mapped[str] = mapped_column(String(80), nullable=False)
    notification_created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    extra_metadata: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)


class NotificationRecipientStateModel(AuditMixin, Base):
    __tablename__ = "notification_recipient_states"
    __table_args__ = (
        UniqueConstraint(
            "notification_id",
            "recipient_user_id",
            name="uq_notification_recipient_state_notification_user",
        ),
    )

    recipient_state_id: Mapped[str] = mapped_column(String(140), primary_key=True)
    notification_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("notification_messages.notification_id"),
        nullable=False,
    )
    recipient_user_id: Mapped[str] = mapped_column(
        String(80), nullable=False,
    )
    recipient_org_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    read_state: Mapped[str] = mapped_column(String(40), nullable=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class NotificationDeliveryEventModel(AuditMixin, Base):
    __tablename__ = "notification_delivery_events"

    delivery_event_id: Mapped[str] = mapped_column(String(140), primary_key=True)
    notification_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("notification_messages.notification_id"),
        nullable=False,
    )
    recipient_user_id: Mapped[str] = mapped_column(
        String(80), nullable=False,
    )
    channel: Mapped[str] = mapped_column(String(40), nullable=False)
    delivery_status: Mapped[str] = mapped_column(String(40), nullable=False)
    provider_message_id: Mapped[str | None] = mapped_column(String(160), nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(80), nullable=True)
    attempted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    extra_metadata: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
