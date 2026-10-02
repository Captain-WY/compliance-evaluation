"""Vendor Portal BFF Router (2.S19).

挂载路径: POST /api/bff/v1/vendor-portal/*

端点:
  POST /vendor-portal/summary         外部律师总览（案件数 + 任务统计）
  POST /vendor-portal/tasks/list      我的任务列表（状态映射 TODO→PENDING）
  POST /vendor-portal/tasks/submit    提交任务（DONE + 附件注册）
  POST /vendor-portal/tasks/detail    任务详情（含附件列表）

所有端点均需先通过 _get_lawyer 反查 ExternalLawyer（5530 若未找到）。
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ....core.database import get_db
from ....core.deps import get_current_user
from ....models.sys_users import SysUser
from ....schemas.dashboard import (
    VendorSummaryRequest,
    VendorSummaryResponse,
    VendorTaskDetailRequest,
    VendorTaskDetailResponse,
    VendorTaskListRequest,
    VendorTaskListResponse,
    VendorTaskSubmitRequest,
    VendorTaskSubmitResponse,
)
from ....services import vendor_portal_service

router = APIRouter()


@router.post("/summary", response_model=VendorSummaryResponse)
async def get_summary(
    body: VendorSummaryRequest,
    db: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
) -> VendorSummaryResponse:
    return await vendor_portal_service.get_summary(
        req=body,
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        db=db,
    )


@router.post("/tasks/list", response_model=VendorTaskListResponse)
async def list_tasks(
    body: VendorTaskListRequest,
    db: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
) -> VendorTaskListResponse:
    return await vendor_portal_service.list_tasks(
        req=body,
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        db=db,
    )


@router.post("/tasks/submit", response_model=VendorTaskSubmitResponse)
async def submit_task(
    body: VendorTaskSubmitRequest,
    db: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
) -> VendorTaskSubmitResponse:
    return await vendor_portal_service.submit_task(
        req=body,
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        db=db,
    )


@router.post("/tasks/detail", response_model=VendorTaskDetailResponse)
async def get_task_detail(
    body: VendorTaskDetailRequest,
    db: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
) -> VendorTaskDetailResponse:
    return await vendor_portal_service.get_task_detail(
        req=body,
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        db=db,
    )

from pydantic import BaseModel, ConfigDict, Field


class VendorMyCasesRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, alias="pageSize", ge=1, le=100)


@router.post("/my-cases")
async def my_cases(
    body: VendorMyCasesRequest,
    db: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
) -> dict:
    return await vendor_portal_service.list_my_cases(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        page=body.page,
        page_size=body.page_size,
        db=db,
    )
