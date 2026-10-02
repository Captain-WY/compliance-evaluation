/**
 * Finance API Service
 * Handles financial transactions and budget operations
 */

import { apiClient } from './client';
import { TransactionType, TransactionStatus, FeeTransaction } from '../../types';

// Backend response types
interface TransactionResponse {
  id: string;
  caseId: string;
  transactionType: string;
  amount: number;
  currency: string;
  transactionDate: string;
  applicantId?: string;
  applicantName?: string;
  description?: string;
  status: string;
  approvalStatus?: string;
  approvedBy?: string;
  approvedDate?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface BudgetResponse {
  id: string;
  caseId: string;
  businessLine: string;
  budgetType: string;
  totalBudget: number;
  usedBudget: number;
  remainingBudget: number;
  fiscalYear: number;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Map backend transaction to frontend FeeTransaction
function mapTransaction(backendTx: TransactionResponse): FeeTransaction {
  // Map transaction type
  const typeMap: Record<string, TransactionType> = {
    'LAWYER_FEE': TransactionType.LAWYER_FEE,
    'COURT_FEE': TransactionType.COURT_FEE,
    'TRAVEL_EXPENSE': TransactionType.TRAVEL_EXPENSE,
    'COMPENSATION_PAID': TransactionType.COMPENSATION_PAID,
    'RECOVERY_RECEIVED': TransactionType.RECOVERY_RECEIVED,
    '律师费': TransactionType.LAWYER_FEE,
    '诉讼费': TransactionType.COURT_FEE,
    '差旅费': TransactionType.TRAVEL_EXPENSE,
    '赔偿支出': TransactionType.COMPENSATION_PAID,
    '执行回款': TransactionType.RECOVERY_RECEIVED
  };

  // Map status
  const statusMap: Record<string, TransactionStatus> = {
    'PAID': TransactionStatus.PAID,
    'PENDING': TransactionStatus.PENDING,
    'APPROVED': TransactionStatus.APPROVED,
    '已支付': TransactionStatus.PAID,
    '审批中': TransactionStatus.PENDING,
    '待支付': TransactionStatus.APPROVED
  };

  return {
    id: backendTx.id,
    caseId: backendTx.caseId,
    type: typeMap[backendTx.transactionType] || TransactionType.LAWYER_FEE,
    amount: backendTx.amount,
    currency: backendTx.currency || 'CNY',
    date: backendTx.transactionDate,
    applicant: backendTx.applicantName || '',
    description: backendTx.description || '',
    status: statusMap[backendTx.status] || TransactionStatus.PENDING
  };
}

export const financeApi = {
  /**
   * Get transactions for a case
   */
  async getCaseTransactions(caseId: string): Promise<FeeTransaction[]> {
    const response: TransactionResponse[] = await apiClient.get<TransactionResponse[]>(
      `/cases/${caseId}/transactions`
    );
    return response.map(mapTransaction);
  },

  /**
   * Create transaction
   */
  async createTransaction(
    caseId: string,
    transactionData: {
      transactionType: string;
      amount: number;
      currency?: string;
      transactionDate: string;
      applicantId?: string;
      applicantName?: string;
      description?: string;
      notes?: string;
    }
  ): Promise<FeeTransaction> {
    const response: TransactionResponse = await apiClient.post<TransactionResponse>(
      `/cases/${caseId}/transactions`,
      transactionData
    );
    return mapTransaction(response);
  },

  /**
   * Update transaction status
   */
  async updateTransactionStatus(
    caseId: string,
    transactionId: string,
    status: string,
    notes?: string
  ): Promise<FeeTransaction> {
    const response: TransactionResponse = await apiClient.patch<TransactionResponse>(
      `/cases/${caseId}/transactions/${transactionId}`,
      { status, notes }
    );
    return mapTransaction(response);
  },

  /**
   * Get budget for a case
   */
  async getCaseBudget(caseId: string): Promise<BudgetResponse> {
    const response: BudgetResponse = await apiClient.get<BudgetResponse>(
      `/cases/${caseId}/budget`
    );
    return response;
  },

  /**
   * Update budget
   */
  async updateBudget(
    caseId: string,
    budgetData: {
      totalBudget?: number;
      notes?: string;
    }
  ): Promise<BudgetResponse> {
    const response: BudgetResponse = await apiClient.patch<BudgetResponse>(
      `/cases/${caseId}/budget`,
      budgetData
    );
    return response;
  }
};