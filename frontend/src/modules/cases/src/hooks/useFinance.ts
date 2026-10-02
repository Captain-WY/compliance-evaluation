/**
 * 财务管理 React Query Hooks
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { financeApi } from '@cases/services/api/financeApi'
import type { TransactionCreateRequest } from '@cases/types/api/finance'

/**
 * 查询案件财务流水列表
 */
export function useTransactions(caseId: string, page = 1, size = 20) {
  return useQuery({
    queryKey: ['transactions', caseId, page, size],
    queryFn: () => financeApi.getTransactions(caseId, { page, size }),
    enabled: !!caseId,
  })
}

/**
 * 创建财务流水
 */
export function useCreateTransaction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ caseId, data }: { caseId: string; data: TransactionCreateRequest }) =>
      financeApi.createTransaction(caseId, data),
    onSuccess: (_, variables) => {
      // 刷新财务流水列表
      queryClient.invalidateQueries({ queryKey: ['transactions', variables.caseId] })
      // 刷新案件预算
      queryClient.invalidateQueries({ queryKey: ['caseBudget', variables.caseId] })
    },
  })
}

/**
 * 查询案件预算
 */
export function useCaseBudget(caseId: string) {
  return useQuery({
    queryKey: ['caseBudget', caseId],
    queryFn: () => financeApi.getCaseBudget(caseId),
    enabled: !!caseId,
  })
}

/**
 * 查询业务线预算列表
 */
export function useBusinessLineBudgets() {
  return useQuery({
    queryKey: ['businessLineBudgets'],
    queryFn: () => financeApi.getBusinessLineBudgets(),
  })
}