/**
 * 当事人管理 React Query Hooks
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { partyApi } from '@cases/services/api/partyApi'
import type { PartyCreateRequest, PartyUpdateRequest } from '@cases/types/api/party'

/**
 * 查询案件当事人列表
 */
export function useParties(caseId: string) {
  return useQuery({
    queryKey: ['parties', caseId],
    queryFn: () => partyApi.getParties(caseId),
    enabled: !!caseId,
  })
}

/**
 * 创建当事人
 */
export function useCreateParty() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ caseId, data }: { caseId: string; data: PartyCreateRequest }) =>
      partyApi.createParty(caseId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['parties', variables.caseId] })
    },
  })
}

/**
 * 更新当事人
 */
export function useUpdateParty() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ partyId, data }: { partyId: string; data: PartyUpdateRequest }) =>
      partyApi.updateParty(partyId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parties'] })
    },
  })
}

/**
 * 删除当事人
 */
export function useDeleteParty() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: partyApi.deleteParty,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parties'] })
    },
  })
}