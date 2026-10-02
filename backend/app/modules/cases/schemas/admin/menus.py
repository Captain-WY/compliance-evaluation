"""菜单管理 Schemas (2.S16)."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import Field

from ..common import BaseSchema


class MenuTreeRequest(BaseSchema):
    includeButton: bool = Field(True, description="是否包含 BUTTON 节点")


class MenuNode(BaseSchema):
    menuId: str
    menuName: str
    menuType: str
    menuTypeName: str
    sortOrder: Optional[int] = None
    routePath: Optional[str] = None
    component: Optional[str] = None
    icon: Optional[str] = None
    isHidden: bool = False
    permissionKey: Optional[str] = None
    status: str
    children: list[MenuNode] = Field(default_factory=list)


MenuNode.model_rebuild()


class MenuTreeResponse(BaseSchema):
    items: list[MenuNode]


class MenuDetailRequest(BaseSchema):
    menuId: str


class MenuDetailResponse(BaseSchema):
    menuId: str
    parentId: Optional[str] = None
    menuName: str
    menuType: str
    menuTypeName: str
    sortOrder: Optional[int] = None
    routePath: Optional[str] = None
    component: Optional[str] = None
    icon: Optional[str] = None
    isHidden: bool = False
    permissionKey: Optional[str] = None
    status: str
    statusName: str


class MenuCreateRequest(BaseSchema):
    parentId: Optional[str] = None
    menuName: str = Field(..., min_length=1, max_length=128)
    menuType: str = Field(..., description="DIR | MENU | BUTTON")
    sortOrder: Optional[int] = Field(None, ge=0)
    routePath: Optional[str] = Field(None, max_length=255)
    component: Optional[str] = Field(None, max_length=255)
    icon: Optional[str] = Field(None, max_length=64)
    isHidden: bool = False
    permissionKey: Optional[str] = Field(None, max_length=128)


class MenuCreateResponse(BaseSchema):
    menuId: str
    menuName: str
    menuType: str


class MenuUpdateRequest(BaseSchema):
    menuId: str
    menuName: str = Field(..., min_length=1, max_length=128)
    sortOrder: Optional[int] = Field(None, ge=0)
    routePath: Optional[str] = Field(None, max_length=255)
    component: Optional[str] = Field(None, max_length=255)
    icon: Optional[str] = Field(None, max_length=64)
    isHidden: bool = False
    permissionKey: Optional[str] = Field(None, max_length=128)


class MenuUpdateResponse(BaseSchema):
    menuId: str
    updatedAt: datetime


class MenuDeleteRequest(BaseSchema):
    menuId: str


class MenuDeleteResponse(BaseSchema):
    menuId: str
    deleted: bool
