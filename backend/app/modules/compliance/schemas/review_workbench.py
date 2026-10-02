from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class UnifiedReviewSaveRequest(BaseModel):
    comment: str | None = None
    version: int | None = Field(default=None, ge=1)

    model_config = {"populate_by_name": True}


class UnifiedReviewDecisionRequest(BaseModel):
    decision: str = Field(min_length=1)
    reason: str | None = None
    comment: str | None = None
    version: int | None = Field(default=None, ge=1)
    request_id: str | None = Field(default=None, alias="requestId")
    idempotency_key: str | None = Field(default=None, alias="idempotencyKey")

    model_config = {"populate_by_name": True}


class UnifiedReviewBatchDecisionItemRequest(BaseModel):
    review_task_id: str = Field(alias="reviewTaskId", min_length=1)
    version: int | None = Field(default=None, ge=1)
    comment: str | None = None
    request_id: str | None = Field(default=None, alias="requestId")
    idempotency_key: str | None = Field(default=None, alias="idempotencyKey")

    model_config = {"populate_by_name": True}

    def as_store_payload(self) -> dict[str, Any]:
        return self.model_dump(by_alias=True, exclude_none=True)


class UnifiedReviewBatchDecisionRequest(BaseModel):
    items: list[UnifiedReviewBatchDecisionItemRequest] = Field(min_length=1)
    decision: str = Field(min_length=1)
    reason: str | None = None
    request_id: str | None = Field(default=None, alias="requestId")

    model_config = {"populate_by_name": True}

