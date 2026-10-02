from typing import Any

from pydantic import BaseModel, Field


class SuccessEnvelope(BaseModel):
    data: Any
    request_id: str = Field(alias="requestId")


class ErrorDetail(BaseModel):
    field: str
    reason: str


class ErrorEnvelope(BaseModel):
    code: str
    message: str
    details: list[ErrorDetail] | dict[str, Any] | None = None
    request_id: str = Field(alias="requestId")
