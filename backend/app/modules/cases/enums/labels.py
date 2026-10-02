"""Enum 中文标签映射.

BFF 响应时附带 `*_name` 快照供前端直接展示，避免前端硬编码 code→中文 翻译表。

实现说明:
    由于多个 `(str, Enum)` 子类可能定义相同的 str 值 (如 `OurRole.PLAINTIFF` 与
    `PartyType.PLAINTIFF` 同为 "PLAINTIFF"), 它们继承 str 的 `__hash__` / `__eq__` 后
    会在 dict 中互相覆盖。因此本模块内部用 `(class_name, value)` 二元组作为键,
    对外暴露 `label_of(enum_value, enum_class?)` API 保持不变。
"""
from __future__ import annotations

from enum import Enum
from typing import Dict, Optional, Tuple, Union

from app.modules.cases.enums.case_enums import (
    ActionType,
    AiRecommendation,
    MenuType,
    SystemEntityStatus,
    AlertLevel,
    AssetType,
    AuthRequestStatus,
    CaseActionItemStatus,
    CaseMemberRole,
    CaseMemberStatus,
    CaseSource,
    CaseStatus,
    ChecklistStatus,
    ClosureStatus,
    ClosureType,
    ClueSourceType,
    ClueStatus,
    ComplianceAlertStatus,
    ComplianceMaterialStatus,
    ContractStatus,
    CounselRoleInCase,
    CounselStatus,
    CounselType,
    CurrencyCode,
    DisclosureStatus,
    FundDirection,
    GranteeType,
    IdentityType,
    InboxEmailProcessingStatus,
    IssueSeverity,
    IssueStatus,
    IssueType,
    LawyerStatus,
    LiabilityActionType,
    LiabilityApprovalStatus,
    LinkRelationType,
    LinkTargetType,
    MemoVisibility,
    NodeType,
    OurRole,
    PartyType,
    PermissionTargetType,
    PermissionType,
    PreservationStatus,
    PreservationType,
    Priority,
    ProcedureType,
    ProcessInstanceStatus,
    ProcessNodeStatus,
    ReportCategory,
    ReportingTaskStatus,
    RiskLevel,
    RiskProbability,
    RuleActionType,
    RuleStatus,
    RuleType,
    Sector,
    TransactionStatus,
    LawFirmCooperationStatus,
    LawFirmRatingLevel,
    TemplateCategory,
    TemplateFileType,
    # 2.S18-PRE
    ApprovalInstanceStatus,
    ApprovalTaskStatus,
    NotifyType,
    AttachmentBusinessType,
    StorageProvider,
)


def _k(e: Enum) -> Tuple[str, str]:
    """dict 键: (ClassName, value)"""
    return (e.__class__.__name__, e.value)


_LABELS: Dict[Tuple[str, str], str] = {
    # CaseStatus (2.S9-PRE 扩 ARCHIVED)
    _k(CaseStatus.PENDING): "待立案",
    _k(CaseStatus.IN_PROGRESS): "办理中",
    _k(CaseStatus.SUSPENDED): "中止",
    _k(CaseStatus.CLOSED): "结案",
    _k(CaseStatus.ARCHIVED): "已归档",
    # ProcedureType
    _k(ProcedureType.FIRST_INSTANCE): "一审",
    _k(ProcedureType.SECOND_INSTANCE): "二审",
    _k(ProcedureType.RETRIAL): "再审",
    _k(ProcedureType.ENFORCEMENT): "执行",
    _k(ProcedureType.ARBITRATION): "仲裁",
    # OurRole
    _k(OurRole.PLAINTIFF): "原告/申请人",
    _k(OurRole.DEFENDANT): "被告/被申请人",
    _k(OurRole.THIRD_PARTY): "第三人",
    _k(OurRole.APPELLANT): "上诉人",
    _k(OurRole.APPELLEE): "被上诉人",
    # RiskLevel
    _k(RiskLevel.MINOR): "轻微",
    _k(RiskLevel.GENERAL): "一般",
    _k(RiskLevel.IMPORTANT): "关注",
    _k(RiskLevel.MAJOR): "重大",
    _k(RiskLevel.CRITICAL): "特大",
    # Sector
    _k(Sector.MAIN_BOARD): "主板",
    _k(Sector.GEM): "创业板",
    _k(Sector.STAR_MARKET): "科创板",
    _k(Sector.BEIJING_EXCHANGE): "北交所",
    _k(Sector.NEEQ): "新三板",
    _k(Sector.H_SHARE): "港股",
    _k(Sector.RED_CHIP): "红筹股",
    _k(Sector.BOND_MARKET): "债券市场",
    _k(Sector.OTHER): "其他",
    # CaseMemberRole
    _k(CaseMemberRole.OWNER): "主办律师",
    _k(CaseMemberRole.CO_COUNSEL): "协办律师",
    _k(CaseMemberRole.BUSINESS_COLLABORATOR): "业务协作人",
    _k(CaseMemberRole.VIEWER): "观察员",
    _k(CaseMemberRole.EXTERNAL_COUNSEL): "外部顾问",
    # CaseMemberStatus
    _k(CaseMemberStatus.ACTIVE): "参与中",
    _k(CaseMemberStatus.INACTIVE): "已退出",
    # PartyType
    _k(PartyType.PLAINTIFF): "原告",
    _k(PartyType.DEFENDANT): "被告",
    _k(PartyType.THIRD_PARTY): "第三人",
    _k(PartyType.APPELLANT): "上诉人",
    _k(PartyType.APPELLEE): "被上诉人",
    _k(PartyType.RESPONDENT): "答辩人",
    # IdentityType
    _k(IdentityType.NATURAL_PERSON): "自然人",
    _k(IdentityType.LEGAL_ENTITY): "法人",
    _k(IdentityType.NON_LEGAL_ENTITY): "非法人组织",
    _k(IdentityType.GOVERNMENT): "政府机关",
    # ProcessInstanceStatus (2.S4-PRE)
    _k(ProcessInstanceStatus.ACTIVE): "进行中",
    _k(ProcessInstanceStatus.COMPLETED): "已完成",
    _k(ProcessInstanceStatus.SUSPENDED): "暂停",
    _k(ProcessInstanceStatus.CANCELLED): "撤销",
    # NodeType
    _k(NodeType.TASK): "任务",
    _k(NodeType.DECISION): "决策点",
    _k(NodeType.MILESTONE): "里程碑",
    _k(NodeType.ACTION): "动作",
    # ProcessNodeStatus
    _k(ProcessNodeStatus.PENDING): "待处理",
    _k(ProcessNodeStatus.ACTIVE): "进行中",
    _k(ProcessNodeStatus.COMPLETED): "已完成",
    _k(ProcessNodeStatus.SKIPPED): "已跳过",
    # Priority
    _k(Priority.LOW): "低",
    _k(Priority.MEDIUM): "中",
    _k(Priority.HIGH): "高",
    _k(Priority.CRITICAL): "紧急",
    # ActionType
    _k(ActionType.NONE): "无",
    _k(ActionType.APPROVAL): "审批",
    _k(ActionType.NOTIFICATION): "通知",
    _k(ActionType.CALLBACK): "回调",
    # CaseActionItemStatus
    _k(CaseActionItemStatus.TODO): "待处理",
    _k(CaseActionItemStatus.IN_PROGRESS): "进行中",
    _k(CaseActionItemStatus.DONE): "已完成",
    _k(CaseActionItemStatus.CANCELLED): "已取消",
    # PermissionTargetType (2.S5-PRE)
    _k(PermissionTargetType.FOLDER): "文件夹",
    _k(PermissionTargetType.DOCUMENT): "文档",
    # GranteeType
    _k(GranteeType.USER): "用户",
    _k(GranteeType.ROLE): "角色",
    _k(GranteeType.DEPT): "部门",
    # PermissionType
    _k(PermissionType.VIEW): "预览",
    _k(PermissionType.DOWNLOAD): "下载",
    _k(PermissionType.EDIT): "编辑",
    # AuthRequestStatus
    _k(AuthRequestStatus.PENDING): "待审批",
    _k(AuthRequestStatus.APPROVED): "已批准",
    _k(AuthRequestStatus.REJECTED): "已拒绝",
    _k(AuthRequestStatus.EXPIRED): "已过期",
    # LinkTargetType
    _k(LinkTargetType.CASE): "案件",
    _k(LinkTargetType.CLUE): "线索",
    _k(LinkTargetType.TASK): "任务",
    # LinkRelationType
    _k(LinkRelationType.RELATES_TO): "关联",
    _k(LinkRelationType.BLOCKS): "阻塞",
    _k(LinkRelationType.BLOCKED_BY): "被阻塞",
    _k(LinkRelationType.CAUSES): "导致",
    # FundDirection (2.S6-PRE)
    _k(FundDirection.IN): "收入/回款",
    _k(FundDirection.OUT): "支出/付款",
    # TransactionStatus (2.S6-PRE, 对齐 ENUM_FIELD_CATALOG §4.4)
    _k(TransactionStatus.PENDING): "待审批",
    _k(TransactionStatus.APPROVED): "已审批",
    _k(TransactionStatus.EXECUTED): "已完成",
    _k(TransactionStatus.REJECTED): "已拒绝",
    _k(TransactionStatus.CANCELLED): "已取消",
    # LiabilityActionType
    _k(LiabilityActionType.PROVISION): "首次计提",
    _k(LiabilityActionType.ADJUSTMENT): "调整",
    _k(LiabilityActionType.REVERSAL): "冲销",
    # RiskProbability
    _k(RiskProbability.PROBABLE): "很可能(>50%)",
    _k(RiskProbability.POSSIBLE): "可能(10%-50%)",
    _k(RiskProbability.REMOTE): "极小(<10%)",
    # LiabilityApprovalStatus
    _k(LiabilityApprovalStatus.PENDING): "待财务审批",
    _k(LiabilityApprovalStatus.APPROVED): "已入账",
    _k(LiabilityApprovalStatus.REJECTED): "已驳回",
    # CurrencyCode
    _k(CurrencyCode.CNY): "人民币",
    _k(CurrencyCode.USD): "美元",
    _k(CurrencyCode.EUR): "欧元",
    _k(CurrencyCode.HKD): "港元",
    # CounselType (2.S7-PRE)
    _k(CounselType.INTERNAL): "内部法务",
    _k(CounselType.EXTERNAL): "外部律师",
    # CounselRoleInCase
    _k(CounselRoleInCase.LEAD): "主办代理人",
    _k(CounselRoleInCase.CO_COUNSEL): "协办代理人",
    # CounselStatus
    _k(CounselStatus.ACTIVE): "代理中",
    _k(CounselStatus.TERMINATED): "已解聘",
    _k(CounselStatus.COMPLETED): "代理结束",
    # ContractStatus
    _k(ContractStatus.DRAFT): "草稿",
    _k(ContractStatus.SIGNING): "签订中",
    _k(ContractStatus.SIGNED): "已签订",
    _k(ContractStatus.COMPLETED): "已履行",
    _k(ContractStatus.TERMINATED): "已解除",
    # LawyerStatus
    _k(LawyerStatus.ACTIVE): "活跃",
    _k(LawyerStatus.INACTIVE): "停用",
    # AlertLevel (2.S8-PRE)
    _k(AlertLevel.CRITICAL): "严重",
    _k(AlertLevel.HIGH): "高",
    _k(AlertLevel.MEDIUM): "中",
    _k(AlertLevel.LOW): "低",
    # ComplianceAlertStatus (2.S8-PRE Batch A: PENDING / REPORTED / EXEMPTED)
    _k(ComplianceAlertStatus.PENDING): "待处理",
    _k(ComplianceAlertStatus.REPORTED): "已报送",
    _k(ComplianceAlertStatus.EXEMPTED): "已豁免",
    # ComplianceMaterialStatus
    _k(ComplianceMaterialStatus.DRAFT): "草稿",
    _k(ComplianceMaterialStatus.REVIEWING): "审批中",
    _k(ComplianceMaterialStatus.APPROVED): "已定稿",
    # DisclosureStatus
    _k(DisclosureStatus.NOT_REQUIRED): "无需披露",
    _k(DisclosureStatus.PENDING_DISCLOSURE): "待披露",
    _k(DisclosureStatus.DISCLOSED): "已披露",
    # ChecklistStatus
    _k(ChecklistStatus.NOT_STARTED): "未开始",
    _k(ChecklistStatus.IN_PROGRESS): "进行中",
    _k(ChecklistStatus.COMPLETED): "已完成",
    # ClosureType (2.S9-PRE)
    _k(ClosureType.JUDGMENT_WON): "判决胜诉",
    _k(ClosureType.JUDGMENT_LOST): "判决败诉",
    _k(ClosureType.SETTLED): "和解",
    _k(ClosureType.WITHDRAWN): "撤诉",
    _k(ClosureType.MEDIATED): "调解结案",
    # ClosureStatus
    _k(ClosureStatus.DRAFT): "草稿",
    _k(ClosureStatus.REVIEWING): "审批中",
    _k(ClosureStatus.APPROVED): "已定稿",
    # CaseSource (2.S10-PRE)
    _k(CaseSource.MANUAL): "手动录入",
    _k(CaseSource.CLUE_CONVERSION): "线索转化",
    _k(CaseSource.INBOX): "智能收件箱",
    _k(CaseSource.EXTERNAL_IMPORT): "外部系统导入",
    # MemoVisibility (2.S10-PRE)
    _k(MemoVisibility.INTERNAL_LEGAL_ONLY): "仅法务内部",
    _k(MemoVisibility.PUBLIC_TO_FOLLOWERS): "案件成员可见",
    _k(MemoVisibility.PUBLIC): "公开",
    # ClueStatus (2.S10-PRE)
    _k(ClueStatus.NEW): "新线索",
    _k(ClueStatus.FOLLOWING): "跟进中",
    _k(ClueStatus.CONVERTED): "已转化",
    _k(ClueStatus.REJECTED): "已驳回",
    _k(ClueStatus.CLOSED): "已关闭",
    # ReportingTaskStatus (2.S11-PRE)
    _k(ReportingTaskStatus.DRAFT): "待生成",
    _k(ReportingTaskStatus.PROCESSING): "生成中",
    _k(ReportingTaskStatus.COMPLETED): "已完成",
    _k(ReportingTaskStatus.FAILED): "生成失败",
    _k(ReportingTaskStatus.CANCELLED): "已取消",
    # ReportCategory (2.S11-PRE D6)
    _k(ReportCategory.INTERNAL_FINANCE): "财务内部报表",
    _k(ReportCategory.COMPLIANCE_DISCLOSURE): "合规披露报送",
    _k(ReportCategory.AUDIT_EXPORT): "审计导出",
    # AssetType (2.S12-PRE D7)
    _k(AssetType.BANK_ACCOUNT): "银行账户",
    _k(AssetType.REAL_ESTATE): "不动产",
    _k(AssetType.EQUITY): "股权/股票",
    _k(AssetType.VEHICLE): "车辆",
    _k(AssetType.IP): "知识产权",
    _k(AssetType.OTHER): "其他",
    # PreservationType (2.S12-PRE)
    _k(PreservationType.FREEZE): "冻结",
    _k(PreservationType.SEIZE): "查封",
    _k(PreservationType.DETAIN): "扣押",
    # PreservationStatus (2.S12-PRE D2)
    _k(PreservationStatus.ACTIVE): "保全中",
    _k(PreservationStatus.EXPIRED): "已过期",
    _k(PreservationStatus.RELEASED): "已解除",
    _k(PreservationStatus.REALIZED): "已变现",
    # RuleType (2.S13-PRE D9)
    _k(RuleType.EVENT_TRIGGERED): "事件触发",
    _k(RuleType.TIME_TRIGGERED): "定时触发",
    # RuleActionType (2.S13-PRE D9)
    _k(RuleActionType.GENERATE_ALERT): "生成告警",
    _k(RuleActionType.GENERATE_TASK): "生成报送任务",
    _k(RuleActionType.SEND_NOTIFICATION): "发送通知",
    # RuleStatus (2.S13-PRE D9)
    _k(RuleStatus.ACTIVE): "已启用",
    _k(RuleStatus.INACTIVE): "已停用",
    _k(RuleStatus.DRAFT): "草稿",
    # IssueSeverity (2.S13-PRE D4)
    _k(IssueSeverity.BLOCKER): "阻断",
    _k(IssueSeverity.WARNING): "警告",
    # IssueStatus (2.S13-PRE D4)
    _k(IssueStatus.PENDING): "待处理",
    _k(IssueStatus.RESOLVED): "已解决",
    _k(IssueStatus.IGNORED): "已忽略",
    # IssueType (2.S13-PRE 第二轮)
    _k(IssueType.LOGICAL_CONTRADICTION): "逻辑矛盾",
    _k(IssueType.MISSING_MANDATORY): "缺失必填项",
    # ReportingTaskStatus 扩展 (2.S14-PRE D2: 合规报送工作流)
    _k(ReportingTaskStatus.DATA_PREP): "数据准备中",
    _k(ReportingTaskStatus.PENDING_APPROVAL): "待审批",
    _k(ReportingTaskStatus.APPROVED): "已审批",
    # ClueSourceType (2.S15-PRE)
    _k(ClueSourceType.EMAIL): "智能收件箱转入",
    _k(ClueSourceType.MANUAL): "手工录入",
    _k(ClueSourceType.API): "业务系统推送",
    # InboxEmailProcessingStatus (2.S15-PRE)
    _k(InboxEmailProcessingStatus.UNPROCESSED): "未处理",
    _k(InboxEmailProcessingStatus.CONVERTED_TO_CLUE): "已转线索",
    _k(InboxEmailProcessingStatus.LINKED_TO_CASE): "已关联案件",
    _k(InboxEmailProcessingStatus.IGNORED): "已忽略",
    # AiRecommendation (2.S15-PRE D4=Stub)
    _k(AiRecommendation.SUGGEST_CLUE): "建议转线索",
    _k(AiRecommendation.SUGGEST_LINK): "建议关联案件",
    _k(AiRecommendation.SPAM): "疑似垃圾邮件",
    _k(AiRecommendation.INFO): "普通通知邮件",
    # MenuType (2.S16-PRE)
    _k(MenuType.DIR): "目录",
    _k(MenuType.MENU): "菜单",
    _k(MenuType.BUTTON): "按钮",
    # SystemEntityStatus (2.S16-PRE)
    _k(SystemEntityStatus.ACTIVE): "启用",
    _k(SystemEntityStatus.INACTIVE): "停用",
    # LawFirmCooperationStatus (2.S17-PRE)
    _k(LawFirmCooperationStatus.CORE): "核心库",
    _k(LawFirmCooperationStatus.BACKUP): "备选库",
    _k(LawFirmCooperationStatus.BLACKLISTED): "黑名单",
    # LawFirmRatingLevel (2.S17-PRE)
    _k(LawFirmRatingLevel.A): "A级-优秀",
    _k(LawFirmRatingLevel.B): "B级-良好",
    _k(LawFirmRatingLevel.C): "C级-一般",
    _k(LawFirmRatingLevel.D): "D级-不推荐",
    # TemplateCategory (2.S17-PRE 扩展)
    _k(TemplateCategory.LITIGATION): "诉讼文书",
    _k(TemplateCategory.EVIDENCE): "证据材料",
    _k(TemplateCategory.CONTRACT): "合同协议",
    _k(TemplateCategory.AUTHORIZATION): "授权委托",
    _k(TemplateCategory.REPORT): "报告文书",
    _k(TemplateCategory.LETTER): "函件文书",
    _k(TemplateCategory.OTHER): "其他",
    # TemplateFileType (2.S17-PRE)
    _k(TemplateFileType.WORD): "Word文档",
    _k(TemplateFileType.PDF): "PDF文档",
    _k(TemplateFileType.EXCEL): "Excel表格",
    # ApprovalInstanceStatus (2.S18-PRE)
    _k(ApprovalInstanceStatus.IN_PROGRESS): "审批中",
    _k(ApprovalInstanceStatus.APPROVED): "已批准",
    _k(ApprovalInstanceStatus.REJECTED): "已驳回",
    _k(ApprovalInstanceStatus.CANCELLED): "已撤销",
    # ApprovalTaskStatus (2.S18-PRE)
    _k(ApprovalTaskStatus.PENDING): "待处理",
    _k(ApprovalTaskStatus.APPROVED): "已批准",
    _k(ApprovalTaskStatus.REJECTED): "已驳回",
    _k(ApprovalTaskStatus.TRANSFERRED): "已转办",
    # NotifyType (2.S18-PRE)
    _k(NotifyType.TODO_TASK): "审批待办",
    _k(NotifyType.SYSTEM_ALERT): "系统告警",
    _k(NotifyType.MENTION): "@提及",
    _k(NotifyType.DUE_REMINDER): "截止提醒",
    # AttachmentBusinessType (2.S18-PRE)
    _k(AttachmentBusinessType.INBOX_EMAIL): "邮件附件",
    _k(AttachmentBusinessType.CASE_CLUE): "线索附件",
    _k(AttachmentBusinessType.GENERAL): "通用附件",
    # StorageProvider (2.S18-PRE)
    _k(StorageProvider.OSS): "OSS/RustFS",
    _k(StorageProvider.S3): "AWS S3",
    _k(StorageProvider.MINIO): "MinIO",
    _k(StorageProvider.LOCAL): "本地存储",
}


def label_of(enum_value: Union[Enum, str, None], enum_class: Optional[type] = None) -> Optional[str]:
    """返回 Enum 值的中文标签.

    Args:
        enum_value: Enum 实例或纯 code 字符串; None 返回 None
        enum_class: 当 enum_value 为字符串时必须提供, 用于 (class_name, value) 精确命中

    Returns:
        中文标签; 未命中时返回原始 code.
    """
    if enum_value is None:
        return None
    if isinstance(enum_value, Enum):
        return _LABELS.get((enum_value.__class__.__name__, enum_value.value), str(enum_value.value))
    if isinstance(enum_value, str):
        if enum_class is None:
            # 不推荐: 只做便捷查询, 返回第一条 value 匹配的标签
            for (_cn, v), label in _LABELS.items():
                if v == enum_value:
                    return label
            return enum_value
        return _LABELS.get((enum_class.__name__, enum_value), enum_value)
    return str(enum_value)
