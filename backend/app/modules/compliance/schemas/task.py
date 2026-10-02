from pydantic import BaseModel, Field


class TaskQuery(BaseModel):
    category: str | None = None
    status: str | None = None
    priority: str | None = None
    keyword: str | None = None
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100, alias="pageSize")

    model_config = {"populate_by_name": True}
