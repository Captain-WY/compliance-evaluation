"""用户-角色分配 BFF 路由 (2.S16).

挂载路径: POST /api/bff/v1/admin/user-roles/*
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from .....core.database import get_db
from .....core.deps import get_current_user
from .....models.sys_users import SysUser
from .....schemas.common import StandardResponse
from .....schemas.admin.user_roles import (
    UserRoleListRequest, UserRoleListResponse,
    UserRoleSaveRequest, UserRoleSaveResponse,
)
from .....services import user_role_service

router = APIRouter(tags=["BFF Admin - 用户角色分配"])


@router.post("/list", response_model=StandardResponse[UserRoleListResponse])
async def list_user_roles(
    req: UserRoleListRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await user_role_service.list_user_roles(db, req=req, tenant_id=current_user.tenant_id)
    return StandardResponse(code=200, message="获取成功", data=data)


@router.post("/save", response_model=StandardResponse[UserRoleSaveResponse])
async def save_user_roles(
    req: UserRoleSaveRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await user_role_service.save_user_roles(
        db, req=req, tenant_id=current_user.tenant_id, operator_id=current_user.id
    )
    return StandardResponse(code=200, message="保存成功", data=data)
