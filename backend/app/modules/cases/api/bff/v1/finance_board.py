"""跨案件财务看板 BFF Router (切片 2.S11.a + 2.S11.b).

挂载路径: `/api/bff/v1/finance` (见 main.py)

18 端点:
    Dashboard (5): kpi / trends / distribution / ranking / alerts
    Provisions (5): list / summary / record / history / write-off
    Spend + Budget (4): spend/list / spend/record / spend/update-status / budget/execution
    Reports (4): reports/templates / reports/generate / reports/task-status / reports/history

权限 (D1=C 角色级 DataRole, 见 service _compute_board_scope):
    - SYS_ADMIN / LEGAL_ADMIN / LEGAL_DIRECTOR: 全租户 (is_admin=True)
    - LAWYER: 仅自己经手案件
    - BUSINESS_COLLABORATOR: 仅本业务线
    - EXTERNAL_COUNSEL / 无角色: 4013 拒

Reports 额外约束:
    - /generate: 仅 is_admin=True 可触发
    - /task-status /history: 非管理员仅见自己触发的报告

所有端点纯 POST (OLAP 复杂筛选, 见 契约 00 §2).
"""
from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ....core.database import get_db
from ....core.deps import get_current_user
from ....models.sys_users import SysUser
from ....schemas.common import StandardResponse
from ....schemas.finance_board import (
    BudgetExecutionRequest,
    BudgetExecutionResponse,
    DashboardAlertsRequest,
    DashboardAlertsResponse,
    DashboardDistributionRequest,
    DashboardDistributionResponse,
    DashboardKpiRequest,
    DashboardKpiResponse,
    DashboardRankingRequest,
    DashboardRankingResponse,
    DashboardTrendsRequest,
    DashboardTrendsResponse,
    GenerateReportRequest,
    GenerateReportResponse,
    ListReportTemplatesRequest,
    ListReportTemplatesResponse,
    ProvisionsHistoryRequest,
    ProvisionsHistoryResponse,
    ProvisionsListRequest,
    ProvisionsListResponse,
    ProvisionsRecordRequest,
    ProvisionsRecordResponse,
    ProvisionsSummaryRequest,
    ProvisionsSummaryResponse,
    ProvisionsWriteOffRequest,
    ProvisionsWriteOffResponse,
    ReportHistoryRequest,
    ReportHistoryResponse,
    ReportTaskStatusRequest,
    ReportTaskStatusResponse,
    SpendListRequest,
    SpendListResponse,
    SpendRecordRequest,
    SpendRecordResponse,
    SpendUpdateStatusRequest,
    SpendUpdateStatusResponse,
)
from ....services import finance_board_service

router = APIRouter()


# =========================================================================
# Dashboard (5 端点)
# =========================================================================


@router.post(
    "/dashboard/kpi",
    response_model=StandardResponse[DashboardKpiResponse],
    summary="财务看板 - 核心 KPI",
    description="涉诉总额 / 回款总额 / 避免损失 / 法律支出 + 同比 (YoY). D1=C 角色级权限.",
)
async def dashboard_kpi(
    request: DashboardKpiRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[DashboardKpiResponse]:
    data = await finance_board_service.dashboard_kpi(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[DashboardKpiResponse](data=data)


@router.post(
    "/dashboard/trends",
    response_model=StandardResponse[DashboardTrendsResponse],
    summary="财务看板 - 时间序列趋势",
    description="按 MONTH/QUARTER/YEAR 聚合 NEW_CLAIMS / RECOVERY_AMOUNT / LEGAL_SPEND / PROVISION_AMOUNT.",
)
async def dashboard_trends(
    request: DashboardTrendsRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[DashboardTrendsResponse]:
    data = await finance_board_service.dashboard_trends(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[DashboardTrendsResponse](data=data)


@router.post(
    "/dashboard/distribution",
    response_model=StandardResponse[DashboardDistributionResponse],
    summary="财务看板 - 维度分布 (饼图/柱图)",
    description="按业务线 / 案件类型 / 风险等级分布; 支持 LEGAL_SPEND / NEW_CLAIMS / PROVISION_AMOUNT 三类指标.",
)
async def dashboard_distribution(
    request: DashboardDistributionRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[DashboardDistributionResponse]:
    data = await finance_board_service.dashboard_distribution(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[DashboardDistributionResponse](data=data)


@router.post(
    "/dashboard/ranking",
    response_model=StandardResponse[DashboardRankingResponse],
    summary="财务看板 - Top N 排行 (律所支出/案件计提)",
    description="D2=C JOIN 路径 (流水→案件→ACTIVE 外聘律师→律所); D8=A 律所级主粒度. Q14 LAWYER 仅自己案件 slice.",
)
async def dashboard_ranking(
    request: DashboardRankingRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[DashboardRankingResponse]:
    data = await finance_board_service.dashboard_ranking(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[DashboardRankingResponse](data=data)


@router.post(
    "/dashboard/alerts",
    response_model=StandardResponse[DashboardAlertsResponse],
    summary="财务看板 - 异常预警雷达",
    description="3 类预警: 超预算案件 (执行率 > 0.9) / 判决后超期未回款 / HIGH+MAJOR 风险未计提.",
)
async def dashboard_alerts(
    request: DashboardAlertsRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[DashboardAlertsResponse]:
    data = await finance_board_service.dashboard_alerts(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[DashboardAlertsResponse](data=data)


# =========================================================================
# Provisions (5 端点)
# =========================================================================


@router.post(
    "/provisions/list",
    response_model=StandardResponse[ProvisionsListResponse],
    summary="预计负债台账 - 列表",
    description="按案件聚合 estimated_liabilities (PROVISION+ADJUSTMENT-REVERSAL); 分页 + 审批状态过滤.",
)
async def provisions_list(
    request: ProvisionsListRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[ProvisionsListResponse]:
    data = await finance_board_service.provisions_list(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[ProvisionsListResponse](data=data)


@router.post(
    "/provisions/summary",
    response_model=StandardResponse[ProvisionsSummaryResponse],
    summary="预计负债台账 - 汇总",
    description="当前查询条件下的计提金额快照 (已计提/待计提/已冲销 + 案件数).",
)
async def provisions_summary(
    request: ProvisionsSummaryRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[ProvisionsSummaryResponse]:
    data = await finance_board_service.provisions_summary(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[ProvisionsSummaryResponse](data=data)


@router.post(
    "/provisions/record",
    response_model=StandardResponse[ProvisionsRecordResponse],
    summary="预计负债 - 新增计提/调整 (写, Q11 事务)",
    description="正数=补提 (action_type=PROVISION); 负数=转回 (action_type=ADJUSTMENT). Q13 Response 含 record_id + new_total_amount.",
)
async def provisions_record(
    request: ProvisionsRecordRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[ProvisionsRecordResponse]:
    data = await finance_board_service.provisions_record(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[ProvisionsRecordResponse](data=data)


@router.post(
    "/provisions/history",
    response_model=StandardResponse[ProvisionsHistoryResponse],
    summary="预计负债 - 案件计提历史",
    description="按 case_id 查所有 estimated_liabilities 时间倒序; 返回当前累加总额.",
)
async def provisions_history(
    request: ProvisionsHistoryRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[ProvisionsHistoryResponse]:
    data = await finance_board_service.provisions_history(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[ProvisionsHistoryResponse](data=data)


@router.post(
    "/provisions/write-off",
    response_model=StandardResponse[ProvisionsWriteOffResponse],
    summary="预计负债 - 结案冲销 (写, Q11 事务)",
    description="案件结案 + 实际赔付后, 新增 REVERSAL 行; Response 含余额差 (balance).",
)
async def provisions_write_off(
    request: ProvisionsWriteOffRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[ProvisionsWriteOffResponse]:
    data = await finance_board_service.provisions_write_off(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[ProvisionsWriteOffResponse](data=data)


# =========================================================================
# Spend + Budget (4 端点)
# =========================================================================


@router.post(
    "/spend/list",
    response_model=StandardResponse[SpendListResponse],
    summary="法律费用 - 流水列表",
    description="全租户跨案件流水; 含律所名 (Q2 JOIN 推断 优先级: CaseCounsel > counterparty_name).",
)
async def spend_list(
    request: SpendListRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[SpendListResponse]:
    data = await finance_board_service.spend_list(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[SpendListResponse](data=data)


@router.post(
    "/spend/record",
    response_model=StandardResponse[SpendRecordResponse],
    summary="法律费用 - 手工登记 (写, Q11 事务; Q12 不扣预算)",
    description="PENDING 初始状态; invoice_attachment_ids 存 extended_data.invoice_attachment_ids. 不走悲观锁 (扣减场景在 S6).",
)
async def spend_record(
    request: SpendRecordRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[SpendRecordResponse]:
    data = await finance_board_service.spend_record(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[SpendRecordResponse](data=data)


@router.post(
    "/spend/update-status",
    response_model=StandardResponse[SpendUpdateStatusResponse],
    summary="法律费用 - 状态流转 (写, Q11 事务)",
    description="状态机: PENDING→APPROVED/REJECTED/CANCELLED; APPROVED→EXECUTED/CANCELLED. EXECUTED 必带 actual_payment_date.",
)
async def spend_update_status(
    request: SpendUpdateStatusRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[SpendUpdateStatusResponse]:
    data = await finance_board_service.spend_update_status(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[SpendUpdateStatusResponse](data=data)


@router.post(
    "/budget/execution",
    response_model=StandardResponse[BudgetExecutionResponse],
    summary="预算执行 - 按业务线/部门",
    description="对比 business_line_budgets.total_budget 与 OUT 流水 (EXECUTED consumed + PENDING/APPROVED processing); Q3 执行率 ≥ 0.9 标红.",
)
async def budget_execution(
    request: BudgetExecutionRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[BudgetExecutionResponse]:
    data = await finance_board_service.budget_execution(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[BudgetExecutionResponse](data=data)


# =========================================================================
# Reports (4 端点, 2.S11.b)
# =========================================================================


@router.post(
    "/reports/templates",
    response_model=StandardResponse[ListReportTemplatesResponse],
    summary="报告模板列表 (S11.b)",
    description="返回当前可用的 3 个硬编码报告模板 (Q1 决策). EXTERNAL_COUNSEL 拒绝.",
)
async def reports_templates(
    request: ListReportTemplatesRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[ListReportTemplatesResponse]:
    data = await finance_board_service.list_report_templates(
        db, current_user.tenant_id, current_user
    )
    return StandardResponse[ListReportTemplatesResponse](data=data)


@router.post(
    "/reports/generate",
    response_model=StandardResponse[GenerateReportResponse],
    summary="触发异步报告生成 (S11.b, D3=B BackgroundTasks)",
    description="仅 is_admin=True (SYS_ADMIN/LEGAL_ADMIN/LEGAL_DIRECTOR) 可触发. 返回 task_id, 后台异步生成 XLSX 并上传 MinIO.",
)
async def reports_generate(
    request: GenerateReportRequest,
    background_tasks: BackgroundTasks,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[GenerateReportResponse]:
    data = await finance_board_service.generate_report(
        db, background_tasks, current_user.tenant_id, request, current_user
    )
    return StandardResponse[GenerateReportResponse](data=data)


@router.post(
    "/reports/task-status",
    response_model=StandardResponse[ReportTaskStatusResponse],
    summary="轮询报告任务状态 (S11.b, D4=A HTTP 轮询)",
    description="COMPLETED 时重新签发 1h TTL 预签名下载链接. 非管理员只能查自己触发的任务.",
)
async def reports_task_status(
    request: ReportTaskStatusRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[ReportTaskStatusResponse]:
    data = await finance_board_service.report_task_status(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[ReportTaskStatusResponse](data=data)


@router.post(
    "/reports/history",
    response_model=StandardResponse[ReportHistoryResponse],
    summary="历史报告列表 (S11.b, D6 INTERNAL_FINANCE 类别)",
    description="管理员见全部; 非管理员仅见自己触发的报告. 支持 template_id / 时间范围过滤 + 分页.",
)
async def reports_history(
    request: ReportHistoryRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[ReportHistoryResponse]:
    data = await finance_board_service.report_history(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[ReportHistoryResponse](data=data)
