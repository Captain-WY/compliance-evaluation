/**
 * 案件管理 API 类型定义
 * 与后端 Pydantic Schema 严格对齐
 *
 * 参考: backend/src/schemas/cases.py
 */

// ==================== 枚举类型 ====================

/**
 * 案件阶段枚举
 * 对应后端: CaseStage (str, Enum)
 */
export enum CaseStage {
  CLUE = 'clue',                    // 线索
  FILING = 'filing',                // 立案
  FIRST_INSTANCE = 'first_instance', // 一审
  SECOND_INSTANCE = 'second_instance', // 二审
  ENFORCEMENT = 'enforcement',      // 执行
  CLOSED = 'closed',                // 已结案
}

/**
 * 案件状态枚举
 * 对应后端: CaseStatus (str, Enum)
 */
export enum CaseStatus {
  PENDING = 'PENDING',      // 待处理
  ACTIVE = 'ACTIVE',        // 进行中
  SUSPENDED = 'SUSPENDED',  // 中止
  CLOSED = 'CLOSED',        // 已结案
}

// ==================== 请求 DTO ====================

/**
 * 案件列表查询请求
 * 对应后端: CaseListRequest
 */
export interface CaseListRequest {
  page: number
  size: number
  sort?: string
  stageCode?: CaseStage
  caseTypeCode?: string
  businessLine?: string
  keyword?: string
  caseStatus?: CaseStatus
  riskLevel?: string
  filingDateStart?: string  // ISO 8601
  filingDateEnd?: string    // ISO 8601
}

/**
 * 案件创建请求
 * 对应后端: CaseCreate
 */
export interface CaseCreateRequest {
  tenantId: string
  internalCaseNo: string
  externalCaseNo?: string
  caseName: string
  caseTypeCode: string
  caseSource?: string
  businessLine?: string
  caseCause?: string
  riskLevel?: string
  ourRole?: string
  plaintiffName?: string
  defendantName?: string
  targetAmount?: number
  provisionAmount?: number
  targetSubject?: string
  acceptingCourt?: string
  presidingJudge?: string
  judgeContact?: string
  handlingLawyerId?: string
  isMainCase?: boolean
  mainCaseId?: string
  disputeId: string
  previousInstanceId?: string
  procedureType?: string
  currentStageCode?: string
  caseStatus?: string
  latestProgress?: string
  filingDate?: string  // ISO 8601
  closeDate?: string   // ISO 8601
  archiveNo?: string
}

/**
 * 案件更新请求
 * 对应后端: CaseUpdate
 */
export interface CaseUpdateRequest {
  caseName?: string
  caseTypeCode?: string
  businessLine?: string
  caseCause?: string
  riskLevel?: string
  ourRole?: string
  plaintiffName?: string
  defendantName?: string
  targetAmount?: number
  provisionAmount?: number
  acceptingCourt?: string
  presidingJudge?: string
  judgeContact?: string
  handlingLawyerId?: string
  currentStageCode?: string
  caseStatus?: string
  latestProgress?: string
  filingDate?: string  // ISO 8601
  closeDate?: string   // ISO 8601
  archiveNo?: string
}

// ==================== 响应 VO ====================

/**
 * 案件响应
 * 对应后端: CaseResponse
 */
export interface CaseResponse {
  id: string
  tenantId: string
  internalCaseNo: string
  externalCaseNo: string | null
  caseName: string
  caseTypeCode: string
  caseSource: string | null
  businessLine: string | null
  caseCause: string | null
  riskLevel: string | null
  ourRole: string | null
  plaintiffName: string | null
  defendantName: string | null
  targetAmount: number | null
  provisionAmount: number | null
  targetSubject: string | null
  acceptingCourt: string | null
  presidingJudge: string | null
  judgeContact: string | null
  handlingLawyerId: string | null
  isMainCase: boolean
  mainCaseId: string | null
  disputeId: string
  previousInstanceId: string | null
  procedureType: string | null
  currentStageCode: string | null
  caseStatus: string
  latestProgress: string | null
  filingDate: string | null  // ISO 8601
  closeDate: string | null   // ISO 8601
  archiveNo: string | null
  isDeleted: boolean
  createdAt: string  // ISO 8601
  updatedAt: string  // ISO 8601
  createdBy: string
  updatedBy: string
}

/**
 * 案件列表响应（简化版）
 * 对应后端: CaseListResponse
 */
export interface CaseListResponse {
  id: string
  internalCaseNo: string
  caseName: string
  caseTypeCode: string
  businessLine: string | null
  ourRole: string | null
  plaintiffName: string | null
  defendantName: string | null
  targetAmount: number | null
  currentStageCode: string | null
  caseStatus: string
  filingDate: string | null  // ISO 8601
  createdAt: string | null   // ISO 8601
}

/**
 * 分页响应包装器
 * 对应后端: PaginatedResponse[T]
 */
export interface PaginatedResponse<T> {
  total: number
  page: number
  size: number
  items: T[]
}

/**
 * 标准响应包装器
 * 对应后端: StandardResponse[T]
 */
export interface StandardResponse<T> {
  code: number
  message: string
  data: T
  traceId: string
}