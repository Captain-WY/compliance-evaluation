import {developmentBoundary} from '../../../../platform/developmentBoundary';

import { CaseClosingRecord, CaseOutcome, CaseStage } from '../../types';
import { updateCaseStoreInternal } from './caseBase';
import { createTerminatedSupervisionTask } from './process';

// Mock Closing Records
export let MOCK_CLOSING_RECORDS: CaseClosingRecord[] = [
    {
        id: 'close-012',
        caseId: 'c-012',
        closeDate: '2025-12-31',
        outcome: CaseOutcome.SETTLEMENT,
        finalImpactAmount: 25000000,
        winLossFactors: ['司法解释变更', '监管处罚定性'],
        lessonsLearned: '加强对发行人财务数据的穿透式核查',
        vendorId: 'v-001',
        vendorRating: 4.5,
        vendorReview: '律师团队专业度高，有效降低了赔付比例',
        operator: '李合规',
        archiveBoxNo: '2025-A-12',
        isHardcopyArchived: true,
        financeChecks: { invoiceRecovered: true, courtRefundChecked: true },
        remediation: { required: false }
    }
];

export const closeCase = async (caseId: string, closingData: Omit<CaseClosingRecord, 'id' | 'caseId'>): Promise<void> => {
    developmentBoundary('caseClosing.closeCase', true);
    return new Promise((resolve) => {
        setTimeout(() => {
            // 1. Create Closing Record
            const record: CaseClosingRecord = {
                id: `close-${Date.now()}`,
                caseId,
                ...closingData
            };
            MOCK_CLOSING_RECORDS.push(record);

            // 2. Update Case Status Logic
            let nextDeadline = undefined;
            if (closingData.outcome === CaseOutcome.TERMINATED) {
                // Calculate 6 months later
                const date = new Date();
                date.setMonth(date.getMonth() + 6);
                nextDeadline = date.toISOString().split('T')[0];
                
                // Create Process Task
                createTerminatedSupervisionTask(caseId, nextDeadline);
                
                console.log(`[Mock System] Generated 6-month supervision task for Terminated case ${caseId}`);
            }

            // Update the main store
            updateCaseStoreInternal(caseId, {
                stage: CaseStage.CLOSED,
                closingRecordId: record.id,
                nextDeadline: nextDeadline
            });
            
            // 3. Log Remediation if needed
            if (closingData.remediation?.required) {
                console.log(`[Mock System] Triggered remediation task for ${closingData.remediation.targetDept}: ${closingData.remediation.suggestion}`);
            }

            resolve();
        }, 800);
    });
};

export const getClosingRecord = async (caseId: string): Promise<CaseClosingRecord | undefined> => {
    developmentBoundary('caseClosing.getClosingRecord', false);
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve(MOCK_CLOSING_RECORDS.find(r => r.caseId === caseId));
        }, 300);
    });
};
