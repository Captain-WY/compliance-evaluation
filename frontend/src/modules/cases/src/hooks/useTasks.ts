/**
 * 任务管理 React Query Hooks
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { taskApi } from '@cases/services/api/taskApi'
import type { TaskCreateRequest, TaskUpdateRequest } from '@cases/types/api/task'

/**
 * 查询案件任务列表
 */
export function useTasks(caseId: string) {
  return useQuery({
    queryKey: ['tasks', caseId],
    queryFn: () => taskApi.getTasks(caseId),
    enabled: !!caseId,
  })
}

/**
 * 创建任务
 */
export function useCreateTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ caseId, data }: { caseId: string; data: TaskCreateRequest }) =>
      taskApi.createTask(caseId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tasks', variables.caseId] })
    },
  })
}

/**
 * 更新任务
 */
export function useUpdateTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ taskId, data }: { taskId: string; data: TaskUpdateRequest }) =>
      taskApi.updateTask(taskId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

/**
 * 完成任务
 */
export function useCompleteTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: taskApi.completeTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

/**
 * 删除任务
 */
export function useDeleteTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: taskApi.deleteTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}