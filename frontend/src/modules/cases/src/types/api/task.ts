/**
 * 任务管理 API 类型定义
 * 与后端 Pydantic Schema 严格对齐
 *
 * 参考: backend/src/schemas/tasks.py
 */

// ==================== 枚举类型 ====================

/**
 * 任务状态枚举
 */
export enum TaskStatus {
  PENDING = 'PENDING',        // 待处理
  IN_PROGRESS = 'IN_PROGRESS', // 进行中
  COMPLETED = 'COMPLETED',     // 已完成
  CANCELLED = 'CANCELLED',     // 已取消
}

/**
 * 任务优先级枚举
 */
export enum TaskPriority {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

// ==================== 请求 DTO ====================

/**
 * 任务创建请求
 * 对应后端: TaskCreate
 */
export interface TaskCreateRequest {
  taskName: string
  taskType: string
  deadline?: string  // ISO 8601
  status: TaskStatus
  priority?: TaskPriority
  assigneeId?: string
  description?: string
  processId?: string
}

/**
 * 任务更新请求
 * 对应后端: TaskUpdate
 */
export interface TaskUpdateRequest {
  taskName?: string
  taskType?: string
  deadline?: string  // ISO 8601
  status?: TaskStatus
  priority?: TaskPriority
  assigneeId?: string
  description?: string
}

// ==================== 响应 VO ====================

/**
 * 任务响应
 * 对应后端: TaskResponse
 */
export interface TaskResponse {
  id: string
  caseId: string
  processId: string | null
  taskName: string
  taskType: string
  deadline: string | null  // ISO 8601
  status: TaskStatus
  priority: TaskPriority | null
  assigneeId: string | null
  description: string | null
  completedAt: string | null  // ISO 8601
  createdAt: string  // ISO 8601
  updatedAt: string  // ISO 8601
  createdBy: string
  updatedBy: string
}