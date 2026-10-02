import {requestJson,tokenStore} from '../../../platform/transport';
import type {
  AuthUser,
  BusinessLine,
  ComplianceIssue,
  EvidenceRequirement,
  EvidenceSubmission,
  InspectionPlan,
  InspectionPlanAcknowledgement,
  RectificationFeedback,
  RectificationRecord,
  RiskLevel,
  TaskActionType,
  TaskCategory,
  UnifiedTask,
  UnifiedTaskActionTarget,
  WorkingPaper,
} from '../types';
import {
  DEFAULT_INSPECTION_PLAN_FREQUENCY_CODE,
  DEFAULT_INSPECTION_PLAN_TYPE_CODE,
} from './inspectionPlanCodeMapper';

export const AUTH_USER_STORAGE_KEY='compliance-platform-user';
export const AUTH_SESSION_STORAGE_KEY='compliance-platform-token';

export interface AuthSession {
  token: string;
  tokenType: string;
  expiresIn: number;
  user: AuthUser;
}

export interface NotificationItem {
  id: string;
  notificationId: string;
  type: 'SYSTEM' | 'INSPECTION' | 'ASSESSMENT' | 'ISSUE' | 'WORKFLOW' | 'OTHER';
  severity: 'INFO' | 'WARNING' | 'URGENT';
  title: string;
  time: string;
  content: string;
  isRead: boolean;
  readState: 'UNREAD' | 'READ' | 'ARCHIVED';
  readAt?: string | null;
  sourceModule?: string;
  sourceEntityType?: string | null;
  sourceEntityId?: string | null;
  actionTarget?: Partial<UnifiedTaskActionTarget> | null;
  iconKey: 'speaker' | 'checkCircle' | 'archive' | 'shieldAlert' | 'loader';
}

export interface NotificationListResponse {
  items: NotificationItem[];
  page: number;
  pageSize: number;
  total: number;
}

export interface NotificationUnreadCount {
  unreadCount: number;
}

export interface TaskCounts {
  total: number;
  totalOpen: number;
  byCategory: Record<string, number>;
  byStatus: Record<string, number>;
  groups?: Record<string, number>;
}

export interface ConfigDictionaryItem {
  dictId: string;
  dictType: string;
  dictCode: string;
  dictLabel: string;
  dictLabelEn?: string | null;
  parentId?: string | null;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
  editPolicy: string;
  description?: string | null;
  uiMeta: Record<string, unknown>;
  source: string;
  version: number;
}

export interface ConfigDictionariesResponse {
  schemaVersion: number;
  source: string;
  dictionaries: Record<string, ConfigDictionaryItem[]>;
}

export interface InspectionPlanListResponse {
  items: InspectionPlan[];
  page: number;
  pageSize: number;
  total: number;
}

export interface DictionaryAdminTypeSummary {
  dictType: string;
  typeLabel: string;
  itemCount: number;
  activeCount: number;
  inactiveCount: number;
}

export interface DictionaryAdminTypeListResponse {
  schemaVersion: number;
  source: string;
  items: DictionaryAdminTypeSummary[];
}

export interface DictionaryAdminItem {
  dictId: string;
  parentId?: string | null;
  dictType: string;
  dictCode: string;
  label: string;
  labelEn?: string | null;
  sortOrder: number;
  active: boolean;
  isSystem: boolean;
  editPolicy: string;
  description?: string | null;
  uiMeta: Record<string, unknown>;
  source: string;
  version: number;
  isDeleted: boolean;
}

export interface DictionaryAdminItemListParams {
  dictType?: string;
  keyword?: string;
  active?: boolean;
  includeDeleted?: boolean;
  page?: number;
  pageSize?: number;
}

export interface DictionaryAdminItemListResponse {
  items: DictionaryAdminItem[];
  page: number;
  pageSize: number;
  total: number;
}

export interface DictionaryAdminItemCreateRequest {
  dictType: string;
  dictCode: string;
  label: string;
  labelEn?: string | null;
  parentId?: string | null;
  sortOrder?: number;
  active?: boolean;
  description?: string | null;
  uiMeta?: Record<string, unknown>;
}

export interface DictionaryAdminItemUpdateRequest {
  version: number;
  label?: string;
  labelEn?: string | null;
  sortOrder?: number;
  active?: boolean;
  description?: string | null;
  uiMeta?: Record<string, unknown>;
}

export interface DictionaryAdminDeleteResponse {
  deletedCount: number;
  dictIds: string[];
}

export interface DictionaryAdminSortRequestItem {
  dictId: string;
  sortOrder: number;
  version: number;
}

export interface IssueProjectRollup {
  projectId: string;
  id: string;
  projectTitle: string;
  title: string;
  sourceType: string;
  dateRange: { startDate: string; endDate: string };
  dateRangeLabel: string;
  leadDeptSnapshot: { orgId?: string; orgName?: string; source?: string };
  leadDept: string;
  metrics: {
    totalIssues: number;
    completed: number;
    inProgress: number;
    overdue: number;
    completionRate: number;
  };
  status: 'IN_PROGRESS' | 'CLOSED' | 'AT_RISK';
  overdueTargetOrgIds: string[];
}

export interface IssueProjectRollupPage {
  items: IssueProjectRollup[];
  page: number;
  pageSize: number;
  total: number;
  summary?: { totalProjects: number; atRiskProjects: number };
}

export interface IssueProjectBranchProgress {
  projectId: string;
  orgId: string;
  id: string;
  orgSnapshot: { orgId?: string; orgName?: string };
  name: string;
  total: number;
  completed: number;
  overdue: number;
  status: 'DONE' | 'RISK' | 'IN_PROGRESS';
  drilldownFilters: Record<string, string>;
}

export interface IssueProjectBranchProgressPage {
  items: IssueProjectBranchProgress[];
  page: number;
  pageSize: number;
  total: number;
}

export interface IssueProjectReminderResponse {
  reminderEventId: string;
  projectId: string;
  targetOrgIds: string[];
  deliveryMode: string;
  status: 'PENDING' | 'SENT' | 'FAILED' | 'CANCELLED';
  notificationIds: string[];
  resultSummary: {
    targetOrgCount: number;
    notificationCount: number;
    suppressedDuplicateCount: number;
    failureCount: number;
  };
  duplicate: boolean;
}

export interface IssueAnalyticsReadModel {
  filterHash: string;
  period: string;
  kpis: {
    totalIssues: { value: number; trend: string; isPositive: boolean };
    overdue: { value: number; trend: string; isPositive: boolean };
    closureRate: { value: number; displayValue: string; trend: string; isPositive: boolean };
    avgFixDays: { value: number; trend: string; isPositive: boolean };
  };
  trendSeries: Array<{ month: string; found: number; closed: number }>;
  riskDistribution: Array<{ name: string; riskLevel: string; value: number }>;
  branchRanking: Array<{
    orgId: string;
    branch: string;
    overdue: number;
    completed: number;
    total: number;
  }>;
  computedAt: string;
  exportAllowed: boolean;
}

export interface WorkflowTargetScope {
  scopeMode: 'by_business_line' | 'by_org' | 'by_region';
  targetOrgIds: string[];
  businessLine?: string | null;
  regionCode?: string | null;
  priority: number;
}

export interface WorkflowApproverSelector {
  selectorType: 'ROLE' | 'USER' | 'ORG_ROLE';
  roleCode?: string | null;
  userId?: string | null;
  orgScopeRule?: 'TARGET_ORG' | 'TARGET_PARENT_BRANCH' | 'BUSINESS_LINE_HQ' | 'HQ_GLOBAL' | null;
  businessLine?: string | null;
}

export interface WorkflowNode {
  nodeId: string;
  level: 'L0_SELF_CHECK' | 'L1_BRANCH_REVIEW' | 'L2_LINE_REVIEW' | 'L3_HQ_FINAL';
  nodeType: 'ROLE' | 'USER' | 'ORG_ROLE' | 'FINAL_APPROVER';
  approverSelector: WorkflowApproverSelector;
  sortOrder: number;
  isFinal: boolean;
  label: string;
}

export interface WorkflowEdge {
  edgeId: string;
  fromNodeId: string;
  toNodeId: string;
  condition?: { conditionType: string; value?: string | null } | null;
}

export interface WorkflowRouteChain {
  chainId: string;
  name: string;
  targetScope: WorkflowTargetScope;
  approvalPolicy: 'ANY_ONE' | 'ALL_OF' | 'SEQUENTIAL' | 'QUORUM';
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface WorkflowTemplateAggregate {
  templateId: string;
  name: string;
  domain: 'assessment';
  scopeMode: 'by_business_line' | 'by_org' | 'by_region';
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  schemaVersion: number;
  chains: WorkflowRouteChain[];
  createdBy: string;
  updatedBy: string;
}

export interface WorkflowTemplateSummary {
  templateId: string;
  name: string;
  domain: string;
  scopeMode: string;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  schemaVersion: number;
  chainCount: number;
  currentVersionId?: string | null;
  lastValidationSummary?: WorkflowValidationSummary;
  updatedAt: string;
  updatedBy: string;
}

export interface WorkflowTemplateVersion {
  templateVersionId: string;
  templateId: string;
  versionNo: number;
  status: 'PUBLISHED' | 'ARCHIVED';
  snapshotHash: string;
  targetScopeSnapshot: Array<Record<string, unknown>>;
  publishedAt?: string | null;
  archivedAt?: string | null;
}

export interface WorkflowTemplateDetail extends WorkflowTemplateSummary {
  template: WorkflowTemplateAggregate;
  chains: WorkflowRouteChain[];
  publishedVersion?: WorkflowTemplateVersion | null;
  auditSummary?: { eventCount: number; lastEventType?: string | null };
}

export interface AssessmentScheduleRule {
  ruleId: string;
  frequency: 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY' | string;
  workingDayOffset: number;
  fireTime: string;
  timezone: string;
  calendarCode: string;
  validFrom?: string | null;
  validUntil?: string | null;
}

export interface ScheduleExecution {
  executionId: string;
  scheduleId: string;
  scheduledAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'RETRY_REQUESTED' | 'CANCELLED' | string;
  cycleId?: string | null;
  retryOfExecutionId?: string | null;
  targetCount: number;
  createdCycleId?: string | null;
  dispatchEventIds: string[];
  generatedTaskCount: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  guardResult?: Record<string, unknown>;
  duplicatePreventionKey?: string;
}

export interface AssessmentScheduleDetail {
  scheduleId: string;
  schemeId: string;
  templateId: string;
  templateVersionId?: string | null;
  snapshotHash?: string | null;
  dispatchMode: string;
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'EXPIRED' | 'ARCHIVED' | string;
  draftRule: AssessmentScheduleRule;
  activeRule?: AssessmentScheduleRule | null;
  targetOrgIds: string[];
  targetScopeSnapshot: Array<Record<string, unknown>>;
  predictedNextFireAt?: string | null;
  prediction: {
    nextFireAt?: string | null;
    calendarPolicy: string;
    timezone: string;
    workingDayOffset: number;
    serverComputed: boolean;
  };
  eligibility: { status: string; guards: string[] };
  latestExecution?: ScheduleExecution | null;
  version: number;
  auditSummary?: { eventCount: number; lastEventType?: string | null };
}

export interface ScheduleExecutionPage {
  items: ScheduleExecution[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ScheduleActivationResponse {
  schedule: AssessmentScheduleDetail;
  guardResult: Record<string, unknown>;
  routeSummary: Record<string, unknown>;
}

export interface ScheduleRetryResponse {
  originalExecution: ScheduleExecution;
  retryExecution?: ScheduleExecution | null;
  retryEvent: Record<string, unknown>;
  duplicate: boolean;
}

export interface ScheduleDispatchNowResponse {
  schedule: AssessmentScheduleDetail;
  execution: ScheduleExecution;
  dispatchEvent: Record<string, unknown>;
  duplicate: boolean;
}

export interface AssessmentSimulationFinding {
  code: string;
  severity: 'INFO' | 'WARNING' | 'ERROR' | string;
  message: string;
  affectedScope?: Record<string, unknown>;
  blocking: boolean;
}

export interface AssessmentSimulationOrgResult {
  orgId: string;
  orgSnapshot: { orgId?: string; orgName?: string; orgLevel?: string };
  score: number | null;
  grade: string;
  coverage: {
    totalItems: number;
    scoredItems: number;
    missingItems: number;
    coverageRatio: number;
  };
  imputationSummary: {
    policy: string;
    noteCount: number;
    silentZeroFill: boolean;
  };
  historicalOfficialComparison?: {
    officialScore?: number | null;
    difference?: number | null;
    readOnly: boolean;
  };
  simulationOnly: boolean;
}

export interface AssessmentSimulationSummary {
  totalTargetCount: number;
  scoredTargetCount: number;
  excludedTargetCount: number;
  missingDataCount: number;
  averageSimulatedScore: number | null;
  highestScore: number | null;
  lowestScore: number | null;
  gradeDistribution: Record<string, number>;
  topSamples: AssessmentSimulationOrgResult[];
  bottomSamples: AssessmentSimulationOrgResult[];
  comparison?: Record<string, unknown>;
  simulationOnly: boolean;
}

export interface AssessmentSimulationImputationNote {
  sourceType: string;
  indicatorId?: string;
  schemeItemId?: string;
  orgId: string;
  referencePeriod: string;
  policy: string;
  reason: string;
  effectOnScore: string;
  scoreImpact: number;
}

export interface AssessmentSimulationDetail {
  simulationId: string;
  schemeId: string;
  schemeVersionId?: string | null;
  referencePeriod: string;
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | string;
  simulationOnly: boolean;
  requestedBy: string;
  requestId?: string | null;
  inputSnapshotHash: string;
  imputationPolicy: string;
  preflightFindings: AssessmentSimulationFinding[];
  resultSummary: AssessmentSimulationSummary;
  orgResults: AssessmentSimulationOrgResult[];
  imputationNotes: AssessmentSimulationImputationNote[];
  auditMetadata: {
    createdAt: string;
    startedAt?: string | null;
    finishedAt?: string | null;
    statusTransitions: string[];
  };
  error?: Record<string, unknown> | null;
  idempotentReplay?: boolean;
}

export type DataSourceHealthStatus = 'ONLINE' | 'DEGRADED' | 'OFFLINE' | 'UNKNOWN';
export type DataSyncJobStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'SUCCESS'
  | 'FAILED'
  | 'RETRY_REQUESTED'
  | 'OVERWRITE_REQUESTED'
  | 'CANCELLED';

export interface DataSourceHealthItem {
  sourceId: string;
  sourceCode: string;
  sourceName: string;
  ownerDeptSnapshot: Record<string, any>;
  connectorType: string;
  healthStatus: DataSourceHealthStatus;
  lastHeartbeatAt?: string | null;
  lastSuccessfulJobId?: string | null;
  lastFailureJobId?: string | null;
  sandboxOnly: boolean;
  nonProductionLabel?: string;
}

export interface DataSourceHealthSummary {
  generatedAt: string;
  sandboxOnly: boolean;
  evidenceLabel: string;
  readinessLevel: 'READY' | 'PARTIAL' | 'BLOCKED';
  connectedSourceCount: number;
  totalSourceCount: number;
  todayRunCount: number;
  unresolvedFailureCount: number;
  failedJobCount: number;
  sources: DataSourceHealthItem[];
}

export interface DataSyncJob {
  jobId: string;
  sourceId: string;
  sourceCode: string;
  indicatorId?: string | null;
  indicatorName: string;
  cycleId?: string | null;
  status: DataSyncJobStatus;
  records: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  startedAt: string;
  finishedAt?: string | null;
  hasSnapshot: boolean;
  openAlertCount: number;
  alertIds: string[];
  sandboxOnly: boolean;
  nonProductionLabel?: string;
}

export interface DataSyncJobPage {
  items: DataSyncJob[];
  page: number;
  pageSize: number;
  total: number;
  filterSnapshot: Record<string, any>;
}

export interface DataSyncSnapshot {
  snapshotId: string;
  jobId: string;
  payloadHash: string;
  recordCount: number;
  redactionPolicy: string;
  capturedAt: string;
  sampleRows: Array<Record<string, any>>;
  omittedFields: string[];
  fileId?: string | null;
  sandboxOnly: boolean;
  evidenceLabel: string;
  nonProductionLabel?: string;
}

export interface DataSyncCommandResponse {
  operationId: string;
  jobId: string;
  newStatus: string;
  auditEventId: string;
  idempotentReplay: boolean;
  sandboxOnly: boolean;
  evidenceLabel: string;
}

export interface DataSyncAlertCommandResponse extends DataSyncCommandResponse {
  alertId: string;
  jobEvidenceRetained: boolean;
}

export interface DataSyncOverwriteResponse extends DataSyncCommandResponse {
  rerunRequestId: string;
  rerunStatus: string;
  cancellationDeferred: boolean;
}

export interface DataSyncExportResponse {
  operationId: string;
  exportId: string;
  exportType: string;
  format: string;
  filterSnapshot: Record<string, any>;
  status: string;
  fileId?: string | null;
  downloadUrl?: string | null;
  expiresAt?: string | null;
  checksum?: string | null;
  redactionPolicy: string;
  auditEventId: string;
  idempotentReplay: boolean;
  sandboxOnly: boolean;
  evidenceLabel: string;
  formalArtifact: boolean;
  signedArtifact: boolean;
  nonProductionLabel?: string;
}

export interface UnifiedReviewApprover {
  userId: string;
  displayName: string;
  roleId: string;
  orgId: string;
}

export interface UnifiedReviewAuditEvent {
  eventId: string;
  level: string;
  fromLevel?: string | null;
  toLevel?: string | null;
  decision: string;
  action: string;
  opinion: string;
  actorSnapshot?: { displayName?: string; username?: string; userId?: string } | null;
  time: string;
  status: string;
  fromStatus?: string;
  toStatus?: string;
  workflowTemplateVersionId?: string;
  idempotencyKey?: string;
}

export interface UnifiedReviewQuickPhrase {
  phraseId: string;
  text: string;
  decisionHint: 'APPROVE' | 'RETURN' | 'REJECT' | string;
  source: string;
}

export interface UnifiedReviewActionEligibility {
  canSaveComment: boolean;
  canApprove: boolean;
  canReturn: boolean;
  canReject: boolean;
  canBatchDecide: boolean;
}

export interface UnifiedReviewTaskSummary {
  reviewTaskId: string;
  id: string;
  sourceReviewTaskId: string;
  sourceType: string;
  cycleId: string;
  cycleTargetId: string;
  reportingTaskId: string;
  targetOrgId: string;
  targetOrgSnapshot?: { orgId?: string; orgName?: string };
  branch: string;
  title: string;
  indicator: string;
  category: string;
  value: string;
  score: number;
  currentLevel: string;
  currentLevelLabel: string;
  levelCode: string;
  currentNodeId?: string | null;
  currentNodeLabel: string;
  status: 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'RETURNED' | 'REJECTED' | 'CLOSED' | string;
  version: number;
  workflowTemplateId: string;
  workflowTemplateVersionId: string;
  routeChainId: string;
  assignees: UnifiedReviewApprover[];
  sla: string;
  isOverdue: boolean;
  updatedAt: string;
}

export interface UnifiedReviewRouteSnapshot {
  templateVersionId: string;
  templateId: string;
  snapshotHash: string;
  routeChainId: string;
  levels: Array<{ level: string; nodeId: string; label: string; isCurrent: boolean }>;
}

export interface UnifiedReviewTaskDetail extends UnifiedReviewTaskSummary {
  sourceContext: Record<string, any>;
  routeSnapshot: UnifiedReviewRouteSnapshot;
  currentAssignment?: {
    assignmentSnapshotId: string;
    reviewTaskId: string;
    level: string;
    nodeId?: string | null;
    approvers: UnifiedReviewApprover[];
    createdAt: string;
  } | null;
  quickPhrases: UnifiedReviewQuickPhrase[];
  comments: Array<Record<string, any>>;
  auditTrail: UnifiedReviewAuditEvent[];
  actionEligibility: UnifiedReviewActionEligibility;
  duplicate?: boolean;
  duplicateEventId?: string;
  decisionEventId?: string;
}

export interface UnifiedReviewTaskPage {
  items: UnifiedReviewTaskSummary[];
  page: number;
  pageSize: number;
  total: number;
  summary: { todo: number; done: number; cc: number };
}

export interface UnifiedReviewBatchDecisionResponse {
  items: Array<{
    reviewTaskId: string;
    success: boolean;
    status?: string;
    version?: number;
    errorCode?: string;
    message?: string;
  }>;
  successCount: number;
  failureCount: number;
}

export interface WorkflowTemplatePage {
  items: WorkflowTemplateSummary[];
  page: number;
  pageSize: number;
  total: number;
}

export interface WorkflowValidationFinding {
  findingId: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  code: string;
  message: string;
  chainId?: string | null;
  nodeId?: string | null;
  edgeId?: string | null;
}

export interface WorkflowValidationSummary {
  errorCount: number;
  warningCount: number;
  infoCount: number;
  findingCodes: string[];
}

export interface WorkflowValidationResponse {
  templateId: string;
  status: string;
  summary: WorkflowValidationSummary;
  findings: WorkflowValidationFinding[];
}

export interface WorkflowPublishResponse {
  template: WorkflowTemplateDetail;
  version: WorkflowTemplateVersion;
  duplicate: boolean;
}

const parseStoredJson = <T>(value: string | null): T | null => {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

export const getStoredAuthUser = ():AuthUser|null => parseStoredJson<AuthUser>(localStorage.getItem(AUTH_USER_STORAGE_KEY));
export const getStoredAuthSession = ():AuthSession|null => tokenStore.get() ? {token:tokenStore.get()!,tokenType:'Bearer',expiresIn:0,user:getStoredAuthUser()!}:null;
export const persistAuthSession=(session:AuthSession)=>{tokenStore.set(session.token);localStorage.setItem(AUTH_USER_STORAGE_KEY,JSON.stringify(session.user));};
export const clearAuthSession=()=>tokenStore.clear();

export class ApiRequestError extends Error {
  code?: string;
  details?: unknown;
  status: number;

  constructor(message: string, code: string | undefined, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const parseApiError = async (response: Response) => {
  const err = await response.json().catch(() => ({}));
  return {
    code: err.code as string | undefined,
    message: (err.message || err.code || 'API request failed') as string,
    details: err.details,
  };
};

const normalizePagedItems = <T>(data: T[] | { items?: T[] } | null | undefined): T[] => {
  if (Array.isArray(data)) return data;
  return data?.items ?? [];
};

const queryString = (params?: Record<string, string | number | boolean | undefined>) => {
  const entries = Object.entries(params ?? {}).filter(([, value]) => value !== undefined);
  return entries.length
    ? '?' + new URLSearchParams(entries.map(([key, value]) => [key, String(value)])).toString()
    : '';
};

async function fetchWithAuth(endpoint:string,options:RequestInit={}) {return requestJson(`/api${endpoint}`,options);}
async function fetchJson(endpoint:string,options:RequestInit={}) {return requestJson(`/api${endpoint}`,options);}

const normalizeActionTarget = (value: any): UnifiedTaskActionTarget => ({
  kind: 'route',
  menuId: value?.menuId ?? value?.menu_id ?? 'hq-tasks',
  appPath: value?.appPath ?? value?.app_path ?? '/',
  publicPath: value?.publicPath ?? value?.public_path ?? '/',
  params: value?.params ?? {},
  action: value?.action ?? '',
});

const normalizeTask = (item: any): UnifiedTask => {
  const actionTarget = normalizeActionTarget(item.actionTarget ?? item.action_target);
  return {
    ...item,
    id: item.id ?? item.taskId ?? item.task_id,
    category: (item.category ?? 'INSPECTION') as TaskCategory,
    actionType: (item.actionType ?? item.action_type ?? 'REVIEW') as TaskActionType,
    title: item.title ?? '',
    description: item.description ?? '',
    priority: item.priority ?? 'MEDIUM',
    dueDate: item.dueDate ?? item.due_date ?? '',
    status: item.status ?? 'PENDING',
    sourceId: item.sourceId ?? item.source_id ?? '',
    actionTarget,
    deepLink: item.deepLink ?? actionTarget.publicPath,
    createdAt: item.createdAt ?? item.created_at ?? '',
  };
};

const notificationIconKey = (item: any): NotificationItem['iconKey'] => {
  if (item.readState === 'READ' || item.read_state === 'READ') return 'checkCircle';
  const severity = item.severity ?? 'INFO';
  const type = item.type ?? item.sourceModule ?? item.source_module;
  if (severity === 'URGENT' || severity === 'WARNING' || type === 'ISSUE') return 'shieldAlert';
  if (type === 'ASSESSMENT' || type === 'WORKFLOW') return 'loader';
  if (type === 'INSPECTION') return 'archive';
  return 'speaker';
};

const normalizeNotification = (item: any): NotificationItem => {
  const createdAt = item.createdAt ?? item.created_at ?? '';
  return {
    id: item.id ?? item.notificationId ?? item.notification_id,
    notificationId: item.notificationId ?? item.notification_id ?? item.id,
    type: item.type ?? 'OTHER',
    severity: item.severity ?? 'INFO',
    title: item.title ?? '',
    time: createdAt,
    content: item.content ?? '',
    isRead: Boolean(item.isRead ?? item.is_read ?? ((item.readState ?? item.read_state) === 'READ')),
    readState: item.readState ?? item.read_state ?? (item.isRead ? 'READ' : 'UNREAD'),
    readAt: item.readAt ?? item.read_at ?? null,
    sourceModule: item.sourceModule ?? item.source_module,
    sourceEntityType: item.sourceEntityType ?? item.source_entity_type ?? null,
    sourceEntityId: item.sourceEntityId ?? item.source_entity_id ?? null,
    actionTarget: item.actionTarget ?? item.action_target ?? null,
    iconKey: notificationIconKey(item),
  };
};

const normalizeBusinessLine = (value: any): BusinessLine => {
  if (value === '投资银行' || value === '自营业务' || value === '资产管理') return value;
  return '财富管理';
};

const normalizeRiskLevel = (value: any): RiskLevel => {
  if (value === 'HIGH' || value === 'MEDIUM' || value === 'LOW') return value;
  return 'LOW';
};

const normalizeIssue = (item: any): ComplianceIssue => ({
  id: item.id ?? item.issueId ?? item.issue_id,
  issueCode: item.issueCode ?? item.issue_code ?? item.id ?? item.issueId ?? '',
  title: item.title ?? '',
  sourceProject: item.sourceProject ?? item.source_project ?? item.sourceId ?? item.source_id ?? '',
  businessLine: normalizeBusinessLine(item.businessLine ?? item.business_line),
  responsibleDept: item.responsibleDept ?? item.responsible_dept ?? item.responsibleOrgName ?? '',
  riskLevel: normalizeRiskLevel(item.riskLevel ?? item.risk_level),
  status: item.status ?? 'DISCOVERED',
  discoveryDate: item.discoveryDate ?? item.discovery_date ?? '',
  slaDeadline: item.slaDeadline ?? item.sla_deadline ?? item.dueDate ?? '',
  description: item.description ?? '',
  rectificationAdvice: item.rectificationAdvice ?? item.rectification_advice,
  basisRule: item.basisRule ?? item.basis_rule,
});

const normalizeFileAttachment = (file: any) => ({
  name: file?.name ?? file?.fileName ?? file?.file_name ?? file?.fileId ?? '',
  url: file?.url ?? file?.publicPath ?? '#',
  size: file?.size ?? file?.fileSize?.toString?.() ?? '',
  type: file?.type ?? file?.contentType ?? '',
});

const INSPECTION_PLAN_ATTACHMENT_KEY_BY_TYPE: Record<
  string,
  'notice' | 'scheme' | 'workingPaperTemplate' | 'other'
> = {
  INSPECTION_NOTICE: 'notice',
  ONSITE_INSPECTION_SCHEME: 'scheme',
  WORKING_PAPER_TEMPLATE: 'workingPaperTemplate',
  OTHER: 'other',
};

const normalizeInspectionPlanFiles = (files: any) => {
  const normalized: InspectionPlan['files'] = {};
  if (!files) return normalized;
  if (!Array.isArray(files) && typeof files === 'object' && !Array.isArray(files.items)) {
    return files;
  }
  normalizePagedItems<any>(files).forEach(file => {
    const attachmentType = file?.attachmentType ?? file?.attachment_type;
    const key = INSPECTION_PLAN_ATTACHMENT_KEY_BY_TYPE[attachmentType];
    if (!key) return;
    normalized[key] = {
      id: file?.fileId ?? file?.id ?? '',
      fileId: file?.fileId ?? file?.id ?? '',
      name: file?.fileName ?? file?.name ?? file?.fileId ?? '',
      type: file?.type ?? file?.contentType ?? file?.content_type ?? '',
      uploadTime: file?.uploadedAt ?? file?.uploaded_at ?? file?.boundAt ?? file?.bound_at ?? '',
      contentType: file?.contentType ?? file?.content_type,
      fileSize: file?.fileSize ?? file?.file_size,
      attachmentType,
      attachmentLabel: file?.attachmentLabel ?? file?.attachment_label,
      required: file?.required,
      bindingTargetType: file?.bindingTargetType ?? file?.binding_target_type,
      businessStage: file?.businessStage ?? file?.business_stage,
      scanStatus: file?.scanStatus ?? file?.scan_status,
      uploadedBy: file?.uploadedBy ?? file?.uploaded_by,
    };
  });
  return normalized;
};

const normalizeFeedback = (feedback: any): RectificationFeedback | undefined => {
  if (!feedback) return undefined;
  return {
    content: feedback.content ?? '',
    attachments: normalizePagedItems<any>(feedback.files).map(normalizeFileAttachment),
    submittedBy: feedback.submittedBy ?? feedback.submitted_by ?? '',
    submittedAt: feedback.submittedAt ?? feedback.submitted_at ?? '',
  };
};

const normalizeRectification = (item: any): RectificationRecord => ({
  id: item.id ?? item.rectificationId ?? item.rectification_id,
  sourceIssueId: item.sourceIssueId ?? item.source_issue_id ?? '',
  issueDescription: item.issueDescription ?? item.issue_description ?? '',
  rectificationGoal: item.rectificationGoal ?? item.rectification_goal ?? '',
  riskLevel: normalizeRiskLevel(item.riskLevel ?? item.risk_level),
  dueDate: item.dueDate ?? item.due_date ?? '',
  status: item.status ?? 'PENDING_RECTIFICATION',
  extension: typeof item.extension === 'string' ? { status: item.extension as any } : item.extension,
  feedback: normalizeFeedback(item.feedback),
  hqRejectReason: item.hqRejectReason ?? item.hq_reject_reason,
});

const normalizeInspectionPlan = (item: any): InspectionPlan => ({
  id: item.id ?? item.inspectionPlanId ?? item.inspection_plan_id,
  inspectionPlanId: item.inspectionPlanId ?? item.inspection_plan_id ?? item.id,
  title: item.title ?? '',
  inspectCode: item.inspectCode ?? item.inspect_code ?? '',
  type: item.type ?? DEFAULT_INSPECTION_PLAN_TYPE_CODE,
  frequency: item.frequency ?? DEFAULT_INSPECTION_PLAN_FREQUENCY_CODE,
  confidentialityLevel: item.confidentialityLevel ?? item.confidentiality_level ?? null,
  confidentialityLabel: item.confidentialityLabel ?? item.confidentiality_label ?? null,
  leader: item.leader ?? item.leaderName ?? '',
  teamMembers: item.teamMembers ?? item.teamMemberNames ?? [],
  targetDept: item.targetDept ?? item.targetDeptLabel ?? '',
  plannedStartDate: item.plannedStartDate ?? item.planned_start_date ?? '',
  plannedEndDate: item.plannedEndDate ?? item.planned_end_date ?? '',
  status: item.status ?? 'DRAFT',
  currentPhase: item.currentPhase ?? item.phase ?? 'PLAN_DRAFT',
  phaseProgress: item.phaseProgress ?? item.phase_progress ?? 0,
  files: normalizeInspectionPlanFiles(item.files),
  ekpFlow: item.ekpFlow,
  version: item.version,
  optimisticVersion: item.optimisticVersion ?? item.version,
  allowedActions: item.allowedActions ?? item.allowed_actions ?? [],
  reportReadiness: item.reportReadiness ?? item.report_readiness,
  targetAcknowledgements: (item.targetAcknowledgements ?? item.target_acknowledgements ?? []).map(
    (ack: any) => ({
      acknowledgementId: ack.acknowledgementId ?? ack.acknowledgement_id,
      inspectionPlanId: ack.inspectionPlanId ?? ack.inspection_plan_id,
      targetOrgId: ack.targetOrgId ?? ack.target_org_id,
      targetOrgName: ack.targetOrgName ?? ack.target_org_name ?? '',
      ackStatus: ack.ackStatus ?? ack.ack_status,
      acknowledgedBy: ack.acknowledgedBy ?? ack.acknowledged_by,
      acknowledgedAt: ack.acknowledgedAt ?? ack.acknowledged_at,
      liaisonName: ack.liaisonName ?? ack.liaison_name ?? null,
      liaisonPhone: ack.liaisonPhone ?? ack.liaison_phone ?? null,
      liaisonTitle: ack.liaisonTitle ?? ack.liaison_title ?? null,
    })
  ),
  targetOrgIds: item.targetOrgIds ?? item.target_org_ids ?? [],
  targetOrgSnapshots: (item.targetOrgSnapshots ?? item.target_org_snapshots ?? []).map(
    (snap: any) => ({
      orgId: snap.orgId ?? snap.org_id ?? '',
      orgName: snap.orgName ?? snap.org_name ?? '',
    })
  ),
});

const normalizeEvidenceRequirement = (item: any): EvidenceRequirement => ({
  id: item.id ?? item.requirementId ?? item.requirement_id,
  requirementId: item.requirementId ?? item.requirement_id ?? item.id,
  inspectionId: item.inspectionId ?? item.inspectionPlanId ?? item.inspection_plan_id,
  inspectionPlanId: item.inspectionPlanId ?? item.inspection_plan_id ?? item.inspectionId,
  title: item.title ?? '',
  description: item.description ?? '',
  requiredTags: item.requiredTags ?? item.required_tags ?? [],
  dueDate: item.dueDate ?? item.due_date ?? '',
  targetOrgIds: item.targetOrgIds ?? item.target_org_ids ?? [],
  templateFiles: (item.templateFiles ?? item.template_files ?? []).map((f: any) => ({
    name: f?.name ?? f?.fileName ?? f?.file_name ?? '',
    size: f?.size ?? f?.fileSize ?? f?.file_size,
    fileId: f?.fileId ?? f?.file_id ?? f?.id,
    url: f?.url ?? f?.publicPath ?? f?.public_path,
  })),
});

const normalizeEvidenceSubmission = (item: any): EvidenceSubmission => ({
  id: item.id ?? item.evidenceSubmissionId ?? item.evidence_submission_id,
  evidenceSubmissionId: item.evidenceSubmissionId ?? item.evidence_submission_id ?? item.id,
  requirementId: item.requirementId ?? item.requirement_id ?? '',
  inspectionPlanId: item.inspectionPlanId ?? item.inspection_plan_id,
  branchId: item.branchId ?? item.branch_id ?? '',
  branchName: item.branchName ?? item.branch_name ?? '',
  fileIds: item.fileIds ?? item.file_ids ?? [],
  files: normalizePagedItems<any>(item.files).map(file => ({
    ...normalizeFileAttachment(file),
    fileId: file?.fileId ?? file?.file_id ?? file?.id,
    fileName: file?.fileName ?? file?.file_name ?? file?.name,
    tags: file?.tags ?? [],
  })),
  status: item.status ?? 'SUBMITTED',
  submitTime: item.submitTime ?? item.submittedAt ?? item.submitted_at,
  hqFeedback: item.hqFeedback ?? item.hq_feedback,
  relatedIssueId: item.relatedIssueId ?? item.related_issue_id,
  reviewedBy: item.reviewedBy ?? item.reviewed_by,
  reviewedByName: item.reviewedByName ?? item.reviewed_by_name,
  reviewedAt: item.reviewedAt ?? item.reviewed_at,
  reviewComment: item.reviewComment ?? item.review_comment,
  reviewDecision: item.reviewDecision ?? item.review_decision,
});

const normalizeWorkingPaper = (item: any): WorkingPaper => ({
  id: item.id ?? item.workingPaperId ?? item.working_paper_id,
  workingPaperId: item.workingPaperId ?? item.working_paper_id ?? item.id,
  inspectionPlanId: item.inspectionPlanId ?? item.inspection_plan_id,
  planId: item.planId ?? item.inspectionPlanId ?? item.inspection_plan_id,
  paperCode: item.paperCode ?? item.paper_code ?? '',
  title: item.title ?? '',
  category: item.category ?? '',
  inspector: item.inspector ?? item.inspectorName ?? item.inspector_name ?? '',
  inspectorUserId: item.inspectorUserId ?? item.inspector_user_id,
  inspectorSnapshot: item.inspectorSnapshot ?? item.inspector_snapshot,
  branchId: item.branchId ?? item.branch_id ?? item.targetOrgId ?? item.target_org_id,
  targetOrgId: item.targetOrgId ?? item.target_org_id ?? item.branchId ?? item.branch_id,
  targetOrgName: item.targetOrgName ?? item.target_org_name ?? item.targetOrgSnapshot?.orgName ?? '',
  targetOrgSnapshot: item.targetOrgSnapshot ?? item.target_org_snapshot,
  guidelines: item.guidelines ?? [],
  procedure: item.procedure ?? '',
  executionRecord: item.executionRecord ?? item.execution_record ?? '',
  result: item.result ?? 'DRAFT',
  fileIds: item.fileIds ?? item.file_ids ?? [],
  files: normalizePagedItems<any>(item.files).map(file => ({
    fileId: file?.fileId ?? file?.file_id ?? file?.id,
    fileName: file?.fileName ?? file?.file_name ?? file?.name,
    contentType: file?.contentType ?? file?.content_type,
    fileSize: file?.fileSize ?? file?.file_size,
    uploadedAt: file?.uploadedAt ?? file?.uploaded_at,
    scanStatus: file?.scanStatus ?? file?.scan_status,
  })),
  evidenceList: item.evidenceList ?? item.evidence_list ?? [],
  isConvertedToIssue: Boolean(item.convertedIssueId ?? item.converted_issue_id ?? item.relatedIssueId ?? item.related_issue_id),
  relatedIssueId: item.relatedIssueId ?? item.related_issue_id ?? null,
  convertedIssueId: item.convertedIssueId ?? item.converted_issue_id ?? null,
  createdAt: item.createdAt ?? item.created_at,
  updatedAt: item.updatedAt ?? item.updated_at,
  updateTime: item.updateTime ?? item.updatedAt ?? item.updated_at ?? item.update_time ?? '',
});

const normalizeInspectionIssue = (item: any) => ({
  id: item.id ?? item.issueId ?? item.issue_id,
  issueId: item.issueId ?? item.issue_id ?? item.id,
  issueCode: item.issueCode ?? item.issue_code ?? item.id ?? item.issueId ?? '',
  inspectionPlanId: item.inspectionPlanId ?? item.inspection_plan_id ?? '',
  branchId: item.branchId ?? item.branch_id ?? '',
  branchName: item.branchSnapshot?.orgName ?? item.branch_snapshot?.orgName ?? '',
  title: item.title ?? '',
  riskLevel: normalizeRiskLevel(item.riskLevel ?? item.risk_level),
  status: item.status ?? 'PENDING_CONFIRMATION',
  description: item.description ?? '',
  basisRule: item.basisRule ?? item.basis_rule ?? '',
  appealDeadline: item.appealDeadline ?? item.appeal_deadline ?? '',
  validity: item.validity ?? 'PENDING',
  sourceWorkingPaperId: item.sourceWorkingPaperId ?? item.source_working_paper_id ?? null,
  createdBy: item.createdBy ?? item.created_by ?? null,
  createdAt: item.createdAt ?? item.created_at ?? null,
});

export const realAuthApi = {
  login: async (username: string, password: string): Promise<AuthSession> => {
    return fetchJson('/platform/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },
  me: async (): Promise<AuthUser> => {
    return fetchWithAuth('/platform/auth/me');
  },
};

export const realIssueApi = {
  getIssues: async (params?: Record<string, string>): Promise<ComplianceIssue[]> => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    const data = await fetchWithAuth(`/issues${query}`);
    return normalizePagedItems<any>(data).map(normalizeIssue);
  },
  getIssueLedgerPage: async (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    const [data, rectificationData] = await Promise.all([
      fetchWithAuth(`/issues${query}`),
      fetchWithAuth('/rectifications?pageSize=100').catch(() => ({ items: [] })),
    ]);
    const items = normalizePagedItems<any>(data).map(normalizeIssue);
    const rectificationByIssueId = new Map(
      normalizePagedItems<any>(rectificationData)
        .map(normalizeRectification)
        .map(item => [item.sourceIssueId, item.id])
    );
    const today = new Date();
    return {
      totalRecords: data?.total ?? items.length,
      currentPage: data?.page ?? 1,
      pageSize: data?.pageSize ?? items.length,
      records: items.map(item => {
        const due = item.slaDeadline ? new Date(item.slaDeadline) : today;
        const slaDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return {
          issueId: item.id,
          rectificationId: rectificationByIssueId.get(item.id),
          title: item.title,
          responsibleOrgName: item.responsibleDept,
          riskLevel: item.riskLevel,
          status: item.status,
          slaDays,
        };
      }),
    };
  },
  getIssueProjectTracker: async (
    params?: Record<string, string | number | undefined>
  ): Promise<IssueProjectRollupPage> => {
    return fetchWithAuth(`/issues/project-tracker${queryString(params)}`);
  },
  getIssueProjectBranches: async (
    projectId: string,
    params?: Record<string, string | number | undefined>
  ): Promise<IssueProjectBranchProgressPage> => {
    return fetchWithAuth(`/issues/project-tracker/${encodeURIComponent(projectId)}/branches${queryString(params)}`);
  },
  sendProjectOverdueReminder: async (
    projectId: string,
    payload: {
      targetOrgIds: string[];
      reason?: string;
      requestId?: string;
      deliveryMode?: string;
    }
  ): Promise<IssueProjectReminderResponse> => {
    return fetchWithAuth(`/issues/project-tracker/${encodeURIComponent(projectId)}/overdue-reminders`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getIssueAnalytics: async (
    params?: Record<string, string | number | undefined>
  ): Promise<IssueAnalyticsReadModel> => {
    return fetchWithAuth(`/issues/analytics${queryString(params)}`);
  },
  getBranchRectifications: async (params?: Record<string, string>): Promise<RectificationRecord[]> => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    const data = await fetchWithAuth(`/rectifications${query}`);
    return normalizePagedItems<any>(data).map(normalizeRectification);
  },
  submitFeedback: async (rectificationId: string, content: string, fileIds: string[] = []): Promise<RectificationRecord> => {
    const data = await fetchWithAuth(`/rectifications/${rectificationId}/feedback`, {
      method: 'POST',
      body: JSON.stringify({ content, fileIds }),
    });
    return normalizeRectification(data);
  },
  startRectification: async (rectificationId: string): Promise<RectificationRecord> => {
    const data = await fetchWithAuth(`/rectifications/${rectificationId}/start`, {
      method: 'POST',
    });
    return normalizeRectification(data);
  },
  verifyRectification: async (rectificationId: string, decision: 'APPROVE' | 'REJECT', rejectReason?: string): Promise<RectificationRecord> => {
    const data = await fetchWithAuth(`/rectifications/${rectificationId}/verification`, {
      method: 'POST',
      body: JSON.stringify({ decision, rejectReason }),
    });
    return normalizeRectification(data);
  }
};

export const realTaskApi = {
  getHQTasks: async (type?: string): Promise<UnifiedTask[]> => {
    const query = type ? `?${new URLSearchParams({ category: type }).toString()}` : '';
    const data = await fetchWithAuth(`/tasks${query}`);
    return normalizePagedItems<any>(data).map(normalizeTask);
  },
  getBranchTasks: async (type?: string): Promise<UnifiedTask[]> => {
    const query = type ? `?${new URLSearchParams({ category: type }).toString()}` : '';
    const data = await fetchWithAuth(`/tasks${query}`);
    return normalizePagedItems<any>(data).map(normalizeTask);
  },
  getCounts: async (params?: {
    category?: string;
    status?: string;
    groupBy?: 'category' | 'status';
  }): Promise<TaskCounts> => {
    return fetchWithAuth(`/tasks/counts${queryString(params)}`);
  },
};

export const realNotificationApi = {
  async list(params?: {
    type?: string;
    isRead?: boolean;
    sourceModule?: string;
    page?: number;
    pageSize?: number;
  }): Promise<NotificationListResponse> {
    const data = await fetchWithAuth(`/notifications${queryString(params)}`);
    const items = normalizePagedItems<any>(data).map(normalizeNotification);
    return {
      items,
      page: data?.page ?? params?.page ?? 1,
      pageSize: data?.pageSize ?? params?.pageSize ?? items.length,
      total: data?.total ?? items.length,
    };
  },
  async unreadCount(): Promise<NotificationUnreadCount> {
    return fetchWithAuth('/notifications/unread-count');
  },
  async markRead(notificationId: string): Promise<NotificationItem> {
    const data = await fetchWithAuth(`/notifications/${notificationId}/read`, { method: 'POST' });
    return normalizeNotification(data);
  },
  async markAllRead(): Promise<{ affectedCount: number; readAt: string | null }> {
    return fetchWithAuth('/notifications/mark-all-read', { method: 'POST' });
  },
};

export const realWorkflowApi = {
  listTemplates: async (): Promise<WorkflowTemplatePage> => {
    return fetchWithAuth('/workflow/templates');
  },
  getTemplate: async (templateId: string): Promise<WorkflowTemplateDetail> => {
    return fetchWithAuth(`/workflow/templates/${encodeURIComponent(templateId)}`);
  },
  saveDraft: async (
    templateId: string,
    payload: Partial<Pick<WorkflowTemplateAggregate, 'name' | 'scopeMode' | 'chains'>>
  ): Promise<WorkflowTemplateDetail> => {
    return fetchWithAuth(`/workflow/templates/${encodeURIComponent(templateId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  validate: async (templateId: string): Promise<WorkflowValidationResponse> => {
    return fetchWithAuth(`/workflow/templates/${encodeURIComponent(templateId)}/validate`, {
      method: 'POST',
    });
  },
  publish: async (templateId: string): Promise<WorkflowPublishResponse> => {
    return fetchWithAuth(`/workflow/templates/${encodeURIComponent(templateId)}/publish`, {
      method: 'POST',
    });
  },
};

export const realAssessmentSchedulerApi = {
  getSchedule: async (scheduleId: string): Promise<AssessmentScheduleDetail> => {
    return fetchWithAuth(`/assessment/schedules/${encodeURIComponent(scheduleId)}`);
  },
  saveDraft: async (
    scheduleId: string,
    payload: {
      frequency: string;
      workingDayOffset: number;
      fireTime: string;
      timezone: string;
      calendarCode?: string;
    },
  ): Promise<AssessmentScheduleDetail> => {
    return fetchWithAuth(`/assessment/schedules/${encodeURIComponent(scheduleId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  activate: async (scheduleId: string): Promise<ScheduleActivationResponse> => {
    return fetchWithAuth(`/assessment/schedules/${encodeURIComponent(scheduleId)}/activate`, {
      method: 'POST',
    });
  },
  listExecutions: async (
    scheduleId: string,
    params?: { page?: number; pageSize?: number },
  ): Promise<ScheduleExecutionPage> => {
    return fetchWithAuth(`/assessment/schedules/${encodeURIComponent(scheduleId)}/executions${queryString(params)}`);
  },
  retryExecution: async (
    executionId: string,
    payload: { reason?: string; requestId?: string; idempotencyKey?: string },
  ): Promise<ScheduleRetryResponse> => {
    return fetchWithAuth(`/assessment/schedule-executions/${encodeURIComponent(executionId)}/retry`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  dispatchNow: async (
    scheduleId: string,
    idempotencyKey?: string,
  ): Promise<ScheduleDispatchNowResponse> => {
    return fetchWithAuth(`/assessment/schedules/${encodeURIComponent(scheduleId)}/dispatch-now`, {
      method: 'POST',
      body: JSON.stringify({ idempotencyKey }),
    });
  },
};

export const realAssessmentSimulationApi = {
  run: async (payload: {
    schemeId: string;
    schemeVersionId?: string | null;
    referencePeriod: string;
    targetOrgIds?: string[];
    imputationPolicy: string;
    schemeDraftSnapshot?: Record<string, unknown>;
    requestId?: string;
  }): Promise<AssessmentSimulationDetail> => {
    return fetchWithAuth('/assessment/simulations', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  get: async (simulationId: string): Promise<AssessmentSimulationDetail> => {
    return fetchWithAuth(`/assessment/simulations/${encodeURIComponent(simulationId)}`);
  },
};

export const realDataCockpitApi = {
  health: async (): Promise<DataSourceHealthSummary> => {
    return fetchWithAuth('/assessment/data-sources/health');
  },
  listJobs: async (params?: {
    timeRange?: string;
    source?: string;
    status?: string;
    keyword?: string;
    page?: number;
    pageSize?: number;
  }): Promise<DataSyncJobPage> => {
    return fetchWithAuth(`/assessment/data-sync/jobs${queryString(params)}`);
  },
  snapshot: async (jobId: string): Promise<DataSyncSnapshot> => {
    return fetchWithAuth(`/assessment/data-sync/jobs/${encodeURIComponent(jobId)}/snapshot`);
  },
  retry: async (
    jobId: string,
    payload: { reason: string; requestId?: string },
  ): Promise<DataSyncCommandResponse> => {
    return fetchWithAuth(`/assessment/data-sync/jobs/${encodeURIComponent(jobId)}/retry`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  ignoreAlert: async (
    alertId: string,
    payload: { reason: string; requestId?: string },
  ): Promise<DataSyncAlertCommandResponse> => {
    return fetchWithAuth(`/assessment/data-sync/alerts/${encodeURIComponent(alertId)}/ignore`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  overwriteRerun: async (
    jobId: string,
    payload: {
      reason: string;
      riskAcknowledgement: boolean;
      approvalMarker?: string;
      requestId?: string;
    },
  ): Promise<DataSyncOverwriteResponse> => {
    return fetchWithAuth(`/assessment/data-sync/jobs/${encodeURIComponent(jobId)}/overwrite-rerun`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  exportEvidence: async (payload: {
    sourceIds?: string[];
    status?: string[];
    timeRange?: string;
    format?: string;
    redactionPolicy?: string;
    requestId?: string;
  }): Promise<DataSyncExportResponse> => {
    return fetchWithAuth('/assessment/data-sync/exports', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};

export const realUnifiedReviewApi = {
  listTasks: async (params?: {
    bucket?: string;
    sourceOrgId?: string;
    category?: string;
    urgentOnly?: boolean;
    keyword?: string;
    page?: number;
    pageSize?: number;
  }): Promise<UnifiedReviewTaskPage> => {
    return fetchWithAuth(`/review-workbench/tasks${queryString(params)}`);
  },
  getTask: async (reviewTaskId: string): Promise<UnifiedReviewTaskDetail> => {
    return fetchWithAuth(`/review-workbench/tasks/${encodeURIComponent(reviewTaskId)}`);
  },
  saveTask: async (
    reviewTaskId: string,
    payload: { comment?: string; version?: number },
  ): Promise<UnifiedReviewTaskDetail> => {
    return fetchWithAuth(`/review-workbench/tasks/${encodeURIComponent(reviewTaskId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  decideTask: async (
    reviewTaskId: string,
    payload: {
      decision: 'approve' | 'return_for_rework' | 'reject_to_previous_level' | string;
      reason?: string;
      comment?: string;
      version?: number;
      requestId?: string;
      idempotencyKey?: string;
    },
  ): Promise<UnifiedReviewTaskDetail> => {
    return fetchWithAuth(`/review-workbench/tasks/${encodeURIComponent(reviewTaskId)}/decision`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  batchDecision: async (payload: {
    decision: 'approve' | 'reject_to_previous_level' | string;
    reason?: string;
    requestId?: string;
    items: Array<{ reviewTaskId: string; version?: number; comment?: string; idempotencyKey?: string }>;
  }): Promise<UnifiedReviewBatchDecisionResponse> => {
    return fetchWithAuth('/review-workbench/tasks/batch-decision', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};

export const realInspectionApi = {
  getPlans: async (
    params?: Record<string, string | number | boolean | undefined>,
  ): Promise<InspectionPlanListResponse> => {
    const query = queryString(params);
    const data = await fetchWithAuth(`/inspection/plans${query}`);
    const items = normalizePagedItems<any>(data).map(normalizeInspectionPlan);
    return {
      items,
      page: data?.page ?? params?.page ?? 1,
      pageSize: data?.pageSize ?? params?.pageSize ?? items.length,
      total: data?.total ?? items.length,
    };
  },
  getPlan: async (inspectionPlanId: string): Promise<InspectionPlan> => {
    const data = await fetchWithAuth(`/inspection/plans/${inspectionPlanId}`);
    return normalizeInspectionPlan(data);
  },
  createPlan: async (payload: {
    title: string;
    inspectCode?: string;
    type?: string;
    frequency?: string;
    confidentialityLevel?: string;
    targetDept?: string;
    targetOrgIds?: string[];
    targetPersonnelIds?: string[];
    leaderUserId?: string;
    teamMemberUserIds?: string[];
    plannedStartDate?: string;
    plannedEndDate?: string;
    startDate?: string;
    endDate?: string;
    files?: Array<{ attachmentType: string; fileId: string }>;
  }): Promise<InspectionPlan> => {
    const { startDate, endDate, ...rest } = payload;
    const data = await fetchWithAuth('/inspection/plans', {
      method: 'POST',
      body: JSON.stringify({
        ...rest,
        plannedStartDate: payload.plannedStartDate ?? startDate,
        plannedEndDate: payload.plannedEndDate ?? endDate,
      }),
    });
    return normalizeInspectionPlan(data);
  },
  updatePlan: async (
    inspectionPlanId: string,
    payload: {
      title?: string;
      inspectCode?: string;
      type?: string;
      frequency?: string;
      confidentialityLevel?: string;
      targetDept?: string;
      targetOrgIds?: string[];
      targetPersonnelIds?: string[];
      leaderUserId?: string;
      teamMemberUserIds?: string[];
      plannedStartDate?: string;
      plannedEndDate?: string;
      files?: Array<{ attachmentType: string; fileId: string }>;
    },
  ): Promise<InspectionPlan> => {
    const data = await fetchWithAuth(`/inspection/plans/${inspectionPlanId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    return normalizeInspectionPlan(data);
  },
  transitionPlan: async (
    inspectionPlanId: string,
    action: string,
    payload: {
      reason?: string;
      comment?: string;
      idempotencyKey?: string;
      optimisticVersion?: number;
    } = {},
  ): Promise<InspectionPlan> => {
    const data = await fetchWithAuth(`/inspection/plans/${inspectionPlanId}/transitions`, {
      method: 'POST',
      body: JSON.stringify({ action, ...payload }),
    });
    return normalizeInspectionPlan(data);
  },
  acknowledgePlan: async (
    inspectionPlanId: string,
    payload: {
      liaisonName?: string;
      liaisonPhone?: string;
      liaisonTitle?: string;
    } = {},
  ): Promise<InspectionPlanAcknowledgement> => {
    const data = await fetchWithAuth(`/inspection/plans/${inspectionPlanId}/acknowledgement`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return {
      acknowledgementId: data.acknowledgementId ?? data.acknowledgement_id,
      inspectionPlanId: data.inspectionPlanId ?? data.inspection_plan_id,
      targetOrgId: data.targetOrgId ?? data.target_org_id,
      targetOrgName: data.targetOrgName ?? data.target_org_name ?? '',
      ackStatus: data.ackStatus ?? data.ack_status,
      acknowledgedBy: data.acknowledgedBy ?? data.acknowledged_by,
      acknowledgedAt: data.acknowledgedAt ?? data.acknowledged_at,
      liaisonName: data.liaisonName ?? data.liaison_name ?? null,
      liaisonPhone: data.liaisonPhone ?? data.liaison_phone ?? null,
      liaisonTitle: data.liaisonTitle ?? data.liaison_title ?? null,
    };
  },
  getExecutionSummary: async (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return fetchWithAuth(`/inspection/execution/summary${query}`);
  },
  getExecutionDetail: async (inspectionPlanId: string, params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    const data = await fetchWithAuth(`/inspection/plans/${inspectionPlanId}/execution${query}`);
    return {
      ...data,
      inspectionPlan: normalizeInspectionPlan(data.inspectionPlan),
      evidenceRequirements: normalizePagedItems<any>(data.evidenceRequirements).map(normalizeEvidenceRequirement),
      evidenceSubmissions: normalizePagedItems<any>(data.evidenceSubmissions).map(normalizeEvidenceSubmission),
      workingPapers: normalizePagedItems<any>(data.workingPapers).map(normalizeWorkingPaper),
    };
  },
  getWorkingPapers: async (inspectionPlanId: string): Promise<WorkingPaper[]> => {
    const data = await fetchWithAuth(`/inspection/plans/${inspectionPlanId}/working-papers`);
    return normalizePagedItems<any>(data).map(normalizeWorkingPaper);
  },
  createWorkingPaper: async (
    inspectionPlanId: string,
    payload: {
      paperCode: string;
      title: string;
      category: string;
      branchId?: string;
      targetOrgId?: string;
      guidelines?: string[];
      procedure: string;
      executionRecord: string;
      result?: string;
      fileIds?: string[];
      evidenceList?: string[];
      relatedIssueId?: string | null;
      convertedIssueId?: string | null;
    },
  ): Promise<WorkingPaper> => {
    const data = await fetchWithAuth(`/inspection/plans/${inspectionPlanId}/working-papers`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return normalizeWorkingPaper(data);
  },
  updateWorkingPaperResult: async (
    workingPaperId: string,
    payload: {
      result?: string;
      executionRecord?: string;
      fileIds?: string[];
      evidenceList?: string[];
      relatedIssueId?: string | null;
      convertedIssueId?: string | null;
    },
  ): Promise<WorkingPaper> => {
    const data = await fetchWithAuth(`/inspection/working-papers/${encodeURIComponent(workingPaperId)}/result`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    return normalizeWorkingPaper(data);
  },
  getEvidenceRequirements: async (inspectionPlanId: string): Promise<EvidenceRequirement[]> => {
    const data = await fetchWithAuth(`/inspection/plans/${inspectionPlanId}/evidence-requirements`);
    return normalizePagedItems<any>(data).map(normalizeEvidenceRequirement);
  },
  submitEvidence: async (requirementId: string, fileIds: string[]): Promise<EvidenceSubmission> => {
    const data = await fetchWithAuth('/inspection/evidence-submissions', {
      method: 'POST',
      body: JSON.stringify({ requirementId, fileIds }),
    });
    return normalizeEvidenceSubmission(data);
  },
  reviewEvidenceSubmission: async (
    submissionId: string,
    payload: {
      decision: 'APPROVE' | 'REJECT';
      feedback?: string;
      comment?: string;
      idempotencyKey?: string;
    },
  ): Promise<EvidenceSubmission> => {
    const data = await fetchWithAuth(
      `/inspection/evidence-submissions/${encodeURIComponent(submissionId)}/review`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
    return normalizeEvidenceSubmission(data);
  },
  getIssues: async (params?: Record<string, string | number | boolean | undefined>) => {
    const data = await fetchWithAuth(`/inspection/issues${queryString(params)}`);
    return normalizePagedItems<any>(data).map(normalizeInspectionIssue);
  },
  createIssue: async (payload: {
    inspectionPlanId: string;
    branchId: string;
    title: string;
    riskLevel: string;
    description: string;
    basisRule?: string;
    sourceWorkingPaperId?: string;
    idempotencyKey?: string;
  }) => {
    const data = await fetchWithAuth('/inspection/issues', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return normalizeInspectionIssue(data);
  },
  confirmFact: async (issueId: string, decision: string, comment?: string) => {
    return fetchWithAuth(`/inspection/issues/${issueId}/confirmations`, {
      method: 'POST',
      body: JSON.stringify({ decision, comment }),
    });
  },
  submitAppeal: async (issueId: string, reason: string, fileIds: string[] = []) => {
    return fetchWithAuth(`/inspection/issues/${issueId}/appeals`, {
      method: 'POST',
      body: JSON.stringify({ reason, fileIds }),
    });
  },
  getAppeals: async (params?: Record<string, string>) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return fetchWithAuth(`/inspection/appeals${query}`);
  },
  decideAppeal: async (appealId: string, decision: string, decisionReason = '') => {
    return fetchWithAuth(`/inspection/appeals/${appealId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision, decisionReason }),
    });
  },
  getReportWorkspace: async (inspectionPlanId: string) => {
    return fetchWithAuth(`/inspection/plans/${inspectionPlanId}/report-workspace`);
  },
  generateReportDraft: async (
    inspectionPlanId: string,
    payload: { format?: string; remarks?: string; idempotencyKey: string },
  ) => {
    return fetchWithAuth(`/inspection/plans/${inspectionPlanId}/report-versions/generate`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  bindFinalReport: async (
    inspectionPlanId: string,
    payload: {
      fileAssetId: string;
      supportingFileAssetIds?: string[];
      label?: string;
      remarks?: string;
      idempotencyKey: string;
    },
  ) => {
    return fetchWithAuth(`/inspection/plans/${inspectionPlanId}/report-versions`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  releaseReport: async (
    inspectionPlanId: string,
    reportVersionId: string,
    payload: { comment?: string; optimisticVersion?: number; idempotencyKey: string },
  ) => {
    return fetchWithAuth(
      `/inspection/plans/${inspectionPlanId}/report-versions/${reportVersionId}/release`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },
  getReportAuditEvents: async (
    inspectionPlanId: string,
    params?: Record<string, string | number | boolean | undefined>,
  ) => {
    return fetchWithAuth(
      `/inspection/plans/${inspectionPlanId}/report-audit-events${queryString(params)}`,
    );
  },
  downloadReport: async (inspectionPlanId: string, reportVersionId: string) => {
    return fetchWithAuth(
      `/inspection/plans/${inspectionPlanId}/report-versions/${reportVersionId}/download`,
    );
  },
};

export const realAssessmentApi = {
  getIndicators: async (params?: Record<string, string | number | boolean | undefined>) => {
    return fetchWithAuth(`/assessment/indicators${queryString(params)}`);
  },
  createIndicator: async (payload: any) => {
    return fetchWithAuth('/assessment/indicators', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateIndicatorDraft: async (indicatorId: string, versionId: string, payload: any) => {
    return fetchWithAuth(
      `/assessment/indicators/${encodeURIComponent(indicatorId)}/versions/${encodeURIComponent(versionId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
    );
  },
  validateIndicatorScoring: async (indicatorId: string, versionId: string, payload: any = {}) => {
    return fetchWithAuth(
      `/assessment/indicators/${encodeURIComponent(indicatorId)}/versions/${encodeURIComponent(versionId)}/validate-scoring`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },
  publishIndicatorVersion: async (indicatorId: string, versionId: string) => {
    return fetchWithAuth(
      `/assessment/indicators/${encodeURIComponent(indicatorId)}/versions/${encodeURIComponent(versionId)}/publish`,
      { method: 'POST' },
    );
  },
  cloneIndicatorVersion: async (indicatorId: string, versionId: string) => {
    return fetchWithAuth(
      `/assessment/indicators/${encodeURIComponent(indicatorId)}/versions/${encodeURIComponent(versionId)}/clone`,
      { method: 'POST' },
    );
  },
  archiveIndicatorVersion: async (indicatorId: string, versionId: string, payload: any = {}) => {
    return fetchWithAuth(
      `/assessment/indicators/${encodeURIComponent(indicatorId)}/versions/${encodeURIComponent(versionId)}/archive`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },
  getSchemes: async (params?: Record<string, string | number | boolean | undefined>) => {
    return fetchWithAuth(`/assessment/schemes${queryString(params)}`);
  },
  getScheme: async (schemeId: string) => {
    return fetchWithAuth(`/assessment/schemes/${encodeURIComponent(schemeId)}`);
  },
  validateScheme: async (payload: any) => {
    return fetchWithAuth('/assessment/schemes/validate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  validateSchemeDraft: async (schemeId: string, payload: any) => {
    return fetchWithAuth(`/assessment/schemes/${encodeURIComponent(schemeId)}/validate`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  createScheme: async (payload: any) => {
    return fetchWithAuth('/assessment/schemes', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateSchemeDraft: async (schemeId: string, payload: any) => {
    return fetchWithAuth(`/assessment/schemes/${encodeURIComponent(schemeId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  publishScheme: async (schemeId: string, payload: any = {}) => {
    return fetchWithAuth(`/assessment/schemes/${encodeURIComponent(schemeId)}/publish`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  copyScheme: async (schemeId: string, payload: any = {}) => {
    return fetchWithAuth(`/assessment/schemes/${encodeURIComponent(schemeId)}/copy`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  deleteSchemeDraft: async (schemeId: string, payload: any = {}) => {
    return fetchWithAuth(`/assessment/schemes/${encodeURIComponent(schemeId)}`, {
      method: 'DELETE',
      body: JSON.stringify(payload),
    });
  },
  archiveScheme: async (schemeId: string, payload: any) => {
    return fetchWithAuth(`/assessment/schemes/${encodeURIComponent(schemeId)}/archive`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getCycles: async (params?: Record<string, string | number | boolean | undefined>) => {
    return fetchWithAuth(`/assessment/cycles${queryString(params)}`);
  },
  getCycle: async (cycleId: string) => {
    return fetchWithAuth(`/assessment/cycles/${encodeURIComponent(cycleId)}`);
  },
  createCycle: async (payload: any) => {
    return fetchWithAuth('/assessment/cycles', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  dispatchCycle: async (cycleId: string, payload: any = {}) => {
    return fetchWithAuth(`/assessment/cycles/${cycleId}/dispatch`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  sendCycleReminder: async (cycleId: string, payload: any = {}) => {
    return fetchWithAuth(`/assessment/cycles/${encodeURIComponent(cycleId)}/reminders`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  generateResults: async (cycleId: string) => {
    return fetchWithAuth(`/assessment/cycles/${cycleId}/generate-results`, {
      method: 'POST',
    });
  },
  publishResults: async (cycleId: string) => {
    return fetchWithAuth(`/assessment/cycles/${cycleId}/publish-results`, {
      method: 'POST',
    });
  },
  getReportingTasks: async (params?: Record<string, string | number | boolean | undefined>) => {
    return fetchWithAuth(`/assessment/reporting-tasks${queryString(params)}`);
  },
  getReportingTask: async (reportingTaskId: string) => {
    return fetchWithAuth(`/assessment/reporting-tasks/${reportingTaskId}`);
  },
  saveReportingDraft: async (reportingTaskId: string, payload: any) => {
    return fetchWithAuth(`/assessment/reporting-tasks/${reportingTaskId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  submitReportingTask: async (reportingTaskId: string, payload: any) => {
    return fetchWithAuth(`/assessment/reporting-tasks/${reportingTaskId}/submit`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  recallReportingTask: async (reportingTaskId: string) => {
    return fetchWithAuth(`/assessment/reporting-tasks/${reportingTaskId}/recall`, {
      method: 'POST',
    });
  },
  importLedger: async (reportingTaskId: string, payload: any) => {
    return fetchWithAuth(`/assessment/reporting-tasks/${reportingTaskId}/import-ledger`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getDailyLedger: async (params?: Record<string, string | number | boolean | undefined>) => {
    return fetchWithAuth(`/assessment/daily-ledger${queryString(params)}`);
  },
  createDailyLedger: async (payload: any) => {
    return fetchWithAuth('/assessment/daily-ledger', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateDailyLedger: async (ledgerEntryId: string, payload: any) => {
    return fetchWithAuth(`/assessment/daily-ledger/${ledgerEntryId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  deleteDailyLedger: async (ledgerEntryId: string) => {
    return fetchWithAuth(`/assessment/daily-ledger/${ledgerEntryId}`, {
      method: 'DELETE',
    });
  },
  getReviewTasks: async (params?: Record<string, string | number | boolean | undefined>) => {
    return fetchWithAuth(`/assessment/review-tasks${queryString(params)}`);
  },
  getReviewTask: async (reviewTaskId: string) => {
    return fetchWithAuth(`/assessment/review-tasks/${reviewTaskId}`);
  },
  startReview: async (reviewTaskId: string) => {
    return fetchWithAuth(`/assessment/review-tasks/${reviewTaskId}/start`, {
      method: 'POST',
    });
  },
  saveReview: async (reviewTaskId: string, payload: any) => {
    return fetchWithAuth(`/assessment/review-tasks/${reviewTaskId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  decideReview: async (reviewTaskId: string, payload: any) => {
    return fetchWithAuth(`/assessment/review-tasks/${reviewTaskId}/decision`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getResults: async (params?: Record<string, string | number | boolean | undefined>) => {
    return fetchWithAuth(`/assessment/results${queryString(params)}`);
  },
  getResult: async (resultId: string) => {
    return fetchWithAuth(`/assessment/results/${resultId}`);
  },
  confirmResult: async (resultId: string, comment = '') => {
    return fetchWithAuth(`/assessment/results/${resultId}/confirm`, {
      method: 'POST',
      body: JSON.stringify({ comment }),
    });
  },
  submitScoreAppeal: async (resultId: string, payload: any) => {
    return fetchWithAuth(`/assessment/results/${resultId}/appeals`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  finalizeResult: async (resultId: string) => {
    return fetchWithAuth(`/assessment/results/${resultId}/finalize`, {
      method: 'POST',
    });
  },
  decideScoreAppeal: async (scoreAppealId: string, payload: any) => {
    return fetchWithAuth(`/assessment/score-appeals/${scoreAppealId}/decision`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};

export const realDashboardApi = {
  getAssessmentOverview: async () => fetchWithAuth('/assessment/dashboard/overview'),
  getGovernance: async () => fetchWithAuth('/dashboard/governance'),
  getBranchPortrait: async (orgId: string) => fetchWithAuth(`/dashboard/branches/${orgId}/portrait`),
};

export const realFileApi = {
  uploadFile: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return fetchWithAuth('/files', {
      method: 'POST',
      body: formData,
    });
  },
  getDownloadUrl: async (fileId: string) => {
    return fetchWithAuth(`/files/${encodeURIComponent(fileId)}/download`);
  },
};

export const realSystemApi = {
  getOrgTree: async () => fetchWithAuth('/system/org-tree'),
  getDictionaries: async () => fetchWithAuth('/system/dictionaries'),
  getConfigDictionaries: async (types?: string[]): Promise<ConfigDictionariesResponse> => {
    return fetchWithAuth(`/system/config-dictionaries${queryString({ types: types?.join(',') })}`);
  },
  getDictionaryAdminTypes: async (): Promise<DictionaryAdminTypeListResponse> => {
    return fetchWithAuth('/system/dictionary-admin/types');
  },
  getDictionaryAdminItems: async (
    params: DictionaryAdminItemListParams = {},
  ): Promise<DictionaryAdminItemListResponse> => {
    return fetchWithAuth(`/system/dictionary-admin/items${queryString({
      dictType: params.dictType,
      keyword: params.keyword,
      active: params.active,
      includeDeleted: params.includeDeleted,
      page: params.page,
      pageSize: params.pageSize,
    })}`);
  },
  createDictionaryAdminItem: async (
    payload: DictionaryAdminItemCreateRequest,
  ): Promise<DictionaryAdminItem> => {
    return fetchWithAuth('/system/dictionary-admin/items', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateDictionaryAdminItem: async (
    dictId: string,
    payload: DictionaryAdminItemUpdateRequest,
  ): Promise<DictionaryAdminItem> => {
    return fetchWithAuth(`/system/dictionary-admin/items/${encodeURIComponent(dictId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  deleteDictionaryAdminItem: async (
    dictId: string,
    version?: number,
  ): Promise<DictionaryAdminDeleteResponse> => {
    return fetchWithAuth(
      `/system/dictionary-admin/items/${encodeURIComponent(dictId)}${queryString({ version })}`,
      { method: 'DELETE' },
    );
  },
  sortDictionaryAdminItems: async (
    items: DictionaryAdminSortRequestItem[],
  ): Promise<DictionaryAdminItemListResponse> => {
    return fetchWithAuth('/system/dictionary-admin/items:sort', {
      method: 'POST',
      body: JSON.stringify({ items }),
    });
  },
  getPersonnel: async () => {
    const data = await fetchWithAuth('/system/personnel');
    return normalizePagedItems<any>(data);
  },
  getRoles: async () => fetchWithAuth('/system/roles'),
  getRoleAssignments: async () => fetchWithAuth('/system/role-assignments'),
  createRoleAssignment: async (payload: { roleId: string; personnelId: string; orgId: string }) => {
    return fetchWithAuth('/system/role-assignments', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  deleteRoleAssignment: async (assignmentId: string) => {
    return fetchWithAuth(`/system/role-assignments/${assignmentId}`, {
      method: 'DELETE',
    });
  },
};
