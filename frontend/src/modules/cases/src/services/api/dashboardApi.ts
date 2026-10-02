/**
 * 工作台仪表盘 API
 */

import apiClient from './client'
import type { DashboardOverviewResponse } from '@cases/types/api/dashboard'

export const dashboardApi = {
  /**
   * 获取工作台总览数据
   * GET /api/v1/dashboard/overview
   */
  getOverview: async (): Promise<DashboardOverviewResponse> => {
    const response = await apiClient.get<DashboardOverviewResponse>(
      '/dashboard/overview'
    )
    return response.data
  },

  /**
   * 获取案件统计数据
   * GET /api/v1/dashboard/cases/statistics
   */
  getCaseStatistics: async (): Promise<DashboardOverviewResponse['caseStatistics']> => {
    const response = await apiClient.get('/dashboard/cases/statistics')
    return response.data
  },

  /**
   * 获取财务统计数据
   * GET /api/v1/dashboard/finance/statistics
   */
  getFinanceStatistics: async (): Promise<DashboardOverviewResponse['financeStatistics']> => {
    const response = await apiClient.get('/dashboard/finance/statistics')
    return response.data
  },

  /**
   * 获取任务统计数据
   * GET /api/v1/dashboard/tasks/statistics
   */
  getTaskStatistics: async (): Promise<DashboardOverviewResponse['taskStatistics']> => {
    const response = await apiClient.get('/dashboard/tasks/statistics')
    return response.data
  },
}