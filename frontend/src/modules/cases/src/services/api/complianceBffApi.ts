/**
 * 合规中心 BFF API (切片 3.S13 + 3.S14)
 *
 * S13 — 8 端点 (全部 POST, D2):
 *   POST /alerts/list               — 合规预警列表
 *   POST /alerts/handle             — 处理预警 (CONVERT_TO_TASK / DISMISS)
 *   POST /governance/issues/list    — 数据质量问题列表
 *   POST /governance/scan           — 触发全量质量扫描
 *   POST /governance/issues/ignore  — 忽略 WARNING 级问题
 *   POST /rules/list                — 合规规则列表
 *   POST /rules/save                — 新建/更新规则 (upsert by ruleCode)
 *   POST /rules/toggle              — 切换规则启停状态
 *
 * S14 — 12 端点 (全部 POST, 挂载于 /tasks/*):
 *   POST /tasks/list                — 报送任务列表
 *   POST /tasks/detail              — 任务详情
 *   POST /tasks/create              — 创建任务 (初始 status=DATA_PREP)
 *   POST /tasks/update-status       — 状态机流转 (DATA_PREP→PENDING_APPROVAL→APPROVED)
 *   POST /tasks/cases/link          — 关联案件
 *   POST /tasks/cases/list          — 已关联案件
 *   POST /tasks/snapshots/create    — 生成快照 (D9: BLOCKER 前置拦截, 错误码 4210)
 *   POST /tasks/snapshots/list      — 快照历史列表
 *   POST /tasks/ai-summary          — AI 智能摘要 (D5=Stub, S17 对接 Qwen)
 *   POST /tasks/content/save        — 保存富文本草稿
 *   POST /tasks/generate            — 定稿渲染 (D5=Stub)
 *   POST /tasks/download            — 组合下载 (report_url + 快照 ossUrl)
 *
 * 状态值 (D3/D4 对齐 Enum):
 *   ComplianceAlertStatus: PENDING / REPORTED / EXEMPTED
 *   IssueStatus: PENDING / RESOLVED / IGNORED
 *   ComplianceRuleStatus: ACTIVE / INACTIVE / DRAFT
 *   ReportingTaskStatus: DATA_PREP / PENDING_APPROVAL / APPROVED / CANCELLED (Q5: APPROVED 终态)
 *
 * 错误码 (S14 新增):
 *   4205 taskId 不存在 | 4207 APPROVED 终态不可修改 | 4208 非法状态转移
 *   4210 存在 BLOCKER 级数据质量问题 (禁止快照) | 4213 报告未生成 (禁止下载)
 *
 * 后端契约:
 *   S13: docs/design/v1/api/04_compliance_center/02_alerts_governance_api_plan.md v1.2
 *   S14: docs/design/v1/api/04_compliance_center/03_unified_tasks_api_plan.md v2.1
 *        docs/design/v1/api/04_compliance_center/04_ai_generation_export_api_plan.md v2.1
 */

import apiClient from './client'

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(
  /\/api\/v1\/?$/,
  '',
)
const COMPLIANCE_BFF_BASE = `${API_ORIGIN}/api/bff/v1/compliance`

export const complianceBffApi = {
  /** POST /alerts/list — 分页获取合规预警 */
  listAlertsBff: async (params: {
    status?: 'PENDING' | 'REPORTED' | 'EXEMPTED' | null
    alertLevel?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | null
    page?: number
    pageSize?: number
  } = {}): Promise<any> => {
    const response = await apiClient.post(`${COMPLIANCE_BFF_BASE}/alerts/list`, {
      status: params.status ?? null,
      alert_level: params.alertLevel ?? null,
      page: params.page ?? 1,
      page_size: params.pageSize ?? 50,
    })
    return response.data?.data ?? null
  },

  /** POST /alerts/handle — 处理单条合规预警 (D3) */
  handleAlertBff: async (params: {
    alertId: string
    action: 'CONVERT_TO_TASK' | 'DISMISS'
    notes?: string | null
  }): Promise<any> => {
    const response = await apiClient.post(`${COMPLIANCE_BFF_BASE}/alerts/handle`, {
      alert_id: params.alertId,
      action: params.action,
      notes: params.notes ?? null,
    })
    return response.data?.data ?? null
  },

  /** POST /governance/issues/list — 数据质量问题列表 (D4) */
  listGovernanceIssuesBff: async (params: {
    severity?: 'BLOCKER' | 'WARNING' | null
    issueType?: 'LOGICAL_CONTRADICTION' | 'MISSING_MANDATORY' | null
    status?: 'PENDING' | 'RESOLVED' | 'IGNORED' | null
    page?: number
    pageSize?: number
  } = {}): Promise<any> => {
    const response = await apiClient.post(`${COMPLIANCE_BFF_BASE}/governance/issues/list`, {
      severity: params.severity ?? null,
      issue_type: params.issueType ?? null,
      status: params.status ?? null,
      page: params.page ?? 1,
      page_size: params.pageSize ?? 50,
    })
    return response.data?.data ?? null
  },

  /** POST /governance/scan — 触发数据质量扫描 (D5, BackgroundTasks 异步) */
  triggerGovernanceScanBff: async (params: {
    scope?: 'ALL_ACTIVE' | 'SPECIFIC_CASES'
    caseIds?: string[]
  } = {}): Promise<any> => {
    const response = await apiClient.post(`${COMPLIANCE_BFF_BASE}/governance/scan`, {
      scope: params.scope ?? 'ALL_ACTIVE',
      case_ids: params.caseIds ?? null,
    })
    return response.data?.data ?? null
  },

  /** POST /governance/issues/ignore — 忽略 WARNING 级问题 (D7: BLOCKER 不可忽略) */
  ignoreGovernanceIssueBff: async (params: {
    issueId: string
    reason: string
  }): Promise<any> => {
    const response = await apiClient.post(`${COMPLIANCE_BFF_BASE}/governance/issues/ignore`, {
      issue_id: params.issueId,
      reason: params.reason,
    })
    return response.data?.data ?? null
  },

  /** POST /rules/list — 合规规则列表 */
  listRulesBff: async (params: {
    ruleType?: 'EVENT_TRIGGERED' | 'TIME_TRIGGERED' | null
    status?: 'ACTIVE' | 'INACTIVE' | 'DRAFT' | null
    page?: number
    pageSize?: number
  } = {}): Promise<any> => {
    const response = await apiClient.post(`${COMPLIANCE_BFF_BASE}/rules/list`, {
      rule_type: params.ruleType ?? null,
      status: params.status ?? null,
      page: params.page ?? 1,
      page_size: params.pageSize ?? 50,
    })
    return response.data?.data ?? null
  },

  /** POST /rules/save — 新建/更新合规规则 (upsert by ruleCode) */
  saveRuleBff: async (params: {
    ruleId?: string | null
    ruleCode: string
    ruleName: string
    ruleType: 'EVENT_TRIGGERED' | 'TIME_TRIGGERED'
    actionType: 'GENERATE_ALERT' | 'GENERATE_TASK' | 'SEND_NOTIFICATION'
    ruleLogic?: Record<string, unknown> | null
    actionConfig?: Record<string, unknown> | null
  }): Promise<any> => {
    const response = await apiClient.post(`${COMPLIANCE_BFF_BASE}/rules/save`, {
      rule_id: params.ruleId ?? null,
      rule_code: params.ruleCode,
      rule_name: params.ruleName,
      rule_type: params.ruleType,
      action_type: params.actionType,
      rule_logic: params.ruleLogic ?? null,
      action_config: params.actionConfig ?? null,
    })
    return response.data?.data ?? null
  },

  /** POST /rules/toggle — 切换规则启停 (DRAFT 状态不允许 toggle, 错误码 4201) */
  toggleRuleBff: async (ruleId: string): Promise<any> => {
    const response = await apiClient.post(`${COMPLIANCE_BFF_BASE}/rules/toggle`, {
      rule_id: ruleId,
    })
    return response.data?.data ?? null
  },

  // ── 3.S14: 报送任务 (12 端点) ─────────────────────────────────────────────

  /** POST /tasks/list — 报送任务列表 */
  listTasksBff: async (params: {
    category?: 'COMPLIANCE_DISCLOSURE' | null
    status?: 'DATA_PREP' | 'PENDING_APPROVAL' | 'APPROVED' | 'CANCELLED' | null
    dueDateStart?: string | null
    dueDateEnd?: string | null
    page?: number
    pageSize?: number
  } = {}): Promise<any> => {
    const response = await apiClient.post(`${COMPLIANCE_BFF_BASE}/tasks/list`, {
      category: params.category ?? null,
      status: params.status ?? null,
      due_date_start: params.dueDateStart ?? null,
      due_date_end: params.dueDateEnd ?? null,
      page: params.page ?? 1,
      page_size: params.pageSize ?? 50,
    })
    return response.data?.data ?? null
  },

  /** POST /tasks/detail — 任务详情 */
  getTaskDetailBff: async (taskId: string): Promise<any> => {
    const response = await apiClient.post(`${COMPLIANCE_BFF_BASE}/tasks/detail`, {
      task_id: taskId,
    })
    return response.data?.data ?? null
  },

  /** POST /tasks/create — 创建报送任务 (初始 status=DATA_PREP, Q2) */
  createTaskBff: async (params: {
    taskName: string
    category?: string
    templateId?: string | null
    dueDate?: string | null
    cycleValue?: string | null
  }): Promise<any> => {
    const response = await apiClient.post(`${COMPLIANCE_BFF_BASE}/tasks/create`, {
      task_name: params.taskName,
      category: params.category ?? 'COMPLIANCE_DISCLOSURE',
      template_id: params.templateId ?? null,
      due_date: params.dueDate ?? null,
      cycle_value: params.cycleValue ?? null,
    })
    return response.data?.data ?? null
  },

  /** POST /tasks/update-status — 状态机流转 (Q5: APPROVED 终态, 错误码 4207/4208) */
  updateTaskStatusBff: async (params: {
    taskId: string
    targetStatus: 'DATA_PREP' | 'PENDING_APPROVAL' | 'APPROVED' | 'CANCELLED'
    comment?: string | null
  }): Promise<any> => {
    const response = await apiClient.post(`${COMPLIANCE_BFF_BASE}/tasks/update-status`, {
      task_id: params.taskId,
      target_status: params.targetStatus,
      comment: params.comment ?? null,
    })
    return response.data?.data ?? null
  },

  /** POST /tasks/cases/link — 关联案件到任务 (Q4: 幂等, linkedCount 计新增数) */
  linkCasesToTaskBff: async (params: {
    taskId: string
    caseIds: string[]
  }): Promise<any> => {
    const response = await apiClient.post(`${COMPLIANCE_BFF_BASE}/tasks/cases/link`, {
      task_id: params.taskId,
      case_ids: params.caseIds,
    })
    return response.data?.data ?? null
  },

  /** POST /tasks/cases/list — 已关联案件列表 (含 hasBlocker / blockerCount) */
  listTaskCasesBff: async (params: {
    taskId: string
    page?: number
    pageSize?: number
  }): Promise<any> => {
    const response = await apiClient.post(`${COMPLIANCE_BFF_BASE}/tasks/cases/list`, {
      task_id: params.taskId,
      page: params.page ?? 1,
      page_size: params.pageSize ?? 100,
    })
    return response.data?.data ?? null
  },

  /** POST /tasks/snapshots/create — 生成快照 (D9: BLOCKER 前置检查, 错误码 4210) */
  createSnapshotBff: async (params: {
    taskId: string
    snapshotName: string
    lockDate: string
    description?: string | null
  }): Promise<any> => {
    const response = await apiClient.post(`${COMPLIANCE_BFF_BASE}/tasks/snapshots/create`, {
      task_id: params.taskId,
      snapshot_name: params.snapshotName,
      lock_date: params.lockDate,
      description: params.description ?? null,
    })
    return response.data?.data ?? null
  },

  /** POST /tasks/snapshots/list — 快照历史列表 */
  listSnapshotsBff: async (params: {
    taskId: string
    page?: number
    pageSize?: number
  }): Promise<any> => {
    const response = await apiClient.post(`${COMPLIANCE_BFF_BASE}/tasks/snapshots/list`, {
      task_id: params.taskId,
      page: params.page ?? 1,
      page_size: params.pageSize ?? 20,
    })
    return response.data?.data ?? null
  },

  /** POST /tasks/ai-summary — AI 智能摘要 (D5=Stub: isStub=true; S17 对接 Qwen) */
  generateAiSummaryBff: async (params: {
    taskId: string
    snapshotId: string
    promptType: 'RISK_SUMMARY' | 'MANAGEMENT_ADVICE' | 'CASE_BRIEF'
  }): Promise<any> => {
    const response = await apiClient.post(`${COMPLIANCE_BFF_BASE}/tasks/ai-summary`, {
      task_id: params.taskId,
      snapshot_id: params.snapshotId,
      prompt_type: params.promptType,
    })
    return response.data?.data ?? null
  },

  /** POST /tasks/content/save — 保存富文本草稿 (写 reporting_tasks.content_data, D4) */
  saveTaskContentBff: async (params: {
    taskId: string
    contentData: string
  }): Promise<any> => {
    const response = await apiClient.post(`${COMPLIANCE_BFF_BASE}/tasks/content/save`, {
      task_id: params.taskId,
      content_data: params.contentData,
    })
    return response.data?.data ?? null
  },

  /** POST /tasks/generate — 定稿渲染 (D5=Stub: 写占位 report_url; Q3: 仅 DATA_PREP 可 generate) */
  generateReportBff: async (params: {
    taskId: string
    snapshotId: string
    excludedCaseIds?: string[]
  }): Promise<any> => {
    const response = await apiClient.post(`${COMPLIANCE_BFF_BASE}/tasks/generate`, {
      task_id: params.taskId,
      snapshot_id: params.snapshotId,
      excluded_case_ids: params.excludedCaseIds ?? [],
    })
    return response.data?.data ?? null
  },

  /** POST /tasks/download — 组合下载 (错误码 4213: 报告未生成禁止下载) */
  downloadTaskBff: async (taskId: string): Promise<any> => {
    const response = await apiClient.post(`${COMPLIANCE_BFF_BASE}/tasks/download`, {
      task_id: taskId,
    })
    return response.data?.data ?? null
  },
}
