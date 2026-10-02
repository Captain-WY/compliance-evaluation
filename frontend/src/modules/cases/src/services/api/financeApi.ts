/**
 * 财务管理 API
 */

import apiClient from './client'
import type {
  TransactionCreateRequest,
  TransactionResponse,
  CaseBudgetResponse,
  BusinessLineBudgetResponse,
  PaginatedResponse,
} from '@cases/types/api/finance'

export const financeApi = {
  /**
   * 获取案件财务流水列表
   * GET /api/v1/cases/{case_id}/transactions
   */
  getTransactions: async (
    caseId: string,
    params?: { page?: number; size?: number }
  ): Promise<PaginatedResponse<TransactionResponse>> => {
    const response = await apiClient.get<PaginatedResponse<TransactionResponse>>(
      `/cases/${caseId}/transactions`,
      { params }
    )
    return response.data
  },

  /**
   * 创建财务流水
   * POST /api/v1/cases/{case_id}/transactions
   */
  createTransaction: async (
    caseId: string,
    data: TransactionCreateRequest
  ): Promise<TransactionResponse> => {
    const response = await apiClient.post<TransactionResponse>(
      `/cases/${caseId}/transactions`,
      data
    )
    return response.data
  },

  /**
   * 获取案件预算
   * GET /api/v1/cases/{case_id}/budget
   */
  getCaseBudget: async (caseId: string): Promise<CaseBudgetResponse> => {
    const response = await apiClient.get<CaseBudgetResponse>(`/cases/${caseId}/budget`)
    return response.data
  },

  /**
   * 获取业务线预算列表
   * GET /api/v1/budgets/business-lines
   */
  getBusinessLineBudgets: async (): Promise<BusinessLineBudgetResponse[]> => {
    const response = await apiClient.get<BusinessLineBudgetResponse[]>('/budgets/business-lines')
    return response.data
  },
}