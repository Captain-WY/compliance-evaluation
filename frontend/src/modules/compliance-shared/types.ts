export type RiskLevel = 'HIGH' | 'MEDIUM' | 'LOW';
export type BusinessLine = '财富管理' | '投资银行' | '自营业务' | '资产管理';

export type IssueRectificationStatus =
  | 'DISCOVERED'
  | 'PENDING_RECTIFICATION'
  | 'RECTIFYING'
  | 'PENDING_VERIFICATION'
  | 'VERIFICATION_REJECTED'
  | 'OVERDUE'
  | 'CLOSED'
  | 'ARCHIVED';

export type IssueStatus = IssueRectificationStatus;
export type RectificationStatus = IssueRectificationStatus;

export type UserLevel =
  | 'BRANCH_OFFICE'
  | 'BRANCH_COMPANY'
  | 'LINE_HEADQUARTERS'
  | 'COMPLIANCE_DEPARTMENT'
  | 'COMPLIANCE_DIRECTOR';

export type MenuMode = 'branch-only' | 'hybrid-review' | 'full-hq';

export interface AuthPersona {
  roleId: string;
  roleName: string;
  orgId: string;
  orgName: string;
  level: UserLevel;
  dataScope: 'all' | 'organization' | 'project' | 'own';
  orgScopeIds: string[];
}

export interface AuthUser {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  title: string;
  department: string;
  organizationName: string;
  orgId: string;
  level: UserLevel;
  menuMode: MenuMode;
  permittedMenuIds: string[];
  roleIds: string[];
  permissionIds: string[];
  dataScope: 'all' | 'organization' | 'project' | 'own';
  dataScopes: Array<'all' | 'organization' | 'project' | 'own'>;
  orgScopeIds: string[];
  personas?: AuthPersona[];
  availableTaskViews?: Array<'hq' | 'branch'>;
  defaultMenuId: string;
  taskView: 'hq' | 'branch';
  avatarLabel: string;
}

export interface MockUser extends AuthUser {
  password: string;
  aliases?: string[];
}

export interface ComplianceIssue {
  id: string;
  issueCode: string; // e.g., ISS-2026-001
  title: string;
  sourceProject: string; // The inspection project it originated from
  businessLine: BusinessLine;
  responsibleDept: string;
  riskLevel: RiskLevel;
  status: IssueStatus;
  discoveryDate: string; // ISO string
  slaDeadline: string; // ISO string
  description: string;
  rectificationAdvice?: string;
  basisRule?: string; // 合规处罚依据
}

// 佐证材料接口
export interface Evidence {
  id: string;
  fileName: string;
  fileSize: string;
  uploadTime: string; // ISO string
}

// 数据填报任务接口 (Data Reporting Task)
export interface ReportingTask {
  id: string;
  category: string; // e.g., '反洗钱专项', '员工执业行为管理'
  indicatorName: string;
  description: string;
  isRequired: boolean;
  reportedValue?: string | number; // The value entered by the branch user
  evidenceList: Evidence[]; // MUST NOT BE EMPTY if reportedValue exists
  status: 'PENDING' | 'SUBMITTED';
}

// 考核初评成绩单接口 (System Initial Assessment Result)
export interface AssessmentResult {
  id: string;
  category: string;
  indicatorName: string;
  maxScore: number;
  systemScore: number; // System calculated score
  deductionReason?: string; // If systemScore < maxScore
  isDisputed: boolean; // Has the user initiated an appeal?
  evidenceList: Evidence[]; // System-provided or previously uploaded evidence
}

// AI 证据高亮接口
export interface AiEvidenceHighlight {
  indicatorId?: string;
  summary?: string; // AI 生成的一句话摘要
  location: string; // 模拟文档页码或位置，例如 "Page 12, Paragraph 3"
  keyQuote: string; // 关键证据原文
  confidence?: number; // 匹配置信度 0-1
  matchStatus?: string; // e.g., "PARTIAL_MATCH"
}

// AI 洞察结果接口
export interface AiInsights {
  summary: string;
  highlights: AiEvidenceHighlight[];
}

// 复核任务接口 (用于总部视角)
export interface ReviewTask {
  indicatorId: string;
  indicatorName: string;
  branchName: string;
  branchSelfScore: number;
  systemInitialScore: number;
  evidenceList: Evidence[];
  aiInsights?: AiInsights;
}

// 检查阶段定义
export type InspectionPhase =
  | 'PLAN_DRAFT'
  | 'PLAN_SUBMITTED'
  | 'PLAN_APPROVED'
  | 'EVIDENCE_COLLECTING'
  | 'EXECUTION_IN_PROGRESS'
  | 'FACT_CONFIRMATION'
  | 'ADJUDICATION'
  | 'REPORTING'
  | 'RECTIFICATION'
  | 'VERIFICATION'
  | 'CLOSED'
  | 'ARCHIVED'
  | 'CANCELLED';

// 检查状态定义
export type InspectionStatus =
  | 'DRAFT'
  | 'APPROVING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'SUSPENDED'
  | 'TERMINATED';

// 附件信息
export interface Attachment {
  id: string;
  fileId?: string;
  name: string;
  type: string;
  uploadTime: string;
  contentType?: string;
  fileSize?: number;
  attachmentType?: string;
  attachmentLabel?: string;
  required?: boolean;
  bindingTargetType?: string;
  businessStage?: string;
  scanStatus?: string;
  uploadedBy?: string;
}

// 检查计划/项目核心接口
export interface InspectionPlan {
  id: string;
  inspectionPlanId?: string;
  title: string;
  inspectCode: string; // 项目编号
  type: string;
  frequency: string;
  confidentialityLevel?: string | null;
  confidentialityLabel?: string | null;
  leader: string; // 项目组长
  teamMembers: string[]; // 组员
  targetDept: string; // 被检查对象
  plannedStartDate: string;
  plannedEndDate: string;
  status: InspectionStatus;
  currentPhase: InspectionPhase;
  phaseProgress: number; // 0-100
  version?: number;
  optimisticVersion?: number;
  allowedActions?: string[];
  reportReadiness?: {
    score?: number;
    factConfirmed?: boolean;
    appealsResolved?: boolean;
    blockingCodes?: string[];
    blockers?: Array<{ code: string; message: string; severity?: string }>;
  };
  
  // 附件归档情况
  files: {
    notice?: Attachment; // 检查通知
    scheme?: Attachment; // 检查方案
    workingPaperTemplate?: Attachment; // 底稿模板
    other?: Attachment; // 其他创建阶段附件
  };

  // 模拟 EKP 审批流状态
  ekpFlow?: {
    flowId?: string;
    title?: string;
    currentHandler?: string;
    status?: string;
    launchTime?: string;
    approval?: {
      status: 'PENDING' | 'APPROVED' | 'REJECTED';
      label: string;
      flowId: string;
      updatedAt: string;
    };
    dispatch?: {
      status: 'NOT_SENT' | 'SENT_PENDING_ACK' | 'PARTIALLY_ACKED' | 'FULLY_ACKED';
      label: string;
      progressText: string;
      pendingCount: number;
      totalCount: number;
      updatedAt: string;
    };
  };
  targetAcknowledgements?: InspectionPlanAcknowledgement[];
  targetOrgIds?: string[];
  targetOrgSnapshots?: Array<{ orgId: string; orgName: string }>;
}

export interface InspectionPlanAcknowledgement {
  acknowledgementId: string;
  inspectionPlanId: string;
  targetOrgId: string;
  targetOrgName: string;
  ackStatus: string;
  acknowledgedBy: string;
  acknowledgedAt: string;
  liaisonName?: string | null;
  liaisonPhone?: string | null;
  liaisonTitle?: string | null;
  createdBySnapshot?: Record<string, unknown>;
}

// 底稿执行结果枚举
export type WorkingPaperResult =
  | 'DRAFT'
  | 'RECORDED'
  | 'NEEDS_FOLLOWUP'
  | 'ISSUE_CANDIDATE'
  | 'CLOSED'
  | 'NO_ISSUE'
  | 'DEFICIENCY'
  | 'NOT_APPLICABLE'
  | 'PENDING'
  | 'COMPLETED';

// 底稿实体接口
export interface WorkingPaper {
  id: string;
  workingPaperId?: string;
  inspectionPlanId?: string;
  planId: string; // 关联的项目ID
  paperCode: string; // e.g., WP-2026-001
  title: string; // 底稿标题，如：反洗钱大额交易报告抽查
  category: string; // 分类：如：内控合规、业务合规、反洗钱
  inspector: string; // 执行人
  inspectorUserId?: string;
  inspectorSnapshot?: Record<string, unknown>;
  branchId?: string;
  targetOrgId?: string;
  targetOrgName?: string;
  targetOrgSnapshot?: Record<string, unknown>;
  guidelines: string[]; // 检查要点指引
  procedure: string; // 检查程序/步骤描述

  // 执行详情
  executionRecord: string; // 检查情况记录
  result: WorkingPaperResult;
  fileIds?: string[];
  files?: Array<{
    fileId: string;
    fileName?: string;
    contentType?: string;
    fileSize?: number;
    uploadedAt?: string;
    scanStatus?: string;
  }>;
  evidenceList: Evidence[] | string[]; // 关联的现场证据附件或 submission id

  // 问题转化
  isConvertedToIssue: boolean;
  relatedIssueId?: string | null; // 关联到中央问题库的ID
  convertedIssueId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  updateTime: string;
}

// 实施进度统计
export interface ExecutionStats {
  total: number;
  completed: number;
  deficiencyFound: number;
  noIssue: number;
}

// 机构合规维度得分
export interface DimensionScore {
  name: string; // e.g., '反洗钱', '员工行为', '内控管理'
  score: number | null;
  weight: number | null;
  issueCount: number | null; // 关联的检查问题数
}

// 机构合规画像 (Branch Compliance Portrait)
export interface BranchPortrait {
  branchId: string;
  branchName: string;
  region: '华东' | '华南' | '华北' | '华中' | '西部';
  
  // 考核数据 (From Assessment System)
  totalScore: number | null;
  rank: number | null;
  scoreTrend: Array<number | null>; // 最近6个月的得分情况
  
  // 检查数据 (From Inspection System)
  openIssues: number | null; // 未闭环问题数
  highRiskIssues: number | null; // 高风险问题数
  rectificationRate: number | null; // 整改完成率 (%)
  
  // 查考联动明细
  dimensions: DimensionScore[];
  
  // 风险状态
  riskLevel: 'SAFE' | 'WARNING' | 'CRITICAL';
}

// 全局汇总统计
export interface GlobalMetrics {
  avgComplianceScore: number | null;
  totalActiveIssues: number | null;
  overallRectificationRate: number | null;
  monthlyTrend: { month: string; score: number | null; issueCount: number | null }[];
  generatedAtRef?: string;
}

// 得分映射规则 (区间逻辑)
export interface ScoringRule {
  id: string;
  minVal: number;
  maxVal: number;
  scoreEffect: 'DEDUCTION' | 'BONUS' | 'DIRECT'; // 扣分、加分或直接给分
  points: number;
  description: string;
}

export interface IndicatorVariable {
  variableId?: string;
  variableCode: string;
  variableName: string;
  valueType: string;
  required: boolean;
}

export interface IndicatorScoringRule {
  scoringRuleId?: string;
  ruleType: string;
  effect: string;
  expression?: string | null;
  bands: Array<{
    minValue?: number | null;
    maxValue?: number | null;
    score: number;
  }>;
  rubrics?: Array<Record<string, unknown>>;
  requireContinuousBands?: boolean;
  validationStatus?: string;
  validationErrors?: Array<Record<string, unknown>>;
}

export interface IndicatorEvidenceTemplate {
  evidenceTemplateId?: string;
  templateName: string;
  required: boolean;
  acceptedFileTags: string[];
  description?: string;
}

export interface IndicatorVersion {
  versionId: string;
  indicatorId: string;
  versionNo: number;
  status: string;
  weightDefault: number;
  maxScore: number;
  scoringValidationStatus: string;
  validationErrors?: Array<Record<string, unknown>>;
  publishedByRef?: string | null;
  publishedAtRef?: string | null;
  archivedReason?: string | null;
  coreSnapshot?: Record<string, unknown>;
  variables: IndicatorVariable[];
  scoringRule?: IndicatorScoringRule | null;
  evidenceTemplates: IndicatorEvidenceTemplate[];
}

// 指标原子定义
export interface Indicator {
  id: string;
  code: string;
  name: string;
  category: string;
  categoryId?: string;
  categoryCode?: string;
  categoryName?: string;
  businessLine?: BusinessLine | string;
  dataType: 'NUMBER' | 'BOOLEAN' | 'PERCENTAGE';
  valueType?: string;
  inputMode?: string;
  dataSourceMode?: string;
  description?: string;
  defaultWeight: number;
  scoringRules: ScoringRule[]; // 预设评分规则
  activeVersionId?: string | null;
  latestVersionId?: string;
  latestVersionNo?: number;
  latestStatus?: string;
  status?: string;
  scoringValidationStatus?: string;
  schemeLinkCount?: number | null;
  version?: IndicatorVersion;
  latestVersion?: IndicatorVersion;
  displayVersion?: IndicatorVersion;
  versions?: IndicatorVersion[];
}

// 考核方案 (考卷)
export interface AssessmentScheme {
  id: string;
  title: string;
  period: '2026_Q1' | '2026_ANNUAL';
  schemeCode?: string;
  year?: number;
  frequency?: string;
  totalWeight?: number;
  itemCount?: number;
  targetGroupCount?: number;
  targetCount?: number;
  targetScopeLabel?: string;
  targetRuleLabel?: string;
  scopeSnapshot?: Array<Record<string, unknown>>;
  targetResolutionFindings?: Array<Record<string, unknown>>;
  businessLineSummary?: {
    businessLines?: string[];
    primaryBusinessLine?: string | null;
    label?: string | null;
  };
  targetGroups: string[]; // 关联的机构标签
  targetOrgIds?: string[]; // 后端方案目标机构 ID，用于真实下发范围校验
  items: Array<{
    indicatorId: string;
    actualWeight: number; // 在此方案中的权重覆盖
  }>;
  status: 'DRAFT' | 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'ARCHIVED';
  updatedAt: string;
  optimisticVersion?: number;
  publishedAtRef?: string | null;
  sourceTrace?: Record<string, unknown> | null;
  sourceTraceSummary?: Record<string, unknown> | null;
  workflowSummary?: Record<string, unknown> | null;
  scheduleSummary?: Record<string, unknown> | null;
  readinessSummary?: Record<string, unknown> | null;
  publishSummary?: Record<string, unknown> | null;
  commandAuditSummary?: Record<string, unknown> | null;
  nextRunAt?: string | null;
  lastRunAt?: string | null;
  commandAvailability?: Record<string, { enabled: boolean; reason?: string | null }>;
}

// 分支机构的填报状态枚举
export type FillStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED' | 'RECALLED';

// 单个机构的下发任务实例
export interface DistributionTask {
  id: string;
  schemeId: string; // 关联的考核方案ID
  branchName: string;
  distributeTime: string; // 下发时间
  status: FillStatus;
  progress: number; // 填报进度 0-100
  lastRemindTime?: string; // 上次催办时间
  submitTime?: string; // 分支机构提交时间
}

// 监控统计摘要
export interface SchemeMonitorStats {
  totalTarget: number;
  notStarted: number;
  inProgress: number;
  submitted: number;
  recalled: number;
}

// 任务类型枚举
export type TaskCategory = 'INSPECTION' | 'ASSESSMENT' | 'ISSUE';
export type TaskActionType = 'APPROVE' | 'SUBMIT' | 'RECTIFY' | 'REVIEW';

export interface UnifiedTaskActionTarget {
  kind: 'route';
  menuId: string;
  appPath: string;
  publicPath: string;
  params?: Record<string, string>;
  action?: string;
}

// 统一待办实体
export interface UnifiedTask {
  id: string;
  category: TaskCategory;
  actionType: TaskActionType;
  title: string; // 任务标题，例如 "关于上海分公司的自评分复核"
  description: string; // 简要描述
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  dueDate: string; // 截止日期
  status: 'PENDING' | 'DONE';
  sourceId: string; // 原业务模块的记录ID
  actionTarget: UnifiedTaskActionTarget; // 权威动作目标
  deepLink: string; // 兼容字段：可外发的真实 URL
  createdAt: string;
}

// 紧迫性预警指标
export interface UrgencyMetrics {
  daysToNextSubmission: number | null; // 距离下一次考核交卷天数
  overdueIssuesCount: number | null;   // 逾期未整改的缺陷数
  highRiskIssuesCount: number | null;  // 待处理的高风险问题数
  expiringTasksCount: number | null;   // 7天内即将到期的常规检查任务数
}

// 维度得分 (用于雷达图)
export interface RadarDimension {
  dimensionName: string; // e.g., '反洗钱', '员工行为', '内控管理'
  fullScore: number | null;     // 标准满分
  actualScore: number | null;   // 实际得分
}

// 属地化画像实体 (当前登录机构的聚合数据)
export interface LocalBranchProfile {
  branchId: string;
  branchName: string; // e.g., "上海分公司"
  generatedAtRef?: string;
  
  // 核心成绩单
  currentScore: number | null;
  rank: number | null;
  totalBranches: number | null; // 用于展示 "排名 35 / 45"
  
  // 趋势与画像
  scoreTrend: { period: string; score: number | null; companyAverage: number | null }[]; // 包含自身得分与全公司平均线的对比
  radarData: RadarDimension[];
  
  // 预警与行动
  urgency: UrgencyMetrics;
}

// 证据提交状态 (双视角枚举)
export type SubmissionStatus = 
  | 'PENDING'       // 下级：待上传 | 总部：等待中
  | 'SUBMITTED'     // 下级：已提交 | 总部：待审核
  | 'REJECTED'      // 下级：被退回 (需重传) | 总部：已退回
  | 'APPROVED'      // 下级：审核通过 | 总部：已归档
  | 'ISSUE_CREATED'; // 下级：整改中 | 总部：已转问题库

// 总部预设的证据分类标签
export type EvidenceTag = '制度文件' | '业务凭证' | '会议纪要' | '自查报告' | '系统截图';

// 单项证据需求记录
export interface EvidenceRequirement {
  id: string;
  requirementId?: string;
  inspectionId: string;
  inspectionPlanId?: string;
  title: string;          // 需求标题，如 "2026年Q1反洗钱大额交易报告"
  description: string;    // 详细要求描述
  requiredTags: EvidenceTag[]; // 总部要求必须打的标签
  dueDate: string;
  targetOrgIds?: string[];
  templateFiles?: Array<{
    name: string;
    size?: string | number;
    fileId?: string;
    url?: string;
  }>;
}

// 分支机构的提交实体
export interface EvidenceSubmission {
  id: string;
  evidenceSubmissionId?: string;
  requirementId: string;
  inspectionPlanId?: string;
  branchId: string;
  branchName: string;
  fileIds?: string[];

  // 文件信息
  files: Array<{
    fileId?: string;
    fileName?: string;
    name: string;
    url: string;
    size: string;
    type: string; // pdf, xlsx, jpg
    tags: EvidenceTag[];
  }>;

  status: SubmissionStatus;
  submitTime?: string;
  hqFeedback?: string;     // 总部退回理由
  relatedIssueId?: string; // 如果转化为问题，关联的ID
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  reviewComment?: string;
  reviewDecision?: 'APPROVE' | 'REJECT';
}

export type ExtensionStatus = 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';

export interface ExtensionRequest {
  status: ExtensionStatus;
  requestedDate?: string;
  originalDate?: string;
  rejectReason?: string;
}

// 基层的整改反馈载荷 (Feedback Payload)
export interface RectificationFeedback {
  content: string;         // 整改情况说明 (富文本或长文本)
  attachments: Array<{     // 整改佐证材料
    name: string;
    url: string;
    type: string;
  }>;
  submittedBy: string;     // 提交人 (如：张三)
  submittedAt: string;     // 提交时间
}

// 派发给基层的整改单实体
export interface RectificationRecord {
  id: string;              // 整改单流水号 (如: REC-2026-001)
  sourceIssueId: string;   // 关联的中央问题库缺陷ID
  issueDescription: string;// 缺陷摘要 (由总部下发，不可篡改)
  rectificationGoal: string; // 整改要求/目标
  riskLevel: 'HIGH' | 'MEDIUM' | 'LOW'; // 风控等级
  dueDate: string;         // 截止日期
  status: RectificationStatus;
  
  // 延期申请
  extension?: ExtensionRequest;

  // 反馈与审核数据
  feedback?: RectificationFeedback; // 基层提交后才有此数据
  hqRejectReason?: string; // 如果被总部打回，记录打回原因
}
