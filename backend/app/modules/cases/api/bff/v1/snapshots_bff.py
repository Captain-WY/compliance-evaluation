"""Snapshots BFF Router (2.S19).

挂载路径: POST /api/bff/v1/snapshots/*

端点:
  POST /snapshots/list          快照列表（分页）
  POST /snapshots/detail        快照详情
  POST /snapshots/download-url  快照下载 URL（预签名，15分钟有效）
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ....core.database import get_db
from ....core.deps import get_current_user, get_storage
from ....models.sys_users import SysUser
from ....providers.storage import IStorageProvider
from ....schemas.dashboard import (
    SnapshotDetailRequest,
    SnapshotDetailResponse,
    SnapshotDownloadUrlRequest,
    SnapshotDownloadUrlResponse,
    SnapshotListRequest,
    SnapshotListResponse,
)
from ....services import snapshot_bff_service

router = APIRouter()


@router.post("/list", response_model=SnapshotListResponse)
async def list_snapshots(
    body: SnapshotListRequest,
    db: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
) -> SnapshotListResponse:
    return await snapshot_bff_service.list_snapshots(
        req=body,
        tenant_id=current_user.tenant_id,
        db=db,
    )


@router.post("/detail", response_model=SnapshotDetailResponse)
async def get_snapshot_detail(
    body: SnapshotDetailRequest,
    db: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
) -> SnapshotDetailResponse:
    return await snapshot_bff_service.get_snapshot_detail(
        req=body,
        tenant_id=current_user.tenant_id,
        db=db,
    )


@router.post("/download-url", response_model=SnapshotDownloadUrlResponse)
async def get_download_url(
    body: SnapshotDownloadUrlRequest,
    db: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
    storage: IStorageProvider = Depends(get_storage),
) -> SnapshotDownloadUrlResponse:
    return await snapshot_bff_service.get_download_url(
        req=body,
        tenant_id=current_user.tenant_id,
        db=db,
        storage=storage,
    )
