
export interface User {
  id: string;
  name: string;        // real_name from Casdoor
  username: string;    // login username
  role: UserRole;
  department: string;
  email?: string;
  phone?: string;
  avatarUrl?: string;
  employeeNo?: string;
  title?: string;
  departmentId?: string;
  permissions?: string[];  // permission keys from sys_menus
}

export enum UserRole {
  LEGAL_ADMIN = 'LEGAL_ADMIN',
  BUSINESS_UNIT = 'BUSINESS_UNIT',
  EXTERNAL_LAWYER = 'EXTERNAL_LAWYER'
}

// --- ACL Types Start ---

export enum PermissionLevel {
  NONE = 'NONE',         // 不可见
  METADATA = 'METADATA', // 仅列表可见（默认）
  PREVIEW = 'PREVIEW',   // 在线预览（带水印）
  DOWNLOAD = 'DOWNLOAD'  // 下载源文件
}

export interface CaseMember {
  userId: string;
  userName: string;
  role: 'OWNER' | 'MEMBER' | 'GUEST'; 
  joinedAt: string;
}

export interface DocPermission {
  id: string;
  fileId: string;
  caseId: string;
  userId: string;
  level: PermissionLevel;
  expireAt?: string;     // ISO Date string
  isOneTime?: boolean;   // 是否单次有效
  grantedBy: string;
  grantedAt: string;
}

export interface AccessRequest {
  id: string;
  caseId: string;
  fileId?: string;       // 空则申请案件可见性，有值则申请文件权限
  fileName?: string;     // 冗余字段用于显示
  applicantId: string;
  applicantName: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestLevel: PermissionLevel;
  requestDate: string;
  responseDate?: string;
  approverId?: string;
}

// --- ACL Types End ---

// ... existing code ...
export enum CaseStage {
  CLUE = '线索',
  FILING = '立案',
  FIRST_INSTANCE = '一审',
  SECOND_INSTANCE = '二审',
  ENFORCEMENT = '执行',
  CLOSED = '已结案',
  ARBITRATION = '仲裁',
  ADMIN_HEARING = '行政听证',
  ARCHIVED = '已归档'
}

// --- Stage Detail Interfaces ---

export interface PreLitigationDetail {
  mediation?: {
    status: '进行中' | '成功' | '失败' | '未开始';
    mediator?: string;
    date?: string;
    note?: string;
  };
  preservation?: {
    status: '未申请' | '已申请' | '已裁定' | '已保全' | '驳回';
    court?: string;
    amount?: number;
    rulingNo?: string;
    date?: string;
  };
}

export interface TrialPhaseDetail {
  filing?: {
    date: string;
    caseNo: string;
    court: string;
    judge?: string;
  };
  evidence?: {
    deadline: string;
    status: '未提交' | '部分提交' | '已提交' | '质证完成';
    submitDate?: string;
  };
  hearing?: {
    date: string;
    status: '待开庭' | '已开庭' | '延期';
    recordStatus?: '未上传' | '已上传';
  };
  judgment?: {
    date: string;
    result: '胜诉' | '败诉' | '部分胜诉' | '发回重审' | '和解';
    documentStatus?: '未接收' | '已接收';
    effectiveDate?: string;
  };
}

// --- Execution Module Interfaces ---

export enum ExecutionBasisType {
  JUDGMENT = '判决/裁定',
  ARBITRATION = '仲裁裁决',
  NOTARIZATION = '公证债权文书',
  MEDIATION = '调解书'
}

export enum ExecutionMeasureType {
  INQUIRY = '查询',
  SEIZURE = '查封', // 房产/车辆
  FREEZE = '冻结', // 存款/股权
  DEDUCTION = '划拨',
  AUCTION = '拍卖',
  SALE = '变卖',
  OFFSET = '以物抵债',
  LIMIT_CONSUMPTION = '限制高消费',
  BLACKLIST = '失信被执行人'
}

export interface ExecutionMeasure {
  id: string;
  type: ExecutionMeasureType;
  target: string; // 标的物描述，如 "招商银行账户 8888"
  status: '申请中' | '成功' | '失败' | '已解除';
  startDate: string;
  endDate?: string; // 到期日，用于续封提醒
  amount?: number; // 涉及金额
  rulingNo?: string; // 裁定书号
  operator: string;
}

export interface DerivativeProceeding {
  id: string;
  type: '执行异议' | '执行复议' | '执行异议之诉' | '执行和解' | '暂缓执行' | '恢复执行';
  applicant: string;
  requestDate: string;
  status: '审理中' | '已裁决' | '已结案';
  result?: string;
}

export interface ExecutionModule {
  basisType: ExecutionBasisType;
  basisDocumentNo: string; // 依据文书号
  execCaseNo: string; // 执行案号
  court: string; // 执行法院
  judge?: string;
  
  applicationDate: string; // 申请执行日
  filingDate?: string; // 执行立案日
  
  targetAmount: number; // 申请执行标的
  recoveredAmount: number; // 已执行回款
  
  measures: ExecutionMeasure[]; // 执行措施记录
  derivativeProceedings: DerivativeProceeding[]; // 衍生程序
  
  clueSubmissionDate?: string; // 财产线索提交日
  closingType?: '执行完毕' | '终结本次执行' | '执行和解' | '终结执行';
  closingDate?: string;
}

export interface CaseStageDetails {
  preLitigation?: PreLitigationDetail;
  firstInstance?: TrialPhaseDetail;
  secondInstance?: TrialPhaseDetail;
  retrial?: TrialPhaseDetail;
  execution?: ExecutionModule;
}

// ... existing code ...

// Removed duplicate Case interface

export enum RiskLevel {
  LOW = '一般',
  MEDIUM = '关注',
  HIGH = '重大',
  CRITICAL = '特大'
}

export enum BusinessLine {
  IB = '投资银行',
  PROPRIETARY = '自营投资',
  BROKERAGE = '经纪业务',
  ASSET_MGMT = '资产管理',
  CREDIT = '信用业务',
  SUPPORT = '职能支持',
  WEALTH_MGMT = '财富管理',
  RESEARCH = '研究所',
  CUSTODY = '托管业务',
  DERIVATIVES = '衍生品业务',
  INTERNATIONAL = '国际业务',
  OTHER = '其他'
}

export enum CaseType {
  STANDARD = 'STANDARD',
  SERIES_MASTER = 'SERIES_MASTER',
  SERIES_CHILD = 'SERIES_CHILD'
}

export type ProcedureType = 'CIVIL_LITIGATION' | 'ARBITRATION' | 'LABOR' | 'ADMIN';

export enum IssueType {
  CASE = 'CASE',
  CLUE = 'CLUE',
  TASK = 'TASK',
  EPIC = 'EPIC'
}

export interface RegulatoryAttributes {
  regCaseCode: string;
  regCauseName: string;
  securityCode?: string;
  securityName?: string;
  sector: '主板' | '科创板' | '创业板' | '北交所' | '债券';
  isInvestorProtection: boolean;
  isMajor: boolean;
  amountNoInterest: number;
  amountWithInterest: number;
  riskCoefficient?: number;
  estimatedRiskCapitalDeduction?: number;
}

export interface IssueLink {
  targetId: string;
  targetKey: string;
  type: 'RELATES_TO' | 'BLOCKS' | 'BLOCKED_BY' | 'CAUSES';
  description?: string;
}

export interface CaseHistoryLog {
  id: string;
  caseId: string;
  operator: string;
  timestamp: string;
  action: string;
  details: string;
}

export interface CaseComment {
  id: string;
  caseId: string;
  userId: string;
  userName: string;
  userRole: string;
  content: string;
  createdAt: string;
  isInternal: boolean;
}

export interface BaseIssue {
  id: string;
  key: string;
  title: string;
  issueType: IssueType;
  status: string;
  assignee?: string;
  createdAt: string;
  priority?: RiskLevel | string;
}

export enum CaseRole {
  PLAINTIFF = '原告/申请人',
  DEFENDANT = '被告/被申请人',
  THIRD_PARTY = '第三人'
}

export interface CaseSummaryDetail {
  background: string;       // (1) 案件背景
  disputeFocus: string;     // (2) 争议焦点
  amountText: string;       // (3) 涉案金额 (文字描述)
  riskAssessment: string;   // (4) 初步风险评估
}

export interface Case extends BaseIssue {
  code: string;
  stage: CaseStage;
  businessLine: BusinessLine;
  ourRole?: CaseRole; // New field for role analysis
  cause: string;
  riskLevel: RiskLevel;
  plaintiff: string;
  defendant: string;
  court: string;
  filingDate: string;
  nextDeadline?: string;
  calendarEventType?: 'CASE_FILING' | 'CASE_CLOSE' | 'TASK_DEADLINE';
  lawyerId?: string;
  tags?: string[];
  caseType: CaseType;
  regulatoryAttrs?: RegulatoryAttributes;
  linkedIssues?: IssueLink[];
  relatedCases?: { targetCaseId: string; relationType: string; description: string }[];
  description?: string;
  summaryDetail?: CaseSummaryDetail; // New structured summary
  isPilot?: boolean;
  parentId?: string;
  closingRecordId?: string;
  procedureType?: ProcedureType;
  authorizedMembers?: CaseMember[]; // ACL: List of users with Tier 1 access
  stageDetails?: CaseStageDetails; // New field for detailed stage tracking
  
  // Ledger Fields
  externalCaseNo?: string; // 外部案号
  targetSubject?: string; // 涉案项目/标的证券
  judge?: { name: string; phone?: string }; // 主审法官
  provisionAmount?: number; // 预计负债
}

// --- Ledger Sub-Tables ---

export interface ProcedureRecord {
  id: string;
  caseId: string;
  stage: string; // 审级/程序阶段
  nodeName: string; // 时效节点名称
  deadline: string; // 法定/约定截止日期
  completionDate?: string; // 实际完成日期
  assignee: string; // 办理人
  status: 'COMPLETED' | 'PENDING' | 'OVERDUE'; // 预警状态
  note?: string; // 结果/进展说明
}

export interface CommunicationLog {
  id: string;
  caseId: string;
  date: string; // 发生日期
  type: '跨部门协同' | '策略研讨会' | '法院沟通' | '外聘律师沟通' | '其他';
  participants: string; // 沟通对象/参与方
  summary: string; // 核心摘要记录
  attachments?: string[]; // 附件材料
  recorder: string; // 记录人
  status: '已确认' | '归档' | '待办'; // 阅办状态
}

export interface Clue extends BaseIssue {
  source: string;
  reporter: string;
  reportDate: string;
  content: string;
  attachedFiles: string[];
  cleanedPlaintiff?: string;
  cleanedDefendant?: string;
  cleanedAmount?: number;
  riskLevel?: RiskLevel;
  stage?: CaseStage; // Added for Kanban integration
}

export interface EvidenceTask extends BaseIssue {
  caseId: string;
  caseTitle: string;
  description: string;
  assigneeDept: string;
  deadline: string;
  creator?: string;
  createDate: string;
  reporter?: string;
  attachments?: string[];
  submitDate?: string;
  completionMethod?: string;
  completionNote?: string;
  rejectReason?: string;
}

export interface FinancialRecord {
  caseId: string;
  claimedAmount: number;
  judgedAmount: number;
  executedAmount: number;
  currency: string;
  legalFeeBudget: number;
  legalFeePaid: number;
  otherFeesPaid: number;
  provisionAmount: number;
  provisionStatus: '未计提' | '已确认';
}

export enum TransactionType {
  LAWYER_FEE = '律师费',
  COURT_FEE = '诉讼费',
  TRAVEL_EXPENSE = '差旅费',
  COMPENSATION_PAID = '赔偿支出',
  RECOVERY_RECEIVED = '执行回款'
}

export enum TransactionStatus {
  PAID = '已支付',
  PENDING = '审批中',
  APPROVED = '待支付'
}

export interface FeeTransaction {
  id: string;
  caseId: string;
  type: TransactionType;
  amount: number;
  currency: string;
  date: string;
  applicant: string;
  description: string;
  status: TransactionStatus;
}

export interface ProvisionLog {
  id: string;
  caseId: string;
  quarter: string;
  previousAmount: number;
  newAmount: number;
  changeReason: string;
  assessor: string;
  date: string;
}

export type DisclosureType = '临时公告' | '重大事项专报' | '累计披露预警' | '定期报告风险提示';

export interface DisclosureTask {
  id: string;
  caseId?: string;
  caseCode?: string;
  caseTitle: string;
  triggerType: DisclosureType;
  triggerReason: string;
  detectedAt: string;
  deadline: string;
  status: 'PENDING' | 'PROCESSING' | 'DONE' | 'IGNORED';
  riskLevel: RiskLevel;
  relatedRuleId?: string;
}

export interface RiskRule {
  id: string;
  name: string;
  category: 'SINGLE_CASE' | 'CUMULATIVE' | 'INDICATOR';
  conditionType: 'AMOUNT_GREATER' | 'KEYWORD_MATCH' | 'RATIO_GREATER' | 'STAGE_CHANGED';
  params: {
    value?: number;
    keywords?: string[];
    periodMonths?: number;
    baseIndicator?: string;
  };
  targetRiskLevel: RiskLevel;
  triggerType: DisclosureType;
  scanFrequency: 'REALTIME' | 'DAILY' | 'WEEKLY' | 'MONTHLY';
  isActive: boolean;
  actionType: 'GENERATE_ALERT' | 'GENERATE_TASK' | 'SEND_NOTIFICATION';
}

export interface DisclosureRecord {
  id: string;
  caseId: string;
  date: string;
  target: string;
  type: DisclosureType;
  title: string;
  contentSummary: string;
  status: string;
  operator: string;
}

export type ReportTriggerType = 'PERIODIC' | 'EVENT_DRIVEN' | 'CUMULATIVE';

export interface ReportDefinition {
  id: string;
  name: string;
  targetOrg: string;
  triggerType: ReportTriggerType;
  frequency?: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
  deadlineDay?: number;
  format: 'EXCEL' | 'WORD';
  description: string;
  scope?: 'GROUP' | 'PARENT';
  relatedRuleId?: string;
  includeNetCapital?: boolean;
}

export interface ReportingTaskLog {
  timestamp: string;
  operator: string;
  action: 'CREATED' | 'SUBMITTED_FOR_REVIEW' | 'APPROVED' | 'REJECTED' | 'FILED';
  comment?: string;
}

export interface ReportingTask {
  id: string;
  definitionId: string;
  definitionName: string;
  cycle: string;
  status: 'DRAFT' | 'REVIEWING' | 'APPROVED' | 'SUBMITTED' | 'REJECTED';
  deadline: string;
  caseCount: number;
  totalAmount: number;
  creator: string;
  createTime: string;
  submitTime?: string;
  snapshotId?: string;
  generatedFileUrl?: string;
  history?: ReportingTaskLog[];
  reviewer?: string;
}

export interface DataSnapshot {
  id: string;
  batchNo: string;
  name: string;
  lockDate: string;
  createdAt: string;
  createdBy: string;
  caseCount: number;
  totalAmount: number;
  status: 'LOCKED' | 'ARCHIVED';
  data?: Case[];
}

export interface ReportTemplate {
  id: string;
  name: string;
  targetOrg: string;
  fileFormat: 'xlsx' | 'docx';
  mappingsCount: number;
  lastUpdated: string;
}

export interface ConsistencyResult {
  id: string;
  caseId: string;
  caseCode: string;
  caseName: string;
  legalAmount: number;
  financeAmount: number;
  diff: number;
  diffRatio: number;
  isFlagged: boolean;
  reconciliationNote?: string;
}

export interface BriefingRecord {
    id: string;
    caseId: string;
    caseTitle: string;
    type: '立案签报' | '进展签报' | '结案签报' | '重大事项专报';
    generatedAt: string;
    generator: string;
    status: 'OA审批中' | '已归档' | '草稿';
    downloadUrl?: string;
    content?: string; 
}

export enum InternalReportType {
    PERIODIC = 'PERIODIC',
    EVENT_DRIVEN = 'EVENT_DRIVEN',
    SPECIAL = 'SPECIAL'
}

export enum InternalReportSubType {
    MONTHLY = 'MONTHLY',
    QUARTERLY = 'QUARTERLY',
    ANNUAL = 'ANNUAL',
    RISK_ALERT = 'RISK_ALERT',
    CASE_BRIEF = 'CASE_BRIEF',
    CUSTOM = 'CUSTOM'
}

export enum ReportTargetAudience {
    LEGAL_HEAD = 'LEGAL_HEAD',
    CRO = 'CRO',
    BOARD = 'BOARD',
    REGULATOR = 'REGULATOR'
}

export interface InternalReport {
    id: string;
    title: string;
    cycle: string; 
    type: InternalReportType;
    subType?: InternalReportSubType;
    targetAudience?: ReportTargetAudience[];
    generatedAt: string;
    status: 'SUBMITTED' | 'DRAFT' | '已汇报' | '待汇报';
    snapshotId?: string; 
    snapshotName?: string; 
    metrics: {
        totalCases: number;
        highRiskCount: number;
        totalAmount: number;
    };
    sections?: string[];
    summary?: string;
    conclusion?: string;
    attachments?: string[];
}

export interface Vendor {
  id: string;
  name: string;
  shortName?: string;
  logo?: string;
  lawyerName: string;
  specialty: string[];
  rating: number;
  status: '库内' | '黑名单' | '观察期';
  licenseNo?: string; // 执业许可证号
  contactInfo?: {
      phone: string;
      email: string;
      address?: string;
      website?: string;
  };
  teamSize?: number;
  standardRates?: {
      partner: number;
      senior: number;
      associate: number;
  };
  metrics?: {
      activeCases: number;
      totalCases: number;
      winRate: number;
      avgROI?: number;
  };
  // New fields for enhanced repository
  tags?: string[]; // e.g. "擅长金融借款", "响应快"
  reviews?: VendorReview[];
  cooperationHistory?: VendorCooperation[];
}

export interface VendorReview {
  id: string;
  caseId: string;
  caseTitle: string;
  rater: string;
  date: string;
  score: number; // 1-5
  content: string;
  dimensions?: {
    professionalism: number;
    responsiveness: number;
    outcome: number;
  };
}

export interface VendorCooperation {
  caseId: string;
  caseTitle: string;
  role: string; // e.g. "主办律师"
  startDate: string;
  endDate?: string;
  outcome?: string;
  amount?: string; // 标的额
  performanceTags?: string[]; // 实绩标签，如 "全额回款", "二审改判"
  outcomeType?: 'WIN' | 'LOSS' | 'SETTLEMENT' | 'WITHDRAWN' | 'ONGOING'; // 结果类型
}

export interface VendorTask {
    id: string;
    title: string;
    deadline: string;
    status: 'PENDING' | 'COMPLETED' | 'OVERDUE';
    caseCode: string;
}

export enum FeeModel {
  FIXED = '固定费率',
  RISK = '全风险代理',
  HYBRID = '固定+风险',
  HOURLY = '计时收费'
}

export interface LegalContract {
  id: string;
  caseId: string;
  vendorId: string;
  contractNo: string;
  title: string;
  signDate: string;
  feeModel: FeeModel;
  fixedFee: number;
  deductFixedFromRisk: boolean;
  totalCap?: number;
  riskTiers?: { minAmount: number; maxAmount: number | null; rate: number }[];
  status: 'ACTIVE' | 'EXPIRED' | 'TERMINATED';
}

export enum NodeType {
  TASK = 'TASK',
  MILESTONE = 'MILESTONE'
}

export enum NodeStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  SKIPPED = 'SKIPPED'
}

export enum NodeActionType {
  PAYMENT = 'PAYMENT',
  UPLOAD = 'UPLOAD',
  NONE = 'NONE'
}

export interface ProcessNode {
  id: string;
  key?: string;
  issueType: IssueType;
  title: string;
  type: NodeType;
  status: NodeStatus;
  completedDate?: string;
  description?: string;
  createdAt: string;
  deadline?: string;
  assignee?: string;
  requiredDocType?: string[];
  actionType?: NodeActionType;
  actionConfig?: any;
  priority?: string;
}

export interface ProcessInstance {
  id: string;
  caseId: string;
  templateId?: string;
  stageName: string;
  startDate: string;
  endDate?: string;
  nodes: ProcessNode[];
}

export interface CollaborationLog {
  id: string;
  caseId: string;
  content: string;
  targetDept: string;
  requestDate: string;
  status: 'PENDING' | 'COMPLETED';
  completedDate?: string;
  operator: string;
}

export interface CaseDocument {
  id: string;
  name: string;
  type: 'pdf' | 'doc' | 'docx' | 'xls' | 'xlsx' | 'jpg' | 'png' | 'folder' | 'other';
  category: string;
  uploadDate: string;
  uploader: string;
  size: string;
  tags?: string[];
  version: number;
  parentId?: string;
  versions?: { version: number; date: string; uploader: string; size: string }[];
  evidenceNo?: string;
  proofPurpose?: string;
}

export enum AssetType {
  REAL_ESTATE = '房产',
  BANK = '银行账户',
  EQUITY = '股权/股票',
  VEHICLE = '车辆'
}

export enum AssetStatus {
  NEW_LEAD = '新线索',
  PENDING = '待核查',
  CONTROLLED = '已查封/冻结',
  DISPOSING = '处置中',
  SOLD = '已变现',
  RELEASED = '已解封'
}

export interface AssetClue {
  id: string;
  caseId: string;
  type: AssetType;
  description: string;
  valuation: number;
  status: AssetStatus;
  controlMeasure?: string;
  controlStartDate?: string;
  controlEndDate?: string;
  ranking?: string;
  securityCode?: string;
  logs?: { date: string; content: string; operator: string }[];
  firstSeizureCourt?: string;
  firstSeizureCaseNo?: string;
  // Professional additions
  preservationRulingNo?: string; // 保全裁定书文号
  executingCourt?: string; // 执行/保全法院
}

export interface SimilarCase {
  id: string;
  title: string;
  court: string;
  date: string;
  similarity: number;
  outcome: string;
  summary: string;
}

export interface AIPrediction {
  winProbability: number;
  predictedAmount: number;
  factors: { label: string; impact: 'positive' | 'negative'; weight: number }[];
}

export type EmailCategory = 'CASE_NEW' | 'EVIDENCE_REPLY' | 'RISK_CLUE' | 'OTHER';

export interface ExtractedData {
  category: EmailCategory;
  title?: string;
  cause?: string;
  court?: string;
  plaintiff?: string;
  defendant?: string;
  amount?: number;
  riskLevel?: RiskLevel;
  filingDate?: string;
  relatedTaskId?: string;
  relatedCaseTitle?: string;
  confidence: number;
}

export interface EmailLead {
  id: string;
  subject: string;
  sender: string;
  receivedAt: string;
  bodySnippet: string;
  fullBody: string;
  attachments: { name: string; size: string; type: string }[];
  status: 'UNREAD' | 'READ' | 'CONVERTED' | 'IGNORED';
  aiAnalysis: ExtractedData;
}

export interface Party {
  id: string;
  name: string;
  type: 'COMPANY' | 'INDIVIDUAL';
  isBlacklisted: boolean;
  historyCaseCount: number;
  creditCode?: string;
}

/** 对齐后端 PartyVO（axios 拦截器已自动转换 snake_case → camelCase） */
export interface CaseParty {
  id: string;
  caseId: string;
  partyType: 'PLAINTIFF' | 'DEFENDANT' | 'THIRD_PARTY' | 'INTERESTED_PARTY';
  isOurSide: boolean;
  partyName: string;
  identityType: 'LEGAL_ENTITY' | 'INDIVIDUAL';
  identityNumber?: string;
  legalRepresentative?: string;
  contactNumber?: string;
  serviceAddress?: string;
  claimAmount?: number;
  claimDetails?: string;
  agentName?: string;
  agentLawFirm?: string;
  agentContact?: string;
  sortOrder: number;
  extendedData?: Record<string, unknown>;
  partyTypeName?: string;
  identityTypeName?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ConflictWarning {
  type: 'BLACKLIST' | 'ONGOING' | 'HISTORY';
  message: string;
  partyName?: string;
  relatedCaseId?: string;
  relatedCaseCode?: string;
  relatedCaseName?: string;
  matchSide?: 'OPPOSING' | 'OUR_SIDE';
}

export enum CaseOutcome {
  WIN = '胜诉',
  PARTIAL = '部分胜诉',
  LOSS = '败诉',
  SETTLEMENT = '和解/撤诉',
  TERMINATED = '终结执行'
}

export interface CaseClosingRecord {
  id: string;
  caseId: string;
  closeDate: string;
  outcome: CaseOutcome;
  finalImpactAmount: number;
  winLossFactors: string[];
  lessonsLearned: string;
  vendorId?: string;
  vendorRating?: number;
  vendorReview?: string;
  operator: string;
  archiveBoxNo?: string;
  isHardcopyArchived?: boolean;
  financeChecks?: { invoiceRecovered: boolean; courtRefundChecked: boolean };
  remediation?: { required: boolean; targetDept?: string; suggestion?: string };
}

export interface CaseStrategy {
  id: string;
  caseId: string;
  direction: '积极应诉' | '寻求和解' | '提起反诉' | '管辖权异议';
  winProbability: number;
  analysis: string;
  updatedAt: string;
}
