/**
 * Parties API Service
 * Handles case party operations
 */

import { apiClient } from './client';
import { Party } from '../../types';

// Backend response type
interface PartyResponse {
  id: string;
  caseId: string;
  partyType: string; // 'PLAINTIFF', 'DEFENDANT', 'THIRD_PARTY'
  partyName: string;
  partyRole?: string;
  contactPerson?: string;
  contactPhone?: string;
  contactEmail?: string;
  address?: string;
  creditCode?: string;
  isBlacklisted: boolean;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Map backend party to frontend Party type
function mapParty(backendParty: PartyResponse): Party {
  return {
    id: backendParty.id,
    name: backendParty.partyName,
    type: backendParty.creditCode ? 'COMPANY' : 'INDIVIDUAL',
    isBlacklisted: backendParty.isBlacklisted,
    historyCaseCount: 0, // TODO: Calculate from backend
    creditCode: backendParty.creditCode
  };
}

export const partiesApi = {
  /**
   * Get parties for a case
   */
  async getCaseParties(caseId: string): Promise<Party[]> {
    const response: PartyResponse[] = await apiClient.get<PartyResponse[]>(
      `/cases/${caseId}/parties`
    );
    return response.map(mapParty);
  },

  /**
   * Add party to case
   */
  async addParty(
    caseId: string,
    partyData: {
      partyType: string;
      partyName: string;
      partyRole?: string;
      contactPerson?: string;
      contactPhone?: string;
      contactEmail?: string;
      creditCode?: string;
      isBlacklisted?: boolean;
      notes?: string;
    }
  ): Promise<Party> {
    const response: PartyResponse = await apiClient.post<PartyResponse>(
      `/cases/${caseId}/parties`,
      partyData
    );
    return mapParty(response);
  },

  /**
   * Update party
   */
  async updateParty(
    caseId: string,
    partyId: string,
    updates: Partial<PartyResponse>
  ): Promise<Party> {
    const response: PartyResponse = await apiClient.patch<PartyResponse>(
      `/cases/${caseId}/parties/${partyId}`,
      updates
    );
    return mapParty(response);
  },

  /**
   * Remove party from case
   */
  async removeParty(caseId: string, partyId: string): Promise<void> {
    await apiClient.delete(`/cases/${caseId}/parties/${partyId}`);
  }
};