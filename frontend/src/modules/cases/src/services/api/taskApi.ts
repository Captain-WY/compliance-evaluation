/**
 * 任务管理 API
 */

import apiClient from './client'
import type {
  TaskCreateRequest,
  TaskUpdateRequest,
  TaskResponse,
} from '@cases/types/api/task'

export const taskApi = {
  /**
   * 获取案件任务列表
   * GET /api/v1/cases/{case_id}/tasks
   */
  getTasks: async (caseId: string): Promise<TaskResponse[]> => {
    const response = await apiClient.get<TaskResponse[]>(`/cases/${caseId}/tasks`)
    return response.data
  },

  /**
   * 创建任务
   * POST /api/v1/cases/{case_id}/tasks
   */
  createTask: async (caseId: string, data: TaskCreateRequest): Promise<TaskResponse> => {
    const response = await apiClient.post<TaskResponse>(`/cases/${caseId}/tasks`, data)
    return response.data
  },

  /**
   * 更新任务
   * PUT /api/v1/tasks/{id}
   */
  updateTask: async (taskId: string, data: TaskUpdateRequest): Promise<TaskResponse> => {
    const response = await apiClient.put<TaskResponse>(`/tasks/${taskId}`, data)
    return response.data
  },

  /**
   * 完成任务
   * PATCH /api/v1/tasks/{id}/complete
   */
  completeTask: async (taskId: string): Promise<TaskResponse> => {
    const response = await apiClient.patch<TaskResponse>(`/tasks/${taskId}/complete`)
    return response.data
  },

  /**
   * 删除任务
   * DELETE /api/v1/tasks/{id}
   */
  deleteTask: async (taskId: string): Promise<void> => {
    await apiClient.delete(`/tasks/${taskId}`)
  },
}