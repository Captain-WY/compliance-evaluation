"""
全局搜索 API 路由
提供跨案件(Cases)、任务(Tasks)、线索(Clues)的聚合搜索
支持 Elasticsearch 或 PostgreSQL 降级查询
"""
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func, cast, String

from ...core.database import get_db
from ...core.deps import get_current_user
from ...core.config import settings
from ...schemas.common import StandardResponse, PaginatedResponse
from ...models.cases import Case
from ...models.sys_users import SysUser

router = APIRouter()


def _case_to_issue(case: Case) -> Dict[str, Any]:
    """将 Case ORM 对象转为统一的 Issue 字典"""
    return {
        "id": str(case.id),
        "issue_type": "CASE",
        "title": case.case_name or "",
        "code": case.internal_case_no or "",
        "status": case.case_status or "",
        "stage": case.current_stage_code or "",
        "risk_level": case.risk_level or "",
        "assignee_id": case.handling_lawyer_id,
        "business_line": case.business_line or "",
        "target_amount": float(case.target_amount) if case.target_amount else 0,
        "plaintiff_name": case.plaintiff_name or "",
        "defendant_name": case.defendant_name or "",
        "accepting_court": case.accepting_court or "",
        "cause_of_action": case.case_cause or "",
        "procedure_type": case.procedure_type or "",
        "filing_date": str(case.filing_date) if case.filing_date else None,
        "close_date": str(case.close_date) if case.close_date else None,
        "created_at": case.created_at.isoformat() if case.created_at else None,
        "updated_at": case.updated_at.isoformat() if case.updated_at else None,
    }


@router.get("/issues", response_model=StandardResponse)
async def search_issues(
    keyword: Optional[str] = Query(None, description="搜索关键词"),
    issue_type: Optional[str] = Query(
        None, description="事项类型: CASE, TASK, CLUE, ALL"
    ),
    case_status: Optional[str] = Query(None, description="案件状态"),
    risk_level: Optional[str] = Query(None, description="风险等级"),
    stage: Optional[str] = Query(None, description="阶段编码"),
    business_line: Optional[str] = Query(None, description="业务线"),
    procedure_type: Optional[str] = Query(None, description="程序类型"),
    date_start: Optional[str] = Query(None, description="起始日期"),
    date_end: Optional[str] = Query(None, description="结束日期"),
    sort_by: str = Query("created_at", description="排序字段"),
    sort_order: str = Query("desc", description="排序方向"),
    page: int = Query(1, ge=1, description="页码"),
    size: int = Query(20, ge=1, le=1000, description="每页数量"),
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    全局搜索接口 - 聚合案件/任务/线索

    当前实现: PostgreSQL LIKE 降级查询 (Cases only)
    未来升级路径: Elasticsearch bool query

    Returns:
        StandardResponse[PaginatedResponse]: 统一格式的分页搜索结果
    """

    # ---------- 构建查询条件 ----------
    conditions = [
        Case.tenant_id == current_user.tenant_id,
        Case.is_deleted == False,
    ]

    if keyword:
        kw = f"%{keyword}%"
        conditions.append(
            or_(
                Case.case_name.ilike(kw),
                Case.internal_case_no.ilike(kw),
                Case.plaintiff_name.ilike(kw),
                Case.defendant_name.ilike(kw),
                Case.accepting_court.ilike(kw),
                Case.latest_progress.ilike(kw),
            )
        )

    if case_status and case_status != "ALL":
        conditions.append(Case.case_status == case_status)

    if risk_level and risk_level != "ALL":
        conditions.append(Case.risk_level == risk_level)

    if stage and stage != "ALL":
        conditions.append(Case.current_stage_code == stage)

    if business_line and business_line != "ALL":
        conditions.append(Case.business_line == business_line)

    if procedure_type and procedure_type != "ALL":
        conditions.append(Case.procedure_type == procedure_type)

    if date_start:
        from datetime import date as date_type
        conditions.append(Case.created_at >= date_start)
    if date_end:
        conditions.append(Case.created_at <= date_end)

    where = and_(*conditions)

    # ---------- 查询总数 ----------
    count_q = select(func.count(Case.id)).where(where)
    total = (await db.execute(count_q)).scalar() or 0

    # ---------- 排序 ----------
    sort_col = getattr(Case, sort_by, Case.created_at)
    order = sort_col.desc() if sort_order == "desc" else sort_col.asc()

    # ---------- 分页查询 ----------
    data_q = (
        select(Case)
        .where(where)
        .order_by(order)
        .offset((page - 1) * size)
        .limit(size)
    )
    rows = (await db.execute(data_q)).scalars().all()

    items = [_case_to_issue(c) for c in rows]

    paginated = PaginatedResponse(
        total=total,
        page=page,
        size=size,
        items=items,
    )

    return StandardResponse(data=paginated)
