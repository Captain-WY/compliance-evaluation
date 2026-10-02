/**
 * 案件管理 API
 * 与后端 API 端点完全对接
 */

import axios from 'axios'
import apiClient, { getAuthToken } from './client'

// BFF 基础路径：从 /api/v1 的 baseURL 中提取 origin，拼接 /api/bff/v1
const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/api\/v1\/?$/, '')
const BFF_BASE = `${API_ORIGIN}/api/bff/v1`
import type {
  CaseListRequest,
  CaseCreateRequest,
  CaseUpdateRequest,
  CaseResponse,
  CaseListResponse,
  PaginatedResponse,
} from '@cases/types/api/case'

// ==================== 类型定义 ====================

/** 冲突预警 VO（案件立案前的当事人冲突检测） */
export interface ConflictWarningVO {
  type: 'BLACKLIST' | 'ONGOING' | 'HISTORY'
  message: string
  partyName?: string
  relatedCaseId?: string
  relatedCaseCode?: string
}

/** 案件统计数据 */
export interface CaseStats {
  total: number
  active: number
  closed: number
  totalAmount: number
  highRiskCount: number
}

/** 统一的搜索结果项 */
export interface SearchIssueItem {
  id: string
  issueType: string
  title: string
  code: string
  status: string
  stage: string
  riskLevel: string
  assigneeId: string | null
  businessLine: string
  targetAmount: number
  plaintiffName: string
  defendantName: string
  acceptingCourt: string
  causeOfAction: string
  procedureType: string
  filingDate: string | null
  closeDate: string | null
  createdAt: string | null
  updatedAt: string | null
}

/** 分页搜索结果 */
export interface PaginatedSearchResult {
  total: number
  page: number
  size: number
  items: SearchIssueItem[]
}

// ==================== API 封装 ====================

export const caseApi = {
  /**
   * 获取案件列表（分页）
   * GET /api/v1/cases
   */
  getCases: async (params: CaseListRequest): Promise<PaginatedResponse<CaseListResponse>> => {
    const response = await apiClient.get<PaginatedResponse<CaseListResponse>>('/cases', {
      params,
    })
    return response.data
  },

  /**
   * 获取案件详情
   * GET /api/v1/cases/{id}
   */
  getCaseById: async (id: string): Promise<CaseResponse> => {
    const response = await apiClient.get<CaseResponse>(`/cases/${id}`)
    return response.data
  },

  /**
   * 创建案件
   * POST /api/v1/cases
   */
  createCase: async (data: CaseCreateRequest): Promise<CaseResponse> => {
    const response = await apiClient.post<CaseResponse>('/cases', data)
    return response.data
  },

  /**
   * 案件冲突检测（立案前 / 新增当事人前检查利益冲突）
   * 2026-04-19 切片 2.S3: 切换到 BFF POST /api/bff/v1/cases/conflict-check
   * Request: { partyName?, identityNumber?, partyType?, excludeCaseId? }
   * Response: { total, warnings: ConflictWarningVO[] }
   */
  conflictCheck: async (data: {
    partyName?: string
    identityNumber?: string
    partyType?: string
    excludeCaseId?: string
  } | Partial<CaseCreateRequest>): Promise<ConflictWarningVO[]> => {
    // 兼容旧表单: 如果传 plaintiff/defendant, 把它拼为 partyName 的多次查询
    const anyData = data as any
    const partyName = anyData.partyName ?? anyData.plaintiff ?? anyData.defendant
    const body: Record<string, any> = {}
    if (partyName) body.partyName = partyName
    if (anyData.identityNumber) body.identityNumber = anyData.identityNumber
    if (anyData.partyType) body.partyType = anyData.partyType
    if (anyData.excludeCaseId) body.excludeCaseId = anyData.excludeCaseId
    if (!body.partyName && !body.identityNumber) return []
    const response = await apiClient.post(`${BFF_BASE}/cases/conflict-check`, body)
    return response.data?.data?.warnings || []
  },

  /**
   * 保存草稿
   * POST /api/v1/cases/draft
   */
  saveDraft: async (data: Partial<CaseCreateRequest>): Promise<CaseResponse> => {
    const response = await apiClient.post<CaseResponse>('/cases/draft', data)
    return response.data
  },

  /**
   * 更新案件
   * PUT /api/v1/cases/{id}
   */
  updateCase: async (id: string, data: CaseUpdateRequest): Promise<CaseResponse> => {
    const response = await apiClient.put<CaseResponse>(`/cases/${id}`, data)
    return response.data
  },

  /**
   * 删除案件（软删除）
   * DELETE /api/v1/cases/{id}
   */
  deleteCase: async (id: string): Promise<void> => {
    await apiClient.delete(`/cases/${id}`)
  },

  /**
   * 更新案件阶段
   * PATCH /api/v1/cases/{id}/stage
   */
  updateCaseStage: async (id: string, stageCode: string): Promise<CaseResponse> => {
    const response = await apiClient.patch<CaseResponse>(`/cases/${id}/stage`, {
      stageCode,
    })
    return response.data
  },

  // ==================== 视图级别的封装 ====================

  /**
   * 获取案件统计信息 (轻量聚合，不加载数据)
   * GET /api/v1/cases/stats
   */
  getCaseStats: async (params?: Record<string, any>): Promise<CaseStats> => {
    const response = await apiClient.get('/cases/stats', { params })
    return response.data?.data || { total: 0, active: 0, closed: 0, totalAmount: 0, highRiskCount: 0 }
  },

  /**
   * 全局搜索接口 (返回统一格式的分页数据)
   * GET /api/v1/search/issues
   */
  searchIssues: async (params: Record<string, any>): Promise<PaginatedSearchResult> => {
    const response = await apiClient.get('/search/issues', { params })
    return response.data?.data || { total: 0, page: 1, size: 20, items: [] }
  },

  /**
   * 获取列表视图（带完整分页元数据）
   * GET /api/v1/cases — 向后兼容，保留供非 BFF 调用路径使用
   */
  getListViewPaginated: async (params: any): Promise<{ items: any[], total: number, page: number, size: number }> => {
    const response = await apiClient.get('/cases', { params })
    const data = response.data?.data || { items: [], total: 0, page: 1, size: 20 }
    return data
  },

  // ==================== BFF 视图接口（POST /api/bff/v1/cases/views/*）====================
  // 路径以 / 开头，axios 将使用 baseURL 的 origin 而非 /api/v1 前缀，
  // 即最终请求 http://localhost:8000/api/bff/v1/...

  /**
   * 列表视图 BFF
   * POST /api/bff/v1/cases/views/list
   */
  getListViewBff: async (body: any): Promise<{
    casesTotal: number; casesPage: number; casesSize: number;
    cases: any[]; clues: any[]; tasks: any[];
  }> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/views/list`, body)
    return response.data?.data || { casesTotal: 0, casesPage: 1, casesSize: 20, cases: [], clues: [], tasks: [] }
  },

  /**
   * 看板视图 BFF
   * POST /api/bff/v1/cases/views/kanban
   */
  getKanbanViewBff: async (body: any): Promise<{
    columns: Array<{ stageCode: string; stageName: string; sortOrder: number; totalCount: number; cases: any[] }>;
    clues: any[];
  }> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/views/kanban`, body)
    return response.data?.data || { columns: [], clues: [] }
  },

  /**
   * 日历视图 BFF
   * POST /api/bff/v1/cases/views/calendar
   */
  getCalendarViewBff: async (body: any): Promise<{
    rangeStart: string; rangeEnd: string;
    events: Array<{ eventDate: string; eventType: string; caseId: string; caseInternalNo: string; caseName: string; title: string; riskLevel: string | null; taskNodeId: string | null }>;
  }> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/views/calendar`, body)
    return response.data?.data || { rangeStart: '', rangeEnd: '', events: [] }
  },

  /**
   * 台账视图 BFF
   * POST /api/bff/v1/cases/views/ledger
   */
  getLedgerViewBff: async (body: any): Promise<{
    total: number; page: number; size: number;
    items: any[];
    aggregate: { totalCases: number; totalTargetAmount: number; totalProvisionAmount: number; totalFeesOut: number; totalFeesIn: number; totalEstimatedLiability: number };
  }> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/views/ledger`, body)
    return response.data?.data || { total: 0, page: 1, size: 20, items: [], aggregate: { totalCases: 0, totalTargetAmount: 0, totalProvisionAmount: 0, totalFeesOut: 0, totalFeesIn: 0, totalEstimatedLiability: 0 } }
  },

  /**
   * 顶部统计卡 BFF（全量聚合，不受分页影响）
   * POST /api/bff/v1/cases/views/summary-stats
   */
  /**
   * NOTE: 响应拦截器已将 snake_case 转为 camelCase，实际字段为：
   * inProgress, majorRisk, newThisMonth, closingSoon, overdueTasks, totalAmount 等
   */
  getSummaryStatsBff: async (body: any): Promise<{
    total: number; inProgress: number; closed: number; suspended: number; pending: number;
    majorRisk: number; newThisMonth: number; closingSoon: number; overdueTasks: number;
    totalAmount: number;
    byStage: Array<{ code: string; name: string | null; count: number }>;
    byRiskLevel: Array<{ code: string; name: string | null; count: number }>;
    byBusinessLine: Array<{ code: string; name: string | null; count: number }>;
  }> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/views/summary-stats`, body)
    return response.data?.data || {
      total: 0, inProgress: 0, closed: 0, suspended: 0, pending: 0,
      majorRisk: 0, newThisMonth: 0, closingSoon: 0, overdueTasks: 0,
      totalAmount: 0,
      byStage: [], byRiskLevel: [], byBusinessLine: [],
    }
  },

  /**
   * 台账导出 Excel
   * POST /api/bff/v1/cases/export/ledger
   * 返回 blob，前端自行触发下载
   */
  exportLedgerBff: async (body: any): Promise<Blob> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/export/ledger`, body, {
      responseType: 'blob',
      headers: {
        Authorization: getAuthToken() ? `Bearer ${getAuthToken()}` : '',
        'Content-Type': 'application/json',
      },
    })
    return response.data
  },

  // ==================== 2.S2.a: 抽屉概要 + 基础信息更新 ====================

  /**
   * 抽屉概要 (多态: CASE / CLUE / EXECUTABLE_TASK)
   * POST /api/bff/v1/cases/drawer/summary
   */
  getDrawerSummaryBff: async (id: string, itemType: 'CASE' | 'CLUE' | 'EXECUTABLE_TASK'): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/drawer/summary`, {
      id,
      item_type: itemType,
    })
    return response.data?.data || null
  },

  /**
   * 案件基础信息局部更新 (右侧栏 / 抽屉 / 概览 Tab 共用)
   * POST /api/bff/v1/cases/base-info/update
   */
  updateCaseBaseInfoBff: async (caseId: string, patch: Record<string, any>): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/base-info/update`, {
      case_id: caseId,
      patch,
    })
    return response.data?.data || null
  },

  /**
   * 案件阶段变更 (看板拖拽 / 详情页状态下拉)
   * POST /api/bff/v1/cases/stage/change
   */
  changeCaseStageBff: async (caseId: string, newStageCode: string, remark?: string): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/stage/change`, {
      case_id: caseId,
      new_stage_code: newStageCode,
      remark: remark || null,
    })
    return response.data?.data || null
  },

  /**
   * 2.S2.b: 案件详情右侧栏 (全局属性 + 人员矩阵)
   * POST /api/bff/v1/cases/detail/sidebar
   */
  getCaseDetailSidebarBff: async (caseId: string): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/detail/sidebar`, { case_id: caseId })
    return response.data?.data || null
  },

  /**
   * 2.S2.b: 案件详情概览 Tab
   * POST /api/bff/v1/cases/detail/overview
   */
  getCaseDetailOverviewBff: async (caseId: string): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/detail/overview`, { case_id: caseId })
    return response.data?.data || null
  },

  /**
   * 2.S2.b: 当前用户对该案件的 9 键权限
   * POST /api/bff/v1/cases/detail/permissions
   */
  getCaseDetailPermissionsBff: async (caseId: string): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/detail/permissions`, { case_id: caseId })
    return response.data?.data || null
  },

  /**
   * 2.S2.b: 案件成员管理 (ADD / REMOVE / SET_PRIMARY)
   * POST /api/bff/v1/cases/members/manage
   */
  manageCaseMembersBff: async (params: {
    caseId: string
    action: 'ADD' | 'REMOVE' | 'SET_PRIMARY'
    roleCode?: string
    userIds: string[]
    customPermissions?: Record<string, any>
  }): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/members/manage`, {
      case_id: params.caseId,
      action: params.action,
      role_code: params.roleCode || null,
      user_ids: params.userIds,
      custom_permissions: params.customPermissions || null,
    })
    return response.data?.data || null
  },

  /**
   * 3.S2-PRE: 成员候选人搜索
   * POST /api/bff/v1/cases/members/users/search
   */
  searchMemberCandidatesBff: async (q: string, limit = 20): Promise<{ id: string; name: string; username: string; email?: string; title?: string }[]> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/members/users/search`, { q, limit })
    return response.data?.data?.items || []
  },

  /**
   * 3.S2-PRE-2: 查询案件最新策略
   * POST /api/bff/v1/cases/strategy/get
   */
  getStrategyBff: async (caseId: string): Promise<{ id: string; caseId: string; direction: string; winProbability: number; analysis: string; updatedAt: string } | null> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/strategy/get`, { case_id: caseId })
    return response.data?.data || null
  },

  /**
   * 3.S2-PRE-2: 新建或覆盖案件策略
   * POST /api/bff/v1/cases/strategy/save
   */
  saveStrategyBff: async (params: { caseId: string; direction: string; winProbability: number; analysis: string }): Promise<{ id: string; caseId: string; direction: string; winProbability: number; analysis: string; updatedAt: string }> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/strategy/save`, {
      case_id: params.caseId,
      direction: params.direction,
      win_probability: params.winProbability,
      analysis: params.analysis,
    })
    return response.data?.data
  },

  // ==================== 2.S3: 案件详情 - 当事人 CRUD + 审计日志 ====================

  /**
   * 列出案件全部当事人
   * POST /api/bff/v1/cases/parties/list
   */
  listPartiesBff: async (caseId: string): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/parties/list`, {
      case_id: caseId,
    })
    return response.data?.data || { case_id: caseId, total: 0, parties: [], our_side_count: 0, opposing_count: 0 }
  },

  /**
   * 查询单个当事人详情 (编辑表单回显)
   * POST /api/bff/v1/cases/parties/detail
   */
  getPartyDetailBff: async (partyId: string): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/parties/detail`, {
      party_id: partyId,
    })
    return response.data?.data || null
  },

  /**
   * 新增当事人 (含冲突预警)
   * POST /api/bff/v1/cases/parties/add
   * Response: { party: PartyVO, warnings: ConflictWarningVO[] }
   */
  addPartyBff: async (payload: Record<string, any>): Promise<{
    party: any
    warnings: ConflictWarningVO[]
  }> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/parties/add`, payload)
    return response.data?.data || { party: null, warnings: [] }
  },

  /**
   * 编辑当事人 (PATCH 语义)
   * POST /api/bff/v1/cases/parties/update
   */
  updatePartyBff: async (partyId: string, patch: Record<string, any>): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/parties/update`, {
      party_id: partyId,
      patch,
    })
    return response.data?.data || null
  },

  /**
   * 软删除当事人
   * POST /api/bff/v1/cases/parties/remove
   */
  removePartyBff: async (partyId: string, reason?: string): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/parties/remove`, {
      party_id: partyId,
      reason: reason || null,
    })
    return response.data?.data || null
  },

  /**
   * 批量维护当事人 (立案表单复用)
   * POST /api/bff/v1/cases/parties/batch-upsert
   */
  batchUpsertPartiesBff: async (caseId: string, parties: Array<Record<string, any>>): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/parties/batch-upsert`, {
      case_id: caseId,
      parties,
    })
    return response.data?.data || null
  },

  /**
   * 审计日志时间轴查询 (PARTIES / MEMBERS 等模块)
   * POST /api/bff/v1/cases/audit-logs/query
   */
  queryAuditLogsBff: async (params: {
    caseId: string
    actionModules?: string[]
    page?: number
    size?: number
  }): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/audit-logs/query`, {
      case_id: params.caseId,
      action_modules: params.actionModules || null,
      pagination: { page: params.page || 1, size: params.size || 50 },
    })
    return response.data?.data || { total: 0, page: 1, size: 50, items: [] }
  },

  // ==================== 2.S4: 流程时间轴 + 节点操作 + 协作任务 ====================

  /**
   * 流程时间轴 (按阶段聚合 process_instances + process_nodes)
   * POST /api/bff/v1/cases/process/timeline
   */
  getProcessTimelineBff: async (caseId: string): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/process/timeline`, {
      case_id: caseId,
    })
    return response.data?.data || { case_id: caseId, instances: [] }
  },

  /**
   * 阶段推进 (决策 D2 force 模式)
   * POST /api/bff/v1/cases/process/stage/advance
   */
  advanceStageBff: async (params: {
    caseId: string
    nextStageCode: string
    force?: boolean
    remark?: string
  }): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/process/stage/advance`, {
      case_id: params.caseId,
      next_stage_code: params.nextStageCode,
      force: params.force ?? false,
      remark: params.remark ?? null,
    })
    return response.data?.data || null
  },

  /**
   * 完成流程节点 (canManageProcess)
   * POST /api/bff/v1/cases/process/nodes/complete
   */
  completeNodeBff: async (params: {
    nodeId: string
    completedDate?: string
    resultData?: Record<string, any>
    remark?: string
  }): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/process/nodes/complete`, {
      node_id: params.nodeId,
      completed_date: params.completedDate ?? null,
      result_data: params.resultData ?? null,
      remark: params.remark ?? null,
    })
    return response.data?.data || null
  },

  /**
   * 跳过流程节点 (canChangeStage, 决策 D3)
   * POST /api/bff/v1/cases/process/nodes/skip
   */
  skipNodeBff: async (nodeId: string, reason: string): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/process/nodes/skip`, {
      node_id: nodeId,
      reason,
    })
    return response.data?.data || null
  },

  /**
   * 新增自定义流程节点
   * POST /api/bff/v1/cases/process/nodes/create
   */
  createNodeBff: async (payload: Record<string, any>): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/process/nodes/create`, payload)
    return response.data?.data || null
  },

  /**
   * 更新流程节点 (PATCH 白名单)
   * POST /api/bff/v1/cases/process/nodes/update
   */
  updateNodeBff: async (nodeId: string, patch: Record<string, any>): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/process/nodes/update`, {
      node_id: nodeId,
      patch,
    })
    return response.data?.data || null
  },

  /**
   * 删除自定义节点 (Guard: 仅 task_template_id=null)
   * POST /api/bff/v1/cases/process/nodes/delete
   */
  deleteNodeBff: async (nodeId: string, reason?: string): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/process/nodes/delete`, {
      node_id: nodeId,
      reason: reason ?? null,
    })
    return response.data?.data || null
  },

  /**
   * 协作任务列表 (case_action_items)
   * POST /api/bff/v1/cases/tasks/list
   */
  listTasksBff: async (params: {
    caseId: string
    statusFilter?: string[]
    assigneeId?: string
    page?: number
    size?: number
  }): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/tasks/list`, {
      case_id: params.caseId,
      status_filter: params.statusFilter ?? null,
      assignee_id: params.assigneeId ?? null,
      pagination: { page: params.page ?? 1, size: params.size ?? 50 },
    })
    return response.data?.data || { total: 0, page: 1, size: 50, items: [] }
  },

  /**
   * 创建协作任务 (canManageProcess)
   * POST /api/bff/v1/cases/tasks/create
   */
  createTaskBff: async (payload: Record<string, any>): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/tasks/create`, payload)
    return response.data?.data || null
  },

  /**
   * 更新任务状态 (特例: assignee 自己无需 canManageProcess)
   * POST /api/bff/v1/cases/tasks/update-status
   */
  updateTaskStatusBff: async (params: {
    taskId: string
    newStatus: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED'
    remark?: string
  }): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/tasks/update-status`, {
      task_id: params.taskId,
      new_status: params.newStatus,
      remark: params.remark ?? null,
    })
    return response.data?.data || null
  },

  /**
   * 删除协作任务 (软删除, canManageProcess)
   * POST /api/bff/v1/cases/tasks/delete
   */
  deleteTaskBff: async (taskId: string, reason?: string): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/tasks/delete`, {
      task_id: taskId,
      reason: reason ?? null,
    })
    return response.data?.data || null
  },

  // ==================== 2.S5: 卷宗/文档 (14 逻辑端点 = 19 路径) ====================

  /** POST /api/bff/v1/cases/dossier/tree */
  getDossierTreeBff: async (caseId: string): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/dossier/tree`, {
      case_id: caseId,
    })
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/cases/dossier/documents/list */
  listDocumentsBff: async (params: {
    caseId: string
    folderId: string
    docCategory?: string
    page?: number
    size?: number
  }): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/dossier/documents/list`, {
      case_id: params.caseId,
      folder_id: params.folderId,
      doc_category: params.docCategory ?? null,
      pagination: { page: params.page ?? 1, size: params.size ?? 50 },
    })
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/cases/dossier/documents/detail */
  getDocumentDetailBff: async (docId: string): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/dossier/documents/detail`, {
      doc_id: docId,
    })
    return response.data?.data ?? null
  },

  /**
   * POST /api/bff/v1/cases/dossier/upload/init
   * D1: 直传 presigned URL; 若 skip_upload=true 则秒传
   */
  initUploadBff: async (payload: {
    caseId: string
    folderId: string
    docName: string
    docType: string
    docSize: number
    docCategory?: string
    fileHash?: string
    parentDocId?: string
    evidenceNo?: string
    proofPurpose?: string
    isConfidential?: boolean
    processNodeId?: string
  }): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/dossier/upload/init`, {
      case_id: payload.caseId,
      folder_id: payload.folderId,
      doc_name: payload.docName,
      doc_type: payload.docType,
      doc_size: payload.docSize,
      doc_category: payload.docCategory ?? null,
      file_hash: payload.fileHash ?? null,
      parent_doc_id: payload.parentDocId ?? null,
      evidence_no: payload.evidenceNo ?? null,
      proof_purpose: payload.proofPurpose ?? null,
      is_confidential: payload.isConfidential ?? false,
      process_node_id: payload.processNodeId ?? null,
    })
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/cases/dossier/upload/complete */
  completeUploadBff: async (uploadId: string, etag?: string): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/dossier/upload/complete`, {
      upload_id: uploadId,
      etag: etag ?? null,
    })
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/cases/dossier/upload/abort */
  abortUploadBff: async (uploadId: string): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/dossier/upload/abort`, {
      upload_id: uploadId,
    })
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/cases/dossier/download-url */
  getDownloadUrlBff: async (docId: string, disposition: 'attachment' | 'inline' = 'attachment'): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/dossier/download-url`, {
      doc_id: docId,
      disposition,
    })
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/cases/dossier/documents/rename */
  renameDocumentBff: async (docId: string, newName: string): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/dossier/documents/rename`, {
      doc_id: docId,
      new_name: newName,
    })
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/cases/dossier/documents/move */
  moveDocumentBff: async (docId: string, targetFolderId: string): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/dossier/documents/move`, {
      doc_id: docId,
      target_folder_id: targetFolderId,
    })
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/cases/dossier/documents/delete */
  deleteDocumentBff: async (docId: string, reason?: string): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/dossier/documents/delete`, {
      doc_id: docId,
      reason: reason ?? null,
    })
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/cases/dossier/folders/create */
  createFolderBff: async (params: {
    caseId: string
    parentId?: string
    folderName: string
    sortOrder?: number
  }): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/dossier/folders/create`, {
      case_id: params.caseId,
      parent_id: params.parentId ?? null,
      folder_name: params.folderName,
      sort_order: params.sortOrder ?? 0,
    })
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/cases/dossier/folders/rename */
  renameFolderBff: async (folderId: string, newName: string): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/dossier/folders/rename`, {
      folder_id: folderId,
      new_name: newName,
    })
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/cases/dossier/folders/delete */
  deleteFolderBff: async (folderId: string, reason?: string): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/dossier/folders/delete`, {
      folder_id: folderId,
      reason: reason ?? null,
    })
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/cases/dossier/permissions/grant */
  grantPermissionBff: async (params: {
    caseId: string
    targetType: 'FOLDER' | 'DOCUMENT'
    targetId: string
    granteeType: 'USER' | 'ROLE' | 'DEPT'
    granteeId: string
    permissionType: 'VIEW' | 'DOWNLOAD' | 'EDIT'
    expireAt?: string
  }): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/dossier/permissions/grant`, {
      case_id: params.caseId,
      target_type: params.targetType,
      target_id: params.targetId,
      grantee_type: params.granteeType,
      grantee_id: params.granteeId,
      permission_type: params.permissionType,
      expire_at: params.expireAt ?? null,
    })
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/cases/dossier/permissions/revoke */
  revokePermissionBff: async (permissionId: string, reason?: string): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/dossier/permissions/revoke`, {
      permission_id: permissionId,
      reason: reason ?? null,
    })
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/cases/dossier/permissions/list */
  listPermissionsBff: async (params: {
    caseId: string
    targetType?: 'FOLDER' | 'DOCUMENT'
    targetId?: string
  }): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/dossier/permissions/list`, {
      case_id: params.caseId,
      target_type: params.targetType ?? null,
      target_id: params.targetId ?? null,
    })
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/cases/dossier/auth-requests/create */
  createAuthRequestBff: async (params: {
    caseId: string
    targetType: 'FOLDER' | 'DOCUMENT'
    targetId: string
    requestedPermission: 'VIEW' | 'DOWNLOAD' | 'EDIT'
    reason: string
    requestedDurationDays?: number
  }): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/dossier/auth-requests/create`, {
      case_id: params.caseId,
      target_type: params.targetType,
      target_id: params.targetId,
      requested_permission: params.requestedPermission,
      reason: params.reason,
      requested_duration_days: params.requestedDurationDays ?? null,
    })
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/cases/dossier/auth-requests/review */
  reviewAuthRequestBff: async (
    requestId: string,
    action: 'APPROVE' | 'REJECT',
    comment?: string,
  ): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/dossier/auth-requests/review`, {
      request_id: requestId,
      action,
      comment: comment ?? null,
    })
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/cases/dossier/auth-requests/list */
  listAuthRequestsBff: async (params: {
    caseId: string
    statusFilter?: Array<'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED'>
    page?: number
    size?: number
  }): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/dossier/auth-requests/list`, {
      case_id: params.caseId,
      status_filter: params.statusFilter ?? null,
      pagination: { page: params.page ?? 1, size: params.size ?? 50 },
    })
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/cases/dossier/evidence-catalog — 证据目录自动生成 */
  generateEvidenceCatalogBff: async (caseId: string): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/dossier/evidence-catalog`, {
      case_id: caseId,
    })
    return response.data?.data ?? null
  },

  // ================================================================
  // 切片 2.S6: 案件详情 - 财务 Tab (6 BFF 端点)
  // 权限 (D4'-1): 读 can_view_finance / 写 can_edit_base_info
  // 后端设计: docs/design/v1/api/02_case_center/05_case_detail_finance_api_plan.md
  // ================================================================

  /** POST /api/bff/v1/cases/finance/snapshot — 财务快照 */
  getFinanceSnapshotBff: async (caseId: string): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/finance/snapshot`, {
      case_id: caseId,
    })
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/cases/finance/update — 更新财务基础数据 (PATCH) */
  updateFinanceBff: async (
    caseId: string,
    fields: {
      target_amount?: number | string | null
      provision_amount?: number | string | null
      judgment_amount?: number | string | null
      judgment_principal?: number | string | null
      judgment_interest?: number | string | null
      judgment_penalty?: number | string | null
      judgment_date?: string | null
      notes?: string | null
    },
  ): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/finance/update`, {
      case_id: caseId,
      fields,
    })
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/cases/finance/provisions/add — 新增计提 */
  addProvisionBff: async (params: {
    caseId: string
    actionType: 'PROVISION' | 'ADJUSTMENT' | 'REVERSAL'
    adjustmentAmount: number | string
    currency?: 'CNY' | 'USD' | 'EUR' | 'HKD'
    assessmentDate: string
    riskProbability: 'PROBABLE' | 'POSSIBLE' | 'REMOTE'
    basisOfEstimate: string
    attachmentIds?: string[]
  }): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/finance/provisions/add`, {
      case_id: params.caseId,
      action_type: params.actionType,
      adjustment_amount: params.adjustmentAmount,
      currency: params.currency ?? 'CNY',
      assessment_date: params.assessmentDate,
      risk_probability: params.riskProbability,
      basis_of_estimate: params.basisOfEstimate,
      attachment_ids: params.attachmentIds ?? [],
    })
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/cases/finance/provisions/history — 计提流水 */
  getProvisionsHistoryBff: async (params: {
    caseId: string
    page?: number
    size?: number
  }): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/finance/provisions/history`, {
      case_id: params.caseId,
      pagination: { page: params.page ?? 1, size: params.size ?? 50 },
    })
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/cases/finance/spend/record — 费用登记 (悲观锁) */
  recordSpendBff: async (params: {
    caseId: string
    transactionType: string
    amount: number | string
    currency?: 'CNY' | 'USD' | 'EUR' | 'HKD'
    applyDate?: string | null
    counterpartyName?: string | null
    voucherNo?: string | null
    description?: string | null
    processNodeId?: string | null
    associatedPartyId?: string | null
  }): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/finance/spend/record`, {
      case_id: params.caseId,
      transaction_type: params.transactionType,
      amount: params.amount,
      currency: params.currency ?? 'CNY',
      apply_date: params.applyDate ?? null,
      counterparty_name: params.counterpartyName ?? null,
      voucher_no: params.voucherNo ?? null,
      description: params.description ?? null,
      process_node_id: params.processNodeId ?? null,
      associated_party_id: params.associatedPartyId ?? null,
    })
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/cases/finance/spend/list — 本案件费用明细 */
  getSpendListBff: async (params: {
    caseId: string
    transactionType?: string | null
    transactionStatus?: 'PENDING' | 'APPROVED' | 'EXECUTED' | 'REJECTED' | 'CANCELLED' | null
    page?: number
    size?: number
  }): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/finance/spend/list`, {
      case_id: params.caseId,
      transaction_type: params.transactionType ?? null,
      transaction_status: params.transactionStatus ?? null,
      pagination: { page: params.page ?? 1, size: params.size ?? 50 },
    })
    return response.data?.data ?? null
  },

  // ================================================================
  // 切片 2.S7: 案件详情 - 外聘律师 Tab (5 BFF 端点)
  // 权限 (D4=A): 读 list 案件成员 / 写 can_manage_members
  // D1=A 合同走 case_documents; D3=C 一体式 attach; D5=A unassign soft
  // 后端设计: docs/design/v1/api/02_case_center/08_case_detail_counsels_api_plan.md
  // ================================================================

  /** POST /api/bff/v1/cases/counsels/list — 代理律师列表 (INTERNAL+EXTERNAL) */
  getCounselsListBff: async (params: {
    caseId: string
    statusFilter?: Array<'ACTIVE' | 'TERMINATED' | 'COMPLETED'>
  }): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/counsels/list`, {
      case_id: params.caseId,
      status_filter: params.statusFilter ?? null,
    })
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/cases/counsels/internal/assign — 指派内部律师 */
  assignInternalCounselBff: async (params: {
    caseId: string
    userId: string
    roleInCase?: 'LEAD' | 'CO_COUNSEL'
    contactPhone?: string | null
    contactEmail?: string | null
  }): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/counsels/internal/assign`, {
      case_id: params.caseId,
      user_id: params.userId,
      role_in_case: params.roleInCase ?? 'LEAD',
      contact_phone: params.contactPhone ?? null,
      contact_email: params.contactEmail ?? null,
    })
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/cases/counsels/external/assign — 指派外部律师 */
  assignExternalCounselBff: async (params: {
    caseId: string
    externalLawyerId: string
    roleInCase?: 'LEAD' | 'CO_COUNSEL'
    contractId?: string | null
    contactPhone?: string | null
    contactEmail?: string | null
  }): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/counsels/external/assign`, {
      case_id: params.caseId,
      external_lawyer_id: params.externalLawyerId,
      role_in_case: params.roleInCase ?? 'LEAD',
      contract_id: params.contractId ?? null,
      contact_phone: params.contactPhone ?? null,
      contact_email: params.contactEmail ?? null,
    })
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/cases/counsels/unassign — 解聘律师 (soft, 可选评分) */
  unassignCounselBff: async (params: {
    counselId: string
    reason?: string | null
    performanceRating?: number | null
    evaluationComment?: string | null
  }): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/counsels/unassign`, {
      counsel_id: params.counselId,
      reason: params.reason ?? null,
      performance_rating: params.performanceRating ?? null,
      evaluation_comment: params.evaluationComment ?? null,
    })
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/cases/contracts/attach — 创建合同 (一体式 D3=C) */
  attachContractBff: async (params: {
    caseId: string
    contractNo?: string | null
    contractName: string
    lawFirmId: string
    signDate?: string | null
    feeType: 'FIXED' | 'HOURLY' | 'CONTINGENCY' | 'MIXED'
    currency?: 'CNY' | 'USD' | 'EUR' | 'HKD'
    totalAmount?: number | string | null
    contingencyRate?: number | string | null
    paymentTerms?: string | null
    status?: 'DRAFT' | 'SIGNING' | 'SIGNED' | 'COMPLETED' | 'TERMINATED'
    attachmentIds?: string[]
    bindCounselId?: string | null
  }): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/contracts/attach`, {
      case_id: params.caseId,
      contract_no: params.contractNo ?? null,
      contract_name: params.contractName,
      law_firm_id: params.lawFirmId,
      sign_date: params.signDate ?? null,
      fee_type: params.feeType,
      currency: params.currency ?? 'CNY',
      total_amount: params.totalAmount ?? null,
      contingency_rate: params.contingencyRate ?? null,
      payment_terms: params.paymentTerms ?? null,
      status: params.status ?? 'SIGNED',
      attachment_ids: params.attachmentIds ?? [],
      bind_counsel_id: params.bindCounselId ?? null,
    })
    return response.data?.data ?? null
  },

  // ================================================================
  // 切片 2.S8: 案件详情 - 合规 Tab (4 BFF 端点)
  // 权限 (D5=A): 读 案件成员 / 写 can_edit_base_info
  // D1=A 硬编码 CHECKLIST_TEMPLATES; D2=A extended_data 深度合并;
  // D3=A 轻实现信披 (绝对值 1000W)
  // 后端设计: docs/design/v1/api/02_case_center/09_case_detail_compliance_api_plan.md
  // ================================================================

  /** POST /api/bff/v1/cases/compliance/checklist — 合规检查清单 */
  getComplianceChecklistBff: async (caseId: string): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/compliance/checklist`, {
      case_id: caseId,
    })
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/cases/compliance/checklist/submit — 提交清单勾选 */
  submitComplianceChecklistBff: async (params: {
    caseId: string
    items: Array<{
      itemId: string
      isCompliant: boolean
      notes?: string | null
      attachmentIds?: string[]
    }>
  }): Promise<any> => {
    const response = await apiClient.post(
      `${BFF_BASE}/cases/compliance/checklist/submit`,
      {
        case_id: params.caseId,
        items: params.items.map((it) => ({
          item_id: it.itemId,
          is_compliant: it.isCompliant,
          notes: it.notes ?? null,
          attachment_ids: it.attachmentIds ?? [],
        })),
      },
    )
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/cases/compliance/disclosures — 信披判定 + 历史 */
  getComplianceDisclosuresBff: async (caseId: string): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/compliance/disclosures`, {
      case_id: caseId,
    })
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/cases/compliance/attributes — 合规属性汇总 */
  getComplianceAttributesBff: async (caseId: string): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/compliance/attributes`, {
      case_id: caseId,
    })
    return response.data?.data ?? null
  },

  // ================================================================
  // 切片 2.S9: 案件详情 - 结案 / 归档 / 终本 (6 BFF 端点)
  // 权限 (D7):
  //   - closing/info + archiving/validate: 案件成员
  //   - closing/submit + zhongben/*: can_close_case 或 can_edit_base_info
  //   - archiving/submit: can_close_case + LEGAL_ADMIN/SYS_ADMIN 双校验
  // 副作用: closing/submit → CLOSED; archiving/submit → ARCHIVED (全局只读锁)
  // 后端设计: docs/design/v1/api/02_case_center/10_case_detail_closing_api_plan.md
  // ================================================================

  /** POST /api/bff/v1/cases/closing/info — 结案登记信息 */
  getClosingInfoBff: async (caseId: string): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/closing/info`, {
      case_id: caseId,
    })
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/cases/closing/submit — 提交结案登记 (case_status → CLOSED) */
  submitClosingBff: async (params: {
    caseId: string
    closureDate: string
    closureType: string
    reviewSummary: string
    improvementPlan?: string | null
    checklistData?: Record<string, any>
    status?: 'DRAFT' | 'APPROVED'
  }): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/closing/submit`, {
      case_id: params.caseId,
      closure_date: params.closureDate,
      closure_type: params.closureType,
      review_summary: params.reviewSummary,
      improvement_plan: params.improvementPlan ?? null,
      checklist_data: params.checklistData ?? {
        all_fees_paid: false,
        preservations_released: false,
        documents_archived: false,
      },
      status: params.status ?? 'DRAFT',
    })
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/cases/archiving/validate — 归档前 6 规则校验 */
  validateArchivingBff: async (caseId: string): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/archiving/validate`, {
      case_id: caseId,
    })
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/cases/archiving/submit — 归档 (case_status → ARCHIVED, 触发全局只读锁) */
  submitArchivingBff: async (params: {
    caseId: string
    archiveNo: string
    archiveNote?: string | null
  }): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/archiving/submit`, {
      case_id: params.caseId,
      archive_no: params.archiveNo,
      archive_note: params.archiveNote ?? null,
    })
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/cases/execution/zhongben/register — 终本登记 */
  registerZhongbenBff: async (params: {
    caseId: string
    registerDate: string
    nonExecutedAmount: string | number
    currency?: string
    attachmentIds?: string[]
    rulingNo?: string | null
    reason?: string | null
  }): Promise<any> => {
    const response = await apiClient.post(
      `${BFF_BASE}/cases/execution/zhongben/register`,
      {
        case_id: params.caseId,
        register_date: params.registerDate,
        non_executed_amount: params.nonExecutedAmount,
        currency: params.currency ?? 'CNY',
        attachment_ids: params.attachmentIds ?? [],
        ruling_no: params.rulingNo ?? null,
        reason: params.reason ?? null,
      },
    )
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/cases/execution/zhongben/reminders/setup — 终本周期复查提醒 */
  setupZhongbenReminderBff: async (params: {
    caseId: string
    intervalMonths: number
    assigneeId: string
    note?: string | null
  }): Promise<any> => {
    const response = await apiClient.post(
      `${BFF_BASE}/cases/execution/zhongben/reminders/setup`,
      {
        case_id: params.caseId,
        interval_months: params.intervalMonths,
        assignee_id: params.assigneeId,
        note: params.note ?? null,
      },
    )
    return response.data?.data ?? null
  },

  // ================================================================
  // 切片 2.S10: 案件新建 + 辅助功能 (9 BFF 端点)
  // 权限 (D4=A):
  //   - create / drafts/* / from-clue / memos/add: 登录用户
  //   - activities/query: 案件成员 (复用 S3 audit-logs/query)
  //   - milestones/complete: can_manage_process (复用 S4)
  //   - collaboration/create: can_manage_process (复用 S4)
  // 后端设计: docs/design/v1/api/02_case_center/11_case_creation_api_plan.md v1.0
  // ================================================================

  /** POST /api/bff/v1/cases/create — 创建正式案件 (主事务 7 步) */
  createCaseBff: async (payload: Record<string, any>): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/create`, payload)
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/cases/drafts/save — 保存立案草稿 */
  saveDraftBff: async (params: {
    draftId?: string | null
    draftData: Record<string, any>
    sourceClueId?: string | null
  }): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/drafts/save`, {
      draft_id: params.draftId ?? null,
      draft_data: params.draftData,
      source_clue_id: params.sourceClueId ?? null,
    })
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/cases/drafts/list — 当前用户草稿列表 */
  listDraftsBff: async (
    pagination: { page?: number; size?: number } = {},
  ): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/drafts/list`, {
      pagination: {
        page: pagination.page ?? 1,
        size: pagination.size ?? 20,
      },
    })
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/cases/drafts/delete — 软删草稿 */
  deleteDraftBff: async (draftId: string): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/drafts/delete`, {
      draft_id: draftId,
    })
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/cases/from-clue/prepare — 线索预填草稿 payload */
  prepareFromClueBff: async (clueId: string): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/from-clue/prepare`, {
      clue_id: clueId,
    })
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/cases/activities/query — 活动流聚合 (S3 audit-logs/query 别名) */
  queryActivitiesBff: async (params: {
    caseId: string
    modules?: string[]
    pagination?: { page?: number; size?: number }
  }): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/activities/query`, {
      case_id: params.caseId,
      action_modules: params.modules ?? null,
      pagination: params.pagination
        ? { page: params.pagination.page ?? 1, size: params.pagination.size ?? 50 }
        : null,
    })
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/cases/memos/add — 添加案件备注 */
  addMemoBff: async (params: {
    caseId: string
    memoType: string
    title?: string | null
    content: string
    visibility?: 'INTERNAL_LEGAL_ONLY' | 'PUBLIC_TO_FOLLOWERS' | 'PUBLIC'
    mentionedUsers?: string[]
    attachmentIds?: string[]
    processNodeId?: string | null
    isPinned?: boolean
  }): Promise<any> => {
    const response = await apiClient.post(`${BFF_BASE}/cases/memos/add`, {
      case_id: params.caseId,
      memo_type: params.memoType,
      title: params.title ?? null,
      content: params.content,
      visibility: params.visibility ?? 'PUBLIC_TO_FOLLOWERS',
      mentioned_users: params.mentionedUsers ?? [],
      attachment_ids: params.attachmentIds ?? [],
      process_node_id: params.processNodeId ?? null,
      is_pinned: params.isPinned ?? false,
    })
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/cases/milestones/complete — 里程碑完成 (S4 process/nodes/complete 别名) */
  completeMilestoneBff: async (params: {
    caseId: string
    nodeId: string
    completionNote?: string | null
    attachmentIds?: string[]
  }): Promise<any> => {
    const response = await apiClient.post(
      `${BFF_BASE}/cases/milestones/complete`,
      {
        case_id: params.caseId,
        node_id: params.nodeId,
        completion_note: params.completionNote ?? null,
        attachment_ids: params.attachmentIds ?? [],
      },
    )
    return response.data?.data ?? null
  },

  /** POST /api/bff/v1/cases/collaboration/create — 创建协作任务 (S4 tasks/create 别名) */
  createCollaborationBff: async (params: {
    caseId: string
    title: string
    assigneeId: string
    priority?: string
    dueDate?: string | null
    description?: string | null
  }): Promise<any> => {
    const response = await apiClient.post(
      `${BFF_BASE}/cases/collaboration/create`,
      {
        case_id: params.caseId,
        title: params.title,
        assignee_id: params.assigneeId,
        priority: params.priority ?? 'MEDIUM',
        due_date: params.dueDate ?? null,
        description: params.description ?? null,
      },
    )
    return response.data?.data ?? null
  },
}