/**
 * 案件成员管理 API 类型定义
 * 与后端 Pydantic Schema 严格对齐
 *
 * 参考: backend/src/models/case_members.py
 */

// ==================== 枚举类型 ====================

/**
 * 案件成员角色枚举
 */
export enum CaseMemberRole {
  LEAD_LAWYER = 'LEAD_LAWYER',       // 主办律师
  ASSISTANT_LAWYER = 'ASSISTANT_LAWYER', // 协办律师
  PARALEGAL = 'PARALEGAL',           // 律师助理
  SECRETARY = 'SECRETARY',           // 秘书
  OBSERVER = 'OBSERVER',             // 观察员
}

// ==================== 案件成员 ====================

/**
 * 案件成员创建请求
 */
export interface CaseMemberCreateRequest {
  userId: string
  role: CaseMemberRole
  joinDate?: string  // ISO 8601 (YYYY-MM-DD)
}

/**
 * 案件成员更新请求
 */
export interface CaseMemberUpdateRequest {
  role?: CaseMemberRole
  isActive?: boolean
}

/**
 * 案件成员响应
 */
export interface CaseMemberResponse {
  id: string
  caseId: string
  userId: string
  role: CaseMemberRole
  joinDate: string | null  // ISO 8601 (YYYY-MM-DD)
  isActive: boolean
  createdAt: string  // ISO 8601
  updatedAt: string  // ISO 8601
  createdBy: string
  updatedBy: string
  // 关联用户信息（可选）
  user?: {
    id: string
    name: string
    email: string
    department?: string
  }
}

/**
 * 案件成员列表响应
 */
export interface CaseMemberListResponse {
  items: CaseMemberResponse[]
  total: number
}