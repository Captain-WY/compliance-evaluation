from sqlalchemy import Column, String, Boolean, Text, DateTime
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import validates

from app.modules.cases.core.database import Base
from app.modules.cases.enums.case_enums import AiRecommendation, InboxEmailProcessingStatus

from .base import TenantMixin


class InboxEmail(TenantMixin, Base):
    __tablename__ = "inbox_emails"

    message_id = Column(String(255), nullable=False)
    sender_address = Column(String(255), nullable=False)
    sender_name = Column(String(128), nullable=True)
    recipient_to = Column(Text, nullable=True)
    recipient_cc = Column(Text, nullable=True)
    subject = Column(String(512), nullable=False)
    received_at = Column(DateTime(timezone=True), nullable=False)
    has_attachments = Column(Boolean, default=False, nullable=True)
    body_text = Column(Text, nullable=True)
    body_html = Column(Text, nullable=True)
    ai_summary = Column(Text, nullable=True)
    ai_recommendation = Column(String(64), nullable=True)
    ai_tags = Column(JSONB, nullable=True)
    is_read = Column(Boolean, default=False, nullable=True)
    processing_status = Column(
        String(32),
        default=InboxEmailProcessingStatus.UNPROCESSED.value,
        nullable=True,
    )
    processed_by = Column(String(36), nullable=True)
    processed_at = Column(DateTime(timezone=True), nullable=True)

    # ---- 2.S15-PRE Enum 校验 ----

    @validates("processing_status")
    def _validate_processing_status(self, _key: str, value: str | None) -> str | None:
        if value is None:
            return value
        allowed = {e.value for e in InboxEmailProcessingStatus}
        if value not in allowed:
            raise ValueError(
                f"processing_status={value!r} not in InboxEmailProcessingStatus. allowed={sorted(allowed)}"
            )
        return value

    @validates("ai_recommendation")
    def _validate_ai_recommendation(self, _key: str, value: str | None) -> str | None:
        if value is None:
            return value
        allowed = {e.value for e in AiRecommendation}
        if value not in allowed:
            raise ValueError(
                f"ai_recommendation={value!r} not in AiRecommendation. allowed={sorted(allowed)}"
            )
        return value
