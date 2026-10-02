"""外部律师管理 BFF 路由 (2.S17).

挂载路径: POST /api/bff/v1/lawyers/*
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ....core.database import get_db
from ....core.deps import get_current_user
from ....models.sys_users import SysUser
from ....schemas.common import StandardResponse
from ....schemas.vendors import (
    LawyerListRequest, LawyerListResponse,
    LawyerDetailRequest, LawyerDetailResponse,
    LawyerCreateRequest, LawyerCreateResponse,
    LawyerUpdateRequest, LawyerUpdateResponse,
)
from ....services import lawyer_service

router = APIRouter(tags=["BFF - 外部律师管理"])


@router.post("/list", response_model=StandardResponse[LawyerListResponse])
async def list_lawyers(
    req: LawyerListRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await lawyer_service.list_lawyers(db, req=req, tenant_id=current_user.tenant_id)
    return StandardResponse(code=200, message="获取成功", data=data)


@router.post("/detail", response_model=StandardResponse[LawyerDetailResponse])
async def get_lawyer_detail(
    req: LawyerDetailRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await lawyer_service.get_lawyer_detail(db, lawyer_id=req.lawyerId, tenant_id=current_user.tenant_id)
    return StandardResponse(code=200, message="获取成功", data=data)


@router.post("/create", response_model=StandardResponse[LawyerCreateResponse])
async def create_lawyer(
    req: LawyerCreateRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await lawyer_service.create_lawyer(
        db, req=req, tenant_id=current_user.tenant_id, operator_id=current_user.id
    )
    return StandardResponse(code=200, message="创建成功", data=data)


@router.post("/update", response_model=StandardResponse[LawyerUpdateResponse])
async def update_lawyer(
    req: LawyerUpdateRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await lawyer_service.update_lawyer(
        db, req=req, tenant_id=current_user.tenant_id, operator_id=current_user.id
    )
    return StandardResponse(code=200, message="更新成功", data=data)
