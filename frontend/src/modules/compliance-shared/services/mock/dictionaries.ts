import {
  INSPECTION_PHASE_ALIASES,
  INSPECTION_PHASE_DICTIONARY,
  INSPECTION_STATUS_DICTIONARY,
  ISSUE_RECTIFICATION_STATUS_ALIASES,
  ISSUE_RECTIFICATION_STATUS_DICTIONARY,
  ISSUE_RECTIFICATION_STATUSES,
  TASK_ACTION_TARGET_KIND_ALIASES,
} from '../dictionaryMapper';
import type { DictionaryEntry } from '../dictionaryMapper';

export type { DictionaryEntry } from '../dictionaryMapper';

export {
  INSPECTION_PHASE_ALIASES,
  INSPECTION_PHASE_DICTIONARY,
  INSPECTION_STATUS_DICTIONARY,
  ISSUE_RECTIFICATION_STATUS_ALIASES,
  ISSUE_RECTIFICATION_STATUS_DICTIONARY,
  ISSUE_RECTIFICATION_STATUSES,
  TASK_ACTION_TARGET_KIND_ALIASES,
} from '../dictionaryMapper';

export type IssueRectificationStatus = typeof ISSUE_RECTIFICATION_STATUSES[number];

export const ASSESSMENT_SCHEME_LIFECYCLE_STATUSES = [
  'DRAFT',
  'ACTIVE',
  'SUSPENDED',
  'EXPIRED',
  'ARCHIVED',
] as const;

export type AssessmentSchemeLifecycleStatus =
  typeof ASSESSMENT_SCHEME_LIFECYCLE_STATUSES[number];

export const ASSESSMENT_SCHEME_STATUS_DICTIONARY = [
  { code: 'DRAFT', label: '草稿', category: 'assessment_scheme_status', description: '方案尚未发布，可继续编辑。' },
  { code: 'ACTIVE', label: '运行中', category: 'assessment_scheme_status', description: '方案已发布，正在下发、填报、复核或归档流程中。' },
  { code: 'SUSPENDED', label: '已暂停', category: 'assessment_scheme_status', description: '方案临时停用，保留恢复可能。' },
  { code: 'EXPIRED', label: '已结束', category: 'assessment_scheme_status', description: '方案所属考核周期已结束，不再产生新的填报任务。', terminal: true },
  { code: 'ARCHIVED', label: '已归档', category: 'assessment_scheme_status', description: '方案及其结果已完成归档。', terminal: true },
] as const satisfies readonly DictionaryEntry<AssessmentSchemeLifecycleStatus>[];

export const ASSESSMENT_SCHEME_STATUS_ALIASES = {
  draft: 'DRAFT',
  running: 'ACTIVE',
  ended: 'EXPIRED',
} as const satisfies Record<string, AssessmentSchemeLifecycleStatus>;

export const AUTH_INTEGRATION_DICTIONARY = [
  { code: 'CASDOOR', label: 'Casdoor', category: 'auth_provider', description: '开源身份认证与单点登录基础。' },
  { code: 'CASBIN', label: 'Casbin', category: 'authorization_policy', description: '开源权限策略与访问控制基础。' },
  { code: 'JWT', label: 'JWT', category: 'token_type', description: 'MVP 阶段优先采用的令牌形式，后续可接入 Casdoor 签发。' },
] as const satisfies readonly DictionaryEntry[];

export const SYSTEM_DICTIONARIES = {
  issueRectificationStatuses: ISSUE_RECTIFICATION_STATUS_DICTIONARY,
  issueRectificationStatusAliases: ISSUE_RECTIFICATION_STATUS_ALIASES,
  inspectionPhases: INSPECTION_PHASE_DICTIONARY,
  inspectionPhaseAliases: INSPECTION_PHASE_ALIASES,
  inspectionStatuses: INSPECTION_STATUS_DICTIONARY,
  taskActionTargetKindAliases: TASK_ACTION_TARGET_KIND_ALIASES,
  assessmentSchemeStatuses: ASSESSMENT_SCHEME_STATUS_DICTIONARY,
  assessmentSchemeStatusAliases: ASSESSMENT_SCHEME_STATUS_ALIASES,
  authIntegration: AUTH_INTEGRATION_DICTIONARY,
} as const;

export type SystemDictionaries = typeof SYSTEM_DICTIONARIES;
