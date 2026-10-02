/**
 * 跨案件财务看板 BFF API (切片 2.S11.a)
 *
 * 14 端点 (S11.b Reports 4 端点留后续):
 *   Dashboard (5): kpi / trends / distribution / ranking / alerts
 *   Provisions (5): list / summary / record / history / write-off
 *   Spend + Budget (4): spend/list / spend/record / spend/update-status / budget/execution
 *
 * 权限 (D1=C 角色级 DataRole, 后端 _compute_board_scope):
 *   - SYS_ADMIN / LEGAL_ADMIN / LEGAL_DIRECTOR: 全租户
 *   - LAWYER: 仅自己经手案件
 *   - BUSINESS_COLLABORATOR: 仅本业务线
 *   - EXTERNAL_COUNSEL: 4013 拒
 *
 * 后端契约: docs/design/v1/api/03_finance_board/00_finance_board_overview.md v1.0
 */

import apiClient from './client'

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(
  /\/api\/v1\/?$/,
  '',
)
const FINANCE_BFF_BASE = `${API_ORIGIN}/api/bff/v1/finance`

// ==================== 通用类型 ====================

export interface TimeRangeParams {
  start: string // ISO date YYYY-MM-DD
  end: string
}

export interface BoardFilters {
  business_line?: string | null
  case_type_code?: string | null
  risk_level?: 'MINOR' | 'GENERAL' | 'IMPORTANT' | 'MAJOR' | null
}

export interface BoardPagination {
  page?: number
  size?: number
}

export const financeBoardApi = {
  // =================================================================
  // Dashboard (5 端点)
  // =================================================================

  /** POST /api/bff/v1/finance/dashboard/kpi — 核心 KPI + YoY */
  getKpiBff: async (params: {
    timeRange: TimeRangeParams
    filters?: BoardFilters
  }): Promise<any> => {
    const response = await apiClient.post(`${FINANCE_BFF_BASE}/dashboard/kpi`, {
      time_range: params.timeRange,
      filters: params.filters ?? {},
    })
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/finance/dashboard/trends — 时间序列 */
  getTrendsBff: async (params: {
    metric: 'NEW_CLAIMS' | 'RECOVERY_AMOUNT' | 'LEGAL_SPEND' | 'PROVISION_AMOUNT'
    interval: 'MONTH' | 'QUARTER' | 'YEAR'
    timeRange: TimeRangeParams
    filters?: BoardFilters
  }): Promise<any> => {
    const response = await apiClient.post(`${FINANCE_BFF_BASE}/dashboard/trends`, {
      metric: params.metric,
      interval: params.interval,
      time_range: params.timeRange,
      filters: params.filters ?? {},
    })
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/finance/dashboard/distribution — 维度分布 (饼图) */
  getDistributionBff: async (params: {
    metric: 'LEGAL_SPEND' | 'NEW_CLAIMS' | 'PROVISION_AMOUNT'
    dimension: 'BY_BUSINESS_UNIT' | 'BY_CASE_TYPE' | 'BY_RISK_LEVEL'
    timeRange: TimeRangeParams
    filters?: BoardFilters
  }): Promise<any> => {
    const response = await apiClient.post(`${FINANCE_BFF_BASE}/dashboard/distribution`, {
      metric: params.metric,
      dimension: params.dimension,
      time_range: params.timeRange,
      filters: params.filters ?? {},
    })
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/finance/dashboard/ranking — Top N 排行 (律所支出) */
  getRankingBff: async (params: {
    metric: 'VENDOR_SPEND' | 'PROVISION_AMOUNT'
    dimension?: 'BY_LAW_FIRM' | 'BY_CASE' | 'BY_CONTRACT'
    limit?: number
    timeRange: TimeRangeParams
    filters?: BoardFilters
  }): Promise<any> => {
    const response = await apiClient.post(`${FINANCE_BFF_BASE}/dashboard/ranking`, {
      metric: params.metric,
      dimension: params.dimension ?? 'BY_LAW_FIRM',
      limit: params.limit ?? 10,
      time_range: params.timeRange,
      filters: params.filters ?? {},
    })
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/finance/dashboard/alerts — 异常预警雷达 */
  getAlertsBff: async (limit: number = 20): Promise<any> => {
    const response = await apiClient.post(`${FINANCE_BFF_BASE}/dashboard/alerts`, {
      limit,
    })
    return response.data?.data ?? null
  },

  // =================================================================
  // Provisions (5 端点)
  // =================================================================

  /** POST /api/bff/v1/finance/provisions/list — 预计负债台账列表 */
  listProvisionsBff: async (params: {
    status?: 'PENDING' | 'APPROVED' | 'REJECTED' | null
    riskLevel?: 'MINOR' | 'GENERAL' | 'IMPORTANT' | 'MAJOR' | null
    businessLine?: string | null
    pagination?: BoardPagination
  }): Promise<any> => {
    const response = await apiClient.post(`${FINANCE_BFF_BASE}/provisions/list`, {
      status: params.status ?? null,
      risk_level: params.riskLevel ?? null,
      business_line: params.businessLine ?? null,
      pagination: {
        page: params.pagination?.page ?? 1,
        size: params.pagination?.size ?? 20,
      },
    })
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/finance/provisions/summary — 计提汇总快照 */
  getProvisionsSummaryBff: async (params: {
    status?: 'PENDING' | 'APPROVED' | 'REJECTED' | null
    riskLevel?: 'MINOR' | 'GENERAL' | 'IMPORTANT' | 'MAJOR' | null
    businessLine?: string | null
  } = {}): Promise<any> => {
    const response = await apiClient.post(`${FINANCE_BFF_BASE}/provisions/summary`, {
      status: params.status ?? null,
      risk_level: params.riskLevel ?? null,
      business_line: params.businessLine ?? null,
    })
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/finance/provisions/record — 新增计提/调整 (写) */
  recordProvisionBff: async (params: {
    caseId: string
    amount: string | number // Decimal
    currency?: string
    provisionDate: string
    reason: string
    attachmentIds?: string[]
  }): Promise<any> => {
    const response = await apiClient.post(`${FINANCE_BFF_BASE}/provisions/record`, {
      case_id: params.caseId,
      amount: params.amount,
      currency: params.currency ?? 'CNY',
      provision_date: params.provisionDate,
      reason: params.reason,
      attachment_ids: params.attachmentIds ?? [],
    })
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/finance/provisions/history — 案件计提历史 */
  getProvisionsHistoryBff: async (caseId: string): Promise<any> => {
    const response = await apiClient.post(`${FINANCE_BFF_BASE}/provisions/history`, {
      case_id: caseId,
    })
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/finance/provisions/write-off — 结案冲销 (写) */
  writeOffProvisionBff: async (params: {
    caseId: string
    actualLossAmount: string | number
    writeOffDate: string
    remarks: string
  }): Promise<any> => {
    const response = await apiClient.post(`${FINANCE_BFF_BASE}/provisions/write-off`, {
      case_id: params.caseId,
      actual_loss_amount: params.actualLossAmount,
      write_off_date: params.writeOffDate,
      remarks: params.remarks,
    })
    return response.data?.data ?? null
  },

  // =================================================================
  // Spend + Budget (4 端点)
  // =================================================================

  /** POST /api/bff/v1/finance/spend/list — 跨案件支出流水 */
  listSpendBff: async (params: {
    expenseType?: string | null
    paymentStatus?: 'PENDING' | 'APPROVED' | 'EXECUTED' | 'REJECTED' | 'CANCELLED' | null
    businessLine?: string | null
    timeRange?: TimeRangeParams | null
    pagination?: BoardPagination
  } = {}): Promise<any> => {
    const response = await apiClient.post(`${FINANCE_BFF_BASE}/spend/list`, {
      expense_type: params.expenseType ?? null,
      payment_status: params.paymentStatus ?? null,
      business_line: params.businessLine ?? null,
      time_range: params.timeRange ?? null,
      pagination: {
        page: params.pagination?.page ?? 1,
        size: params.pagination?.size ?? 20,
      },
    })
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/finance/spend/record — 手工登记支出 (写, Q12 不扣预算) */
  recordSpendBff: async (params: {
    caseId: string
    expenseType: string
    amount: string | number
    currency?: string
    payee: string
    dueDate?: string | null
    invoiceAttachmentIds?: string[]
    note?: string | null
  }): Promise<any> => {
    const response = await apiClient.post(`${FINANCE_BFF_BASE}/spend/record`, {
      case_id: params.caseId,
      expense_type: params.expenseType,
      amount: params.amount,
      currency: params.currency ?? 'CNY',
      payee: params.payee,
      due_date: params.dueDate ?? null,
      invoice_attachment_ids: params.invoiceAttachmentIds ?? [],
      note: params.note ?? null,
    })
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/finance/spend/update-status — 状态流转 (写) */
  updateSpendStatusBff: async (params: {
    spendId: string
    newStatus: 'APPROVED' | 'EXECUTED' | 'REJECTED' | 'CANCELLED'
    actualPaymentDate?: string | null
    remark?: string | null
  }): Promise<any> => {
    const response = await apiClient.post(`${FINANCE_BFF_BASE}/spend/update-status`, {
      spend_id: params.spendId,
      new_status: params.newStatus,
      actual_payment_date: params.actualPaymentDate ?? null,
      remark: params.remark ?? null,
    })
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/finance/budget/execution — 预算执行率 (业务线/部门) */
  getBudgetExecutionBff: async (params: {
    year: number
    dimension?: 'BY_BUSINESS_UNIT' | 'BY_DEPARTMENT'
  }): Promise<any> => {
    const response = await apiClient.post(`${FINANCE_BFF_BASE}/budget/execution`, {
      year: params.year,
      dimension: params.dimension ?? 'BY_BUSINESS_UNIT',
    })
    return response.data?.data ?? null
  },
}
