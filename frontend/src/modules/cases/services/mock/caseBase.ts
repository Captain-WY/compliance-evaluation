import {developmentBoundary} from '../../../../platform/developmentBoundary';

import { Case, CaseStage, RiskLevel, BusinessLine, CaseType, RegulatoryAttributes, IssueType } from '../../types';
import { logHistoryInternal } from './caseActivity';

export let MOCK_CASES_STORE: Case[] = [
  // --- Existing Cases ---
  {
    id: 'c-001',
    key: 'ZD-JRJK-2026-001', // New BaseIssue field
    code: 'ZD-JRJK-2026-001',
    issueType: IssueType.CASE, // New BaseIssue field
    title: '永绿集团债券违约纠纷案',
    description: '我司自营持有的"20永绿01"债券到期违约。发行人永绿控股集团未能按期兑付本息，构成实质性违约。我司作为债券持有人，向上海金融法院提起诉讼，要求发行人偿还本金8500万元及利息。',
    stage: CaseStage.FIRST_INSTANCE,
    status: CaseStage.FIRST_INSTANCE, // BaseIssue status map
    businessLine: BusinessLine.PROPRIETARY,
    cause: '公司债券交易纠纷',
    riskLevel: RiskLevel.HIGH,
    plaintiff: '我司 (自营分公司)',
    defendant: '永绿控股集团有限公司',
    court: '上海金融法院',
    filingDate: '2025-11-15',
    createdAt: '2025-11-15', // BaseIssue field
    nextDeadline: '2026-03-25', // Yellow Warning (Assume today is 2026-03-20)
    lawyerId: 'v-001',
    tags: ['债券违约', '财产保全'],
    caseType: CaseType.STANDARD,
    // Mock Regulatory Attributes
    regulatoryAttrs: {
        regCaseCode: 'ZQ-001',
        regCauseName: '公司债券交易纠纷',
        securityCode: '136123',
        securityName: '20永绿01',
        sector: '债券',
        isInvestorProtection: false,
        isMajor: true,
        amountNoInterest: 85000000,
        amountWithInterest: 92000000
    }
  },
  
  // --- 1. The Epic (Series Master) ---
  {
    id: 'CASE-EPIC-001',
    key: 'TD-XJCS-2025-089',
    code: 'TD-XJCS-2025-089',
    issueType: IssueType.EPIC, // Master is an EPIC
    title: 'TechNova 虚假陈述系列索赔总案 (示范判决)',
    description: 'TechNova科技在科创板IPO过程中涉嫌财务造假。投资者以证券虚假陈述为由提起集体诉讼。本案为“示范判决”案件，将决定后续数百起平行案件的赔付标准。',
    stage: CaseStage.SECOND_INSTANCE,
    status: CaseStage.SECOND_INSTANCE,
    businessLine: BusinessLine.IB,
    cause: '证券虚假陈述责任纠纷',
    riskLevel: RiskLevel.CRITICAL,
    plaintiff: '投资者代表 (358人)',
    defendant: 'TechNova科技, 我司 (保荐人)',
    court: '北京高等人民法院',
    filingDate: '2024-05-20',
    createdAt: '2024-05-20',
    nextDeadline: '2026-04-10',
    lawyerId: 'v-002',
    tags: ['科创板', '示范判决', '母案'],
    caseType: CaseType.SERIES_MASTER,
    regulatoryAttrs: {
        regCaseCode: 'S01',
        regCauseName: '证券虚假陈述',
        securityCode: '688999',
        securityName: 'TechNova',
        sector: '科创板',
        isInvestorProtection: true,
        isMajor: true,
        amountNoInterest: 120000000,
        amountWithInterest: 135000000
    },
    relatedCases: [
        { targetCaseId: 'CASE-ADM-001', relationType: 'BLOCKED_BY', description: '需等待行政处罚落地以确认实施日' }
    ]
  },

  // --- 2. The Blocker (Related Admin Case) ---
  {
    id: 'CASE-ADM-001',
    key: 'XZ-CF-2024-002',
    code: 'XZ-CF-2024-002',
    issueType: IssueType.CASE,
    title: '证监会对 TechNova 行政处罚听证案',
    description: '证监会拟对 TechNova 及相关中介机构进行行政处罚。我司已申请听证，主张已勤勉尽责。此案结果将直接决定民事赔偿责任的认定。',
    stage: CaseStage.CLOSED, // Updated to CLOSED based on story
    status: CaseStage.CLOSED,
    businessLine: BusinessLine.IB,
    cause: '行政处罚听证',
    riskLevel: RiskLevel.CRITICAL,
    plaintiff: '中国证监会',
    defendant: '我司',
    court: '中国证监会处罚委',
    filingDate: '2024-03-15',
    createdAt: '2024-03-15',
    nextDeadline: undefined,
    tags: ['行政处罚', '听证'],
    caseType: CaseType.STANDARD,
    relatedCases: [
        { targetCaseId: 'CASE-EPIC-001', relationType: 'BLOCKS', description: '行政认定是民事索赔的前置条件' }
    ]
  },

  // --- 3. Child Cases (Series Members) ---
  {
    id: 'CASE-SUB-001',
    key: 'PT-XJCS-2025-101',
    code: 'PT-XJCS-2025-101',
    issueType: IssueType.CASE,
    title: '张三 诉 TechNova 索赔案',
    stage: CaseStage.ENFORCEMENT,
    status: CaseStage.ENFORCEMENT,
    businessLine: BusinessLine.IB,
    cause: '证券虚假陈述责任纠纷',
    riskLevel: RiskLevel.LOW,
    plaintiff: '张三',
    defendant: 'TechNova, 我司',
    court: '北京金融法院',
    filingDate: '2025-06-01',
    createdAt: '2025-06-01',
    caseType: CaseType.SERIES_CHILD,
    parentId: 'CASE-EPIC-001',
    description: '判决赔偿 50,000 元，待支付。',
    regulatoryAttrs: { amountNoInterest: 50000 } as any
  },
  {
    id: 'CASE-SUB-002',
    key: 'PT-XJCS-2025-102',
    code: 'PT-XJCS-2025-102',
    issueType: IssueType.CASE,
    title: '李四 诉 TechNova 索赔案',
    stage: CaseStage.FIRST_INSTANCE,
    status: CaseStage.FIRST_INSTANCE,
    businessLine: BusinessLine.IB,
    cause: '证券虚假陈述责任纠纷',
    riskLevel: RiskLevel.LOW,
    plaintiff: '李四',
    defendant: 'TechNova, 我司',
    court: '北京金融法院',
    filingDate: '2025-06-02',
    createdAt: '2025-06-02',
    caseType: CaseType.SERIES_CHILD,
    parentId: 'CASE-EPIC-001',
    description: '诉前调解中。',
    regulatoryAttrs: { amountNoInterest: 120000 } as any
  },
  {
    id: 'CASE-SUB-003',
    key: 'PT-XJCS-2025-103',
    code: 'PT-XJCS-2025-103',
    issueType: IssueType.CASE,
    title: '王五 诉 TechNova 索赔案',
    stage: CaseStage.FIRST_INSTANCE,
    status: CaseStage.FIRST_INSTANCE,
    businessLine: BusinessLine.IB,
    cause: '证券虚假陈述责任纠纷',
    riskLevel: RiskLevel.LOW,
    plaintiff: '王五',
    defendant: 'TechNova, 我司',
    court: '北京金融法院',
    filingDate: '2025-06-05',
    createdAt: '2025-06-05',
    caseType: CaseType.SERIES_CHILD,
    parentId: 'CASE-EPIC-001',
    description: '一审开庭排期中。',
    regulatoryAttrs: { amountNoInterest: 80000 } as any
  },
  {
    id: 'CASE-SUB-004',
    key: 'PT-XJCS-2025-104',
    code: 'PT-XJCS-2025-104',
    issueType: IssueType.CASE,
    title: '赵六 诉 TechNova 索赔案',
    stage: CaseStage.CLOSED,
    status: CaseStage.CLOSED,
    businessLine: BusinessLine.IB,
    cause: '证券虚假陈述责任纠纷',
    riskLevel: RiskLevel.LOW,
    plaintiff: '赵六',
    defendant: 'TechNova, 我司',
    court: '北京金融法院',
    filingDate: '2025-06-10',
    createdAt: '2025-06-10',
    caseType: CaseType.SERIES_CHILD,
    parentId: 'CASE-EPIC-001',
    description: '原告撤诉。',
    regulatoryAttrs: { amountNoInterest: 300000 } as any
  },
  
  // --- Other Cases ---
  {
    id: 'c-003',
    key: 'PT-LD-2026-004',
    code: 'PT-LD-2026-004',
    issueType: IssueType.CASE,
    title: '前高管竞业限制劳动仲裁',
    description: '前投行MD John Doe 离职后入职竞争对手，违反竞业限制协议。公司提起劳动仲裁，要求返还竞业限制补偿金并支付违约金。',
    stage: CaseStage.ENFORCEMENT,
    status: CaseStage.ENFORCEMENT,
    businessLine: BusinessLine.SUPPORT,
    cause: '劳动争议',
    riskLevel: RiskLevel.LOW,
    plaintiff: 'John Doe',
    defendant: '我司',
    court: '深圳福田区劳动仲裁委',
    filingDate: '2023-12-10',
    createdAt: '2023-12-10',
    nextDeadline: undefined,
    lawyerId: 'v-003',
    caseType: CaseType.STANDARD
  },
  {
    id: 'c-004',
    key: 'TD-GPYW-2026-012',
    code: 'TD-GPYW-2026-012',
    issueType: IssueType.CASE,
    title: '实控人股票质押式回购违约案',
    description: '融资人张某某以其持有的上市公司“深南实业”股票作为质押，向我司融入资金4.5亿元。因股价连续跌停触发平仓线，且张某某未履行追加担保义务，构成违约。我司提起诉讼并申请财产保全。',
    stage: CaseStage.FIRST_INSTANCE,
    status: CaseStage.FIRST_INSTANCE,
    businessLine: BusinessLine.CREDIT,
    cause: '股票质押式回购纠纷',
    riskLevel: RiskLevel.CRITICAL,
    plaintiff: '我司',
    defendant: '张某某 (上市公司实控人)',
    court: '深圳市中级人民法院',
    filingDate: '2026-01-05',
    createdAt: '2026-01-05',
    nextDeadline: '2026-03-22', // RED WARNING (< 3 days)
    lawyerId: 'v-001',
    tags: ['强制平仓', '大股东'],
    caseType: CaseType.STANDARD,
    regulatoryAttrs: {
        regCaseCode: 'M03',
        regCauseName: '股票质押回购',
        securityCode: '002345',
        securityName: '深南实业',
        sector: '主板',
        isInvestorProtection: false,
        isMajor: true,
        amountNoInterest: 450000000,
        amountWithInterest: 480000000
    }
  },
  {
    id: 'c-005',
    key: 'ZD-ZGH-2025-112',
    code: 'ZD-ZGH-2025-112',
    issueType: IssueType.CASE,
    title: '金信信托通道业务差额补足纠纷',
    description: '我司资管子公司作为通道方设立资管计划。委托人（某农商行）要求我司履行差额补足义务。',
    stage: CaseStage.SECOND_INSTANCE,
    status: CaseStage.SECOND_INSTANCE,
    businessLine: BusinessLine.ASSET_MGMT,
    cause: '资产管理合同纠纷',
    riskLevel: RiskLevel.HIGH,
    plaintiff: '某农商行',
    defendant: '我司 (资管子公司), 金信信托',
    court: '湖南省高级人民法院',
    filingDate: '2025-03-12',
    createdAt: '2025-03-12',
    nextDeadline: '2026-05-15',
    lawyerId: 'v-002',
    tags: ['刚性兑付', '资管新规'],
    caseType: CaseType.STANDARD,
    regulatoryAttrs: { amountNoInterest: 68000000 } as any
  },
  {
    id: 'c-012',
    key: 'ZD-XJCS-2023-001',
    code: 'ZD-XJCS-2023-001',
    issueType: IssueType.CASE,
    title: '2023年度虚假陈述系列案(已结)',
    description: '历史遗留的虚假陈述案件，已通过和解方式全部结案。',
    stage: CaseStage.CLOSED,
    status: CaseStage.CLOSED,
    businessLine: BusinessLine.IB,
    cause: '证券虚假陈述责任纠纷',
    riskLevel: RiskLevel.CRITICAL,
    plaintiff: '投资者 (500人)',
    defendant: '我司, 发行人',
    court: '南京市中级人民法院',
    filingDate: '2023-01-15',
    createdAt: '2023-01-15',
    nextDeadline: undefined,
    closingRecordId: 'close-012',
    caseType: CaseType.STANDARD,
    regulatoryAttrs: { amountNoInterest: 25000000 } as any
  }
];

// Helper to update store synchronously (for other services)
export const updateCaseStoreInternal = (caseId: string, updates: Partial<Case>) => {
    developmentBoundary('caseBase.updateCaseStoreInternal', true);
    const idx = MOCK_CASES_STORE.findIndex(c => c.id === caseId);
    if (idx !== -1) {
        MOCK_CASES_STORE[idx] = { ...MOCK_CASES_STORE[idx], ...updates };
    }
};

export const getCases = async (): Promise<Case[]> => {
    developmentBoundary('caseBase.getCases', false);
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve([...MOCK_CASES_STORE]);
    }, 600); // Simulate network latency
  });
};

export const getCaseById = async (id: string): Promise<Case | undefined> => {
    developmentBoundary('caseBase.getCaseById', false);
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve(MOCK_CASES_STORE.find(c => c.id === id));
        }, 300);
    });
};

export const addCase = async (newCase: Omit<Case, 'id' | 'key' | 'issueType' | 'status' | 'createdAt'>): Promise<Case> => {
    developmentBoundary('caseBase.addCase', true);
    return new Promise(resolve => {
        const created: Case = {
            ...newCase,
            id: `c-${Date.now()}`,
            key: newCase.code, // Synced
            issueType: IssueType.CASE, // Default to Standard Case
            status: newCase.stage,
            createdAt: new Date().toISOString().split('T')[0]
        };
        MOCK_CASES_STORE = [created, ...MOCK_CASES_STORE];
        
        logHistoryInternal({
            caseId: created.id,
            operator: '当前用户',
            action: '创建案件',
            details: '案件初始化建立'
        });

        setTimeout(() => resolve(created), 500);
    });
};

export const updateCaseGeneralInfo = async (caseId: string, updates: Partial<Case>): Promise<Case> => {
    developmentBoundary('caseBase.updateCaseGeneralInfo', true);
    return new Promise(resolve => {
        setTimeout(() => {
            const idx = MOCK_CASES_STORE.findIndex(c => c.id === caseId);
            if (idx !== -1) {
                const oldCase = MOCK_CASES_STORE[idx];
                const updatedCase = { ...oldCase, ...updates };
                
                // Sync status with stage if stage is updated
                if (updates.stage) {
                    updatedCase.status = updates.stage;
                }

                // Generate Logs based on diff
                if (updates.riskLevel && updates.riskLevel !== oldCase.riskLevel) {
                    logHistoryInternal({
                        caseId,
                        operator: '当前用户',
                        action: '变更风险等级',
                        details: `由 [${oldCase.riskLevel}] 变更为 [${updates.riskLevel}]`
                    });
                }
                if (updates.description && updates.description !== oldCase.description) {
                    logHistoryInternal({
                        caseId,
                        operator: '当前用户',
                        action: '更新案情描述',
                        details: '修订了案件摘要信息'
                    });
                }
                if (updates.stage && updates.stage !== oldCase.stage) {
                    logHistoryInternal({
                        caseId,
                        operator: '当前用户',
                        action: '更新案件阶段',
                        details: `由 [${oldCase.stage}] 变更为 [${updates.stage}]`
                    });
                }

                MOCK_CASES_STORE[idx] = updatedCase;
                resolve(updatedCase);
            }
        }, 400);
    });
};

export const updateCaseStage = async (caseId: string, newStage: CaseStage): Promise<Case> => {
    developmentBoundary('caseBase.updateCaseStage', true);
    return updateCaseGeneralInfo(caseId, { stage: newStage });
};

export const batchUpdateCaseStage = async (caseIds: string[], newStage: CaseStage): Promise<void> => {
    developmentBoundary('caseBase.batchUpdateCaseStage', true);
    return new Promise(resolve => {
        setTimeout(() => {
            const idsSet = new Set(caseIds);
            let updatedCount = 0;

            MOCK_CASES_STORE = MOCK_CASES_STORE.map(c => {
                if (idsSet.has(c.id) && c.stage !== newStage) {
                    updatedCount++;
                    
                    logHistoryInternal({
                        caseId: c.id,
                        operator: '当前用户 (批量)',
                        action: '批量阶段流转',
                        details: `由 [${c.stage}] 批量变更为 [${newStage}]`
                    });

                    return { ...c, stage: newStage, status: newStage };
                }
                return c;
            });
            console.log(`[Mock System] Batch updated ${updatedCount} cases to ${newStage}`);
            resolve();
        }, 800);
    });
};

export const updateRegulatoryAttributes = async (caseId: string, attrs: RegulatoryAttributes): Promise<Case> => {
    developmentBoundary('caseBase.updateRegulatoryAttributes', true);
    return new Promise(resolve => {
        setTimeout(() => {
            const index = MOCK_CASES_STORE.findIndex(c => c.id === caseId);
            if (index !== -1) {
                MOCK_CASES_STORE[index] = { ...MOCK_CASES_STORE[index], regulatoryAttrs: attrs };
                resolve(MOCK_CASES_STORE[index]);
            }
        }, 400);
    });
};

export const updateCaseDeadline = async (id: string, deadline: string): Promise<void> => {
    developmentBoundary('caseBase.updateCaseDeadline', true);
    return new Promise(resolve => {
        setTimeout(() => {
            const idx = MOCK_CASES_STORE.findIndex(c => c.id === id);
            if (idx !== -1) {
                MOCK_CASES_STORE[idx] = { ...MOCK_CASES_STORE[idx], nextDeadline: deadline };
            }
            resolve();
        }, 300);
    });
};
