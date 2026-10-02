"""
BFF 案件大厅 (Case Hall) + 案件详情抽屉 / 基础信息更新 路由.

挂载路径: `/api/bff/v1/cases`

已交付切片范围:
  - 2.S1: 多视图查询 (views/*) + 统计卡 (summary-stats)
  - 2.S2.a: 抽屉概要 (drawer/summary) + 局部更新 (base-info/update)

所有端点统一为 POST, 请求体承载复杂筛选 / 更新字段.
"""
from __future__ import annotations

import io
from datetime import date
from urllib.parse import quote

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from sqlalchemy import select, or_, func
from sqlalchemy.ext.asyncio import AsyncSession

from ....core.database import get_db
from ....core.deps import get_current_user
from ....models.sys_users import SysUser
from ....schemas.case_hall import (
    CalendarViewData,
    CalendarViewRequest,
    CaseDetailRequest,
    CaseOverviewVO,
    CasePermissionsVO,
    CaseSidebarVO,
    DrawerSummaryData,
    DrawerSummaryRequest,
    KanbanViewData,
    KanbanViewRequest,
    LedgerExportRequest,
    LedgerViewData,
    LedgerViewRequest,
    ListViewData,
    ListViewRequest,
    MembersManageRequest,
    MembersManageResponse,
    MemberUserSearchRequest,
    MemberUserSearchResponse,
    StrategyGetRequest,
    StrategySaveRequest,
    StrategyVO,
    StageChangeRequest,
    SummaryStatsData,
    SummaryStatsRequest,
)
from ....schemas.cases import CaseBaseInfoUpdate
from ....schemas.common import StandardResponse
from ....schemas.parties import (
    AuditLogQueryRequest,
    AuditLogQueryResponse,
    BatchUpsertPartiesRequest,
    ConflictCheckRequest,
    ConflictCheckResponse,
    PartiesListBffRequest,
    PartiesListResponse,
    PartyAddResponse,
    PartyCreateRequest,
    PartyDetailBffRequest,
    PartyRemoveBffRequest,
    PartyUpdateBffRequest,
    PartyVO,
)
from ....schemas.dossier import (
    AuthRequestCreateRequest,
    AuthRequestReviewRequest,
    AuthRequestsListRequest,
    AuthRequestsListResponse,
    AuthRequestVO,
    DocumentDeleteRequest,
    DocumentDetailRequest,
    DocumentDetailResponse,
    DocumentMoveRequest,
    DocumentRenameRequest,
    DocumentVO,
    DocumentsListRequest,
    DocumentsListResponse,
    DossierTreeRequest,
    DossierTreeResponse,
    DownloadUrlRequest,
    DownloadUrlResponse,
    EvidenceCatalogRequest,
    EvidenceCatalogResponse,
    FolderCreateRequest,
    FolderDeleteRequest,
    FolderRenameRequest,
    FolderVO,
    PermissionGrantRequest,
    PermissionRevokeRequest,
    PermissionsListRequest,
    PermissionsListResponse,
    PermissionVO,
    UploadAbortRequest,
    UploadCompleteRequest,
    UploadInitRequest,
    UploadInitResponse,
)
from ....schemas.process import (
    CaseActionItemVO,
    NodeCompleteRequest,
    NodeCreateRequest,
    NodeRemoveRequest,
    NodeSkipRequest,
    NodeUpdateRequest,
    ProcessNodeVO,
    ProcessTimelineRequest,
    ProcessTimelineResponse,
    StageAdvanceRequest,
    StageAdvanceResponse,
    TaskCreateRequest,
    TaskRemoveRequest,
    TasksListRequest,
    TasksListResponse,
    TaskStatusUpdateRequest,
)
from ....schemas.case_finance import (
    FinanceSnapshotRequest,
    FinanceSnapshotResponse,
    FinanceUpdateRequest,
    FinanceUpdateResponse,
    ProvisionAddRequest,
    ProvisionAddResponse,
    ProvisionHistoryRequest,
    ProvisionHistoryResponse,
    SpendListRequest,
    SpendListResponse,
    SpendRecordRequest,
    SpendRecordResponse,
)
from ....schemas.case_counsels import (
    ContractAttachRequest,
    ContractAttachResponse,
    CounselExternalAssignRequest,
    CounselExternalAssignResponse,
    CounselInternalAssignRequest,
    CounselInternalAssignResponse,
    CounselsListRequest,
    CounselsListResponse,
    CounselUnassignRequest,
    CounselUnassignResponse,
)
from ....schemas.case_compliance import (
    AttributesRequest,
    AttributesResponse,
    ChecklistRequest,
    ChecklistResponse,
    ChecklistSubmitRequest,
    ChecklistSubmitResponse,
    DisclosuresRequest,
    DisclosuresResponse,
)
from ....schemas.case_closing import (
    ArchivingSubmitRequest,
    ArchivingSubmitResponse,
    ArchivingValidateRequest,
    ArchivingValidateResponse,
    ClosingInfoRequest,
    ClosingInfoResponse,
    ClosingSubmitRequest,
    ClosingSubmitResponse,
    ReminderSetupRequest,
    ReminderSetupResponse,
    ZhongBenRegisterRequest,
    ZhongBenRegisterResponse,
)
from ....schemas.case_creation import (
    CaseCreateRequest,
    CaseCreateResponse,
    DraftDeleteRequest,
    DraftDeleteResponse,
    DraftSaveRequest,
    DraftSaveResponse,
    DraftsListRequest,
    DraftsListResponse,
    FromCluePrepareRequest,
    FromCluePrepareResponse,
    MemoAddRequest,
    MemoAddResponse,
)
from ....services import (
    case_archiving_service,
    case_closing_service,
    case_compliance_service,
    case_counsels_service,
    case_creation_service,
    case_dossier_service,
    case_finance_service,
    case_memo_service,
    case_parties_service,
    case_process_service,
    zhongben_service,
)
from ....services.case_detail_ext_service import CaseDetailExtService
from ....services.case_detail_service import CaseDetailService
from ....services.case_hall_service import CaseHallService
from ....services import case_strategy_service
from ....services.case_ai_context_service import build_case_ai_context
from ....services import case_strategy_recommend_service
from ....schemas.case_ai import (
    CaseAiContextBuildRequest,
    CaseAiContextBuildResponse,
    StrategyRecommendRequest,
    StrategyRecommendResponse,
)

router = APIRouter()


@router.post(
    "/views/list",
    response_model=StandardResponse[ListViewData],
    summary="案件大厅 - 列表模式",
    description=(
        "列表视图, 返回当前筛选条件下的分页案件 + (分期填充) 线索 / 任务. "
        "切片 2.S1 阶段 clues/tasks 字段固定为空数组, 待后续切片补齐."
    ),
)
async def view_list(
    request: ListViewRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[ListViewData]:
    data = await CaseHallService.list_view(db, current_user.tenant_id, request)
    return StandardResponse[ListViewData](data=data)


@router.post(
    "/views/kanban",
    response_model=StandardResponse[KanbanViewData],
    summary="案件大厅 - 看板模式",
    description="按 CASE_STAGE 字典分组返回案件, 每列携带 total_count 与首屏 cases.",
)
async def view_kanban(
    request: KanbanViewRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[KanbanViewData]:
    data = await CaseHallService.kanban_view(db, current_user.tenant_id, request)
    return StandardResponse[KanbanViewData](data=data)


@router.post(
    "/views/calendar",
    response_model=StandardResponse[CalendarViewData],
    summary="案件大厅 - 日历模式",
    description=(
        "按日期聚合返回案件立案/结案关键节点以及流程任务截止日. "
        "区间最大 366 天."
    ),
)
async def view_calendar(
    request: CalendarViewRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[CalendarViewData]:
    data = await CaseHallService.calendar_view(db, current_user.tenant_id, request)
    return StandardResponse[CalendarViewData](data=data)


@router.post(
    "/views/ledger",
    response_model=StandardResponse[LedgerViewData],
    summary="案件大厅 - 台账模式",
    description=(
        "案件 + 深度财务聚合 (预算 / 已支出 / 已收入 / 预计负债). "
        "顶部 aggregate 是全集聚合, items 按分页返回."
    ),
)
async def view_ledger(
    request: LedgerViewRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[LedgerViewData]:
    data = await CaseHallService.ledger_view(db, current_user.tenant_id, request)
    return StandardResponse[LedgerViewData](data=data)


@router.post(
    "/export/ledger",
    summary="案件大厅 - 台账导出 Excel",
    description=(
        "按当前筛选条件导出全量案件台账为 Excel. "
        "包含 4 个 sheet: 案件主表 / 程序时效 / 费用收支 / 财产保全. "
        "返回文件下载流 (Content-Disposition: attachment)."
    ),
)
async def export_ledger(
    request: LedgerExportRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    export_data = await CaseHallService.export_ledger(
        db, current_user.tenant_id, request
    )

    wb = Workbook()
    # 移除默认 sheet, 按需创建
    wb.remove(wb.active)

    # ---- Sheet 1: 案件主表 ----
    ws_main = wb.create_sheet("案件主表")
    main_headers = [
        "内部案号", "外部案号", "案件名称", "案件类型", "案由", "业务条线",
        "风险等级", "程序类型", "当前阶段", "案件状态", "我方地位",
        "原告/申请人", "被告/被申请人", "标的额(元)", "预计负债(元)",
        "受理法院", "主审法官", "经办律师ID", "立案日期", "结案日期", "创建日期",
        "预算(元)", "已支出(元)", "已收入(元)", "预计负债余额(元)", "币种",
    ]
    ws_main.append(main_headers)
    for item in export_data["items"]:
        ws_main.append([
            item.internal_case_no,
            item.external_case_no or "",
            item.case_name,
            item.case_type_name or item.case_type_code,
            item.cause_of_action_name or item.cause_of_action or "",
            item.business_line_name or item.business_line or "",
            item.risk_level_name or item.risk_level or "",
            item.procedure_type_name or item.procedure_type or "",
            item.current_stage_name or item.current_stage_code or "",
            item.case_status_name or item.case_status,
            item.our_role_name or item.our_role or "",
            item.plaintiff_name or "",
            item.defendant_name or "",
            float(item.target_amount) if item.target_amount else 0,
            float(item.provision_amount) if item.provision_amount else 0,
            item.accepting_court or "",
            item.presiding_judge or "",
            item.handling_lawyer_id or "",
            item.filing_date.isoformat() if item.filing_date else "",
            item.close_date.isoformat() if item.close_date else "",
            item.created_at.isoformat() if item.created_at else "",
            float(item.total_budget) if item.total_budget else 0,
            float(item.total_fees_out),
            float(item.total_fees_in),
            float(item.estimated_liability) if item.estimated_liability else 0,
            item.currency,
        ])

    # ---- Sheet 2: 程序时效 ----
    ws_proc = wb.create_sheet("程序时效")
    proc_headers = [
        "关联案号", "案件名称", "任务名称", "截止日期", "完成日期",
        "状态", "优先级", "说明",
    ]
    ws_proc.append(proc_headers)
    for p in export_data["procedures"]:
        ws_proc.append([
            p["internal_case_no"],
            p["case_name"],
            p["task_name"],
            p["deadline"] or "",
            p["completed_date"] or "",
            p["status"] or "",
            p["priority"] or "",
            p["description"] or "",
        ])

    # ---- Sheet 3: 费用收支 ----
    ws_fin = wb.create_sheet("费用收支")
    fin_headers = [
        "关联案号", "案件名称", "交易类型", "资金流向", "金额",
        "币种", "状态", "申请日期", "交易日期", "交易对手", "说明",
    ]
    ws_fin.append(fin_headers)
    for f in export_data["finances"]:
        ws_fin.append([
            f["internal_case_no"],
            f["case_name"],
            f["transaction_type"],
            f["fund_direction"],
            float(f["amount"]) if f["amount"] else 0,
            f["currency"] or "CNY",
            f["transaction_status"] or "",
            f["apply_date"] or "",
            f["transaction_date"] or "",
            f["counterparty_name"] or "",
            f["description"] or "",
        ])

    # ---- Sheet 4: 财产保全 ----
    ws_asset = wb.create_sheet("财产保全")
    asset_headers = [
        "关联案号", "案件名称", "财产名称", "财产类型", "保全措施",
        "状态", "起始日", "到期日", "估值(元)", "变现值(元)", "执行法院", "说明",
    ]
    ws_asset.append(asset_headers)
    for a in export_data["assets"]:
        ws_asset.append([
            a["internal_case_no"],
            a["case_name"],
            a["asset_name"],
            a["asset_type"],
            a["preservation_type"],
            a["status"],
            a["start_date"] or "",
            a["expire_date"] or "",
            float(a["estimated_value"]) if a["estimated_value"] else 0,
            float(a["realized_value"]) if a["realized_value"] else 0,
            a["execution_court"] or "",
            a["description"] or "",
        ])

    # 写入内存流
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)

    file_name = f"SLD_案件台账导出_{date.today().isoformat()}.xlsx"
    # RFC 5987: filename* for UTF-8 encoded non-ASCII filenames
    encoded_name = quote(file_name, safe="")
    content_disposition = f"attachment; filename=\"export.xlsx\"; filename*=UTF-8''{encoded_name}"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": content_disposition},
    )


@router.post(
    "/views/summary-stats",
    response_model=StandardResponse[SummaryStatsData],
    summary="案件大厅 - 顶部统计卡",
    description=(
        "返回顶部 KPI 卡所需的聚合指标. 独立端点便于前端缓存与跨视图复用, "
        "响应包含总数 / 状态分布 / 风险分布 / 本月新增 / 临期提醒等."
    ),
)
async def view_summary_stats(
    request: SummaryStatsRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[SummaryStatsData]:
    data = await CaseHallService.summary_stats(db, current_user.tenant_id, request)
    return StandardResponse[SummaryStatsData](data=data)


# =========================================================================
# 切片 2.S2.a: 抽屉概要 + 基础信息更新
# =========================================================================

@router.post(
    "/drawer/summary",
    response_model=StandardResponse[DrawerSummaryData],
    summary="案件抽屉 - 多态概要",
    description=(
        "根据 item_type 多态返回抽屉概要: CASE 返回案件信息 + 财务快照; "
        "CLUE 返回线索正文 + 上报人 + 附件; EXECUTABLE_TASK 返回任务详情 + 部门. "
        "当前切片 2.S2.a 的 attachments / recent_activities 固定返回空, "
        "由 2.S4 (审计流水) / 2.S5 (卷宗附件) 补齐."
    ),
)
async def drawer_summary(
    request: DrawerSummaryRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[DrawerSummaryData]:
    data = await CaseDetailService.drawer_summary(
        db, current_user.tenant_id, request.id, request.item_type
    )
    return StandardResponse[DrawerSummaryData](data=data)


@router.post(
    "/base-info/update",
    response_model=StandardResponse[DrawerSummaryData],
    summary="案件 - 基础信息局部更新",
    description=(
        "右侧栏 / 抽屉 / 概览 Tab 共用的统一局部更新端点. "
        "仅允许 description / risk_level / is_investor_protection / is_major / sector / "
        "business_line / presiding_judge / judge_contact / accepting_court / latest_progress / "
        "extended_data 字段变更, 其他字段 (如 current_stage_code / case_status) 走专用端点. "
        "案件结案后自动锁定 (除 description 外)."
    ),
)
async def update_case_base_info(
    request: CaseBaseInfoUpdate,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[DrawerSummaryData]:
    data = await CaseDetailService.update_base_info(
        db, current_user.tenant_id, request.case_id, current_user, request.patch
    )
    return StandardResponse[DrawerSummaryData](data=data)


@router.post(
    "/stage/change",
    response_model=StandardResponse[DrawerSummaryData],
    summary="案件 - 阶段变更 (看板拖拽 / 详情页下拉)",
    description=(
        "更新 current_stage_code. 2.S2.a 简版: 仅字段更新, 校验字典有效性 + 结案锁定; "
        "2.S4 增强: 校验前置阶段里程碑完成度, 联动生成下一阶段任务."
    ),
)
async def change_case_stage(
    request: StageChangeRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[DrawerSummaryData]:
    data = await CaseDetailService.change_stage(
        db,
        current_user.tenant_id,
        request.case_id,
        current_user,
        request.new_stage_code,
        request.remark,
    )
    return StandardResponse[DrawerSummaryData](data=data)


# =============================================================================
# 切片 2.S2.b: 详情页右侧栏 / 概览 / 权限 / 成员管理
# =============================================================================


@router.post(
    "/detail/sidebar",
    response_model=StandardResponse[CaseSidebarVO],
    summary="案件详情 - 右侧栏 (全局属性 + 人员矩阵)",
    description=(
        "返回案件详情页固定右侧栏的全量数据: 全局属性 (阶段/风险/期限/案号) + "
        "人员矩阵 (assignees=OWNER+CO_COUNSEL, followers=BUSINESS_COLLABORATOR+VIEWER, "
        "external_counsels 来自 case_counsels 表)."
    ),
)
async def get_case_sidebar(
    request: CaseDetailRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[CaseSidebarVO]:
    data = await CaseDetailExtService.sidebar(db, current_user.tenant_id, request.case_id)
    return StandardResponse[CaseSidebarVO](data=data)


@router.post(
    "/detail/overview",
    response_model=StandardResponse[CaseOverviewVO],
    summary="案件详情 - 概览 Tab (基础案情 + 业务绑定 + 指标快照)",
    description=(
        "返回概览 Tab 全量数据: description / summary_detail / parties / subject_binding / metrics. "
        "指标快照包含 budget / fees_out / fees_in / estimated_liability / document_count 等轻量聚合."
    ),
)
async def get_case_overview(
    request: CaseDetailRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[CaseOverviewVO]:
    data = await CaseDetailExtService.overview(db, current_user.tenant_id, request.case_id)
    return StandardResponse[CaseOverviewVO](data=data)


@router.post(
    "/detail/permissions",
    response_model=StandardResponse[CasePermissionsVO],
    summary="案件详情 - 当前用户细粒度权限 (9 键)",
    description=(
        "返回当前登录用户对该案件的 9 键权限布尔 Map (canEditOverview/canChangeStage/canManageMembers/...). "
        "覆盖规则: LEGAL_ADMIN 全局角色 -> OWNER 等效; SYS_ADMIN -> 全 True; "
        "结案案件除 canEditOverview 外写权限全锁; custom_permissions 对同名键覆盖."
    ),
)
async def get_case_permissions(
    request: CaseDetailRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[CasePermissionsVO]:
    data = await CaseDetailExtService.permissions(
        db, current_user.tenant_id, request.case_id, str(current_user.id)
    )
    return StandardResponse[CasePermissionsVO](data=data)


@router.post(
    "/members/manage",
    response_model=StandardResponse[MembersManageResponse],
    summary="案件成员管理 (ADD / REMOVE / SET_PRIMARY)",
    description=(
        "需要 canManageMembers 权限. "
        "ADD: 新增/重新激活成员, role_code 必填且不可为 OWNER. "
        "REMOVE: 软删除成员, 不可移除 OWNER (需先 SET_PRIMARY). "
        "SET_PRIMARY: 原 OWNER 降为 CO_COUNSEL, 新成员升为 OWNER, 同步 cases.handling_lawyer_id."
    ),
)
async def manage_case_members(
    request: MembersManageRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[MembersManageResponse]:
    data = await CaseDetailExtService.manage_members(
        db,
        current_user.tenant_id,
        request.case_id,
        current_user,
        request,
    )
    return StandardResponse[MembersManageResponse](data=data)


@router.post(
    "/members/users/search",
    response_model=StandardResponse[MemberUserSearchResponse],
    summary="成员候选人搜索 (3.S2-PRE)",
    description="按 real_name / username / email 模糊搜索同租户内部用户，用于添加案件成员时的下拉候选。",
)
async def search_member_candidates(
    request: MemberUserSearchRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[MemberUserSearchResponse]:
    q: str = request.q.strip()

    stmt = (
        select(SysUser)
        .where(
            SysUser.is_deleted == False,
            SysUser.tenant_id == current_user.tenant_id,
            SysUser.status == "ACTIVE",
        )
    )
    if q:
        pattern = f"%{q}%"
        stmt = stmt.where(
            or_(
                func.lower(SysUser.real_name).like(func.lower(pattern)),
                func.lower(SysUser.username).like(func.lower(pattern)),
                func.lower(SysUser.email).like(func.lower(pattern)),
            )
        )
    stmt = stmt.limit(request.limit)
    result = await db.execute(stmt)
    users = result.scalars().all()
    items = [
        {
            "id": str(u.id),
            "name": u.real_name,
            "username": u.username,
            "email": u.email,
            "title": u.title,
            "department_id": str(u.department_id) if u.department_id else None,
        }
        for u in users
    ]
    return StandardResponse(data=MemberUserSearchResponse(items=items, total=len(items)))


# =========================================================================
# 切片 3.S2-PRE-2: 案件策略 (strategy/get + strategy/save)
# =========================================================================


@router.post(
    "/strategy/get",
    response_model=StandardResponse[StrategyVO],
    summary="查询案件最新策略 (3.S2-PRE-2)",
    description="返回案件当前有效策略（version 最大、未软删），无策略时 data=null。",
)
async def strategy_get(
    request: StrategyGetRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[StrategyVO]:
    data = await case_strategy_service.get_by_case(
        db, current_user.tenant_id, request.case_id
    )
    return StandardResponse(data=data)


@router.post(
    "/strategy/save",
    response_model=StandardResponse[StrategyVO],
    summary="新建或覆盖案件策略 (3.S2-PRE-2)",
    description="同一案件仅维护一条当前草稿策略，存在则原地更新，不存在则新建（version=1）。",
)
async def strategy_save(
    request: StrategySaveRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[StrategyVO]:
    data = await case_strategy_service.upsert(
        db, current_user.tenant_id, request.case_id, request, current_user
    )
    return StandardResponse(data=data)


@router.post(
    "/strategy/recommend",
    response_model=StandardResponse[StrategyRecommendResponse],
    summary="生成案件策略建议草稿 (WP-AI-04)",
    description=(
        "自动汇聚案件上下文、外部类案检索结果和既有策略信息，"
        "生成可人工采纳的策略建议草稿。不保存 case_strategies，不归档文书。"
        "top_k=0 时跳过类案检索，仅基于案件上下文生成降级建议。"
    ),
)
async def strategy_recommend(
    request: StrategyRecommendRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[StrategyRecommendResponse]:
    data = await case_strategy_recommend_service.recommend_strategy(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse(data=data)


# =========================================================================
# 切片 2.S3: 案件详情 - 当事人 CRUD + 冲突检查 + 审计日志查询
# =========================================================================


@router.post(
    "/parties/list",
    response_model=StandardResponse[PartiesListResponse],
    summary="案件详情 - 当事人列表",
    description="按案件返回当事人列表, 按 sort_order 升序, 我方阵营前置. "
                "权限: 案件成员 / LEGAL_ADMIN / SYS_ADMIN 可读.",
)
async def parties_list(
    request: PartiesListBffRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[PartiesListResponse]:
    data = await case_parties_service.list_parties(
        db, current_user.tenant_id, request.case_id, current_user
    )
    return StandardResponse[PartiesListResponse](data=data)


@router.post(
    "/parties/detail",
    response_model=StandardResponse[PartyVO],
    summary="案件详情 - 当事人详情",
    description="读取单个当事人完整字段, 用于编辑表单回显.",
)
async def party_detail(
    request: PartyDetailBffRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[PartyVO]:
    data = await case_parties_service.get_party(
        db, current_user.tenant_id, request.party_id, current_user
    )
    return StandardResponse[PartyVO](data=data)


@router.post(
    "/parties/add",
    response_model=StandardResponse[PartyAddResponse],
    summary="案件详情 - 新增当事人",
    description="需要 canEditBaseInfo 权限. 写入后自动同步 cases.plaintiff_name/defendant_name 冗余字段, "
                "追加 PARTIES/CREATE 审计日志, 并对非我方当事人执行一次利益冲突检查, "
                "命中结果在 warnings 字段回传 (不阻塞保存).",
)
async def parties_add(
    request: PartyCreateRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[PartyAddResponse]:
    data = await case_parties_service.add_party(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[PartyAddResponse](data=data)


@router.post(
    "/parties/update",
    response_model=StandardResponse[PartyVO],
    summary="案件详情 - 编辑当事人",
    description="PATCH 语义, 白名单由 Schema 保证. 关键字段变更时同步主表冗余 + 追加 PARTIES/UPDATE 审计.",
)
async def parties_update(
    request: PartyUpdateBffRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[PartyVO]:
    data = await case_parties_service.update_party(
        db, current_user.tenant_id, request.party_id, request.patch, current_user
    )
    return StandardResponse[PartyVO](data=data)


@router.post(
    "/parties/remove",
    response_model=StandardResponse[dict],
    summary="案件详情 - 删除当事人 (软删除)",
    description="若删除后主表冗余字段会失去唯一来源, 返回 4006 要求先指定替补.",
)
async def parties_remove(
    request: PartyRemoveBffRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[dict]:
    await case_parties_service.remove_party(
        db, current_user.tenant_id, request.party_id, request.reason, current_user
    )
    return StandardResponse[dict](data={"party_id": request.party_id, "removed": True})


@router.post(
    "/parties/batch-upsert",
    response_model=StandardResponse[PartiesListResponse],
    summary="案件详情 - 批量维护当事人",
    description="立案表单/当事人表格批量提交专用. 有 id 的做更新, 无 id 的新增, 未在清单中的既有记录保持不变. "
                "单事务原子提交.",
)
async def parties_batch_upsert(
    request: BatchUpsertPartiesRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[PartiesListResponse]:
    data = await case_parties_service.batch_upsert(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[PartiesListResponse](data=data)


@router.post(
    "/conflict-check",
    response_model=StandardResponse[ConflictCheckResponse],
    summary="立案 / 当事人新增 - 利益冲突检索",
    description="在租户内按 party_name (ilike) / identity_number (精确) 检索历史当事人, "
                "返回对方阵营命中, 区分 ONGOING / HISTORY. 所有登录用户可调用.",
)
async def parties_conflict_check(
    request: ConflictCheckRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[ConflictCheckResponse]:
    data = await case_parties_service.conflict_check(
        db, current_user.tenant_id, request
    )
    return StandardResponse[ConflictCheckResponse](data=data)


@router.post(
    "/audit-logs/query",
    response_model=StandardResponse[AuditLogQueryResponse],
    summary="案件详情 - 审计日志时间轴查询",
    description="按案件 + action_module 过滤, 按 created_at 倒序分页返回. "
                "本切片覆盖 PARTIES / MEMBERS 两个模块, 其他模块在后续切片补齐.",
)
async def audit_logs_query(
    request: AuditLogQueryRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[AuditLogQueryResponse]:
    data = await case_parties_service.query_audit_logs(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[AuditLogQueryResponse](data=data)


# =========================================================================
# 切片 2.S4: 案件详情 - 流程时间轴 + 阶段推进 + 节点操作 + 协作任务
# =========================================================================


@router.post(
    "/process/timeline",
    response_model=StandardResponse[ProcessTimelineResponse],
    summary="案件详情 - 流程时间轴",
    description="按阶段聚合 process_instances + process_nodes, "
                "含状态/优先级中文标签、指派人姓名、逾期标记. 权限: 案件成员可读.",
)
async def process_timeline(
    request: ProcessTimelineRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[ProcessTimelineResponse]:
    data = await case_process_service.get_timeline(
        db, current_user.tenant_id, request.case_id, current_user
    )
    return StandardResponse[ProcessTimelineResponse](data=data)


@router.post(
    "/process/stage/advance",
    response_model=StandardResponse[StageAdvanceResponse],
    summary="案件详情 - 阶段推进 (决策 D2)",
    description=(
        "推进案件到下一阶段. force=False 时若当前阶段仍有 PENDING/ACTIVE 节点将抛 4201; "
        "force=True 时未完成节点自动 SKIPPED 并写 PROCESS/UPDATE 审计. "
        "同步更新 cases.current_stage_code (权威源 D5) 并写 STAGE/UPDATE 审计."
    ),
)
async def process_stage_advance(
    request: StageAdvanceRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[StageAdvanceResponse]:
    data = await case_process_service.advance_stage(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[StageAdvanceResponse](data=data)


@router.post(
    "/process/nodes/complete",
    response_model=StandardResponse[ProcessNodeVO],
    summary="案件详情 - 完成流程节点",
    description="Guard: status ∈ {PENDING, ACTIVE}. 权限: canManageProcess.",
)
async def process_node_complete(
    request: NodeCompleteRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[ProcessNodeVO]:
    data = await case_process_service.complete_node(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[ProcessNodeVO](data=data)


@router.post(
    "/process/nodes/skip",
    response_model=StandardResponse[ProcessNodeVO],
    summary="案件详情 - 跳过流程节点 (决策 D3)",
    description="权限: canChangeStage (复用, 不新增专属权限键).",
)
async def process_node_skip(
    request: NodeSkipRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[ProcessNodeVO]:
    data = await case_process_service.skip_node(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[ProcessNodeVO](data=data)


@router.post(
    "/process/nodes/create",
    response_model=StandardResponse[ProcessNodeVO],
    summary="案件详情 - 新增自定义流程节点",
    description="task_template_id 固定为 None (自定义节点, 可删除). 权限: canManageProcess.",
)
async def process_node_create(
    request: NodeCreateRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[ProcessNodeVO]:
    data = await case_process_service.create_node(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[ProcessNodeVO](data=data)


@router.post(
    "/process/nodes/update",
    response_model=StandardResponse[ProcessNodeVO],
    summary="案件详情 - 更新流程节点 (PATCH)",
    description="白名单: priority/assignee_id/deadline/task_name/description/action_config/required_doc_types. "
                "status 不在白名单, 必须走 complete/skip.",
)
async def process_node_update(
    request: NodeUpdateRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[ProcessNodeVO]:
    data = await case_process_service.update_node(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[ProcessNodeVO](data=data)


@router.post(
    "/process/nodes/delete",
    response_model=StandardResponse[dict],
    summary="案件详情 - 删除自定义流程节点",
    description="Guard: 仅 task_template_id is None 可删, 模板节点请用 /skip.",
)
async def process_node_delete(
    request: NodeRemoveRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[dict]:
    await case_process_service.remove_node(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[dict](data={"node_id": request.node_id, "removed": True})


@router.post(
    "/tasks/list",
    response_model=StandardResponse[TasksListResponse],
    summary="案件详情 - 协作任务列表",
    description="case_action_items 分页查询, 支持 status / assignee 过滤.",
)
async def tasks_list(
    request: TasksListRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[TasksListResponse]:
    data = await case_process_service.list_tasks(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[TasksListResponse](data=data)


@router.post(
    "/tasks/create",
    response_model=StandardResponse[CaseActionItemVO],
    summary="案件详情 - 创建协作任务",
    description="权限: canManageProcess. 决策 D1 解耦: process_node_id 仅供 UI 展示.",
)
async def tasks_create(
    request: TaskCreateRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[CaseActionItemVO]:
    data = await case_process_service.create_task(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[CaseActionItemVO](data=data)


@router.post(
    "/tasks/update-status",
    response_model=StandardResponse[CaseActionItemVO],
    summary="案件详情 - 更新任务状态",
    description="权限特例: 若当前用户是 assignee_id, 允许自我更新; 否则需 canManageProcess.",
)
async def tasks_update_status(
    request: TaskStatusUpdateRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[CaseActionItemVO]:
    data = await case_process_service.update_task_status(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[CaseActionItemVO](data=data)


@router.post(
    "/tasks/delete",
    response_model=StandardResponse[dict],
    summary="案件详情 - 删除协作任务",
    description="软删除, 权限: canManageProcess.",
)
async def tasks_delete(
    request: TaskRemoveRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[dict]:
    await case_process_service.remove_task(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[dict](data={"task_id": request.task_id, "removed": True})


# =========================================================================
# 切片 2.S5: 案件详情 - 卷宗/文档 (14 端点)
# =========================================================================


@router.post(
    "/dossier/tree",
    response_model=StandardResponse[DossierTreeResponse],
    summary="案件详情 - 卷宗目录树",
    description="返回案件完整文件夹树 (递归) + 各文件夹最新版本文档数. 案件成员可读.",
)
async def dossier_tree(
    request: DossierTreeRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[DossierTreeResponse]:
    data = await case_dossier_service.get_tree(db, current_user.tenant_id, request, current_user)
    return StandardResponse[DossierTreeResponse](data=data)


@router.post(
    "/dossier/documents/list",
    response_model=StandardResponse[DocumentsListResponse],
    summary="案件详情 - 文档列表 (按文件夹分页)",
)
async def dossier_documents_list(
    request: DocumentsListRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[DocumentsListResponse]:
    data = await case_dossier_service.list_documents(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[DocumentsListResponse](data=data)


@router.post(
    "/dossier/documents/detail",
    response_model=StandardResponse[DocumentDetailResponse],
    summary="案件详情 - 文档详情 (含版本链)",
)
async def dossier_documents_detail(
    request: DocumentDetailRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[DocumentDetailResponse]:
    data = await case_dossier_service.get_document_detail(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[DocumentDetailResponse](data=data)


@router.post(
    "/dossier/upload/init",
    response_model=StandardResponse[UploadInitResponse],
    summary="卷宗 - 初始化上传 (颁发 presigned PUT URL + 登记 upload_session)",
    description=(
        "D1 直传模式: 前端调此端点获得 presigned URL, 自行 PUT 至 MinIO, 成功后调 /upload/complete. "
        "若 file_hash 在租户内已存在, 返回 skip_upload=true, 前端可直接调 complete 完成秒传."
    ),
)
async def dossier_upload_init(
    request: UploadInitRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[UploadInitResponse]:
    data = await case_dossier_service.init_upload(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[UploadInitResponse](data=data)


@router.post(
    "/dossier/upload/complete",
    response_model=StandardResponse[DocumentVO],
    summary="卷宗 - 完成上传 (校验对象 + 落 case_documents + 审计)",
)
async def dossier_upload_complete(
    request: UploadCompleteRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[DocumentVO]:
    data = await case_dossier_service.complete_upload(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[DocumentVO](data=data)


@router.post(
    "/dossier/upload/abort",
    response_model=StandardResponse[dict],
    summary="卷宗 - 取消上传 (幂等)",
)
async def dossier_upload_abort(
    request: UploadAbortRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[dict]:
    await case_dossier_service.abort_upload(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[dict](data={"upload_id": request.upload_id, "aborted": True})


@router.post(
    "/dossier/download-url",
    response_model=StandardResponse[DownloadUrlResponse],
    summary="卷宗 - 签发下载 presigned URL",
    description="D4 继承: 查 DOCUMENT 显式 → FOLDER 继承 → parent_chain 递归 → 未命中拒绝.",
)
async def dossier_download_url(
    request: DownloadUrlRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[DownloadUrlResponse]:
    data = await case_dossier_service.get_download_url(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[DownloadUrlResponse](data=data)


@router.post(
    "/dossier/documents/rename",
    response_model=StandardResponse[DocumentVO],
    summary="卷宗 - 文档重命名",
)
async def dossier_documents_rename(
    request: DocumentRenameRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[DocumentVO]:
    data = await case_dossier_service.rename_document(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[DocumentVO](data=data)


@router.post(
    "/dossier/documents/move",
    response_model=StandardResponse[DocumentVO],
    summary="卷宗 - 文档移动",
)
async def dossier_documents_move(
    request: DocumentMoveRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[DocumentVO]:
    data = await case_dossier_service.move_document(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[DocumentVO](data=data)


@router.post(
    "/dossier/documents/delete",
    response_model=StandardResponse[dict],
    summary="卷宗 - 文档软删除",
)
async def dossier_documents_delete(
    request: DocumentDeleteRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[dict]:
    await case_dossier_service.delete_document(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[dict](data={"doc_id": request.doc_id, "removed": True})


@router.post(
    "/dossier/folders/create",
    response_model=StandardResponse[FolderVO],
    summary="卷宗 - 文件夹创建",
)
async def dossier_folders_create(
    request: FolderCreateRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[FolderVO]:
    data = await case_dossier_service.create_folder(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[FolderVO](data=data)


@router.post(
    "/dossier/folders/rename",
    response_model=StandardResponse[FolderVO],
    summary="卷宗 - 文件夹重命名 (系统文件夹拒改)",
)
async def dossier_folders_rename(
    request: FolderRenameRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[FolderVO]:
    data = await case_dossier_service.rename_folder(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[FolderVO](data=data)


@router.post(
    "/dossier/folders/delete",
    response_model=StandardResponse[dict],
    summary="卷宗 - 文件夹软删除 (非空拒删, 系统文件夹拒删)",
)
async def dossier_folders_delete(
    request: FolderDeleteRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[dict]:
    await case_dossier_service.delete_folder(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[dict](data={"folder_id": request.folder_id, "removed": True})


@router.post(
    "/dossier/permissions/grant",
    response_model=StandardResponse[PermissionVO],
    summary="卷宗 - 权限授予 (upsert 同 target+grantee+type)",
)
async def dossier_permissions_grant(
    request: PermissionGrantRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[PermissionVO]:
    data = await case_dossier_service.grant_permission(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[PermissionVO](data=data)


@router.post(
    "/dossier/permissions/revoke",
    response_model=StandardResponse[dict],
    summary="卷宗 - 权限撤销 (软删)",
)
async def dossier_permissions_revoke(
    request: PermissionRevokeRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[dict]:
    await case_dossier_service.revoke_permission(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[dict](data={"permission_id": request.permission_id, "revoked": True})


@router.post(
    "/dossier/permissions/list",
    response_model=StandardResponse[PermissionsListResponse],
    summary="卷宗 - 权限记录查询",
)
async def dossier_permissions_list(
    request: PermissionsListRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[PermissionsListResponse]:
    data = await case_dossier_service.list_permissions(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[PermissionsListResponse](data=data)


@router.post(
    "/dossier/auth-requests/create",
    response_model=StandardResponse[AuthRequestVO],
    summary="卷宗 - 权限申请",
    description="外聘律师 / 无权成员发起授权申请; 登录即可.",
)
async def dossier_auth_requests_create(
    request: AuthRequestCreateRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[AuthRequestVO]:
    data = await case_dossier_service.create_auth_request(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[AuthRequestVO](data=data)


@router.post(
    "/dossier/auth-requests/review",
    response_model=StandardResponse[AuthRequestVO],
    summary="卷宗 - 权限申请审批 (APPROVE 自动创建 document_permissions)",
)
async def dossier_auth_requests_review(
    request: AuthRequestReviewRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[AuthRequestVO]:
    data = await case_dossier_service.review_auth_request(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[AuthRequestVO](data=data)


@router.post(
    "/dossier/auth-requests/list",
    response_model=StandardResponse[AuthRequestsListResponse],
    summary="卷宗 - 权限申请列表",
)
async def dossier_auth_requests_list(
    request: AuthRequestsListRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[AuthRequestsListResponse]:
    data = await case_dossier_service.list_auth_requests(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[AuthRequestsListResponse](data=data)


@router.post(
    "/dossier/evidence-catalog",
    response_model=StandardResponse[EvidenceCatalogResponse],
    summary="卷宗 - 证据目录自动生成",
    description="汇总案件中所有 doc_category=EVIDENCE 的文档, 按 evidence_no 排序生成标准证据目录.",
)
async def dossier_evidence_catalog(
    request: EvidenceCatalogRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[EvidenceCatalogResponse]:
    data = await case_dossier_service.generate_evidence_catalog(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[EvidenceCatalogResponse](data=data)


# =========================================================================
# 切片 2.S6: 案件详情 - 财务 Tab (6 端点)
# 权限 (D4'-1): 读 can_view_finance / 写 can_edit_base_info
# 审计 FINANCE 模块 (CRUD verbs + action_detail 细描述)
# 悲观锁 (D1=A): spend/record 对 business_line_budgets with_for_update()
# =========================================================================


@router.post(
    "/finance/snapshot",
    response_model=StandardResponse[FinanceSnapshotResponse],
    summary="案件详情 - 财务快照",
    description="聚合 claims / judgments / recoveries / provisions / legal_fees 指标. "
                "权限: can_view_finance (D4'-1).",
)
async def finance_snapshot(
    request: FinanceSnapshotRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[FinanceSnapshotResponse]:
    data = await case_finance_service.snapshot(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[FinanceSnapshotResponse](data=data)


@router.post(
    "/finance/update",
    response_model=StandardResponse[FinanceUpdateResponse],
    summary="案件详情 - 更新财务基础数据",
    description="PATCH 白名单: target_amount / provision_amount / judgment_* / notes. "
                "权限: can_edit_base_info (D4'-1). 结案/归档警告式留痕 (D6=B).",
)
async def finance_update(
    request: FinanceUpdateRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[FinanceUpdateResponse]:
    data = await case_finance_service.update_finance(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[FinanceUpdateResponse](data=data)


@router.post(
    "/finance/provisions/add",
    response_model=StandardResponse[ProvisionAddResponse],
    summary="案件详情 - 新增计提 (PROVISION/ADJUSTMENT/REVERSAL)",
    description="INSERT 到 estimated_liabilities, 自动推导 previous_amount. "
                "REVERSAL 强制清零, 覆盖 adjustment_amount. 权限: can_edit_base_info.",
)
async def finance_provisions_add(
    request: ProvisionAddRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[ProvisionAddResponse]:
    data = await case_finance_service.add_provision(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[ProvisionAddResponse](data=data)


@router.post(
    "/finance/provisions/history",
    response_model=StandardResponse[ProvisionHistoryResponse],
    summary="案件详情 - 计提流水",
    description="按 assessment_date DESC, created_at DESC 排序. 权限: can_view_finance.",
)
async def finance_provisions_history(
    request: ProvisionHistoryRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[ProvisionHistoryResponse]:
    data = await case_finance_service.provisions_history(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[ProvisionHistoryResponse](data=data)


@router.post(
    "/finance/spend/record",
    response_model=StandardResponse[SpendRecordResponse],
    summary="案件详情 - 费用登记 (悲观锁)",
    description="插入 financial_transactions OUT/PENDING. 悲观锁 business_line_budgets (D1=A). "
                "预算不足抛 BusinessException(4002). 权限: can_edit_base_info.",
)
async def finance_spend_record(
    request: SpendRecordRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[SpendRecordResponse]:
    data = await case_finance_service.spend_record(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[SpendRecordResponse](data=data)


@router.post(
    "/finance/spend/list",
    response_model=StandardResponse[SpendListResponse],
    summary="案件详情 - 本案件费用明细",
    description="仅 OUT 流水, 可按 transaction_type / transaction_status 过滤. 权限: can_view_finance.",
)
async def finance_spend_list(
    request: SpendListRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[SpendListResponse]:
    data = await case_finance_service.spend_list(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[SpendListResponse](data=data)


# =========================================================================
# 切片 2.S7: 案件详情 - 外聘律师 Tab (5 端点)
# 权限 (D4=A): 读 (list) 案件成员 / 写 can_manage_members
# 审计 COUNSELS 模块 (CRUD verbs + action_detail 细描述)
# D1=A 合同走 case_documents; D3=C 一体式 attach; D5=A unassign soft
# =========================================================================


@router.post(
    "/counsels/list",
    response_model=StandardResponse[CounselsListResponse],
    summary="案件详情 - 代理律师列表",
    description="返回本案件 INTERNAL + EXTERNAL 合并视图. 权限: 案件成员 (含 EXTERNAL_COUNSEL 自查).",
)
async def counsels_list(
    request: CounselsListRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[CounselsListResponse]:
    data = await case_counsels_service.list_counsels(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[CounselsListResponse](data=data)


@router.post(
    "/counsels/internal/assign",
    response_model=StandardResponse[CounselInternalAssignResponse],
    summary="案件详情 - 指派内部律师",
    description="D2 INTERNAL: lawyer_id→sys_users.id; 快照 real_name 冻结防失真. "
                "权限: can_manage_members.",
)
async def counsels_internal_assign(
    request: CounselInternalAssignRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[CounselInternalAssignResponse]:
    data = await case_counsels_service.assign_internal(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[CounselInternalAssignResponse](data=data)


@router.post(
    "/counsels/external/assign",
    response_model=StandardResponse[CounselExternalAssignResponse],
    summary="案件详情 - 指派外部律师",
    description="D2 EXTERNAL: lawyer_id→external_lawyers.id; 双快照 (law_firm + lawyer); "
                "黑名单律所 (cooperation_status=BLACKLISTED) 拒绝. 权限: can_manage_members.",
)
async def counsels_external_assign(
    request: CounselExternalAssignRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[CounselExternalAssignResponse]:
    data = await case_counsels_service.assign_external(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[CounselExternalAssignResponse](data=data)


@router.post(
    "/counsels/unassign",
    response_model=StandardResponse[CounselUnassignResponse],
    summary="案件详情 - 解聘律师",
    description="D5=A soft: status→TERMINATED (不硬删), 保留评分历史. 幂等: 重复 TERMINATED 拒. "
                "权限: can_manage_members.",
)
async def counsels_unassign(
    request: CounselUnassignRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[CounselUnassignResponse]:
    data = await case_counsels_service.unassign(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[CounselUnassignResponse](data=data)


@router.post(
    "/contracts/attach",
    response_model=StandardResponse[ContractAttachResponse],
    summary="案件详情 - 创建合同 (一体式)",
    description="D3=C: 创建 contract 元数据 + 校验 attachment_ids (D1=A case_documents) + "
                "可选 bind_counsel_id 同步更新 case_counsels.contract_id. "
                "权限: can_manage_members.",
)
async def contracts_attach(
    request: ContractAttachRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[ContractAttachResponse]:
    data = await case_counsels_service.attach_contract(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[ContractAttachResponse](data=data)


# =========================================================================
# 切片 2.S8: 案件详情 - 合规 Tab (4 端点)
# 权限 (D5=A): 读案件成员 / 写 can_edit_base_info
# 审计 COMPLIANCE 模块 (CRUD verbs, D6)
# D1=A 硬编码 CHECKLIST_TEMPLATES; D2=A extended_data.regulatory 深度合并;
# D3=A 轻实现信披 (绝对值 1000W)
# =========================================================================


@router.post(
    "/compliance/checklist",
    response_model=StandardResponse[ChecklistResponse],
    summary="案件详情 - 合规检查清单",
    description="按 case 属性 (is_major / is_investor_protection / sector) 动态拼装 "
                "CHECKLIST_TEMPLATES + 合并已提交状态. 权限: 案件成员.",
)
async def compliance_checklist(
    request: ChecklistRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[ChecklistResponse]:
    data = await case_compliance_service.get_checklist(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[ChecklistResponse](data=data)


@router.post(
    "/compliance/checklist/submit",
    response_model=StandardResponse[ChecklistSubmitResponse],
    summary="案件详情 - 提交合规清单勾选",
    description="D2=A 深度合并 extended_data.regulatory.checklist_items[]; "
                "attachment_ids 校验属本案 (D1=A case_documents 复用). "
                "权限: can_edit_base_info.",
)
async def compliance_checklist_submit(
    request: ChecklistSubmitRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[ChecklistSubmitResponse]:
    data = await case_compliance_service.submit_checklist(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[ChecklistSubmitResponse](data=data)


@router.post(
    "/compliance/disclosures",
    response_model=StandardResponse[DisclosuresResponse],
    summary="案件详情 - 信披判定 + 历史",
    description="D3=A 轻实现: 重大 + 上市板 + 金额>1000W 三规则全中触发; "
                "附历史披露列表 (compliance_materials disclosure_status=DISCLOSED). "
                "权限: 案件成员.",
)
async def compliance_disclosures(
    request: DisclosuresRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[DisclosuresResponse]:
    data = await case_compliance_service.get_disclosures(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[DisclosuresResponse](data=data)


@router.post(
    "/compliance/attributes",
    response_model=StandardResponse[AttributesResponse],
    summary="案件详情 - 合规属性汇总",
    description="聚合 cases 主表 + extended_data.regulatory 子键 + 关联计数 "
                "(compliance_alerts / compliance_materials). 权限: 案件成员.",
)
async def compliance_attributes(
    request: AttributesRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[AttributesResponse]:
    data = await case_compliance_service.get_attributes(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[AttributesResponse](data=data)


# =========================================================================
# 切片 2.S9: 案件详情 - 结案 / 归档 / 终本 (6 端点)
# 权限 (D7):
#   - closing/info + archiving/validate: 案件成员
#   - closing/submit + zhongben/*: can_close_case 或 can_edit_base_info
#   - archiving/submit: can_close_case + (LEGAL_ADMIN 或 SYS_ADMIN) 双校验
# 核心副作用:
#   - closing/submit → cases.case_status = CLOSED + case_closures 写入/更新
#   - archiving/submit → cases.case_status = ARCHIVED (触发全局只读锁)
#   - zhongben/register → cases.extended_data.zhongben_plan (D6=B 深度合并)
# 审计 CLOSURE 模块 (CREATE/UPDATE verbs)
# =========================================================================


@router.post(
    "/closing/info",
    response_model=StandardResponse[ClosingInfoResponse],
    summary="案件详情 - 结案登记信息",
    description="返回最新 case_closures + cases.case_status + close_date. 权限: 案件成员.",
)
async def closing_info(
    request: ClosingInfoRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[ClosingInfoResponse]:
    data = await case_closing_service.get_info(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[ClosingInfoResponse](data=data)


@router.post(
    "/closing/submit",
    response_model=StandardResponse[ClosingSubmitResponse],
    summary="案件详情 - 提交结案登记",
    description="写入/更新 case_closures 并将 cases.case_status 置为 CLOSED. "
                "已 APPROVED 结案再修改需 LEGAL_ADMIN/SYS_ADMIN. 权限: can_close_case.",
)
async def closing_submit(
    request: ClosingSubmitRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[ClosingSubmitResponse]:
    data = await case_closing_service.submit(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[ClosingSubmitResponse](data=data)


@router.post(
    "/archiving/validate",
    response_model=StandardResponse[ArchivingValidateResponse],
    summary="案件详情 - 归档前 6 规则校验",
    description="聚合 S5 (必备文档) / S6 (无待结财务) / S7 (律师全结案) / S8 (合规完成) "
                "+ S9×2 (case_status=CLOSED + 结案 APPROVED). 权限: 案件成员.",
)
async def archiving_validate(
    request: ArchivingValidateRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[ArchivingValidateResponse]:
    data = await case_archiving_service.validate_archive(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[ArchivingValidateResponse](data=data)


@router.post(
    "/archiving/submit",
    response_model=StandardResponse[ArchivingSubmitResponse],
    summary="案件详情 - 提交归档 (全局只读锁)",
    description="6 规则全通过后将 cases.case_status 置为 ARCHIVED, 触发全局只读锁. "
                "archive_no 租户内唯一. 权限: can_close_case + LEGAL_ADMIN/SYS_ADMIN.",
)
async def archiving_submit(
    request: ArchivingSubmitRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[ArchivingSubmitResponse]:
    data = await case_archiving_service.submit_archive(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[ArchivingSubmitResponse](data=data)


@router.post(
    "/execution/zhongben/register",
    response_model=StandardResponse[ZhongBenRegisterResponse],
    summary="案件详情 - 终本登记",
    description="D6=B 深度合并写入 cases.extended_data.zhongben_plan (保留已有 reminders[]). "
                "附件必须属本案. 权限: can_edit_base_info.",
)
async def zhongben_register(
    request: ZhongBenRegisterRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[ZhongBenRegisterResponse]:
    data = await zhongben_service.register(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[ZhongBenRegisterResponse](data=data)


@router.post(
    "/execution/zhongben/reminders/setup",
    response_model=StandardResponse[ReminderSetupResponse],
    summary="案件详情 - 终本周期复查提醒",
    description="向 extended_data.zhongben_plan.reminders[] 追加一条, "
                "next_trigger_date = register_date + interval_months. "
                "D5=B 本切片仅存储, 定时触发由后续平台切片实现. 权限: can_edit_base_info.",
)
async def zhongben_reminder_setup(
    request: ReminderSetupRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[ReminderSetupResponse]:
    data = await zhongben_service.setup_reminder(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[ReminderSetupResponse](data=data)


# =========================================================================
# 切片 2.S10: 案件新建 + 辅助功能 (9 端点)
# 权限 (D4=A):
#   - create / drafts/* / from-clue / memos/add: 登录用户
#   - activities/query: 案件成员 (复用 S3 audit-logs/query)
#   - milestones/complete: can_manage_process (复用 S4 process/nodes/complete)
#   - collaboration/create: can_manage_process (复用 S4 tasks/create)
# 核心副作用:
#   - cases/create 主事务 7 步: cases + parties + members + budget + draft_del + clue_CONVERTED + audit
#   - drafts: 独立 case_drafts 表, owner 隔离, TTL=30d (D1=A/D2=A/D3=C)
# 审计 CASES 模块 (CREATE), PARTIES.CREATE×N, MEMBERS.CREATE×N (create_case)
# 别名端点审计沿用 S3/S4 (CASES/PROCESS/TASK)
# =========================================================================


@router.post(
    "/create",
    response_model=StandardResponse[CaseCreateResponse],
    summary="案件详情 - 创建正式案件",
    description="主事务 7 步: cases + parties + members + budget + draft 软删 + "
                "clue CONVERTED + 审计 CASES.CREATE. D4=A 登录用户即可创建.",
)
async def cases_create(
    request: CaseCreateRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[CaseCreateResponse]:
    data = await case_creation_service.create_case(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[CaseCreateResponse](data=data)


@router.post(
    "/drafts/save",
    response_model=StandardResponse[DraftSaveResponse],
    summary="案件详情 - 保存立案草稿",
    description="D1=A 独立 case_drafts 表; owner=当前用户; TTL=30d (每次保存续期). "
                "draft_data JSONB <=100KB.",
)
async def cases_drafts_save(
    request: DraftSaveRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[DraftSaveResponse]:
    data = await case_creation_service.save_draft(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[DraftSaveResponse](data=data)


@router.post(
    "/drafts/list",
    response_model=StandardResponse[DraftsListResponse],
    summary="案件详情 - 列出当前用户草稿",
    description="D2=A owner 隔离: 仅返回 owner_id=current_user.id 且未过期的草稿.",
)
async def cases_drafts_list(
    request: DraftsListRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[DraftsListResponse]:
    data = await case_creation_service.list_drafts(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[DraftsListResponse](data=data)


@router.post(
    "/drafts/delete",
    response_model=StandardResponse[DraftDeleteResponse],
    summary="案件详情 - 删除草稿",
    description="软删 (is_deleted=TRUE). owner 自检, 他人草稿返 4013.",
)
async def cases_drafts_delete(
    request: DraftDeleteRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[DraftDeleteResponse]:
    data = await case_creation_service.delete_draft(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[DraftDeleteResponse](data=data)


@router.post(
    "/from-clue/prepare",
    response_model=StandardResponse[FromCluePrepareResponse],
    summary="案件详情 - 从线索预填草稿 payload",
    description="纯只读, 不改 clue.status. Q7 默认 case_type_code=CIVIL_LITIGATION. "
                "CONVERTED 状态的线索拒 4003.",
)
async def cases_from_clue_prepare(
    request: FromCluePrepareRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[FromCluePrepareResponse]:
    data = await case_creation_service.prepare_from_clue(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[FromCluePrepareResponse](data=data)


# --- 别名端点 (D5/D6 路由级 thin wrapper, 直接复用 S3/S4 service) ---


@router.post(
    "/activities/query",
    response_model=StandardResponse[AuditLogQueryResponse],
    summary="案件详情 - 活动流聚合查询 (S3 audit-logs/query 别名)",
    description="与 /audit-logs/query 同一 service, 前端语义更直观 (Activities = 活动流). "
                "权限: 案件成员.",
)
async def cases_activities_query(
    request: AuditLogQueryRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[AuditLogQueryResponse]:
    data = await case_parties_service.query_audit_logs(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[AuditLogQueryResponse](data=data)


@router.post(
    "/memos/add",
    response_model=StandardResponse[MemoAddResponse],
    summary="案件详情 - 添加备注 (case_memos)",
    description="权限: 案件成员即可 (任一读权限键 True). "
                "MemoVisibility Enum 校验. 审计 CASES.CREATE (PRE2 决策).",
)
async def cases_memos_add(
    request: MemoAddRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[MemoAddResponse]:
    data = await case_memo_service.add_memo(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[MemoAddResponse](data=data)


@router.post(
    "/milestones/complete",
    response_model=StandardResponse[ProcessNodeVO],
    summary="案件详情 - 完成里程碑 (S4 process/nodes/complete 别名)",
    description="D6=A 别名复用 S4 complete_node. milestone = process_nodes(node_type=MILESTONE). "
                "权限: can_manage_process.",
)
async def cases_milestones_complete(
    request: NodeCompleteRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[ProcessNodeVO]:
    data = await case_process_service.complete_node(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[ProcessNodeVO](data=data)


@router.post(
    "/collaboration/create",
    response_model=StandardResponse[CaseActionItemVO],
    summary="案件详情 - 创建协作任务 (S4 tasks/create 别名)",
    description="D5=A 别名复用 S4 create_task. collaboration = case_action_items. "
                "权限: can_manage_process. 审计 TASK.CREATE.",
)
async def cases_collaboration_create(
    request: TaskCreateRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[CaseActionItemVO]:
    data = await case_process_service.create_task(
        db, current_user.tenant_id, request, current_user
    )
    return StandardResponse[CaseActionItemVO](data=data)


# =========================================================================
# WP-AI-01: 案件 AI 标准上下文构建
# =========================================================================


@router.post(
    "/ai/context/build",
    response_model=StandardResponse[CaseAiContextBuildResponse],
    summary="构建案件 AI 标准上下文 (WP-AI-01)",
    description=(
        "聚合案件主表、当事人、策略、卷宗、结案复盘、财务快照，"
        "生成 AI 分析标准上下文。即使只有主表字段也能返回降级上下文。"
        "权限: 案件成员 / LEGAL_ADMIN / SYS_ADMIN。"
    ),
)
async def cases_ai_context_build(
    request: CaseAiContextBuildRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StandardResponse[CaseAiContextBuildResponse]:
    data = await build_case_ai_context(
        db,
        current_user.tenant_id,
        request.case_id,
        current_user,
        request,
    )
    return StandardResponse[CaseAiContextBuildResponse](data=data)
