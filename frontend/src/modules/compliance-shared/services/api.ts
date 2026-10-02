import * as mock from './mock';
import type {
  AssessmentResult,
  AssessmentScheme,
  AuthUser,
  BranchPortrait,
  ComplianceIssue,
  DistributionTask,
  EvidenceRequirement,
  EvidenceSubmission,
  ExecutionStats,
  GlobalMetrics,
  Indicator,
  IndicatorVersion,
  InspectionPhase,
  InspectionPlan,
  InspectionPlanAcknowledgement,
  LocalBranchProfile,
  MockUser,
  RectificationRecord,
  ReportingTask,
  ReviewTask,
  SchemeMonitorStats,
  SubmissionStatus,
  UnifiedTask,
  WorkingPaper,
} from '../types';

import {
  getStoredAuthUser,
  realAssessmentApi,
  realDataCockpitApi,
  realAssessmentSchedulerApi,
  realAssessmentSimulationApi,
  realAuthApi,
  realDashboardApi,
  realFileApi,
  realInspectionApi,
  realIssueApi,
  realNotificationApi,
  realSystemApi,
  realTaskApi,
  realUnifiedReviewApi,
  realWorkflowApi,
} from './realApi';
import {
  DEFAULT_INSPECTION_PLAN_FREQUENCY_CODE,
  DEFAULT_INSPECTION_PLAN_TYPE_CODE,
  isInspectionPlanFrequencyCode,
  isInspectionPlanTypeCode,
  normalizeInspectionPlanFrequencyCode,
  normalizeInspectionPlanFrequencyFilter,
  normalizeInspectionPlanTypeCode,
  normalizeInspectionPlanTypeFilter,
} from './inspectionPlanCodeMapper';
import { toWorkflowInstances } from './assessmentWorkflowReadModel';
import type {
  IssueAnalyticsReadModel,
  IssueProjectBranchProgressPage,
  IssueProjectReminderResponse,
  IssueProjectRollupPage,
  NotificationItem,
  AssessmentScheduleDetail,
  AssessmentScheduleRule,
  AssessmentSimulationDetail,
  AssessmentSimulationImputationNote,
  AssessmentSimulationOrgResult,
  AssessmentSimulationSummary,
  DataSourceHealthSummary,
  DataSyncAlertCommandResponse,
  DataSyncCommandResponse,
  DataSyncExportResponse,
  DataSyncJob,
  DataSyncJobPage,
  DataSyncOverwriteResponse,
  DataSyncSnapshot,
  ConfigDictionariesResponse,
  ConfigDictionaryItem,
  DictionaryAdminDeleteResponse,
  DictionaryAdminItem,
  DictionaryAdminItemCreateRequest,
  DictionaryAdminItemListParams,
  DictionaryAdminItemListResponse,
  DictionaryAdminItemUpdateRequest,
  DictionaryAdminSortRequestItem,
  DictionaryAdminTypeListResponse,
  DictionaryAdminTypeSummary,
  InspectionPlanListResponse,
  ScheduleActivationResponse,
  ScheduleDispatchNowResponse,
  ScheduleExecution,
  ScheduleExecutionPage,
  ScheduleRetryResponse,
  TaskCounts,
  UnifiedReviewBatchDecisionResponse,
  UnifiedReviewTaskDetail,
  UnifiedReviewTaskPage,
  UnifiedReviewTaskSummary,
  WorkflowPublishResponse,
  WorkflowRouteChain,
  WorkflowTemplateAggregate,
  WorkflowTemplateDetail,
  WorkflowTemplatePage,
  WorkflowTemplateSummary,
  WorkflowValidationResponse,
} from './realApi';

export type {
  AssessmentSchemeItem,
  FormIndicator,
} from './mock/assessment';

export type {
  IssueAnalyticsReadModel,
  IssueProjectBranchProgress,
  IssueProjectBranchProgressPage,
  IssueProjectReminderResponse,
  IssueProjectRollup,
  IssueProjectRollupPage,
  NotificationItem,
  AssessmentScheduleDetail,
  AssessmentScheduleRule,
  AssessmentSimulationDetail,
  AssessmentSimulationImputationNote,
  AssessmentSimulationOrgResult,
  AssessmentSimulationSummary,
  DataSourceHealthItem,
  DataSourceHealthStatus,
  DataSourceHealthSummary,
  DataSyncAlertCommandResponse,
  DataSyncCommandResponse,
  DataSyncExportResponse,
  DataSyncJob,
  DataSyncJobPage,
  DataSyncJobStatus,
  DataSyncOverwriteResponse,
  DataSyncSnapshot,
  ConfigDictionariesResponse,
  ConfigDictionaryItem,
  DictionaryAdminDeleteResponse,
  DictionaryAdminItem,
  DictionaryAdminItemCreateRequest,
  DictionaryAdminItemListParams,
  DictionaryAdminItemListResponse,
  DictionaryAdminItemUpdateRequest,
  DictionaryAdminSortRequestItem,
  DictionaryAdminTypeListResponse,
  DictionaryAdminTypeSummary,
  ScheduleActivationResponse,
  ScheduleDispatchNowResponse,
  ScheduleExecution,
  ScheduleExecutionPage,
  ScheduleRetryResponse,
  TaskCounts,
  UnifiedReviewActionEligibility,
  UnifiedReviewApprover,
  UnifiedReviewAuditEvent,
  UnifiedReviewBatchDecisionResponse,
  UnifiedReviewQuickPhrase,
  UnifiedReviewRouteSnapshot,
  UnifiedReviewTaskDetail,
  UnifiedReviewTaskPage,
  UnifiedReviewTaskSummary,
  WorkflowApproverSelector,
  WorkflowEdge,
  WorkflowNode,
  WorkflowPublishResponse,
  WorkflowRouteChain,
  WorkflowTargetScope,
  WorkflowTemplateAggregate,
  WorkflowTemplateDetail,
  WorkflowTemplatePage,
  WorkflowTemplateSummary,
  WorkflowTemplateVersion,
  WorkflowValidationFinding,
  WorkflowValidationResponse,
  WorkflowValidationSummary,
} from './realApi';

export type {
  OrgNode,
  RoleAssignment,
  SystemRole,
  Personnel,
} from './mock/system';

const MOCK_LATENCY = 520;
export type ApiMode = 'real' | 'hybrid' | 'mock';
export const API_MODE = ((import.meta.env.VITE_API_MODE || 'real') as ApiMode);
export const DEFAULT_INSPECTION_PLAN_ID =
  import.meta.env.VITE_DEFAULT_INSPECTION_PLAN_ID || 'INSP-PLAN-WLZQ-2026-AML-001';

export interface MockBoundaryEvent {
  area: string;
  message: string;
  mode: ApiMode;
}

const isRealBackedP0 = API_MODE === 'real' || API_MODE === 'hybrid';
const isRealBackedP1 = API_MODE === 'real';
const isRealBackedP2 = API_MODE === 'real' || API_MODE === 'hybrid';
const isRealBackedSchemeEditor = API_MODE === 'real' || API_MODE === 'hybrid';
const warnMockBoundary = (area: string, message: string) => {
  const event: MockBoundaryEvent = { area, message, mode: API_MODE };
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<MockBoundaryEvent>('compliance-api-mock-boundary', { detail: event }));
  }
  if (import.meta.env.DEV) {
    console.warn(`[api:${API_MODE}] ${area} uses mock data: ${message}`);
  }
};

const wait = (ms = MOCK_LATENCY) => new Promise(resolve => setTimeout(resolve, ms));

const toAuthUser = ({ password: _password, aliases: _aliases, ...user }: MockUser): AuthUser => user;
const cloneList = <T>(items: readonly T[]): T[] => [...items];
const cloneObject = <T extends object>(item: T): T => ({ ...item });
const cloneIssueLedgerPage = (): mock.IssueLedgerPage => ({
  ...mock.mockIssueLedgerPage,
  records: cloneList(mock.mockIssueLedgerPage.records),
});
const cloneInspectionRectificationWorkspace = (): mock.InspectionRectificationWorkspaceData => ({
  stats: cloneObject(mock.mockInspectionRectificationWorkspace.stats),
  ledger: cloneList(mock.mockInspectionRectificationWorkspace.ledger),
});
const cloneAssessmentTrendDataMap = (): typeof mock.mockAssessmentTrendDataMap =>
  Object.fromEntries(
    Object.entries(mock.mockAssessmentTrendDataMap).map(([key, value]) => [key, cloneList(value)])
  ) as typeof mock.mockAssessmentTrendDataMap;
const cloneUnifiedReviewTasks = (): typeof mock.mockUnifiedReviewTasks =>
  mock.mockUnifiedReviewTasks.map(task => ({
    ...task,
    history: cloneList(task.history),
  }));
const mockIssueProjectPage = (): IssueProjectRollupPage => ({
  items: [
    {
      projectId: DEFAULT_INSPECTION_PLAN_ID,
      id: DEFAULT_INSPECTION_PLAN_ID,
      projectTitle: '2026年反洗钱专项检查',
      title: '2026年反洗钱专项检查',
      sourceType: 'INSPECTION',
      dateRange: { startDate: '2026-04-01', endDate: '2026-05-30' },
      dateRangeLabel: '2026-04-01 ~ 2026-05-30',
      leadDeptSnapshot: { orgId: 'WLZQ-HQ-COMPLIANCE', orgName: '合规管理部', source: 'mock_mode_sample' },
      leadDept: '合规管理部',
      metrics: { totalIssues: 5, completed: 1, inProgress: 3, overdue: 1, completionRate: 20 },
      status: 'AT_RISK',
      overdueTargetOrgIds: ['WLZQ-RBC-GZ-LIWAN'],
    },
    {
      projectId: 'ASSESSMENT-GUARDRAIL-001',
      id: 'ASSESSMENT-GUARDRAIL-001',
      projectTitle: '2026年Q1分支机构综合合规考核',
      title: '2026年Q1分支机构综合合规考核',
      sourceType: 'ASSESSMENT',
      dateRange: { startDate: '2026-04-15', endDate: '2026-05-20' },
      dateRangeLabel: '2026-04-15 ~ 2026-05-20',
      leadDeptSnapshot: { orgId: 'WLZQ-RBC-GZ-LIWAN', orgName: '广州荔湾分公司', source: 'mock_mode_sample' },
      leadDept: '广州荔湾分公司',
      metrics: { totalIssues: 2, completed: 2, inProgress: 0, overdue: 0, completionRate: 100 },
      status: 'CLOSED',
      overdueTargetOrgIds: [],
    },
  ],
  page: 1,
  pageSize: 20,
  total: 2,
  summary: { totalProjects: 2, atRiskProjects: 1 },
});
const mockIssueProjectBranches = (projectId: string): IssueProjectBranchProgressPage => ({
  items: projectId === DEFAULT_INSPECTION_PLAN_ID
    ? [
        {
          projectId,
          orgId: 'WLZQ-RBC-GZ-LIWAN',
          id: 'WLZQ-RBC-GZ-LIWAN',
          orgSnapshot: { orgId: 'WLZQ-RBC-GZ-LIWAN', orgName: '广州荔湾分公司' },
          name: '广州荔湾分公司',
          total: 4,
          completed: 1,
          overdue: 1,
          status: 'RISK',
          drilldownFilters: { projectId, responsibleOrgId: 'WLZQ-RBC-GZ-LIWAN' },
        },
        {
          projectId,
          orgId: 'WLZQ-RBC-SHENZHEN',
          id: 'WLZQ-RBC-SHENZHEN',
          orgSnapshot: { orgId: 'WLZQ-RBC-SHENZHEN', orgName: '深圳分公司' },
          name: '深圳分公司',
          total: 1,
          completed: 0,
          overdue: 0,
          status: 'IN_PROGRESS',
          drilldownFilters: { projectId, responsibleOrgId: 'WLZQ-RBC-SHENZHEN' },
        },
      ]
    : [
        {
          projectId,
          orgId: 'WLZQ-RBC-GZ-LIWAN',
          id: 'WLZQ-RBC-GZ-LIWAN',
          orgSnapshot: { orgId: 'WLZQ-RBC-GZ-LIWAN', orgName: '广州荔湾分公司' },
          name: '广州荔湾分公司',
          total: 1,
          completed: 1,
          overdue: 0,
          status: 'DONE',
          drilldownFilters: { projectId, responsibleOrgId: 'WLZQ-RBC-GZ-LIWAN' },
        },
      ],
  page: 1,
  pageSize: 20,
  total: projectId === DEFAULT_INSPECTION_PLAN_ID ? 2 : 1,
});
const mockDataSyncJobs: DataSyncJob[] = [
  {
    jobId: 'DSJOB-HR-TRAINING-MOCK',
    sourceId: 'EDS-HR-MOCK',
    sourceCode: 'HR_SYS',
    indicatorId: 'AIND-MOCK-001',
    indicatorName: 'Branch compliance material timeliness sandbox sample',
    cycleId: null,
    status: 'SUCCESS',
    records: 1250,
    errorCode: null,
    errorMessage: null,
    startedAt: '2026-05-29T10:00:05Z',
    finishedAt: '2026-05-29T10:00:20Z',
    hasSnapshot: true,
    openAlertCount: 0,
    alertIds: [],
    sandboxOnly: true,
    nonProductionLabel: 'explicit mock sandbox data sync job',
  },
  {
    jobId: 'DSJOB-TRADE-AML-MOCK',
    sourceId: 'EDS-TRADE-MOCK',
    sourceCode: 'TRADE_CORE',
    indicatorId: 'AIND-MOCK-002',
    indicatorName: 'AML large transaction sandbox sample',
    cycleId: null,
    status: 'FAILED',
    records: 0,
    errorCode: 'SANDBOX_TIMEOUT',
    errorMessage: 'Explicit mock sandbox connector timeout; no production endpoint was called',
    startedAt: '2026-05-29T10:05:12Z',
    finishedAt: '2026-05-29T10:05:30Z',
    hasSnapshot: false,
    openAlertCount: 1,
    alertIds: ['DSALERT-TRADE-AML-MOCK'],
    sandboxOnly: true,
    nonProductionLabel: 'explicit mock sandbox data sync job',
  },
  {
    jobId: 'DSJOB-CRM-COMPLAINT-MOCK',
    sourceId: 'EDS-CRM-MOCK',
    sourceCode: 'CRM_SYS',
    indicatorId: 'AIND-MOCK-003',
    indicatorName: 'Customer complaint closure sandbox sample',
    cycleId: null,
    status: 'SUCCESS',
    records: 84,
    errorCode: null,
    errorMessage: null,
    startedAt: '2026-05-29T10:15:00Z',
    finishedAt: '2026-05-29T10:15:08Z',
    hasSnapshot: true,
    openAlertCount: 0,
    alertIds: [],
    sandboxOnly: true,
    nonProductionLabel: 'explicit mock sandbox data sync job',
  },
];

const mockDataSourceHealth = (): DataSourceHealthSummary => ({
  generatedAt: new Date().toISOString(),
  sandboxOnly: true,
  evidenceLabel: 'SANDBOX_DATA_READINESS_EVIDENCE',
  readinessLevel: 'PARTIAL',
  connectedSourceCount: 2,
  totalSourceCount: 3,
  todayRunCount: mockDataSyncJobs.length,
  unresolvedFailureCount: 1,
  failedJobCount: mockDataSyncJobs.filter(job => job.status === 'FAILED').length,
  sources: [
    {
      sourceId: 'EDS-HR-MOCK',
      sourceCode: 'HR_SYS',
      sourceName: 'HR system explicit mock sandbox stub',
      ownerDeptSnapshot: { orgId: 'WLZQ-HQ-COMPLIANCE', orgName: 'Compliance Management Department' },
      connectorType: 'SANDBOX_STUB',
      healthStatus: 'ONLINE',
      lastHeartbeatAt: '2026-05-29T10:00:00Z',
      lastSuccessfulJobId: 'DSJOB-HR-TRAINING-MOCK',
      lastFailureJobId: null,
      sandboxOnly: true,
      nonProductionLabel: 'explicit mock sandbox readiness source',
    },
    {
      sourceId: 'EDS-TRADE-MOCK',
      sourceCode: 'TRADE_CORE',
      sourceName: 'Core trading explicit mock sandbox stub',
      ownerDeptSnapshot: { orgId: 'WLZQ-HQ-COMPLIANCE', orgName: 'Compliance Management Department' },
      connectorType: 'SANDBOX_STUB',
      healthStatus: 'DEGRADED',
      lastHeartbeatAt: '2026-05-29T10:05:00Z',
      lastSuccessfulJobId: null,
      lastFailureJobId: 'DSJOB-TRADE-AML-MOCK',
      sandboxOnly: true,
      nonProductionLabel: 'explicit mock sandbox readiness source',
    },
    {
      sourceId: 'EDS-CRM-MOCK',
      sourceCode: 'CRM_SYS',
      sourceName: 'CRM explicit mock sandbox stub',
      ownerDeptSnapshot: { orgId: 'WLZQ-HQ-COMPLIANCE', orgName: 'Compliance Management Department' },
      connectorType: 'SANDBOX_STUB',
      healthStatus: 'ONLINE',
      lastHeartbeatAt: '2026-05-29T10:15:00Z',
      lastSuccessfulJobId: 'DSJOB-CRM-COMPLAINT-MOCK',
      lastFailureJobId: null,
      sandboxOnly: true,
      nonProductionLabel: 'explicit mock sandbox readiness source',
    },
  ],
});

const mockDataSyncJobPage = (params?: {
  timeRange?: string;
  source?: string;
  status?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}): DataSyncJobPage => {
  const source = params?.source && params.source !== 'all' ? params.source : undefined;
  const status = params?.status && params.status !== 'all' ? params.status : undefined;
  const keyword = (params?.keyword ?? '').trim().toLowerCase();
  const page = params?.page ?? 1;
  const pageSize = params?.pageSize ?? 20;
  let items = cloneList(mockDataSyncJobs);
  if (source) items = items.filter(job => job.sourceCode === source);
  if (status) items = items.filter(job => job.status === status);
  if (keyword) {
    items = items.filter(job =>
      [job.jobId, job.indicatorName, job.sourceCode].some(value => value.toLowerCase().includes(keyword))
    );
  }
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page,
    pageSize,
    total: items.length,
    filterSnapshot: {
      timeRange: params?.timeRange ?? '7days',
      source: source ?? 'all',
      status: status ?? 'all',
      keyword: params?.keyword ?? '',
      sandboxOnly: true,
    },
  };
};
const mockIssueAnalyticsReadModel = (): IssueAnalyticsReadModel => ({
  filterHash: 'mock-mode',
  period: '2026-ALL',
  kpis: {
    totalIssues: { value: 7, trend: '+0%', isPositive: false },
    overdue: { value: 1, trend: '+0%', isPositive: false },
    closureRate: { value: 43, displayValue: '43%', trend: '+0%', isPositive: true },
    avgFixDays: { value: 34.5, trend: '+0', isPositive: true },
  },
  trendSeries: [
    { month: '2026-04', found: 3, closed: 1 },
    { month: '2026-05', found: 4, closed: 2 },
  ],
  riskDistribution: [
    { name: '高风险', riskLevel: 'HIGH', value: 2 },
    { name: '中风险', riskLevel: 'MEDIUM', value: 2 },
    { name: '低风险', riskLevel: 'LOW', value: 3 },
  ],
  branchRanking: [
    { orgId: 'WLZQ-RBC-GZ-LIWAN', branch: '广州荔湾分公司', overdue: 1, completed: 2, total: 5 },
    { orgId: 'WLZQ-RBC-SHENZHEN', branch: '深圳分公司', overdue: 0, completed: 1, total: 2 },
  ],
  computedAt: new Date().toISOString(),
  exportAllowed: true,
});
const mockWorkflowTemplate = (): WorkflowTemplateAggregate => ({
  templateId: 'WFT-ASSESS-DEFAULT',
  name: 'P2 assessment review route template',
  domain: 'assessment',
  scopeMode: 'by_business_line',
  status: 'DRAFT',
  schemaVersion: 1,
  createdBy: 'MOCK-MODE',
  updatedBy: 'MOCK-MODE',
  chains: [
    {
      chainId: 'WFC-WEALTH-GZ-LIWAN',
      name: 'Wealth branch assessment route',
      targetScope: {
        scopeMode: 'by_business_line',
        targetOrgIds: ['WLZQ-RBC-GZ-LIWAN'],
        businessLine: 'BL-WEALTH',
        priority: 10,
      },
      approvalPolicy: 'ANY_ONE',
      nodes: [
        {
          nodeId: 'WFN-L0-BR-COMPLIANCE',
          level: 'L0_SELF_CHECK',
          nodeType: 'ORG_ROLE',
          approverSelector: {
            selectorType: 'ORG_ROLE',
            roleCode: 'ROLE_BRANCH_COMPLIANCE_OFFICER',
            orgScopeRule: 'TARGET_ORG',
            businessLine: 'BL-WEALTH',
          },
          sortOrder: 10,
          isFinal: false,
          label: 'Branch compliance self-check',
        },
        {
          nodeId: 'WFN-L1-BR-MANAGER',
          level: 'L1_BRANCH_REVIEW',
          nodeType: 'ORG_ROLE',
          approverSelector: {
            selectorType: 'ORG_ROLE',
            roleCode: 'ROLE_BRANCH_MANAGER',
            orgScopeRule: 'TARGET_ORG',
            businessLine: 'BL-WEALTH',
          },
          sortOrder: 20,
          isFinal: false,
          label: 'Branch manager review',
        },
        {
          nodeId: 'WFN-L2-WEALTH-HQ',
          level: 'L2_LINE_REVIEW',
          nodeType: 'ORG_ROLE',
          approverSelector: {
            selectorType: 'ORG_ROLE',
            roleCode: 'ROLE_BUSINESS_LINE_MANAGER',
            orgScopeRule: 'BUSINESS_LINE_HQ',
            businessLine: 'BL-WEALTH',
          },
          sortOrder: 30,
          isFinal: false,
          label: 'Wealth business line review',
        },
        {
          nodeId: 'WFN-L3-HQ-FINAL',
          level: 'L3_HQ_FINAL',
          nodeType: 'FINAL_APPROVER',
          approverSelector: {
            selectorType: 'ROLE',
            roleCode: 'ROLE_COMPLIANCE_DIRECTOR',
            orgScopeRule: 'HQ_GLOBAL',
          },
          sortOrder: 40,
          isFinal: true,
          label: 'HQ compliance final approval',
        },
      ],
      edges: [
        {
          edgeId: 'WFE-L0-L1',
          fromNodeId: 'WFN-L0-BR-COMPLIANCE',
          toNodeId: 'WFN-L1-BR-MANAGER',
          condition: { conditionType: 'ALWAYS' },
        },
        {
          edgeId: 'WFE-L1-L2',
          fromNodeId: 'WFN-L1-BR-MANAGER',
          toNodeId: 'WFN-L2-WEALTH-HQ',
          condition: { conditionType: 'ALWAYS' },
        },
        {
          edgeId: 'WFE-L2-L3',
          fromNodeId: 'WFN-L2-WEALTH-HQ',
          toNodeId: 'WFN-L3-HQ-FINAL',
          condition: { conditionType: 'ALWAYS' },
        },
      ],
    },
  ],
});
const resolveMock = async <T>(factory: () => T): Promise<T> => {
  if(API_MODE === 'real')throw new Error('此功能尚未接入真实业务，开发模拟数据已禁用');
  await wait();
  return factory();
};

const realItems = <T>(data: T[] | { items?: T[] } | null | undefined): T[] => {
  if (Array.isArray(data)) return data;
  return data?.items ?? [];
};

const toNotificationItem = (item: mock.NotificationItem): NotificationItem => ({
  ...item,
  notificationId: item.id,
  severity: 'INFO',
  readState: item.isRead ? 'READ' : 'UNREAD',
  readAt: item.isRead ? item.time : null,
  sourceModule: item.type,
  sourceEntityType: null,
  sourceEntityId: null,
  actionTarget: null,
});

const normalizeScore = (value: unknown, fallback = 0): number => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
};

const normalizeNullableNumber = (value: unknown): number | null => {
  if (value == null || value === '') return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
};

const normalizeNullablePercent = (value: unknown): number | null => {
  const numberValue = normalizeNullableNumber(value);
  if (numberValue == null) return null;
  return Math.round(numberValue * (numberValue <= 1 ? 100 : 1));
};

const orgNameFromSnapshot = (snapshot: any, fallback = '本机构') =>
  snapshot?.orgName ?? snapshot?.name ?? snapshot?.organizationName ?? fallback;

const INDICATOR_CATEGORY_LABELS: Record<string, string> = {
  'AICAT-P1-FOUNDATION-GOVERNANCE': '治理与制度',
  'AICAT-P1-FOUNDATION-OPERATIONS': '经营与操作',
  'AICAT-P1-FOUNDATION-BRANCH-COMPLIANCE': '分支合规',
};

const toIndicatorVersion = (item: any): IndicatorVersion | undefined => {
  if (!item) return undefined;
  return {
    versionId: item.versionId ?? '',
    indicatorId: item.indicatorId ?? '',
    versionNo: normalizeScore(item.versionNo, 1),
    status: item.status ?? 'DRAFT',
    weightDefault: normalizeScore(item.weightDefault),
    maxScore: normalizeScore(item.maxScore, 100),
    scoringValidationStatus: item.scoringValidationStatus ?? 'NOT_VALIDATED',
    validationErrors: item.validationErrors ?? [],
    publishedByRef: item.publishedByRef ?? null,
    publishedAtRef: item.publishedAtRef ?? null,
    archivedReason: item.archivedReason ?? null,
    coreSnapshot: item.coreSnapshot ?? {},
    variables: (item.variables ?? []).map((variable: any) => ({
      variableId: variable.variableId,
      variableCode: variable.variableCode ?? '',
      variableName: variable.variableName ?? '',
      valueType: variable.valueType ?? 'NUMBER',
      required: variable.required !== false,
    })),
    scoringRule: item.scoringRule
      ? {
          scoringRuleId: item.scoringRule.scoringRuleId,
          ruleType: item.scoringRule.ruleType ?? 'FORMULA',
          effect: item.scoringRule.effect ?? 'DIRECT_SCORE',
          expression: item.scoringRule.expression ?? null,
          bands: item.scoringRule.bands ?? [],
          rubrics: item.scoringRule.rubrics ?? [],
          requireContinuousBands: item.scoringRule.requireContinuousBands,
          validationStatus: item.scoringRule.validationStatus,
          validationErrors: item.scoringRule.validationErrors ?? [],
        }
      : null,
    evidenceTemplates: (item.evidenceTemplates ?? []).map((template: any) => ({
      evidenceTemplateId: template.evidenceTemplateId,
      templateName: template.templateName ?? '',
      required: template.required !== false,
      acceptedFileTags: template.acceptedFileTags ?? [],
      description: template.description ?? '',
    })),
  };
};

const toIndicator = (item: any): Indicator => {
  const syntheticVersion = (item.latestVersionId ?? item.activeVersionId)
    ? toIndicatorVersion({
        versionId: item.latestVersionId ?? item.activeVersionId,
        indicatorId: item.indicatorId ?? item.id,
        versionNo: item.latestVersionNo ?? 1,
        status: item.latestStatus ?? item.status ?? 'PUBLISHED',
        weightDefault: item.weightDefault ?? 0,
        maxScore: item.maxScore ?? 100,
        scoringValidationStatus: item.scoringValidationStatus ?? 'NOT_VALIDATED',
        variables: [],
        evidenceTemplates: [],
      })
    : undefined;
  const version =
    toIndicatorVersion(item.version) ??
    toIndicatorVersion(item.displayVersion) ??
    toIndicatorVersion(item.latestVersion) ??
    syntheticVersion;
  const latestVersion = toIndicatorVersion(item.latestVersion) ?? syntheticVersion;
  const displayVersion = toIndicatorVersion(item.displayVersion) ?? version ?? syntheticVersion;
  const versions = (item.versions ?? [])
    .map(toIndicatorVersion)
    .filter((candidate): candidate is IndicatorVersion => Boolean(candidate))
    .sort((a, b) => b.versionNo - a.versionNo);
  const categoryId = item.categoryId ?? item.category;
  const categoryName = item.categoryName ?? INDICATOR_CATEGORY_LABELS[categoryId] ?? categoryId ?? 'GENERAL';
  const scoringRule = displayVersion?.scoringRule;
  const scoringRules = (scoringRule?.bands ?? []).map((band: any, index: number) => ({
    id: `${item.indicatorId ?? item.id}-RULE-${index + 1}`,
    minVal: normalizeScore(band.minValue),
    maxVal: band.maxValue == null ? 999 : normalizeScore(band.maxValue),
    scoreEffect: 'DIRECT' as const,
    points: normalizeScore(band.score),
    description: `${band.minValue ?? '-∞'} - ${band.maxValue ?? '+∞'}`,
  }));
  return {
    id: item.indicatorId ?? item.id,
    code: item.indicatorCode ?? item.code ?? item.indicatorId ?? '',
    name: item.indicatorName ?? item.name ?? '',
    category: categoryName,
    categoryId,
    categoryCode: item.categoryCode,
    categoryName,
    businessLine: item.businessLine,
    dataType: item.valueType === 'BOOLEAN' ? 'BOOLEAN' : 'NUMBER',
    valueType: item.valueType,
    inputMode: item.inputMode,
    dataSourceMode: item.dataSourceMode,
    description: item.description,
    defaultWeight: normalizeScore(displayVersion?.weightDefault ?? item.weightDefault),
    scoringRules,
    activeVersionId: item.activeVersionId ?? null,
    latestVersionId: item.latestVersionId,
    latestVersionNo: normalizeScore(item.latestVersionNo ?? latestVersion?.versionNo ?? displayVersion?.versionNo, 1),
    latestStatus: item.latestStatus,
    status: item.status,
    scoringValidationStatus: item.scoringValidationStatus ?? displayVersion?.scoringValidationStatus,
    schemeLinkCount: item.schemeLinkCount ?? null,
    version,
    latestVersion,
    displayVersion,
    versions,
  };
};

const toScheme = (item: any): AssessmentScheme => ({
  id: item.schemeId ?? item.id,
  title: item.schemeName ?? item.title ?? '',
  period: item.frequency === 'ANNUAL' ? '2026_ANNUAL' : '2026_Q1',
  schemeCode: item.schemeCode,
  year: item.year,
  frequency: item.frequency,
  totalWeight: normalizeScore(item.totalWeight),
  itemCount: normalizeScore(item.itemCount ?? item.items?.length),
  targetGroupCount: normalizeScore(item.targetGroupCount ?? item.targetGroups?.length),
  targetCount: normalizeScore(item.targetCount ?? item.targetGroupCount ?? item.targetGroups?.length),
  targetScopeLabel: item.targetScopeLabel,
  targetRuleLabel: item.targetRuleLabel,
  scopeSnapshot: item.scopeSnapshot ?? [],
  targetResolutionFindings: item.targetResolutionFindings ?? [],
  businessLineSummary: item.businessLineSummary,
  targetGroups: (item.targetGroups ?? []).flatMap((group: any) =>
    (group.members ?? []).map((member: any) => orgNameFromSnapshot(member.orgSnapshot, member.orgId))
  ),
  targetOrgIds: (item.targetGroups ?? []).flatMap((group: any) =>
    (group.members ?? []).map((member: any) => member.orgId).filter(Boolean)
  ),
  items: (item.items ?? []).map((schemeItem: any) => ({
    indicatorId: schemeItem.indicatorId,
    actualWeight: normalizeScore(schemeItem.weight),
  })),
  status: item.status === 'ACTIVE' ? 'ACTIVE' : item.status === 'ARCHIVED' ? 'ARCHIVED' : 'DRAFT',
  updatedAt: item.updatedAt ?? item.publishedAtRef ?? item.createdAt ?? '',
  optimisticVersion: item.optimisticVersion,
  publishedAtRef: item.publishedAtRef,
  sourceTrace: item.sourceTrace,
  sourceTraceSummary: item.sourceTraceSummary,
  workflowSummary: item.workflowSummary,
  scheduleSummary: item.scheduleSummary,
  readinessSummary: item.readinessSummary,
  publishSummary: item.publishSummary,
  commandAuditSummary: item.commandAuditSummary,
  nextRunAt: item.nextRunAt,
  lastRunAt: item.lastRunAt,
  commandAvailability: item.commandAvailability,
});

const toReportingTask = (item: any): ReportingTask => ({
  id: item.reportingTaskId ?? item.id,
  category: item.schemeSnapshot?.schemeName ?? item.cycleId ?? '考核填报',
  indicatorName: item.schemeSnapshot?.schemeName ?? item.reportingTaskId ?? '考核填报任务',
  description: `${orgNameFromSnapshot(item.targetOrgSnapshot, item.targetOrgId)} · ${item.status}`,
  isRequired: true,
  reportedValue: item.responseItemCount ? `${item.responseItemCount} 项` : undefined,
  evidenceList: [],
  status: item.status === 'SUBMITTED' ? 'SUBMITTED' : 'PENDING',
});

const toFormIndicator = (item: any): mock.FormIndicator => {
  const snapshot = item.indicatorSnapshot ?? {};
  return {
    id: item.responseItemId ?? item.indicatorId,
    indicatorId: item.indicatorId,
    title: snapshot.indicatorName ?? item.indicatorId ?? '填报指标',
    description: snapshot.description ?? '',
    type: snapshot.dataType === 'QUALITATIVE' ? 'QUALITATIVE' : 'QUANTITATIVE',
    unit: snapshot.valueType === 'PERCENTAGE' ? '%' : undefined,
    value: item.value == null
      ? ''
      : typeof item.value === 'object'
        ? JSON.stringify(item.value)
        : String(item.value),
    files: (item.evidence ?? []).map((evidence: any) => ({
      id: evidence.fileId,
      name: evidence.file?.fileName ?? evidence.fileId,
      fromLedger: Boolean(item.sourceLedgerEntryId),
    })),
    status: item.validationStatus === 'MISSING_REQUIRED_EVIDENCE' ? 'REJECTED' : 'PENDING',
    hqComment: item.validationStatus === 'MISSING_REQUIRED_EVIDENCE' ? '缺少必需佐证材料' : undefined,
  };
};

const toReviewTask = (item: any): ReviewTask => {
  const responseItem = item.responseItem ?? {};
  const snapshot = responseItem.indicatorSnapshot ?? {};
  return {
    indicatorId: item.indicatorId ?? item.reviewItemId,
    indicatorName: snapshot.indicatorName ?? item.indicatorId ?? '复核指标',
    branchName: orgNameFromSnapshot(item.targetOrgSnapshot ?? responseItem.targetOrgSnapshot, item.targetOrgId),
    branchSelfScore: normalizeScore(responseItem.value, normalizeScore(item.maxScore, 100)),
    systemInitialScore: normalizeScore(item.preliminaryScore, normalizeScore(item.maxScore, 100)),
    evidenceList: (responseItem.evidence ?? []).map((evidence: any) => ({
      id: evidence.fileId,
      fileName: evidence.file?.fileName ?? evidence.fileId,
      fileSize: String(evidence.file?.fileSize ?? ''),
      uploadTime: evidence.boundAtRef ?? '',
    })),
    aiInsights: item.aiInsights ?? undefined,
  };
};

const toAssessmentResult = (item: any): AssessmentResult => {
  const firstDeducted = (item.items ?? []).find((resultItem: any) => Number(resultItem.finalScore) < Number(resultItem.originalScore));
  return {
    id: item.resultId ?? item.id,
    category: item.gradeCode ?? item.status ?? '考核结果',
    indicatorName: orgNameFromSnapshot(item.targetOrgSnapshot, item.targetOrgId),
    maxScore: 100,
    systemScore: normalizeScore(item.totalScore),
    deductionReason: firstDeducted ? `${firstDeducted.indicatorId} 扣分 ${normalizeScore(firstDeducted.originalScore) - normalizeScore(firstDeducted.finalScore)} 分` : undefined,
    isDisputed: item.confirmationStatus === 'APPEALED' || (item.appeals ?? []).some((appeal: any) => ['SUBMITTED', 'UNDER_REVIEW'].includes(appeal.status)),
    evidenceList: [],
  };
};

const toBranchPortrait = (item: any, rank = item.rank): BranchPortrait => ({
  branchId: item.orgId ?? item.org?.orgId ?? item.org?.id ?? item.latestResult?.orgId,
  branchName: orgNameFromSnapshot(item.orgSnapshot ?? item.org, item.orgId ?? '机构'),
  region: '华南',
  totalScore: normalizeNullableNumber(item.totalScore ?? item.latestResult?.totalScore),
  rank: normalizeNullableNumber(rank),
  scoreTrend: (item.scoreTrend ?? []).map((point: any) => normalizeNullableNumber(point.score)),
  openIssues: normalizeNullableNumber(item.openIssues ?? item.issues?.open),
  highRiskIssues: normalizeNullableNumber(item.highRiskIssues ?? item.issues?.highRisk),
  rectificationRate: normalizeNullablePercent(item.rectificationRate ?? item.rectifications?.completionRate),
  dimensions: (item.dimensions ?? []).map((dimension: any) => ({
    name: dimension.dimensionName ?? dimension.name ?? dimension.dimensionId,
    score: normalizeNullableNumber(dimension.actualScore ?? dimension.score),
    weight: normalizeNullableNumber(dimension.fullScore ?? dimension.weight),
    issueCount: normalizeNullableNumber(dimension.issueCount),
  })),
  riskLevel: item.riskLevel === 'HIGH' ? 'CRITICAL' : item.riskLevel === 'MEDIUM' ? 'WARNING' : 'SAFE',
});

const toGlobalMetrics = (governance: any, overview?: any): GlobalMetrics => ({
  avgComplianceScore: normalizeNullableNumber(governance?.assessment?.averageScore ?? overview?.summary?.averageScore),
  totalActiveIssues: normalizeNullableNumber(governance?.issues?.open),
  overallRectificationRate: normalizeNullablePercent(governance?.rectifications?.completionRate),
  monthlyTrend: (overview?.branchRankings ?? []).slice(0, 6).map((item: any, index: number) => ({
    month: `P${index + 1}`,
    score: normalizeNullableNumber(item.totalScore),
    issueCount: normalizeNullableNumber(item.openIssues),
  })),
  generatedAtRef: governance?.generatedAtRef ?? overview?.generatedAtRef,
});

const mapOrgType = (item: any): mock.OrgNode['type'] => {
  const type = item?.frontendOrgType ?? item?.orgLevel ?? item?.type;
  if (type === 'root' || type === 'GROUP' || type === 'COMPANY') return 'root';
  if (type === 'sub-branch' || type === 'BRANCH_OFFICE') return 'sub-branch';
  if (type === 'branch' || type === 'BRANCH' || type === 'REGIONAL_BRANCH') return 'branch';
  return 'dept';
};

const toOrgNode = (item: any): mock.OrgNode => ({
  id: item.orgId ?? item.id,
  name: item.orgName ?? item.name ?? item.orgId ?? '未命名机构',
  type: mapOrgType(item),
  children: (item.children ?? []).map(toOrgNode),
});

const toPersonnel = (item: any): mock.Personnel => ({
  id: item.personnelId ?? item.id,
  userId: item.userId,
  name: item.displayName ?? item.name ?? item.personnelName ?? '',
  employeeId: item.employeeId ?? item.personnelId ?? item.userId ?? '',
  title: item.title ?? '',
  status: item.active === false ? 'inactive' : 'active',
  lastSyncDate: (item.lastSyncedAt ?? '').slice(0, 10),
  orgId: item.orgId ?? '',
});

const roleIconFor = (item: any): mock.SystemRole['iconKey'] => {
  const roleId = item.roleId ?? item.id ?? '';
  if (roleId.includes('DIRECTOR')) return 'crown';
  if (roleId.includes('ADMIN') || roleId.includes('MANAGER')) return 'building';
  if (roleId.includes('BRANCH')) return 'mapPin';
  if (roleId.includes('INSPECTION')) return 'fileText';
  if (roleId.includes('AUDIT')) return 'eye';
  return 'shield';
};

const toSystemRole = (item: any): mock.SystemRole => ({
  id: item.roleId ?? item.id,
  name: item.roleName ?? item.name ?? item.roleCode ?? '',
  iconKey: roleIconFor(item),
  description: item.description ?? item.roleLevel ?? '',
});

const toRoleAssignment = (item: any): mock.RoleAssignment => ({
  assignmentId: item.assignmentId,
  roleId: item.roleId,
  personnelId: item.personnelId,
  orgId: item.orgId,
});

const MOCK_PLAN_ATTACHMENT_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
  'text/plain',
];

const MOCK_PLAN_ATTACHMENT_ALLOWED_EXTENSIONS = [
  '.pdf',
  '.docx',
  '.xlsx',
  '.png',
  '.jpg',
  '.jpeg',
  '.txt',
];

const MOCK_PLAN_ATTACHMENT_READBACK_FIELDS = [
  'attachmentType',
  'attachmentKey',
  'attachmentLabel',
  'required',
  'bindingTargetType',
  'businessStage',
  'fileId',
  'fileName',
  'contentType',
  'fileSize',
  'scanStatus',
  'uploadedBy',
  'uploadedAt',
  'boundBy',
  'boundAt',
];

const mockPlanAttachmentUiMeta = (attachmentKey: string) => ({
  attachmentKey,
  required: false,
  bindingTargetType: 'InspectionPlan',
  businessStage: 'PLAN_CREATE',
  maintenance: 'draft_or_approval_editable',
  allowedMimeTypes: MOCK_PLAN_ATTACHMENT_ALLOWED_MIME_TYPES,
  allowedExtensions: MOCK_PLAN_ATTACHMENT_ALLOWED_EXTENSIONS,
  maxFileSizeBytes: 100 * 1024 * 1024,
  scanStatus: 'SCAN_DEFERRED',
  uploadRole: 'scoped_file_uploader',
  bindingRole: 'HqInspectionManageDep',
  readbackFields: MOCK_PLAN_ATTACHMENT_READBACK_FIELDS,
});

let mockDictionaryAdminItems: DictionaryAdminItem[] = [
  {
    dictId: 'DICT-INSPECTION-PLAN-TYPE-ROUTINE',
    parentId: null,
    dictType: 'inspection_plan_type',
    dictCode: 'ROUTINE_INSPECTION',
    label: '例行检查',
    labelEn: null,
    sortOrder: 10,
    active: true,
    isSystem: true,
    editPolicy: 'SEEDED_LOCKED',
    description: 'SIT mock boundary sample',
    uiMeta: { badgeTone: 'blue', calendarColor: '#2563eb' },
    source: 'mock',
    version: 1,
    isDeleted: false,
  },
  {
    dictId: 'DICT-INSPECTION-PLAN-TYPE-SPECIAL',
    parentId: null,
    dictType: 'inspection_plan_type',
    dictCode: 'SPECIAL_INSPECTION',
    label: '专项检查',
    labelEn: null,
    sortOrder: 20,
    active: true,
    isSystem: true,
    editPolicy: 'SEEDED_LOCKED',
    description: 'SIT mock boundary sample',
    uiMeta: { badgeTone: 'purple', calendarColor: '#7c3aed' },
    source: 'mock',
    version: 1,
    isDeleted: false,
  },
  {
    dictId: 'DICT-INSPECTION-PLAN-TYPE-DEPARTURE-AUDIT',
    parentId: null,
    dictType: 'inspection_plan_type',
    dictCode: 'DEPARTURE_AUDIT',
    label: '离任审计',
    labelEn: null,
    sortOrder: 30,
    active: true,
    isSystem: true,
    editPolicy: 'SEEDED_LOCKED',
    description: 'SIT mock boundary sample',
    uiMeta: { badgeTone: 'orange', calendarColor: '#ea580c' },
    source: 'mock',
    version: 1,
    isDeleted: false,
  },
  {
    dictId: 'DICT-INSPECTION-PLAN-FREQUENCY-ANNUAL',
    parentId: null,
    dictType: 'inspection_plan_frequency',
    dictCode: 'YEARLY',
    label: '年度',
    labelEn: null,
    sortOrder: 10,
    active: true,
    isSystem: true,
    editPolicy: 'SEEDED_LOCKED',
    description: 'SIT mock boundary sample',
    uiMeta: {},
    source: 'mock',
    version: 1,
    isDeleted: false,
  },
  {
    dictId: 'DICT-INSPECTION-PLAN-FREQUENCY-HALF-YEAR',
    parentId: null,
    dictType: 'inspection_plan_frequency',
    dictCode: 'HALF_YEARLY',
    label: '半年度',
    labelEn: null,
    sortOrder: 20,
    active: true,
    isSystem: true,
    editPolicy: 'SEEDED_LOCKED',
    description: 'SIT mock boundary sample',
    uiMeta: {},
    source: 'mock',
    version: 1,
    isDeleted: false,
  },
  {
    dictId: 'DICT-INSPECTION-PLAN-FREQUENCY-QUARTER',
    parentId: null,
    dictType: 'inspection_plan_frequency',
    dictCode: 'QUARTERLY',
    label: '季度',
    labelEn: null,
    sortOrder: 30,
    active: true,
    isSystem: true,
    editPolicy: 'SEEDED_LOCKED',
    description: 'SIT mock boundary sample',
    uiMeta: {},
    source: 'mock',
    version: 1,
    isDeleted: false,
  },
  {
    dictId: 'DICT-INSPECTION-PLAN-FREQUENCY-TEMPORARY',
    parentId: null,
    dictType: 'inspection_plan_frequency',
    dictCode: 'AD_HOC',
    label: '临时',
    labelEn: null,
    sortOrder: 40,
    active: true,
    isSystem: true,
    editPolicy: 'SEEDED_LOCKED',
    description: 'SIT mock boundary sample',
    uiMeta: {},
    source: 'mock',
    version: 1,
    isDeleted: false,
  },
  {
    dictId: 'DICT-INSPECTION-CONFIDENTIALITY-NORMAL',
    parentId: null,
    dictType: 'inspection_confidentiality_level',
    dictCode: 'NORMAL',
    label: '普通',
    labelEn: null,
    sortOrder: 10,
    active: true,
    isSystem: true,
    editPolicy: 'SEEDED_LOCKED',
    description: 'SIT mock boundary sample',
    uiMeta: { default: true },
    source: 'mock',
    version: 1,
    isDeleted: false,
  },
  {
    dictId: 'DICT-INSPECTION-CONFIDENTIALITY-SECRET',
    parentId: null,
    dictType: 'inspection_confidentiality_level',
    dictCode: 'SECRET',
    label: '秘密',
    labelEn: null,
    sortOrder: 20,
    active: true,
    isSystem: true,
    editPolicy: 'SEEDED_LOCKED',
    description: 'SIT mock boundary sample',
    uiMeta: {},
    source: 'mock',
    version: 1,
    isDeleted: false,
  },
  {
    dictId: 'DICT-INSPECTION-CONFIDENTIALITY-CONFIDENTIAL',
    parentId: null,
    dictType: 'inspection_confidentiality_level',
    dictCode: 'CONFIDENTIAL',
    label: '机密',
    labelEn: null,
    sortOrder: 30,
    active: true,
    isSystem: true,
    editPolicy: 'SEEDED_LOCKED',
    description: 'SIT mock boundary sample',
    uiMeta: {},
    source: 'mock',
    version: 1,
    isDeleted: false,
  },
  {
    dictId: 'DICT-INSPECTION-PLAN-ATTACHMENT-NOTICE',
    parentId: null,
    dictType: 'inspection_plan_attachment_type',
    dictCode: 'INSPECTION_NOTICE',
    label: '检查通知书',
    labelEn: null,
    sortOrder: 10,
    active: true,
    isSystem: true,
    editPolicy: 'SEEDED_LOCKED',
    description: 'SIT mock boundary sample',
    uiMeta: mockPlanAttachmentUiMeta('notice'),
    source: 'mock',
    version: 1,
    isDeleted: false,
  },
  {
    dictId: 'DICT-INSPECTION-PLAN-ATTACHMENT-SCHEME',
    parentId: null,
    dictType: 'inspection_plan_attachment_type',
    dictCode: 'ONSITE_INSPECTION_SCHEME',
    label: '现场检查方案',
    labelEn: null,
    sortOrder: 20,
    active: true,
    isSystem: true,
    editPolicy: 'SEEDED_LOCKED',
    description: 'SIT mock boundary sample',
    uiMeta: mockPlanAttachmentUiMeta('scheme'),
    source: 'mock',
    version: 1,
    isDeleted: false,
  },
  {
    dictId: 'DICT-INSPECTION-PLAN-ATTACHMENT-WORKING-PAPER',
    parentId: null,
    dictType: 'inspection_plan_attachment_type',
    dictCode: 'WORKING_PAPER_TEMPLATE',
    label: '底稿模板',
    labelEn: null,
    sortOrder: 30,
    active: true,
    isSystem: true,
    editPolicy: 'SEEDED_LOCKED',
    description: 'SIT mock boundary sample',
    uiMeta: mockPlanAttachmentUiMeta('workingPaperTemplate'),
    source: 'mock',
    version: 1,
    isDeleted: false,
  },
  {
    dictId: 'DICT-INSPECTION-PLAN-ATTACHMENT-OTHER',
    parentId: null,
    dictType: 'inspection_plan_attachment_type',
    dictCode: 'OTHER',
    label: '其他',
    labelEn: null,
    sortOrder: 40,
    active: true,
    isSystem: true,
    editPolicy: 'SEEDED_LOCKED',
    description: 'SIT mock boundary sample',
    uiMeta: mockPlanAttachmentUiMeta('other'),
    source: 'mock',
    version: 1,
    isDeleted: false,
  },
  {
    dictId: 'DICT-INSPECTION-MATERIAL-TYPE-NOTICE',
    parentId: null,
    dictType: 'inspection_material_type',
    dictCode: 'NOTICE',
    label: '通知材料',
    labelEn: 'Notice',
    sortOrder: 10,
    active: true,
    isSystem: false,
    editPolicy: 'ADMIN_EDITABLE',
    description: 'SIT mock boundary sample',
    uiMeta: { badgeTone: 'sky' },
    source: 'mock',
    version: 1,
    isDeleted: false,
  },
];

const cloneDictionaryItem = (item: DictionaryAdminItem): DictionaryAdminItem => ({
  ...item,
  uiMeta: JSON.parse(JSON.stringify(item.uiMeta ?? {})),
});

const mockDictionaryTypes = (): DictionaryAdminTypeListResponse => {
  const activeRows = mockDictionaryAdminItems.filter(item => !item.isDeleted);
  const dictTypes = Array.from(new Set(activeRows.map(item => item.dictType))).sort();
  return {
    schemaVersion: 1,
    source: 'mock',
    items: dictTypes.map(dictType => {
      const typed = activeRows.filter(item => item.dictType === dictType);
      const activeCount = typed.filter(item => item.active).length;
      return {
        dictType,
        typeLabel: dictType,
        itemCount: typed.length,
        activeCount,
        inactiveCount: typed.length - activeCount,
      };
    }),
  };
};

const mockDictionaryItemPage = (
  params: DictionaryAdminItemListParams = {},
): DictionaryAdminItemListResponse => {
  const normalizedKeyword = params.keyword?.trim().toLowerCase();
  let items = params.includeDeleted
    ? [...mockDictionaryAdminItems]
    : mockDictionaryAdminItems.filter(item => !item.isDeleted);

  if (params.dictType) {
    items = items.filter(item => item.dictType === params.dictType);
  }
  if (params.active !== undefined) {
    items = items.filter(item => item.active === params.active);
  }
  if (normalizedKeyword) {
    items = items.filter(item =>
      item.dictCode.toLowerCase().includes(normalizedKeyword)
      || item.label.toLowerCase().includes(normalizedKeyword)
      || (item.labelEn ?? '').toLowerCase().includes(normalizedKeyword)
      || (item.description ?? '').toLowerCase().includes(normalizedKeyword)
    );
  }

  items.sort((a, b) => a.dictType.localeCompare(b.dictType) || a.sortOrder - b.sortOrder || a.dictCode.localeCompare(b.dictCode));
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 20;
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize).map(cloneDictionaryItem),
    page,
    pageSize,
    total: items.length,
  };
};

const mockConfigDictionaries = (types?: string[]): ConfigDictionariesResponse => {
  const requestedTypes = types?.length ? types : Array.from(new Set(mockDictionaryAdminItems.map(item => item.dictType))).sort();
  const dictionaries = Object.fromEntries(requestedTypes.map(dictType => [
    dictType,
    mockDictionaryAdminItems
      .filter(item => item.dictType === dictType && item.active && !item.isDeleted)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.dictCode.localeCompare(b.dictCode))
      .map<ConfigDictionaryItem>(item => ({
        dictId: item.dictId,
        dictType: item.dictType,
        dictCode: item.dictCode,
        dictLabel: item.label,
        dictLabelEn: item.labelEn,
        parentId: item.parentId,
        sortOrder: item.sortOrder,
        isActive: item.active,
        isSystem: item.isSystem,
        editPolicy: item.editPolicy,
        description: item.description,
        uiMeta: JSON.parse(JSON.stringify(item.uiMeta ?? {})),
        source: item.source,
        version: item.version,
      })),
  ]));
  return { schemaVersion: 1, source: 'mock', dictionaries };
};

export const authApi = {
  async login(username: string, password: string): Promise<AuthUser> {
    if (isRealBackedP0) {
      const session = await realAuthApi.login(username, password);
      return session.user;
    }
    warnMockBoundary('auth.login', 'mock API mode 下登录使用前端演示用户');
    await wait();

    const normalizedUsername = username.trim().toLowerCase();
    const matchedUser = mock.mockUsers.find(user => {
      const names = [user.username, ...(user.aliases ?? [])].map(name => name.toLowerCase());
      return names.includes(normalizedUsername);
    });

    if (matchedUser) {
      return toAuthUser(matchedUser);
    }

    const demoUser = toAuthUser(mock.mockUsers[0]);

    if (!username.trim()) {
      return demoUser;
    }

    return {
      ...demoUser,
      id: 'user-demo-custom',
      username: normalizedUsername,
      displayName: username.trim(),
      title: '营业部演示用户'
    };
  }
};

export const userApi = {
  list(): Promise<AuthUser[]> {
    return resolveMock(() => mock.mockUsers.map(toAuthUser));
  },
};

export const dashboardApi = {
  async getBranchPortraits(): Promise<BranchPortrait[]> {
    if (isRealBackedP1) {
      const governance = await realDashboardApi.getGovernance();
      return (governance?.branchRiskMatrix ?? []).map((item: any, index: number) =>
        toBranchPortrait(item, index + 1)
      );
    }
    warnMockBoundary('dashboard.branchPortraits', 'P1/P2 画像驾驶舱尚未进入 P0 后端闭环');
    return resolveMock(() => cloneList(mock.mockBranchPortraits));
  },
  async getGlobalMetrics(): Promise<GlobalMetrics> {
    if (isRealBackedP1) {
      const [governance, overview] = await Promise.all([
        realDashboardApi.getGovernance(),
        realDashboardApi.getAssessmentOverview().catch(() => null),
      ]);
      return toGlobalMetrics(governance, overview);
    }
    warnMockBoundary('dashboard.globalMetrics', 'P1/P2 全局驾驶舱指标仍使用前端事实样例');
    return resolveMock(() => JSON.parse(JSON.stringify(mock.globalMetrics)));
  },
  async getCurrentBranchProfile(): Promise<LocalBranchProfile> {
    if (isRealBackedP1) {
      const currentUser = getStoredAuthUser();
      const orgId = currentUser?.orgId ?? currentUser?.orgScopeIds?.[0] ?? '';
      const portrait = await realDashboardApi.getBranchPortrait(orgId);
      return {
        branchId: portrait.org?.orgId ?? orgId,
        branchName: orgNameFromSnapshot(portrait.org, orgId),
        generatedAtRef: portrait.generatedAtRef,
        currentScore: normalizeNullableNumber(portrait.latestResult?.totalScore),
        rank: normalizeNullableNumber(portrait.rank),
        totalBranches: normalizeNullableNumber(portrait.totalBranches),
        scoreTrend: (portrait.scoreTrend ?? []).map((point: any) => ({
          period: point.cycleId,
          score: normalizeNullableNumber(point.score),
          companyAverage: null,
        })),
        radarData: (portrait.dimensions ?? []).map((dimension: any) => ({
          dimensionName: dimension.dimensionName ?? dimension.dimensionId,
          fullScore: normalizeNullableNumber(dimension.fullScore),
          actualScore: normalizeNullableNumber(dimension.actualScore),
        })),
        urgency: {
          daysToNextSubmission: null,
          overdueIssuesCount: normalizeNullableNumber(portrait.issues?.open),
          highRiskIssuesCount: normalizeNullableNumber(portrait.issues?.highRisk),
          expiringTasksCount: normalizeNullableNumber(portrait.rectifications?.open),
        },
      };
    }
    warnMockBoundary('dashboard.currentBranchProfile', 'P1/P2 属地画像仍使用前端事实样例');
    return resolveMock(() => JSON.parse(JSON.stringify(mock.mockCurrentBranchProfile)));
  },
  async getGlobalMonitorData(): Promise<any> {
    if (isRealBackedP0) {
      const summary = await realInspectionApi.getExecutionSummary();
      const cards = summary?.cards ?? {};
      const flightBoard = summary?.flightBoard ?? [];
      return {
        stats: {
          activeProjects: cards.planCount ?? 0,
          coveredBranches: flightBoard.reduce((count: number, item: any) => count + (item.targetOrgIds?.length ?? 0), 0),
          totalDefects: 0,
          highRisk: 0,
          mediumRisk: 0,
          lowRisk: 0,
          todayAlerts: cards.overdueRequirementCount ?? 0,
        },
        domainRisks: [
          { name: '材料收集', value: cards.requirementCount ?? 0, color: '#4f46e5' },
          { name: '待补充', value: cards.pendingRequirementCount ?? 0, color: '#f59e0b' },
          { name: '已提交', value: cards.submittedRequirementCount ?? 0, color: '#10b981' },
        ],
        branchRisk: flightBoard.map((item: any) => ({
          name: item.title,
          defects: item.pendingRequirementCount ?? 0,
        })),
        liveStream: flightBoard.map((item: any) => ({
          id: item.inspectionPlanId,
          project: item.title,
          branch: (item.targetOrgIds ?? []).join(' / ') || '未指定',
          issue: `材料提交 ${item.submittedRequirementCount ?? 0} 项`,
          risk: item.phase ?? item.status,
          riskColor: 'text-indigo-300',
          borderColor: 'border-indigo-400',
          time: '实时',
        })),
        projects: flightBoard.map((item: any) => ({
          id: item.inspectionPlanId,
          name: item.title,
          period: item.status,
          progress: item.phaseProgress ?? 0,
          current: item.submittedRequirementCount ?? 0,
          total: item.targetOrgIds?.length ?? 0,
          defects: 0,
          health: item.phaseProgress >= 50 ? 'normal' : 'warning',
        })),
      };
    }
    warnMockBoundary('inspection.executionMonitor', 'mock API mode 下展示前端样例监控数据');
    return resolveMock(() => ({
      stats: mock.mockGlobalStatsData,
      domainRisks: mock.mockDomainRisksData,
      branchRisk: mock.mockBranchRiskData,
      liveStream: mock.mockLiveRiskStreamData,
      projects: mock.mockFlightBoardProjects
    }));
  }
};

export const assessmentApi = {
  async getReportingTasks(): Promise<ReportingTask[]> {
    if (isRealBackedP1) {
      const data = await realAssessmentApi.getReportingTasks({ pageSize: 100 });
      return realItems<any>(data).map(toReportingTask);
    }
    warnMockBoundary('assessment.reportingTasks', 'mock/hybrid API mode 下考核填报任务来自前端样例');
    return resolveMock(() => cloneList(mock.mockReportingTasks));
  },
  async getAssessmentResults(): Promise<AssessmentResult[]> {
    if (isRealBackedP1) {
      const data = await realAssessmentApi.getResults({ pageSize: 100 });
      return realItems<any>(data).map(toAssessmentResult);
    }
    warnMockBoundary('assessment.results', 'mock/hybrid API mode 下考核结果来自前端样例');
    return resolveMock(() => cloneList(mock.mockAssessmentResults));
  },
  async getReviewTask(): Promise<ReviewTask> {
    if (isRealBackedP1) {
      const page = await realAssessmentApi.getReviewTasks({ pageSize: 1 });
      const first = realItems<any>(page)[0];
      if (!first) throw new Error('No assessment review task available');
      const detail = await realAssessmentApi.getReviewTask(first.reviewTaskId);
      return toReviewTask((detail.items ?? [])[0] ?? detail);
    }
    warnMockBoundary('assessment.reviewTask', 'mock/hybrid API mode 下复核任务来自前端样例');
    return resolveMock(() => cloneObject(mock.mockReviewTask));
  },
  async getIndicators(params?: Record<string, string | number | boolean | undefined>): Promise<Indicator[]> {
    if (isRealBackedP1) {
      const data = await realAssessmentApi.getIndicators({ pageSize: 100, ...params });
      return realItems<any>(data).map(toIndicator);
    }
    warnMockBoundary('assessment.indicators', 'mock/hybrid API mode 下指标库来自前端样例');
    return resolveMock(() => cloneList(mock.mockIndicators));
  },
  async getSchemeIndicatorPool(params?: Record<string, string | number | boolean | undefined>): Promise<Indicator[]> {
    if (isRealBackedSchemeEditor) {
      const data = await realAssessmentApi.getIndicators({ pageSize: 100, ...params });
      return realItems<any>(data).map(toIndicator);
    }
    throw new Error('Scheme indicator pool requires real or hybrid API mode');
  },
  async createIndicator(payload: any): Promise<Indicator> {
    if (isRealBackedP1) return toIndicator(await realAssessmentApi.createIndicator(payload));
    throw new Error('Indicator create requires real API mode');
  },
  async updateIndicatorDraft(indicatorId: string, versionId: string, payload: any): Promise<Indicator> {
    if (isRealBackedP1) {
      return toIndicator(await realAssessmentApi.updateIndicatorDraft(indicatorId, versionId, payload));
    }
    throw new Error('Indicator draft update requires real API mode');
  },
  async validateIndicatorScoring(
    indicatorId: string,
    versionId: string,
    payload: any = {},
  ): Promise<any> {
    if (isRealBackedP1) {
      return realAssessmentApi.validateIndicatorScoring(indicatorId, versionId, payload);
    }
    throw new Error('Indicator scoring validation requires real API mode');
  },
  async publishIndicatorVersion(indicatorId: string, versionId: string): Promise<Indicator> {
    if (isRealBackedP1) {
      return toIndicator(await realAssessmentApi.publishIndicatorVersion(indicatorId, versionId));
    }
    throw new Error('Indicator publish requires real API mode');
  },
  async cloneIndicatorVersion(indicatorId: string, versionId: string): Promise<Indicator> {
    if (isRealBackedP1) {
      return toIndicator(await realAssessmentApi.cloneIndicatorVersion(indicatorId, versionId));
    }
    throw new Error('Indicator clone requires real API mode');
  },
  async archiveIndicatorVersion(indicatorId: string, versionId: string, payload: any = {}): Promise<Indicator> {
    if (isRealBackedP1) {
      return toIndicator(await realAssessmentApi.archiveIndicatorVersion(indicatorId, versionId, payload));
    }
    throw new Error('Indicator archive requires real API mode');
  },
  async getSchemes(params?: Record<string, string | number | boolean | undefined>): Promise<AssessmentScheme[]> {
    if (isRealBackedSchemeEditor) {
      const data = await realAssessmentApi.getSchemes({ pageSize: 100, ...params });
      return realItems<any>(data).map(toScheme);
    }
    throw new Error('Scheme list requires real or hybrid API mode; use mockApiSync.assessment.getDemoSchemes for explicit demos');
  },
  async getSchemeDetail(schemeId: string): Promise<any> {
    if (isRealBackedSchemeEditor) return realAssessmentApi.getScheme(schemeId);
    throw new Error('Scheme editor detail requires real or hybrid API mode');
  },
  async validateSchemeDraft(payload: any, schemeId?: string): Promise<any> {
    if (!isRealBackedSchemeEditor) {
      throw new Error('Scheme validation requires real or hybrid API mode');
    }
    if (schemeId) return realAssessmentApi.validateSchemeDraft(schemeId, payload);
    return realAssessmentApi.validateScheme(payload);
  },
  async createScheme(payload: any): Promise<any> {
    if (isRealBackedSchemeEditor) return realAssessmentApi.createScheme(payload);
    throw new Error('Scheme create requires real or hybrid API mode');
  },
  async updateSchemeDraft(schemeId: string, payload: any): Promise<any> {
    if (isRealBackedSchemeEditor) return realAssessmentApi.updateSchemeDraft(schemeId, payload);
    throw new Error('Scheme update requires real or hybrid API mode');
  },
  async publishScheme(schemeId: string, payload: any): Promise<any> {
    if (isRealBackedSchemeEditor) return realAssessmentApi.publishScheme(schemeId, payload);
    throw new Error('Scheme publish requires real or hybrid API mode');
  },
  async copyScheme(schemeId: string, payload: any): Promise<any> {
    if (isRealBackedSchemeEditor) return realAssessmentApi.copyScheme(schemeId, payload);
    throw new Error('Scheme copy requires real or hybrid API mode');
  },
  async deleteSchemeDraft(schemeId: string, payload: any): Promise<any> {
    if (isRealBackedSchemeEditor) return realAssessmentApi.deleteSchemeDraft(schemeId, payload);
    throw new Error('Scheme delete requires real or hybrid API mode');
  },
  async archiveScheme(schemeId: string, payload: any): Promise<any> {
    if (isRealBackedSchemeEditor) return realAssessmentApi.archiveScheme(schemeId, payload);
    throw new Error('Scheme archive requires real or hybrid API mode');
  },
  validateSchemeWeight(scheme: AssessmentScheme): boolean {
    return mock.validateSchemeWeight(scheme);
  },
  async getDistributionTasks(): Promise<DistributionTask[]> {
    if (isRealBackedP1) {
      const cycles = realItems<any>(await realAssessmentApi.getCycles({ pageSize: 100 }));
      return cycles.flatMap((cycle: any) =>
        (cycle.targets ?? []).map((target: any) => ({
          id: target.cycleTargetId ?? `${cycle.cycleId}-${target.orgId}`,
          schemeId: cycle.schemeId,
          branchName: orgNameFromSnapshot(target.orgSnapshot, target.orgId),
          distributeTime: cycle.dispatchedAtRef ?? cycle.createdAt ?? '',
          status: target.reportingTaskId ? 'IN_PROGRESS' : 'NOT_STARTED',
          progress: target.targetStatus === 'SUBMITTED' ? 100 : target.reportingTaskId ? 50 : 0,
          submitTime: target.submittedAtRef,
        }))
      );
    }
    warnMockBoundary('assessment.distributionTasks', 'mock/hybrid API mode 下下发任务来自前端样例');
    return resolveMock(() => cloneList(mock.mockDistributionTasks));
  },
  getSchemeMonitorStats(tasks: DistributionTask[] = mock.mockDistributionTasks): Promise<SchemeMonitorStats> {
    return resolveMock(() => mock.calculateSchemeMonitorStats(tasks));
  },
  getSchemeItems(): Promise<mock.AssessmentSchemeItem[]> {
    return resolveMock(() => cloneList(mock.mockSchemeItems));
  },
  async getFormIndicators(taskId?: string): Promise<mock.FormIndicator[]> {
    if (isRealBackedP1) {
      const reportingTaskId = taskId || realItems<any>(await realAssessmentApi.getReportingTasks({ pageSize: 1 }))[0]?.reportingTaskId;
      if (!reportingTaskId) return [];
      const detail = await realAssessmentApi.getReportingTask(reportingTaskId);
      return (detail.items ?? []).map(toFormIndicator);
    }
    warnMockBoundary('assessment.formIndicators', 'mock/hybrid API mode 下填报表单来自前端样例');
    return resolveMock(() => cloneList(mock.mockFormIndicators));
  },
  async getActiveCycles(): Promise<typeof mock.mockActiveAssessmentCycles> {
    if (isRealBackedP1) {
      const data = await realAssessmentApi.getCycles({ pageSize: 20 });
      return realItems<any>(data).map((cycle: any) => ({
        id: cycle.cycleId,
        title: cycle.cycleName ?? cycle.cycleId,
        currentStage: cycle.status ?? 'DRAFT',
        overallProgress: normalizeScore(cycle.rollup?.progress),
        deadline: cycle.periodEnd ?? '',
        stats: {
          total: normalizeScore(cycle.rollup?.targetCount ?? cycle.targets?.length),
          submitted: normalizeScore(cycle.rollup?.submittedCount),
          reviewing: normalizeScore(cycle.rollup?.reviewingCount),
          completed: normalizeScore(cycle.rollup?.completedCount),
        },
      })) as unknown as typeof mock.mockActiveAssessmentCycles;
    }
    warnMockBoundary('assessment.activeCycles', 'mock/hybrid API mode 下考核周期来自前端样例');
    return resolveMock(() => cloneList(mock.mockActiveAssessmentCycles));
  },
  getWorkflowBranchTasks(): Promise<typeof mock.mockAssessmentWorkflowBranchTasks> {
    return resolveMock(() => cloneList(mock.mockAssessmentWorkflowBranchTasks));
  },
  async getWorkflowInstances(): Promise<Record<string, mock.WorkflowInstance>> {
    if (isRealBackedP1) {
      const cycleSummaries = realItems<any>(await realAssessmentApi.getCycles({ pageSize: 100 }));
      const cycleDetails = await Promise.all(
        cycleSummaries.map((cycle: any) => realAssessmentApi.getCycle(cycle.cycleId ?? cycle.id)),
      );
      return toWorkflowInstances(cycleDetails);
    }
    warnMockBoundary('assessment.workflowInstances', 'mock/hybrid API mode 下考核运行调度来自前端样例');
    return resolveMock(() => cloneObject(mock.mockInstances));
  },
  createCycle(payload: any): Promise<any> {
    if (isRealBackedP1) return realAssessmentApi.createCycle(payload);
    warnMockBoundary('assessment.createCycle', 'mock/hybrid API mode 下仅本地模拟考核周期创建');
    return resolveMock(() => ({ cycleId: `ACYC-MOCK-${Date.now()}`, ...payload, status: 'DRAFT' }));
  },
  dispatchCycle(cycleId: string, payload: any = {}): Promise<any> {
    if (isRealBackedP1) return realAssessmentApi.dispatchCycle(cycleId, payload);
    warnMockBoundary('assessment.dispatchCycle', 'mock/hybrid API mode 下仅本地模拟考核周期下发');
    return resolveMock(() => ({ cycleId, ...payload, status: 'DISPATCHED', reportingTasks: [] }));
  },
  sendCycleReminder(cycleId: string, payload: any = {}): Promise<any> {
    if (isRealBackedP1) return realAssessmentApi.sendCycleReminder(cycleId, payload);
    warnMockBoundary('assessment.sendCycleReminder', 'mock/hybrid API mode 下仅本地模拟考核周期催办');
    return resolveMock(() => ({ cycleId, ...payload, eventType: 'REMINDER_SENT' }));
  },
  getAssessmentSchedule(scheduleId: string): Promise<AssessmentScheduleDetail> {
    if (isRealBackedP2) return realAssessmentSchedulerApi.getSchedule(scheduleId);
    warnMockBoundary('assessment.scheduleDetail', 'mock API mode 下考核调度器使用显式本地样例');
    const rule: AssessmentScheduleRule = {
      ruleId: `${scheduleId}-MOCK-RULE`,
      frequency: 'QUARTERLY',
      workingDayOffset: 5,
      fireTime: '10:00',
      timezone: 'Asia/Shanghai',
      calendarCode: 'WEEKDAY_ONLY',
    };
    return resolveMock(() => ({
      scheduleId,
      schemeId: 'ASCH-MOCK',
      templateId: 'WFT-MOCK',
      templateVersionId: 'WFT-MOCK-V001',
      snapshotHash: 'mock',
      dispatchMode: 'SCHEDULED',
      status: 'DRAFT',
      draftRule: rule,
      activeRule: null,
      targetOrgIds: ['MOCK-BRANCH'],
      targetScopeSnapshot: [],
      predictedNextFireAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      prediction: {
        nextFireAt: new Date(Date.now() + 7 * 86400000).toISOString(),
        calendarPolicy: 'WEEKDAY_ONLY',
        timezone: rule.timezone,
        workingDayOffset: rule.workingDayOffset,
        serverComputed: true,
      },
      eligibility: { status: 'PASS', guards: ['MOCK_MODE'] },
      latestExecution: null,
      version: 1,
      auditSummary: { eventCount: 0, lastEventType: null },
    }));
  },
  saveAssessmentScheduleDraft(
    scheduleId: string,
    payload: {
      frequency: string;
      workingDayOffset: number;
      fireTime: string;
      timezone: string;
      calendarCode?: string;
    },
  ): Promise<AssessmentScheduleDetail> {
    if (isRealBackedP2) return realAssessmentSchedulerApi.saveDraft(scheduleId, payload);
    warnMockBoundary('assessment.scheduleSaveDraft', 'mock API mode 下仅本地模拟调度草稿保存');
    return this.getAssessmentSchedule(scheduleId).then(schedule => ({
      ...schedule,
      draftRule: { ...schedule.draftRule, ...payload },
      predictedNextFireAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    }));
  },
  activateAssessmentSchedule(scheduleId: string): Promise<ScheduleActivationResponse> {
    if (isRealBackedP2) return realAssessmentSchedulerApi.activate(scheduleId);
    warnMockBoundary('assessment.scheduleActivate', 'mock API mode 下仅本地模拟调度激活');
    return this.getAssessmentSchedule(scheduleId).then(schedule => ({
      schedule: { ...schedule, status: 'ACTIVE', activeRule: schedule.draftRule },
      guardResult: { status: 'PASS', guard: 'MOCK_MODE' },
      routeSummary: { templateVersionId: 'WFT-MOCK-V001' },
    }));
  },
  listAssessmentScheduleExecutions(
    scheduleId: string,
    params?: { page?: number; pageSize?: number },
  ): Promise<ScheduleExecutionPage> {
    if (isRealBackedP2) return realAssessmentSchedulerApi.listExecutions(scheduleId, params);
    warnMockBoundary('assessment.scheduleExecutions', 'mock API mode 下执行记录来自显式本地样例');
    const items: ScheduleExecution[] = [
      {
        executionId: 'MOCK-SCHED-EXEC-001',
        scheduleId,
        scheduledAt: new Date(Date.now() - 86400000).toISOString(),
        status: 'SUCCEEDED',
        targetCount: 1,
        dispatchEventIds: [],
        generatedTaskCount: 1,
      },
    ];
    return resolveMock(() => ({ items, page: params?.page ?? 1, pageSize: params?.pageSize ?? 20, total: items.length }));
  },
  retryAssessmentScheduleExecution(
    executionId: string,
    payload: { reason?: string; idempotencyKey?: string },
  ): Promise<ScheduleRetryResponse> {
    if (isRealBackedP2) return realAssessmentSchedulerApi.retryExecution(executionId, payload);
    warnMockBoundary('assessment.scheduleRetry', 'mock API mode 下仅本地模拟调度重试');
    return resolveMock(() => ({
      originalExecution: {
        executionId,
        scheduleId: 'MOCK-SCHEDULE',
        scheduledAt: new Date().toISOString(),
        status: 'RETRY_REQUESTED',
        targetCount: 1,
        dispatchEventIds: [],
        generatedTaskCount: 0,
      },
      retryExecution: {
        executionId: `${executionId}-RETRY`,
        scheduleId: 'MOCK-SCHEDULE',
        scheduledAt: new Date().toISOString(),
        status: 'QUEUED',
        targetCount: 1,
        dispatchEventIds: [],
        generatedTaskCount: 0,
      },
      retryEvent: { reason: payload.reason ?? 'mock retry' },
      duplicate: false,
    }));
  },
  dispatchAssessmentScheduleNow(
    scheduleId: string,
    idempotencyKey?: string,
  ): Promise<ScheduleDispatchNowResponse> {
    if (isRealBackedP2) return realAssessmentSchedulerApi.dispatchNow(scheduleId, idempotencyKey);
    warnMockBoundary('assessment.scheduleDispatchNow', 'mock API mode 下仅本地模拟立即下发');
    return Promise.all([
      this.getAssessmentSchedule(scheduleId),
      this.listAssessmentScheduleExecutions(scheduleId),
    ]).then(([schedule, executions]) => ({
      schedule: { ...schedule, status: 'ACTIVE' as const },
      execution: {
        executionId: `${scheduleId}-DISPATCH-NOW-MOCK`,
        scheduleId,
        scheduledAt: new Date().toISOString(),
        status: 'QUEUED' as const,
        targetCount: schedule.targetOrgIds.length || 1,
        dispatchEventIds: [],
        generatedTaskCount: 0,
      },
      dispatchEvent: { idempotencyKey: idempotencyKey ?? 'mock' },
      duplicate: false,
    }));
  },
  runAssessmentSimulation(payload: {
    schemeId: string;
    schemeVersionId?: string | null;
    referencePeriod: string;
    targetOrgIds?: string[];
    imputationPolicy: string;
    schemeDraftSnapshot?: Record<string, unknown>;
    requestId?: string;
  }): Promise<AssessmentSimulationDetail> {
    if (isRealBackedP2) return realAssessmentSimulationApi.run(payload);
    warnMockBoundary('assessment.simulationRun', 'mock API mode 下考核模拟使用显式本地样例');
    const score = payload.referencePeriod === '2025Q3' ? null : 86.5;
    const orgResult: AssessmentSimulationOrgResult = {
      orgId: 'MOCK-BRANCH',
      orgSnapshot: { orgId: 'MOCK-BRANCH', orgName: '显式演示机构' },
      score,
      grade: score === null ? 'EXCLUDED' : 'B',
      coverage: {
        totalItems: 1,
        scoredItems: score === null ? 0 : 1,
        missingItems: score === null ? 1 : 0,
        coverageRatio: score === null ? 0 : 1,
      },
      imputationSummary: {
        policy: payload.imputationPolicy,
        noteCount: score === null ? 1 : 0,
        silentZeroFill: false,
      },
      historicalOfficialComparison: { officialScore: null, difference: null, readOnly: true },
      simulationOnly: true,
    };
    const detail: AssessmentSimulationDetail = {
      simulationId: `ASIM-MOCK-${Date.now()}`,
      schemeId: payload.schemeId,
      schemeVersionId: payload.schemeVersionId,
      referencePeriod: payload.referencePeriod,
      status: 'SUCCEEDED',
      simulationOnly: true,
      requestedBy: 'mock-user',
      requestId: payload.requestId,
      inputSnapshotHash: 'mock-simulation-hash',
      imputationPolicy: payload.imputationPolicy,
      preflightFindings: [
        {
          code: score === null ? 'HISTORICAL_COVERAGE_MISSING' : 'SCHEME_VERSION_READY',
          severity: score === null ? 'WARNING' : 'INFO',
          message: score === null ? '显式演示缺数说明' : '显式演示方案快照可用',
          blocking: false,
        },
      ],
      resultSummary: {
        totalTargetCount: 1,
        scoredTargetCount: score === null ? 0 : 1,
        excludedTargetCount: score === null ? 1 : 0,
        missingDataCount: score === null ? 1 : 0,
        averageSimulatedScore: score,
        highestScore: score,
        lowestScore: score,
        gradeDistribution: { [orgResult.grade]: 1 },
        topSamples: score === null ? [] : [orgResult],
        bottomSamples: score === null ? [] : [orgResult],
        comparison: { officialResultReference: 'mock_read_only' },
        simulationOnly: true,
      },
      orgResults: [orgResult],
      imputationNotes: [
        {
          sourceType: 'mock_explicit_demo',
          indicatorId: 'MOCK-INDICATOR',
          orgId: 'MOCK-BRANCH',
          referencePeriod: payload.referencePeriod,
          policy: score === null ? payload.imputationPolicy : 'exact',
          reason: score === null ? '显式演示历史数据缺失' : '显式演示精确历史数据',
          effectOnScore: score === null ? 'excluded_from_denominator' : 'included',
          scoreImpact: score ?? 0,
        },
      ],
      auditMetadata: {
        createdAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        statusTransitions: ['SIMULATION_QUEUED', 'SIMULATION_RUNNING', 'SIMULATION_SUCCEEDED'],
      },
    };
    return resolveMock(() => detail);
  },
  getAssessmentSimulation(simulationId: string): Promise<AssessmentSimulationDetail> {
    if (isRealBackedP2) return realAssessmentSimulationApi.get(simulationId);
    warnMockBoundary('assessment.simulationDetail', 'mock API mode 下考核模拟详情使用显式本地样例');
    return this.runAssessmentSimulation({
      schemeId: 'ASCH-MOCK',
      referencePeriod: '2025Q4',
      imputationPolicy: 'exclude',
      requestId: simulationId,
    });
  },
  getDataSourceHealth(): Promise<DataSourceHealthSummary> {
    if (isRealBackedP2) return realDataCockpitApi.health();
    warnMockBoundary('assessment.dataSourceHealth', 'mock API mode 下数据驾驶舱使用显式沙箱样例');
    return resolveMock(mockDataSourceHealth);
  },
  listDataSyncJobs(params?: {
    timeRange?: string;
    source?: string;
    status?: string;
    keyword?: string;
    page?: number;
    pageSize?: number;
  }): Promise<DataSyncJobPage> {
    if (isRealBackedP2) return realDataCockpitApi.listJobs(params);
    warnMockBoundary('assessment.dataSyncJobs', 'mock API mode 下同步台账使用显式沙箱样例');
    return resolveMock(() => mockDataSyncJobPage(params));
  },
  getDataSyncSnapshot(jobId: string): Promise<DataSyncSnapshot> {
    if (isRealBackedP2) return realDataCockpitApi.snapshot(jobId);
    warnMockBoundary('assessment.dataSyncSnapshot', 'mock API mode 下快照为显式脱敏沙箱样例');
    const job = mockDataSyncJobs.find(item => item.jobId === jobId) ?? mockDataSyncJobs[0];
    return resolveMock(() => ({
      snapshotId: `${job.jobId}-SNAPSHOT`,
      jobId: job.jobId,
      payloadHash: 'mock-redacted-sandbox-hash',
      recordCount: job.records,
      redactionPolicy: 'STRICT',
      capturedAt: job.finishedAt ?? job.startedAt,
      sampleRows: [
        { recordRef: 'ROW-***-001', metricValue: 12, status: 'Y' },
        { recordRef: 'ROW-***-002', metricValue: 8, status: 'Y' },
      ],
      omittedFields: ['personName', 'customerId', 'nationalId', 'rawPayload'],
      fileId: null,
      sandboxOnly: true,
      evidenceLabel: 'SANDBOX_REDACTED_SAMPLE_SNAPSHOT',
      nonProductionLabel: 'explicit mock redacted sandbox sample, not a formal compliance artifact',
    }));
  },
  retryDataSyncJob(
    jobId: string,
    payload: { reason: string; requestId?: string },
  ): Promise<DataSyncCommandResponse> {
    if (isRealBackedP2) return realDataCockpitApi.retry(jobId, payload);
    warnMockBoundary('assessment.dataSyncRetry', 'mock API mode 下仅本地模拟补采命令');
    return resolveMock(() => ({
      operationId: `MOCK-RETRY-${Date.now()}`,
      jobId,
      newStatus: 'RETRY_REQUESTED',
      auditEventId: `MOCK-AUDIT-${Date.now()}`,
      idempotentReplay: false,
      sandboxOnly: true,
      evidenceLabel: 'SANDBOX_OPERATION_AUDIT_EVENT',
    }));
  },
  ignoreDataSyncAlert(
    alertId: string,
    payload: { reason: string; requestId?: string },
  ): Promise<DataSyncAlertCommandResponse> {
    if (isRealBackedP2) return realDataCockpitApi.ignoreAlert(alertId, payload);
    warnMockBoundary('assessment.dataSyncIgnoreAlert', 'mock API mode 下仅本地模拟忽略沙箱告警');
    return resolveMock(() => ({
      operationId: `MOCK-IGNORE-${Date.now()}`,
      alertId,
      jobId: 'DSJOB-TRADE-AML-MOCK',
      newStatus: 'IGNORED',
      auditEventId: `MOCK-AUDIT-${Date.now()}`,
      idempotentReplay: false,
      jobEvidenceRetained: true,
      sandboxOnly: true,
      evidenceLabel: 'SANDBOX_OPERATION_AUDIT_EVENT',
    }));
  },
  requestDataSyncOverwriteRerun(
    jobId: string,
    payload: {
      reason: string;
      riskAcknowledgement: boolean;
      approvalMarker?: string;
      requestId?: string;
    },
  ): Promise<DataSyncOverwriteResponse> {
    if (isRealBackedP2) return realDataCockpitApi.overwriteRerun(jobId, payload);
    warnMockBoundary('assessment.dataSyncOverwriteRerun', 'mock API mode 下仅本地模拟覆盖重跑申请');
    return resolveMock(() => ({
      operationId: `MOCK-RERUN-${Date.now()}`,
      rerunRequestId: `MOCK-RERUN-${Date.now()}`,
      jobId,
      newStatus: 'OVERWRITE_REQUESTED',
      rerunStatus: 'PENDING',
      auditEventId: `MOCK-AUDIT-${Date.now()}`,
      idempotentReplay: false,
      sandboxOnly: true,
      evidenceLabel: 'SANDBOX_HIGH_RISK_OPERATION_AUDIT_EVENT',
      cancellationDeferred: true,
    }));
  },
  exportDataSyncEvidence(payload: {
    sourceIds?: string[];
    status?: string[];
    timeRange?: string;
    format?: string;
    redactionPolicy?: string;
    requestId?: string;
  }): Promise<DataSyncExportResponse> {
    if (isRealBackedP2) return realDataCockpitApi.exportEvidence(payload);
    warnMockBoundary('assessment.dataSyncEvidenceExport', 'mock API mode 下仅生成沙箱证据元数据');
    return resolveMock(() => ({
      operationId: `MOCK-DSEXPORT-${Date.now()}`,
      exportId: `MOCK-DSEXPORT-${Date.now()}`,
      exportType: 'DATA_SYNC_SANDBOX_EVIDENCE',
      format: payload.format ?? 'JSON',
      filterSnapshot: {
        sourceIds: payload.sourceIds ?? [],
        status: payload.status ?? [],
        timeRange: payload.timeRange ?? '7days',
        sandboxOnly: true,
      },
      status: 'REQUESTED',
      fileId: null,
      downloadUrl: null,
      expiresAt: null,
      checksum: 'mock-redacted-metadata',
      redactionPolicy: payload.redactionPolicy ?? 'STRICT',
      auditEventId: `MOCK-DSEXPORT-AUDIT-${Date.now()}`,
      idempotentReplay: false,
      sandboxOnly: true,
      evidenceLabel: 'SANDBOX_DATA_SYNC_EVIDENCE_METADATA',
      formalArtifact: false,
      signedArtifact: false,
      nonProductionLabel: 'explicit mock sandbox evidence metadata only, not a signed compliance artifact',
    }));
  },
  getAppealEkpNodes(): Promise<typeof mock.mockAppealEkpNodes> {
    return resolveMock(() => cloneList(mock.mockAppealEkpNodes));
  },
  getTrendDataMap(): Promise<typeof mock.mockAssessmentTrendDataMap> {
    return resolveMock(cloneAssessmentTrendDataMap);
  },
  getSearchItems(): Promise<typeof mock.mockAssessmentSearchItems> {
    return resolveMock(() => cloneList(mock.mockAssessmentSearchItems));
  },
  async getLeaderboardData(): Promise<any[]> {
    if (isRealBackedP1) {
      const overview = await realDashboardApi.getAssessmentOverview();
      const rankingSource = (overview.branchRankings ?? []).length
        ? overview.branchRankings
        : (await realDashboardApi.getGovernance().catch(() => null))?.branchRiskMatrix ?? [];
      return rankingSource.map((item: any, index: number) => ({
        id: item.orgId,
        name: orgNameFromSnapshot(item.orgSnapshot, item.orgId),
        rank: normalizeNullableNumber(item.rank ?? index + 1),
        score: normalizeNullableNumber(item.totalScore),
        status: item.confirmationStatus,
        rankClass: 'bg-blue-50 text-blue-700 border-blue-100',
        scoreClass: normalizeNullableNumber(item.totalScore) == null
          ? 'text-slate-500'
          : normalizeNullableNumber(item.totalScore)! >= 75 ? 'text-emerald-600' : 'text-rose-600',
        statusClass: 'text-slate-600 border-slate-200',
        children: [],
      }));
    }
    if (API_MODE === 'hybrid') {
      warnMockBoundary('assessment.leaderboard', 'hybrid 模式不使用前端样例榜单；请切换 real 模式查看后端读模型');
      return [];
    }
    warnMockBoundary('assessment.leaderboard', 'mock API mode 下成绩榜单来自前端样例');
    return resolveMock(() => cloneList(mock.mockAssessmentLeaderboardData));
  },
  async getUnifiedReviewTasks(params?: Record<string, string | number | boolean | undefined>): Promise<UnifiedReviewTaskPage> {
    if (isRealBackedP2) return realUnifiedReviewApi.listTasks(params);
    warnMockBoundary('assessment.unifiedReviewTasks', 'mock API mode 下统一复核工作台来自前端样例');
    const items = cloneUnifiedReviewTasks().map(task => ({
      ...task,
      reviewTaskId: task.id,
      sourceReviewTaskId: task.id,
      sourceType: 'MOCK',
      cycleId: 'MOCK-CYCLE',
      cycleTargetId: 'MOCK-TARGET',
      reportingTaskId: 'MOCK-REPORTING',
      targetOrgId: 'MOCK-ORG',
      title: `${task.branch} / ${task.indicator}`,
      category: 'mock',
      currentLevelLabel: task.currentLevel,
      currentNodeLabel: task.currentLevel,
      status: 'PENDING',
      version: 1,
      workflowTemplateId: 'MOCK-WFT',
      workflowTemplateVersionId: 'MOCK-WFT-V001',
      routeChainId: 'MOCK-CHAIN',
      assignees: [],
      updatedAt: new Date().toISOString(),
    })) as unknown as UnifiedReviewTaskSummary[];
    return {
      items,
      page: 1,
      pageSize: items.length,
      total: items.length,
      summary: { todo: items.length, done: 0, cc: 0 },
    };
  },
  async getUnifiedReviewTask(reviewTaskId: string): Promise<UnifiedReviewTaskDetail> {
    if (isRealBackedP2) return realUnifiedReviewApi.getTask(reviewTaskId);
    const page = await this.getUnifiedReviewTasks();
    const summary = page.items.find(item => item.reviewTaskId === reviewTaskId || item.id === reviewTaskId) ?? page.items[0];
    return {
      ...summary,
      sourceContext: {},
      routeSnapshot: {
        templateId: summary.workflowTemplateId,
        templateVersionId: summary.workflowTemplateVersionId,
        snapshotHash: 'mock',
        routeChainId: summary.routeChainId,
        levels: [
          { level: 'L0_SELF_CHECK', nodeId: 'MOCK-L0', label: 'L0 自检', isCurrent: summary.levelCode === 'L0' },
          { level: 'L1_BRANCH_REVIEW', nodeId: 'MOCK-L1', label: 'L1 分支复核', isCurrent: summary.levelCode === 'L1' },
          { level: 'L2_LINE_REVIEW', nodeId: 'MOCK-L2', label: 'L2 条线复核', isCurrent: summary.levelCode === 'L2' },
          { level: 'L3_HQ_FINAL', nodeId: 'MOCK-L3', label: 'L3 总部终审', isCurrent: summary.levelCode === 'L3' },
        ],
      },
      currentAssignment: null,
      quickPhrases: mock.mockUnifiedReviewQuickPhrases.map((text, index) => ({
        phraseId: `MOCK-QP-${index + 1}`,
        text,
        decisionHint: 'APPROVE',
        source: 'mock_mode_sample',
      })),
      comments: [],
      auditTrail: (summary as any).history ?? [],
      actionEligibility: {
        canSaveComment: true,
        canApprove: true,
        canReturn: true,
        canReject: true,
        canBatchDecide: true,
      },
    };
  },
  saveUnifiedReviewTask(reviewTaskId: string, payload: { comment?: string; version?: number }): Promise<UnifiedReviewTaskDetail> {
    if (isRealBackedP2) return realUnifiedReviewApi.saveTask(reviewTaskId, payload);
    warnMockBoundary('assessment.saveUnifiedReviewTask', 'mock API mode 下仅本地模拟统一复核意见保存');
    return this.getUnifiedReviewTask(reviewTaskId);
  },
  decideUnifiedReviewTask(reviewTaskId: string, payload: Record<string, any>): Promise<UnifiedReviewTaskDetail> {
    if (isRealBackedP2) return realUnifiedReviewApi.decideTask(reviewTaskId, payload as any);
    warnMockBoundary('assessment.decideUnifiedReviewTask', 'mock API mode 下仅本地模拟统一复核决策');
    return this.getUnifiedReviewTask(reviewTaskId);
  },
  batchDecideUnifiedReviewTasks(payload: {
    decision: string;
    reason?: string;
    items: Array<{ reviewTaskId: string; version?: number; comment?: string; idempotencyKey?: string }>;
  }): Promise<UnifiedReviewBatchDecisionResponse> {
    if (isRealBackedP2) return realUnifiedReviewApi.batchDecision(payload);
    warnMockBoundary('assessment.batchDecideUnifiedReviewTasks', 'mock API mode 下仅本地模拟统一复核批量决策');
    return resolveMock(() => ({
      items: payload.items.map(item => ({ reviewTaskId: item.reviewTaskId, success: true, status: 'PENDING', version: item.version })),
      successCount: payload.items.length,
      failureCount: 0,
    }));
  },
  getReportingTaskDetail(reportingTaskId: string): Promise<any> {
    if (isRealBackedP1) return realAssessmentApi.getReportingTask(reportingTaskId);
    warnMockBoundary('assessment.reportingTaskDetail', 'mock/hybrid API mode 下填报详情来自前端样例');
    return resolveMock(() => ({ reportingTaskId, items: mock.mockFormIndicators.map(toFormIndicator) }));
  },
  saveReportingDraft(reportingTaskId: string, items: Array<{ responseItemId?: string; indicatorId?: string; value?: any; comment?: string; fileIds?: string[] }>): Promise<any> {
    if (isRealBackedP1) return realAssessmentApi.saveReportingDraft(reportingTaskId, { items });
    warnMockBoundary('assessment.saveReportingDraft', 'mock/hybrid API mode 下仅本地模拟保存填报草稿');
    return resolveMock(() => ({ reportingTaskId, items }));
  },
  submitReportingTask(reportingTaskId: string, items: Array<{ responseItemId?: string; indicatorId?: string; value?: any; comment?: string; fileIds?: string[] }>): Promise<any> {
    if (isRealBackedP1) return realAssessmentApi.submitReportingTask(reportingTaskId, { items });
    warnMockBoundary('assessment.submitReportingTask', 'mock/hybrid API mode 下仅本地模拟提交填报');
    return resolveMock(() => ({ reportingTaskId, status: 'SUBMITTED', items }));
  },
  getDailyLedger(params?: Record<string, string | number | boolean | undefined>): Promise<any> {
    if (isRealBackedP1) return realAssessmentApi.getDailyLedger(params);
    warnMockBoundary('assessment.dailyLedger', 'mock/hybrid API mode 下日常台账来自前端样例');
    return resolveMock(() => ({ items: [], total: 0, page: 1, pageSize: 20 }));
  },
  createDailyLedger(payload: any): Promise<any> {
    if (isRealBackedP1) return realAssessmentApi.createDailyLedger(payload);
    warnMockBoundary('assessment.createDailyLedger', 'mock/hybrid API mode 下仅本地模拟新增日常台账');
    return resolveMock(() => ({
      ledgerEntryId: `LEDGER-MOCK-${Date.now()}`,
      ...payload,
      attachments: (payload.fileIds ?? []).map((fileId: string) => ({ fileId })),
      auditEvents: [{ eventType: 'CREATED', actorId: 'mock-user', occurredAt: new Date().toISOString() }],
    }));
  },
  updateDailyLedger(ledgerEntryId: string, payload: any): Promise<any> {
    if (isRealBackedP1) return realAssessmentApi.updateDailyLedger(ledgerEntryId, payload);
    warnMockBoundary('assessment.updateDailyLedger', 'mock/hybrid API mode 下仅本地模拟更新日常台账');
    return resolveMock(() => ({
      ledgerEntryId,
      ...payload,
      attachments: (payload.fileIds ?? []).map((fileId: string) => ({ fileId })),
      auditEvents: [{ eventType: 'UPDATED', actorId: 'mock-user', occurredAt: new Date().toISOString() }],
    }));
  },
  deleteDailyLedger(ledgerEntryId: string): Promise<any> {
    if (isRealBackedP1) return realAssessmentApi.deleteDailyLedger(ledgerEntryId);
    warnMockBoundary('assessment.deleteDailyLedger', 'mock/hybrid API mode 下仅本地模拟软删除日常台账');
    return resolveMock(() => ({
      ledgerEntryId,
      status: 'DELETED',
      auditEvents: [{ eventType: 'SOFT_DELETED', actorId: 'mock-user', occurredAt: new Date().toISOString() }],
    }));
  },
  getReviewTasks(params?: Record<string, string | number | boolean | undefined>): Promise<any> {
    if (isRealBackedP1) return realAssessmentApi.getReviewTasks(params);
    warnMockBoundary('assessment.reviewTasks', 'mock/hybrid API mode 下复核列表来自前端样例');
    return resolveMock(() => ({ items: mock.mockReviewTasks, total: mock.mockReviewTasks.length }));
  },
  async getReviewTasksList(): Promise<ReviewTask[]> {
    if (isRealBackedP1) {
      const data = await realAssessmentApi.getReviewTasks({ pageSize: 100 });
      const summaries = realItems<any>(data);
      if (summaries.length === 0) return [];
      // Fetch detail for the first few tasks to get item-level data
      const tasks: ReviewTask[] = [];
      for (const summary of summaries.slice(0, 10)) {
        try {
          const detail = await realAssessmentApi.getReviewTask(summary.reviewTaskId);
          const items = (detail.items ?? []) as any[];
          for (const item of items) {
            tasks.push(toReviewTask(item));
          }
        } catch {
          // Skip tasks that fail to load detail
        }
      }
      return tasks;
    }
    warnMockBoundary('assessment.reviewTasksList', 'mock/hybrid API mode 下复核列表来自前端样例');
    return resolveMock(() => cloneList(mock.mockReviewTasks));
  },
  getReviewTaskDetail(reviewTaskId: string): Promise<any> {
    if (isRealBackedP1) return realAssessmentApi.getReviewTask(reviewTaskId);
    warnMockBoundary('assessment.reviewTaskDetail', 'mock/hybrid API mode 下复核详情来自前端样例');
    return resolveMock(() => ({ reviewTaskId, items: mock.mockReviewTasks }));
  },
  startReview(reviewTaskId: string): Promise<any> {
    if (isRealBackedP1) return realAssessmentApi.startReview(reviewTaskId);
    warnMockBoundary('assessment.startReview', 'mock/hybrid API mode 下仅本地模拟启动复核');
    return resolveMock(() => ({ reviewTaskId, status: 'IN_REVIEW' }));
  },
  saveReview(reviewTaskId: string, payload: any): Promise<any> {
    if (isRealBackedP1) return realAssessmentApi.saveReview(reviewTaskId, payload);
    warnMockBoundary('assessment.saveReview', 'mock/hybrid API mode 下仅本地模拟保存复核');
    return resolveMock(() => ({ reviewTaskId, ...payload }));
  },
  decideReview(reviewTaskId: string, payload: any): Promise<any> {
    if (isRealBackedP1) return realAssessmentApi.decideReview(reviewTaskId, payload);
    warnMockBoundary('assessment.decideReview', 'mock/hybrid API mode 下仅本地模拟复核裁定');
    return resolveMock(() => ({ reviewTaskId, ...payload }));
  },
  confirmResult(resultId: string, comment = ''): Promise<any> {
    if (isRealBackedP1) return realAssessmentApi.confirmResult(resultId, comment);
    warnMockBoundary('assessment.confirmResult', 'mock/hybrid API mode 下仅本地模拟成绩确认');
    return resolveMock(() => ({ resultId, comment }));
  },
  submitScoreAppeal(resultId: string, payload: any): Promise<any> {
    if (isRealBackedP1) return realAssessmentApi.submitScoreAppeal(resultId, payload);
    warnMockBoundary('assessment.submitScoreAppeal', 'mock/hybrid API mode 下仅本地模拟成绩申诉');
    return resolveMock(() => ({ resultId, ...payload }));
  },
  decideScoreAppeal(scoreAppealId: string, payload: any): Promise<any> {
    if (isRealBackedP1) return realAssessmentApi.decideScoreAppeal(scoreAppealId, payload);
    warnMockBoundary('assessment.decideScoreAppeal', 'mock/hybrid API mode 下仅本地模拟申诉裁定');
    return resolveMock(() => ({ scoreAppealId, ...payload }));
  },
};

export interface InspectionPlanListParams {
  year?: string;
  type?: string;
  frequency?: string;
  status?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

const splitFilterCodes = (value?: string): string[] =>
  (value ?? '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);

const normalizeInspectionPlanListParams = (
  params: InspectionPlanListParams = {},
): InspectionPlanListParams => ({
  year: params.year,
  type: normalizeInspectionPlanTypeFilter(params.type),
  frequency: normalizeInspectionPlanFrequencyFilter(params.frequency),
  status: params.status?.trim() || undefined,
  keyword: params.keyword?.trim() || undefined,
  page: params.page,
  pageSize: params.pageSize,
});

const requireMockInspectionPlanTypeCode = (value?: string): InspectionPlan['type'] => {
  const code = normalizeInspectionPlanTypeCode(value) ?? DEFAULT_INSPECTION_PLAN_TYPE_CODE;
  if (!isInspectionPlanTypeCode(code)) {
    throw new Error('Inspection plan type must use an ASCII canonical code');
  }
  return code as InspectionPlan['type'];
};

const requireMockInspectionPlanFrequencyCode = (value?: string): InspectionPlan['frequency'] => {
  const code = normalizeInspectionPlanFrequencyCode(value)
    ?? DEFAULT_INSPECTION_PLAN_FREQUENCY_CODE;
  if (!isInspectionPlanFrequencyCode(code)) {
    throw new Error('Inspection plan frequency must use an ASCII canonical code');
  }
  return code as InspectionPlan['frequency'];
};

export const inspectionApi = {
  getPlans(params: InspectionPlanListParams = {}): Promise<InspectionPlanListResponse> {
    const normalizedParams = normalizeInspectionPlanListParams(params);
    if (isRealBackedP0) {
      const realParams = Object.fromEntries(
        Object.entries(normalizedParams).filter(([, value]) => Boolean(value)),
      ) as Record<string, string | number>;
      return realInspectionApi.getPlans(realParams);
    }
    warnMockBoundary('inspection.plans', 'mock API mode 下检查计划来自前端样例');
    return resolveMock(() => {
      const typeCodes = splitFilterCodes(normalizedParams.type);
      const frequencyCodes = splitFilterCodes(normalizedParams.frequency);
      const keyword = normalizedParams.keyword?.toLowerCase();
      const filtered = cloneList(mock.mockInspectionPlans).filter(plan =>
        (!normalizedParams.year || plan.plannedStartDate.startsWith(normalizedParams.year))
        && (typeCodes.length === 0 || typeCodes.includes(plan.type))
        && (frequencyCodes.length === 0 || frequencyCodes.includes(plan.frequency))
        && (!normalizedParams.status || plan.status === normalizedParams.status)
        && (!keyword || [plan.title, plan.inspectCode, plan.leader]
          .some(value => value.toLowerCase().includes(keyword)))
      );
      const page = normalizedParams.page ?? 1;
      const pageSize = normalizedParams.pageSize ?? Math.max(filtered.length, 20);
      const start = (page - 1) * pageSize;
      return {
        items: filtered.slice(start, start + pageSize),
        page,
        pageSize,
        total: filtered.length,
      };
    });
  },
  getPlan(inspectionPlanId: string): Promise<InspectionPlan> {
    if (isRealBackedP0) {
      return realInspectionApi.getPlan(inspectionPlanId);
    }
    warnMockBoundary('inspection.planDetail', 'mock API mode 下检查计划详情来自前端样例');
    return resolveMock(() => (
      cloneList(mock.mockInspectionPlans).find(item => item.id === inspectionPlanId)
      ?? cloneList(mock.mockInspectionPlans)[0]
    ));
  },
  createPlan(planData: {
    title: string;
    inspectCode?: string;
    type?: string;
    frequency?: string;
    confidentialityLevel?: string;
    targetDept?: string;
    targetOrgIds?: string[];
    targetPersonnelIds?: string[];
    leaderUserId?: string;
    teamMembers?: string[];
    teamMemberUserIds?: string[];
    startDate?: string;
    endDate?: string;
    plannedStartDate?: string;
    plannedEndDate?: string;
    files?: Array<{ attachmentType: string; fileId: string }>;
  }): Promise<InspectionPlan> {
    if (isRealBackedP0) {
      return realInspectionApi.createPlan({
        title: planData.title,
        inspectCode: planData.inspectCode,
        type: normalizeInspectionPlanTypeCode(planData.type),
        frequency: normalizeInspectionPlanFrequencyCode(planData.frequency),
        confidentialityLevel: planData.confidentialityLevel,
        targetDept: planData.targetDept,
        targetOrgIds: planData.targetOrgIds,
        targetPersonnelIds: planData.targetPersonnelIds,
        leaderUserId: planData.leaderUserId,
        teamMemberUserIds: planData.teamMemberUserIds,
        plannedStartDate: planData.plannedStartDate ?? planData.startDate ?? '',
        plannedEndDate: planData.plannedEndDate ?? planData.endDate ?? '',
        files: planData.files ?? [],
      });
    }
    warnMockBoundary('inspection.createPlan', 'mock API mode 下仅本地生成检查计划');
    return resolveMock(() => ({
      id: `IP-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000)}`,
      title: planData.title,
      inspectCode: planData.inspectCode || `INSP-${new Date().getFullYear()}-LOCAL`,
      type: requireMockInspectionPlanTypeCode(planData.type),
      frequency: requireMockInspectionPlanFrequencyCode(planData.frequency),
      confidentialityLevel: planData.confidentialityLevel ?? 'NORMAL',
      confidentialityLabel: planData.confidentialityLevel === 'CONFIDENTIAL'
        ? '机密'
        : planData.confidentialityLevel === 'SECRET'
          ? '秘密'
          : '普通',
      leader: '',
      teamMembers: planData.teamMembers ?? [],
      targetDept: planData.targetDept || '',
      plannedStartDate: planData.plannedStartDate ?? planData.startDate ?? '',
      plannedEndDate: planData.plannedEndDate ?? planData.endDate ?? '',
      status: 'DRAFT',
      currentPhase: 'PLAN_DRAFT',
      phaseProgress: 0,
      files: {},
    }));
  },
  updatePlan(
    inspectionPlanId: string,
    planData: {
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
  ): Promise<InspectionPlan> {
    if (isRealBackedP0) {
      return realInspectionApi.updatePlan(inspectionPlanId, {
        title: planData.title,
        inspectCode: planData.inspectCode,
        type: planData.type ? normalizeInspectionPlanTypeCode(planData.type) : undefined,
        frequency: planData.frequency ? normalizeInspectionPlanFrequencyCode(planData.frequency) : undefined,
        confidentialityLevel: planData.confidentialityLevel,
        targetDept: planData.targetDept,
        targetOrgIds: planData.targetOrgIds,
        targetPersonnelIds: planData.targetPersonnelIds,
        leaderUserId: planData.leaderUserId,
        teamMemberUserIds: planData.teamMemberUserIds,
        plannedStartDate: planData.plannedStartDate,
        plannedEndDate: planData.plannedEndDate,
        files: planData.files,
      });
    }
    warnMockBoundary('inspection.updatePlan', 'mock API mode 下仅本地模拟更新检查计划');
    return resolveMock(() => ({
      id: inspectionPlanId,
      title: planData.title ?? '',
      inspectCode: planData.inspectCode ?? `INSP-${new Date().getFullYear()}-LOCAL`,
      type: planData.type ? requireMockInspectionPlanTypeCode(planData.type) : DEFAULT_INSPECTION_PLAN_TYPE_CODE,
      frequency: planData.frequency ? requireMockInspectionPlanFrequencyCode(planData.frequency) : DEFAULT_INSPECTION_PLAN_FREQUENCY_CODE,
      confidentialityLevel: planData.confidentialityLevel ?? 'NORMAL',
      confidentialityLabel: planData.confidentialityLevel === 'CONFIDENTIAL'
        ? '机密'
        : planData.confidentialityLevel === 'SECRET'
          ? '秘密'
          : '普通',
      leader: '',
      teamMembers: [],
      targetDept: planData.targetDept ?? '',
      plannedStartDate: planData.plannedStartDate ?? '',
      plannedEndDate: planData.plannedEndDate ?? '',
      status: 'DRAFT',
      currentPhase: 'PLAN_DRAFT',
      phaseProgress: 0,
      files: {},
    }));
  },
  transitionPlan(
    inspectionPlanId: string,
    action: string,
    payload?: {
      reason?: string;
      comment?: string;
      idempotencyKey?: string;
      optimisticVersion?: number;
    },
  ): Promise<InspectionPlan> {
    if (isRealBackedP0) {
      return realInspectionApi.transitionPlan(inspectionPlanId, action, payload);
    }
    return Promise.reject(
      new Error('inspection plan transitions require real API mode; mock fallback is disabled'),
    );
  },
  getPhaseLabel(phase: InspectionPhase): string {
    return mock.getPhaseLabel(phase);
  },
  getWorkingPapers(inspectionPlanId = DEFAULT_INSPECTION_PLAN_ID): Promise<WorkingPaper[]> {
    if (isRealBackedP0) {
      return realInspectionApi.getWorkingPapers(inspectionPlanId);
    }
    warnMockBoundary('inspection.workingPapers', 'mock API mode 下检查底稿来自前端样例');
    return resolveMock(() => cloneList(mock.mockWorkingPapers));
  },
  createWorkingPaper(
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
  ): Promise<WorkingPaper> {
    if (isRealBackedP0) {
      return realInspectionApi.createWorkingPaper(inspectionPlanId, payload);
    }
    return Promise.reject(
      new Error('working paper creation requires real API mode; mock fallback is disabled'),
    );
  },
  updateWorkingPaperResult(
    workingPaperId: string,
    payload: {
      result?: string;
      executionRecord?: string;
      fileIds?: string[];
      evidenceList?: string[];
      relatedIssueId?: string | null;
      convertedIssueId?: string | null;
    },
  ): Promise<WorkingPaper> {
    if (isRealBackedP0) {
      return realInspectionApi.updateWorkingPaperResult(workingPaperId, payload);
    }
    return Promise.reject(
      new Error('working paper result update requires real API mode; mock fallback is disabled'),
    );
  },
  getExecutionStats(papers: WorkingPaper[] = mock.mockWorkingPapers): Promise<ExecutionStats> {
    warnMockBoundary('inspection.executionStats', '检查底稿细颗粒度统计仍使用前端样例');
    return resolveMock(() => mock.calculateStats(papers));
  },
  getExecutionDetail(inspectionPlanId = DEFAULT_INSPECTION_PLAN_ID, params?: Record<string, string>): Promise<any> {
    if (isRealBackedP0) {
      return realInspectionApi.getExecutionDetail(inspectionPlanId, params);
    }
    warnMockBoundary('inspection.executionDetail', 'mock API mode 下执行详情来自前端样例');
    return resolveMock(() => ({
      inspectionPlanId,
      evidenceRequirements: cloneList(mock.mockRequirements),
      evidenceSubmissions: cloneList(mock.mockSubmissions),
      workingPapers: cloneList(mock.mockWorkingPapers),
      executionStats: mock.calculateStats(mock.mockWorkingPapers),
    }));
  },
  getEvidenceRequirements(inspectionPlanId = DEFAULT_INSPECTION_PLAN_ID): Promise<EvidenceRequirement[]> {
    if (isRealBackedP0) {
      return realInspectionApi.getEvidenceRequirements(inspectionPlanId);
    }
    warnMockBoundary('inspection.evidenceRequirements', 'mock API mode 下材料要求来自前端样例');
    return resolveMock(() => cloneList(mock.mockRequirements));
  },
  getEvidenceSubmissions(inspectionPlanId = DEFAULT_INSPECTION_PLAN_ID): Promise<EvidenceSubmission[]> {
    if (isRealBackedP0) {
      return realInspectionApi
        .getExecutionDetail(inspectionPlanId)
        .then(detail => detail.evidenceSubmissions ?? []);
    }
    warnMockBoundary('inspection.evidenceSubmissions', 'mock API mode 下材料提交来自前端样例');
    return resolveMock(() => cloneList(mock.mockSubmissions));
  },
  submitEvidence(requirementId: string, fileIds: string[]): Promise<EvidenceSubmission> {
    if (isRealBackedP0) {
      return realInspectionApi.submitEvidence(requirementId, fileIds);
    }
    warnMockBoundary('inspection.submitEvidence', 'mock API mode 下仅本地模拟材料提交');
    return resolveMock(() => ({
      id: `SUB-${Date.now()}`,
      requirementId,
      branchId: 'LOCAL-BRANCH',
      branchName: '本机构',
      files: fileIds.map(fileId => ({ name: fileId, url: '#', size: '', type: '', tags: [] })),
      status: 'SUBMITTED',
      submitTime: new Date().toISOString(),
    }));
  },
  reviewEvidenceSubmission(
    submissionId: string,
    payload: {
      decision: 'APPROVE' | 'REJECT';
      feedback?: string;
      comment?: string;
      idempotencyKey?: string;
    },
  ): Promise<EvidenceSubmission> {
    if (isRealBackedP0) {
      return realInspectionApi.reviewEvidenceSubmission(submissionId, payload);
    }
    warnMockBoundary('inspection.reviewEvidenceSubmission', 'mock API mode 下仅本地模拟材料审阅');
    return resolveMock(() => ({
      id: submissionId,
      requirementId: 'REQ-MOCK',
      branchId: 'LOCAL-BRANCH',
      branchName: '本机构',
      files: [],
      status: payload.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
      submitTime: new Date().toISOString(),
      hqFeedback: payload.feedback ?? payload.comment,
      reviewedAt: new Date().toISOString(),
      reviewDecision: payload.decision,
    }));
  },
  getFactIssues(params?: Record<string, string | number | boolean | undefined>): Promise<any[]> {
    if (isRealBackedP0) {
      return realInspectionApi.getIssues(params);
    }
    warnMockBoundary('inspection.factIssues', 'mock API mode 下事实确认问题来自前端样例');
    return resolveMock(() => cloneList(mock.mockIssues).map(item => ({
      id: item.id,
      issueCode: item.issueCode,
      inspectionPlanId: item.sourceProject,
      title: item.title,
      riskLevel: item.riskLevel,
      status: 'PENDING_CONFIRMATION',
      description: item.description,
      basisRule: item.basisRule,
      appealDeadline: item.slaDeadline,
    })));
  },
  createIssue(payload: {
    inspectionPlanId: string;
    branchId: string;
    title: string;
    riskLevel: string;
    description: string;
    basisRule?: string;
    sourceWorkingPaperId?: string;
    idempotencyKey?: string;
  }): Promise<any> {
    if (isRealBackedP0) {
      return realInspectionApi.createIssue(payload);
    }
    return Promise.reject(
      new Error('inspection issue creation requires real API mode; mock fallback is disabled'),
    );
  },
  confirmFact(issueId: string, decision: string, comment?: string): Promise<any> {
    if (isRealBackedP0) {
      return realInspectionApi.confirmFact(issueId, decision, comment);
    }
    warnMockBoundary('inspection.confirmFact', 'mock API mode 下仅本地模拟事实确认');
    return resolveMock(() => ({ issueId, decision, comment }));
  },
  submitAppeal(issueId: string, reason: string, fileIds: string[] = []): Promise<any> {
    if (isRealBackedP0) {
      return realInspectionApi.submitAppeal(issueId, reason, fileIds);
    }
    warnMockBoundary('inspection.submitAppeal', 'mock API mode 下仅本地模拟申辩提交');
    return resolveMock(() => ({ issueId, reason, fileIds }));
  },
  getAppeals(params?: Record<string, string>): Promise<any> {
    if (isRealBackedP0) {
      return realInspectionApi.getAppeals(params);
    }
    warnMockBoundary('inspection.appeals', 'mock API mode 下申辩列表使用空样例');
    return resolveMock(() => ({ items: [], total: 0 }));
  },
  decideAppeal(appealId: string, decision: string, decisionReason = ''): Promise<any> {
    if (isRealBackedP0) {
      return realInspectionApi.decideAppeal(appealId, decision, decisionReason);
    }
    warnMockBoundary('inspection.decideAppeal', 'mock API mode 下仅本地模拟裁决');
    return resolveMock(() => ({ appealId, decision, decisionReason }));
  },
  getSubmissionStatusLabel(status: SubmissionStatus, role: 'HQ' | 'BRANCH'): string {
    return mock.getStatusLabel(status, role);
  },
  async getRectificationWorkspace(): Promise<mock.InspectionRectificationWorkspaceData> {
    if (isRealBackedP0) {
      const rectifications = await realIssueApi.getBranchRectifications();
      const active = rectifications.filter(item => item.status !== 'CLOSED' && item.status !== 'ARCHIVED');
      const closed = rectifications.length - active.length;
      const overdue = active.filter(item => item.status === 'OVERDUE').length;
      return {
        stats: {
          total: rectifications.length,
          closed,
          overdue,
          inProgress: active.length,
          rate: rectifications.length ? Math.round((closed / rectifications.length) * 100) : 0,
        },
        ledger: rectifications.map(item => ({
          issueId: item.sourceIssueId,
          branchId: item.id,
          branchName: item.id,
          description: item.issueDescription,
          status: item.status,
          deadline: item.dueDate,
          evidenceCount: item.feedback?.attachments.length ?? 0,
        })),
      };
    }
    warnMockBoundary('inspection.rectificationWorkspace', 'mock API mode 下整改工作台来自前端样例');
    return resolveMock(cloneInspectionRectificationWorkspace);
  },
  getReportBranches(): Promise<mock.InspectionReportBranchStatus[]> {
    warnMockBoundary('inspection.reportBranches', '检查报告出具仍处于 P1/P2 样例视图');
    return resolveMock(() => cloneList(mock.mockInspectionReportBranches));
  },
  getReportVersions(): Promise<mock.InspectionReportVersion[]> {
    warnMockBoundary('inspection.reportVersions', '检查报告版本仍处于 P1/P2 样例视图');
    return resolveMock(() => cloneList(mock.mockInspectionReportVersions));
  },
  getReportWorkspace(inspectionPlanId = DEFAULT_INSPECTION_PLAN_ID): Promise<any> {
    if (isRealBackedP2) {
      return realInspectionApi.getReportWorkspace(inspectionPlanId);
    }
    warnMockBoundary('inspection.reportWorkspace', 'mock API mode 下检查报告工作台来自前端样例');
    return resolveMock(() => {
      const branchStatuses = cloneList(mock.mockInspectionReportBranches);
      const versions = cloneList(mock.mockInspectionReportVersions);
      const factConfirmed = branchStatuses.every(item => item.confirmStatus === 'AGREED');
      const appealsResolved = branchStatuses.every(item => item.defenseStatus !== 'PENDING');
      const finalReportPresent = versions.some(item => item.version.includes('终稿'));
      return {
        inspectionPlanId,
        readiness: {
          score: Math.round(
            ([factConfirmed, appealsResolved, finalReportPresent].filter(Boolean).length / 3)
              * 100,
          ),
          factConfirmed,
          appealsResolved,
          finalReportPresent,
          currentPhase: 'REPORTING',
          canGenerate: appealsResolved,
          canUpload: appealsResolved,
          canRelease: factConfirmed && appealsResolved && finalReportPresent,
          released: false,
        },
        branchStatuses,
        versions,
        currentFinalVersionId: versions.find(item => item.version.includes('终稿'))?.reportVersionId,
        currentReleasedVersionId: null,
        permissions: {
          canRead: true,
          canGenerate: appealsResolved,
          canUpload: appealsResolved,
          canRelease: factConfirmed && appealsResolved && finalReportPresent,
          canDownload: false,
          downloadDeferred: true,
        },
        blockers: [],
        download: {
          enabled: false,
          reason: 'DOWNLOAD_DEFERRED',
          label: 'Download is deferred until bounded backend streaming is implemented.',
        },
      };
    });
  },
  generateReportDraft(
    inspectionPlanId = DEFAULT_INSPECTION_PLAN_ID,
    payload: { format?: string; remarks?: string; idempotencyKey: string },
  ): Promise<any> {
    if (isRealBackedP2) {
      return realInspectionApi.generateReportDraft(inspectionPlanId, payload);
    }
    warnMockBoundary('inspection.generateReportDraft', 'mock API mode 下仅本地模拟报告草稿生成');
    return resolveMock(() => ({
      reportVersionId: `REPORT-MOCK-DRAFT-${Date.now()}`,
      version: 'v1.1 草稿',
      name: '检查报告草稿.docx',
      method: 'MOCK',
      uploader: currentSessionDisplayName() ?? 'MOCK',
      time: new Date().toISOString(),
    }));
  },
  bindFinalReport(
    inspectionPlanId = DEFAULT_INSPECTION_PLAN_ID,
    payload: {
      fileAssetId: string;
      supportingFileAssetIds?: string[];
      label?: string;
      remarks?: string;
      idempotencyKey: string;
    },
  ): Promise<any> {
    if (isRealBackedP2) {
      return realInspectionApi.bindFinalReport(inspectionPlanId, payload);
    }
    warnMockBoundary('inspection.bindFinalReport', 'mock API mode 下仅本地模拟最终报告绑定');
    return resolveMock(() => ({ inspectionPlanId, ...payload, status: 'FINAL_UPLOADED' }));
  },
  releaseReport(
    inspectionPlanId: string,
    reportVersionId: string,
    payload: { comment?: string; optimisticVersion?: number; idempotencyKey: string },
  ): Promise<any> {
    if (isRealBackedP2) {
      return realInspectionApi.releaseReport(inspectionPlanId, reportVersionId, payload);
    }
    warnMockBoundary('inspection.releaseReport', 'mock API mode 下仅本地模拟报告发布');
    return resolveMock(() => ({ inspectionPlanId, reportVersionId, released: true }));
  },
  getReportAuditEvents(
    inspectionPlanId = DEFAULT_INSPECTION_PLAN_ID,
    params?: Record<string, string | number | boolean | undefined>,
  ): Promise<any> {
    if (isRealBackedP2) {
      return realInspectionApi.getReportAuditEvents(inspectionPlanId, params);
    }
    warnMockBoundary('inspection.reportAuditEvents', 'mock API mode 下报告审计事件为空样例');
    return resolveMock(() => ({ items: [], total: 0, page: 1, pageSize: 50 }));
  },
  downloadReport(inspectionPlanId: string, reportVersionId: string): Promise<any> {
    if (isRealBackedP2) {
      return realInspectionApi.downloadReport(inspectionPlanId, reportVersionId);
    }
    warnMockBoundary('inspection.downloadReport', 'mock API mode 下不提供报告下载');
    return resolveMock(() => ({ inspectionPlanId, reportVersionId, downloadDeferred: true }));
  },
  acknowledgePlan(
    inspectionPlanId: string,
    payload: { liaisonName?: string; liaisonPhone?: string; liaisonTitle?: string } = {},
  ): Promise<InspectionPlanAcknowledgement> {
    if (isRealBackedP0) {
      return realInspectionApi.acknowledgePlan(inspectionPlanId, payload);
    }
    warnMockBoundary('inspection.acknowledgePlan', 'mock API mode 下仅本地模拟确认接收');
    return resolveMock(() => ({
      acknowledgementId: `ACK-MOCK-${Date.now()}`,
      inspectionPlanId,
      targetOrgId: 'LOCAL-BRANCH',
      targetOrgName: '本机构',
      ackStatus: 'ACKNOWLEDGED',
      acknowledgedBy: 'LOCAL-USER',
      acknowledgedAt: new Date().toISOString(),
      liaisonName: payload.liaisonName ?? null,
      liaisonPhone: payload.liaisonPhone ?? null,
      liaisonTitle: payload.liaisonTitle ?? null,
    }));
  },
};

export const issueApi = {
  getIssues(params?: Record<string, string>): Promise<ComplianceIssue[]> {
    if (isRealBackedP0) {
      return realIssueApi.getIssues(params);
    }
    warnMockBoundary('issues.list', 'mock API mode 下问题列表来自前端样例');
    return resolveMock(() => cloneList(mock.mockIssues));
  },
  getIssueLedgerPage(params?: Record<string, string>): Promise<mock.IssueLedgerPage> {
    if (isRealBackedP0) {
      return realIssueApi.getIssueLedgerPage(params);
    }
    warnMockBoundary('issues.ledgerPage', 'mock API mode 下问题台账来自前端样例');
    return resolveMock(cloneIssueLedgerPage);
  },
  getIssueProjectTracker(params?: Record<string, string | number | undefined>): Promise<IssueProjectRollupPage> {
    if (isRealBackedP0) {
      return realIssueApi.getIssueProjectTracker(params);
    }
    warnMockBoundary('issues.projectTracker', 'mock API mode 下项目跟踪大盘来自前端样例');
    return resolveMock(mockIssueProjectPage);
  },
  getIssueProjectBranches(projectId: string, params?: Record<string, string | number | undefined>): Promise<IssueProjectBranchProgressPage> {
    if (isRealBackedP0) {
      return realIssueApi.getIssueProjectBranches(projectId, params);
    }
    warnMockBoundary('issues.projectBranches', 'mock API mode 下项目机构进度来自前端样例');
    return resolveMock(() => mockIssueProjectBranches(projectId));
  },
  sendProjectOverdueReminder(
    projectId: string,
    payload: { targetOrgIds: string[]; reason?: string; requestId?: string; deliveryMode?: string }
  ): Promise<IssueProjectReminderResponse> {
    if (isRealBackedP0) {
      return realIssueApi.sendProjectOverdueReminder(projectId, payload);
    }
    warnMockBoundary('issues.projectReminder', 'mock API mode 下仅本地模拟项目逾期催办');
    return resolveMock(() => ({
      reminderEventId: `MOCK-REM-${Date.now()}`,
      projectId,
      targetOrgIds: payload.targetOrgIds,
      deliveryMode: payload.deliveryMode ?? 'IN_APP_NOTIFICATION',
      status: 'SENT',
      notificationIds: ['MOCK-NOTIFICATION'],
      resultSummary: {
        targetOrgCount: payload.targetOrgIds.length,
        notificationCount: 1,
        suppressedDuplicateCount: 0,
        failureCount: 0,
      },
      duplicate: false,
    }));
  },
  getIssueAnalytics(params?: Record<string, string | number | undefined>): Promise<IssueAnalyticsReadModel> {
    if (isRealBackedP0) {
      return realIssueApi.getIssueAnalytics(params);
    }
    warnMockBoundary('issues.analytics', 'mock API mode 下问题数据驾驶舱来自前端样例');
    return resolveMock(mockIssueAnalyticsReadModel);
  },
  getBranchRectifications(params?: Record<string, string>): Promise<RectificationRecord[]> {
    if (isRealBackedP0) {
      return realIssueApi.getBranchRectifications(params);
    }
    warnMockBoundary('issues.branchRectifications', 'mock API mode 下整改台账来自前端样例');
    return resolveMock(() => cloneList(mock.mockBranchRectifications));
  },
  submitFeedback(rectificationId: string, content: string, fileIds: string[] = []): Promise<RectificationRecord> {
    if (isRealBackedP0) {
      return realIssueApi.submitFeedback(rectificationId, content, fileIds);
    }
    warnMockBoundary('issues.submitFeedback', 'mock API mode 下仅本地模拟整改反馈');
    return resolveMock(() => ({
      id: rectificationId,
      sourceIssueId: rectificationId,
      issueDescription: content,
      rectificationGoal: '本地模拟整改反馈',
      riskLevel: 'LOW',
      dueDate: new Date().toISOString(),
      status: 'PENDING_VERIFICATION',
      feedback: {
        content,
        attachments: fileIds.map(fileId => ({ name: fileId, url: '#', type: '' })),
        submittedBy: '本地用户',
        submittedAt: new Date().toISOString(),
      },
    }));
  },
  startRectification(rectificationId: string): Promise<RectificationRecord> {
    if (isRealBackedP0) {
      return realIssueApi.startRectification(rectificationId);
    }
    warnMockBoundary('issues.startRectification', 'mock API mode 下仅本地模拟整改启动');
    return resolveMock(() => cloneList(mock.mockBranchRectifications).find(item => item.id === rectificationId) ?? mock.mockBranchRectifications[0]);
  },
  verifyRectification(rectificationId: string, decision: 'APPROVE' | 'REJECT', rejectReason?: string): Promise<RectificationRecord> {
    if (isRealBackedP0) {
      return realIssueApi.verifyRectification(rectificationId, decision, rejectReason);
    }
    warnMockBoundary('issues.verifyRectification', 'mock API mode 下仅本地模拟整改核实');
    return resolveMock(() => ({
      ...(cloneList(mock.mockBranchRectifications).find(item => item.id === rectificationId) ?? mock.mockBranchRectifications[0]),
      status: decision === 'APPROVE' ? 'CLOSED' : 'VERIFICATION_REJECTED',
      hqRejectReason: rejectReason,
    }));
  }
};

export const taskApi = {
  getHQTasks(type?: string): Promise<UnifiedTask[]> {
    if (isRealBackedP0) {
      return realTaskApi.getHQTasks(type);
    }
    warnMockBoundary('tasks.hq', 'mock API mode 下总部待办来自前端样例');
    return resolveMock(() => cloneList(mock.mockHQTasks));
  },
  getBranchTasks(type?: string): Promise<UnifiedTask[]> {
    if (isRealBackedP0) {
      return realTaskApi.getBranchTasks(type);
    }
    warnMockBoundary('tasks.branch', 'mock API mode 下机构待办来自前端样例');
    return resolveMock(() => cloneList(mock.mockBranchTasks));
  },
  getCounts(params?: {
    category?: string;
    status?: string;
    groupBy?: 'category' | 'status';
  }) {
    if (isRealBackedP0) {
      return realTaskApi.getCounts(params);
    }
    warnMockBoundary('tasks.counts', 'mock API mode 下待办计数来自前端样例聚合');
    return resolveMock((): TaskCounts => {
      const tasks = [...mock.mockHQTasks, ...mock.mockBranchTasks];
      const filtered = tasks.filter(task =>
        (!params?.category || task.category === params.category)
        && (!params?.status || task.status === params.status)
      );
      const byCategory = filtered.reduce<Record<string, number>>((acc, task) => {
        acc[task.category] = (acc[task.category] ?? 0) + 1;
        return acc;
      }, {});
      const byStatus = filtered.reduce<Record<string, number>>((acc, task) => {
        acc[task.status] = (acc[task.status] ?? 0) + 1;
        return acc;
      }, {});
      return {
        total: filtered.length,
        totalOpen: filtered.filter(task => task.status !== 'DONE').length,
        byCategory,
        byStatus,
        groups: params?.groupBy === 'category' ? byCategory : params?.groupBy === 'status' ? byStatus : undefined,
      };
    });
  },
};

export const notificationApi = {
  list(params?: {
    type?: string;
    isRead?: boolean;
    sourceModule?: string;
    page?: number;
    pageSize?: number;
  }) {
    if (isRealBackedP0) {
      return realNotificationApi.list(params);
    }
    warnMockBoundary('notifications.list', 'mock API mode 下消息通知来自前端样例');
    return resolveMock(() => {
      const items = cloneList(mock.mockNotifications).filter(item =>
        (!params?.type || item.type === params.type)
        && (params?.isRead === undefined || item.isRead === params.isRead)
      ).map(toNotificationItem);
      return {
        items,
        page: params?.page ?? 1,
        pageSize: params?.pageSize ?? items.length,
        total: items.length,
      };
    });
  },
  unreadCount() {
    if (isRealBackedP0) {
      return realNotificationApi.unreadCount();
    }
    warnMockBoundary('notifications.unreadCount', 'mock API mode 下消息未读数来自前端样例');
    return resolveMock(() => ({
      unreadCount: mock.mockNotifications.filter(item => !item.isRead).length,
    }));
  },
  markRead(notificationId: string) {
    if (isRealBackedP0) {
      return realNotificationApi.markRead(notificationId);
    }
    warnMockBoundary('notifications.markRead', 'mock API mode 下仅本地模拟消息已读');
    return resolveMock(() => {
      const item = mock.mockNotifications.find(notification => notification.id === notificationId)
        ?? mock.mockNotifications[0];
      return toNotificationItem({ ...item, isRead: true });
    });
  },
  markAllRead() {
    if (isRealBackedP0) {
      return realNotificationApi.markAllRead();
    }
    warnMockBoundary('notifications.markAllRead', 'mock API mode 下仅本地模拟全部已读');
    return resolveMock(() => ({
      affectedCount: mock.mockNotifications.filter(item => !item.isRead).length,
      readAt: new Date().toISOString(),
    }));
  },
};

const workflowDetailFromTemplate = (template: WorkflowTemplateAggregate): WorkflowTemplateDetail => ({
  templateId: template.templateId,
  name: template.name,
  domain: template.domain,
  scopeMode: template.scopeMode,
  status: template.status,
  schemaVersion: template.schemaVersion,
  chainCount: template.chains.length,
  currentVersionId: template.status === 'ACTIVE' ? `${template.templateId}-V001` : null,
  lastValidationSummary: { errorCount: 0, warningCount: 0, infoCount: 0, findingCodes: [] },
  updatedAt: new Date().toISOString(),
  updatedBy: template.updatedBy,
  template,
  chains: template.chains,
  publishedVersion: template.status === 'ACTIVE'
    ? {
        templateVersionId: `${template.templateId}-V001`,
        templateId: template.templateId,
        versionNo: 1,
        status: 'PUBLISHED',
        snapshotHash: 'mock-workflow-template-hash',
        targetScopeSnapshot: template.chains.map(chain => ({
          chainId: chain.chainId,
          chainName: chain.name,
          ...chain.targetScope,
        })),
        publishedAt: new Date().toISOString(),
        archivedAt: null,
      }
    : null,
  auditSummary: { eventCount: 0, lastEventType: null },
});

export const workflowApi = {
  listTemplates(): Promise<WorkflowTemplatePage> {
    if (isRealBackedP2) {
      return realWorkflowApi.listTemplates();
    }
    warnMockBoundary('workflow.templates', 'mock API mode 下工作流模板来自显式本地样例');
    return resolveMock(() => {
      const template = mockWorkflowTemplate();
      const detail = workflowDetailFromTemplate(template);
      const summary: WorkflowTemplateSummary = {
        templateId: detail.templateId,
        name: detail.name,
        domain: detail.domain,
        scopeMode: detail.scopeMode,
        status: detail.status,
        schemaVersion: detail.schemaVersion,
        chainCount: detail.chainCount,
        currentVersionId: detail.currentVersionId,
        lastValidationSummary: detail.lastValidationSummary,
        updatedAt: detail.updatedAt,
        updatedBy: detail.updatedBy,
      };
      return { items: [summary], page: 1, pageSize: 1, total: 1 };
    });
  },
  getTemplate(templateId: string): Promise<WorkflowTemplateDetail> {
    if (isRealBackedP2) {
      return realWorkflowApi.getTemplate(templateId);
    }
    warnMockBoundary('workflow.templateDetail', 'mock API mode 下工作流模板详情来自显式本地样例');
    return resolveMock(() => workflowDetailFromTemplate({
      ...mockWorkflowTemplate(),
      templateId,
    }));
  },
  saveDraft(
    templateId: string,
    payload: Partial<Pick<WorkflowTemplateAggregate, 'name' | 'scopeMode' | 'chains'>>
  ): Promise<WorkflowTemplateDetail> {
    if (isRealBackedP2) {
      return realWorkflowApi.saveDraft(templateId, payload);
    }
    warnMockBoundary('workflow.saveDraft', 'mock API mode 下仅本地模拟保存工作流草稿');
    return resolveMock(() => workflowDetailFromTemplate({
      ...mockWorkflowTemplate(),
      templateId,
      name: payload.name ?? mockWorkflowTemplate().name,
      scopeMode: payload.scopeMode ?? mockWorkflowTemplate().scopeMode,
      chains: payload.chains ?? mockWorkflowTemplate().chains,
      updatedBy: 'MOCK-MODE',
    }));
  },
  validate(templateId: string): Promise<WorkflowValidationResponse> {
    if (isRealBackedP2) {
      return realWorkflowApi.validate(templateId);
    }
    warnMockBoundary('workflow.validate', 'mock API mode 下仅本地模拟工作流校验');
    return resolveMock(() => ({
      templateId,
      status: 'DRAFT',
      summary: { errorCount: 0, warningCount: 0, infoCount: 0, findingCodes: [] },
      findings: [],
    }));
  },
  publish(templateId: string): Promise<WorkflowPublishResponse> {
    if (isRealBackedP2) {
      return realWorkflowApi.publish(templateId);
    }
    warnMockBoundary('workflow.publish', 'mock API mode 下仅本地模拟工作流发布');
    const template = { ...mockWorkflowTemplate(), templateId, status: 'ACTIVE' as const };
    const detail = workflowDetailFromTemplate(template);
    return resolveMock(() => ({
      template: detail,
      version: detail.publishedVersion!,
      duplicate: false,
    }));
  },
};

export const fileApi = {
  uploadFile(file: File): Promise<any> {
    if (isRealBackedP0) {
      return realFileApi.uploadFile(file);
    }
    warnMockBoundary('files.upload', 'mock API mode 下仅生成本地文件标识');
    return resolveMock(() => ({
      fileId: `FILE-MOCK-${Date.now()}`,
      fileName: file.name,
      contentType: file.type,
      fileSize: file.size,
      uploadedAt: new Date().toISOString(),
    }));
  },
  getDownloadUrl(fileId: string): Promise<any> {
    if (isRealBackedP0) {
      return realFileApi.getDownloadUrl(fileId);
    }
    warnMockBoundary('files.download', 'mock API mode 下不签发对象存储下载地址');
    return resolveMock(() => ({
      fileId,
      downloadUrl: null,
      downloadDeferred: true,
    }));
  },
};

const flattenOrgNames = (node: any): string[] => {
  if (Array.isArray(node)) {
    return node.flatMap(item => flattenOrgNames(item));
  }
  if (!node) return [];
  const current = node.name ?? node.orgName ?? node.org_name;
  const children = node.children ?? [];
  return [
    ...(current ? [current] : []),
    ...children.flatMap((child: any) => flattenOrgNames(child)),
  ];
};

const uniqueNonEmpty = (items: Array<string | null | undefined>): string[] =>
  Array.from(new Set(items.map(item => item?.trim()).filter(Boolean) as string[]));

const currentSessionDisplayName = (): string | null => {
  try {
    const raw = window.localStorage.getItem('compliance-digital-twin-auth-session');
    if (!raw) return null;
    const session = JSON.parse(raw);
    return session?.user?.displayName ?? session?.user?.display_name ?? session?.user?.username ?? null;
  } catch {
    return null;
  }
};

export const systemApi = {
  async getOrgTree(): Promise<mock.OrgNode> {
    if (isRealBackedP0) {
      const tree = await realSystemApi.getOrgTree();
      const nodes = Array.isArray(tree) ? tree.map(toOrgNode) : [toOrgNode(tree)];
      if (nodes.length === 1) return nodes[0];
      return { id: 'ORG-ROOT', name: '组织架构', type: 'root', children: nodes };
    }
    warnMockBoundary('system.orgTree', 'mock API mode 下组织树来自前端样例');
    return resolveMock(() => cloneObject(mock.mockOrgTree));
  },
  async getOrgNames(): Promise<string[]> {
    if (isRealBackedP0) {
      const tree = await realSystemApi.getOrgTree();
      return uniqueNonEmpty(flattenOrgNames(tree));
    }
    warnMockBoundary('system.orgNames', 'mock API mode 下机构列表来自前端样例');
    return resolveMock(() => mock.MOCK_DEPTS);
  },
  async getPersonnelNames(): Promise<string[]> {
    if (isRealBackedP0) {
      return uniqueNonEmpty([currentSessionDisplayName()]);
    }
    warnMockBoundary('system.personnelNames', 'mock API mode 下人员列表来自前端样例');
    return resolveMock(() => mock.MOCK_STAFF);
  },
  async getPersonnel(): Promise<mock.Personnel[]> {
    if (isRealBackedP0) {
      const people = await realSystemApi.getPersonnel();
      return people.map(toPersonnel);
    }
    warnMockBoundary('system.personnel', 'mock API mode 下人员列表来自前端样例');
    return resolveMock(() => cloneList(mock.mockPersonnel));
  },
  async getRoles(): Promise<mock.SystemRole[]> {
    if (isRealBackedP0) {
      const roles = await realSystemApi.getRoles();
      return realItems<any>(roles).map(toSystemRole);
    }
    warnMockBoundary('system.roles', 'mock API mode 下角色列表来自前端样例');
    return resolveMock(() => cloneList(mock.mockRoles));
  },
  async getRoleAssignments(): Promise<mock.RoleAssignment[]> {
    if (isRealBackedP0) {
      const assignments = await realSystemApi.getRoleAssignments();
      return realItems<any>(assignments).map(toRoleAssignment);
    }
    warnMockBoundary('system.roleAssignments', 'mock API mode 下角色授权来自前端样例');
    return resolveMock(() => cloneList(mock.initialRoleAssignments));
  },
  async createRoleAssignment(payload: { roleId: string; personnelId: string; orgId: string }): Promise<mock.RoleAssignment> {
    if (isRealBackedP0) {
      return toRoleAssignment(await realSystemApi.createRoleAssignment(payload));
    }
    warnMockBoundary('system.createRoleAssignment', 'mock API mode 下仅本地模拟角色授权');
    return resolveMock(() => ({
      assignmentId: `RA-MOCK-${Date.now()}`,
      roleId: payload.roleId,
      personnelId: payload.personnelId,
      orgId: payload.orgId,
    }));
  },
  async deleteRoleAssignment(assignmentId: string): Promise<void> {
    if (isRealBackedP0) {
      await realSystemApi.deleteRoleAssignment(assignmentId);
      return;
    }
    warnMockBoundary('system.deleteRoleAssignment', 'mock API mode 下仅本地模拟移除授权');
    await wait();
  },
  async getConfigDictionaries(types?: string[]): Promise<ConfigDictionariesResponse> {
    if (isRealBackedP0) {
      return realSystemApi.getConfigDictionaries(types);
    }
    warnMockBoundary('system.configDictionaries', 'mock API mode 下业务配置字典来自显式本地样例');
    return resolveMock(() => mockConfigDictionaries(types));
  },
  async getDictionaryAdminTypes(): Promise<DictionaryAdminTypeListResponse> {
    if (isRealBackedP0) {
      return realSystemApi.getDictionaryAdminTypes();
    }
    warnMockBoundary('system.dictionaryAdminTypes', 'mock API mode 下字典类型列表来自显式本地样例');
    return resolveMock(mockDictionaryTypes);
  },
  async getDictionaryAdminItems(
    params: DictionaryAdminItemListParams = {},
  ): Promise<DictionaryAdminItemListResponse> {
    if (isRealBackedP0) {
      return realSystemApi.getDictionaryAdminItems(params);
    }
    warnMockBoundary('system.dictionaryAdminItems', 'mock API mode 下字典项列表来自显式本地样例');
    return resolveMock(() => mockDictionaryItemPage(params));
  },
  async createDictionaryAdminItem(
    payload: DictionaryAdminItemCreateRequest,
  ): Promise<DictionaryAdminItem> {
    if (isRealBackedP0) {
      return realSystemApi.createDictionaryAdminItem(payload);
    }
    warnMockBoundary('system.createDictionaryAdminItem', 'mock API mode 下仅本地模拟新增字典项');
    await wait();
    const duplicate = mockDictionaryAdminItems.some(item =>
      !item.isDeleted && item.dictType === payload.dictType && item.dictCode === payload.dictCode
    );
    if (duplicate) {
      throw new Error('Dictionary code already exists in this type');
    }
    const item: DictionaryAdminItem = {
      dictId: `DICT-MOCK-${Date.now()}`,
      parentId: payload.parentId ?? null,
      dictType: payload.dictType,
      dictCode: payload.dictCode,
      label: payload.label,
      labelEn: payload.labelEn ?? null,
      sortOrder: payload.sortOrder ?? 0,
      active: payload.active ?? true,
      isSystem: false,
      editPolicy: 'ADMIN_EDITABLE',
      description: payload.description ?? null,
      uiMeta: payload.uiMeta ?? {},
      source: 'mock',
      version: 1,
      isDeleted: false,
    };
    mockDictionaryAdminItems = [...mockDictionaryAdminItems, item];
    return cloneDictionaryItem(item);
  },
  async updateDictionaryAdminItem(
    dictId: string,
    payload: DictionaryAdminItemUpdateRequest,
  ): Promise<DictionaryAdminItem> {
    if (isRealBackedP0) {
      return realSystemApi.updateDictionaryAdminItem(dictId, payload);
    }
    warnMockBoundary('system.updateDictionaryAdminItem', 'mock API mode 下仅本地模拟更新字典项');
    await wait();
    const item = mockDictionaryAdminItems.find(row => row.dictId === dictId && !row.isDeleted);
    if (!item) throw new Error('Dictionary item not found');
    if (item.version !== payload.version) throw new Error('Dictionary item version has changed');
    if (item.editPolicy === 'SYSTEM_LOCKED') throw new Error('System locked dictionary item cannot be updated');
    const updated: DictionaryAdminItem = {
      ...item,
      label: payload.label ?? item.label,
      labelEn: payload.labelEn !== undefined ? payload.labelEn : item.labelEn,
      sortOrder: payload.sortOrder ?? item.sortOrder,
      active: payload.active ?? item.active,
      description: payload.description !== undefined ? payload.description : item.description,
      uiMeta: payload.uiMeta ?? item.uiMeta,
      version: item.version + 1,
    };
    mockDictionaryAdminItems = mockDictionaryAdminItems.map(row => row.dictId === dictId ? updated : row);
    return cloneDictionaryItem(updated);
  },
  async deleteDictionaryAdminItem(
    dictId: string,
    version?: number,
  ): Promise<DictionaryAdminDeleteResponse> {
    if (isRealBackedP0) {
      return realSystemApi.deleteDictionaryAdminItem(dictId, version);
    }
    warnMockBoundary('system.deleteDictionaryAdminItem', 'mock API mode 下仅本地模拟软删除字典项');
    await wait();
    const item = mockDictionaryAdminItems.find(row => row.dictId === dictId && !row.isDeleted);
    if (!item) throw new Error('Dictionary item not found');
    if (version !== undefined && item.version !== version) throw new Error('Dictionary item version has changed');
    if (item.isSystem || item.editPolicy !== 'ADMIN_EDITABLE') throw new Error('Locked dictionary item cannot be deleted');
    const affectedIds = new Set<string>([dictId]);
    let changed = true;
    while (changed) {
      changed = false;
      mockDictionaryAdminItems.forEach(row => {
        if (row.parentId && affectedIds.has(row.parentId) && !affectedIds.has(row.dictId)) {
          affectedIds.add(row.dictId);
          changed = true;
        }
      });
    }
    mockDictionaryAdminItems = mockDictionaryAdminItems.map(row =>
      affectedIds.has(row.dictId)
        ? { ...row, active: false, isDeleted: true, version: row.version + 1 }
        : row
    );
    return { deletedCount: affectedIds.size, dictIds: Array.from(affectedIds) };
  },
  async sortDictionaryAdminItems(
    items: DictionaryAdminSortRequestItem[],
  ): Promise<DictionaryAdminItemListResponse> {
    if (isRealBackedP0) {
      return realSystemApi.sortDictionaryAdminItems(items);
    }
    warnMockBoundary('system.sortDictionaryAdminItems', 'mock API mode 下仅本地模拟字典排序');
    await wait();
    const updates = new Map(items.map(item => [item.dictId, item]));
    mockDictionaryAdminItems = mockDictionaryAdminItems.map(row => {
      const update = updates.get(row.dictId);
      if (!update) return row;
      if (row.version !== update.version) throw new Error('Dictionary item version has changed');
      return { ...row, sortOrder: update.sortOrder, version: row.version + 1 };
    });
    return mockDictionaryItemPage({
      dictType: mockDictionaryAdminItems.find(row => updates.has(row.dictId))?.dictType,
      page: 1,
      pageSize: items.length,
    });
  },
};

export const contractApi = {
  getRouteContracts(): Promise<mock.AppRouteContract[]> {
    warnMockBoundary('contracts.routes', '路由契约展示仍使用前端合同快照');
    return resolveMock(() => cloneList(mock.APP_ROUTE_CONTRACTS));
  },
  async getSystemDictionaries(): Promise<mock.SystemDictionaries> {
    if (isRealBackedP0) {
      return realSystemApi.getDictionaries();
    }
    warnMockBoundary('contracts.systemDictionaries', 'mock API mode 下字典来自前端快照');
    return resolveMock(() => mock.SYSTEM_DICTIONARIES);
  },
};

export const mockApiSync = {
  users: {
    list: (): AuthUser[] => mock.mockUsers.map(toAuthUser),
  },
  dashboard: {
    getBranchPortraits: (): BranchPortrait[] => cloneList(mock.mockBranchPortraits),
    getGlobalMetrics: (): GlobalMetrics => cloneObject(mock.globalMetrics),
    getCurrentBranchProfile: (): LocalBranchProfile => cloneObject(mock.mockCurrentBranchProfile),
  },
  assessment: {
    getReportingTasks: (): ReportingTask[] => cloneList(mock.mockReportingTasks),
    getAssessmentResults: (): AssessmentResult[] => cloneList(mock.mockAssessmentResults),
    getReviewTask: (): ReviewTask => cloneObject(mock.mockReviewTask),
    getIndicators: (): Indicator[] => cloneList(mock.mockIndicators),
    getDemoSchemes: (): AssessmentScheme[] => cloneList(mock.mockSchemes),
    validateSchemeWeight: assessmentApi.validateSchemeWeight,
    getDistributionTasks: (): DistributionTask[] => cloneList(mock.mockDistributionTasks),
    getSchemeMonitorStats: (tasks: DistributionTask[] = mock.mockDistributionTasks): SchemeMonitorStats => mock.calculateSchemeMonitorStats(tasks),
    getSchemeItems: (): mock.AssessmentSchemeItem[] => cloneList(mock.mockSchemeItems),
    getFormIndicators: (): mock.FormIndicator[] => cloneList(mock.mockFormIndicators),
    getBranches: () => cloneList(mock.mockBranches),
    getReviewTasksList: (): ReviewTask[] => cloneList(mock.mockReviewTasks),
    getTriageTasks: () => cloneList(mock.mockTriageTasks),
    getActiveCycles: () => cloneList(mock.mockActiveAssessmentCycles),
    getWorkflowBranchTasks: () => cloneList(mock.mockAssessmentWorkflowBranchTasks),
    getAppealEkpNodes: () => cloneList(mock.mockAppealEkpNodes),
    getTrendDataMap: cloneAssessmentTrendDataMap,
    getSearchItems: () => cloneList(mock.mockAssessmentSearchItems),
    getLeaderboardData: () => cloneList(mock.mockAssessmentLeaderboardData),
    getUnifiedReviewTasks: cloneUnifiedReviewTasks,
    getUnifiedReviewQuickPhrases: () => cloneList(mock.mockUnifiedReviewQuickPhrases),
  },
  inspection: {
    getPlans: (): InspectionPlan[] => cloneList(mock.mockInspectionPlans),
    getPhaseLabel: inspectionApi.getPhaseLabel,
    getWorkingPapers: (): WorkingPaper[] => cloneList(mock.mockWorkingPapers),
    getExecutionStats: (papers: WorkingPaper[] = mock.mockWorkingPapers): ExecutionStats => mock.calculateStats(papers),
    getEvidenceRequirements: (): EvidenceRequirement[] => cloneList(mock.mockRequirements),
    getEvidenceSubmissions: (): EvidenceSubmission[] => cloneList(mock.mockSubmissions),
    getSubmissionStatusLabel: inspectionApi.getSubmissionStatusLabel,
    getRectificationWorkspace: cloneInspectionRectificationWorkspace,
    getReportBranches: (): mock.InspectionReportBranchStatus[] => cloneList(mock.mockInspectionReportBranches),
    getReportVersions: (): mock.InspectionReportVersion[] => cloneList(mock.mockInspectionReportVersions),
    getPlanHeaderMock: () => cloneObject(mock.mockPlanHeaderData),
    getMockDepts: () => cloneList(mock.MOCK_DEPTS),
    getMockStaff: () => cloneList(mock.MOCK_STAFF),
  },
  issues: {
    getIssues: (): ComplianceIssue[] => cloneList(mock.mockIssues),
    getIssueLedgerPage: cloneIssueLedgerPage,
    getBranchRectifications: (): RectificationRecord[] => cloneList(mock.mockBranchRectifications),
  },
  tasks: {
    getHQTasks: (): UnifiedTask[] => cloneList(mock.mockHQTasks),
    getBranchTasks: (): UnifiedTask[] => cloneList(mock.mockBranchTasks),
  },
  contracts: {
    getRouteContracts: (): mock.AppRouteContract[] => cloneList(mock.APP_ROUTE_CONTRACTS),
    getSystemDictionaries: (): mock.SystemDictionaries => mock.SYSTEM_DICTIONARIES,
  },
  system: {
    getOrgTree: (): mock.OrgNode => mock.mockOrgTree,
    getPersonnel: (): mock.Personnel[] => cloneList(mock.mockPersonnel),
    getRoles: (): mock.SystemRole[] => cloneList(mock.mockRoles),
    getRoleAssignments: (): mock.RoleAssignment[] => cloneList(mock.initialRoleAssignments),
  },
  workflow: {
    getInstances: (): Record<string, mock.WorkflowInstance> => cloneObject(mock.mockInstances),
  },
  notifications: {
    getNotifications: (): mock.NotificationItem[] => cloneList(mock.mockNotifications),
  }
} as const;

export const mockApi = {
  users: userApi,
  dashboard: dashboardApi,
  assessment: assessmentApi,
  inspection: inspectionApi,
  issues: issueApi,
  tasks: taskApi,
  contracts: contractApi,
} as const;
