import {developmentBoundary} from '../../../../platform/developmentBoundary';
import { ProcedureRecord, CommunicationLog, AssetClue, AssetType, AssetStatus, FeeTransaction, TransactionType, TransactionStatus } from '../../types';

// --- Mock Data for Sub-Ledgers ---

// 1. Procedure & Deadline Records (附表1)
export const MOCK_PROCEDURE_RECORDS: ProcedureRecord[] = [
    {
        id: 'pr-001',
        caseId: 'c-001',
        stage: '一审',
        nodeName: '提交立案材料',
        deadline: '2026-01-15',
        completionDate: '2026-01-12',
        assignee: '陈法务',
        status: 'COMPLETED',
        note: '法院已正式受理'
    },
    {
        id: 'pr-002',
        caseId: 'c-001',
        stage: '一审',
        nodeName: '财产保全申请期',
        deadline: '2026-01-20',
        completionDate: '2026-01-18',
        assignee: '刘律师(外聘)',
        status: 'COMPLETED',
        note: '已冻结被告三个银行账户'
    },
    {
        id: 'pr-003',
        caseId: 'c-001',
        stage: '一审',
        nodeName: '一审开庭',
        deadline: '2026-03-25', // Matches nextDeadline in cases.ts
        assignee: '陈法务',
        status: 'PENDING',
        note: '传票已收，准备出庭排期'
    },
    {
        id: 'pr-004',
        caseId: 'c-002',
        stage: '一审',
        nodeName: '提交答辩状及证据',
        deadline: '2026-02-28',
        assignee: '林专员',
        status: 'OVERDUE',
        note: '业务部投行底稿仍在梳理中，需催办'
    },
    // --- Complex Case Records ---
    {
        id: 'pr-complex-01',
        caseId: 'c-complex-001',
        stage: '一审',
        nodeName: '一审判决',
        deadline: '2024-12-20',
        completionDate: '2024-12-15',
        assignee: '陈法务',
        status: 'COMPLETED',
        note: '判决我司败诉，赔偿1500万'
    },
    {
        id: 'pr-complex-02',
        caseId: 'c-complex-001',
        stage: '二审',
        nodeName: '二审开庭',
        deadline: '2025-06-10',
        completionDate: '2025-06-05',
        assignee: '陈法务',
        status: 'COMPLETED',
        note: '主张一审事实认定不清，程序违法'
    },
    {
        id: 'pr-complex-03',
        caseId: 'c-complex-001',
        stage: '二审',
        nodeName: '二审裁定',
        deadline: '2025-09-01',
        completionDate: '2025-08-28',
        assignee: '陈法务',
        status: 'COMPLETED',
        note: '裁定撤销原判，发回重审'
    },
    {
        id: 'pr-complex-04',
        caseId: 'c-complex-001',
        stage: '重一审',
        nodeName: '重审立案',
        deadline: '2025-10-15',
        completionDate: '2025-10-10',
        assignee: '陈法务',
        status: 'COMPLETED',
        note: '案号：(2025)沪01民初重字第5号'
    },
    {
        id: 'pr-complex-05',
        caseId: 'c-complex-001',
        stage: '重一审',
        nodeName: '证据交换',
        deadline: '2026-05-20',
        assignee: '陈法务',
        status: 'PENDING',
        note: '等待法院通知'
    },
    // --- Series Case Records ---
    {
        id: 'pr-sub-001',
        caseId: 'CASE-SUB-001',
        stage: '一审',
        nodeName: '一审判决',
        deadline: '2025-12-30',
        completionDate: '2025-12-25',
        assignee: '李总监',
        status: 'COMPLETED',
        note: '判决赔偿50%，双方均上诉'
    },
    {
        id: 'pr-sub-002',
        caseId: 'CASE-SUB-001',
        stage: '二审',
        nodeName: '二审立案',
        deadline: '2026-02-15',
        completionDate: '2026-02-10',
        assignee: '李总监',
        status: 'COMPLETED',
        note: '北京高院已受理'
    }
];

// 2. Financial Records (附表2 - Expenses & Recovery)
export const MOCK_FINANCIAL_LEDGER: FeeTransaction[] = [
    {
        id: 'ft-001',
        caseId: 'c-001',
        type: TransactionType.COURT_FEE,
        amount: 841800,
        currency: 'CNY',
        date: '2026-01-16',
        applicant: '陈法务',
        description: '案件受理费预交',
        status: TransactionStatus.PAID
    },
    {
        id: 'ft-002',
        caseId: 'c-001',
        type: TransactionType.LAWYER_FEE,
        amount: 200000,
        currency: 'CNY',
        date: '2026-02-01',
        applicant: '陈法务',
        description: '一审固定代理费',
        status: TransactionStatus.PAID
    },
    {
        id: 'ft-003',
        caseId: 'c-002',
        type: TransactionType.COURT_FEE, // Using Court Fee type for Appraisal as closest match or add new type
        amount: 50000,
        currency: 'CNY',
        date: '2026-03-01',
        applicant: '林专员',
        description: '司法鉴定费预估',
        status: TransactionStatus.PENDING
    },
    // --- Epic Case Finance ---
    {
        id: 'ft-epic-001',
        caseId: 'CASE-EPIC-001',
        type: TransactionType.LAWYER_FEE,
        amount: 500000,
        currency: 'CNY',
        date: '2024-06-01',
        applicant: '李总监',
        description: '一审前期代理费 (总包)',
        status: TransactionStatus.PAID
    },
    {
        id: 'ft-epic-002',
        caseId: 'CASE-EPIC-001',
        type: TransactionType.LAWYER_FEE,
        amount: 300000,
        currency: 'CNY',
        date: '2025-01-15',
        applicant: '李总监',
        description: '一审中期进度款',
        status: TransactionStatus.PAID
    },
    {
        id: 'ft-epic-003',
        caseId: 'CASE-EPIC-001',
        type: TransactionType.LAWYER_FEE,
        amount: 200000,
        currency: 'CNY',
        date: '2025-07-01',
        applicant: '李总监',
        description: '二审启动费',
        status: TransactionStatus.PENDING
    }
];

// 3. Asset Preservation Records (附表3)
export const MOCK_ASSET_LEDGER: AssetClue[] = [
    {
        id: 'ac-001',
        caseId: 'c-001',
        type: AssetType.BANK,
        description: '招商银行北京分行账户6222***',
        valuation: 5000000,
        status: AssetStatus.CONTROLLED,
        controlMeasure: '诉前保全',
        controlStartDate: '2026-01-18',
        controlEndDate: '2027-01-17', // 1 year for bank accounts
        preservationRulingNo: '(2026)京74财保1号',
        executingCourt: '北京金融法院'
    },
    {
        id: 'ac-002',
        caseId: 'c-001',
        type: AssetType.REAL_ESTATE,
        description: '深圳市南山区XX公馆3栋A座',
        valuation: 25000000,
        status: AssetStatus.CONTROLLED,
        controlMeasure: '诉中保全',
        controlStartDate: '2026-02-05',
        controlEndDate: '2029-02-04', // 3 years for real estate
        preservationRulingNo: '(2026)京74财保2号',
        executingCourt: '北京金融法院'
    }
];

// 4. Communication Logs (附表4)
export const MOCK_COMMUNICATION_LOGS: CommunicationLog[] = [
    {
        id: 'log-001',
        caseId: 'c-002',
        date: '2026-02-15',
        type: '跨部门协同',
        participants: '投行业务部-项目组',
        summary: '催促投行部提供工作底稿中关于环境核查的专项报告，作为答辩关键证据。业务部承诺周五前给到。',
        attachments: ['邮件截图.png'],
        recorder: '林专员',
        status: '已确认'
    },
    {
        id: 'log-002',
        caseId: 'c-002',
        date: '2026-02-18',
        type: '策略研讨会',
        participants: '法务总监、林专员、中伦张律',
        summary: '确认答辩口径：我方保荐过程中已核查环保合规文件，不构成重大遗漏，争取免责。',
        attachments: ['会议纪要20260218.pdf'],
        recorder: '林专员',
        status: '归档'
    },
    {
        id: 'log-003',
        caseId: 'c-001',
        date: '2026-02-20',
        type: '法院沟通',
        participants: '北京金融法院王法官',
        summary: '法官来电询问是否接受庭前调解。我方表示因涉案金额巨大需经投委会审批，暂不接受调解，要求按期开庭。',
        attachments: ['通话录音.mp3'],
        recorder: '陈法务',
        status: '归档'
    }
];

// --- API Helpers ---

export const getProcedureRecords = async (caseId: string): Promise<ProcedureRecord[]> => {
    developmentBoundary('ledgers.getProcedureRecords', false);
    return new Promise(resolve => setTimeout(() => resolve(MOCK_PROCEDURE_RECORDS.filter(r => r.caseId === caseId)), 200));
};

export const getFinancialRecords = async (caseId: string): Promise<FeeTransaction[]> => {
    developmentBoundary('ledgers.getFinancialRecords', false);
    return new Promise(resolve => setTimeout(() => resolve(MOCK_FINANCIAL_LEDGER.filter(r => r.caseId === caseId)), 200));
};

export const getAssetRecords = async (caseId: string): Promise<AssetClue[]> => {
    developmentBoundary('ledgers.getAssetRecords', false);
    return new Promise(resolve => setTimeout(() => resolve(MOCK_ASSET_LEDGER.filter(r => r.caseId === caseId)), 200));
};

export const getCommunicationLogs = async (caseId: string): Promise<CommunicationLog[]> => {
    developmentBoundary('ledgers.getCommunicationLogs', false);
    return new Promise(resolve => setTimeout(() => resolve(MOCK_COMMUNICATION_LOGS.filter(r => r.caseId === caseId)), 200));
};
