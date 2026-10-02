/**
 * 外聘律师管理 API
 */

import apiClient from './client'
import type {
  ExternalLawyerCreateRequest,
  ExternalLawyerUpdateRequest,
  ExternalLawyerResponse,
  ExternalLawyerListResponse,
} from '@cases/types/api/externalCounsel'

export const externalCounselApi = {
  /**
   * 获取外聘律师列表
   * GET /api/v1/external-lawyers
   */
  getLawyers: async (
    params?: {
      page?: number
      size?: number
      practiceArea?: string
      rating?: string
    }
  ): Promise<ExternalLawyerListResponse> => {
    const response = await apiClient.get<ExternalLawyerListResponse>(
      '/external-lawyers',
      { params }
    )
    return response.data
  },

  /**
   * 创建外聘律师
   * POST /api/v1/external-lawyers
   */
  createLawyer: async (
    data: ExternalLawyerCreateRequest
  ): Promise<ExternalLawyerResponse> => {
    const response = await apiClient.post<ExternalLawyerResponse>(
      '/external-lawyers',
      data
    )
    return response.data
  },

  /**
   * 更新外聘律师
   * PUT /api/v1/external-lawyers/{lawyer_id}
   */
  updateLawyer: async (
    lawyerId: string,
    data: ExternalLawyerUpdateRequest
  ): Promise<ExternalLawyerResponse> => {
    const response = await apiClient.put<ExternalLawyerResponse>(
      `/external-lawyers/${lawyerId}`,
      data
    )
    return response.data
  },

  /**
   * 删除外聘律师
   * DELETE /api/v1/external-lawyers/{lawyer_id}
   */
  deleteLawyer: async (lawyerId: string): Promise<void> => {
    await apiClient.delete(`/external-lawyers/${lawyerId}`)
  },
}