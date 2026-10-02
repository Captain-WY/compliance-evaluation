"""
案件大厅 (Case Hall) BFF 层 Schema 定义.

支撑切片 2.S1 - 案件大厅多视图 (列表/看板/日历/台账/统计卡).

设计要点:
1. 所有视图共享 `CaseHallFilter` 过滤条件, 保证筛选语义一致
2. 字典码字段 (case_type_code / risk_level 等) 同时返回 `_name` 快照,
   前端无需再次调用字典接口即可展示 (避免 N+1 字典查询)
3. 列表/台账分页独立于看板/日历 (后两者不分页)
4. 线索 / 任务 字段在 ListViewResponse 里预留为空列表, 待切片 2.Sx 填充
5. 所有响应字段使用 snake_case, 前端 adapter 负责转 camelCase (与既有约定一致)
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .common import PaginationParams

# custom_permissions 白名单
# 2.S3 决策 D5: 9 键 snake_case
# 2.S4-PRE 决策 D4: 扩展为 10 键, 新增 can_manage_process
_ALLOWED_CUSTOM_PERMISSION_KEYS: frozenset[str] = frozenset({
    "can_edit_overview",
    "can_edit_base_info",
    "can_change_stage",
    "can_manage_members",
    "can_manage_process",
    "can_add_memo",
    "can_view_finance",
    "can_upload_document",
    "can_close_case",
    "can_delete_case",
})


# =============================================================================
# 1. 共享过滤条件
# =============================================================================

class CaseHallFilter(BaseModel):
    """案件大厅视图共用的过滤条件. 全部字段可选, 空值视为不过滤.

    字典类字段统一使用 `list[str]` (dict_code 多选); 单值筛选传单元素列表即可.
    """
    model_config = ConfigDict(extra="forbid")

    # --- 文本搜索 ---
    keyword: str | None = Field(
        None,
        description="关键字搜索 (匹配 internal_case_no / external_case_no / case_name / plaintiff_name / defendant_name)",
        max_length=128,
    )

    # --- 字典码筛选 (多选) ---
    case_status: list[str] | None = Field(None, description="案件状态 (字典 CASE_STATUS)")
    case_type_code: list[str] | None = Field(None, description="案件类型 (字典 CASE_TYPE)")
    cause_of_action: list[str] | None = Field(None, description="案由 (字典 CAUSE_OF_ACTION)")
    risk_level: list[str] | None = Field(None, description="风险等级 (字典 RISK_LEVEL)")
    business_line: list[str] | None = Field(None, description="业务线 (字典 BUSINESS_LINE)")
    procedure_type: list[str] | None = Field(None, description="程序类型 (字典 PROCEDURE_TYPE)")
    current_stage_code: list[str] | None = Field(None, description="当前阶段 (字典 CASE_STAGE)")
    our_role: list[str] | None = Field(None, description="我方地位 (字典 OUR_ROLE)")
    # 注: 法院层级 / 地域 (COURT_LEVEL / COURT_REGION) 在设计文档 04_cases.md 中
    # 未作为案件独立列出, 案件只存 `accepting_court` 文本. 若需按层级/地域筛选,
    # 需要在 accepting_court 上做前缀匹配, 暂不提供此维度过滤.

    # --- 其他筛选 ---
    handling_lawyer_id: str | None = Field(None, description="经办律师 ID (精确匹配)", max_length=36)
    show_master_only: bool = Field(False, description="仅显示主案 (排除子案)")

    # --- 日期区间 ---
    date_field: Literal["filing_date", "close_date", "created_at"] = Field(
        "filing_date",
        description="日期筛选的字段",
    )
    date_start: date | None = Field(None, description="日期区间开始 (含)")
    date_end: date | None = Field(None, description="日期区间结束 (含)")


# =============================================================================
# 2. 视图基础行 (列表/看板/台账共用的案件字段)
# =============================================================================

class CaseHallItem(BaseModel):
    """案件大厅各视图共用的基础行结构. 包含字典 code + name 快照."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    internal_case_no: str
    external_case_no: str | None = None
    case_name: str

    # 字典码 + 显示名 (name 为字典翻译后的快照, 可能为 null)
    case_type_code: str
    case_type_name: str | None = None
    cause_of_action: str | None = None
    cause_of_action_name: str | None = None
    business_line: str | None = None
    business_line_name: str | None = None
    risk_level: str | None = None
    risk_level_name: str | None = None
    procedure_type: str | None = None
    procedure_type_name: str | None = None
    current_stage_code: str | None = None
    current_stage_name: str | None = None
    case_status: str
    case_status_name: str | None = None
    our_role: str | None = None
    our_role_name: str | None = None

    # 扁平化业务字段
    plaintiff_name: str | None = None
    defendant_name: str | None = None
    target_amount: Decimal | None = None
    provision_amount: Decimal | None = None
    target_subject: str | None = None
    accepting_court: str | None = None
    presiding_judge: str | None = None
    handling_lawyer_id: str | None = None

    # 关联/层级
    is_main_case: bool = False
    main_case_id: str | None = None
    dispute_id: str
    latest_progress: str | None = None

    # 时间
    filing_date: date | None = None
    close_date: date | None = None
    created_at: datetime

    # 扩展数据 (供前端计算净资本风险扣减等衍生指标)
    extended_data: dict[str, Any] | None = None


# =============================================================================
# 3. 列表模式 (List View)
# =============================================================================

ListSortField = Literal["created_at", "filing_date", "close_date", "target_amount", "internal_case_no"]


class ListViewRequest(CaseHallFilter):
    """列表模式请求. 筛选条件 + 分页 + 排序."""
    pagination: PaginationParams = Field(default_factory=PaginationParams)
    sort_field: ListSortField = Field("created_at", description="排序字段")
    sort_order: Literal["asc", "desc"] = Field("desc", description="排序方向")


class ListViewData(BaseModel):
    """列表模式数据. cases 分页; clues / tasks 分期填充, 2.S1 返回空列表."""
    cases_total: int = Field(description="案件总数 (分页前)")
    cases_page: int = Field(description="当前页")
    cases_size: int = Field(description="每页数量")
    cases: list[CaseHallItem] = Field(default_factory=list)
    clues: list[dict[str, Any]] = Field(
        default_factory=list,
        description="风险线索 (切片 2.Sx 填充, 当前固定为空)",
    )
    tasks: list[dict[str, Any]] = Field(
        default_factory=list,
        description="待办任务 (切片 2.Sx 填充, 当前固定为空)",
    )


# =============================================================================
# 4. 看板模式 (Kanban View)
# =============================================================================

class KanbanViewRequest(CaseHallFilter):
    """看板模式请求. 支持自定义列 + 每列案件数上限."""
    stage_codes: list[str] | None = Field(
        None,
        description="要展示的阶段列 (字典 CASE_STAGE). 为空则使用全部启用的 CASE_STAGE",
    )
    cases_per_column: int = Field(
        50,
        ge=1,
        le=500,
        description="每列首屏返回的案件数上限 (超出不在首屏返回, 配合 total_count 显示剩余)",
    )


class KanbanColumn(BaseModel):
    """看板列. 每列对应一个 stage_code."""
    stage_code: str
    stage_name: str
    sort_order: int
    total_count: int = Field(description="该列案件总数 (可能 > cases 数组长度)")
    cases: list[CaseHallItem] = Field(default_factory=list)


class KanbanViewData(BaseModel):
    columns: list[KanbanColumn] = Field(default_factory=list)
    clues: list[dict[str, Any]] = Field(
        default_factory=list,
        description="线索 (切片 2.Sx 填充)",
    )


# =============================================================================
# 5. 日历模式 (Calendar View)
# =============================================================================

CalendarEventType = Literal[
    "CASE_FILING",     # 案件立案日
    "CASE_CLOSE",      # 案件结案日
    "TASK_DEADLINE",   # 任务截止日 (process_nodes.deadline)
]


class CalendarEvent(BaseModel):
    """日历事件. 用于在日历视图上叠加案件关键节点与任务截止."""
    event_date: date
    event_type: CalendarEventType
    case_id: str
    case_internal_no: str
    case_name: str
    title: str = Field(description="事件标题 (如 '立案受理 | XX 案')")
    risk_level: str | None = Field(None, description="用于前端着色的风险等级")
    task_node_id: str | None = Field(
        None,
        description="若为 TASK_DEADLINE, 对应 process_nodes.id",
    )


class CalendarViewRequest(CaseHallFilter):
    range_start: date = Field(description="日历区间起 (含)")
    range_end: date = Field(description="日历区间止 (含)")


class CalendarViewData(BaseModel):
    range_start: date
    range_end: date
    events: list[CalendarEvent] = Field(default_factory=list)


# =============================================================================
# 6. 台账模式 (Ledger View) - 案件 + 财务聚合
# =============================================================================

LedgerSortField = Literal[
    "created_at", "filing_date", "target_amount", "provision_amount",
    "total_fees", "total_revenue", "estimated_liability",
]


class LedgerItem(CaseHallItem):
    """台账行. 继承 CaseHallItem 并追加财务聚合字段."""
    # 财务聚合 (实时计算, 基于 financial_transactions / estimated_liabilities / case_budgets)
    total_budget: Decimal | None = Field(None, description="案件预算额 (case_budgets.total_budget)")
    total_fees_out: Decimal = Field(0, description="已支出合计 (financial_transactions.fund_direction=OUT 汇总)")
    total_fees_in: Decimal = Field(0, description="已收入合计 (IN)")
    estimated_liability: Decimal | None = Field(
        None,
        description="当前预计负债余额 (estimated_liabilities 中该案最新 current_amount)",
    )
    currency: str = Field("CNY", description="主计价币种")


class LedgerViewRequest(CaseHallFilter):
    pagination: PaginationParams = Field(default_factory=PaginationParams)
    sort_field: LedgerSortField = Field("target_amount", description="排序字段")
    sort_order: Literal["asc", "desc"] = Field("desc", description="排序方向")


class LedgerAggregate(BaseModel):
    """台账顶部聚合卡."""
    total_cases: int
    total_target_amount: Decimal = Field(0, description="标的额总和")
    total_provision_amount: Decimal = Field(0, description="预计负债总和 (cases.provision_amount)")
    total_fees_out: Decimal = Field(0, description="已支出总和")
    total_fees_in: Decimal = Field(0, description="已收入总和")
    total_estimated_liability: Decimal = Field(0, description="最新预计负债总和")


class LedgerViewData(BaseModel):
    total: int
    page: int
    size: int
    items: list[LedgerItem] = Field(default_factory=list)
    aggregate: LedgerAggregate


class LedgerExportRequest(CaseHallFilter):
    """台账导出请求. 共用筛选条件, 无分页 / 排序 (导出全量)."""

    model_config = ConfigDict(extra="forbid")


# =============================================================================
# 7. 统计卡 (Summary Stats)
# =============================================================================

class SummaryStatsRequest(CaseHallFilter):
    """统计卡请求, 与其他视图共用筛选条件. 无分页 / 排序."""


class StatsBucket(BaseModel):
    """按某一维度的分组计数."""
    code: str
    name: str | None = None
    count: int


class SummaryStatsData(BaseModel):
    total: int = Field(description="当前筛选条件下的案件总数")
    in_progress: int = Field(description="进行中案件数 (case_status=IN_PROGRESS)")
    closed: int = Field(description="已结案件数 (case_status=CLOSED)")
    suspended: int = Field(description="中止案件数")
    pending: int = Field(description="待立案件数")
    major_risk: int = Field(description="重大风险案件数 (risk_level=MAJOR)")
    new_this_month: int = Field(description="本月新立案件数")
    closing_soon: int = Field(description="未来 30 天有流程节点到期的案件数")
    overdue_tasks: int = Field(description="存在已逾期未完成任务节点的案件数")
    total_amount: Decimal = Field(default=Decimal(0), description="标的额合计 (target_amount 求和, 元为单位)")

    by_stage: list[StatsBucket] = Field(default_factory=list, description="按阶段分组")
    by_risk_level: list[StatsBucket] = Field(default_factory=list, description="按风险等级分组")
    by_business_line: list[StatsBucket] = Field(default_factory=list, description="按业务线分组")


# =============================================================================
# 8. 抽屉概要 (Drawer Summary) - 切片 2.S2.a
# =============================================================================

DrawerItemType = Literal["CASE", "CLUE", "EXECUTABLE_TASK"]


class DrawerSummaryRequest(BaseModel):
    """抽屉概要请求."""
    model_config = ConfigDict(extra="forbid")

    id: str = Field(..., description="目标事项 ID (案件 / 线索 / 任务)", max_length=36)
    item_type: DrawerItemType = Field(..., description="事项类型")


class DrawerActivityItem(BaseModel):
    """抽屉内的最新动态条目 (简化版 activity stream)."""
    id: str
    action: str = Field(description="操作描述 (如 '变更阶段为一审')")
    timestamp: datetime
    operator: str = Field(description="操作人姓名或用户 ID")


class DrawerAttachmentItem(BaseModel):
    """抽屉内附件元数据 (2.S5 切片补全实际数据, 当前阶段为空)."""
    id: str
    file_name: str
    size_bytes: int
    can_preview: bool = False
    can_download: bool = False


class _DrawerBase(BaseModel):
    """抽屉响应基类."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    key: str = Field(description="用户可读的业务编号 (案件 internal_case_no / 线索 code / 任务 code)")
    title: str
    item_type: DrawerItemType
    assignee: str | None = Field(None, description="责任人 / 经办人 (姓名或 ID)")
    recent_activities: list[DrawerActivityItem] = Field(
        default_factory=list,
        description="最新动态 (最多 5 条; 2.S2.a 暂固定为空, 2.S4/S7 补齐)",
    )


class CaseDrawerVO(_DrawerBase):
    """CASE itemType 的抽屉响应."""
    item_type: Literal["CASE"] = "CASE"
    code: str = Field(description="internal_case_no")
    case_type_code: str | None = None
    case_type_name: str | None = None
    stage_code: str | None = None
    stage_name: str | None = None
    risk_level: str | None = None
    risk_level_name: str | None = None
    case_status: str | None = None
    case_status_name: str | None = None
    target_amount: Decimal | None = None
    provision_amount: Decimal | None = None
    accepting_court: str | None = None
    cause_of_action: str | None = Field(None, description="case_cause 字典 code")
    cause_of_action_name: str | None = None
    business_line: str | None = None
    business_line_name: str | None = None
    filing_date: date | None = None
    close_date: date | None = None
    description: str | None = None
    latest_progress: str | None = None
    # 2.S2.a: 主子案关联, 供前端推导 caseType (STANDARD / SERIES_MASTER / SERIES_CHILD)
    is_main_case: bool = False
    main_case_id: str | None = None
    # 2.S2.a: 合规标志 (avoid 前端硬编码 false)
    is_investor_protection: bool = False
    is_major: bool = False
    sector: str | None = None
    sector_name: str | None = None
    # 2.S2.a: 我方地位 (前端详情头部展示)
    our_role: str | None = None
    our_role_name: str | None = None
    procedure_type: str | None = None
    procedure_type_name: str | None = None
    # 2.S2.a: 经办律师 ID 原值 (assignee 字段为姓名快照)
    handling_lawyer_id: str | None = None
    # 下一截止日 (2.S4 从 process_nodes 聚合, 当前返回 None)
    next_deadline: date | None = None
    extended_data: dict[str, Any] | None = None


class ClueDrawerVO(_DrawerBase):
    """CLUE itemType 的抽屉响应."""
    item_type: Literal["CLUE"] = "CLUE"
    status: str | None = None
    source_type: str | None = Field(None, description="上报来源")
    reporter: str | None = Field(None, description="上报人用户 ID 或姓名")
    report_date: date | None = None
    content: str | None = Field(None, description="线索正文")
    cleaned_plaintiff: str | None = None
    cleaned_amount: Decimal | None = None
    risk_level: str | None = None
    risk_level_name: str | None = None
    attachments: list[DrawerAttachmentItem] = Field(
        default_factory=list,
        description="附件列表 (2.S2.a 返回空; 2.S5 补齐)",
    )


class TaskDrawerVO(_DrawerBase):
    """EXECUTABLE_TASK itemType 的抽屉响应."""
    item_type: Literal["EXECUTABLE_TASK"] = "EXECUTABLE_TASK"
    status: str | None = None
    description: str | None = Field(None, description="任务详细要求")
    case_id: str | None = None
    case_title: str | None = None
    assignee_dept: str | None = Field(None, description="负责部门")
    creator: str | None = Field(None, description="任务发起人")
    deadline: date | None = None
    attachments: list[DrawerAttachmentItem] = Field(
        default_factory=list,
        description="附件列表 (2.S2.a 返回空; 2.S5 补齐)",
    )


# 多态联合 (前端按 item_type 判别)
DrawerSummaryData = CaseDrawerVO | ClueDrawerVO | TaskDrawerVO


# =============================================================================
# 9. 阶段变更 (Stage Change) - 切片 2.S2.a (简版; 2.S4 增强)
# =============================================================================

class StageChangeRequest(BaseModel):
    """案件阶段变更请求.

    2.S2.a 简版: 仅更新 current_stage_code; 2.S4 增强为联动里程碑自动流转。
    """
    model_config = ConfigDict(extra="forbid")

    case_id: str = Field(..., description="目标案件 ID", max_length=36)
    new_stage_code: str = Field(..., description="目标阶段 code (字典 CASE_STAGE)", max_length=64)
    remark: str | None = Field(None, description="变更备注 (写入 latest_progress 后缀)")


# =============================================================================
# 10. 案件详情页 - 右侧栏 / 概览 / 权限 / 成员管理 (切片 2.S2.b)
# =============================================================================

class CaseDetailRequest(BaseModel):
    """详情页类端点的公共请求: 只需 case_id."""
    model_config = ConfigDict(extra="forbid")
    case_id: str = Field(..., description="案件 ID", max_length=36)


class CaseMemberVO(BaseModel):
    """右侧栏 / 成员管理返回的成员条目."""
    model_config = ConfigDict(from_attributes=True)

    user_id: str
    user_name: str | None = Field(None, description="sys_users.real_name 快照; 用户未注册时可为 None")
    role_code: str = Field(description="Enum CaseMemberRole")
    role_name: str | None = None
    status: str | None = None
    join_date: date | None = None
    is_notification_muted: bool = False
    department_name: str | None = Field(None, description="用户所属部门名 (sidebar 展示用)")
    custom_permissions: dict[str, Any] | None = None


ExternalCounselSource = Literal["CASE_COUNSELS", "CASE_MEMBERS"]


class ExternalCounselVO(BaseModel):
    """sidebar 外聘律师条目.

    两个来源 (2026-04-19 偏差#1/#3 修正后合并展示):
      - CASE_COUNSELS: 来自 `case_counsels` 表 (主数据挂钩, 可能无系统账号)
      - CASE_MEMBERS : 来自 `case_members` 表 role_code=EXTERNAL_COUNSEL (已开系统账号)
    前端可按 source 区分徽章; 两个来源可能指向同一律师 (同 lawyer_id), 由前端去重展示。
    """
    model_config = ConfigDict(from_attributes=True)

    source: ExternalCounselSource = Field(description="记录来源")
    # CASE_COUNSELS 来源字段 (主数据挂钩)
    counsel_id: str | None = Field(None, description="case_counsels.id; MEMBERS 来源为 None")
    lawyer_id: str | None = Field(None, description="CASE_COUNSELS: external_lawyer_id; CASE_MEMBERS: user_id")
    lawyer_name: str
    law_firm_id: str | None = None
    law_firm_name: str | None = None
    role_in_case: str | None = Field(None, description="LEAD / CO_COUNSEL (仅 CASE_COUNSELS 来源)")
    contact_phone: str | None = None
    contact_email: str | None = None
    status: str | None = None
    # CASE_MEMBERS 来源字段
    member_id: str | None = Field(None, description="case_members.id; COUNSELS 来源为 None")
    join_date: date | None = Field(None, description="加入案件日期 (仅 CASE_MEMBERS)")
    custom_permissions: dict[str, Any] | None = None


class CaseSidebarVO(BaseModel):
    """POST /cases/detail/sidebar 响应."""
    model_config = ConfigDict(from_attributes=True)

    # 全局属性 (与抽屉同源但精简)
    case_id: str
    case_code: str
    case_name: str
    stage_code: str | None = None
    stage_name: str | None = None
    risk_level: str | None = None
    risk_level_name: str | None = None
    case_status: str
    case_status_name: str | None = None
    business_line: str | None = None
    business_line_name: str | None = None
    accepting_court: str | None = None
    filing_date: date | None = None
    close_date: date | None = None
    next_deadline: date | None = None
    target_amount: Decimal | None = None

    # 人员矩阵
    assignees: list[CaseMemberVO] = Field(
        default_factory=list,
        description="OWNER + CO_COUNSEL (核心经办人)",
    )
    followers: list[CaseMemberVO] = Field(
        default_factory=list,
        description="BUSINESS_COLLABORATOR + VIEWER (协作人 / 观察员)",
    )
    external_counsels: list[ExternalCounselVO] = Field(
        default_factory=list,
        description="case_counsels 表中的外聘律师 (非系统账号)",
    )


# ------------------- detail/overview -------------------

class OverviewPartyInfo(BaseModel):
    """概览 Tab 基础案情块."""
    plaintiff_name: str | None = None
    defendant_name: str | None = None
    our_role: str | None = None
    our_role_name: str | None = None
    cause_of_action: str | None = None
    cause_of_action_name: str | None = None
    target_amount: Decimal | None = None
    provision_amount: Decimal | None = None


class OverviewSubjectBinding(BaseModel):
    """概览 Tab 业务绑定块."""
    business_line: str | None = None
    business_line_name: str | None = None
    target_subject: str | None = None
    sector: str | None = None
    sector_name: str | None = None
    is_investor_protection: bool = False
    is_major: bool = False
    # 从 extended_data.regulatory 展开
    reg_case_code: str | None = None
    reg_cause_name: str | None = None
    security_code: str | None = None
    security_name: str | None = None


class OverviewMetricsSnapshot(BaseModel):
    """概览 Tab 轻量指标快照 (不含明细)."""
    total_budget: Decimal | None = Field(None, description="case_budgets.total_budget")
    total_fees_out: Decimal = Field(0, description="已支出合计")
    total_fees_in: Decimal = Field(0, description="已收入合计")
    estimated_liability: Decimal | None = Field(None, description="当前预计负债")
    document_count: int = 0
    document_folder_count: int = 0
    party_count: int = 0
    member_count: int = 0
    external_counsel_count: int = 0


class OverviewSummaryDetail(BaseModel):
    """从 cases.extended_data.summary_detail 解包."""
    background: str | None = None
    dispute_focus: str | None = None
    amount_text: str | None = None
    risk_assessment: str | None = None


class CaseOverviewVO(BaseModel):
    """POST /cases/detail/overview 响应."""
    case_id: str
    case_code: str
    case_name: str
    description: str | None = None
    tags: list[str] = Field(default_factory=list)
    summary_detail: OverviewSummaryDetail
    parties: OverviewPartyInfo
    subject_binding: OverviewSubjectBinding
    metrics: OverviewMetricsSnapshot
    filing_date: date | None = None
    close_date: date | None = None
    created_at: datetime


# ------------------- detail/permissions -------------------

class CasePermissionsVO(BaseModel):
    """10 键权限布尔 Map + 生效来源 (调试用, 2.S4-PRE 从 9 键扩展).

    详见 03_case_detail_sidebar_api_plan.md §2.4 权限矩阵.
    """
    case_id: str
    # 来源标注 (前端可用来做 badge)
    user_role_in_case: str | None = Field(
        None,
        description="当前用户在此案的 role_code; 未加入返回 None",
    )
    has_legal_admin: bool = Field(False, description="是否持有 LEGAL_ADMIN 全局角色")
    has_sys_admin: bool = Field(False, description="是否持有 SYS_ADMIN 全局角色")
    case_closed: bool = Field(False, description="案件是否已结案 (结案自动锁定生效依据)")

    # 10 键权限 (2.S4-PRE 决策 D4 新增 can_manage_process)
    can_edit_overview: bool = False
    can_edit_base_info: bool = False
    can_change_stage: bool = False
    can_manage_members: bool = False
    can_manage_process: bool = False
    can_add_memo: bool = False
    can_view_finance: bool = False
    can_upload_document: bool = False
    can_close_case: bool = False
    can_delete_case: bool = False


# ------------------- strategy (3.S2-PRE-2) -------------------


class StrategyGetRequest(BaseModel):
    """POST /cases/strategy/get 请求."""
    model_config = ConfigDict(extra="forbid")
    case_id: str = Field(..., max_length=36)


class StrategySaveRequest(BaseModel):
    """POST /cases/strategy/save 请求."""
    model_config = ConfigDict(extra="forbid")
    case_id: str = Field(..., max_length=36)
    direction: str = Field(..., max_length=32, description="策略方向，对应 case_strategies.strategy_type")
    win_probability: float = Field(..., ge=0, le=100, description="胜率百分比 0-100")
    analysis: str = Field(..., min_length=1, max_length=5000, description="策略分析正文")


class StrategyVO(BaseModel):
    """策略视图对象，与前端 CaseStrategy 接口对齐."""
    id: str
    case_id: str
    direction: str
    win_probability: float
    analysis: str
    updated_at: str


# ------------------- members/users/search -------------------


class MemberUserSearchRequest(BaseModel):
    """POST /cases/members/users/search 请求 (3.S2-PRE)."""
    model_config = ConfigDict(extra="forbid")

    q: str = Field("", max_length=100, description="模糊搜索关键词（real_name / username / email）")
    limit: int = Field(20, ge=1, le=50, description="最多返回条数")


class MemberUserItem(BaseModel):
    id: str
    name: str
    username: str
    email: str | None = None
    title: str | None = None
    department_id: str | None = None


class MemberUserSearchResponse(BaseModel):
    items: list[MemberUserItem]
    total: int


# ------------------- members/manage -------------------

MembersManageAction = Literal["ADD", "REMOVE", "SET_PRIMARY"]


class MembersManageRequest(BaseModel):
    """POST /cases/members/manage 请求."""
    model_config = ConfigDict(extra="forbid")

    case_id: str = Field(..., max_length=36)
    action: MembersManageAction
    role_code: str | None = Field(
        None,
        description="角色 code (ADD 必填; REMOVE/SET_PRIMARY 忽略)",
    )
    user_ids: list[str] = Field(..., description="目标用户 ID 列表", min_length=1)
    custom_permissions: dict[str, Any] | None = Field(
        None,
        description="仅 ADD 场景有效, 为该成员单独指定 custom_permissions; "
                    "键必须在 9 键白名单内, 值必须是 bool (决策 D5, 2.S3-PRE)",
    )

    @field_validator("custom_permissions")
    @classmethod
    def _check_custom_permissions(cls, v: dict[str, Any] | None) -> dict[str, Any] | None:
        """白名单校验: 键 ∈ 9 键 snake_case, 值 ∈ bool."""
        if v is None:
            return v
        for key, value in v.items():
            if key not in _ALLOWED_CUSTOM_PERMISSION_KEYS:
                raise ValueError(
                    f"custom_permissions key={key!r} not in whitelist. "
                    f"allowed={sorted(_ALLOWED_CUSTOM_PERMISSION_KEYS)}"
                )
            if not isinstance(value, bool):
                raise ValueError(
                    f"custom_permissions[{key!r}] must be bool, got {type(value).__name__}"
                )
        return v


class MembersManageResponse(BaseModel):
    """POST /cases/members/manage 响应."""
    case_id: str
    action: MembersManageAction
    affected_count: int = Field(description="实际生效行数")
    assignees: list[CaseMemberVO]
    followers: list[CaseMemberVO]
    external_members: list[CaseMemberVO] = Field(
        default_factory=list,
        description="case_members 中 role_code=EXTERNAL_COUNSEL 的条目 (已开账号的外聘律师); "
                    "与 sidebar.external_counsels 中 source=CASE_MEMBERS 的条目同源.",
    )
