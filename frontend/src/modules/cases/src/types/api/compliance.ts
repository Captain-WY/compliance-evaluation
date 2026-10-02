/**
 * 合规与报送管理 API 类型定义
 * 与后端 Pydantic Schema 严格对齐
 *
 * 参考: backend/src/schemas/compliance.py
 */

// ==================== 枚举类型 ====================

/**
 * 合规预警级别枚举
 */
export enum AlertLevel {
  INFO = 'INFO',           // 信息
  WARNING = 'WARNING',     // 警告
  ERROR = 'ERROR',         // 错误
  CRITICAL = 'CRITICAL',   // 严重
}

/**
 * 合规预警状态枚举
 */
export enum AlertStatus {
  PENDING = 'PENDING',         // 待处理
  HANDLING = 'HANDLING',       // 处理中
  RESOLVED = 'RESOLVED',       // 已解决
  IGNORED = 'IGNORED',         // 已忽略
}

/**
 * 报告类别枚举
 */
export enum ReportCategory {
  REGULATORY = 'REGULATORY',               // 监管报告
  INTERNAL_PERIODIC = 'INTERNAL_PERIODIC', // 内部定期报告
  INTERNAL_AD_HOC = 'INTERNAL_AD_HOC',     // 内部临时报告
}

/**
 * 报送任务状态枚举
 */
export enum ReportingTaskStatus {
  PENDING = 'PENDING',         // 待提交
  DRAFT = 'DRAFT',             // 草稿
  SUBMITTED = 'SUBMITTED',     // 已提交
  APPROVED = 'APPROVED',       // 已批准
  REJECTED = 'REJECTED',       // 已拒绝
}

// ==================== 合规预警 ====================

/**
 * 合规预警响应
 * 对应后端: ComplianceAlertResponse
 */
export interface ComplianceAlertResponse {
  id: string
  tenantId: string
  caseId: string
  ruleId: string
  alertLevel: AlertLevel
  alertMessage: string
  triggerData: Record<string, unknown> | null
  status: AlertStatus
  handledBy: string | null
  handledAt: string | null  // ISO 8601
  handlingNote: string | null
  reportingTaskId: string | null
  createdAt: string  // ISO 8601
  updatedAt: string  // ISO 8601
}

/**
 * 合规预警列表响应
 * 对应后端: ComplianceAlertListResponse
 */
export interface ComplianceAlertListResponse {
  items: ComplianceAlertResponse[]
  total: number
  page: number
  size: number
}

// ==================== 报送任务 ====================

/**
 * 报送任务创建请求
 * 对应后端: ReportingTaskCreate
 */
export interface ReportingTaskCreateRequest {
  taskName: string
  reportCategory: ReportCategory
  ruleId?: string
  templateId?: string
  assigneeId: string
  dueDate: string  // ISO 8601 (YYYY-MM-DD)
}

/**
 * 报送任务响应
 * 对应后端: ReportingTaskResponse
 */
export interface ReportingTaskResponse {
  id: string
  tenantId: string
  taskName: string
  reportCategory: ReportCategory
  ruleId: string | null
  templateId: string | null
  assigneeId: string
  dueDate: string  // ISO 8601 (YYYY-MM-DD)
  status: ReportingTaskStatus
  approvalInstanceId: string | null
  submittedAt: string | null  // ISO 8601
  createdAt: string  // ISO 8601
  updatedAt: string  // ISO 8601
}

/**
 * 报送任务列表响应
 * 对应后端: ReportingTaskListResponse
 */
export interface ReportingTaskListResponse {
  items: ReportingTaskResponse[]
  total: number
  page: number
  size: number
}