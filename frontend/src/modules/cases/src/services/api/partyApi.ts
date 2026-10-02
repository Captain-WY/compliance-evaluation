/**
 * 当事人管理 API
 */

import apiClient from './client'
import type {
  PartyCreateRequest,
  PartyUpdateRequest,
  PartyResponse,
} from '@cases/types/api/party'

// BFF 基础路径：从 /api/v1 的 baseURL 中提取 origin，拼接 /api/bff/v1
const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/api\/v1\/?$/, '')
const BFF_BASE = `${API_ORIGIN}/api/bff/v1`

export const partyApi = {
  /**
   * 获取案件当事人列表
   * POST /api/bff/v1/cases/parties/list
   */
  getParties: async (caseId: string): Promise<PartyResponse[]> => {
    const response = await apiClient.post<{
      code: number
      message: string
      data: { parties: PartyResponse[] }
    }>(`${BFF_BASE}/cases/parties/list`, { case_id: caseId })
    return response.data?.data?.parties ?? []
  },

  /**
   * 创建当事人
   * POST /api/bff/v1/cases/parties/add
   */
  createParty: async (caseId: string, data: PartyCreateRequest): Promise<PartyResponse> => {
    const response = await apiClient.post<{
      code: number
      message: string
      data: PartyResponse
    }>(`${BFF_BASE}/cases/parties/add`, data)
    return response.data?.data
  },

  /**
   * 更新当事人
   * POST /api/bff/v1/cases/parties/update
   */
  updateParty: async (partyId: string, data: PartyUpdateRequest): Promise<PartyResponse> => {
    const response = await apiClient.post<{
      code: number
      message: string
      data: PartyResponse
    }>(`${BFF_BASE}/cases/parties/update`, { party_id: partyId, patch: data })
    return response.data?.data
  },

  /**
   * 删除当事人
   * POST /api/bff/v1/cases/parties/remove
   */
  deleteParty: async (partyId: string): Promise<void> => {
    await apiClient.post(`${BFF_BASE}/cases/parties/remove`, { party_id: partyId })
  },
}
