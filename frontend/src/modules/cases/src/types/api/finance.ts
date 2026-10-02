/**
 * 财务管理 API 类型定义
 * 与后端 Pydantic Schema 严格对齐
 *
 * 参考: backend/src/schemas/finance.py
 */

// ==================== 枚举类型 ====================

/**
 * 资金流向枚举
 */
export enum FundDirection {
  IN = 'IN',   // 收入
  OUT = 'OUT', // 支出
}

/**
 * 审批状态枚举
 */
export enum ApprovalStatus {
  PENDING = 'PENDING',     // 待审批
  APPROVED = 'APPROVED',   // 已批准
  REJECTED = 'REJECTED',   // 已拒绝
  CANCELLED = 'CANCELLED', // 已取消
}

// ==================== 财务流水 ====================

/**
 * 财务流水创建请求
 * 对应后端: TransactionCreate
 */
export interface TransactionCreateRequest {
  fundDirection: FundDirection
  transactionType: string
  amount: number
  currency?: string
  transactionDate: string  // ISO 8601 (YYYY-MM-DD)
  paymentMethod?: string
  payeeName?: string
  payeeAccount?: string
  voucherNo?: string
  budgetType?: string
  businessLine?: string
  description?: string
  approvalStatus?: ApprovalStatus
  approverId?: string
  approvedAt?: string  // ISO 8601
}

/**
 * 财务流水响应
 * 对应后端: TransactionResponse
 */
export interface TransactionResponse {
  id: string
  caseId: string
  fundDirection: FundDirection
  transactionType: string
  amount: number
  currency: string
  transactionDate: string  // ISO 8601 (YYYY-MM-DD)
  paymentMethod: string | null
  payeeName: string | null
  payeeAccount: string | null
  voucherNo: string | null
  budgetType: string | null
  businessLine: string | null
  description: string | null
  approvalStatus: ApprovalStatus
  approverId: string | null
  approvedAt: string | null  // ISO 8601
  createdAt: string  // ISO 8601
  updatedAt: string  // ISO 8601
  createdBy: string
  updatedBy: string
}

// ==================== 案件预算 ====================

/**
 * 案件预算响应
 * 对应后端: CaseBudgetResponse
 */
export interface CaseBudgetResponse {
  id: string
  caseId: string
  totalBudget: number
  usedAmount: number
  remainingAmount: number
  legalFeeBudget: number | null
  courtFeeBudget: number | null
  investigationFeeBudget: number | null
  otherFeeBudget: number | null
  createdAt: string  // ISO 8601
  updatedAt: string  // ISO 8601
  createdBy: string
  updatedBy: string
}

// ==================== 业务线预算 ====================

/**
 * 业务线预算响应
 * 对应后端: BusinessLineBudgetResponse
 */
export interface BusinessLineBudgetResponse {
  id: string
  businessLine: string
  fiscalYear: string
  totalBudget: number
  usedAmount: number
  remainingAmount: number
  createdAt: string  // ISO 8601
  updatedAt: string  // ISO 8601
  createdBy: string
  updatedBy: string
}