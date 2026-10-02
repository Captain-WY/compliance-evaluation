"""智能收件箱 BFF Schemas (2.S15)."""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


# --------------------------------------------------------------------------- #
# Shared                                                                       #
# --------------------------------------------------------------------------- #

class InboxEmailItem(BaseModel):
    email_id: str
    subject: str
    sender_address: str
    sender_name: str | None
    received_at: datetime
    has_attachments: bool
    is_read: bool
    processing_status: str
    processing_status_name: str
    ai_summary: str | None
    ai_recommendation: str | None
    ai_recommendation_name: str | None
    ai_tags: list[str]


class InboxEmailDetail(BaseModel):
    email_id: str
    subject: str
    sender_address: str
    sender_name: str | None
    recipient_to: str | None
    recipient_cc: str | None
    received_at: datetime
    has_attachments: bool
    body_html: str | None
    body_text: str | None
    is_read: bool
    processing_status: str
    processing_status_name: str
    ai_summary: str | None
    ai_recommendation: str | None
    ai_recommendation_name: str | None
    ai_tags: list[str]
    processed_by: str | None
    processed_at: datetime | None


# --------------------------------------------------------------------------- #
# /inbox/emails/list                                                           #
# --------------------------------------------------------------------------- #

class InboxEmailListRequest(BaseModel):
    processing_status: str | None = None
    is_read: bool | None = None
    ai_recommendation: str | None = None
    keyword: str | None = None
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=200)


class InboxEmailListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    unread_count: int
    items: list[InboxEmailItem]


# --------------------------------------------------------------------------- #
# /inbox/emails/detail                                                         #
# --------------------------------------------------------------------------- #

class InboxEmailDetailRequest(BaseModel):
    email_id: str


# --------------------------------------------------------------------------- #
# /inbox/emails/mark-read                                                      #
# --------------------------------------------------------------------------- #

class InboxEmailMarkReadRequest(BaseModel):
    email_id: str


class InboxEmailMarkReadResponse(BaseModel):
    email_id: str
    is_read: bool


# --------------------------------------------------------------------------- #
# /inbox/emails/convert-to-clue                                               #
# --------------------------------------------------------------------------- #

class InboxEmailConvertToClueRequest(BaseModel):
    email_id: str
    clue_title: str | None = None
    description: str | None = None
    assignee_id: str | None = None
    estimated_amount: Decimal | None = None
    opponent_name: str | None = None


class InboxEmailConvertToClueResponse(BaseModel):
    email_id: str
    clue_id: str
    clue_title: str
    processing_status: str


# --------------------------------------------------------------------------- #
# /inbox/emails/link-to-case                                                   #
# --------------------------------------------------------------------------- #

class InboxEmailLinkToCaseRequest(BaseModel):
    email_id: str
    case_id: str
    note: str | None = None


class InboxEmailLinkToCaseResponse(BaseModel):
    email_id: str
    case_id: str
    processing_status: str


# --------------------------------------------------------------------------- #
# /inbox/emails/ignore                                                         #
# --------------------------------------------------------------------------- #

class InboxEmailIgnoreRequest(BaseModel):
    email_id: str
    reason: str | None = None


class InboxEmailIgnoreResponse(BaseModel):
    email_id: str
    processing_status: str
