/**
 * 外聘律师管理 React Query Hooks
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { externalCounselApi } from '@cases/services/api/externalCounselApi'
import type {
  ExternalLawyerCreateRequest,
  ExternalLawyerUpdateRequest,
} from '@cases/types/api/externalCounsel'

/**
 * 查询外聘律师列表
 */
export function useExternalLawyers(params?: {
  page?: number
  size?: number
  practiceArea?: string
  rating?: string
}) {
  return useQuery({
    queryKey: ['externalLawyers', params],
    queryFn: () => externalCounselApi.getLawyers(params),
  })
}

/**
 * 创建外聘律师
 */
export function useCreateExternalLawyer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: ExternalLawyerCreateRequest) =>
      externalCounselApi.createLawyer(data),
    onSuccess: () => {
      // 刷新律师列表
      queryClient.invalidateQueries({ queryKey: ['externalLawyers'] })
    },
  })
}

/**
 * 更新外聘律师
 */
export function useUpdateExternalLawyer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      lawyerId,
      data,
    }: {
      lawyerId: string
      data: ExternalLawyerUpdateRequest
    }) => externalCounselApi.updateLawyer(lawyerId, data),
    onSuccess: () => {
      // 刷新律师列表
      queryClient.invalidateQueries({ queryKey: ['externalLawyers'] })
    },
  })
}

/**
 * 删除外聘律师
 */
export function useDeleteExternalLawyer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (lawyerId: string) =>
      externalCounselApi.deleteLawyer(lawyerId),
    onSuccess: () => {
      // 刷新律师列表
      queryClient.invalidateQueries({ queryKey: ['externalLawyers'] })
    },
  })
}