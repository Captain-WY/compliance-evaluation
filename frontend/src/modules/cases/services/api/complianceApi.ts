/**
 * Compliance API Service
 * Handles compliance alerts and reporting tasks
 */

import { apiClient } from './client';
import { DisclosureTask, RiskLevel } from '../../types';

// Backend response types
interface ComplianceAlertResponse {
  id: string;
  caseId?: string;
  caseCode?: string;
  caseName?: string;
  alertType: string;
  alertReason: string;
  detectedAt: string;
  deadline?: string;
  status: string; // 'PENDING', 'PROCESSING', 'DONE', 'IGNORED'
  riskLevel: string;
  relatedRuleId?: string;
  handlerId?: string;
  handlerName?: string;
  handledAt?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface ReportingTaskResponse {
  id: string;
  definitionId: string;
  definitionName: string;
  cycle: string;
  status: string; // 'DRAFT', 'REVIEWING', 'APPROVED', 'SUBMITTED', 'REJECTED'
  deadline: string;
  caseCount: number;
  totalAmount: number;
  creatorId: string;
  creatorName: string;
  createTime: string;
  submitTime?: string;
  snapshotId?: string;
  generatedFileUrl?: string;
  reviewerId?: string;
  reviewerName?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Map backend alert to frontend DisclosureTask
function mapAlert(backendAlert: ComplianceAlertResponse): DisclosureTask {
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

  return {
    id: backendAlert.id,
    caseId: backendAlert.caseId,
    caseCode: backendAlert.caseCode,
    caseTitle: backendAlert.caseName || '',
    triggerType: backendAlert.alertType as any,
    triggerReason: backendAlert.alertReason,
    detectedAt: backendAlert.detectedAt,
    deadline: backendAlert.deadline || '',
    status: backendAlert.status as any,
    riskLevel: riskLevelMap[backendAlert.riskLevel] || RiskLevel.MEDIUM,
    relatedRuleId: backendAlert.relatedRuleId
  };
}

export const complianceApi = {
  /**
   * Get compliance alerts
   */
  async getAlerts(filters?: {
    status?: string;
    alertType?: string;
    caseId?: string;
  }): Promise<DisclosureTask[]> {
    const params: Record<string, string> = {};
    if (filters?.status) params.status = filters.status;
    if (filters?.alertType) params.alert_type = filters.alertType;
    if (filters?.caseId) params.case_id = filters.caseId;

    const response: ComplianceAlertResponse[] = await apiClient.get<ComplianceAlertResponse[]>(
      '/compliance/alerts',
      params
    );
    return response.map(mapAlert);
  },

  /**
   * Update alert status
   */
  async updateAlertStatus(
    alertId: string,
    status: string,
    notes?: string
  ): Promise<DisclosureTask> {
    const response: ComplianceAlertResponse = await apiClient.patch<ComplianceAlertResponse>(
      `/compliance/alerts/${alertId}`,
      { status, notes }
    );
    return mapAlert(response);
  },

  /**
   * Get reporting tasks
   */
  async getReportingTasks(filters?: {
    status?: string;
    definitionId?: string;
  }): Promise<ReportingTaskResponse[]> {
    const params: Record<string, string> = {};
    if (filters?.status) params.status = filters.status;
    if (filters?.definitionId) params.definition_id = filters.definitionId;

    const response: ReportingTaskResponse[] = await apiClient.get<ReportingTaskResponse[]>(
      '/reporting/tasks',
      params
    );
    return response;
  },

  /**
   * Create reporting task
   */
  async createReportingTask(taskData: {
    definitionId: string;
    cycle: string;
    deadline: string;
    notes?: string;
  }): Promise<ReportingTaskResponse> {
    const response: ReportingTaskResponse = await apiClient.post<ReportingTaskResponse>(
      '/reporting/tasks',
      taskData
    );
    return response;
  },

  /**
   * Update reporting task status
   */
  async updateReportingTaskStatus(
    taskId: string,
    status: string,
    notes?: string
  ): Promise<ReportingTaskResponse> {
    const response: ReportingTaskResponse = await apiClient.patch<ReportingTaskResponse>(
      `/reporting/tasks/${taskId}`,
      { status, notes }
    );
    return response;
  }
};