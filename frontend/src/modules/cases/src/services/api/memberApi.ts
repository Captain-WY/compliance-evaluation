/**
 * 案件成员管理 API
 */

import apiClient from './client'
import type {
  CaseMemberCreateRequest,
  CaseMemberUpdateRequest,
  CaseMemberResponse,
  CaseMemberListResponse,
} from '@cases/types/api/member'

export const memberApi = {
  /**
   * 获取案件成员列表
   * GET /api/v1/cases/{case_id}/members
   */
  getMembers: async (caseId: string): Promise<CaseMemberListResponse> => {
    const response = await apiClient.get<CaseMemberListResponse>(
      `/cases/${caseId}/members`
    )
    return response.data
  },

  /**
   * 添加案件成员
   * POST /api/v1/cases/{case_id}/members
   */
  addMember: async (
    caseId: string,
    data: CaseMemberCreateRequest
  ): Promise<CaseMemberResponse> => {
    const response = await apiClient.post<CaseMemberResponse>(
      `/cases/${caseId}/members`,
      data
    )
    return response.data
  },

  /**
   * 更新案件成员
   * PUT /api/v1/members/{member_id}
   */
  updateMember: async (
    memberId: string,
    data: CaseMemberUpdateRequest
  ): Promise<CaseMemberResponse> => {
    const response = await apiClient.put<CaseMemberResponse>(
      `/members/${memberId}`,
      data
    )
    return response.data
  },

  /**
   * 移除案件成员
   * DELETE /api/v1/members/{member_id}
   */
  removeMember: async (memberId: string): Promise<void> => {
    await apiClient.delete(`/members/${memberId}`)
  },
}