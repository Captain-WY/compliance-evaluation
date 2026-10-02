"""资产保全台账 BFF Router (切片 2.S12).

挂载路径: `/api/bff/v1/assets` (见 main.py)

7 端点 (全部 POST):
    1. POST /preservations/list          — 列表查询 (含跨案全租户)
    2. POST /preservations/detail        — 单条详情
    3. POST /preservations/create        — 新建保全 (写, OWNER/CO_COUNSEL)
    4. POST /preservations/extend        — 续期 (写, D1=A 就地更新)
    5. POST /preservations/release       — 解除 (写, D3=A 非强制文书)
    6. POST /preservations/realize       — 变现 (写, D4=B 强制创建 RECOVERY 流水)
    7. POST /preservations/expiry-alerts — 到期预警看板 (D5=A 单端点)

权限: D6 案件成员级, 管理层全租户, 外部顾问 4013 拒绝.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ....core.database import get_db
from ....core.deps import get_current_user
from ....models.sys_users import SysUser
from ....schemas.common import StandardResponse
from ....schemas.asset_preservation import (
    CreatePreservationRequest,
    CreatePreservationResponse,
    DetailPreservationRequest,
    DetailPreservationResponse,
    ExtendPreservationRequest,
    ExtendPreservationResponse,
    ExpiryAlertsRequest,
    ExpiryAlertsResponse,
    ListPreservationsRequest,
    ListPreservationsResponse,
    RealizePreservationRequest,
    RealizePreservationResponse,
    ReleasePreservationRequest,
    ReleasePreservationResponse,
)
from ....services import asset_preservation_service as svc

router = APIRouter()


@router.post(
    "/preservations/list",
    response_model=StandardResponse[ListPreservationsResponse],
    summary="资产保全列表查询",
    description="支持按案件过滤或全租户跨案视图。status_filter 支持 EXPIRED（Service 层实时计算）。",
)
async def list_preservations(
    req: ListPreservationsRequest,
    session: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
) -> StandardResponse[ListPreservationsResponse]:
    data = await svc.list_preservations(
        session, tenant_id=str(current_user.tenant_id), user=current_user, req=req
    )
    return StandardResponse(code=200, message="success", data=data)


@router.post(
    "/preservations/detail",
    response_model=StandardResponse[DetailPreservationResponse],
    summary="资产保全详情",
)
async def detail_preservation(
    req: DetailPreservationRequest,
    session: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
) -> StandardResponse[DetailPreservationResponse]:
    data = await svc.detail_preservation(
        session, tenant_id=str(current_user.tenant_id), user=current_user, req=req
    )
    return StandardResponse(code=200, message="success", data=data)


@router.post(
    "/preservations/create",
    response_model=StandardResponse[CreatePreservationResponse],
    summary="新建资产保全",
    description="写操作。案件 OWNER/CO_COUNSEL 成员或管理层可操作，归档案件不可写。",
)
async def create_preservation(
    req: CreatePreservationRequest,
    session: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
) -> StandardResponse[CreatePreservationResponse]:
    data = await svc.create_preservation(
        session, tenant_id=str(current_user.tenant_id), user=current_user, req=req
    )
    return StandardResponse(code=200, message="success", data=data)


@router.post(
    "/preservations/extend",
    response_model=StandardResponse[ExtendPreservationResponse],
    summary="资产保全续期",
    description="D1=A: 就地更新 expire_date，续期历史追加至 extended_data.extend_history[]。",
)
async def extend_preservation(
    req: ExtendPreservationRequest,
    session: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
) -> StandardResponse[ExtendPreservationResponse]:
    data = await svc.extend_preservation(
        session, tenant_id=str(current_user.tenant_id), user=current_user, req=req
    )
    return StandardResponse(code=200, message="success", data=data)


@router.post(
    "/preservations/release",
    response_model=StandardResponse[ReleasePreservationResponse],
    summary="解除资产保全",
    description="D3=A: ruling_document_id 可选，RELEASED 为终态不可逆。",
)
async def release_preservation(
    req: ReleasePreservationRequest,
    session: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
) -> StandardResponse[ReleasePreservationResponse]:
    data = await svc.release_preservation(
        session, tenant_id=str(current_user.tenant_id), user=current_user, req=req
    )
    return StandardResponse(code=200, message="success", data=data)


@router.post(
    "/preservations/realize",
    response_model=StandardResponse[RealizePreservationResponse],
    summary="标记资产保全变现",
    description="D4=B: 同事务强制创建 financial_transactions RECOVERY 记录，返回 recovery_transaction_id。",
)
async def realize_preservation(
    req: RealizePreservationRequest,
    session: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
) -> StandardResponse[RealizePreservationResponse]:
    data = await svc.realize_preservation(
        session, tenant_id=str(current_user.tenant_id), user=current_user, req=req
    )
    return StandardResponse(code=200, message="success", data=data)


@router.post(
    "/preservations/expiry-alerts",
    response_model=StandardResponse[ExpiryAlertsResponse],
    summary="到期预警看板",
    description="D5=A: 单端点，summary 固定统计 7d/30d 两档，items 跟随 days_threshold 分页。",
)
async def expiry_alerts(
    req: ExpiryAlertsRequest,
    session: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
) -> StandardResponse[ExpiryAlertsResponse]:
    data = await svc.expiry_alerts(
        session, tenant_id=str(current_user.tenant_id), user=current_user, req=req
    )
    return StandardResponse(code=200, message="success", data=data)
