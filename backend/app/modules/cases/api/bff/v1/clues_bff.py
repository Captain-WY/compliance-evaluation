"""线索管理 BFF Router (2.S15).

挂载路径: POST /api/bff/v1/clues/*

端点:
  POST /clues/list              线索列表（分页 + 状态/来源过滤）
  POST /clues/detail            线索详情
  POST /clues/create            新建线索
  POST /clues/update            更新线索基础信息
  POST /clues/assign            分配跟进人
  POST /clues/close             关闭线索（REJECTED / CLOSED）
  POST /clues/prepare-for-case  只读预填：线索信息→新建案件表单
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ....core.database import get_db
from ....core.deps import get_current_user
from ....models.sys_users import SysUser
from ....schemas.clues import (
    ClueAssignRequest,
    ClueAssignResponse,
    ClueCloseRequest,
    ClueCloseResponse,
    ClueCreateRequest,
    ClueCreateResponse,
    ClueDetailRequest,
    ClueDetail,
    ClueListRequest,
    ClueListResponse,
    CluePrepareForCaseRequest,
    CluePrepareForCaseResponse,
    ClueUpdateRequest,
    ClueUpdateResponse,
)
from ....services import clue_service

router = APIRouter()


@router.post("/list", response_model=ClueListResponse)
async def list_clues(
    body: ClueListRequest,
    db: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
):
    result = await clue_service.list_clues(
        db,
        tenant_id=current_user.tenant_id,
        status=body.status,
        source_type=body.source_type,
        assignee_id=body.assignee_id,
        keyword=body.keyword,
        page=body.page,
        page_size=body.page_size,
    )
    return result


@router.post("/detail", response_model=ClueDetail)
async def get_clue_detail(
    body: ClueDetailRequest,
    db: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
):
    return await clue_service.get_clue(db, clue_id=body.clue_id, tenant_id=current_user.tenant_id)


@router.post("/create", response_model=ClueCreateResponse)
async def create_clue(
    body: ClueCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
):
    return await clue_service.create_clue(
        db,
        tenant_id=current_user.tenant_id,
        operator=current_user,
        clue_title=body.clue_title,
        description=body.description,
        source_type=body.source_type,
        source_id=body.source_id,
        business_line=body.business_line,
        estimated_amount=body.estimated_amount,
        currency=body.currency,
        opponent_name=body.opponent_name,
        assignee_id=body.assignee_id,
    )


@router.post("/update", response_model=ClueUpdateResponse)
async def update_clue(
    body: ClueUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
):
    return await clue_service.update_clue(
        db,
        tenant_id=current_user.tenant_id,
        operator=current_user,
        clue_id=body.clue_id,
        clue_title=body.clue_title,
        description=body.description,
        business_line=body.business_line,
        estimated_amount=body.estimated_amount,
        currency=body.currency,
        opponent_name=body.opponent_name,
    )


@router.post("/assign", response_model=ClueAssignResponse)
async def assign_clue(
    body: ClueAssignRequest,
    db: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
):
    return await clue_service.assign_clue(
        db,
        tenant_id=current_user.tenant_id,
        operator=current_user,
        clue_id=body.clue_id,
        assignee_id=body.assignee_id,
    )


@router.post("/close", response_model=ClueCloseResponse)
async def close_clue(
    body: ClueCloseRequest,
    db: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
):
    return await clue_service.close_clue(
        db,
        tenant_id=current_user.tenant_id,
        operator=current_user,
        clue_id=body.clue_id,
        target_status=body.target_status,
        closed_reason=body.closed_reason,
    )


@router.post("/prepare-for-case", response_model=CluePrepareForCaseResponse)
async def prepare_for_case(
    body: CluePrepareForCaseRequest,
    db: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
):
    return await clue_service.prepare_for_case(
        db,
        tenant_id=current_user.tenant_id,
        clue_id=body.clue_id,
    )
