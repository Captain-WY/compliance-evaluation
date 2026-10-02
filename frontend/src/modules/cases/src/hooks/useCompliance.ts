/**
 * 合规与报送管理 React Query Hooks
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { complianceApi } from '@cases/services/api/complianceApi'
import type { ReportingTaskCreateRequest } from '@cases/types/api/compliance'

/**
 * 查询合规预警列表
 */
export function useComplianceAlerts(params?: {
  page?: number
  size?: number
  status?: string
  alertType?: string
  alertLevel?: string
}) {
  return useQuery({
    queryKey: ['complianceAlerts', params],
    queryFn: () => complianceApi.getAlerts(params),
  })
}

/**
 * 查询报送任务列表
 */
export function useReportingTasks(params?: {
  page?: number
  size?: number
  status?: string
  taskType?: string
}) {
  return useQuery({
    queryKey: ['reportingTasks', params],
    queryFn: () => complianceApi.getReportingTasks(params),
  })
}

/**
 * 创建报送任务
 */
export function useCreateReportingTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: ReportingTaskCreateRequest) =>
      complianceApi.createReportingTask(data),
    onSuccess: () => {
      // 刷新报送任务列表
      queryClient.invalidateQueries({ queryKey: ['reportingTasks'] })
    },
  })
}