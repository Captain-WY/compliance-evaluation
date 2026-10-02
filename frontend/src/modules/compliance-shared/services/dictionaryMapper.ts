import type {
  BusinessLine,
  EvidenceTag,
  ExtensionStatus,
  InspectionPhase,
  InspectionStatus,
  IssueRectificationStatus,
  IssueStatus,
  MenuMode,
  RectificationStatus,
  RiskLevel,
  SubmissionStatus,
  TaskActionType,
  TaskCategory,
  UnifiedTask,
  UnifiedTaskActionTarget,
  UserLevel,
} from '../types';

export interface DictionaryEntry<TCode extends string = string> {
  code: TCode;
  label: string;
  category: string;
  description: string;
  terminal?: boolean;
}

type UnifiedTaskPriority = UnifiedTask['priority'];
type UnifiedTaskStatus = UnifiedTask['status'];
type TaskActionTargetKind = UnifiedTaskActionTarget['kind'];

const warnLegacyAlias = (category: string, value: string, canonical: string) => {
  if (import.meta.env.DEV) {
    console.warn(`[dictionary] ${category} legacy alias "${value}" mapped to "${canonical}"`);
  }
};

export const RISK_LEVELS = ['HIGH', 'MEDIUM', 'LOW'] as const satisfies readonly RiskLevel[];
export const BUSINESS_LINES = ['财富管理', '投资银行', '自营业务', '资产管理'] as const satisfies readonly BusinessLine[];

export const USER_LEVELS = [
  'BRANCH_OFFICE',
  'BRANCH_COMPANY',
  'LINE_HEADQUARTERS',
  'COMPLIANCE_DEPARTMENT',
  'COMPLIANCE_DIRECTOR',
] as const satisfies readonly UserLevel[];

export const MENU_MODES = ['branch-only', 'hybrid-review', 'full-hq'] as const satisfies readonly MenuMode[];
export const BACKEND_MENU_MODE_ALIASES = {
  branch_only: 'branch-only',
  hybrid_review: 'hybrid-review',
  full_hq: 'full-hq',
} as const satisfies Record<string, MenuMode>;

export const ISSUE_RECTIFICATION_STATUSES = [
  'DISCOVERED',
  'PENDING_RECTIFICATION',
  'RECTIFYING',
  'PENDING_VERIFICATION',
  'VERIFICATION_REJECTED',
  'OVERDUE',
  'CLOSED',
  'ARCHIVED',
] as const satisfies readonly IssueRectificationStatus[];
export const ISSUE_STATUSES = ISSUE_RECTIFICATION_STATUSES satisfies readonly IssueStatus[];
export const RECTIFICATION_STATUSES = ISSUE_RECTIFICATION_STATUSES satisfies readonly RectificationStatus[];

export const INSPECTION_PHASES = [
  'PLAN_DRAFT',
  'PLAN_SUBMITTED',
  'PLAN_APPROVED',
  'EVIDENCE_COLLECTING',
  'EXECUTION_IN_PROGRESS',
  'FACT_CONFIRMATION',
  'ADJUDICATION',
  'REPORTING',
  'RECTIFICATION',
  'VERIFICATION',
  'CLOSED',
  'ARCHIVED',
  'CANCELLED',
] as const satisfies readonly InspectionPhase[];

export const INSPECTION_PROGRESS_PHASES = [
  'PLAN_DRAFT',
  'EVIDENCE_COLLECTING',
  'REPORTING',
  'RECTIFICATION',
] as const satisfies readonly InspectionPhase[];

export const INSPECTION_STATUSES = [
  'DRAFT',
  'APPROVING',
  'IN_PROGRESS',
  'COMPLETED',
  'SUSPENDED',
  'TERMINATED',
] as const satisfies readonly InspectionStatus[];

export const TASK_CATEGORIES = ['INSPECTION', 'ASSESSMENT', 'ISSUE'] as const satisfies readonly TaskCategory[];
export const TASK_ACTION_TYPES = ['APPROVE', 'SUBMIT', 'RECTIFY', 'REVIEW'] as const satisfies readonly TaskActionType[];
export const UNIFIED_TASK_PRIORITIES = ['HIGH', 'MEDIUM', 'LOW'] as const satisfies readonly UnifiedTaskPriority[];
export const UNIFIED_TASK_STATUSES = ['PENDING', 'DONE'] as const satisfies readonly UnifiedTaskStatus[];
export const TASK_ACTION_TARGET_KINDS = ['route'] as const satisfies readonly TaskActionTargetKind[];

export const SUBMISSION_STATUSES = [
  'PENDING',
  'SUBMITTED',
  'REJECTED',
  'APPROVED',
  'ISSUE_CREATED',
] as const satisfies readonly SubmissionStatus[];
export const EVIDENCE_TAGS = ['制度文件', '业务凭证', '会议纪要', '自查报告', '系统截图'] as const satisfies readonly EvidenceTag[];
export const EXTENSION_STATUSES = ['NONE', 'PENDING', 'APPROVED', 'REJECTED'] as const satisfies readonly ExtensionStatus[];

export const ISSUE_RECTIFICATION_STATUS_DICTIONARY = [
  { code: 'DISCOVERED', label: '已发现', category: 'issue_rectification_status', description: '问题已被检查、考核或人工录入发现，尚未正式下发整改。' },
  { code: 'PENDING_RECTIFICATION', label: '待整改', category: 'issue_rectification_status', description: '问题已下发责任机构，等待提交整改反馈。' },
  { code: 'RECTIFYING', label: '整改中', category: 'issue_rectification_status', description: '责任机构正在补充材料、落实整改动作或申请延期。' },
  { code: 'PENDING_VERIFICATION', label: '待核实', category: 'issue_rectification_status', description: '责任机构已提交整改反馈，等待总部或检查组核实。' },
  { code: 'VERIFICATION_REJECTED', label: '核实退回', category: 'issue_rectification_status', description: '总部或检查组核实未通过，退回责任机构继续整改。' },
  { code: 'OVERDUE', label: '已逾期', category: 'issue_rectification_status', description: '已超过整改截止日期且尚未完成核实闭环。' },
  { code: 'CLOSED', label: '已销号', category: 'issue_rectification_status', description: '整改已通过核实，问题完成闭环。', terminal: true },
  { code: 'ARCHIVED', label: '已归档', category: 'issue_rectification_status', description: '闭环后的问题已完成归档，不再参与待办流转。', terminal: true },
] as const satisfies readonly DictionaryEntry<IssueRectificationStatus>[];

export const INSPECTION_PHASE_DICTIONARY = [
  { code: 'PLAN_DRAFT', label: '计划草稿', category: 'inspection_phase', description: '检查计划正在编制。' },
  { code: 'PLAN_SUBMITTED', label: '计划已提交', category: 'inspection_phase', description: '检查计划已提交审批。' },
  { code: 'PLAN_APPROVED', label: '计划已批准', category: 'inspection_phase', description: '检查计划已批准。' },
  { code: 'EVIDENCE_COLLECTING', label: '材料收集中', category: 'inspection_phase', description: '分支机构按要求上传非现场材料。' },
  { code: 'EXECUTION_IN_PROGRESS', label: '检查实施中', category: 'inspection_phase', description: '检查组执行底稿并形成问题线索。' },
  { code: 'FACT_CONFIRMATION', label: '事实确认中', category: 'inspection_phase', description: '分支机构确认事实或发起申辩。' },
  { code: 'ADJUDICATION', label: '申辩裁决中', category: 'inspection_phase', description: '总部裁决申辩。' },
  { code: 'REPORTING', label: '报告出具中', category: 'inspection_phase', description: '生成、签发检查报告。' },
  { code: 'RECTIFICATION', label: '整改中', category: 'inspection_phase', description: '责任机构整改问题。' },
  { code: 'VERIFICATION', label: '整改核验中', category: 'inspection_phase', description: '总部核验整改反馈。' },
  { code: 'CLOSED', label: '已闭环', category: 'inspection_phase', description: '检查主线闭环。', terminal: true },
  { code: 'ARCHIVED', label: '已归档', category: 'inspection_phase', description: '检查档案已归档。', terminal: true },
  { code: 'CANCELLED', label: '已取消', category: 'inspection_phase', description: '检查计划已取消。', terminal: true },
] as const satisfies readonly DictionaryEntry<InspectionPhase>[];

export const INSPECTION_STATUS_DICTIONARY = [
  { code: 'DRAFT', label: '草稿', category: 'inspection_status', description: '计划仍可编辑。' },
  { code: 'APPROVING', label: '审批中', category: 'inspection_status', description: '计划等待审批。' },
  { code: 'IN_PROGRESS', label: '进行中', category: 'inspection_status', description: '计划已进入执行。' },
  { code: 'COMPLETED', label: '已结项', category: 'inspection_status', description: '计划已完成。', terminal: true },
  { code: 'SUSPENDED', label: '已暂停', category: 'inspection_status', description: '计划已暂停。' },
  { code: 'TERMINATED', label: '已终止', category: 'inspection_status', description: '计划已终止。', terminal: true },
] as const satisfies readonly DictionaryEntry<InspectionStatus>[];

export const ISSUE_RECTIFICATION_STATUS_ALIASES = {
  PENDING_FIX: 'PENDING_RECTIFICATION',
  PENDING: 'PENDING_RECTIFICATION',
  IN_REFORM: 'RECTIFYING',
  UNDER_REVIEW: 'PENDING_VERIFICATION',
  PENDING_VERIFY: 'PENDING_VERIFICATION',
  COMPLETED: 'CLOSED',
  CLOSED: 'CLOSED',
  OVERDUE: 'OVERDUE',
} as const satisfies Record<string, IssueRectificationStatus>;

export const INSPECTION_PHASE_ALIASES = {
  PREPARATION: 'PLAN_DRAFT',
  EXECUTION: 'EXECUTION_IN_PROGRESS',
} as const satisfies Record<string, InspectionPhase>;

export const TASK_ACTION_TARGET_KIND_ALIASES = {
  ROUTE: 'route',
} as const satisfies Record<string, TaskActionTargetKind>;

const dictionaryMap = {
  inspection_phase: INSPECTION_PHASE_DICTIONARY,
  inspection_status: INSPECTION_STATUS_DICTIONARY,
  issue_rectification_status: ISSUE_RECTIFICATION_STATUS_DICTIONARY,
} as const;

export const getDictionaryLabel = (category: keyof typeof dictionaryMap, code: string): string => {
  const entry = dictionaryMap[category].find(item => item.code === code);
  return entry?.label ?? code;
};

export const getInspectionPhaseLabel = (phase: InspectionPhase): string =>
  getDictionaryLabel('inspection_phase', phase);

export const getInspectionPhaseShortLabel = (phase: InspectionPhase): string => {
  if (phase === 'PLAN_DRAFT' || phase === 'PLAN_SUBMITTED' || phase === 'PLAN_APPROVED') return '准备';
  if (phase === 'EVIDENCE_COLLECTING' || phase === 'EXECUTION_IN_PROGRESS') return '实施';
  if (phase === 'REPORTING' || phase === 'FACT_CONFIRMATION' || phase === 'ADJUDICATION') return '报告';
  if (phase === 'RECTIFICATION' || phase === 'VERIFICATION') return '整改';
  return getInspectionPhaseLabel(phase);
};

export const getInspectionProgressIndex = (phase: InspectionPhase): number => {
  if (phase === 'PLAN_DRAFT' || phase === 'PLAN_SUBMITTED' || phase === 'PLAN_APPROVED') return 0;
  if (phase === 'EVIDENCE_COLLECTING' || phase === 'EXECUTION_IN_PROGRESS') return 1;
  if (phase === 'FACT_CONFIRMATION' || phase === 'ADJUDICATION' || phase === 'REPORTING') return 2;
  if (phase === 'RECTIFICATION' || phase === 'VERIFICATION') return 3;
  return INSPECTION_PROGRESS_PHASES.length - 1;
};

export const normalizeInspectionPhase = (value: string): InspectionPhase => {
  if ((INSPECTION_PHASES as readonly string[]).includes(value)) return value as InspectionPhase;
  const canonical = INSPECTION_PHASE_ALIASES[value as keyof typeof INSPECTION_PHASE_ALIASES];
  if (canonical) {
    warnLegacyAlias('inspection_phase', value, canonical);
    return canonical;
  }
  throw new Error(`Unknown inspection phase: ${value}`);
};

export const normalizeTaskActionTargetKind = (
  value: string,
): TaskActionTargetKind => {
  if ((TASK_ACTION_TARGET_KINDS as readonly string[]).includes(value)) {
    return value as TaskActionTargetKind;
  }
  const canonical = TASK_ACTION_TARGET_KIND_ALIASES[
    value as keyof typeof TASK_ACTION_TARGET_KIND_ALIASES
  ];
  if (canonical) {
    warnLegacyAlias('task_action_target_kind', value, canonical);
    return canonical;
  }
  throw new Error(`Unknown task action target kind: ${value}`);
};
