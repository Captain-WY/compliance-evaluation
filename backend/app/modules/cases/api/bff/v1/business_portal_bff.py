"""Business Portal BFF Router (2.S19).

挂载路径: POST /api/bff/v1/business-portal/*

端点:
  POST /business-portal/clues/list              我提交的线索列表
  POST /business-portal/evidence-tasks/list     分配给我的取证任务列表
  POST /business-portal/evidence-tasks/submit   提交取证任务
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ....core.database import get_db
from ....core.deps import get_current_user
from ....models.sys_users import SysUser
from ....schemas.dashboard import (
    ClueListRequest,
    ClueListResponse,
    EvidenceTaskListRequest,
    EvidenceTaskListResponse,
    EvidenceTaskSubmitRequest,
    EvidenceTaskSubmitResponse,
)
from ....services import business_portal_service

router = APIRouter()


@router.post("/clues/list", response_model=ClueListResponse)
async def list_my_clues(
    body: ClueListRequest,
    db: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
) -> ClueListResponse:
    return await business_portal_service.list_clues(
        req=body,
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        db=db,
    )


@router.post("/evidence-tasks/list", response_model=EvidenceTaskListResponse)
async def list_evidence_tasks(
    body: EvidenceTaskListRequest,
    db: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
) -> EvidenceTaskListResponse:
    return await business_portal_service.list_evidence_tasks(
        req=body,
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        db=db,
    )


@router.post("/evidence-tasks/submit", response_model=EvidenceTaskSubmitResponse)
async def submit_evidence_task(
    body: EvidenceTaskSubmitRequest,
    db: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
) -> EvidenceTaskSubmitResponse:
    return await business_portal_service.submit_evidence_task(
        req=body,
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        db=db,
    )
