/**
 * 资产保全台账 BFF API (切片 2.S12)
 *
 * 7 端点:
 *   POST /preservations/list           — 按案件或全租户列表
 *   POST /preservations/detail         — 单条详情 (含 extend_history)
 *   POST /preservations/create         — 新建保全 (写)
 *   POST /preservations/extend         — 续期 (D1=A 就地更新, 追加 extend_history)
 *   POST /preservations/release        — 解除 (D3=A 非强制文书, RELEASED 终态)
 *   POST /preservations/realize        — 变现 (D4=B 强制同事务创建 RECOVERY 流水)
 *   POST /preservations/expiry-alerts  — 到期预警看板 (D5=A 单端点, summary 固定 7d/30d)
 *
 * 权限 (D6=案件成员级): OWNER/CO_COUNSEL 可写; 案件成员可读; 管理层全租户
 *
 * 后端契约: docs/design/v1/api/04_asset_preservation/00_asset_preservation_api_plan.md v1.1
 */

import apiClient from './client'

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(
  /\/api\/v1\/?$/,
  '',
)
const ASSET_BFF_BASE = `${API_ORIGIN}/api/bff/v1/assets`

export const assetPreservationApi = {
  /** POST /preservations/list — 按案件或全租户列表 */
  listPreservationsBff: async (params: {
    caseId?: string | null
    statusFilter?: 'ACTIVE' | 'RELEASED' | 'REALIZED' | 'EXPIRED' | null
    assetType?: string | null
    page?: number
    size?: number
  } = {}): Promise<any> => {
    const response = await apiClient.post(`${ASSET_BFF_BASE}/preservations/list`, {
      case_id: params.caseId ?? null,
      status_filter: params.statusFilter ?? null,
      asset_type: params.assetType ?? null,
      pagination: { page: params.page ?? 1, size: params.size ?? 100 },
    })
    return response.data?.data ?? null
  },

  /** POST /preservations/detail — 单条详情 (含 extend_history / asset_identifiers) */
  getPreservationDetailBff: async (preservationId: string): Promise<any> => {
    const response = await apiClient.post(`${ASSET_BFF_BASE}/preservations/detail`, {
      preservation_id: preservationId,
    })
    return response.data?.data ?? null
  },

  /** POST /preservations/create — 新建保全记录 (写, D7 软校验 asset_identifiers) */
  createPreservationBff: async (params: {
    caseId: string
    ownerPartyId: string
    assetType: string
    assetName: string
    preservationType: string
    startDate: string
    expireDate: string
    estimatedValue?: number | null
    currency?: string
    executionCourt?: string | null
    rulingDocumentId?: string | null
    description?: string | null
    assetIdentifiers?: Record<string, unknown> | null
  }): Promise<any> => {
    const response = await apiClient.post(`${ASSET_BFF_BASE}/preservations/create`, {
      case_id: params.caseId,
      owner_party_id: params.ownerPartyId,
      asset_type: params.assetType,
      asset_name: params.assetName,
      preservation_type: params.preservationType,
      start_date: params.startDate,
      expire_date: params.expireDate,
      estimated_value: params.estimatedValue ?? null,
      currency: params.currency ?? 'CNY',
      execution_court: params.executionCourt ?? null,
      ruling_document_id: params.rulingDocumentId ?? null,
      description: params.description ?? null,
      asset_identifiers: params.assetIdentifiers ?? null,
    })
    return response.data?.data ?? null
  },

  /** POST /preservations/extend — 续期 (D1=A: 就地更新 expire_date + extend_history) */
  extendPreservationBff: async (params: {
    preservationId: string
    newExpireDate: string
    reason?: string | null
  }): Promise<any> => {
    const response = await apiClient.post(`${ASSET_BFF_BASE}/preservations/extend`, {
      preservation_id: params.preservationId,
      new_expire_date: params.newExpireDate,
      reason: params.reason ?? null,
    })
    return response.data?.data ?? null
  },

  /** POST /preservations/release — 解除保全 (D3=A: RELEASED 终态不可逆) */
  releasePreservationBff: async (params: {
    preservationId: string
    releaseDate: string
    releaseReason?: string | null
    rulingDocumentId?: string | null
  }): Promise<any> => {
    const response = await apiClient.post(`${ASSET_BFF_BASE}/preservations/release`, {
      preservation_id: params.preservationId,
      release_date: params.releaseDate,
      release_reason: params.releaseReason ?? null,
      ruling_document_id: params.rulingDocumentId ?? null,
    })
    return response.data?.data ?? null
  },

  /** POST /preservations/realize — 变现 (D4=B: 同事务创建 RECOVERY financial_transaction) */
  realizePreservationBff: async (params: {
    preservationId: string
    realizedValue: number
    realizeDate: string
    remarks?: string | null
  }): Promise<any> => {
    const response = await apiClient.post(`${ASSET_BFF_BASE}/preservations/realize`, {
      preservation_id: params.preservationId,
      realized_value: params.realizedValue,
      realize_date: params.realizeDate,
      remarks: params.remarks ?? null,
    })
    return response.data?.data ?? null
  },

  /** POST /preservations/expiry-alerts — 到期预警看板 (D5=A: summary 固定 7d/30d) */
  getExpiryAlertsBff: async (params: {
    daysThreshold?: number
    caseId?: string | null
    page?: number
    size?: number
  } = {}): Promise<any> => {
    const response = await apiClient.post(`${ASSET_BFF_BASE}/preservations/expiry-alerts`, {
      days_threshold: params.daysThreshold ?? 30,
      case_id: params.caseId ?? null,
      pagination: { page: params.page ?? 1, size: params.size ?? 50 },
    })
    return response.data?.data ?? null
  },
}
