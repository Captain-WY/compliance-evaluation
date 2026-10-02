/**
 * 案件成员管理 React Query Hooks
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { memberApi } from '@cases/services/api/memberApi'
import type { CaseMemberCreateRequest, CaseMemberUpdateRequest } from '@cases/types/api/member'

/**
 * 查询案件成员列表
 */
export function useMembers(caseId: string) {
  return useQuery({
    queryKey: ['members', caseId],
    queryFn: () => memberApi.getMembers(caseId),
    enabled: !!caseId,
  })
}

/**
 * 添加案件成员
 */
export function useAddMember() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      caseId,
      data,
    }: {
      caseId: string
      data: CaseMemberCreateRequest
    }) => memberApi.addMember(caseId, data),
    onSuccess: (_, variables) => {
      // 刷新成员列表
      queryClient.invalidateQueries({ queryKey: ['members', variables.caseId] })
    },
  })
}

/**
 * 更新案件成员
 */
export function useUpdateMember() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      memberId,
      data,
      caseId,
    }: {
      memberId: string
      data: CaseMemberUpdateRequest
      caseId: string
    }) => memberApi.updateMember(memberId, data),
    onSuccess: (_, variables) => {
      // 刷新成员列表
      queryClient.invalidateQueries({ queryKey: ['members', variables.caseId] })
    },
  })
}

/**
 * 移除案件成员
 */
export function useRemoveMember() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      memberId,
      caseId,
    }: {
      memberId: string
      caseId: string
    }) => memberApi.removeMember(memberId),
    onSuccess: (_, variables) => {
      // 刷新成员列表
      queryClient.invalidateQueries({ queryKey: ['members', variables.caseId] })
    },
  })
}