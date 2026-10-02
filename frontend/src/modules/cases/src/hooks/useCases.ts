/**
 * 案件管理 React Query Hooks
 * 使用真实 API 调用
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { caseApi } from '@cases/services/api/caseApi'
import type { CaseListRequest, CaseCreateRequest, CaseUpdateRequest } from '@cases/types/api/case'

/**
 * 查询案件列表
 */
export function useCases(params: CaseListRequest) {
  return useQuery({
    queryKey: ['cases', params],
    queryFn: () => caseApi.getCases(params),
    staleTime: 5 * 60 * 1000, // 5 分钟内数据视为新鲜
    gcTime: 10 * 60 * 1000,   // 10 分钟后清理缓存
  })
}

/**
 * 查询案件详情
 */
export function useCaseDetail(id: string) {
  return useQuery({
    queryKey: ['case', id],
    queryFn: () => caseApi.getCaseById(id),
    enabled: !!id, // id 存在时才执行
  })
}

/**
 * 创建案件
 */
export function useCreateCase() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: caseApi.createCase,
    onSuccess: () => {
      // 使案件列表缓存失效
      queryClient.invalidateQueries({ queryKey: ['cases'] })
    },
  })
}

/**
 * 更新案件
 */
export function useUpdateCase() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: CaseUpdateRequest }) =>
      caseApi.updateCase(id, data),
    onSuccess: (_, variables) => {
      // 更新案件详情缓存
      queryClient.invalidateQueries({ queryKey: ['case', variables.id] })
      // 使案件列表缓存失效
      queryClient.invalidateQueries({ queryKey: ['cases'] })
    },
  })
}

/**
 * 删除案件
 */
export function useDeleteCase() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: caseApi.deleteCase,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cases'] })
    },
  })
}

/**
 * 更新案件阶段
 */
export function useUpdateCaseStage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, stageCode }: { id: string; stageCode: string }) =>
      caseApi.updateCaseStage(id, stageCode),
    onSuccess: (_, variables) => {
      // 更新案件详情缓存
      queryClient.invalidateQueries({ queryKey: ['case', variables.id] })
      // 使案件列表缓存失效
      queryClient.invalidateQueries({ queryKey: ['cases'] })
    },
  })
}