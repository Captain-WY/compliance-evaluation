"""Dashboard BFF Router (2.S19).

挂载路径: POST /api/bff/v1/dashboard/*

端点:
  POST /dashboard/metrics   工作台核心指标（实时聚合）
  POST /dashboard/alerts    风险雷达预警列表
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ....core.database import get_db
from ....core.deps import get_current_user
from ....models.sys_users import SysUser
from ....schemas.dashboard import (
    DashboardAlertsRequest,
    DashboardAlertsResponse,
    DashboardMetricsRequest,
    DashboardMetricsResponse,
)
from ....services import dashboard_service

router = APIRouter()


@router.post("/metrics", response_model=DashboardMetricsResponse)
async def get_metrics(
    body: DashboardMetricsRequest,
    db: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
) -> DashboardMetricsResponse:
    return await dashboard_service.get_metrics(
        req=body,
        tenant_id=current_user.tenant_id,
        db=db,
    )


@router.post("/alerts", response_model=DashboardAlertsResponse)
async def get_alerts(
    body: DashboardAlertsRequest,
    db: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
) -> DashboardAlertsResponse:
    return await dashboard_service.get_alerts(
        req=body,
        tenant_id=current_user.tenant_id,
        db=db,
    )
