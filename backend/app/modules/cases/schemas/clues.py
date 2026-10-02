"""线索管理 BFF Schemas (2.S15)."""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


# --------------------------------------------------------------------------- #
# Shared                                                                       #
# --------------------------------------------------------------------------- #

class ClueItem(BaseModel):
    clue_id: str
    clue_title: str
    source_type: str
    source_type_name: str
    status: str
    status_name: str
    estimated_amount: Decimal | None
    currency: str | None
    opponent_name: str | None
    assignee_id: str | None
    created_at: datetime


class ClueDetail(BaseModel):
    clue_id: str
    clue_title: str
    description: str | None
    source_type: str
    source_type_name: str
    source_id: str | None
    business_line: str | None
    estimated_amount: Decimal | None
    currency: str | None
    opponent_name: str | None
    status: str
    status_name: str
    assignee_id: str | None
    converted_case_id: str | None
    closed_reason: str | None
    created_at: datetime
    updated_at: datetime


# --------------------------------------------------------------------------- #
# /clues/list                                                                  #
# --------------------------------------------------------------------------- #

class ClueListRequest(BaseModel):
    status: str | None = None
    source_type: str | None = None
    assignee_id: str | None = None
    keyword: str | None = None
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=200)


class ClueListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    items: list[ClueItem]


# --------------------------------------------------------------------------- #
# /clues/detail                                                                #
# --------------------------------------------------------------------------- #

class ClueDetailRequest(BaseModel):
    clue_id: str


# --------------------------------------------------------------------------- #
# /clues/create                                                                #
# --------------------------------------------------------------------------- #

class ClueCreateRequest(BaseModel):
    clue_title: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    source_type: str = Field(..., description="EMAIL/MANUAL/API")
    source_id: str | None = None
    business_line: str | None = None
    estimated_amount: Decimal | None = None
    currency: str | None = "CNY"
    opponent_name: str | None = None
    assignee_id: str | None = None


class ClueCreateResponse(BaseModel):
    clue_id: str
    status: str
    created_at: datetime


# --------------------------------------------------------------------------- #
# /clues/update                                                                #
# --------------------------------------------------------------------------- #

class ClueUpdateRequest(BaseModel):
    clue_id: str
    clue_title: str | None = None
    description: str | None = None
    business_line: str | None = None
    estimated_amount: Decimal | None = None
    currency: str | None = None
    opponent_name: str | None = None


class ClueUpdateResponse(BaseModel):
    clue_id: str
    updated_at: datetime


# --------------------------------------------------------------------------- #
# /clues/assign                                                                #
# --------------------------------------------------------------------------- #

class ClueAssignRequest(BaseModel):
    clue_id: str
    assignee_id: str


class ClueAssignResponse(BaseModel):
    clue_id: str
    assignee_id: str
    status: str


# --------------------------------------------------------------------------- #
# /clues/close                                                                 #
# --------------------------------------------------------------------------- #

class ClueCloseRequest(BaseModel):
    clue_id: str
    target_status: str = Field(..., description="REJECTED 或 CLOSED")
    closed_reason: str | None = None


class ClueCloseResponse(BaseModel):
    clue_id: str
    status: str


# --------------------------------------------------------------------------- #
# /clues/prepare-for-case                                                      #
# --------------------------------------------------------------------------- #

class CluePrepareForCaseRequest(BaseModel):
    clue_id: str


class PrefillData(BaseModel):
    case_name: str
    business_line: str | None
    estimated_amount: Decimal | None
    currency: str | None
    opponent_name: str | None
    source_clue_id: str
    case_type_code: str


class CluePrepareForCaseResponse(BaseModel):
    clue_id: str
    clue_title: str
    prefill_data: PrefillData
