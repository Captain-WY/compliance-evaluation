"""角色-菜单分配 BFF 路由 (2.S16).

挂载路径: POST /api/bff/v1/admin/role-menus/*
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from .....core.database import get_db
from .....core.deps import get_current_user
from .....models.sys_users import SysUser
from .....schemas.common import StandardResponse
from .....schemas.admin.role_menus import (
    RoleMenuListRequest, RoleMenuListResponse,
    RoleMenuSaveRequest, RoleMenuSaveResponse,
)
from .....services import role_menu_service

router = APIRouter(tags=["BFF Admin - 角色菜单分配"])


@router.post("/list", response_model=StandardResponse[RoleMenuListResponse])
async def list_role_menus(
    req: RoleMenuListRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await role_menu_service.list_role_menus(db, req=req, tenant_id=current_user.tenant_id)
    return StandardResponse(code=200, message="获取成功", data=data)


@router.post("/save", response_model=StandardResponse[RoleMenuSaveResponse])
async def save_role_menus(
    req: RoleMenuSaveRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await role_menu_service.save_role_menus(
        db, req=req, tenant_id=current_user.tenant_id, operator_id=current_user.id
    )
    return StandardResponse(code=200, message="保存成功", data=data)
