import {developmentBoundary} from '../../../../platform/developmentBoundary';

import { FinancialRecord, FeeTransaction, TransactionType, TransactionStatus, ProvisionLog } from '../../types';
import { MOCK_CASES_STORE } from './cases';

// Helper to generate default finance for a case if missing
const generateDefaultFinance = (caseId: string, claimed: number): FinancialRecord => ({
    caseId,
    claimedAmount: claimed,
    judgedAmount: 0,
    executedAmount: 0,
    currency: 'CNY',
    legalFeeBudget: 0,
    legalFeePaid: 0,
    otherFeesPaid: 0,
    provisionAmount: 0,
    provisionStatus: '未计提'
});

// Keyed by caseId
export let MOCK_FINANCE: Record<string, FinancialRecord> = {
  // --- Existing ---
  'c-001': {
    caseId: 'c-001',
    claimedAmount: 85000000, 
    judgedAmount: 0,
    executedAmount: 0,
    currency: 'CNY',
    legalFeeBudget: 2000000,
    legalFeePaid: 500000,
    otherFeesPaid: 120000,
    provisionAmount: 40000000, 
    provisionStatus: '已确认'
  },
  'c-003': {
    caseId: 'c-003',
    claimedAmount: 1500000,
    judgedAmount: 1500000,
    executedAmount: 200000, 
    currency: 'CNY',
    legalFeeBudget: 100000,
    legalFeePaid: 100000,
    otherFeesPaid: 25000,
    provisionAmount: 0,
    provisionStatus: '未计提'
  },
  'c-004': { // 股票质押 (Critical)
    caseId: 'c-004',
    claimedAmount: 450000000, // 4.5亿
    judgedAmount: 0,
    executedAmount: 0,
    currency: 'CNY',
    legalFeeBudget: 5000000,
    legalFeePaid: 1500000,
    otherFeesPaid: 2400000, // 高额保全费
    provisionAmount: 100000000, // 计提1亿坏账
    provisionStatus: '已确认'
  },
  'c-005': { // 资管通道 (High)
    caseId: 'c-005',
    claimedAmount: 68000000, 
    judgedAmount: 0,
    executedAmount: 0,
    currency: 'CNY',
    legalFeeBudget: 800000,
    legalFeePaid: 200000,
    otherFeesPaid: 50000,
    provisionAmount: 0,
    provisionStatus: '未计提' // 认为胜诉概率大
  },
  'c-012': { // 历史结案
    caseId: 'c-012',
    claimedAmount: 80000000,
    judgedAmount: 25000000, // 和解金额
    executedAmount: 25000000, // 已付
    currency: 'CNY',
    legalFeeBudget: 2000000,
    legalFeePaid: 2000000,
    otherFeesPaid: 500000,
    provisionAmount: 0, // 已结清
    provisionStatus: '未计提'
  },

  // --- TechNova Series Finance Data ---
  'CASE-EPIC-001': { // Master Case
    caseId: 'CASE-EPIC-001',
    claimedAmount: 120000000, // Total claimed so far
    judgedAmount: 0,
    executedAmount: 0,
    currency: 'CNY',
    legalFeeBudget: 5000000, // Large budget for series
    legalFeePaid: 1000000,
    otherFeesPaid: 200000,
    provisionAmount: 60000000, // High provision for class action
    provisionStatus: '已确认'
  },
  // Child Cases (Manual Init for visualization consistency)
  'CASE-SUB-001': generateDefaultFinance('CASE-SUB-001', 500000),
  'CASE-SUB-002': generateDefaultFinance('CASE-SUB-002', 120000),
  'CASE-SUB-003': generateDefaultFinance('CASE-SUB-003', 80000),
  'CASE-SUB-004': generateDefaultFinance('CASE-SUB-004', 300000),
  'CASE-SUB-005': generateDefaultFinance('CASE-SUB-005', 150000),
  'CASE-SUB-006': generateDefaultFinance('CASE-SUB-006', 90000),
  'CASE-SUB-007': generateDefaultFinance('CASE-SUB-007', 220000),
  'CASE-SUB-008': generateDefaultFinance('CASE-SUB-008', 180000),
  'CASE-SUB-009': generateDefaultFinance('CASE-SUB-009', 110000),
  'CASE-SUB-010': generateDefaultFinance('CASE-SUB-010', 85000),

  // Task B Arbitration Case
  'c-arb-01': {
      caseId: 'c-arb-01',
      claimedAmount: 50000000,
      judgedAmount: 0,
      executedAmount: 0,
      currency: 'CNY',
      legalFeeBudget: 1500000,
      legalFeePaid: 0,
      otherFeesPaid: 300000, // Arbitration Fee prepaid
      provisionAmount: 0,
      provisionStatus: '未计提'
  }
};

let MOCK_TRANSACTIONS: FeeTransaction[] = [
  // Old Txs
  { id: 'tx-101', caseId: 'c-001', type: TransactionType.LAWYER_FEE, amount: 500000, currency: 'CNY', date: '2025-11-20', applicant: '王法务', description: '支付金杜律所一审前期固定代理费', status: TransactionStatus.PAID },
  { id: 'tx-102', caseId: 'c-001', type: TransactionType.COURT_FEE, amount: 120000, currency: 'CNY', date: '2025-11-22', applicant: '王法务', description: '预交上海金融法院案件受理费', status: TransactionStatus.PAID },
  { id: 'tx-103', caseId: 'c-001', type: TransactionType.TRAVEL_EXPENSE, amount: 3500, currency: 'CNY', date: '2026-02-15', applicant: '王法务', description: '前往上海出庭差旅报销', status: TransactionStatus.PENDING },
  
  // New Txs
  { id: 'tx-401', caseId: 'c-004', type: TransactionType.COURT_FEE, amount: 2400000, currency: 'CNY', date: '2026-01-10', applicant: '李风控', description: '股票质押案财产保全费', status: TransactionStatus.PAID },
  { id: 'tx-402', caseId: 'c-004', type: TransactionType.LAWYER_FEE, amount: 1500000, currency: 'CNY', date: '2026-01-15', applicant: '李风控', description: '支付金杜律师费(一审固定)', status: TransactionStatus.PAID },
  { id: 'tx-501', caseId: 'c-005', type: TransactionType.LAWYER_FEE, amount: 200000, currency: 'CNY', date: '2026-03-01', applicant: '张合规', description: '支付中伦律师费(二审)', status: TransactionStatus.APPROVED },
  { id: 'tx-1201', caseId: 'c-012', type: TransactionType.LAWYER_FEE, amount: 800000, currency: 'CNY', date: '2025-12-25', applicant: '张合规', description: '结案尾款支付', status: TransactionStatus.PAID },

  // Epic Txs
  { id: 'tx-epic-001', caseId: 'CASE-EPIC-001', type: TransactionType.LAWYER_FEE, amount: 1000000, currency: 'CNY', date: '2024-06-01', applicant: '张合规', description: 'TechNova系列案 启动代理费', status: TransactionStatus.PAID },
  { id: 'tx-epic-002', caseId: 'CASE-EPIC-001', type: TransactionType.TRAVEL_EXPENSE, amount: 15000, currency: 'CNY', date: '2025-05-15', applicant: '张合规', description: '北京出庭差旅费(多人)', status: TransactionStatus.PAID }
];

// --- Mock Transaction Generator ---
const generateHistoricalTransactions = () => {
    // We generated some historical cases in cases.ts with prefix 'hist-'
    // Let's attach some financial data to them
    const historicalTxs: FeeTransaction[] = [];
    const months = 6;
    
    // Find historical cases from the store (we need to access them via import or helper, 
    // but MOCK_CASES_STORE is already imported. However, generateHistoricalTransactions runs once on module load)
    
    // Simulate some generic historical transactions for ROI charts
    for(let i=0; i<months; i++) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const monthStr = date.toISOString().slice(0, 7);

        // Add 3-5 lawyer fees per month
        for(let j=0; j<4; j++) {
            historicalTxs.push({
                id: `htx-fee-${monthStr}-${j}`,
                caseId: `hist-${monthStr}-${j}`, // Corresponds to cases.ts
                type: TransactionType.LAWYER_FEE,
                amount: Math.floor(Math.random() * 500000) + 50000,
                currency: 'CNY',
                date: `${monthStr}-10`,
                applicant: 'System',
                description: '历史律师费',
                status: TransactionStatus.PAID
            });
        }

        // Add 1-2 recovery per month
        for(let k=0; k<2; k++) {
             historicalTxs.push({
                id: `htx-rec-${monthStr}-${k}`,
                caseId: `hist-${monthStr}-${k}`, 
                type: TransactionType.RECOVERY_RECEIVED,
                amount: Math.floor(Math.random() * 2000000) + 100000,
                currency: 'CNY',
                date: `${monthStr}-25`,
                applicant: 'System',
                description: '历史回款',
                status: TransactionStatus.PAID
            });
        }
    }
    return historicalTxs;
};

// Append
MOCK_TRANSACTIONS.push(...generateHistoricalTransactions());


let MOCK_PROVISION_LOGS: ProvisionLog[] = [
  { id: 'pl-001', caseId: 'c-001', quarter: '2025-Q4', previousAmount: 0, newAmount: 40000000, changeReason: '一审证据交换后，判断败诉可能性>50%', assessor: '李总监', date: '2025-12-31' },
  { id: 'pl-002', caseId: 'c-004', quarter: '2026-Q1', previousAmount: 0, newAmount: 100000000, changeReason: '质押股票连续跌停，担保物价值严重不足，预计产生大额坏账', assessor: '首席风险官', date: '2026-03-15' },
  { id: 'pl-epic-001', caseId: 'CASE-EPIC-001', quarter: '2025-Annual', previousAmount: 30000000, newAmount: 60000000, changeReason: '新增200名原告起诉，重新评估风险敞口', assessor: '张合规', date: '2025-12-31' }
];

// Internal Helper to Recalculate Master Finance
const recalculateMasterFinance = (masterId: string) => {
    // 1. Find all children IDs
    const childIds = MOCK_CASES_STORE.filter(c => c.parentId === masterId).map(c => c.id);
    if (childIds.length === 0) return;

    // 2. Sum up fields
    let totalClaimed = 0;
    let totalJudged = 0;
    let totalExecuted = 0;
    let totalProvision = 0;
    let totalLegalFee = 0;
    let totalOtherFee = 0;

    childIds.forEach(id => {
        const f = MOCK_FINANCE[id];
        if (f) {
            totalClaimed += f.claimedAmount || 0;
            totalJudged += f.judgedAmount || 0;
            totalExecuted += f.executedAmount || 0;
            totalProvision += f.provisionAmount || 0;
            totalLegalFee += f.legalFeePaid || 0;
            totalOtherFee += f.otherFeesPaid || 0;
        }
    });

    // 3. Update Master Record
    // Note: We merge with existing to keep fields we don't aggregate (like budget if set at master level)
    const masterRec = MOCK_FINANCE[masterId] || {
        caseId: masterId,
        currency: 'CNY',
        legalFeeBudget: 0,
        legalFeePaid: 0,
        otherFeesPaid: 0,
        provisionAmount: 0,
        claimedAmount: 0,
        provisionStatus: '未计提'
    };

    MOCK_FINANCE[masterId] = {
        ...masterRec,
        claimedAmount: totalClaimed,
        judgedAmount: totalJudged,
        executedAmount: totalExecuted,
        provisionAmount: totalProvision,
        // Optional: Aggregate fees or keep separate? Usually master has its own fees + children fees.
        // For simplicity in this demo, let's say Master View shows aggregation.
        // legalFeePaid: totalLegalFee, 
        // otherFeesPaid: totalOtherFee
    };
    
    console.log(`[Finance Aggregation] Updated Master ${masterId}: Total Claimed = ${totalClaimed}`);
};

// Internal Check for aggregation trigger
const checkAndTriggerAggregation = (caseId: string) => {
    const caseObj = MOCK_CASES_STORE.find(c => c.id === caseId);
    if (caseObj && caseObj.parentId) {
        recalculateMasterFinance(caseObj.parentId);
    }
};

// --- Task C: Finance Initialization ---
export const initializeFinanceRecord = async (
    caseId: string, 
    initialData: { legalFeeBudget: number; preliminaryCostBudget: number; claimedAmount?: number }
): Promise<void> => {
    return new Promise(resolve => {
        setTimeout(() => {
            const newRecord: FinancialRecord = {
                caseId,
                claimedAmount: initialData.claimedAmount || 0,
                judgedAmount: 0,
                executedAmount: 0,
                currency: 'CNY',
                legalFeeBudget: initialData.legalFeeBudget,
                legalFeePaid: 0,
                otherFeesPaid: 0,
                provisionAmount: 0,
                provisionStatus: '未计提'
            };
            MOCK_FINANCE[caseId] = newRecord;
            console.log(`[Finance] Initialized record for ${caseId} with budget ${initialData.legalFeeBudget}`);
            resolve();
        }, 300);
    });
};

export const getFinanceByCaseId = async (caseId: string): Promise<FinancialRecord | null> => {
    developmentBoundary('finance.getFinanceByCaseId', false);
  return new Promise((resolve) => {
    setTimeout(() => {
        // Fallback for demo: if no record exists but case exists, create a default one
        if (!MOCK_FINANCE[caseId]) {
            const caseObj = MOCK_CASES_STORE.find(c => c.id === caseId);
            if (caseObj) {
                MOCK_FINANCE[caseId] = generateDefaultFinance(caseId, caseObj.regulatoryAttrs?.amountNoInterest || 0);
            }
        }
        resolve(MOCK_FINANCE[caseId] || null)
    }, 200);
  });
};

export const updateFinanceAmounts = async (caseId: string, amounts: Partial<FinancialRecord>): Promise<FinancialRecord> => {
    developmentBoundary('finance.updateFinanceAmounts', true);
    return new Promise((resolve) => {
        setTimeout(() => {
            const current = MOCK_FINANCE[caseId];
            if (current) {
                MOCK_FINANCE[caseId] = { ...current, ...amounts };
                checkAndTriggerAggregation(caseId);
            }
            resolve(MOCK_FINANCE[caseId]);
        }, 400);
    });
};

export const addProvisionLog = async (log: Omit<ProvisionLog, 'id' | 'date'>): Promise<void> => {
    developmentBoundary('finance.addProvisionLog', true);
    return new Promise((resolve) => {
        setTimeout(() => {
            // 1. Add Log
            const newLog: ProvisionLog = {
                ...log,
                id: `pl-${Date.now()}`,
                date: new Date().toISOString().split('T')[0]
            };
            MOCK_PROVISION_LOGS = [newLog, ...MOCK_PROVISION_LOGS];

            // 2. Update Main Record
            const current = MOCK_FINANCE[log.caseId];
            if (current) {
                MOCK_FINANCE[log.caseId] = {
                    ...current,
                    provisionAmount: log.newAmount,
                    provisionStatus: log.newAmount > 0 ? '已确认' : '未计提'
                };
                checkAndTriggerAggregation(log.caseId);
            }
            resolve();
        }, 500);
    });
};

export const addFeeTransaction = async (tx: Omit<FeeTransaction, 'id' | 'status'>): Promise<FeeTransaction> => {
    developmentBoundary('finance.addFeeTransaction', true);
    return new Promise((resolve) => {
        setTimeout(() => {
            const newTx: FeeTransaction = {
                ...tx,
                id: `tx-${Date.now()}`,
                status: TransactionStatus.PENDING
            };
            MOCK_TRANSACTIONS = [newTx, ...MOCK_TRANSACTIONS];
            
            // Auto update budget usage in Financial Record
            const current = MOCK_FINANCE[tx.caseId];
            if (current) {
                if (tx.type === TransactionType.LAWYER_FEE) {
                    MOCK_FINANCE[tx.caseId] = {
                        ...current,
                        legalFeePaid: (current.legalFeePaid || 0) + tx.amount
                    };
                } else if (!tx.type.includes('COMPENSATION') && !tx.type.includes('RECOVERY')) {
                    MOCK_FINANCE[tx.caseId] = {
                        ...current,
                        otherFeesPaid: (current.otherFeesPaid || 0) + tx.amount
                    };
                }
                checkAndTriggerAggregation(tx.caseId);
            }
            
            resolve(newTx);
        }, 400);
    });
};

export const getTransactionsByCaseId = async (caseId: string): Promise<FeeTransaction[]> => {
    developmentBoundary('finance.getTransactionsByCaseId', false);
    return new Promise(resolve => {
        setTimeout(() => resolve(MOCK_TRANSACTIONS.filter(t => t.caseId === caseId)), 300);
    });
};

export const getAllTransactions = async (): Promise<FeeTransaction[]> => {
    developmentBoundary('finance.getAllTransactions', false);
    return new Promise(resolve => {
        setTimeout(() => resolve(MOCK_TRANSACTIONS), 300);
    });
};

export const getProvisionLogsByCaseId = async (caseId: string): Promise<ProvisionLog[]> => {
    developmentBoundary('finance.getProvisionLogsByCaseId', false);
    return new Promise(resolve => {
        setTimeout(() => resolve(MOCK_PROVISION_LOGS.filter(p => p.caseId === caseId)), 200);
    });
};
export const getProvisionLogs = async (): Promise<ProvisionLog[]> => {
    developmentBoundary('finance.getProvisionLogs', false);
    return new Promise(resolve => setTimeout(() => resolve(MOCK_PROVISION_LOGS), 300));
};
