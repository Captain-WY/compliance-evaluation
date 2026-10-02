"""统一审批 BFF 路由 (2.S18).

挂载前缀: /api/bff/v1/approvals
全 POST。
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ....core.database import get_db
from ....core.deps import get_current_user
from ....models.sys_users import SysUser
from ....schemas.notifications import (
    ApprovalCreateRequest,
    ApprovalMyTodosRequest,
    ApprovalDetailRequest,
    ApprovalProcessRequest,
    ApprovalCancelRequest,
)
from ....services import approval_service

router = APIRouter()


@router.post("/create")
async def create_approval(
    req: ApprovalCreateRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await approval_service.create_approval(
        req=req,
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        db=db,
    )
    return {"code": 200, "message": "审批已发起", "data": data.model_dump()}


@router.post("/my-todos")
async def get_my_todos(
    req: ApprovalMyTodosRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await approval_service.get_my_todos(
        req=req,
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        db=db,
    )
    return {"code": 200, "message": "获取成功", "data": data.model_dump()}


@router.post("/detail")
async def get_approval_detail(
    req: ApprovalDetailRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await approval_service.get_approval_detail(
        req=req,
        tenant_id=current_user.tenant_id,
        db=db,
    )
    return {"code": 200, "message": "获取成功", "data": data.model_dump()}


@router.post("/process")
async def process_approval(
    req: ApprovalProcessRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await approval_service.process_approval(
        req=req,
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        db=db,
    )
    return {"code": 200, "message": "审批完成", "data": data.model_dump()}


@router.post("/cancel")
async def cancel_approval(
    req: ApprovalCancelRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await approval_service.cancel_approval(
        req=req,
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        db=db,
    )
    return {"code": 200, "message": "审批已撤销", "data": data.model_dump()}
