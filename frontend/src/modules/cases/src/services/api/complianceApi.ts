/**
 * 合规与报送管理 API
 */

import apiClient from './client'
import type {
  ComplianceAlertListResponse,
  ReportingTaskCreateRequest,
  ReportingTaskResponse,
  ReportingTaskListResponse,
} from '@cases/types/api/compliance'

export const complianceApi = {
  /**
   * 获取合规预警列表
   * GET /api/v1/compliance/alerts
   */
  getAlerts: async (
    params?: {
      page?: number
      size?: number
      status?: string
      alertType?: string
      alertLevel?: string
    }
  ): Promise<ComplianceAlertListResponse> => {
    const response = await apiClient.get<ComplianceAlertListResponse>(
      '/compliance/alerts',
      { params }
    )
    return response.data
  },

  /**
   * 获取报送任务列表
   * GET /api/v1/reporting/tasks
   */
  getReportingTasks: async (
    params?: {
      page?: number
      size?: number
      status?: string
      taskType?: string
    }
  ): Promise<ReportingTaskListResponse> => {
    const response = await apiClient.get<ReportingTaskListResponse>(
      '/reporting/tasks',
      { params }
    )
    return response.data
  },

  /**
   * 创建报送任务
   * POST /api/v1/reporting/tasks
   */
  createReportingTask: async (
    data: ReportingTaskCreateRequest
  ): Promise<ReportingTaskResponse> => {
    const response = await apiClient.post<ReportingTaskResponse>(
      '/reporting/tasks',
      data
    )
    return response.data
  },
}