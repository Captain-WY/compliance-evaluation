import {developmentBoundary} from '../../../../platform/developmentBoundary';

import { Case, BriefingRecord, InternalReport, InternalReportType, InternalReportSubType, ReportTargetAudience } from '../../types';
import { getCases } from './cases';
import { getSnapshots } from './reporting';

let MOCK_BRIEFINGS: BriefingRecord[] = [
    {
        id: 'br-001',
        caseId: 'case_0001',
        caseTitle: '实控人股票质押式回购违约案',
        type: '立案签报',
        generatedAt: '2026-01-06 10:30',
        generator: '李风控',
        status: '已归档',
        downloadUrl: '#',
        content: '【立案签报】\n\n一、基本情况\n案号：TD-GPYW-2026-012\n涉案金额：4.5亿元\n...'
    },
    {
        id: 'br-002',
        caseId: 'case_0002',
        caseTitle: 'TechNova 虚假陈述系列索赔总案',
        type: '重大事项专报',
        generatedAt: '2026-03-15 14:00',
        generator: '张合规',
        status: 'OA审批中',
        downloadUrl: '#'
    },
    {
        id: 'br-003',
        caseId: 'case_0003',
        caseTitle: '永绿集团债券违约纠纷案',
        type: '进展签报',
        generatedAt: '2026-02-20 09:15',
        generator: '王法务',
        status: '已归档',
        downloadUrl: '#'
    }
];

let MOCK_REPORTS: InternalReport[] = [
    {
        id: 'ir-001',
        title: '2026年2月度法律风险管理综报',
        cycle: '2026-02',
        type: InternalReportType.PERIODIC,
        subType: InternalReportSubType.MONTHLY,
        targetAudience: [ReportTargetAudience.LEGAL_HEAD, ReportTargetAudience.CRO],
        generatedAt: '2026-03-05',
        status: 'SUBMITTED',
        snapshotId: 'snap-mock-001',
        snapshotName: '2026-02 月结锁定数据',
        metrics: {
            totalCases: 45,
            highRiskCount: 8,
            totalAmount: 1250000000
        },
        summary: '本月新增案件3起，结案2起。整体风险可控，无新增重大风险案件。',
        conclusion: '建议继续加强对信用业务的风险排查。',
        attachments: [],
        sections: ['Executive Summary', 'Risk Heatmap', 'Financial Analysis']
    },
    {
        id: 'ir-002',
        title: '2025年度法律事务工作总结',
        cycle: '2025-Annual',
        type: InternalReportType.PERIODIC,
        subType: InternalReportSubType.ANNUAL,
        targetAudience: [ReportTargetAudience.BOARD],
        generatedAt: '2026-01-15',
        status: 'SUBMITTED',
        snapshotId: 'snap-hist-2025',
        snapshotName: '2025年终决算快照',
        metrics: {
            totalCases: 120,
            highRiskCount: 15,
            totalAmount: 3500000000
        },
        summary: '2025年全年处理案件120起，挽回损失3.5亿元。',
        conclusion: '全面达成年度风控目标。',
        attachments: [],
        sections: ['Overview', 'Key Achievements', 'Cost Analysis', 'Next Year Plan']
    }
];

export const getBriefingHistory = async (): Promise<BriefingRecord[]> => {
    developmentBoundary('internalReporting.getBriefingHistory', false);
    return new Promise(resolve => setTimeout(() => resolve([...MOCK_BRIEFINGS].sort((a,b) => b.generatedAt.localeCompare(a.generatedAt))), 400));
};

export const addBriefingRecord = async (record: Omit<BriefingRecord, 'id' | 'generatedAt' | 'status'>): Promise<void> => {
    developmentBoundary('internalReporting.addBriefingRecord', true);
    return new Promise(resolve => {
        setTimeout(() => {
            const newRecord: BriefingRecord = {
                id: `br-${Date.now()}`,
                generatedAt: new Date().toLocaleString(),
                status: '草稿', 
                ...record
            };
            MOCK_BRIEFINGS.unshift(newRecord);
            resolve();
        }, 500);
    });
};

export const updateBriefingRecord = async (id: string, updates: Partial<BriefingRecord>): Promise<void> => {
    developmentBoundary('internalReporting.updateBriefingRecord', true);
    return new Promise(resolve => {
        setTimeout(() => {
            const idx = MOCK_BRIEFINGS.findIndex(b => b.id === id);
            if (idx !== -1) {
                MOCK_BRIEFINGS[idx] = { ...MOCK_BRIEFINGS[idx], ...updates };
            }
            resolve();
        }, 300);
    });
};

export const getInternalReports = async (): Promise<InternalReport[]> => {
    developmentBoundary('internalReporting.getInternalReports', false);
    return new Promise(resolve => setTimeout(() => resolve([...MOCK_REPORTS]), 300));
};

export const generateInternalReport = async (
    cycle: string, 
    type: InternalReportType, 
    subType: InternalReportSubType,
    selectedCaseIds?: string[],
    snapshotId?: string, // Optional snapshot ID
    extraData?: Partial<InternalReport>
): Promise<InternalReport> => {
    
    let metrics = {
        totalCases: 0,
        highRiskCount: 0,
        totalAmount: 0
    };

    // Data Source Logic
    let sourceCases: Case[] = [];
    let snapshotName = '实时数据 (Live)';

    if (snapshotId) {
        const snapshots = await getSnapshots();
        const snap = snapshots.find(s => s.id === snapshotId);
        if (snap && snap.data) {
            sourceCases = snap.data;
            snapshotName = snap.name;
        } else {
            // Fallback to live if snapshot empty/not found (should not happen in prod)
            sourceCases = await getCases(); 
        }
    } else {
        sourceCases = await getCases();
    }

    // Filter Logic
    if (selectedCaseIds && selectedCaseIds.length > 0) {
        // Ad-hoc selection
        const selected = sourceCases.filter(c => selectedCaseIds.includes(c.id));
        metrics = {
            totalCases: selected.length,
            highRiskCount: selected.filter(c => c.riskLevel === '重大' || c.riskLevel === '特大').length,
            totalAmount: selected.reduce((sum, c) => sum + (c.regulatoryAttrs?.amountNoInterest || 0), 0)
        };
        // For ad-hoc without explicit snapshot, imply live selection
        if (!snapshotId) snapshotName = '自定义选取 (Custom Selection)';
    } else {
        // Full report based on source
        metrics = {
            totalCases: sourceCases.length,
            highRiskCount: sourceCases.filter(c => c.riskLevel === '重大' || c.riskLevel === '特大').length,
            totalAmount: sourceCases.reduce((sum, c) => sum + (c.regulatoryAttrs?.amountNoInterest || 0), 0)
        };
    }

    return new Promise(resolve => {
        setTimeout(() => {
            const newReport: InternalReport = {
                id: `ir-${Date.now()}`,
                title: extraData?.title || `${cycle} ${type} Report`,
                cycle: cycle || 'Ad-hoc',
                type,
                subType,
                targetAudience: extraData?.targetAudience || [],
                generatedAt: new Date().toISOString().split('T')[0],
                status: 'DRAFT',
                snapshotId,
                snapshotName,
                metrics,
                summary: extraData?.summary || '',
                conclusion: extraData?.conclusion || '',
                attachments: extraData?.attachments || [],
                sections: ['Overview', 'Risk Analysis', 'Cost Control', 'Appendices']
            };
            MOCK_REPORTS.unshift(newReport);
            resolve(newReport);
        }, 1500);
    });
};
