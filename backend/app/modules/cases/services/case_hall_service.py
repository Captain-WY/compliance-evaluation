"""
案件大厅 (Case Hall) BFF Service.

为切片 2.S1 提供 5 个视图端点所需的查询逻辑:
  - list_view        列表模式
  - kanban_view      看板模式
  - calendar_view    日历模式
  - ledger_view      台账模式 (含财务聚合)
  - summary_stats    顶部统计卡

设计原则:
  1. 所有查询严格 `is_deleted = FALSE` 过滤 (铁律 4)
  2. 所有方法 async + 完整 Type Hints (铁律 6)
  3. 租户隔离: 每次查询强制 `tenant_id = :current_tenant` 过滤
  4. 字典翻译: 单次批量加载, 避免 N+1
  5. 业务异常: 所有非预期情形抛 BusinessException (铁律 5)
  6. 单向调用: 本 service 只调 models + dict_service, 不在 router 层执行 SQL
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Sequence

from sqlalchemy import (
    Select,
    and_,
    case as sql_case,
    func,
    or_,
    select,
)
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.exceptions import ValidationException
from ..enums import (
    CaseMemberRole,
    CaseStatus,
    OurRole,
    ProcedureType,
    RiskLevel,
    Sector,
    label_of,
)
from ..models.case_budgets import CaseBudget
from ..models.cases import Case
from ..models.estimated_liabilities import EstimatedLiability
from ..models.financial_transactions import FinancialTransaction
from ..models.asset_preservations import AssetPreservation
from ..models.process_nodes import ProcessNode
from ..models.sys_dicts import SysDict
from ..schemas.case_hall import (
    CalendarEvent,
    CalendarViewData,
    CalendarViewRequest,
    CaseHallFilter,
    CaseHallItem,
    KanbanColumn,
    KanbanViewData,
    KanbanViewRequest,
    LedgerAggregate,
    LedgerExportRequest,
    LedgerItem,
    LedgerViewData,
    LedgerViewRequest,
    ListViewData,
    ListViewRequest,
    StatsBucket,
    SummaryStatsData,
    SummaryStatsRequest,
)


# 支持前端排序字段到 ORM 属性的映射
LIST_SORT_MAP = {
    "created_at": Case.created_at,
    "filing_date": Case.filing_date,
    "close_date": Case.close_date,
    "target_amount": Case.target_amount,
    "internal_case_no": Case.internal_case_no,
}

LEDGER_SORT_MAP = {
    "created_at": Case.created_at,
    "filing_date": Case.filing_date,
    "target_amount": Case.target_amount,
    "provision_amount": Case.provision_amount,
    # total_fees / total_revenue / estimated_liability 依赖聚合, 在 Python 层排序
}

# 筛选字段用到的字典类型集合 (仅真正字典化字段, Enum 字段翻译走 label_of)
DICT_TYPES_FOR_HALL = (
    "CASE_TYPE",
    "CAUSE_OF_ACTION",
    "BUSINESS_LINE",
    "CASE_STAGE",
)


class CaseHallService:
    """案件大厅 BFF Service."""

    # =========================================================================
    # 视图 1: 列表模式
    # =========================================================================
    @staticmethod
    async def list_view(
        session: AsyncSession,
        tenant_id: str,
        request: ListViewRequest,
    ) -> ListViewData:
        base_stmt = CaseHallService._build_base_stmt(tenant_id, request)
        total = await CaseHallService._count(session, base_stmt)

        sort_column = LIST_SORT_MAP.get(request.sort_field, Case.created_at)
        if request.sort_order == "desc":
            sort_column = sort_column.desc()
        else:
            sort_column = sort_column.asc()

        offset = (request.pagination.page - 1) * request.pagination.size
        stmt = (
            base_stmt
            .order_by(sort_column, Case.id.asc())
            .offset(offset)
            .limit(request.pagination.size)
        )
        result = await session.execute(stmt)
        cases: Sequence[Case] = result.scalars().unique().all()

        dict_map = await CaseHallService._load_dict_map(session, tenant_id)
        items = [CaseHallService._to_hall_item(c, dict_map) for c in cases]

        return ListViewData(
            cases_total=total,
            cases_page=request.pagination.page,
            cases_size=request.pagination.size,
            cases=items,
        )

    # =========================================================================
    # 视图 2: 看板模式
    # =========================================================================
    @staticmethod
    async def kanban_view(
        session: AsyncSession,
        tenant_id: str,
        request: KanbanViewRequest,
    ) -> KanbanViewData:
        dict_map = await CaseHallService._load_dict_map(session, tenant_id)
        stage_dict = dict_map.get("CASE_STAGE", {})

        if request.stage_codes:
            stage_codes = request.stage_codes
        else:
            # 使用全部启用的 CASE_STAGE, 按 sort_order 排序
            all_stage_codes = [c for c, _ in sorted(
                stage_dict.items(),
                key=lambda kv: kv[1].get("sort_order", 0),
            )]
            # 若请求携带 current_stage_code 筛选, 仅渲染对应列
            if request.current_stage_code:
                stage_codes = [c for c in all_stage_codes if c in request.current_stage_code]
            else:
                stage_codes = all_stage_codes

        if not stage_codes:
            # current_stage_code 筛选值不在字典中时返回空看板，不报错
            if request.current_stage_code:
                return KanbanViewData(columns=[])
            raise ValidationException(message="系统未配置 CASE_STAGE 字典, 无法渲染看板")

        # 为每一列独立计数 + 查询首屏案件
        # 使用 filter 复制, 每列在 filter 上叠加 stage_code 限制
        columns: list[KanbanColumn] = []
        for idx, stage_code in enumerate(stage_codes):
            col_filter = request.model_copy(update={"current_stage_code": [stage_code]})
            col_stmt = CaseHallService._build_base_stmt(tenant_id, col_filter)
            total_count = await CaseHallService._count(session, col_stmt)

            case_rows = (
                await session.execute(
                    col_stmt.order_by(Case.created_at.desc(), Case.id.asc()).limit(
                        request.cases_per_column
                    )
                )
            ).scalars().unique().all()

            meta = stage_dict.get(stage_code, {})
            columns.append(
                KanbanColumn(
                    stage_code=stage_code,
                    stage_name=meta.get("name", stage_code),
                    sort_order=meta.get("sort_order", idx * 10),
                    total_count=total_count,
                    cases=[CaseHallService._to_hall_item(c, dict_map) for c in case_rows],
                )
            )
        return KanbanViewData(columns=columns)

    # =========================================================================
    # 视图 3: 日历模式
    # =========================================================================
    @staticmethod
    async def calendar_view(
        session: AsyncSession,
        tenant_id: str,
        request: CalendarViewRequest,
    ) -> CalendarViewData:
        if request.range_end < request.range_start:
            raise ValidationException(message="日历区间结束日不得早于开始日")

        span = (request.range_end - request.range_start).days
        if span > 366:
            raise ValidationException(message="日历区间不得超过 366 天")

        base_stmt = CaseHallService._build_base_stmt(tenant_id, request)
        cases: Sequence[Case] = (
            await session.execute(base_stmt)
        ).scalars().unique().all()

        # DEBUG: log request params and query results
        import logging
        logger = logging.getLogger(__name__)
        logger.info(
            "[calendar_view] range=%s~%s, cases_count=%d, date_start=%s, date_end=%s, date_field=%s",
            request.range_start, request.range_end, len(cases),
            request.date_start, request.date_end, request.date_field,
        )

        events: list[CalendarEvent] = []
        case_ids: list[str] = []
        case_map: dict[str, Case] = {}
        for c in cases:
            case_ids.append(c.id)
            case_map[c.id] = c
            if c.filing_date and request.range_start <= c.filing_date <= request.range_end:
                events.append(
                    CalendarEvent(
                        event_date=c.filing_date,
                        event_type="CASE_FILING",
                        case_id=c.id,
                        case_internal_no=c.internal_case_no,
                        case_name=c.case_name,
                        title=f"立案 · {c.case_name[:30]}",
                        risk_level=c.risk_level,
                    )
                )
            if c.close_date and request.range_start <= c.close_date <= request.range_end:
                events.append(
                    CalendarEvent(
                        event_date=c.close_date,
                        event_type="CASE_CLOSE",
                        case_id=c.id,
                        case_internal_no=c.internal_case_no,
                        case_name=c.case_name,
                        title=f"结案 · {c.case_name[:30]}",
                        risk_level=c.risk_level,
                    )
                )

        # 任务节点截止日聚合
        if case_ids:
            node_stmt = (
                select(ProcessNode)
                .where(
                    ProcessNode.tenant_id == tenant_id,
                    ProcessNode.is_deleted.is_(False),
                    ProcessNode.case_id.in_(case_ids),
                    ProcessNode.deadline.isnot(None),
                    ProcessNode.deadline >= request.range_start,
                    ProcessNode.deadline <= request.range_end,
                )
            )
            nodes: Sequence[ProcessNode] = (
                await session.execute(node_stmt)
            ).scalars().all()
            for n in nodes:
                c = case_map.get(n.case_id)
                if not c:
                    continue
                events.append(
                    CalendarEvent(
                        event_date=n.deadline,
                        event_type="TASK_DEADLINE",
                        case_id=c.id,
                        case_internal_no=c.internal_case_no,
                        case_name=c.case_name,
                        title=f"{n.task_name} · {c.case_name[:20]}",
                        risk_level=c.risk_level,
                        task_node_id=n.id,
                    )
                )

        # 优先级排序: TASK_DEADLINE > CASE_FILING > CASE_CLOSE
        _prio = {"TASK_DEADLINE": 0, "CASE_FILING": 1, "CASE_CLOSE": 2}
        events.sort(key=lambda e: (e.event_date, _prio.get(e.event_type, 99), e.case_id))
        return CalendarViewData(
            range_start=request.range_start,
            range_end=request.range_end,
            events=events,
        )

    # =========================================================================
    # 视图 4: 台账模式
    # =========================================================================
    @staticmethod
    async def ledger_view(
        session: AsyncSession,
        tenant_id: str,
        request: LedgerViewRequest,
    ) -> LedgerViewData:
        base_stmt = CaseHallService._build_base_stmt(tenant_id, request)
        total = await CaseHallService._count(session, base_stmt)

        # 数据库排序 (仅对 ORM 原生字段); 其他聚合字段下面在 Python 层 re-sort
        sort_column = LEDGER_SORT_MAP.get(request.sort_field)
        if sort_column is not None:
            sort_column = sort_column.desc() if request.sort_order == "desc" else sort_column.asc()
            base_stmt = base_stmt.order_by(sort_column, Case.id.asc())
        else:
            base_stmt = base_stmt.order_by(Case.created_at.desc(), Case.id.asc())

        # 先获取符合条件的 case id 列表, 再做聚合 (避免聚合后再筛选的复杂 CTE)
        # 若条件过滤后案件数 < size, 直接分页; 否则用 offset/limit
        offset = (request.pagination.page - 1) * request.pagination.size
        paged_stmt = base_stmt.offset(offset).limit(request.pagination.size)
        cases: Sequence[Case] = (
            await session.execute(paged_stmt)
        ).scalars().unique().all()
        case_ids = [c.id for c in cases]

        # 预算聚合
        budget_map: dict[str, Decimal] = {}
        if case_ids:
            budget_rows = (
                await session.execute(
                    select(CaseBudget.case_id, CaseBudget.total_budget).where(
                        CaseBudget.tenant_id == tenant_id,
                        CaseBudget.is_deleted.is_(False),
                        CaseBudget.case_id.in_(case_ids),
                    )
                )
            ).all()
            for cid, amount in budget_rows:
                budget_map[cid] = amount

        # 财务流水聚合
        out_map: dict[str, Decimal] = {}
        in_map: dict[str, Decimal] = {}
        if case_ids:
            tx_rows = (
                await session.execute(
                    select(
                        FinancialTransaction.case_id,
                        FinancialTransaction.fund_direction,
                        func.coalesce(func.sum(FinancialTransaction.amount), 0).label("sum_amount"),
                    )
                    .where(
                        FinancialTransaction.tenant_id == tenant_id,
                        FinancialTransaction.is_deleted.is_(False),
                        FinancialTransaction.case_id.in_(case_ids),
                        FinancialTransaction.transaction_status.in_(
                            ("EXECUTED", "APPROVED")  # 2.S6-PRE: COMPLETED → EXECUTED (D8=A)
                        ),
                    )
                    .group_by(FinancialTransaction.case_id, FinancialTransaction.fund_direction)
                )
            ).all()
            for cid, direction, sum_amount in tx_rows:
                if direction == "OUT":
                    out_map[cid] = sum_amount
                elif direction == "IN":
                    in_map[cid] = sum_amount

        # 预计负债最新余额 (current_amount)
        liability_map: dict[str, Decimal] = {}
        if case_ids:
            # 每个 case 取 assessment_date 最新的一条 current_amount
            liab_rows = (
                await session.execute(
                    select(
                        EstimatedLiability.case_id,
                        EstimatedLiability.current_amount,
                        EstimatedLiability.assessment_date,
                    )
                    .where(
                        EstimatedLiability.tenant_id == tenant_id,
                        EstimatedLiability.is_deleted.is_(False),
                        EstimatedLiability.case_id.in_(case_ids),
                    )
                    .order_by(
                        EstimatedLiability.case_id,
                        EstimatedLiability.assessment_date.desc(),
                    )
                )
            ).all()
            for row in liab_rows:
                if row.case_id not in liability_map:
                    liability_map[row.case_id] = row.current_amount

        dict_map = await CaseHallService._load_dict_map(session, tenant_id)
        items: list[LedgerItem] = []
        for c in cases:
            base_item = CaseHallService._to_hall_item(c, dict_map)
            items.append(
                LedgerItem(
                    **base_item.model_dump(),
                    total_budget=budget_map.get(c.id),
                    total_fees_out=out_map.get(c.id, Decimal(0)),
                    total_fees_in=in_map.get(c.id, Decimal(0)),
                    estimated_liability=liability_map.get(c.id),
                    currency="CNY",
                )
            )

        # 若按聚合字段排序, Python 层重排 (仅当前页)
        agg_sort_key_map = {
            "total_fees": lambda i: (i.total_fees_out or Decimal(0)),
            "total_revenue": lambda i: (i.total_fees_in or Decimal(0)),
            "estimated_liability": lambda i: (i.estimated_liability or Decimal(0)),
        }
        if request.sort_field in agg_sort_key_map:
            items.sort(
                key=agg_sort_key_map[request.sort_field],
                reverse=(request.sort_order == "desc"),
            )

        # 顶部聚合卡 — 计算当前**筛选全集**而非当前页
        aggregate = await CaseHallService._compute_ledger_aggregate(
            session, tenant_id, request
        )

        return LedgerViewData(
            total=total,
            page=request.pagination.page,
            size=request.pagination.size,
            items=items,
            aggregate=aggregate,
        )

    # =========================================================================
    # 视图 4b: 台账导出 (全量, 无分页)
    # =========================================================================
    @staticmethod
    async def export_ledger(
        session: AsyncSession,
        tenant_id: str,
        request: LedgerExportRequest,
    ) -> dict[str, Any]:
        """台账导出: 返回全量案件 + 财务聚合 + 子台账数据.

        返回结构:
          - items: list[LedgerItem]  (主表数据)
          - procedures: list[dict]   (程序时效)
          - finances: list[dict]     (费用收支)
          - assets: list[dict]       (财产保全)
        """
        base_stmt = CaseHallService._build_base_stmt(tenant_id, request)
        cases: Sequence[Case] = (
            await session.execute(base_stmt.order_by(Case.created_at.desc(), Case.id.asc()))
        ).scalars().unique().all()
        case_ids = [c.id for c in cases]

        # 财务聚合
        budget_map: dict[str, Decimal] = {}
        out_map: dict[str, Decimal] = {}
        in_map: dict[str, Decimal] = {}
        liability_map: dict[str, Decimal] = {}
        if case_ids:
            budget_rows = (
                await session.execute(
                    select(CaseBudget.case_id, CaseBudget.total_budget).where(
                        CaseBudget.tenant_id == tenant_id,
                        CaseBudget.is_deleted.is_(False),
                        CaseBudget.case_id.in_(case_ids),
                    )
                )
            ).all()
            for cid, amount in budget_rows:
                budget_map[cid] = amount

            tx_rows = (
                await session.execute(
                    select(
                        FinancialTransaction.case_id,
                        FinancialTransaction.fund_direction,
                        func.coalesce(func.sum(FinancialTransaction.amount), 0).label("sum_amount"),
                    )
                    .where(
                        FinancialTransaction.tenant_id == tenant_id,
                        FinancialTransaction.is_deleted.is_(False),
                        FinancialTransaction.case_id.in_(case_ids),
                        FinancialTransaction.transaction_status.in_(("EXECUTED", "APPROVED")),
                    )
                    .group_by(FinancialTransaction.case_id, FinancialTransaction.fund_direction)
                )
            ).all()
            for cid, direction, sum_amount in tx_rows:
                if direction == "OUT":
                    out_map[cid] = sum_amount
                elif direction == "IN":
                    in_map[cid] = sum_amount

            liab_rows = (
                await session.execute(
                    select(
                        EstimatedLiability.case_id,
                        EstimatedLiability.current_amount,
                        EstimatedLiability.assessment_date,
                    )
                    .where(
                        EstimatedLiability.tenant_id == tenant_id,
                        EstimatedLiability.is_deleted.is_(False),
                        EstimatedLiability.case_id.in_(case_ids),
                    )
                    .order_by(
                        EstimatedLiability.case_id,
                        EstimatedLiability.assessment_date.desc(),
                    )
                )
            ).all()
            for row in liab_rows:
                if row.case_id not in liability_map:
                    liability_map[row.case_id] = row.current_amount

        dict_map = await CaseHallService._load_dict_map(session, tenant_id)
        items: list[LedgerItem] = []
        for c in cases:
            base_item = CaseHallService._to_hall_item(c, dict_map)
            items.append(
                LedgerItem(
                    **base_item.model_dump(),
                    total_budget=budget_map.get(c.id),
                    total_fees_out=out_map.get(c.id, Decimal(0)),
                    total_fees_in=in_map.get(c.id, Decimal(0)),
                    estimated_liability=liability_map.get(c.id),
                    currency="CNY",
                )
            )

        # 子台账 1: 程序时效 (process_nodes)
        procedures: list[dict[str, Any]] = []
        if case_ids:
            node_rows: Sequence[ProcessNode] = (
                await session.execute(
                    select(ProcessNode)
                    .where(
                        ProcessNode.tenant_id == tenant_id,
                        ProcessNode.is_deleted.is_(False),
                        ProcessNode.case_id.in_(case_ids),
                    )
                    .order_by(ProcessNode.case_id, ProcessNode.deadline)
                )
            ).scalars().all()
            case_map = {c.id: c for c in cases}
            for n in node_rows:
                c = case_map.get(n.case_id)
                procedures.append(
                    {
                        "case_id": n.case_id,
                        "internal_case_no": c.internal_case_no if c else "",
                        "case_name": c.case_name if c else "",
                        "task_name": n.task_name,
                        "deadline": n.deadline.isoformat() if n.deadline else None,
                        "completed_date": n.completed_date.isoformat() if n.completed_date else None,
                        "status": n.status,
                        "priority": n.priority,
                        "description": n.description,
                    }
                )

        # 子台账 2: 费用收支 (financial_transactions)
        finances: list[dict[str, Any]] = []
        if case_ids:
            tx_detail_rows = (
                await session.execute(
                    select(FinancialTransaction)
                    .where(
                        FinancialTransaction.tenant_id == tenant_id,
                        FinancialTransaction.is_deleted.is_(False),
                        FinancialTransaction.case_id.in_(case_ids),
                    )
                    .order_by(FinancialTransaction.case_id, FinancialTransaction.apply_date)
                )
            ).scalars().all()
            for tx in tx_detail_rows:
                c = case_map.get(tx.case_id)
                finances.append(
                    {
                        "case_id": tx.case_id,
                        "internal_case_no": c.internal_case_no if c else "",
                        "case_name": c.case_name if c else "",
                        "transaction_type": tx.transaction_type,
                        "fund_direction": tx.fund_direction,
                        "amount": tx.amount,
                        "currency": tx.currency,
                        "transaction_status": tx.transaction_status,
                        "apply_date": tx.apply_date.isoformat() if tx.apply_date else None,
                        "transaction_date": tx.transaction_date.isoformat() if tx.transaction_date else None,
                        "counterparty_name": tx.counterparty_name,
                        "description": tx.description,
                    }
                )

        # 子台账 3: 财产保全 (asset_preservations)
        assets: list[dict[str, Any]] = []
        if case_ids:
            asset_rows = (
                await session.execute(
                    select(AssetPreservation)
                    .where(
                        AssetPreservation.tenant_id == tenant_id,
                        AssetPreservation.is_deleted.is_(False),
                        AssetPreservation.case_id.in_(case_ids),
                    )
                    .order_by(AssetPreservation.case_id, AssetPreservation.start_date)
                )
            ).scalars().all()
            for a in asset_rows:
                c = case_map.get(a.case_id)
                assets.append(
                    {
                        "case_id": a.case_id,
                        "internal_case_no": c.internal_case_no if c else "",
                        "case_name": c.case_name if c else "",
                        "asset_name": a.asset_name,
                        "asset_type": a.asset_type,
                        "preservation_type": a.preservation_type,
                        "status": a.status,
                        "start_date": a.start_date.isoformat() if a.start_date else None,
                        "expire_date": a.expire_date.isoformat() if a.expire_date else None,
                        "estimated_value": a.estimated_value,
                        "realized_value": a.realized_value,
                        "execution_court": a.execution_court,
                        "description": a.description,
                    }
                )

        return {
            "items": items,
            "procedures": procedures,
            "finances": finances,
            "assets": assets,
            "total_cases": len(items),
        }

    # =========================================================================
    # 视图 5: 顶部统计卡
    # =========================================================================
    @staticmethod
    async def summary_stats(
        session: AsyncSession,
        tenant_id: str,
        request: SummaryStatsRequest,
    ) -> SummaryStatsData:
        base_stmt = CaseHallService._build_base_stmt(tenant_id, request)
        base_subq = base_stmt.with_only_columns(Case.id).subquery()

        # 统计汇总 (单条 SQL 做大部分聚合, 避免多次往返)
        today = date.today()
        month_start = today.replace(day=1)
        month_end_exclusive = (month_start + timedelta(days=32)).replace(day=1)
        thirty_days_out = today + timedelta(days=30)

        stats_row = (
            await session.execute(
                select(
                    func.count(Case.id).label("total"),
                    func.sum(
                        sql_case((Case.case_status == "IN_PROGRESS", 1), else_=0)
                    ).label("in_progress"),
                    func.sum(
                        sql_case((Case.case_status == "CLOSED", 1), else_=0)
                    ).label("closed"),
                    func.sum(
                        sql_case((Case.case_status == "SUSPENDED", 1), else_=0)
                    ).label("suspended"),
                    func.sum(
                        sql_case((Case.case_status == "PENDING", 1), else_=0)
                    ).label("pending"),
                    func.sum(
                        sql_case((Case.risk_level.in_(["MAJOR", "CRITICAL"]), 1), else_=0)
                    ).label("major_risk"),
                    func.sum(
                        sql_case(
                            (
                                and_(
                                    Case.filing_date >= month_start,
                                    Case.filing_date < month_end_exclusive,
                                ),
                                1,
                            ),
                            else_=0,
                        )
                    ).label("new_this_month"),
                    func.coalesce(func.sum(Case.target_amount), 0).label("total_amount"),
                ).select_from(Case).where(Case.id.in_(select(base_subq)))
            )
        ).one()

        # closing_soon: 未来 30 天内有 process_nodes deadline 的 IN_PROGRESS 案件数
        closing_soon = (
            await session.execute(
                select(func.count(func.distinct(ProcessNode.case_id))).where(
                    ProcessNode.tenant_id == tenant_id,
                    ProcessNode.is_deleted.is_(False),
                    ProcessNode.deadline >= today,
                    ProcessNode.deadline <= thirty_days_out,
                    ProcessNode.status.in_(("PENDING", "ACTIVE")),
                    ProcessNode.case_id.in_(select(base_subq)),
                )
            )
        ).scalar() or 0

        # overdue_tasks: 存在已逾期 (deadline < today) 且未完成的任务节点的案件数
        overdue = (
            await session.execute(
                select(func.count(func.distinct(ProcessNode.case_id))).where(
                    ProcessNode.tenant_id == tenant_id,
                    ProcessNode.is_deleted.is_(False),
                    ProcessNode.deadline < today,
                    ProcessNode.status.in_(("PENDING", "ACTIVE")),
                    ProcessNode.case_id.in_(select(base_subq)),
                )
            )
        ).scalar() or 0

        # 分组计数
        stage_rows = (
            await session.execute(
                select(Case.current_stage_code, func.count(Case.id))
                .where(Case.id.in_(select(base_subq)))
                .group_by(Case.current_stage_code)
            )
        ).all()
        risk_rows = (
            await session.execute(
                select(Case.risk_level, func.count(Case.id))
                .where(Case.id.in_(select(base_subq)))
                .group_by(Case.risk_level)
            )
        ).all()
        bl_rows = (
            await session.execute(
                select(Case.business_line, func.count(Case.id))
                .where(Case.id.in_(select(base_subq)))
                .group_by(Case.business_line)
            )
        ).all()

        dict_map = await CaseHallService._load_dict_map(session, tenant_id)

        def to_buckets(rows, dict_type: str) -> list[StatsBucket]:
            type_map = dict_map.get(dict_type, {})
            out: list[StatsBucket] = []
            for code, cnt in rows:
                if code is None:
                    continue
                meta = type_map.get(code, {})
                out.append(StatsBucket(code=code, name=meta.get("name"), count=cnt))
            out.sort(key=lambda b: (-b.count, b.code))
            return out

        return SummaryStatsData(
            total=int(stats_row.total or 0),
            in_progress=int(stats_row.in_progress or 0),
            closed=int(stats_row.closed or 0),
            suspended=int(stats_row.suspended or 0),
            pending=int(stats_row.pending or 0),
            major_risk=int(stats_row.major_risk or 0),
            new_this_month=int(stats_row.new_this_month or 0),
            closing_soon=int(closing_soon),
            overdue_tasks=int(overdue),
            total_amount=Decimal(stats_row.total_amount or 0),
            by_stage=to_buckets(stage_rows, "CASE_STAGE"),
            by_risk_level=to_buckets(risk_rows, "RISK_LEVEL"),
            by_business_line=to_buckets(bl_rows, "BUSINESS_LINE"),
        )

    # =========================================================================
    # 私有: 构建基础筛选 Select
    # =========================================================================
    @staticmethod
    def _build_base_stmt(tenant_id: str, f: CaseHallFilter) -> Select:
        stmt = select(Case).where(
            Case.tenant_id == tenant_id,
            Case.is_deleted.is_(False),
        )

        if f.keyword:
            kw = f"%{f.keyword.strip()}%"
            stmt = stmt.where(
                or_(
                    Case.internal_case_no.ilike(kw),
                    Case.external_case_no.ilike(kw),
                    Case.case_name.ilike(kw),
                    Case.plaintiff_name.ilike(kw),
                    Case.defendant_name.ilike(kw),
                )
            )

        if f.case_status:
            stmt = stmt.where(Case.case_status.in_(f.case_status))
        if f.case_type_code:
            stmt = stmt.where(Case.case_type_code.in_(f.case_type_code))
        if f.cause_of_action:
            stmt = stmt.where(Case.case_cause.in_(f.cause_of_action))
        if f.risk_level:
            stmt = stmt.where(Case.risk_level.in_(f.risk_level))
        if f.business_line:
            stmt = stmt.where(Case.business_line.in_(f.business_line))
        if f.procedure_type:
            stmt = stmt.where(Case.procedure_type.in_(f.procedure_type))
        if f.current_stage_code:
            stmt = stmt.where(Case.current_stage_code.in_(f.current_stage_code))
        if f.our_role:
            stmt = stmt.where(Case.our_role.in_(f.our_role))

        if f.handling_lawyer_id:
            stmt = stmt.where(Case.handling_lawyer_id == f.handling_lawyer_id)
        if f.show_master_only:
            stmt = stmt.where(Case.is_main_case.is_(True))

        if f.date_start or f.date_end:
            date_col = {
                "filing_date": Case.filing_date,
                "close_date": Case.close_date,
                "created_at": Case.created_at,
            }[f.date_field]
            if f.date_start:
                stmt = stmt.where(date_col >= f.date_start)
            if f.date_end:
                # created_at 是 TIMESTAMPTZ, 用 <= end + 1 day 处理右边界
                if f.date_field == "created_at":
                    end_dt = datetime.combine(
                        f.date_end, datetime.min.time(), tzinfo=timezone.utc
                    ) + timedelta(days=1)
                    stmt = stmt.where(date_col < end_dt)
                else:
                    stmt = stmt.where(date_col <= f.date_end)

        return stmt

    @staticmethod
    async def _count(session: AsyncSession, base_stmt: Select) -> int:
        count_stmt = select(func.count()).select_from(base_stmt.subquery())
        return int((await session.execute(count_stmt)).scalar() or 0)

    # =========================================================================
    # 私有: 字典批量加载 + ORM → DTO 转换
    # =========================================================================
    @staticmethod
    async def _load_dict_map(
        session: AsyncSession, tenant_id: str
    ) -> dict[str, dict[str, dict[str, Any]]]:
        """返回 {dict_type: {dict_code: {name, sort_order}}}.

        sys_dicts 是 GlobalMixin (无 tenant_id), 此处 tenant_id 参数保留以便未来扩展.
        """
        rows = (
            await session.execute(
                select(
                    SysDict.dict_type,
                    SysDict.dict_code,
                    SysDict.dict_name,
                    SysDict.sort_order,
                ).where(
                    SysDict.dict_type.in_(DICT_TYPES_FOR_HALL),
                    SysDict.is_deleted.is_(False),
                    SysDict.is_active.is_(True),
                )
            )
        ).all()
        out: dict[str, dict[str, dict[str, Any]]] = {}
        for dt, dc, dn, so in rows:
            out.setdefault(dt, {})[dc] = {"name": dn, "sort_order": so}
        return out

    @staticmethod
    def _to_hall_item(
        c: Case, dict_map: dict[str, dict[str, dict[str, Any]]]
    ) -> CaseHallItem:
        """将 ORM Case 映射为 Hall DTO, 附上字典名/Enum label 快照.

        翻译路径分工 (2026-04-18 修正后):
          - 字典字段 (CASE_TYPE / CAUSE_OF_ACTION / BUSINESS_LINE / CASE_STAGE) -> tr()
          - Enum 字段 (risk_level / procedure_type / case_status / our_role) -> label_of()
        """

        def tr(dict_type: str, code: str | None) -> str | None:
            if not code:
                return None
            return dict_map.get(dict_type, {}).get(code, {}).get("name")

        return CaseHallItem(
            id=c.id,
            internal_case_no=c.internal_case_no,
            external_case_no=c.external_case_no,
            case_name=c.case_name,
            case_type_code=c.case_type_code,
            case_type_name=tr("CASE_TYPE", c.case_type_code),
            cause_of_action=c.case_cause,
            cause_of_action_name=tr("CAUSE_OF_ACTION", c.case_cause),
            business_line=c.business_line,
            business_line_name=tr("BUSINESS_LINE", c.business_line),
            risk_level=c.risk_level,
            risk_level_name=label_of(c.risk_level, RiskLevel),
            procedure_type=c.procedure_type,
            procedure_type_name=label_of(c.procedure_type, ProcedureType),
            current_stage_code=c.current_stage_code,
            current_stage_name=tr("CASE_STAGE", c.current_stage_code),
            case_status=c.case_status,
            case_status_name=label_of(c.case_status, CaseStatus),
            our_role=c.our_role,
            our_role_name=label_of(c.our_role, OurRole),
            plaintiff_name=c.plaintiff_name,
            defendant_name=c.defendant_name,
            target_amount=c.target_amount,
            provision_amount=c.provision_amount,
            target_subject=c.target_subject,
            accepting_court=c.accepting_court,
            presiding_judge=c.presiding_judge,
            handling_lawyer_id=c.handling_lawyer_id,
            is_main_case=bool(c.is_main_case),
            main_case_id=c.main_case_id,
            dispute_id=c.dispute_id,
            latest_progress=c.latest_progress,
            filing_date=c.filing_date,
            close_date=c.close_date,
            created_at=c.created_at,
            extended_data=c.extended_data,
        )

    # =========================================================================
    # 私有: 台账聚合卡
    # =========================================================================
    @staticmethod
    async def _compute_ledger_aggregate(
        session: AsyncSession, tenant_id: str, request: LedgerViewRequest
    ) -> LedgerAggregate:
        base_stmt = CaseHallService._build_base_stmt(tenant_id, request)
        base_subq = base_stmt.with_only_columns(Case.id).subquery()

        row = (
            await session.execute(
                select(
                    func.count(Case.id).label("total"),
                    func.coalesce(func.sum(Case.target_amount), 0).label("target_sum"),
                    func.coalesce(func.sum(Case.provision_amount), 0).label("provision_sum"),
                ).where(Case.id.in_(select(base_subq)))
            )
        ).one()

        tx_rows = (
            await session.execute(
                select(
                    FinancialTransaction.fund_direction,
                    func.coalesce(func.sum(FinancialTransaction.amount), 0),
                )
                .where(
                    FinancialTransaction.tenant_id == tenant_id,
                    FinancialTransaction.is_deleted.is_(False),
                    FinancialTransaction.case_id.in_(select(base_subq)),
                    FinancialTransaction.transaction_status.in_(("EXECUTED", "APPROVED")),  # 2.S6-PRE: COMPLETED → EXECUTED (D8=A)
                )
                .group_by(FinancialTransaction.fund_direction)
            )
        ).all()
        out_sum = Decimal(0)
        in_sum = Decimal(0)
        for direction, sum_amount in tx_rows:
            if direction == "OUT":
                out_sum = Decimal(sum_amount or 0)
            elif direction == "IN":
                in_sum = Decimal(sum_amount or 0)

        # 预计负债: 各 case 取 assessment_date 最新一条 current_amount, 再求和
        liab_subq = (
            select(
                EstimatedLiability.case_id,
                EstimatedLiability.current_amount,
                func.row_number()
                .over(
                    partition_by=EstimatedLiability.case_id,
                    order_by=EstimatedLiability.assessment_date.desc(),
                )
                .label("rn"),
            )
            .where(
                EstimatedLiability.tenant_id == tenant_id,
                EstimatedLiability.is_deleted.is_(False),
                EstimatedLiability.case_id.in_(select(base_subq)),
            )
            .subquery()
        )
        liab_sum = (
            await session.execute(
                select(func.coalesce(func.sum(liab_subq.c.current_amount), 0))
                .where(liab_subq.c.rn == 1)
            )
        ).scalar() or Decimal(0)

        return LedgerAggregate(
            total_cases=int(row.total or 0),
            total_target_amount=Decimal(row.target_sum or 0),
            total_provision_amount=Decimal(row.provision_sum or 0),
            total_fees_out=out_sum,
            total_fees_in=in_sum,
            total_estimated_liability=Decimal(liab_sum),
        )
