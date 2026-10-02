/**
 * 当事人管理 API 类型定义
 * 与后端 Pydantic Schema 严格对齐
 *
 * 参考: backend/src/schemas/parties.py
 */

// ==================== 枚举类型 ====================

/**
 * 当事人类型枚举
 */
export enum PartyType {
  PLAINTIFF = 'plaintiff',      // 原告
  DEFENDANT = 'defendant',      // 被告
  THIRD_PARTY = 'third_party',  // 第三人
}

// ==================== 请求 DTO ====================

/**
 * 当事人创建请求
 * 对应后端: PartyCreate
 */
export interface PartyCreateRequest {
  partyType: PartyType
  partyName: string
  partyRole?: string
  contactPerson?: string
  contactPhone?: string
  contactAddress?: string
  idType?: string
  idNumber?: string
  legalRepresentative?: string
  agentName?: string
  agentPhone?: string
  remarks?: string
}

/**
 * 当事人更新请求
 * 对应后端: PartyUpdate
 */
export interface PartyUpdateRequest {
  partyType?: PartyType
  partyName?: string
  partyRole?: string
  contactPerson?: string
  contactPhone?: string
  contactAddress?: string
  idType?: string
  idNumber?: string
  legalRepresentative?: string
  agentName?: string
  agentPhone?: string
  remarks?: string
}

// ==================== 响应 VO ====================

/**
 * 当事人响应
 * 对应后端: PartyResponse
 */
export interface PartyResponse {
  id: string
  caseId: string
  partyType: PartyType
  partyName: string
  partyRole: string | null
  contactPerson: string | null
  contactPhone: string | null
  contactAddress: string | null
  idType: string | null
  idNumber: string | null
  legalRepresentative: string | null
  agentName: string | null
  agentPhone: string | null
  remarks: string | null
  createdAt: string  // ISO 8601
  updatedAt: string  // ISO 8601
  createdBy: string
  updatedBy: string
}