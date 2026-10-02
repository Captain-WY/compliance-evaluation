/**
 * 文档管理 API 类型定义
 * 与后端 Pydantic Schema 严格对齐
 *
 * 参考: backend/src/schemas/documents.py
 */

// ==================== 枚举类型 ====================

/**
 * 文档保密级别枚举
 */
export enum ConfidentialityLevel {
  PUBLIC = 'PUBLIC',           // 公开
  INTERNAL = 'INTERNAL',       // 内部
  CONFIDENTIAL = 'CONFIDENTIAL', // 机密
  SECRET = 'SECRET',           // 绝密
}

/**
 * OCR 状态枚举
 */
export enum OcrStatus {
  PENDING = 'PENDING',         // 待处理
  PROCESSING = 'PROCESSING',   // 处理中
  COMPLETED = 'COMPLETED',     // 已完成
  FAILED = 'FAILED',           // 失败
}

/**
 * 访问请求状态枚举
 */
export enum AccessRequestStatus {
  PENDING = 'PENDING',         // 待审批
  APPROVED = 'APPROVED',       // 已批准
  REJECTED = 'REJECTED',       // 已拒绝
  CANCELLED = 'CANCELLED',     // 已取消
}

// ==================== 文档上传 ====================

/**
 * 文档上传请求
 * 对应后端: DocumentUpload (multipart/form-data)
 */
export interface DocumentUploadRequest {
  documentType: string
  description?: string
  confidentialityLevel?: ConfidentialityLevel
  documentDate?: string  // ISO 8601 (YYYY-MM-DD)
}

// ==================== 文档访问请求 ====================

/**
 * 文档访问请求
 * 对应后端: DocumentAccessRequest
 */
export interface DocumentAccessRequest {
  reason: string
  requestedPermissions: string[]  // e.g., ['READ', 'DOWNLOAD']
  expiresAt?: string  // ISO 8601
}

// ==================== 文档响应 ====================

/**
 * 文档响应
 * 对应后端: DocumentResponse
 */
export interface DocumentResponse {
  id: string
  caseId: string
  documentName: string
  documentType: string
  filePath: string
  fileSize: number | null
  fileFormat: string | null
  uploadUserId: string
  documentDate: string | null  // ISO 8601 (YYYY-MM-DD)
  confidentialityLevel: ConfidentialityLevel
  ocrStatus: OcrStatus | null
  description: string | null
  createdAt: string  // ISO 8601
  updatedAt: string  // ISO 8601
}

/**
 * 文档列表响应
 * 对应后端: DocumentListResponse
 */
export interface DocumentListResponse {
  items: DocumentResponse[]
  total: number
  page: number
  size: number
}

// ==================== 访问请求响应 ====================

/**
 * 访问请求响应
 * 对应后端: AccessRequestResponse
 */
export interface AccessRequestResponse {
  accessRequestId: string
  documentId: string
  requesterId: string
  status: AccessRequestStatus
  createdAt: string  // ISO 8601
}