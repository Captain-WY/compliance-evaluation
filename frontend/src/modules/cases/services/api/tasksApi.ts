/**
 * Tasks API Service
 * Handles case task operations
 */

import { apiClient } from './client';

// Backend response type
interface TaskResponse {
  id: string;
  caseId: string;
  taskName: string;
  taskType?: string;
  description?: string;
  assigneeId?: string;
  assigneeName?: string;
  deadline?: string;
  status: string; // 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE'
  priority?: string;
  completedDate?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Frontend task type (simplified)
export interface Task {
  id: string;
  caseId: string;
  taskName: string;
  taskType?: string;
  description?: string;
  assigneeId?: string;
  assigneeName?: string;
  deadline?: string;
  status: string;
  priority?: string;
  completedDate?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Map backend task to frontend Task
function mapTask(backendTask: TaskResponse): Task {
  return {
    id: backendTask.id,
    caseId: backendTask.caseId,
    taskName: backendTask.taskName,
    taskType: backendTask.taskType,
    description: backendTask.description,
    assigneeId: backendTask.assigneeId,
    assigneeName: backendTask.assigneeName,
    deadline: backendTask.deadline,
    status: backendTask.status,
    priority: backendTask.priority,
    completedDate: backendTask.completedDate,
    notes: backendTask.notes,
    createdAt: backendTask.createdAt,
    updatedAt: backendTask.updatedAt
  };
}

export const tasksApi = {
  /**
   * Get tasks for a case
   */
  async getCaseTasks(caseId: string): Promise<Task[]> {
    const response: TaskResponse[] = await apiClient.get<TaskResponse[]>(
      `/cases/${caseId}/tasks`
    );
    return response.map(mapTask);
  },

  /**
   * Create task
   */
  async createTask(
    caseId: string,
    taskData: {
      taskName: string;
      taskType?: string;
      description?: string;
      assigneeId?: string;
      deadline?: string;
      priority?: string;
      notes?: string;
    }
  ): Promise<Task> {
    const response: TaskResponse = await apiClient.post<TaskResponse>(
      `/cases/${caseId}/tasks`,
      taskData
    );
    return mapTask(response);
  },

  /**
   * Update task
   */
  async updateTask(caseId: string, taskId: string, updates: Partial<Task>): Promise<Task> {
    const response: TaskResponse = await apiClient.patch<TaskResponse>(
      `/cases/${caseId}/tasks/${taskId}`,
      updates
    );
    return mapTask(response);
  },

  /**
   * Complete task
   */
  async completeTask(caseId: string, taskId: string, notes?: string): Promise<Task> {
    const response: TaskResponse = await apiClient.patch<TaskResponse>(
      `/cases/${caseId}/tasks/${taskId}`,
      {
        status: 'COMPLETED',
        completedDate: new Date().toISOString(),
        notes
      }
    );
    return mapTask(response);
  },

  /**
   * Delete task
   */
  async deleteTask(caseId: string, taskId: string): Promise<void> {
    await apiClient.delete(`/cases/${caseId}/tasks/${taskId}`);
  }
};