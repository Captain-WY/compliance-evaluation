"""用户-角色分配 Schemas (2.S16)."""
from __future__ import annotations

from typing import Optional

from ..common import BaseSchema


class UserRoleListRequest(BaseSchema):
    userId: str


class UserRoleItem(BaseSchema):
    roleId: str
    roleCode: str
    roleName: str
    status: str


class UserRoleListResponse(BaseSchema):
    userId: str
    roles: list[UserRoleItem]


class UserRoleSaveRequest(BaseSchema):
    userId: str
    roleIds: list[str]


class UserRoleSaveResponse(BaseSchema):
    userId: str
    roleCount: int
