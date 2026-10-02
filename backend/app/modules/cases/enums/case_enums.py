"""案件相关业务枚举 (Case Domain Enums).

定义案件核心业务字段的合法值集合。所有 Enum 继承 `str` 以便:
- JSON 序列化时自动转为字符串
- SQLAlchemy 绑定参数时自动转 value
- Pydantic v2 自动校验

注意: 这些字段在 DB 层仍为 VARCHAR(N), 校验由 Service/Schema/Model @validates 多层保护。
"""
from __future__ import annotations

from enum import Enum


class CaseStatus(str, Enum):
    """案件状态机 (cases.case_status).

    状态转换 (2.S9-PRE 扩展):
      PENDING → IN_PROGRESS → CLOSED → ARCHIVED (终态, 触发全局只读锁)
      任一状态可转 SUSPENDED 暂时中止

    ARCHIVED 语义 (D1=A):
      案件归档后, `_compute_permissions` 对所有非 SYS_ADMIN 用户返回全 False 权限,
      禁止任何写操作 (SYS_ADMIN 豁免); 详见 case_detail_ext_service.py `_ARCHIVED_ALL_DENY`.
    """
    PENDING = "PENDING"           # 待立案
    IN_PROGRESS = "IN_PROGRESS"   # 办理中
    SUSPENDED = "SUSPENDED"       # 中止
    CLOSED = "CLOSED"             # 结案 (可复盘, can_edit_overview 仍开)
    ARCHIVED = "ARCHIVED"         # 已归档 (2.S9-PRE 新增, 全局只读锁, SYS_ADMIN 豁免)


class ProcedureType(str, Enum):
    """审理程序/审级 (cases.procedure_type)."""
    FIRST_INSTANCE = "FIRST_INSTANCE"     # 一审
    SECOND_INSTANCE = "SECOND_INSTANCE"   # 二审
    RETRIAL = "RETRIAL"                   # 再审
    ENFORCEMENT = "ENFORCEMENT"           # 执行
    ARBITRATION = "ARBITRATION"           # 仲裁


class OurRole(str, Enum):
    """我方在案件中的地位 (cases.our_role)."""
    PLAINTIFF = "PLAINTIFF"         # 原告/申请人
    DEFENDANT = "DEFENDANT"         # 被告/被申请人
    THIRD_PARTY = "THIRD_PARTY"     # 第三人
    APPELLANT = "APPELLANT"         # 上诉人
    APPELLEE = "APPELLEE"           # 被上诉人


class RiskLevel(str, Enum):
    """案件风险等级 (cases.risk_level).

    注: 与前端 Case.riskLevel (中文标签) 的映射关系:
    MINOR    -> 轻微
    GENERAL  -> 一般
    IMPORTANT -> 关注
    MAJOR    -> 重大
    CRITICAL -> 特大
    """
    MINOR = "MINOR"
    GENERAL = "GENERAL"
    IMPORTANT = "IMPORTANT"
    MAJOR = "MAJOR"
    CRITICAL = "CRITICAL"


class Sector(str, Enum):
    """证券板块归属 (cases.sector)."""
    MAIN_BOARD = "MAIN_BOARD"                 # 主板
    GEM = "GEM"                               # 创业板
    STAR_MARKET = "STAR_MARKET"               # 科创板
    BEIJING_EXCHANGE = "BEIJING_EXCHANGE"     # 北交所
    NEEQ = "NEEQ"                             # 新三板
    H_SHARE = "H_SHARE"                       # 港股
    RED_CHIP = "RED_CHIP"                     # 红筹股
    BOND_MARKET = "BOND_MARKET"               # 债券市场
    OTHER = "OTHER"                           # 其他


class PartyType(str, Enum):
    """案件当事人诉讼地位 (case_parties.party_type).

    与 `OurRole` 语义重叠但不共享: `OurRole` 描述"我方在案件中的地位" (单值),
    `PartyType` 描述"任一参与方的诉讼地位" (多值, 可组合出现).
    设计依据: docs/design/v1/db/ENUM_FIELD_CATALOG.md §4.1
    """
    PLAINTIFF = "PLAINTIFF"         # 原告 / 申请人
    DEFENDANT = "DEFENDANT"         # 被告 / 被申请人
    THIRD_PARTY = "THIRD_PARTY"     # 第三人
    APPELLANT = "APPELLANT"         # 上诉人
    APPELLEE = "APPELLEE"           # 被上诉人
    RESPONDENT = "RESPONDENT"       # 答辩人 (执行/特别程序专用, 区分于 DEFENDANT)


class IdentityType(str, Enum):
    """当事人主体类型 (case_parties.identity_type).

    设计依据: docs/design/v1/db/ENUM_FIELD_CATALOG.md §4.1
    """
    NATURAL_PERSON = "NATURAL_PERSON"         # 自然人
    LEGAL_ENTITY = "LEGAL_ENTITY"             # 法人
    NON_LEGAL_ENTITY = "NON_LEGAL_ENTITY"     # 非法人组织
    GOVERNMENT = "GOVERNMENT"                 # 政府机关


class CaseMemberRole(str, Enum):
    """案件内成员角色 (case_members.role_code).

    权限矩阵详见:
    docs/design/v1/api/02_case_center/03_case_detail_sidebar_api_plan.md §2.4
    """
    OWNER = "OWNER"                                     # 主办律师
    CO_COUNSEL = "CO_COUNSEL"                           # 协办律师
    BUSINESS_COLLABORATOR = "BUSINESS_COLLABORATOR"     # 业务协作人 (非法务)
    VIEWER = "VIEWER"                                   # 观察员
    EXTERNAL_COUNSEL = "EXTERNAL_COUNSEL"               # 外部顾问


class CaseMemberStatus(str, Enum):
    """案件成员参与状态 (case_members.status)."""
    ACTIVE = "ACTIVE"           # 参与中
    INACTIVE = "INACTIVE"       # 已退出


class ProcessInstanceStatus(str, Enum):
    """流程实例生命周期 (process_instances.status).

    设计依据: docs/design/v1/09_business_logic_and_state_machines.md §6.2
    """
    ACTIVE = "ACTIVE"           # 进行中
    COMPLETED = "COMPLETED"     # 已完成 (阶段结束)
    SUSPENDED = "SUSPENDED"     # 暂停 (案件中止)
    CANCELLED = "CANCELLED"     # 撤销


class NodeType(str, Enum):
    """流程节点类型 (process_nodes.node_type).

    MILESTONE: 里程碑 (阶段级关键节点)
    TASK: 任务 (可指派可执行, 含证据任务 D8)
    DECISION: 决策点 (触发审批流)
    ACTION: 动作 (如送达/提交)
    """
    TASK = "TASK"
    DECISION = "DECISION"
    MILESTONE = "MILESTONE"
    ACTION = "ACTION"


class ProcessNodeStatus(str, Enum):
    """流程节点生命周期 (process_nodes.status).

    设计依据: docs/design/v1/09_business_logic_and_state_machines.md §6.1
    合法转换: PENDING → ACTIVE → COMPLETED | SKIPPED (终态)
    """
    PENDING = "PENDING"         # 待处理
    ACTIVE = "ACTIVE"           # 进行中
    COMPLETED = "COMPLETED"     # 已完成
    SKIPPED = "SKIPPED"         # 已跳过


class Priority(str, Enum):
    """通用优先级 (process_nodes.priority / case_action_items.priority)."""
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class ActionType(str, Enum):
    """节点动作类型 (process_nodes.action_type).

    NONE: 无特殊动作, 普通任务
    APPROVAL: 触发审批流 (approval_instances, 后续合规切片实现)
    NOTIFICATION: 发送通知
    CALLBACK: 回调下游系统
    """
    NONE = "NONE"
    APPROVAL = "APPROVAL"
    NOTIFICATION = "NOTIFICATION"
    CALLBACK = "CALLBACK"


class CaseActionItemStatus(str, Enum):
    """协作任务状态 (case_action_items.status).

    设计依据: 18_collaboration_and_execution.md
    """
    TODO = "TODO"                   # 待处理
    IN_PROGRESS = "IN_PROGRESS"     # 进行中
    DONE = "DONE"                   # 已完成
    CANCELLED = "CANCELLED"         # 已取消


class PermissionTargetType(str, Enum):
    """卷宗权限目标类型 (document_permissions.target_type / document_auth_requests.target_type).

    设计依据: docs/design/v1/db/15_document_permissions.md, 2.S5-PRE (2026-04-19)
    """
    FOLDER = "FOLDER"       # 文件夹 (含递归继承到子文件/子文件夹)
    DOCUMENT = "DOCUMENT"   # 单文档 (显式优先于文件夹继承)


class GranteeType(str, Enum):
    """被授权主体类型 (document_permissions.grantee_type).

    设计依据: docs/design/v1/db/15_document_permissions.md §3.1, 2.S5-PRE
    """
    USER = "USER"   # 具体用户
    ROLE = "ROLE"   # 按角色授权 (如全体 CO_COUNSEL)
    DEPT = "DEPT"   # 按部门授权 (如业务一部全部人员)


class PermissionType(str, Enum):
    """卷宗权限动作类型 (document_permissions.permission_type / document_auth_requests.requested_permission).

    递进语义: VIEW < DOWNLOAD < EDIT; 高阶权限天然包含低阶.
    设计依据: 2.S5-PRE 决策 D2 (不拆分权限键, 以 permission_type 做细粒度)
    """
    VIEW = "VIEW"           # 仅预览 (在线查看, 不落盘)
    DOWNLOAD = "DOWNLOAD"   # 下载
    EDIT = "EDIT"           # 编辑 (本期不实现编辑功能, 但语义预留)


class AuthRequestStatus(str, Enum):
    """授权申请状态 (document_auth_requests.status).

    2.S5-PRE 决策 D8: 轻实现, 手动 PENDING → APPROVED/REJECTED;
    EXPIRED 由定时扫描或访问时懒判断, 本期暂不强制.
    """
    PENDING = "PENDING"     # 待审批
    APPROVED = "APPROVED"   # 已批准 (同时生成 document_permissions 行)
    REJECTED = "REJECTED"   # 已拒绝
    EXPIRED = "EXPIRED"     # 已过期 (预留)


class LinkTargetType(str, Enum):
    """案件关联目标类型 (case_links.target_type)."""
    CASE = "CASE"
    CLUE = "CLUE"
    TASK = "TASK"


class LinkRelationType(str, Enum):
    """案件关联语义 (case_links.relation_type)."""
    RELATES_TO = "RELATES_TO"     # 关联 (对称)
    BLOCKS = "BLOCKS"             # 阻塞
    BLOCKED_BY = "BLOCKED_BY"     # 被阻塞
    CAUSES = "CAUSES"             # 导致


# =============================================================================
# 财务域 Enum (2.S6-PRE, 2026-04-20)
# 设计依据: docs/design/v1/db/{08,09,20,21,22}_*.md + ENUM_FIELD_CATALOG.md §4.4
# =============================================================================


class FundDirection(str, Enum):
    """资金流向 (financial_transactions.fund_direction).

    设计依据: docs/design/v1/db/08_financial_transactions.md
    """
    IN = "IN"       # 收入 / 回款
    OUT = "OUT"     # 支出 / 付款


class TransactionStatus(str, Enum):
    """财务流水状态 (financial_transactions.transaction_status).

    2.S6-PRE 决策 D8=A: 对齐设计文档 ENUM_FIELD_CATALOG.md §4.4 的
    {PENDING, APPROVED, EXECUTED, REJECTED}, 并保留代码实际使用的 CANCELLED.
    历史 COMPLETED 值需通过 alembic 011 迁移为 EXECUTED.
    """
    PENDING = "PENDING"       # 待审批
    APPROVED = "APPROVED"     # 已审批待收付
    EXECUTED = "EXECUTED"     # 已完成 (旧值 COMPLETED 迁移自此)
    REJECTED = "REJECTED"     # 已拒绝
    CANCELLED = "CANCELLED"   # 已取消


class LiabilityActionType(str, Enum):
    """计提操作类型 (estimated_liabilities.action_type).

    设计依据: docs/design/v1/db/09_estimated_liabilities.md
    """
    PROVISION = "PROVISION"     # 首次计提
    ADJUSTMENT = "ADJUSTMENT"   # 金额调整 (补提/转回)
    REVERSAL = "REVERSAL"       # 结案冲销 / 核销


class RiskProbability(str, Enum):
    """败诉可能性等级 (estimated_liabilities.risk_probability).

    IFRS/企业会计准则分级:
    - PROBABLE: 很可能败诉 (>50%)
    - POSSIBLE: 可能败诉 (10%-50%)
    - REMOTE:   极小可能 (<10%)
    """
    PROBABLE = "PROBABLE"
    POSSIBLE = "POSSIBLE"
    REMOTE = "REMOTE"


class LiabilityApprovalStatus(str, Enum):
    """预计负债审批状态 (estimated_liabilities.approval_status).

    注: 与后续 ApprovalInstance.status (S18 统一审批引擎) 区分;
    本 Enum 仅用于 estimated_liabilities 计提单的轻量审批字段.
    """
    PENDING = "PENDING"       # 法务已提交, 财务待入账
    APPROVED = "APPROVED"     # 财务已入账
    REJECTED = "REJECTED"     # 财务驳回


class CurrencyCode(str, Enum):
    """币种 (跨表: financial_transactions / case_budgets / business_line_budgets / estimated_liabilities).

    2.S6-PRE 决策产生 (原设计文档 ENUM_FIELD_CATALOG 未显式登记, 由本切片补充).
    初版只收录 4 个主流币种, 后续如有必要再扩.
    """
    CNY = "CNY"   # 人民币
    USD = "USD"   # 美元
    EUR = "EUR"   # 欧元
    HKD = "HKD"   # 港元


# =============================================================================
# 外聘律师 / 合同域 Enum (2.S7-PRE, 2026-04-20)
# 设计依据: docs/design/v1/db/16_case_counsels_and_contracts.md
#           + docs/design/v1/db/31_external_counsels_and_templates.md
#           + ENUM_FIELD_CATALOG.md §4.5
# =============================================================================


class CounselType(str, Enum):
    """代理律师来源 (case_counsels.counsel_type).

    2.S7-PRE 决策 D2: 单字段双源设计, lawyer_id 根据 counsel_type 指向不同主表:
      INTERNAL → lawyer_id == sys_users.id (内部法务)
      EXTERNAL → lawyer_id == external_lawyers.id (外聘律师)
    """
    INTERNAL = "INTERNAL"   # 内部法务
    EXTERNAL = "EXTERNAL"   # 外部律师


class CounselRoleInCase(str, Enum):
    """代理律师在案件中的角色 (case_counsels.role_in_case).

    设计依据: docs/design/v1/db/16 §2.1
    """
    LEAD = "LEAD"               # 主办代理人
    CO_COUNSEL = "CO_COUNSEL"   # 协办代理人


class CounselStatus(str, Enum):
    """代理律师在本案件的生命周期状态 (case_counsels.status).

    2.S7-PRE 决策 D5: unassign 用 status=TERMINATED 而非硬删, 保留历史轨迹.
    设计依据: docs/design/v1/db/16 §3.3 "临阵换将"
    """
    ACTIVE = "ACTIVE"           # 代理中
    TERMINATED = "TERMINATED"   # 已解聘 (临阵换将)
    COMPLETED = "COMPLETED"     # 代理结束 (随案件结案)


class ContractStatus(str, Enum):
    """外聘合同状态 (case_contracts.status).

    设计依据: docs/design/v1/db/16 §2.2
    """
    DRAFT = "DRAFT"             # 草稿
    SIGNING = "SIGNING"         # 盖章/签订中
    SIGNED = "SIGNED"           # 已签订
    COMPLETED = "COMPLETED"     # 已履行完毕
    TERMINATED = "TERMINATED"   # 已解除


class LawyerStatus(str, Enum):
    """外部律师可用状态 (external_lawyers.status).

    设计依据: docs/design/v1/db/31 §2.2; ENUM_FIELD_CATALOG §4.5
    """
    ACTIVE = "ACTIVE"           # 活跃 (可指派)
    INACTIVE = "INACTIVE"       # 离职/停用 (不可指派)


# =============================================================================
# 合规域 Enum (2.S8-PRE, 2026-04-20)
# 设计依据: docs/design/v1/db/25_alerts_and_governance.md (alerts) +
#           docs/design/v1/db/12_compliance_materials.md +
#           ENUM_FIELD_CATALOG §4.6
# 注: ReportCategory / ReportingTaskStatus 留给 S13-PRE (S13 合规中心)
# =============================================================================


class AlertLevel(str, Enum):
    """合规告警级别 (compliance_alerts.alert_level).

    设计依据: docs/design/v1/db/25_alerts_and_governance.md
    """
    CRITICAL = "CRITICAL"   # 严重
    HIGH = "HIGH"           # 高
    MEDIUM = "MEDIUM"       # 中
    LOW = "LOW"             # 低


class ComplianceAlertStatus(str, Enum):
    """合规告警处理状态 (compliance_alerts.status).

    设计依据: docs/design/v1/db/25_alerts_and_governance.md L33
    值集校准 (2.S8-PRE Batch A): 设计文档明确 `PENDING / REPORTED / EXEMPTED`
    (即"待处理 / 已报送 / 已豁免"三段式)
    """
    PENDING = "PENDING"         # 待处理
    REPORTED = "REPORTED"       # 已生成报送任务 (reporting_task_id 回填)
    EXEMPTED = "EXEMPTED"       # 已豁免/忽略 (handling_note 必填原因)


class ComplianceMaterialStatus(str, Enum):
    """合规物料审批状态 (compliance_materials.approval_status).

    设计依据: docs/design/v1/db/12_compliance_materials.md
    """
    DRAFT = "DRAFT"             # 草稿
    REVIEWING = "REVIEWING"     # 审批中
    APPROVED = "APPROVED"       # 已定稿


class DisclosureStatus(str, Enum):
    """信息披露状态 (compliance_materials.disclosure_status + regulatory.disclosure_triggered 互补).

    设计依据: docs/design/v1/db/12_compliance_materials.md
    """
    NOT_REQUIRED = "NOT_REQUIRED"             # 无需披露
    PENDING_DISCLOSURE = "PENDING_DISCLOSURE" # 待披露
    DISCLOSED = "DISCLOSED"                   # 已披露


class ChecklistStatus(str, Enum):
    """案件合规检查清单提交状态 (extended_data.regulatory.checklist_status).

    2.S8-PRE 决策 D8: 扩展 `cases.extended_data.regulatory` 子键
    """
    NOT_STARTED = "NOT_STARTED"     # 未开始
    IN_PROGRESS = "IN_PROGRESS"     # 进行中 (部分已勾选)
    COMPLETED = "COMPLETED"         # 已完成 (全部勾选)


# =============================================================================
# 结案归档域 Enum (2.S9-PRE, 2026-04-21)
# 设计依据: docs/design/v1/db/17_case_strategies_and_closures.md
#           + docs/design/v1/api/02_case_center/07_case_detail_closing_api_plan.md
#           + ENUM_FIELD_CATALOG §4.5
# =============================================================================


class ClosureType(str, Enum):
    """结案方式 (case_closures.closure_type).

    设计依据: ENUM_FIELD_CATALOG §4.5 + 17_case_strategies_and_closures.md
    """
    JUDGMENT_WON = "JUDGMENT_WON"         # 判决胜诉
    JUDGMENT_LOST = "JUDGMENT_LOST"       # 判决败诉
    SETTLED = "SETTLED"                   # 和解
    WITHDRAWN = "WITHDRAWN"               # 撤诉
    MEDIATED = "MEDIATED"                 # 调解结案


class ClosureStatus(str, Enum):
    """结案登记审批状态 (case_closures.status).

    2.S9-PRE 决策 D1: 结案流转 DRAFT → REVIEWING → APPROVED;
    主切片 archive 需 status=APPROVED 才允许归档.
    """
    DRAFT = "DRAFT"                       # 草稿 (法务起草结案信息)
    REVIEWING = "REVIEWING"               # 审批中
    APPROVED = "APPROVED"                 # 已定稿 (可进入归档流程)


# =============================================================================
# 2.S10-PRE: 案件新建与辅助功能 (Case Creation + Auxiliary)
# 设计依据: docs/design/v1/api/02_case_center/02_case_creation_api_plan.md (基础)
#           + docs/design/v1/api/02_case_center/11_case_creation_api_plan.md (新增契约)
# =============================================================================


class CaseSource(str, Enum):
    """案件来源 (cases.case_source).

    2.S10-PRE 决策: 对应 sys_dicts.CASE_SOURCE 字典 (同步维护); 仅登记 4 个标准来源;
    自定义来源留 extended_data.source_note 扩展字段.
    """
    MANUAL = "MANUAL"                       # 手动录入 (默认, NewCaseForm 直接创建)
    CLUE_CONVERSION = "CLUE_CONVERSION"     # 线索转化 (from-clue/prepare 转来)
    INBOX = "INBOX"                         # 智能收件箱 (S15 邮件解析, 预留)
    EXTERNAL_IMPORT = "EXTERNAL_IMPORT"     # 外部系统导入 (ERP/OA 批量预留)


class MemoVisibility(str, Enum):
    """备注可见性 (case_memos.visibility).

    2.S10-PRE 决策: 3 档可见性对齐设计文档 03_case_auxiliary_and_collaboration.md §2.3;
    INTERNAL_LEGAL_ONLY = 仅法务内部; PUBLIC_TO_FOLLOWERS = 案件成员 (含外聘律师, 默认);
    PUBLIC = 业务方门户可见 (S19 门户切片预留).
    """
    INTERNAL_LEGAL_ONLY = "INTERNAL_LEGAL_ONLY"    # 仅法务内部
    PUBLIC_TO_FOLLOWERS = "PUBLIC_TO_FOLLOWERS"    # 案件成员 (默认)
    PUBLIC = "PUBLIC"                              # 公开 (业务方门户)


class ClueStatus(str, Enum):
    """线索状态机 (case_clues.status).

    2.S10-PRE 决策: 对齐 docs/design/v1/db/29_case_clues.md;
    状态转换: NEW → FOLLOWING → (CONVERTED | REJECTED | CLOSED);
    CONVERTED 代表成功转为正式案件 (case_clues.converted_case_id 非空).
    """
    NEW = "NEW"                         # 新线索 (未分配/未跟进)
    FOLLOWING = "FOLLOWING"             # 跟进中
    CONVERTED = "CONVERTED"             # 已转化为正式案件 (from-clue/prepare 成功后)
    REJECTED = "REJECTED"               # 已驳回 (不立案)
    CLOSED = "CLOSED"                   # 已关闭 (过期/重复/无跟进必要)


# =============================================================================
# 2.S11-PRE: 跨案件财务看板 (Cross-Case Finance Board)
# 设计依据: docs/design/v1/api/03_finance_board/*.md (4 份, 18 端点)
# =============================================================================


class ReportingTaskStatus(str, Enum):
    """报送/报表任务状态机 (reporting_tasks.status). 共 8 值, 按 report_category 语义分两组.

    S11 语义 (INTERNAL_FINANCE): DRAFT → PROCESSING → (COMPLETED | FAILED); 任一状态可转 CANCELLED.
      异步生成流程 (D3=B FastAPI BackgroundTasks):
        1. /reports/generate 创建 task.status=DRAFT
        2. BackgroundTasks 接管 → PROCESSING
        3. 生成完成写 report_url → COMPLETED
        4. 生成异常 → FAILED + error_detail

    S14 语义 (COMPLIANCE_DISCLOSURE): DATA_PREP → PENDING_APPROVAL → APPROVED (终态); 可驳回回 DATA_PREP.
      合规报送工作流 (2.S14-PRE D2):
        1. /tasks/create 创建 task.status=DATA_PREP
        2. AI 生成草稿 + 人工润色 content_data → PENDING_APPROVAL
        3. 审批通过 → APPROVED (锁定)
    """
    DRAFT = "DRAFT"                     # 待生成 (刚创建)
    PROCESSING = "PROCESSING"           # 后台生成中
    COMPLETED = "COMPLETED"             # 生成完成, report_url 可下载
    FAILED = "FAILED"                   # 生成失败 (后台异常)
    CANCELLED = "CANCELLED"             # 手动取消
    # 2.S14-PRE D2: 合规报送工作流新增状态 (COMPLIANCE_DISCLOSURE 语义)
    DATA_PREP = "DATA_PREP"             # 数据准备中 (AI 生成草稿)
    PENDING_APPROVAL = "PENDING_APPROVAL"  # 待审批 (已提交审批流)
    APPROVED = "APPROVED"               # 已审批 (可正式报送)


class ReportCategory(str, Enum):
    """报表分类 (reporting_tasks.report_category).

    2.S11-PRE 决策 D6: S11 vs S14 职责边界显式区分;
    共享 reporting_tasks 表, 通过 report_category 字段路由不同切片.

    INTERNAL_FINANCE: S11 财务看板范围 (资金流水 / 预计负债 / 预算执行 / 律所支出)
    COMPLIANCE_DISCLOSURE: S14 合规报送范围 (监管报送 / 信息披露 / 定期报告)
    AUDIT_EXPORT: 审计导出 (通用日志导出, 跨切片)
    """
    INTERNAL_FINANCE = "INTERNAL_FINANCE"
    COMPLIANCE_DISCLOSURE = "COMPLIANCE_DISCLOSURE"
    AUDIT_EXPORT = "AUDIT_EXPORT"


# =============================================================================
# 2.S12-PRE 资产保全 Enum (3 个)
# =============================================================================


class AssetType(str, Enum):
    """资产类型 (asset_preservations.asset_type).

    2.S12-PRE D7: 按资产类型定义 asset_identifiers JSONB 子结构:
      BANK_ACCOUNT  → {bank_name, account_no, account_holder, bank_branch}
      REAL_ESTATE   → {property_cert_no, address, area_sqm, land_cert_no}
      EQUITY        → {company_name, stock_code, share_count, share_type}
      VEHICLE       → {license_plate, vin, brand, model}
      IP            → {ip_type, registration_no, ip_name}
      OTHER         → {description}
    """
    BANK_ACCOUNT = "BANK_ACCOUNT"   # 银行账户
    REAL_ESTATE = "REAL_ESTATE"     # 不动产
    EQUITY = "EQUITY"               # 股权/股票
    VEHICLE = "VEHICLE"             # 车辆
    IP = "IP"                       # 知识产权
    OTHER = "OTHER"                 # 其他


class PreservationType(str, Enum):
    """保全措施类型 (asset_preservations.preservation_type).

    对应法律手段:
      FREEZE  冻结 — 银行账户/存款冻结
      SEIZE   查封 — 不动产/股权查封
      DETAIN  扣押 — 动产（车辆等）扣押
    """
    FREEZE = "FREEZE"   # 冻结
    SEIZE = "SEIZE"     # 查封
    DETAIN = "DETAIN"   # 扣押


class PreservationStatus(str, Enum):
    """资产保全状态 (asset_preservations.status).

    2.S12-PRE D2 决策: Service 层实时计算有效状态:
      DB status=ACTIVE 且 expire_date < today → 响应中 effective_status=EXPIRED
      DB 状态仅由用户显式操作更新 (不写 EXPIRED 到 DB, 避免 cron 依赖).

    状态机 (D1/D3):
      ACTIVE  ──(/extend, 任意 status)────> ACTIVE  (更新 expire_date + extended_data)
      ACTIVE  ──(/release, status=ACTIVE)─> RELEASED (终态, 不可逆)
      ACTIVE  ──(/realize, status=ACTIVE)─> REALIZED (终态, 不可逆)
      EXPIRED (视图态) 允许 /extend 续期 (补救续期业务场景)
    """
    ACTIVE = "ACTIVE"       # 保全中
    EXPIRED = "EXPIRED"     # 已过期 (视图计算态, D2)
    RELEASED = "RELEASED"   # 已解除 (终态)
    REALIZED = "REALIZED"   # 已变现 (终态)


# =============================================================================
# 2.S13-PRE 合规治理 Enum (3 个)
# 设计依据: docs/design/v1/db/25_alerts_and_governance.md + ENUM_FIELD_CATALOG.md §4.7
# D9 决策: RuleType / RuleActionType / RuleStatus 全部注册
# =============================================================================


class RuleType(str, Enum):
    """合规规则触发类型 (compliance_rules.rule_type).

    2.S13-PRE D1=A: S13 只做 CRUD, 执行引擎留 S15+;
    本 Enum 作为字段合法值注册, Service 层暂不执行规则逻辑.
    """
    EVENT_TRIGGERED = "EVENT_TRIGGERED"   # 事件触发 (业务写操作后触发检查)
    TIME_TRIGGERED = "TIME_TRIGGERED"     # 定时触发 (定期扫描, cron)


class RuleActionType(str, Enum):
    """合规规则触发后的动作类型 (compliance_rules.action_type).

    2.S13-PRE D9: 对齐设计文档 25_alerts_and_governance.md §rule_action
    """
    GENERATE_ALERT = "GENERATE_ALERT"           # 生成合规告警
    GENERATE_TASK = "GENERATE_TASK"             # 生成报送任务 (reporting_task)
    SEND_NOTIFICATION = "SEND_NOTIFICATION"     # 发送通知 (站内信/邮件)


class RuleStatus(str, Enum):
    """合规规则生效状态 (compliance_rules.status).

    2.S13-PRE D9 + rules/toggle 端点:
      ACTIVE   规则已启用 (扫描/事件时生效)
      INACTIVE 规则已停用 (toggle 停用, 不删除)
      DRAFT    规则草稿 (编辑中, 未启用)
    """
    ACTIVE = "ACTIVE"       # 已启用
    INACTIVE = "INACTIVE"   # 已停用
    DRAFT = "DRAFT"         # 草稿


class IssueSeverity(str, Enum):
    """数据质量问题严重程度 (data_quality_issues.severity).

    2.S13-PRE D4: 与 DB DDL 对齐 (BLOCKER / WARNING);
    BLOCKER 级别不允许通过 governance/issues/ignore 忽略 (D7 权限矩阵).
    """
    BLOCKER = "BLOCKER"   # 阻断级 (逻辑矛盾, 必须修复)
    WARNING = "WARNING"   # 警告级 (缺失建议字段, 可忽略)


class IssueStatus(str, Enum):
    """数据质量问题处理状态 (data_quality_issues.status).

    2.S13-PRE D4: 统一用 PENDING (而非 OPEN), 与项目其他 status Enum 命名风格对齐.
    """
    PENDING = "PENDING"     # 待处理
    RESOLVED = "RESOLVED"   # 已解决
    IGNORED = "IGNORED"     # 已忽略 (仅 WARNING 级可忽略, D7)


class IssueType(str, Enum):
    """数据质量问题类型 (data_quality_issues.issue_type).

    2.S13-PRE 第二轮: 补录 Enum 约束, 与 governance/scan 5 条内置规则对齐.
      LOGICAL_CONTRADICTION: 数据逻辑矛盾 (如结案日期早于立案日期)
      MISSING_MANDATORY:     关键字段缺失 (如在案无当事方)
    """
    LOGICAL_CONTRADICTION = "LOGICAL_CONTRADICTION"   # 逻辑矛盾
    MISSING_MANDATORY = "MISSING_MANDATORY"           # 缺失必填项


# =============================================================================
# 2.S15-PRE: 线索管理 + 智能收件箱 Enum (3 个)
# 设计依据: docs/design/v1/db/28_inbox_emails.md + 29_case_clues.md
# D1=全POST BFF / D3=Stub邮件同步 / D4=Stub AI / D5=租户全员可见
# =============================================================================


class ClueSourceType(str, Enum):
    """线索来源类型 (case_clues.source_type).

    2.S15-PRE D3: 真实邮件同步留 S17+; S15 只做 CRUD.
    EMAIL  — 由智能收件箱一键转入 (source_id = inbox_emails.id)
    MANUAL — 法务手工录入
    API    — 业务系统 API 推送
    """
    EMAIL = "EMAIL"    # 智能收件箱转入
    MANUAL = "MANUAL"  # 手工录入
    API = "API"        # 业务系统推送


class InboxEmailProcessingStatus(str, Enum):
    """收件箱邮件处理状态 (inbox_emails.processing_status).

    状态机: UNPROCESSED → (CONVERTED_TO_CLUE | LINKED_TO_CASE | IGNORED)
    三种终态均不可逆 (设计文档 28_inbox_emails.md §3.1).
    """
    UNPROCESSED = "UNPROCESSED"           # 未处理 (初始状态)
    CONVERTED_TO_CLUE = "CONVERTED_TO_CLUE"  # 已转线索 (终态)
    LINKED_TO_CASE = "LINKED_TO_CASE"    # 已关联案件 (终态)
    IGNORED = "IGNORED"                  # 已忽略/归档 (终态)


class AiRecommendation(str, Enum):
    """AI 处理建议 (inbox_emails.ai_recommendation).

    2.S15-PRE D4=Stub: 收件箱 AI 摘要/建议均返回占位值;
    S17 Legal Brain 接入 Qwen 后替换真实推断逻辑.
    """
    SUGGEST_CLUE = "SUGGEST_CLUE"   # 建议转线索
    SUGGEST_LINK = "SUGGEST_LINK"   # 建议关联案件
    SPAM = "SPAM"                   # 疑似垃圾邮件
    INFO = "INFO"                   # 普通通知邮件


# =============================================================================
# 2.S16-PRE: RBAC 管理端 Enum (2 个)
# 设计依据: docs/design/v1/api/06_admin/01_rbac_admin_api_plan.md
# D8: 菜单树深度最多 3 层 (DIR → MENU → BUTTON)
# =============================================================================


class MenuType(str, Enum):
    """菜单节点类型 (sys_menus.menu_type).

    D8: 树深度 DIR(L1) → MENU(L2) → BUTTON(L3), BUTTON 不可有子节点.
    """
    DIR = "DIR"        # 目录（一级，不可直接访问路由）
    MENU = "MENU"      # 菜单（二级，对应前端路由）
    BUTTON = "BUTTON"  # 按钮（三级，叶节点，控制页面内操作权限）


class SystemEntityStatus(str, Enum):
    """系统实体启用状态 (sys_roles.status / sys_menus.status).

    用于角色与菜单的启停控制; 停用后前端不展示对应菜单或权限.
    """
    ACTIVE = "ACTIVE"      # 启用
    INACTIVE = "INACTIVE"  # 停用


# =============================================================================
# 2.S17-PRE: 律所/模板资源库 Enum (4 个)
# 设计依据: docs/design/v1/db/31_external_counsels_and_templates.md
# D1=A: 文书模板直接返回 file_url; D2=A: 流程/任务模板管理端 CRUD 归入 S17
# =============================================================================


class LawFirmCooperationStatus(str, Enum):
    """律所合作状态 (law_firms.cooperation_status).

    CORE       — 核心库 (优先推荐)
    BACKUP     — 备选库 (核心库不可用时使用)
    BLACKLISTED — 黑名单 (禁止合作)
    """
    CORE = "CORE"
    BACKUP = "BACKUP"
    BLACKLISTED = "BLACKLISTED"


class LawFirmRatingLevel(str, Enum):
    """律所评级 (law_firms.rating_level).

    A — 优秀; B — 良好; C — 一般; D — 不推荐
    """
    A = "A"
    B = "B"
    C = "C"
    D = "D"


class TemplateCategory(str, Enum):
    """文书模板分类 (legal_doc_templates.category).

    扩展为7个标准分类，覆盖证券法务常见文书类型。
    通过 sys_dicts TEMPLATE_CATEGORY 字典同步维护，支持运行时扩展。

    LITIGATION     — 诉讼文书 (起诉书、答辩状、上诉状等)
    EVIDENCE       — 证据材料 (证据清单、举证说明、质证意见等)
    CONTRACT       — 合同协议 (外聘律师合同、保密协议、委托协议等)
    AUTHORIZATION  — 授权委托 (授权委托书、法定代表人证明等)
    REPORT         — 报告文书 (结案报告、工作报告、专项报告等)
    LETTER         — 函件文书 (律师函、催告函、告知函等)
    OTHER          — 其他 (杂项模板)
    """
    LITIGATION = "LITIGATION"
    EVIDENCE = "EVIDENCE"
    CONTRACT = "CONTRACT"
    AUTHORIZATION = "AUTHORIZATION"
    REPORT = "REPORT"
    LETTER = "LETTER"
    OTHER = "OTHER"


class TemplateFileType(str, Enum):
    """文书模板文件格式 (legal_doc_templates.file_type).

    D1=A: S17 直接返回 file_url, 不做预签名; S18 接管附件服务.
    """
    WORD = "WORD"
    PDF = "PDF"
    EXCEL = "EXCEL"


# =============================================================================
# 2.S18-PRE: 通知 / 附件 / 统一审批 Enum (5 个)
# 设计依据: docs/design/v1/db/30_unified_approvals_and_notifications.md
#           + docs/design/v1/db/35_sys_attachments.md
# D1=简化直传 / D2=单节点 / D3=不对接OA / D4=SSE / D5=简单回调注册表
# =============================================================================


class ApprovalInstanceStatus(str, Enum):
    """统一审批实例状态 (approval_instances.status).

    D2=单节点: 每个 instance 只对应一个 approval_task.
    状态流转: IN_PROGRESS → APPROVED | REJECTED | CANCELLED
    D3=不对接OA: external_process_id 字段保留但不主动同步.
    """
    IN_PROGRESS = "IN_PROGRESS"   # 审批中
    APPROVED = "APPROVED"         # 已批准
    REJECTED = "REJECTED"         # 已驳回
    CANCELLED = "CANCELLED"       # 已撤销


class ApprovalTaskStatus(str, Enum):
    """审批节点任务状态 (approval_tasks.status).

    D2=单节点: 一个 instance 只有一个节点; TRANSFERRED 保留字段但不触发新节点创建.
    """
    PENDING = "PENDING"           # 待处理
    APPROVED = "APPROVED"         # 已批准
    REJECTED = "REJECTED"         # 已驳回
    TRANSFERRED = "TRANSFERRED"   # 已转办 (记录用, D2 单节点不创建新 task)


class NotifyType(str, Enum):
    """站内通知类型 (sys_notifications.notify_type).

    TODO_TASK     — 审批待办 (approval_tasks 创建时推送)
    SYSTEM_ALERT  — 系统告警 (合规规则触发)
    MENTION       — @提及 (案件评论 @用户)
    DUE_REMINDER  — 截止提醒 (任务/保全到期前推送)
    """
    TODO_TASK = "TODO_TASK"         # 审批待办
    SYSTEM_ALERT = "SYSTEM_ALERT"   # 系统告警
    MENTION = "MENTION"             # @提及
    DUE_REMINDER = "DUE_REMINDER"   # 截止提醒


class AttachmentBusinessType(str, Enum):
    """附件关联业务类型 (sys_attachments.business_type).

    多态关联: business_type + business_id 联合定位宿主记录.
    INBOX_EMAIL      — 智能收件箱邮件附件
    CASE_CLUE        — 线索附件
    CASE_ACTION_ITEM — 协作任务附件 (外部律师门户/业务门户取证提交, 2.S19-PRE2)
    GENERAL          — 通用审批/其他附件
    """
    INBOX_EMAIL = "INBOX_EMAIL"           # 邮件附件
    CASE_CLUE = "CASE_CLUE"               # 线索附件
    CASE_ACTION_ITEM = "CASE_ACTION_ITEM" # 协作任务附件 (2.S19-PRE2 D14)
    GENERAL = "GENERAL"                   # 通用附件


class StorageProvider(str, Enum):
    """附件存储后端 (sys_attachments.storage_provider).

    D1=简化直传: 客户端直传存储后端, 后端只注册元数据.
    当前信创部署以 MINIO/OSS 为主.
    """
    OSS = "OSS"       # 阿里云 OSS / 信创 RustFS
    S3 = "S3"         # AWS S3
    MINIO = "MINIO"   # MinIO 自建
    LOCAL = "LOCAL"   # 本地文件系统 (仅开发环境)
