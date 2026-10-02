/**
 * 工作台仪表盘 React Query Hooks
 */

import { useQuery } from '@tanstack/react-query'
import { dashboardApi } from '@cases/services/api/dashboardApi'

/**
 * 查询工作台总览数据
 */
export function useDashboardOverview() {
  return useQuery({
    queryKey: ['dashboardOverview'],
    queryFn: () => dashboardApi.getOverview(),
    staleTime: 5 * 60 * 1000, // 5分钟内不重新请求
  })
}

/**
 * 查询案件统计数据
 */
export function useCaseStatistics() {
  return useQuery({
    queryKey: ['caseStatistics'],
    queryFn: () => dashboardApi.getCaseStatistics(),
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * 查询财务统计数据
 */
export function useFinanceStatistics() {
  return useQuery({
    queryKey: ['financeStatistics'],
    queryFn: () => dashboardApi.getFinanceStatistics(),
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * 查询任务统计数据
 */
export function useTaskStatistics() {
  return useQuery({
    queryKey: ['taskStatistics'],
    queryFn: () => dashboardApi.getTaskStatistics(),
    staleTime: 5 * 60 * 1000,
  })
}