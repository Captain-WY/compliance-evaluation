import {developmentBoundary} from '../../../../platform/developmentBoundary';

import { CaseHistoryLog, CaseComment } from '../../types';

// Mock History Logs (System Generated)
export let MOCK_HISTORY_LOGS: CaseHistoryLog[] = [
    { id: 'h-001', caseId: 'c-001', operator: '王法务', timestamp: '2025-11-15 10:00', action: '创建案件', details: '案件立案登记完成' },
    { id: 'h-002', caseId: 'c-002', operator: '系统自动', timestamp: '2025-05-20 14:30', action: '风险升级', details: '风险等级由[重大]升级为[特大]' },
    { id: 'h-003', caseId: 'c-004', operator: '李风控', timestamp: '2026-03-20 09:00', action: '更新案情', details: '补充了质押物强平的最新进展描述' },
    // Storytelling logs for the Epic Case
    { id: 'h-epic-01', caseId: 'CASE-EPIC-001', operator: '系统自动', timestamp: '2026-03-15 09:00', action: '关联案件更新', details: '关联案件 [CASE-ADM-001] (行政处罚听证) 状态变更为：已结案' },
    { id: 'h-epic-02', caseId: 'CASE-EPIC-001', operator: '张合规', timestamp: '2026-03-15 10:30', action: '更新风险等级', details: '由 [重大] 升级为 [特大]' }
];

// Mock User Comments (Human Generated)
export let MOCK_COMMENTS: CaseComment[] = [
    {
        id: 'cm-001',
        caseId: 'c-001',
        userId: 'u-legal',
        userName: '王法务',
        userRole: '主办',
        content: '已联系金杜律师团队，他们建议在一审开庭前补充提交一份《资金流向说明》，以强化我方关于“实际用款人”的举证责任。@李风控 请协助调取财务凭证。',
        createdAt: '2025-12-05 14:30',
        isInternal: true
    },
    {
        id: 'cm-002',
        caseId: 'c-001',
        userId: 'u-risk',
        userName: '李风控',
        userRole: '风控',
        content: '收到，已安排财务部张三调取。预计明天下午给到。另外，对方律师似乎想申请延期举证，请关注。',
        createdAt: '2025-12-05 15:10',
        isInternal: true
    },
    {
        id: 'cm-003',
        caseId: 'c-004',
        userId: 'u-ext',
        userName: 'Robert (外聘)',
        userRole: '律师',
        content: '一审开庭笔录已上传至文档中心。法官对“让与担保”的性质认定比较谨慎，可能需要补充最高院相关类案判决支持我方观点。',
        createdAt: '2026-01-15 11:00',
        isInternal: false
    },
    // Storytelling comments for the Epic Case (Internal Debate)
    {
        id: 'cm-epic-01',
        caseId: 'CASE-EPIC-001',
        userId: 'u-biz-head',
        userName: '刘总 (投行部)',
        userRole: '业务负责人',
        content: '刚才收到消息，证监会行政处罚决定书已经下来了。这对民事赔偿的认定非常不利。我们是否考虑启动批量和解程序？这几百个投资者的诉讼如果拖下去，对公司后续IPO项目声誉影响太大。',
        createdAt: '2026-03-16 09:30',
        isInternal: true
    },
    {
        id: 'cm-epic-02',
        caseId: 'CASE-EPIC-001',
        userId: 'u-legal-dir',
        userName: '陈总法',
        userRole: '法务总监',
        content: '@刘总 (投行部) 同意。行政处罚落地意味着“虚假陈述”事实成立，抗辩空间已被压缩。目前策略应转为“定损核减”。建议先筛选出索赔金额在50万以下的小额案件进行试探性和解。',
        createdAt: '2026-03-16 10:15',
        isInternal: true
    },
    {
        id: 'cm-epic-03',
        caseId: 'CASE-EPIC-001',
        userId: 'u-ext-partner',
        userName: '张律师 (金杜)',
        userRole: '主办律师',
        content: '收到各位指示。我们会尽快拟定《批量和解方案》草案。目前关键是确立“基准日”和“系统风险扣除比例”。如果我们能争取到30%的系统风险扣除，预计能节省约4000万赔偿款。',
        createdAt: '2026-03-16 11:00',
        isInternal: true
    }
];

// Helper to add log internally without async delay (for other services)
export const logHistoryInternal = (log: Omit<CaseHistoryLog, 'id' | 'timestamp'>) => {
    developmentBoundary('caseActivity.logHistoryInternal', true);
    MOCK_HISTORY_LOGS.push({
        id: `h-${Date.now()}-${Math.random()}`,
        timestamp: new Date().toLocaleString(),
        ...log
    });
};

export const getCaseHistory = async (caseId: string): Promise<CaseHistoryLog[]> => {
    developmentBoundary('caseActivity.getCaseHistory', false);
    return new Promise(resolve => {
        setTimeout(() => {
            resolve(MOCK_HISTORY_LOGS.filter(h => h.caseId === caseId).sort((a,b) => b.timestamp.localeCompare(a.timestamp)));
        }, 300);
    });
};

export const getCaseComments = async (caseId: string): Promise<CaseComment[]> => {
    developmentBoundary('caseActivity.getCaseComments', false);
    return new Promise(resolve => {
        setTimeout(() => {
            resolve(MOCK_COMMENTS.filter(c => c.caseId === caseId).sort((a,b) => b.createdAt.localeCompare(a.createdAt)));
        }, 200);
    });
};

export const addCaseComment = async (comment: Omit<CaseComment, 'id' | 'createdAt'>): Promise<CaseComment> => {
    developmentBoundary('caseActivity.addCaseComment', true);
    return new Promise(resolve => {
        setTimeout(() => {
            const newComment: CaseComment = {
                ...comment,
                id: `cm-${Date.now()}`,
                createdAt: new Date().toLocaleString(),
            };
            MOCK_COMMENTS = [newComment, ...MOCK_COMMENTS];
            resolve(newComment);
        }, 300);
    });
};
