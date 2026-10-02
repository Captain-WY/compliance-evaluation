import {developmentBoundary} from '../../../../platform/developmentBoundary';

import { DataSnapshot, ReportTemplate, ConsistencyResult, ReportDefinition, ReportingTask, Case, CaseStage, ReportTriggerType, RiskLevel, BusinessLine, ReportingTaskLog, IssueType, CaseType } from '../../types';
import { getCases } from './cases';
import { getFinanceByCaseId } from './finance';

// 1. Enhanced Report Definitions (The Matrix)
const MOCK_DEFINITIONS: ReportDefinition[] = [
    { 
        id: 'def-001', 
        name: '深圳证监局-涉诉情况统计表 (月报)', 
        targetOrg: '深圳证监局', 
        triggerType: 'PERIODIC',
        frequency: 'MONTHLY',
        deadlineDay: 5, // 5th of next month
        format: 'EXCEL', 
        description: '全口径统计（含子公司），重点关注自有资金损失及风险敞口。',
        scope: 'GROUP'
    },
    { 
        id: 'def-002', 
        name: '沪深交易所-重大诉讼临时公告', 
        targetOrg: '证券交易所', 
        triggerType: 'EVENT_DRIVEN',
        relatedRuleId: 'rule-001', // Linked to single case > 1000万
        format: 'WORD', 
        description: '单案金额 > 1000万 且 > 净资产10%，必须在2个交易日内披露。',
        scope: 'PARENT'
    },
    { 
        id: 'def-003', 
        name: '沪深交易所-累计诉讼公告', 
        targetOrg: '证券交易所', 
        triggerType: 'CUMULATIVE',
        relatedRuleId: 'rule-cumulative-01', // Linked to 12-month cumulative
        format: 'WORD', 
        description: '连续12个月累计涉案金额达到重大标准。',
        scope: 'GROUP'
    },
    { 
        id: 'def-004', 
        name: '风控部-风险资本准备计算表', 
        targetOrg: '内部风控', 
        triggerType: 'PERIODIC',
        frequency: 'MONTHLY',
        deadlineDay: 10,
        format: 'EXCEL', 
        description: '用于净资本计算。需包含：涉案金额、风险系数、扣减金额预估。',
        includeNetCapital: true
    },
    { 
        id: 'def-005', 
        name: '中证协-年度法务工作报表', 
        targetOrg: '中国证券业协会', 
        triggerType: 'PERIODIC',
        frequency: 'ANNUAL',
        deadlineDay: 31, // Jan 31st
        format: 'EXCEL', 
        description: '统计律师费支出、纠纷起因分类及典型案例。',
        scope: 'GROUP'
    },
];

// Mock Tasks - Rich Lifecycle Data
let MOCK_TASKS: ReportingTask[] = [
    // 1. History (Submitted)
    { 
        id: 'task-101', 
        definitionId: 'def-001', 
        definitionName: '深圳证监局-涉诉情况统计表 (月报)', 
        cycle: '2026-02', 
        status: 'SUBMITTED', 
        deadline: '2026-03-05',
        caseCount: 12, 
        totalAmount: 850000000, 
        creator: '王法务', 
        createTime: '2026-03-01',
        submitTime: '2026-03-05',
        snapshotId: 'snap-mock-001',
        generatedFileUrl: 'mock-file-url-1',
        history: [
            { timestamp: '2026-03-01 10:00', operator: '王法务', action: 'CREATED' },
            { timestamp: '2026-03-02 14:30', operator: '王法务', action: 'SUBMITTED_FOR_REVIEW' },
            { timestamp: '2026-03-04 09:15', operator: '李总监', action: 'APPROVED', comment: '数据无误，同意报送' },
            { timestamp: '2026-03-05 11:20', operator: '王法务', action: 'FILED' }
        ]
    },
    // 2. Rejected Task (New)
    { 
        id: 'task-103', 
        definitionId: 'def-002', 
        definitionName: '沪深交易所-重大诉讼临时公告', 
        cycle: 'Event-20260322', 
        status: 'REJECTED', 
        deadline: '2026-03-24',
        caseCount: 1, 
        totalAmount: 450000000, 
        creator: '李风控', 
        createTime: '2026-03-22',
        snapshotId: 'snap-mock-temp-003',
        generatedFileUrl: 'mock-doc-url',
        history: [
            { timestamp: '2026-03-22 15:00', operator: '李风控', action: 'CREATED' },
            { timestamp: '2026-03-22 16:30', operator: '李风控', action: 'SUBMITTED_FOR_REVIEW' },
            { timestamp: '2026-03-23 09:00', operator: '张董秘', action: 'REJECTED', comment: '公告内容中关于“对期后利润影响”的表述过于绝对，建议修改为“存在不确定性”，并补充律师意见书摘要。' }
        ]
    },
    // 3. Active - Approved (Ready to Submit)
    { 
        id: 'task-104', 
        definitionId: 'def-004', 
        definitionName: '风控部-风险资本准备计算表', 
        cycle: '2026-03', 
        status: 'APPROVED', 
        deadline: '2026-04-10',
        caseCount: 14, 
        totalAmount: 920000000, 
        creator: '王法务', 
        createTime: '2026-03-21',
        snapshotId: 'snap-mock-004',
        generatedFileUrl: 'mock-xls-url',
        reviewer: '张合规',
        history: [
            { timestamp: '2026-03-21 10:00', operator: '王法务', action: 'CREATED' },
            { timestamp: '2026-03-21 11:00', operator: '王法务', action: 'SUBMITTED_FOR_REVIEW' },
            { timestamp: '2026-03-22 10:00', operator: '张合规', action: 'APPROVED' }
        ]
    }
];

// Helper to generate some static case data for the snapshot
const generateSnapshotData = (): Case[] => [
    {
        id: 'c-001',
        key: 'ZD-JRJK-2026-001',
        issueType: IssueType.CASE,
        status: CaseStage.FIRST_INSTANCE,
        createdAt: '2025-11-15',
        code: 'ZD-JRJK-2026-001',
        title: '永绿集团债券违约纠纷案',
        stage: CaseStage.FIRST_INSTANCE,
        businessLine: BusinessLine.PROPRIETARY,
        cause: '公司债券交易纠纷',
        riskLevel: RiskLevel.HIGH,
        plaintiff: '我司',
        defendant: '永绿控股',
        court: '上海金融法院',
        filingDate: '2025-11-15',
        caseType: CaseType.STANDARD,
        regulatoryAttrs: { amountNoInterest: 85000000 } as any
    },
    {
        id: 'c-002',
        key: 'TD-XJCS-2025-089',
        issueType: IssueType.CASE,
        status: CaseStage.SECOND_INSTANCE,
        createdAt: '2024-05-20',
        code: 'TD-XJCS-2025-089',
        title: 'TechNova IPO 虚假陈述集体诉讼',
        stage: CaseStage.SECOND_INSTANCE,
        businessLine: BusinessLine.IB,
        cause: '证券虚假陈述',
        riskLevel: RiskLevel.CRITICAL,
        plaintiff: '投资者',
        defendant: 'TechNova',
        court: '北京高院',
        filingDate: '2024-05-20',
        caseType: CaseType.STANDARD,
        regulatoryAttrs: { amountNoInterest: 120000000 } as any
    }
];

// Mock Snapshots
let MOCK_SNAPSHOTS: DataSnapshot[] = [
    {
        id: 'snap-mock-001',
        batchNo: 'SNAP-20260228',
        name: '2026-02 月结锁定数据',
        lockDate: '2026-02-28',
        createdAt: '2026-03-01',
        createdBy: '系统自动',
        caseCount: 12,
        totalAmount: 850000000,
        status: 'LOCKED',
        data: generateSnapshotData() // Pre-fill with data so viewer works
    }
];

// Mock Reconciliation Notes Storage (Key: caseId, Value: note)
let MOCK_RECONCILIATION_NOTES: Record<string, string> = {
    'c-001': '差异系诉讼费预缴时间差导致，财务下月入账。'
};

// --- Definitions & Tasks ---

export const getReportDefinitions = async (): Promise<ReportDefinition[]> => {
    developmentBoundary('reporting.getReportDefinitions', false);
    return new Promise(resolve => setTimeout(() => resolve(MOCK_DEFINITIONS), 300));
};

export const getReportingTasks = async (): Promise<ReportingTask[]> => {
    developmentBoundary('reporting.getReportingTasks', false);
    return new Promise(resolve => setTimeout(() => resolve([...MOCK_TASKS]), 400));
};

// Calendar Logic: Calculate upcoming deadlines based on definitions
export const getRegulatoryCalendar = async (): Promise<{date: string, events: string[]}[]> => {
    developmentBoundary('reporting.getRegulatoryCalendar', false);
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    
    const events = [];

    // Simple logic to generate this month's deadlines
    for (const def of MOCK_DEFINITIONS) {
        if (def.triggerType === 'PERIODIC' && def.deadlineDay) {
            // For monthly reports, deadline is next month's day
            // But here we mock "upcoming" as if we are in current cycle
            const d = new Date(currentYear, currentMonth, def.deadlineDay);
            if (d < today) {
                // If passed, show next month
                d.setMonth(d.getMonth() + 1);
            }
            
            events.push({
                date: d.toISOString().split('T')[0],
                events: [`[${def.targetOrg}] ${def.name} 截止`]
            });
        }
    }
    return Promise.resolve(events);
};

export const createReportingTask = async (
    defId: string, 
    cycle: string, 
    snapshotId?: string,
    excludedCaseIds: string[] = [],
    customName?: string
): Promise<ReportingTask> => {
    return new Promise(resolve => {
        setTimeout(async () => {
            const def = MOCK_DEFINITIONS.find(d => d.id === defId);
            if (!def) throw new Error("Definition not found");

            // If snapshot provided, use its data, else use live data
            let casesSource: Case[] = [];

            if (snapshotId) {
                const snap = MOCK_SNAPSHOTS.find(s => s.id === snapshotId);
                if (snap && snap.data) {
                    casesSource = snap.data;
                }
            } else {
                casesSource = await getCases(); 
            }

            // Apply Exclusion Logic
            const validCases = casesSource.filter(c => !excludedCaseIds.includes(c.id));
            
            const caseCount = validCases.length;
            const totalAmount = validCases.reduce((acc, c) => acc + (c.regulatoryAttrs?.amountNoInterest || 0), 0);
            
            const newTask: ReportingTask = {
                id: `task-${Date.now()}`,
                definitionId: def.id,
                definitionName: customName || def.name,
                cycle: cycle,
                status: 'DRAFT',
                deadline: `${cycle}-05`, // Mock deadline
                caseCount, 
                totalAmount,
                snapshotId,
                creator: '当前用户',
                createTime: new Date().toISOString().split('T')[0],
                history: [
                    { timestamp: new Date().toLocaleString(), operator: '当前用户', action: 'CREATED' }
                ]
            };
            MOCK_TASKS = [newTask, ...MOCK_TASKS];
            resolve(newTask);
        }, 600);
    });
};

export const updateTaskStatus = async (taskId: string, status: ReportingTask['status'], comment?: string): Promise<void> => {
    developmentBoundary('reporting.updateTaskStatus', true);
    return new Promise(resolve => {
        setTimeout(() => {
            MOCK_TASKS = MOCK_TASKS.map(t => {
                if (t.id === taskId) {
                    // Map Status to Action for History
                    let action: ReportingTaskLog['action'] = 'SUBMITTED_FOR_REVIEW';
                    if (status === 'APPROVED') action = 'APPROVED';
                    if (status === 'REJECTED') action = 'REJECTED';
                    if (status === 'SUBMITTED') action = 'FILED';
                    if (status === 'REVIEWING') action = 'SUBMITTED_FOR_REVIEW';

                    const newHistory: ReportingTaskLog = {
                        timestamp: new Date().toLocaleString(),
                        operator: '当前用户', // In real app, this is current user
                        action,
                        comment
                    };

                    return { 
                        ...t, 
                        status, 
                        history: [newHistory, ...(t.history || [])] 
                    };
                }
                return t;
            });
            resolve();
        }, 300);
    });
};

// --- Snapshots (The Freezer) ---

export const getSnapshots = async (): Promise<DataSnapshot[]> => {
    developmentBoundary('reporting.getSnapshots', false);
    return new Promise(resolve => setTimeout(() => resolve([...MOCK_SNAPSHOTS]), 300));
};

export const getSnapshotsByCycle = async (cycle: string): Promise<DataSnapshot[]> => {
    developmentBoundary('reporting.getSnapshotsByCycle', false);
    // Filter snapshots that match the cycle (YYYY-MM) based on lockDate
    return new Promise(resolve => setTimeout(() => {
        resolve(MOCK_SNAPSHOTS.filter(s => s.lockDate.startsWith(cycle)));
    }, 200));
};

export const createSnapshot = async (
    lockDate: string = new Date().toISOString().split('T')[0],
    customName?: string
): Promise<DataSnapshot> => {
    const liveCases = await getCases();
    // Deep copy to simulate freezing
    const frozenData = JSON.parse(JSON.stringify(liveCases));
    const totalAmount = frozenData.reduce((acc: number, c: Case) => acc + (c.regulatoryAttrs?.amountNoInterest || 0), 0);

    return new Promise(resolve => {
        setTimeout(() => {
            const newSnap: DataSnapshot = {
                id: `snap-${Date.now()}`,
                batchNo: `SNAP-${lockDate.replace(/-/g,'')}`,
                name: customName || `${lockDate.substring(0,7)} 月结锁定数据`,
                lockDate: lockDate,
                createdAt: new Date().toISOString().split('T')[0],
                createdBy: '当前用户',
                caseCount: frozenData.length,
                totalAmount: totalAmount,
                status: 'LOCKED',
                data: frozenData // Store the frozen data!
            };
            MOCK_SNAPSHOTS = [newSnap, ...MOCK_SNAPSHOTS];
            resolve(newSnap);
        }, 800);
    });
};

// --- Templates & Consistency ---

export const getTemplates = async (): Promise<ReportTemplate[]> => {
    developmentBoundary('reporting.getTemplates', false);
    return new Promise(resolve => setTimeout(() => resolve([
        { id: 't-1', name: '证监局月报模板_2026版', targetOrg: '证监局', fileFormat: 'xlsx', mappingsCount: 15, lastUpdated: '2026-01-10' },
        { id: 't-2', name: '交易所重大诉讼公告模板', targetOrg: '交易所', fileFormat: 'docx', mappingsCount: 8, lastUpdated: '2025-12-01' }
    ]), 300));
};

export const runConsistencyCheck = async (): Promise<ConsistencyResult[]> => {
    developmentBoundary('reporting.runConsistencyCheck', true);
    const cases = await getCases();
    const results: ConsistencyResult[] = [];
    
    for (const c of cases) {
        if (c.stage === CaseStage.CLOSED || c.stage === CaseStage.CLUE) continue;
        
        const finance = await getFinanceByCaseId(c.id);
        const legalAmt = c.regulatoryAttrs?.amountNoInterest || 0;
        
        // Mock Finance Amount logic: usually claimedAmount or provisionAmount depending on context
        // Here we simulate checking against 'claimedAmount' in finance system
        const financeAmt = finance?.claimedAmount || 0; 
        
        const diff = legalAmt - financeAmt;
        const diffRatio = financeAmt !== 0 ? (Math.abs(diff) / financeAmt) * 100 : (legalAmt > 0 ? 100 : 0);
        
        // Flag if difference is significant (> 1% or > 10000 CNY)
        const isFlagged = diffRatio > 1 || Math.abs(diff) > 10000;
        
        results.push({
            id: `chk-${c.id}`,
            caseId: c.id,
            caseCode: c.code,
            caseName: c.title,
            legalAmount: legalAmt,
            financeAmount: financeAmt,
            diff,
            diffRatio,
            isFlagged,
            reconciliationNote: MOCK_RECONCILIATION_NOTES[c.id] // Attach existing note
        });
    }
    return results;
};

export const saveReconciliationNote = async (caseId: string, note: string): Promise<void> => {
    developmentBoundary('reporting.saveReconciliationNote', true);
    return new Promise(resolve => {
        setTimeout(() => {
            MOCK_RECONCILIATION_NOTES[caseId] = note;
            resolve();
        }, 200);
    });
};
