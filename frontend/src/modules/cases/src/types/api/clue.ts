/**
 * 线索管理 API 类型定义
 * 与后端 Pydantic Schema 严格对齐
 *
 * 参考: backend/src/schemas/clues.py
 */

// ==================== 枚举类型 ====================

/**
 * 线索状态枚举
 */
export enum ClueStatus {
  NEW = 'NEW',                   // 新线索
  UNDER_REVIEW = 'UNDER_REVIEW', // 审核中
  CONVERTED = 'CONVERTED',       // 已转案件
  REJECTED = 'REJECTED',         // 已拒绝
  CLOSED = 'CLOSED',             // 已关闭
}

/**
 * 风险级别枚举
 */
export enum RiskLevel {
  LOW = 'LOW',         // 低风险
  MEDIUM = 'MEDIUM',   // 中风险
  HIGH = 'HIGH',       // 高风险
  CRITICAL = 'CRITICAL', // 严重
}

// ==================== 线索创建 ====================

/**
 * 线索创建请求
 * 对应后端: ClueCreate
 */
export interface ClueCreateRequest {
  clueSource: string
  clueType: string
  description: string
  estimatedAmount?: number
  riskLevel?: RiskLevel
  reporterName?: string
  reporterContact?: string
  handlerId?: string
}

// ==================== 线索转案件 ====================

/**
 * 线索转案件请求
 * 对应后端: ClueConvertRequest
 */
export interface ClueConvertRequest {
  caseName: string
  caseTypeCode: string
  disputeId: string
  internalCaseNo: string
  tenantId: string
}

// ==================== 线索响应 ====================

/**
 * 线索响应
 * 对应后端: ClueResponse
 */
export interface ClueResponse {
  id: string
  clueSource: string
  clueType: string
  description: string
  estimatedAmount: number | null
  riskLevel: RiskLevel | null
  status: ClueStatus
  reporterName: string | null
  reporterContact: string | null
  handlerId: string | null
  convertedCaseId: string | null
  createdAt: string  // ISO 8601
  updatedAt: string  // ISO 8601
}

/**
 * 线索列表响应
 * 对应后端: ClueListResponse
 */
export interface ClueListResponse {
  items: ClueResponse[]
  total: number
  page: number
  size: number
}

/**
 * 线索转案件响应
 * 对应后端: ClueConversionResponse
 */
export interface ClueConversionResponse {
  clueId: string
  caseId: string
  clueStatus: ClueStatus
  caseName: string
  internalCaseNo: string
  createdAt: string  // ISO 8601
}