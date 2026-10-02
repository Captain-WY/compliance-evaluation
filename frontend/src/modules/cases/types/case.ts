import { Case, Clue, EvidenceTask, IssueType, CaseStage, RiskLevel, BusinessLine, ProcedureType } from '../types';
import { PaginatedRequest } from './api';

// ============================================================================
// Request DTOs
// ============================================================================

export interface CaseListReqDTO extends PaginatedRequest {
  type?: IssueType | 'ALL';
  risk?: RiskLevel | 'ALL';
  stage?: CaseStage | 'ALL';
  owner?: 'ME' | 'ALL';
  businessLine?: BusinessLine | 'ALL';
  procedure?: ProcedureType | 'ALL';
  dateStart?: string;
  dateEnd?: string;
  showMasterOnly?: boolean;
  keyword?: string;
}

export interface QuickUpdateReqDTO {
  id: string;
  type: IssueType;
  updates: {
    stage?: CaseStage;
    riskLevel?: RiskLevel;
    summary?: string;
  };
}

// ============================================================================
// Response VOs (View Objects)
// ============================================================================

// The unified item type returned by the list/kanban/calendar views
export type CaseListItemVO = Case | Clue | EvidenceTask;

export type DrawerItemType = 'CASE' | 'CLUE' | 'EXECUTABLE_TASK';

export interface BaseDrawerVO {
  id: string;
  key: string;
  title: string;
  itemType: DrawerItemType;
  assignee?: string;
  recentActivities: {
    id: string;
    action: string;
    timestamp: string;
    operator: string;
  }[];
}

export interface CaseDrawerVO extends BaseDrawerVO {
  itemType: 'CASE';
  code: string;
  caseType: string;
  stage: string;
  riskLevel: string;
  riskLevelCode?: string;
  amount: number;
  court?: string;
  cause?: string;
  businessLine?: string;
  filingDate?: string;
  deadline?: string;
  nextDeadline?: string;
  description?: string;
  regulatoryAttrs?: {
    amountNoInterest: number;
    amountWithInterest: number;
    regCaseCode: string;
    regCauseName: string;
    securityCode?: string;
    securityName?: string;
    sector?: string;
    isInvestorProtection: boolean;
    isMajor: boolean;
  };
  summaryDetail?: {
    background?: string;
    disputeFocus?: string;
    riskAssessment?: string;
    amountText?: string;
  };
}

export interface ClueDrawerVO extends BaseDrawerVO {
  itemType: 'CLUE';
  status: string;
  content: string;
  source?: string;
  reporter: string;
  reportDate: string;
  attachments: any[];
  cleanedAmount?: number;
  cleanedPlaintiff?: string;
  riskLevel?: RiskLevel;
}

export interface TaskDrawerVO extends BaseDrawerVO {
  itemType: 'EXECUTABLE_TASK';
  status: string;
  deadline: string;
  description: string;
  attachments: any[];
  caseTitle?: string;
  assigneeDept?: string;
  creator?: string;
}

export type CaseSummaryDrawerVO = CaseDrawerVO | ClueDrawerVO | TaskDrawerVO;
