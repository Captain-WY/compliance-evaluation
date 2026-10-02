from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class WorkflowTemplateDraftUpdateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    name: str | None = None
    scope_mode: str | None = Field(default=None, alias="scopeMode")
    chains: list[dict[str, Any]] | None = None
