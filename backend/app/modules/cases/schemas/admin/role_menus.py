"""角色-菜单分配 Schemas (2.S16)."""
from __future__ import annotations

from ..common import BaseSchema


class RoleMenuListRequest(BaseSchema):
    roleId: str


class RoleMenuListResponse(BaseSchema):
    roleId: str
    menuIds: list[str]


class RoleMenuSaveRequest(BaseSchema):
    roleId: str
    menuIds: list[str]


class RoleMenuSaveResponse(BaseSchema):
    roleId: str
    menuCount: int
