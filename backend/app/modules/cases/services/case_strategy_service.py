"""案件策略 Service (3.S2-PRE-2).

职责:
  - get_by_case: 查询案件最新有效策略（同一案件取 version 最大、未软删的一条）
  - upsert: 新建或覆盖当前草稿策略（保持 version 原值，仅更新字段）
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.exceptions import BusinessException
from ..models.case_strategies import CaseStrategy
from ..models.sys_users import SysUser
from ..schemas.case_hall import StrategySaveRequest, StrategyVO


async def get_by_case(
    db: AsyncSession,
    tenant_id: str,
    case_id: str,
) -> StrategyVO | None:
    stmt = (
        select(CaseStrategy)
        .where(
            CaseStrategy.is_deleted == False,
            CaseStrategy.tenant_id == tenant_id,
            CaseStrategy.case_id == case_id,
        )
        .order_by(CaseStrategy.version.desc(), CaseStrategy.updated_at.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    row = result.scalar_one_or_none()
    if row is None:
        return None
    return _to_vo(row)


async def upsert(
    db: AsyncSession,
    tenant_id: str,
    case_id: str,
    req: StrategySaveRequest,
    current_user: SysUser,
) -> StrategyVO:
    async with db.begin():
        stmt = (
            select(CaseStrategy)
            .where(
                CaseStrategy.is_deleted == False,
                CaseStrategy.tenant_id == tenant_id,
                CaseStrategy.case_id == case_id,
            )
            .order_by(CaseStrategy.version.desc())
            .limit(1)
            .with_for_update()
        )
        result = await db.execute(stmt)
        existing = result.scalar_one_or_none()

        if existing:
            existing.strategy_type = req.direction
            existing.estimated_win_rate = req.win_probability
            existing.content = req.analysis
            existing.updated_by = str(current_user.id)
            row = existing
        else:
            row = CaseStrategy(
                tenant_id=tenant_id,
                case_id=case_id,
                strategy_type=req.direction,
                strategy_goal=None,
                estimated_win_rate=req.win_probability,
                version=1,
                content=req.analysis,
                status="DRAFT",
                created_by=str(current_user.id),
                updated_by=str(current_user.id),
            )
            db.add(row)
            await db.flush()

    await db.refresh(row)
    return _to_vo(row)


def _to_vo(row: CaseStrategy) -> StrategyVO:
    return StrategyVO(
        id=str(row.id),
        case_id=str(row.case_id),
        direction=row.strategy_type or "",
        win_probability=float(row.estimated_win_rate) if row.estimated_win_rate is not None else 0,
        analysis=row.content or "",
        updated_at=row.updated_at.strftime("%Y-%m-%d") if row.updated_at else "",
    )
