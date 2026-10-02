"""律所管理 BFF 路由 (2.S17).

挂载路径: POST /api/bff/v1/vendors/*
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ....core.database import get_db
from ....core.deps import get_current_user
from ....models.sys_users import SysUser
from ....schemas.common import StandardResponse
from ....schemas.vendors import (
    VendorListRequest, VendorListResponse,
    VendorDetailRequest, VendorDetailResponse,
    VendorCreateRequest, VendorCreateResponse,
    VendorUpdateRequest, VendorUpdateResponse,
    VendorToggleRequest, VendorToggleResponse,
    VendorCasesRequest, VendorCasesResponse,
)
from ....services import vendor_service

router = APIRouter(tags=["BFF - 律所管理"])


@router.post("/list", response_model=StandardResponse[VendorListResponse])
async def list_vendors(
    req: VendorListRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await vendor_service.list_vendors(db, req=req, tenant_id=current_user.tenant_id)
    return StandardResponse(code=200, message="获取成功", data=data)


@router.post("/detail", response_model=StandardResponse[VendorDetailResponse])
async def get_vendor_detail(
    req: VendorDetailRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await vendor_service.get_vendor_detail(db, firm_id=req.firmId, tenant_id=current_user.tenant_id)
    return StandardResponse(code=200, message="获取成功", data=data)


@router.post("/create", response_model=StandardResponse[VendorCreateResponse])
async def create_vendor(
    req: VendorCreateRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await vendor_service.create_vendor(
        db, req=req, tenant_id=current_user.tenant_id, operator_id=current_user.id
    )
    return StandardResponse(code=200, message="创建成功", data=data)


@router.post("/update", response_model=StandardResponse[VendorUpdateResponse])
async def update_vendor(
    req: VendorUpdateRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await vendor_service.update_vendor(
        db, req=req, tenant_id=current_user.tenant_id, operator_id=current_user.id
    )
    return StandardResponse(code=200, message="更新成功", data=data)


@router.post("/toggle", response_model=StandardResponse[VendorToggleResponse])
async def toggle_vendor(
    req: VendorToggleRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await vendor_service.toggle_vendor(
        db, req=req, tenant_id=current_user.tenant_id, operator_id=current_user.id
    )
    return StandardResponse(code=200, message="操作成功", data=data)


@router.post("/cases", response_model=StandardResponse[VendorCasesResponse])
async def list_vendor_cases(
    req: VendorCasesRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await vendor_service.list_vendor_cases(db, req=req, tenant_id=current_user.tenant_id)
    return StandardResponse(code=200, message="获取成功", data=data)
