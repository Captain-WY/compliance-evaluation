"""菜单管理 BFF 路由 (2.S16).

挂载路径: POST /api/bff/v1/admin/menus/*
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from .....core.database import get_db
from .....core.deps import get_current_user
from .....models.sys_users import SysUser
from .....schemas.common import StandardResponse
from .....schemas.admin.menus import (
    MenuTreeRequest, MenuTreeResponse,
    MenuDetailRequest, MenuDetailResponse,
    MenuCreateRequest, MenuCreateResponse,
    MenuUpdateRequest, MenuUpdateResponse,
    MenuDeleteRequest, MenuDeleteResponse,
)
from .....services import menu_service

router = APIRouter(tags=["BFF Admin - 菜单管理"])


@router.post("/tree", response_model=StandardResponse[MenuTreeResponse])
async def get_menu_tree(
    req: MenuTreeRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await menu_service.get_menu_tree(db, req=req, tenant_id=current_user.tenant_id)
    return StandardResponse(code=200, message="获取成功", data=data)


@router.post("/detail", response_model=StandardResponse[MenuDetailResponse])
async def get_menu_detail(
    req: MenuDetailRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await menu_service.get_menu_detail(db, menu_id=req.menuId, tenant_id=current_user.tenant_id)
    return StandardResponse(code=200, message="获取成功", data=data)


@router.post("/create", response_model=StandardResponse[MenuCreateResponse])
async def create_menu(
    req: MenuCreateRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await menu_service.create_menu(
        db, req=req, tenant_id=current_user.tenant_id, operator_id=current_user.id
    )
    return StandardResponse(code=200, message="创建成功", data=data)


@router.post("/update", response_model=StandardResponse[MenuUpdateResponse])
async def update_menu(
    req: MenuUpdateRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await menu_service.update_menu(
        db, req=req, tenant_id=current_user.tenant_id, operator_id=current_user.id
    )
    return StandardResponse(code=200, message="更新成功", data=data)


@router.post("/delete", response_model=StandardResponse[MenuDeleteResponse])
async def delete_menu(
    req: MenuDeleteRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await menu_service.delete_menu(
        db, menu_id=req.menuId, tenant_id=current_user.tenant_id, operator_id=current_user.id
    )
    return StandardResponse(code=200, message="删除成功", data=data)
