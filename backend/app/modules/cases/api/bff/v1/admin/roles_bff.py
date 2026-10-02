"""角色管理 BFF 路由 (2.S16).

挂载路径: POST /api/bff/v1/admin/roles/*
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from .....core.database import get_db
from .....core.deps import get_current_user
from .....models.sys_users import SysUser
from .....schemas.common import StandardResponse
from .....schemas.admin.roles import (
    RoleListRequest, RoleListResponse,
    RoleDetailRequest, RoleDetailResponse,
    RoleCreateRequest, RoleCreateResponse,
    RoleUpdateRequest, RoleUpdateResponse,
    RoleDeleteRequest, RoleDeleteResponse,
    RoleToggleRequest, RoleToggleResponse,
)
from .....services import role_service

router = APIRouter(tags=["BFF Admin - 角色管理"])


@router.post("/list", response_model=StandardResponse[RoleListResponse])
async def list_roles(
    req: RoleListRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await role_service.list_roles(db, req=req, tenant_id=current_user.tenant_id)
    return StandardResponse(code=200, message="获取成功", data=data)


@router.post("/detail", response_model=StandardResponse[RoleDetailResponse])
async def get_role_detail(
    req: RoleDetailRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await role_service.get_role_detail(db, role_id=req.roleId, tenant_id=current_user.tenant_id)
    return StandardResponse(code=200, message="获取成功", data=data)


@router.post("/create", response_model=StandardResponse[RoleCreateResponse])
async def create_role(
    req: RoleCreateRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await role_service.create_role(
        db, req=req, tenant_id=current_user.tenant_id, operator_id=current_user.id
    )
    return StandardResponse(code=200, message="创建成功", data=data)


@router.post("/update", response_model=StandardResponse[RoleUpdateResponse])
async def update_role(
    req: RoleUpdateRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await role_service.update_role(
        db, req=req, tenant_id=current_user.tenant_id, operator_id=current_user.id
    )
    return StandardResponse(code=200, message="更新成功", data=data)


@router.post("/delete", response_model=StandardResponse[RoleDeleteResponse])
async def delete_role(
    req: RoleDeleteRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await role_service.delete_role(
        db, role_id=req.roleId, tenant_id=current_user.tenant_id, operator_id=current_user.id
    )
    return StandardResponse(code=200, message="删除成功", data=data)


@router.post("/toggle", response_model=StandardResponse[RoleToggleResponse])
async def toggle_role(
    req: RoleToggleRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await role_service.toggle_role(
        db, req=req, tenant_id=current_user.tenant_id, operator_id=current_user.id
    )
    return StandardResponse(code=200, message="操作成功", data=data)
