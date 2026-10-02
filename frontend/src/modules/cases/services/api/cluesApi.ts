/**
 * Clues API Service
 * Handles investigation clue operations
 */

import { apiClient } from './client';
import { Clue, RiskLevel, CaseStage, IssueType } from '../../types';

// Backend response types
interface ClueResponse {
  id: string;
  clueCode: string;
  clueSource: string;
  reporterName?: string;
  reportDate: string;
  clueContent: string;
  cleanedPlaintiff?: string;
  cleanedDefendant?: string;
  cleanedAmount?: number;
  riskLevel?: string;
  currentStage?: string;
  status: string; // 'PENDING', 'INVESTIGATING', 'CONVERTED', 'CLOSED'
  convertedCaseId?: string;
  convertedCaseCode?: string;
  attachedFiles?: string[];
  notes?: string;
  handlerId?: string;
  handlerName?: string;
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
}

// Map backend clue to frontend Clue
function mapClue(backendClue: ClueResponse): Clue {
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

  // Map stage
  const stageMap: Record<string, CaseStage> = {
    'CLUE': CaseStage.CLUE,
    'FILING': CaseStage.FILING,
    '线索': CaseStage.CLUE,
    '立案': CaseStage.FILING
  };

  return {
    id: backendClue.id,
    key: backendClue.clueCode,
    title: backendClue.clueContent.substring(0, 100),
    issueType: IssueType.CLUE,
    status: backendClue.status,
    source: backendClue.clueSource,
    reporter: backendClue.reporterName || '',
    reportDate: backendClue.reportDate,
    content: backendClue.clueContent,
    cleanedPlaintiff: backendClue.cleanedPlaintiff,
    cleanedDefendant: backendClue.cleanedDefendant,
    cleanedAmount: backendClue.cleanedAmount,
    riskLevel: riskLevelMap[backendClue.riskLevel || ''] || RiskLevel.LOW,
    stage: stageMap[backendClue.currentStage || ''] || CaseStage.CLUE,
    attachedFiles: backendClue.attachedFiles,
    createdAt: backendClue.createdAt
  };
}

export const cluesApi = {
  /**
   * Get paginated list of clues
   */
  async getClues(
    page: number = 1,
    size: number = 20,
    filters?: {
      status?: string;
      riskLevel?: string;
      clueSource?: string;
    }
  ): Promise<{ total: number; items: Clue[] }> {
    const params: Record<string, string | number> = { page, size };

    if (filters?.status) params.status = filters.status;
    if (filters?.riskLevel) params.risk_level = filters.riskLevel;
    if (filters?.clueSource) params.clue_source = filters.clueSource;

    const response: {
      total: number;
      page: number;
      size: number;
      items: ClueResponse[];
    } = await apiClient.get('/clues', params);

    return {
      total: response.total,
      items: response.items.map(mapClue)
    };
  },

  /**
   * Get clue by ID
   */
  async getClue(clueId: string): Promise<Clue> {
    const response: ClueResponse = await apiClient.get<ClueResponse>(`/clues/${clueId}`);
    return mapClue(response);
  },

  /**
   * Create new clue
   */
  async createClue(clueData: {
    clueSource: string;
    reporterName?: string;
    reportDate: string;
    clueContent: string;
    cleanedPlaintiff?: string;
    cleanedDefendant?: string;
    cleanedAmount?: number;
    riskLevel?: string;
    attachedFiles?: string[];
    notes?: string;
  }): Promise<Clue> {
    const response: ClueResponse = await apiClient.post<ClueResponse>('/clues', {
      clue_code: `CLUE-${Date.now()}`,
      status: 'PENDING',
      ...clueData
    });
    return mapClue(response);
  },

  /**
   * Update clue
   */
  async updateClue(
    clueId: string,
    updates: Partial<{
      clueContent: string;
      cleanedPlaintiff: string;
      cleanedDefendant: string;
      cleanedAmount: number;
      riskLevel: string;
      currentStage: string;
      status: string;
      notes: string;
    }>
  ): Promise<Clue> {
    const response: ClueResponse = await apiClient.patch<ClueResponse>(
      `/clues/${clueId}`,
      updates
    );
    return mapClue(response);
  },

  /**
   * Convert clue to case
   */
  async convertToCase(clueId: string, caseData: {
    caseName: string;
    caseTypeCode: string;
    businessLine?: string;
    caseCause?: string;
  }): Promise<{ caseId: string; caseCode: string }> {
    const response: { caseId: string; caseCode: string } = await apiClient.post(
      `/clues/${clueId}/convert`,
      caseData
    );
    return response;
  },

  /**
   * Delete clue
   */
  async deleteClue(clueId: string): Promise<void> {
    await apiClient.delete(`/clues/${clueId}`);
  }
};