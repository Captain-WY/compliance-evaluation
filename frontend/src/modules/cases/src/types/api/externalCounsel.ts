/**
 * 外聘律师管理 API 类型定义
 * 与后端 Pydantic Schema 严格对齐
 *
 * 参考: backend/src/models/external_lawyers.py
 */

// ==================== 枚举类型 ====================

/**
 * 律师评级枚举
 */
export enum LawyerRating {
  A_PLUS = 'A+',  // 优秀
  A = 'A',        // 良好
  B = 'B',        // 合格
  C = 'C',        // 一般
}

// ==================== 外聘律师 ====================

/**
 * 外聘律师创建请求
 */
export interface ExternalLawyerCreateRequest {
  lawyerName: string
  firmId?: string
  lawyerIdNo?: string
  practiceArea?: string
  yearsOfExperience?: string
  contactPhone?: string
  email?: string
  rating?: LawyerRating
  specialties?: string
}

/**
 * 外聘律师更新请求
 */
export interface ExternalLawyerUpdateRequest {
  lawyerName?: string
  firmId?: string
  lawyerIdNo?: string
  practiceArea?: string
  yearsOfExperience?: string
  contactPhone?: string
  email?: string
  rating?: LawyerRating
  specialties?: string
  isActive?: boolean
}

/**
 * 外聘律师响应
 */
export interface ExternalLawyerResponse {
  id: string
  lawyerName: string
  firmId: string | null
  lawyerIdNo: string | null
  practiceArea: string | null
  yearsOfExperience: string | null
  contactPhone: string | null
  email: string | null
  rating: LawyerRating | null
  specialties: string | null
  isActive: boolean
  createdAt: string  // ISO 8601
  updatedAt: string  // ISO 8601
  createdBy: string
  updatedBy: string
}

/**
 * 外聘律师列表响应
 */
export interface ExternalLawyerListResponse {
  items: ExternalLawyerResponse[]
  total: number
  page: number
  size: number
}