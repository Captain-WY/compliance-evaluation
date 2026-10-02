import type {
  AssessmentScheme,
  BranchPortrait,
  BusinessLine,
  EvidenceTag,
  ExtensionStatus,
  FillStatus,
  Indicator,
  InspectionPhase,
  InspectionPlan,
  InspectionStatus,
  IssueRectificationStatus,
  IssueStatus,
  MenuMode,
  RectificationStatus,
  ReportingTask,
  RiskLevel,
  ScoringRule,
  SubmissionStatus,
  TaskActionType,
  TaskCategory,
  UnifiedTask,
  UserLevel,
  WorkingPaperResult,
} from '../../types';
import {
  BUSINESS_LINES,
  EVIDENCE_TAGS,
  EXTENSION_STATUSES,
  INSPECTION_PHASES,
  INSPECTION_STATUSES,
  ISSUE_RECTIFICATION_STATUSES,
  ISSUE_STATUSES,
  MENU_MODES,
  RECTIFICATION_STATUSES,
  RISK_LEVELS,
  SUBMISSION_STATUSES,
  TASK_ACTION_TYPES,
  TASK_CATEGORIES,
  UNIFIED_TASK_PRIORITIES,
  UNIFIED_TASK_STATUSES,
  USER_LEVELS,
} from '../dictionaryMapper';

type AssessmentSchemeStatus = AssessmentScheme['status'];
type AssessmentSchemePeriod = AssessmentScheme['period'];
type BranchPortraitRegion = BranchPortrait['region'];
type BranchPortraitRiskLevel = BranchPortrait['riskLevel'];
type IndicatorDataType = Indicator['dataType'];
type InspectionPlanType = InspectionPlan['type'];
type InspectionPlanFrequency = InspectionPlan['frequency'];
type InspectionEkpFlowStatus = NonNullable<InspectionPlan['ekpFlow']>['status'];
type ReportingTaskStatus = ReportingTask['status'];
type ScoringRuleEffect = ScoringRule['scoreEffect'];
type UnifiedTaskPriority = UnifiedTask['priority'];
type UnifiedTaskStatus = UnifiedTask['status'];

export {
  BUSINESS_LINES,
  EVIDENCE_TAGS,
  EXTENSION_STATUSES,
  INSPECTION_PHASES,
  INSPECTION_STATUSES,
  ISSUE_RECTIFICATION_STATUSES,
  ISSUE_STATUSES,
  MENU_MODES,
  RECTIFICATION_STATUSES,
  RISK_LEVELS,
  SUBMISSION_STATUSES,
  TASK_ACTION_TYPES,
  TASK_CATEGORIES,
  UNIFIED_TASK_PRIORITIES,
  UNIFIED_TASK_STATUSES,
  USER_LEVELS,
} from '../dictionaryMapper';

export const REPORTING_TASK_STATUSES = ['PENDING', 'SUBMITTED'] as const satisfies readonly ReportingTaskStatus[];

export const INSPECTION_PLAN_TYPES = [
  'ROUTINE_INSPECTION',
  'SPECIAL_INSPECTION',
  'DEPARTURE_AUDIT',
] as const satisfies readonly InspectionPlanType[];
export const INSPECTION_PLAN_FREQUENCIES = [
  'YEARLY',
  'HALF_YEARLY',
  'QUARTERLY',
  'AD_HOC',
] as const satisfies readonly InspectionPlanFrequency[];
export const INSPECTION_EKP_FLOW_STATUSES = ['审批中', '已通过', '已驳回'] as const satisfies readonly InspectionEkpFlowStatus[];
export const WORKING_PAPER_RESULTS = ['NO_ISSUE', 'DEFICIENCY', 'NOT_APPLICABLE', 'PENDING'] as const satisfies readonly WorkingPaperResult[];

export const BRANCH_PORTRAIT_REGIONS = ['华东', '华南', '华北', '华中', '西部'] as const satisfies readonly BranchPortraitRegion[];
export const BRANCH_PORTRAIT_RISK_LEVELS = ['SAFE', 'WARNING', 'CRITICAL'] as const satisfies readonly BranchPortraitRiskLevel[];

export const SCORING_RULE_EFFECTS = ['DEDUCTION', 'BONUS', 'DIRECT'] as const satisfies readonly ScoringRuleEffect[];
export const INDICATOR_DATA_TYPES = ['NUMBER', 'BOOLEAN', 'PERCENTAGE'] as const satisfies readonly IndicatorDataType[];
export const ASSESSMENT_SCHEME_PERIODS = ['2026_Q1', '2026_ANNUAL'] as const satisfies readonly AssessmentSchemePeriod[];
export const ASSESSMENT_SCHEME_STATUSES = ['DRAFT', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'ARCHIVED'] as const satisfies readonly AssessmentSchemeStatus[];
export const FILL_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'RECALLED'] as const satisfies readonly FillStatus[];

export const MOCK_ENUMS = {
  riskLevels: RISK_LEVELS,
  issueRectificationStatuses: ISSUE_RECTIFICATION_STATUSES,
  issueStatuses: ISSUE_STATUSES,
  businessLines: BUSINESS_LINES,
  userLevels: USER_LEVELS,
  menuModes: MENU_MODES,
  reportingTaskStatuses: REPORTING_TASK_STATUSES,
  inspectionPhases: INSPECTION_PHASES,
  inspectionStatuses: INSPECTION_STATUSES,
  inspectionPlanTypes: INSPECTION_PLAN_TYPES,
  inspectionPlanFrequencies: INSPECTION_PLAN_FREQUENCIES,
  inspectionEkpFlowStatuses: INSPECTION_EKP_FLOW_STATUSES,
  workingPaperResults: WORKING_PAPER_RESULTS,
  branchPortraitRegions: BRANCH_PORTRAIT_REGIONS,
  branchPortraitRiskLevels: BRANCH_PORTRAIT_RISK_LEVELS,
  scoringRuleEffects: SCORING_RULE_EFFECTS,
  indicatorDataTypes: INDICATOR_DATA_TYPES,
  assessmentSchemePeriods: ASSESSMENT_SCHEME_PERIODS,
  assessmentSchemeStatuses: ASSESSMENT_SCHEME_STATUSES,
  fillStatuses: FILL_STATUSES,
  taskCategories: TASK_CATEGORIES,
  taskActionTypes: TASK_ACTION_TYPES,
  unifiedTaskPriorities: UNIFIED_TASK_PRIORITIES,
  unifiedTaskStatuses: UNIFIED_TASK_STATUSES,
  submissionStatuses: SUBMISSION_STATUSES,
  evidenceTags: EVIDENCE_TAGS,
  rectificationStatuses: RECTIFICATION_STATUSES,
  extensionStatuses: EXTENSION_STATUSES,
} as const;
