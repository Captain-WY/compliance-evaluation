import {developmentBoundary} from '../../../../platform/developmentBoundary';

import { Clue, RiskLevel, IssueType, CaseStage } from '../../types';

let MOCK_CLUES_STORE: Clue[] = [
  {
    id: 'cl-001',
    key: 'CLUE-2026-001',
    issueType: IssueType.CLUE,
    title: '客户李四投诉营业部强平操作违规',
    createdAt: '2026-03-10',
    status: '待清洗',
    stage: CaseStage.CLUE, // Added for Kanban visibility
    source: '业务上报',
    reporter: '张伟 (经纪业务部)',
    reportDate: '2026-03-10',
    content: '客户李四投诉营业部强平操作违规，声称损失约 50 万元，已发律师函。',
    attachedFiles: ['律师函扫描件.pdf', '账户流水.xlsx'],
    riskLevel: RiskLevel.LOW,
    cleanedPlaintiff: '李四',
    cleanedDefendant: '我司',
    cleanedAmount: 500000
  },
  {
    id: 'cl-002',
    key: 'CLUE-2026-002',
    issueType: IssueType.CLUE,
    title: '收到深圳证监局问询函',
    createdAt: '2026-03-08',
    status: '待清洗',
    stage: CaseStage.CLUE, // Added for Kanban visibility
    source: '监管函件',
    reporter: '合规部转办',
    reportDate: '2026-03-08',
    content: '收到深圳证监局问询函，关于“XX科技”IPO项目中保荐代表人履职情况的调查。',
    attachedFiles: ['监管问询函.pdf'],
    riskLevel: RiskLevel.HIGH
  },
  {
    id: 'cl-003',
    key: 'CLUE-2026-003',
    issueType: IssueType.CLUE,
    title: '王五起诉公司融资融券纠纷',
    createdAt: '2026-03-05',
    status: '已转立案',
    stage: CaseStage.CLUE, // Added for Kanban visibility
    source: 'OCR抓取',
    reporter: '系统自动',
    reportDate: '2026-03-05',
    content: '识别到法院传票：原告王五起诉公司融资融券合同纠纷。',
    attachedFiles: ['传票_OCR.jpg']
  }
];

export const getClues = async (): Promise<Clue[]> => {
    developmentBoundary('clues.getClues', false);
  return new Promise((resolve) => {
    setTimeout(() => resolve([...MOCK_CLUES_STORE]), 300);
  });
};

export const getClueById = async (id: string): Promise<Clue | undefined> => {
    developmentBoundary('clues.getClueById', false);
    return new Promise((resolve) => {
        setTimeout(() => resolve(MOCK_CLUES_STORE.find(c => c.id === id)), 200);
    });
};

export const addClue = async (clue: Omit<Clue, 'id' | 'key' | 'issueType' | 'status' | 'createdAt' | 'title'> & { title?: string }): Promise<Clue> => {
    developmentBoundary('clues.addClue', true);
    return new Promise((resolve) => {
        const id = `cl-${Date.now()}`;
        const newClue: Clue = {
            ...clue,
            id,
            key: `CLUE-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000)}`,
            issueType: IssueType.CLUE,
            title: clue.title || clue.content.substring(0, 30) + '...', // Auto generate title if missing
            status: '待清洗',
            createdAt: new Date().toISOString().split('T')[0]
        };
        MOCK_CLUES_STORE = [newClue, ...MOCK_CLUES_STORE];
        setTimeout(() => resolve(newClue), 400);
    });
};

export const updateClueStatus = async (id: string, status: Clue['status']): Promise<void> => {
    developmentBoundary('clues.updateClueStatus', true);
    return new Promise((resolve) => {
        MOCK_CLUES_STORE = MOCK_CLUES_STORE.map(c => c.id === id ? { ...c, status } : c);
        setTimeout(resolve, 200);
    });
};
