"""角色管理 Schemas (2.S16)."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import Field

from ..common import BaseSchema


class RoleListRequest(BaseSchema):
    status: Optional[str] = Field(None, description="ACTIVE | INACTIVE | null=全部")
    keyword: Optional[str] = Field(None, description="角色名/code 模糊搜索")
    page: int = Field(1, ge=1)
    pageSize: int = Field(20, ge=1, le=200)


class RoleListItem(BaseSchema):
    roleId: str
    roleCode: str
    roleName: str
    description: Optional[str] = None
    status: str
    statusName: str
    userCount: int = 0


class RoleListResponse(BaseSchema):
    total: int
    page: int
    pageSize: int
    items: list[RoleListItem]


class RoleDetailRequest(BaseSchema):
    roleId: str


class RoleDetailResponse(BaseSchema):
    roleId: str
    roleCode: str
    roleName: str
    description: Optional[str] = None
    status: str
    statusName: str
    createdAt: Optional[datetime] = None
    updatedAt: Optional[datetime] = None


class RoleCreateRequest(BaseSchema):
    roleCode: str = Field(..., min_length=1, max_length=64)
    roleName: str = Field(..., min_length=1, max_length=128)
    description: Optional[str] = Field(None, max_length=500)


class RoleCreateResponse(BaseSchema):
    roleId: str
    roleCode: str
    roleName: str
    status: str


class RoleUpdateRequest(BaseSchema):
    roleId: str
    roleName: str = Field(..., min_length=1, max_length=128)
    description: Optional[str] = Field(None, max_length=500)


class RoleUpdateResponse(BaseSchema):
    roleId: str
    updatedAt: datetime


class RoleDeleteRequest(BaseSchema):
    roleId: str


class RoleDeleteResponse(BaseSchema):
    roleId: str
    deleted: bool


class RoleToggleRequest(BaseSchema):
    roleId: str
    targetStatus: str = Field(..., description="ACTIVE | INACTIVE")


class RoleToggleResponse(BaseSchema):
    roleId: str
    status: str
    statusName: str
