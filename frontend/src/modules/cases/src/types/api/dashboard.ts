/**
 * 工作台仪表盘 API 类型定义
 */

// ==================== 工作台统计 ====================

/**
 * 案件统计数据
 */
export interface CaseStatistics {
  totalCases: number
  activeCases: number
  pendingCases: number
  closedCases: number
  byStage: Record<string, number>
  byType: Record<string, number>
}

/**
 * 财务统计数据
 */
export interface FinanceStatistics {
  totalBudget: number
  usedAmount: number
  remainingAmount: number
  byBusinessLine: Array<{
    businessLine: string
    totalBudget: number
    usedAmount: number
  }>
}

/**
 * 任务统计数据
 */
export interface TaskStatistics {
  totalTasks: number
  pendingTasks: number
  inProgressTasks: number
  completedTasks: number
  overdueTasks: number
}

/**
 * 工作台总览响应
 */
export interface DashboardOverviewResponse {
  caseStatistics: CaseStatistics
  financeStatistics: FinanceStatistics
  taskStatistics: TaskStatistics
  recentActivities: Array<{
    id: string
    type: string
    description: string
    createdAt: string
  }>
  upcomingDeadlines: Array<{
    id: string
    caseId: string
    caseName: string
    deadlineType: string
    deadlineDate: string
    daysRemaining: number
  }>
}