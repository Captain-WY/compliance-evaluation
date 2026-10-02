/**
 * 审批中心 React Query Hooks
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { approvalApi } from '@cases/services/api/approvalApi'
import type { ApprovalActionRequest } from '@cases/types/api/approval'

/**
 * 查询审批实例列表
 */
export function useApprovals(params?: {
  page?: number
  size?: number
  status?: string
  businessType?: string
  applicantId?: string
}) {
  return useQuery({
    queryKey: ['approvals', params],
    queryFn: () => approvalApi.getApprovals(params),
  })
}

/**
 * 查询审批实例详情
 */
export function useApprovalDetail(approvalId: string) {
  return useQuery({
    queryKey: ['approval', approvalId],
    queryFn: () => approvalApi.getApprovalDetail(approvalId),
    enabled: !!approvalId,
  })
}

/**
 * 执行审批操作
 */
export function useExecuteApprovalAction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      approvalId,
      data,
    }: {
      approvalId: string
      data: ApprovalActionRequest
    }) => approvalApi.executeAction(approvalId, data),
    onSuccess: () => {
      // 刷新审批列表
      queryClient.invalidateQueries({ queryKey: ['approvals'] })
      // 刷新相关业务数据
      queryClient.invalidateQueries({ queryKey: ['documents'] })
      queryClient.invalidateQueries({ queryKey: ['reportingTasks'] })
    },
  })
}