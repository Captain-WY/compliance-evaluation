/**
 * Cases API Service
 * Handles all case-related operations
 */

import { apiClient } from './client';
import {
  Case,
  CaseStage,
  RiskLevel,
  BusinessLine,
  CaseType,
  CaseRole,
  ProcedureType,
  IssueType
} from '../../types';

// Backend response types (will be auto-converted to camelCase by API client)
interface CaseResponse {
  id: string;
  tenantId: string;
  internalCaseNo: string;
  externalCaseNo?: string;
  caseName: string;
  caseTypeCode: string;
  caseSource?: string;
  businessLine?: string;
  caseCause?: string;
  riskLevel?: string;
  ourRole?: string;
  plaintiffName?: string;
  defendantName?: string;
  targetAmount?: number;
  provisionAmount?: number;
  targetSubject?: string;
  acceptingCourt?: string;
  presidingJudge?: string;
  judgeContact?: string;
  handlingLawyerId?: string;
  isMainCase: boolean;
  mainCaseId?: string;
  disputeId: string;
  previousInstanceId?: string;
  procedureType?: string;
  currentStageCode?: string;
  caseStatus: string;
  latestProgress?: string;
  filingDate?: string;
  closeDate?: string;
  archiveNo?: string;
  isDeleted: boolean;
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
}

interface PaginatedCasesResponse {
  total: number;
  page: number;
  size: number;
  items: CaseResponse[];
}

interface CaseFilters {
  caseStatus?: string;
  caseTypeCode?: string;
}

// Map backend case to frontend Case type
function mapCase(backendCase: CaseResponse): Case {
  // Map business line — codes must match backend sys_dicts (BUSINESS_LINE type)
  const businessLineMap: Record<string, BusinessLine> = {
    // English codes from backend dict
    'IB': BusinessLine.IB,
    'INVESTMENT_BANKING': BusinessLine.IB,
    'PROPRIETARY': BusinessLine.PROPRIETARY,
    'PROP_TRADING': BusinessLine.PROPRIETARY,
    'BROKERAGE': BusinessLine.BROKERAGE,
    'ASSET_MGMT': BusinessLine.ASSET_MGMT,
    'ASSET_MANAGEMENT': BusinessLine.ASSET_MGMT,
    'CREDIT': BusinessLine.CREDIT,
    'SUPPORT': BusinessLine.SUPPORT,
    'WEALTH_MGMT': BusinessLine.WEALTH_MGMT,
    'WEALTH_MANAGEMENT': BusinessLine.WEALTH_MGMT,
    'RESEARCH': BusinessLine.RESEARCH,
    'CUSTODY': BusinessLine.CUSTODY,
    'DERIVATIVES': BusinessLine.DERIVATIVES,
    'INTERNATIONAL': BusinessLine.INTERNATIONAL,
    'OTHER_LINE': BusinessLine.OTHER,
    // Chinese labels (fallback)
    '投资银行': BusinessLine.IB,
    '自营投资': BusinessLine.PROPRIETARY,
    '经纪业务': BusinessLine.BROKERAGE,
    '资产管理': BusinessLine.ASSET_MGMT,
    '信用业务': BusinessLine.CREDIT,
    '职能支持': BusinessLine.SUPPORT,
    '财富管理': BusinessLine.WEALTH_MGMT,
    '研究所': BusinessLine.RESEARCH,
    '托管业务': BusinessLine.CUSTODY,
    '衍生品业务': BusinessLine.DERIVATIVES,
    '国际业务': BusinessLine.INTERNATIONAL,
    '其他': BusinessLine.OTHER
  };

  // Map risk level
  const riskLevelMap: Record<string, RiskLevel> = {
    'LOW': RiskLevel.LOW,
    'MEDIUM': RiskLevel.MEDIUM,
    'HIGH': RiskLevel.HIGH,
    'CRITICAL': RiskLevel.CRITICAL,
    '一般': RiskLevel.LOW,
    '关注': RiskLevel.MEDIUM,
    '重大': RiskLevel.HIGH,
    '特大': RiskLevel.CRITICAL
  };

  // Map case stage
  const stageMap: Record<string, CaseStage> = {
    'CLUE': CaseStage.CLUE,
    'FILING': CaseStage.FILING,
    'FIRST_INSTANCE': CaseStage.FIRST_INSTANCE,
    'SECOND_INSTANCE': CaseStage.SECOND_INSTANCE,
    'ENFORCEMENT': CaseStage.ENFORCEMENT,
    'CLOSED': CaseStage.CLOSED,
    '线索': CaseStage.CLUE,
    '立案': CaseStage.FILING,
    '一审': CaseStage.FIRST_INSTANCE,
    '二审': CaseStage.SECOND_INSTANCE,
    '执行': CaseStage.ENFORCEMENT,
    '已结案': CaseStage.CLOSED
  };

  // Map our role
  const roleMap: Record<string, CaseRole> = {
    'PLAINTIFF': CaseRole.PLAINTIFF,
    'DEFENDANT': CaseRole.DEFENDANT,
    'THIRD_PARTY': CaseRole.THIRD_PARTY,
    '原告/申请人': CaseRole.PLAINTIFF,
    '被告/被申请人': CaseRole.DEFENDANT,
    '第三人': CaseRole.THIRD_PARTY
  };

  // Map procedure type
  const procedureMap: Record<string, ProcedureType> = {
    'CIVIL_LITIGATION': 'CIVIL_LITIGATION',
    'ARBITRATION': 'ARBITRATION',
    'LABOR': 'LABOR',
    'ADMIN': 'ADMIN'
  };

  return {
    id: backendCase.id,
    key: backendCase.internalCaseNo,
    code: backendCase.internalCaseNo,
    title: backendCase.caseName,
    issueType: IssueType.CASE,
    status: backendCase.caseStatus,
    stage: stageMap[backendCase.currentStageCode || ''] || CaseStage.FILING,
    procedureType: procedureMap[backendCase.procedureType || ''] || 'CIVIL_LITIGATION',
    businessLine: businessLineMap[backendCase.businessLine || ''] || BusinessLine.IB,
    ourRole: roleMap[backendCase.ourRole || ''] || CaseRole.PLAINTIFF,
    cause: backendCase.caseCause || '',
    riskLevel: riskLevelMap[backendCase.riskLevel || ''] || RiskLevel.LOW,
    plaintiff: backendCase.plaintiffName || '',
    defendant: backendCase.defendantName || '',
    court: backendCase.acceptingCourt || '',
    filingDate: backendCase.filingDate || '',
    createdAt: backendCase.createdAt || '',
    caseType: backendCase.isMainCase ? CaseType.SERIES_MASTER : CaseType.STANDARD,
    externalCaseNo: backendCase.externalCaseNo,
    targetSubject: backendCase.targetSubject,
    judge: backendCase.presidingJudge ? {
      name: backendCase.presidingJudge,
      phone: backendCase.judgeContact
    } : undefined,
    provisionAmount: backendCase.provisionAmount,
    lawyerId: backendCase.handlingLawyerId,
    parentId: backendCase.mainCaseId,
    description: backendCase.latestProgress
  };
}

export const casesApi = {
  /**
   * Get paginated list of cases
   */
  async getCases(
    page: number = 1,
    size: number = 20,
    filters?: CaseFilters
  ): Promise<{ total: number; items: Case[] }> {
    const params: Record<string, string | number> = { page, size };

    if (filters?.caseStatus) {
      params.case_status = filters.caseStatus;
    }
    if (filters?.caseTypeCode) {
      params.case_type_code = filters.caseTypeCode;
    }

    const response: PaginatedCasesResponse = await apiClient.get<PaginatedCasesResponse>(
      '/cases',
      params
    );

    return {
      total: response.total,
      items: response.items.map(mapCase)
    };
  },

  /**
   * Get case by ID
   */
  async getCase(caseId: string): Promise<Case> {
    const response: CaseResponse = await apiClient.get<CaseResponse>(`/cases/${caseId}`);
    return mapCase(response);
  },

  /**
   * Create new case
   */
  async createCase(caseData: Partial<Case>): Promise<Case> {
    // Map frontend Case to backend format
    const backendData = {
      internal_case_no: caseData.code || `CASE-${Date.now()}`,
      case_name: caseData.title || '',
      case_type_code: 'STANDARD',
      tenant_id: 'default-tenant', // TODO: Get from current user
      dispute_id: `DISPUTE-${Date.now()}`, // TODO: Handle disputes properly
      business_line: caseData.businessLine,
      case_cause: caseData.cause,
      risk_level: caseData.riskLevel,
      our_role: caseData.ourRole,
      plaintiff_name: caseData.plaintiff,
      defendant_name: caseData.defendant,
      target_amount: caseData.targetAmount,
      accepting_court: caseData.court,
      filing_date: caseData.filingDate,
      current_stage_code: caseData.stage,
      case_status: caseData.status || 'PENDING',
      procedure_type: caseData.procedureType
    };

    const response: CaseResponse = await apiClient.post<CaseResponse>('/cases', backendData);
    return mapCase(response);
  },

  /**
   * Update case
   */
  async updateCase(caseId: string, updates: Partial<Case>): Promise<Case> {
    // Map updates to backend format
    const backendUpdates: any = {};

    if (updates.title) backendUpdates.case_name = updates.title;
    if (updates.businessLine) backendUpdates.business_line = updates.businessLine;
    if (updates.cause) backendUpdates.case_cause = updates.cause;
    if (updates.riskLevel) backendUpdates.risk_level = updates.riskLevel;
    if (updates.ourRole) backendUpdates.our_role = updates.ourRole;
    if (updates.plaintiff) backendUpdates.plaintiff_name = updates.plaintiff;
    if (updates.defendant) backendUpdates.defendant_name = updates.defendant;
    if (updates.court) backendUpdates.accepting_court = updates.court;
    if (updates.stage) backendUpdates.current_stage_code = updates.stage;
    if (updates.status) backendUpdates.case_status = updates.status;
    if (updates.filingDate) backendUpdates.filing_date = updates.filingDate;

    const response: CaseResponse = await apiClient.patch<CaseResponse>(
      `/cases/${caseId}`,
      backendUpdates
    );
    return mapCase(response);
  },

  /**
   * Delete case (soft delete)
   */
  async deleteCase(caseId: string): Promise<void> {
    await apiClient.delete(`/cases/${caseId}`);
  }
};