import {developmentBoundary} from '../../../../platform/developmentBoundary';

import { Case, CaseStage, RiskLevel, BusinessLine, CaseType, RegulatoryAttributes, IssueType, IssueLink, CaseHistoryLog, CaseComment, CaseRole, ExecutionMeasureType, ExecutionBasisType } from '../../types';
import { logHistoryInternal, MOCK_HISTORY_LOGS, MOCK_COMMENTS } from './caseActivity';
import { scanCaseForRisks, addDisclosureTask } from './riskEngine';
import { generateCaseCode } from '../../services/utils/codeGenerator';

// ... (Keep existing helpers like generateHistoricalData, triggerSeriesAggregation, checkRisk) ...

const generateHistoricalData = (): Case[] => {
    const historicalCases: Case[] = [];
    const months = 6;
    const now = new Date();
    
    for (let i = 0; i < months; i++) {
        const date = new Date(now);
        date.setMonth(date.getMonth() - i);
        const monthStr = date.toISOString().slice(0, 7);
        // Create a few cases per month
        for (let j = 0; j < 3; j++) {
            historicalCases.push({
                id: `hist-${monthStr}-${j}`,
                key: `HIST-${monthStr.replace('-', '')}-${j}`,
                code: `HIST-${monthStr.replace('-', '')}-${j}`,
                issueType: IssueType.CASE,
                title: `历史案件 ${monthStr}-${j}`,
                description: 'Generated historical data for analytics testing.',
                stage: CaseStage.CLOSED,
                status: CaseStage.CLOSED,
                procedureType: 'CIVIL_LITIGATION',
                businessLine: j % 2 === 0 ? BusinessLine.IB : BusinessLine.BROKERAGE,
                ourRole: j % 2 === 0 ? CaseRole.DEFENDANT : CaseRole.PLAINTIFF,
                cause: '证券纠纷',
                riskLevel: RiskLevel.LOW,
                plaintiff: 'Historical Plaintiff',
                defendant: 'Historical Defendant',
                court: 'Historical Court',
                filingDate: `${monthStr}-01`,
                createdAt: `${monthStr}-01`,
                caseType: CaseType.STANDARD,
                tags: ['Historical'],
                regulatoryAttrs: {
                    regCaseCode: 'HIST',
                    regCauseName: '历史数据',
                    sector: '主板',
                    isInvestorProtection: false,
                    isMajor: false,
                    amountNoInterest: 1000000,
                    amountWithInterest: 1000000
                },
                linkedIssues: []
            });
        }
    }
    return historicalCases;
};

// Helper to add default members to all mock cases
const withDefaultMembers = (c: Case): Case => ({
    ...c,
    authorizedMembers: [
        { userId: 'legal-1', userName: '陈法务', role: 'OWNER', joinedAt: '2025-01-01' },
        { userId: 'legal-2', userName: '李总监', role: 'MEMBER', joinedAt: '2025-01-01' }
    ]
});

// Update MOCK_CASES_STORE initialization
export let MOCK_CASES_STORE: Case[] = [
  ...generateHistoricalData().map(withDefaultMembers), 
  
  // --- SCENARIO 1: The "Net Capital Killer" ---
  withDefaultMembers({
    id: 'c-risk-999',
    key: 'TD-ZQJY-2026-001',
    code: 'TD-ZQJY-2026-001',
    issueType: IssueType.CASE,
    title: '【极端测试】某城投债违约及连带责任担保纠纷',
    description: '自营持有的城投债发生实质性违约，涉及本金20亿元。因担保函效力存在重大法律瑕疵，预计全额计提损失。此案将严重影响公司当期净资本指标。',
    stage: CaseStage.FIRST_INSTANCE,
    status: CaseStage.FIRST_INSTANCE,
    procedureType: 'CIVIL_LITIGATION',
    businessLine: BusinessLine.PROPRIETARY, 
    ourRole: CaseRole.PLAINTIFF,
    cause: '证券回购合同纠纷',
    riskLevel: RiskLevel.CRITICAL, 
    plaintiff: '我司',
    defendant: 'XX城市建设投资集团',
    court: '最高人民法院', 
    filingDate: '2026-01-01',
    createdAt: '2026-01-01',
    nextDeadline: '2026-03-25',
    caseType: CaseType.STANDARD,
    tags: ['城投债', '表内业务', '净资本敏感'],
    regulatoryAttrs: {
        regCaseCode: 'ZQ-099',
        regCauseName: '债券交易纠纷',
        securityCode: '188888',
        securityName: '26XX债01',
        sector: '债券',
        isInvestorProtection: false,
        isMajor: true,
        amountNoInterest: 2000000000,
        amountWithInterest: 2150000000,
        riskCoefficient: 1.0, 
        estimatedRiskCapitalDeduction: 2150000000 
    },
    linkedIssues: [],
    // Ledger Fields
    externalCaseNo: '(2026)最高法民初99号',
    targetSubject: '26XX债01',
    judge: { name: '张大法官', phone: '010-8888****' },
    provisionAmount: 2000000000
  }),

  // --- SCENARIO 2: Dirty Data ---
  withDefaultMembers({
    id: 'c-dirty-001',
    key: 'PT-HIST-2020-005',
    code: 'PT-HIST-2020-005',
    issueType: IssueType.CASE,
    title: '历史遗留档案 (缺少关键字段)',
    description: '这是一个从旧系统迁移过来的数据，缺少案由、对手方信息，用于测试报表生成的容错性。',
    stage: CaseStage.ARCHIVED,
    status: '已归档',
    procedureType: 'CIVIL_LITIGATION',
    businessLine: BusinessLine.SUPPORT,
    ourRole: CaseRole.THIRD_PARTY,
    cause: '', 
    riskLevel: RiskLevel.LOW,
    plaintiff: '未知主体',
    defendant: '', 
    court: '', 
    filingDate: '', 
    createdAt: '2020-01-01',
    caseType: CaseType.STANDARD,
    tags: ['数据清洗'],
    regulatoryAttrs: {
        regCaseCode: 'HIST',
        regCauseName: '历史数据',
        sector: '主板',
        isInvestorProtection: false,
        isMajor: false,
        amountNoInterest: 0,
        amountWithInterest: 0
    },
    linkedIssues: []
  }),

  // --- SCENARIO 3: Cross-border ---
  withDefaultMembers({
    id: 'c-cross-001',
    key: 'ZD-YSP-2025-002',
    code: 'ZD-YSP-2025-002',
    issueType: IssueType.CASE,
    title: 'Global Tech ETF 跨境收益互换仲裁案 (HKIAC)',
    description: 'Dispute regarding the valuation of cross-border return swaps under ISDA master agreement. The counterparty claims force majeure due to market volatility.',
    stage: CaseStage.ARBITRATION,
    status: CaseStage.ARBITRATION,
    procedureType: 'ARBITRATION',
    businessLine: BusinessLine.IB,
    ourRole: CaseRole.DEFENDANT,
    cause: '金融衍生品交易纠纷',
    riskLevel: RiskLevel.HIGH,
    plaintiff: 'Global Hedge Fund LP',
    defendant: '我司 (香港子公司)',
    court: '香港国际仲裁中心 (HKIAC)',
    filingDate: '2025-09-15',
    createdAt: '2025-09-15',
    nextDeadline: '2026-06-30',
    caseType: CaseType.STANDARD,
    tags: ['跨境', 'ISDA', '美元资产'],
    regulatoryAttrs: {
        regCaseCode: 'Q01',
        regCauseName: '衍生品纠纷',
        amountNoInterest: 350000000, 
        amountWithInterest: 360000000,
        sector: '主板', 
        isInvestorProtection: false,
        isMajor: true
    },
    linkedIssues: []
  }),

  // --- New Filing Case ---
  withDefaultMembers({
    id: 'c-new-001',
    key: 'YB-TZZX-2026-003',
    code: 'YB-TZZX-2026-003',
    issueType: IssueType.CASE,
    title: '某投顾产品收益纠纷 (诉前调解)',
    description: '客户王某因投资顾问产品收益未达预期，向法院提起诉讼。目前收到法院诉前调解通知，正在评估是否接受调解。',
    stage: CaseStage.FILING, 
    status: CaseStage.FILING,
    procedureType: 'CIVIL_LITIGATION',
    businessLine: BusinessLine.BROKERAGE,
    ourRole: CaseRole.DEFENDANT,
    cause: '证券投资咨询纠纷',
    riskLevel: RiskLevel.LOW,
    plaintiff: '王某',
    defendant: '我司',
    court: '深圳市福田区人民法院',
    filingDate: '2026-03-20',
    createdAt: '2026-03-20',
    nextDeadline: '2026-04-05',
    caseType: CaseType.STANDARD,
    tags: ['诉前调解'],
    regulatoryAttrs: {
        regCaseCode: 'S03',
        regCauseName: '证券投资咨询纠纷',
        amountNoInterest: 200000,
        amountWithInterest: 200000,
        sector: '主板',
        isInvestorProtection: false,
        isMajor: false
    },
    linkedIssues: [],
    stageDetails: {
        preLitigation: {
            mediation: {
                status: '进行中',
                mediator: '张调解员',
                date: '2026-03-22',
                note: '原告情绪激动，要求全额赔偿损失。我方主张已充分揭示风险，仅同意退还服务费。'
            }
        }
    }
  }),

  // --- Existing Cases (c-001) ---
  withDefaultMembers({
    id: 'c-001',
    key: 'ZD-ZQJY-2026-004', 
    code: 'ZD-ZQJY-2026-004',
    issueType: IssueType.CASE, 
    title: '永绿集团债券违约纠纷案',
    description: '我司自营持有的"20永绿01"债券到期违约。发行人永绿控股集团未能按期兑付本息，构成实质性违约。我司作为债券持有人，向上海金融法院提起诉讼，要求发行人偿还本金8500万元及利息。',
    summaryDetail: {
        background: '2020年3月，我司自营部门通过二级市场买入“20永绿01”公司债券，面值总额8500万元。发行人永绿控股集团因房地产调控及自身经营不善，于2025年11月未能按期兑付本息，构成实质性违约。',
        disputeFocus: '1. 发行人是否具备偿债能力及资产处置方案的可行性；\n2. 担保方是否应当承担连带清偿责任；\n3. 违约金及逾期利息的计算标准。',
        amountText: '本金人民币 8,500 万元，暂计利息及违约金 700 万元，合计 9,200 万元。',
        riskAssessment: '鉴于发行人已有多笔债券违约，且核心资产已被多轮查封，预计全额回款难度极大。建议尽快申请财产保全，并同步推进破产重整申报。对当期净利润可能产生较大计提压力。'
    },
    stage: CaseStage.FIRST_INSTANCE,
    status: CaseStage.FIRST_INSTANCE, 
    procedureType: 'CIVIL_LITIGATION',
    businessLine: BusinessLine.PROPRIETARY,
    ourRole: CaseRole.PLAINTIFF,
    cause: '公司债券交易纠纷',
    riskLevel: RiskLevel.HIGH,
    plaintiff: '我司 (自营分公司)',
    defendant: '永绿控股集团有限公司',
    court: '上海金融法院',
    filingDate: '2025-11-15',
    createdAt: '2025-11-15', 
    nextDeadline: '2026-03-25', 
    lawyerId: 'v-001',
    tags: ['债券违约', '财产保全'],
    caseType: CaseType.STANDARD,
    regulatoryAttrs: {
        regCaseCode: 'ZQ-001',
        regCauseName: '公司债券交易纠纷',
        securityCode: '136123',
        securityName: '20永绿01',
        sector: '债券',
        isInvestorProtection: false,
        isMajor: true,
        amountNoInterest: 85000000,
        amountWithInterest: 92000000,
        estimatedRiskCapitalDeduction: 46000000
    },
    linkedIssues: [],
    stageDetails: {
        preLitigation: {
            preservation: {
                status: '已保全',
                court: '上海金融法院',
                date: '2025-11-20',
                amount: 92000000
            }
        },
        firstInstance: {
            filing: {
                caseNo: '(2025)沪74民初1234号',
                court: '上海金融法院',
                date: '2025-11-15',
                judge: '王法官'
            },
            evidence: {
                deadline: '2025-12-15',
                submitDate: '2025-12-10',
                status: '已提交'
            },
            hearing: {
                date: '2026-01-20',
                status: '已开庭'
            },
            judgment: {
                date: '2026-03-30',
                result: '胜诉'
            }
        }
    }
  }),
  
  // --- 1. The Epic (Series Master) ---
  withDefaultMembers({
    id: 'CASE-EPIC-001',
    key: 'TD-XJCS-2025-005',
    code: 'TD-XJCS-2025-005',
    issueType: IssueType.EPIC, 
    title: 'TechNova 虚假陈述系列索赔总案 (示范判决)',
    description: 'TechNova科技在科创板IPO过程中涉嫌财务造假。投资者以证券虚假陈述为由提起集体诉讼。本案为“示范判决”案件，将决定后续数百起平行案件的赔付标准。',
    summaryDetail: {
        background: 'TechNova科技于2021年在科创板上市，我司担任保荐机构。2024年3月，证监会对其立案调查，认定其招股说明书存在虚增营收等财务造假行为。随后，大量投资者提起证券虚假陈述民事赔偿诉讼。',
        disputeFocus: '1. 虚假陈述实施日、揭露日及基准日的认定；\n2. 投资者损失与虚假陈述行为之间的因果关系；\n3. 保荐机构是否勤勉尽责，是否存在过错。',
        amountText: '首批示范案件索赔金额 1.2 亿元，后续潜在索赔总额预计超过 5 亿元。',
        riskAssessment: '作为保荐机构，若被认定未勤勉尽责，将承担连带赔偿责任。此案为科创板首批示范判决，社会关注度极高，败诉将严重损害公司声誉及投行业务资格。风险等级极高。'
    },
    stage: CaseStage.SECOND_INSTANCE,
    status: CaseStage.SECOND_INSTANCE,
    procedureType: 'CIVIL_LITIGATION',
    businessLine: BusinessLine.IB,
    ourRole: CaseRole.DEFENDANT,
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
    ],
    linkedIssues: [
        { targetId: 'CASE-ADM-001', targetKey: 'TD-XZCF-2024-006', type: 'BLOCKED_BY' }
    ]
  }),

  // --- 2. The Blocker (Related Admin Case) ---
  withDefaultMembers({
    id: 'CASE-ADM-001',
    key: 'TD-XZCF-2024-006',
    code: 'TD-XZCF-2024-006',
    issueType: IssueType.CASE,
    title: '证监会对 TechNova 行政处罚听证案',
    description: '证监会拟对 TechNova 及相关中介机构进行行政处罚。我司已申请听证，主张已勤勉尽责。此案结果将直接决定民事赔偿责任的认定。',
    stage: CaseStage.ADMIN_HEARING, 
    status: CaseStage.ADMIN_HEARING,
    procedureType: 'ADMIN', 
    businessLine: BusinessLine.IB,
    ourRole: CaseRole.DEFENDANT,
    cause: '行政处罚听证',
    riskLevel: RiskLevel.CRITICAL,
    plaintiff: '中国证监会',
    defendant: '我司',
    court: '中国证监会处罚委',
    filingDate: '2024-03-15',
    createdAt: '2024-03-15',
    nextDeadline: '2026-05-01',
    tags: ['行政处罚', '听证', '前置程序'],
    caseType: CaseType.STANDARD,
    relatedCases: [
        { targetCaseId: 'CASE-EPIC-001', relationType: 'BLOCKS', description: '行政认定是民事索赔的前置条件' }
    ],
    linkedIssues: [
        { targetId: 'CASE-EPIC-001', targetKey: 'TD-XJCS-2025-005', type: 'BLOCKS' }
    ],
    regulatoryAttrs: {
        regCaseCode: 'ADM-001',
        regCauseName: '行政处罚',
        sector: '主板',
        isInvestorProtection: false,
        isMajor: true,
        amountNoInterest: 0,
        amountWithInterest: 0
    }
  }),

  // --- 3. Child Cases ---
  withDefaultMembers({
    id: 'CASE-SUB-001',
    key: 'ZD-XJCS-2025-007',
    code: 'ZD-XJCS-2025-007',
    issueType: IssueType.CASE,
    title: '张三 诉 TechNova 索赔案 (示范)',
    stage: CaseStage.SECOND_INSTANCE,
    status: CaseStage.SECOND_INSTANCE,
    procedureType: 'CIVIL_LITIGATION',
    businessLine: BusinessLine.IB,
    ourRole: CaseRole.DEFENDANT,
    cause: '证券虚假陈述责任纠纷',
    riskLevel: RiskLevel.HIGH,
    plaintiff: '张三',
    defendant: 'TechNova, 我司',
    court: '北京高等人民法院',
    filingDate: '2025-06-01',
    createdAt: '2025-06-01',
    caseType: CaseType.SERIES_CHILD,
    parentId: 'CASE-EPIC-001',
    isPilot: true, 
    description: '示范案件，一审判决赔偿50%，双方均上诉。',
    regulatoryAttrs: { 
        amountNoInterest: 500000, 
        amountWithInterest: 520000, 
        regCaseCode: 'S01',
        regCauseName: '证券虚假陈述',
        sector: '科创板',
        isInvestorProtection: true,
        isMajor: false
    }
  }),
  withDefaultMembers({
    id: 'CASE-SUB-002',
    key: 'GZ-XJCS-2025-008',
    code: 'GZ-XJCS-2025-008',
    issueType: IssueType.CASE,
    title: '李四 诉 TechNova 索赔案',
    stage: CaseStage.FIRST_INSTANCE,
    status: CaseStage.FIRST_INSTANCE,
    procedureType: 'CIVIL_LITIGATION',
    businessLine: BusinessLine.IB,
    ourRole: CaseRole.DEFENDANT,
    cause: '证券虚假陈述责任纠纷',
    riskLevel: RiskLevel.MEDIUM,
    plaintiff: '李四',
    defendant: 'TechNova, 我司',
    court: '北京金融法院',
    filingDate: '2025-07-15',
    createdAt: '2025-07-15',
    caseType: CaseType.SERIES_CHILD,
    parentId: 'CASE-EPIC-001',
    description: '平行案件，等待示范判决结果。',
    regulatoryAttrs: { 
        amountNoInterest: 300000, 
        amountWithInterest: 310000, 
        regCaseCode: 'S01',
        regCauseName: '证券虚假陈述',
        sector: '科创板',
        isInvestorProtection: true,
        isMajor: false
    }
  }),
  withDefaultMembers({
    id: 'CASE-SUB-003',
    key: 'GZ-XJCS-2025-009',
    code: 'GZ-XJCS-2025-009',
    issueType: IssueType.CASE,
    title: '王五 诉 TechNova 索赔案',
    stage: CaseStage.FIRST_INSTANCE,
    status: CaseStage.FIRST_INSTANCE,
    procedureType: 'CIVIL_LITIGATION',
    businessLine: BusinessLine.IB,
    ourRole: CaseRole.DEFENDANT,
    cause: '证券虚假陈述责任纠纷',
    riskLevel: RiskLevel.MEDIUM,
    plaintiff: '王五',
    defendant: 'TechNova, 我司',
    court: '北京金融法院',
    filingDate: '2025-08-20',
    createdAt: '2025-08-20',
    caseType: CaseType.SERIES_CHILD,
    parentId: 'CASE-EPIC-001',
    description: '平行案件，等待示范判决结果。',
    regulatoryAttrs: { 
        amountNoInterest: 800000, 
        amountWithInterest: 820000, 
        regCaseCode: 'S01',
        regCauseName: '证券虚假陈述',
        sector: '科创板',
        isInvestorProtection: true,
        isMajor: false
    }
  }),
  withDefaultMembers({
    id: 'CASE-SUB-004',
    key: 'YB-XJCS-2025-010',
    code: 'YB-XJCS-2025-010',
    issueType: IssueType.CASE,
    title: '赵六 诉 TechNova 索赔案 (已调解)',
    stage: CaseStage.CLOSED,
    status: CaseStage.CLOSED,
    procedureType: 'CIVIL_LITIGATION',
    businessLine: BusinessLine.IB,
    ourRole: CaseRole.DEFENDANT,
    cause: '证券虚假陈述责任纠纷',
    riskLevel: RiskLevel.LOW,
    plaintiff: '赵六',
    defendant: 'TechNova, 我司',
    court: '北京金融法院',
    filingDate: '2025-06-10',
    createdAt: '2025-06-10',
    caseType: CaseType.SERIES_CHILD,
    parentId: 'CASE-EPIC-001',
    description: '金额较小，已快速调解结案。',
    regulatoryAttrs: { 
        amountNoInterest: 50000, 
        amountWithInterest: 50000, 
        regCaseCode: 'S01',
        regCauseName: '证券虚假陈述',
        sector: '科创板',
        isInvestorProtection: true,
        isMajor: false
    }
  }),

  // --- 4. Complex Procedure Case ---
  withDefaultMembers({
    id: 'c-complex-001',
    key: 'TD-NMJY-2024-011',
    code: 'TD-NMJY-2024-011',
    issueType: IssueType.CASE,
    title: '光大乌龙指衍生内幕交易纠纷案 (重审)',
    description: '原告主张我司在乌龙指事件中利用内幕信息进行对冲交易，导致其损失。本案历经一审败诉、二审发回重审，目前处于重一审阶段。',
    summaryDetail: {
        background: '2013年8月16日，光大证券发生“乌龙指”事件。原告杨某某主张其在当日下午的交易中因我司的内幕交易行为（对冲操作）遭受损失。本案历经多年诉讼，最高院裁定发回重审。',
        disputeFocus: '1. 我司当日下午的对冲交易是否构成内幕交易；\n2. 原告的损失计算是否符合法律规定；\n3. 内幕交易与投资者损失之间的因果关系认定。',
        amountText: '原告索赔 1,500 万元，连同利息共计约 1,800 万元。',
        riskAssessment: '本案涉及内幕交易认定标准，法律适用复杂。若重审败诉，可能引发新一轮类似案件的索赔潮，且对公司合规形象造成持续负面影响。'
    },
    stage: CaseStage.FIRST_INSTANCE, // Retrial is technically 1st instance procedure
    status: CaseStage.FIRST_INSTANCE,
    procedureType: 'CIVIL_LITIGATION',
    businessLine: BusinessLine.PROPRIETARY,
    ourRole: CaseRole.DEFENDANT,
    cause: '证券内幕交易责任纠纷',
    riskLevel: RiskLevel.CRITICAL,
    plaintiff: '杨某某',
    defendant: '我司',
    court: '上海市高级人民法院',
    filingDate: '2024-02-15',
    createdAt: '2024-02-15',
    nextDeadline: '2026-05-20',
    caseType: CaseType.STANDARD,
    tags: ['发回重审', '内幕交易', '重大影响'],
    regulatoryAttrs: {
        regCaseCode: 'S02',
        regCauseName: '内幕交易',
        sector: '主板',
        isInvestorProtection: true,
        isMajor: true,
        amountNoInterest: 15000000,
        amountWithInterest: 18000000
    },
    linkedIssues: []
  }),
  // --- Other Cases ---
  withDefaultMembers({
    id: 'c-003',
    key: 'YB-LDZY-2026-012',
    code: 'YB-LDZY-2026-012',
    issueType: IssueType.CASE,
    title: '前高管竞业限制劳动仲裁',
    description: '前投行MD John Doe 离职后入职竞争对手，违反竞业限制协议。公司提起劳动仲裁，要求返还竞业限制补偿金并支付违约金。',
    stage: CaseStage.ENFORCEMENT,
    status: CaseStage.ENFORCEMENT,
    procedureType: 'LABOR',
    businessLine: BusinessLine.SUPPORT,
    ourRole: CaseRole.PLAINTIFF,
    cause: '劳动争议',
    riskLevel: RiskLevel.LOW,
    plaintiff: 'John Doe',
    defendant: '我司',
    court: '深圳福田区劳动仲裁委',
    filingDate: '2023-12-10',
    createdAt: '2023-12-10',
    nextDeadline: undefined,
    lawyerId: 'v-003',
    caseType: CaseType.STANDARD,
    regulatoryAttrs: {
        regCaseCode: 'LD-001',
        regCauseName: '劳动争议',
        sector: '主板',
        isInvestorProtection: false,
        isMajor: false,
        amountNoInterest: 2000000,
        amountWithInterest: 2000000
    }
  }),
  withDefaultMembers({
    id: 'c-004',
    key: 'TD-GPZY-2026-013',
    code: 'TD-GPZY-2026-013',
    issueType: IssueType.CASE,
    title: '实控人股票质押式回购违约案',
    description: '融资人张某某以其持有的上市公司“深南实业”股票作为质押，向我司融入资金4.5亿元。因股价连续跌停触发平仓线，且张某某未履行追加担保义务，构成违约。我司提起诉讼并申请财产保全。',
    stage: CaseStage.FIRST_INSTANCE,
    status: CaseStage.FIRST_INSTANCE,
    procedureType: 'CIVIL_LITIGATION',
    businessLine: BusinessLine.CREDIT,
    ourRole: CaseRole.PLAINTIFF,
    cause: '股票质押式回购纠纷',
    riskLevel: RiskLevel.CRITICAL,
    plaintiff: '我司',
    defendant: '张某某 (上市公司实控人)',
    court: '深圳市中级人民法院',
    filingDate: '2026-01-05',
    createdAt: '2026-01-05',
    nextDeadline: '2026-03-22',
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
        amountWithInterest: 480000000,
        estimatedRiskCapitalDeduction: 450000000
    }
  }),
  withDefaultMembers({
    id: 'c-005',
    key: 'ZD-ZGHT-2025-014',
    code: 'ZD-ZGHT-2025-014',
    issueType: IssueType.CASE,
    title: '金信信托通道业务差额补足纠纷',
    description: '我司资管子公司作为通道方设立资管计划。委托人（某农商行）要求我司履行差额补足义务。',
    stage: CaseStage.SECOND_INSTANCE,
    status: CaseStage.SECOND_INSTANCE,
    procedureType: 'CIVIL_LITIGATION',
    businessLine: BusinessLine.ASSET_MGMT,
    ourRole: CaseRole.DEFENDANT,
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
    regulatoryAttrs: { 
        regCaseCode: 'AM-001',
        regCauseName: '资管纠纷',
        amountNoInterest: 68000000,
        amountWithInterest: 70000000,
        sector: '主板',
        isInvestorProtection: false,
        isMajor: true
    }
  }),
  withDefaultMembers({
    id: 'c-012',
    key: 'TD-XJCS-2023-015',
    code: 'TD-XJCS-2023-015',
    issueType: IssueType.CASE,
    title: '2023年度虚假陈述系列案(已结)',
    description: '历史遗留的虚假陈述案件，已通过和解方式全部结案。',
    stage: CaseStage.CLOSED,
    status: CaseStage.CLOSED,
    procedureType: 'CIVIL_LITIGATION',
    businessLine: BusinessLine.IB,
    ourRole: CaseRole.DEFENDANT,
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
    regulatoryAttrs: { 
        amountNoInterest: 25000000,
        amountWithInterest: 25000000,
        regCaseCode: 'S01',
        regCauseName: '证券虚假陈述',
        sector: '主板',
        isInvestorProtection: true,
        isMajor: true
    }
  }),
  withDefaultMembers({
    id: 'c-arb-01',
    key: 'ZD-ZGHT-2026-016',
    code: 'ZD-ZGHT-2026-016',
    issueType: IssueType.CASE,
    title: 'XX 银行诉我司资管计划合同违约仲裁案',
    description: '申请人（XX银行）主张我司管理的定向资管计划违规投资非标资产，要求赔偿本金及收益损失。本案由深圳国际仲裁院受理。',
    stage: CaseStage.ARBITRATION, 
    status: CaseStage.ARBITRATION,
    procedureType: 'ARBITRATION',
    businessLine: BusinessLine.ASSET_MGMT,
    ourRole: CaseRole.DEFENDANT,
    cause: '资产管理合同纠纷',
    riskLevel: RiskLevel.HIGH,
    plaintiff: 'XX 银行',
    defendant: '我司',
    court: '深圳国际仲裁院 (SCIA)',
    filingDate: '2026-02-10',
    createdAt: '2026-02-10',
    nextDeadline: '2026-04-05',
    caseType: CaseType.STANDARD,
    tags: ['商事仲裁', '一裁终局'],
    regulatoryAttrs: {
        regCaseCode: 'JJ-009',
        regCauseName: '基金合同纠纷',
        amountNoInterest: 50000000,
        amountWithInterest: 52000000,
        sector: '主板',
        isInvestorProtection: false,
        isMajor: true
    }
  }),
  // --- New Cases for Business Analysis (Credit Business) ---
  withDefaultMembers({
    id: 'c-credit-004',
    key: 'ZD-GPZY-2026-017',
    code: 'ZD-GPZY-2026-017',
    issueType: IssueType.CASE,
    title: '某上市公司大股东股票质押违约追偿案',
    description: '融资人以其持有的上市公司股票作为质押，向我司融入资金8亿元。因股价下跌触及平仓线且未履行补仓义务，构成违约。我司提起诉讼要求偿还本金及利息、违约金。',
    stage: CaseStage.FIRST_INSTANCE,
    status: CaseStage.FIRST_INSTANCE,
    procedureType: 'CIVIL_LITIGATION',
    businessLine: BusinessLine.CREDIT,
    ourRole: CaseRole.PLAINTIFF,
    cause: '股票质押式回购纠纷',
    riskLevel: RiskLevel.HIGH,
    plaintiff: '我司',
    defendant: '某控股集团有限公司',
    court: '广东省高级人民法院',
    filingDate: '2026-01-15',
    createdAt: '2026-01-15',
    nextDeadline: '2026-04-20',
    caseType: CaseType.STANDARD,
    tags: ['股票质押', '大额追偿'],
    regulatoryAttrs: {
        regCaseCode: 'M04',
        regCauseName: '股票质押回购',
        amountNoInterest: 800000000,
        amountWithInterest: 850000000,
        sector: '主板',
        isInvestorProtection: false,
        isMajor: true,
        estimatedRiskCapitalDeduction: 400000000
    },
    linkedIssues: []
  }),
  withDefaultMembers({
    id: 'c-credit-005',
    key: 'YB-RZRQ-2026-018',
    code: 'YB-RZRQ-2026-018',
    issueType: IssueType.CASE,
    title: '赵六 融资融券强平纠纷 (被诉)',
    description: '客户赵六主张我司在强制平仓过程中操作不当，未在最优价格平仓，导致其损失扩大，要求赔偿差价损失50万元。',
    stage: CaseStage.FILING,
    status: CaseStage.FILING,
    procedureType: 'CIVIL_LITIGATION',
    businessLine: BusinessLine.CREDIT,
    ourRole: CaseRole.DEFENDANT,
    cause: '融资融券交易纠纷',
    riskLevel: RiskLevel.LOW,
    plaintiff: '赵六',
    defendant: '我司',
    court: '深圳市福田区人民法院',
    filingDate: '2026-03-10',
    createdAt: '2026-03-10',
    nextDeadline: '2026-04-01',
    caseType: CaseType.STANDARD,
    tags: ['融资融券', '客户投诉'],
    regulatoryAttrs: {
        regCaseCode: 'R07',
        regCauseName: '融资融券纠纷',
        amountNoInterest: 500000,
        amountWithInterest: 500000,
        sector: '主板',
        isInvestorProtection: false,
        isMajor: false
    },
    linkedIssues: []
  }),
  withDefaultMembers({
    id: 'c-credit-006',
    key: 'YB-RZRQ-2025-019',
    code: 'YB-RZRQ-2025-019',
    issueType: IssueType.CASE,
    title: '钱七 融资融券违约追偿案',
    description: '客户钱七信用账户穿仓，欠款120万元。经多次催收无效，提起诉讼。',
    stage: CaseStage.ENFORCEMENT,
    status: CaseStage.ENFORCEMENT,
    procedureType: 'CIVIL_LITIGATION',
    businessLine: BusinessLine.CREDIT,
    ourRole: CaseRole.PLAINTIFF,
    cause: '融资融券交易纠纷',
    riskLevel: RiskLevel.LOW,
    plaintiff: '我司',
    defendant: '钱七',
    court: '深圳市福田区人民法院',
    filingDate: '2025-10-20',
    createdAt: '2025-10-20',
    nextDeadline: undefined,
    caseType: CaseType.STANDARD,
    tags: ['融资融券', '执行'],
    regulatoryAttrs: {
        regCaseCode: 'R08',
        regCauseName: '融资融券纠纷',
        amountNoInterest: 1200000,
        amountWithInterest: 1250000,
        sector: '主板',
        isInvestorProtection: false,
        isMajor: false
    },
    linkedIssues: [],
    stageDetails: {
        execution: {
            execCaseNo: '(2026)深0304执567号',
            court: '深圳市福田区人民法院',
            applicationDate: '2026-02-15',
            basisType: ExecutionBasisType.JUDGMENT,
            basisDocumentNo: '(2025)粤0304民初1234号',
            targetAmount: 1250000,
            recoveredAmount: 500000,
            measures: [
                {
                    id: 'm-001',
                    type: ExecutionMeasureType.FREEZE,
                    target: '银行存款 (招商银行)',
                    startDate: '2026-02-20',
                    endDate: '2027-02-20',
                    status: '成功',
                    operator: '王律师',
                    amount: 200000
                },
                {
                    id: 'm-002',
                    type: ExecutionMeasureType.SEIZURE,
                    target: '房产 (深圳市南山区xx小区)',
                    startDate: '2026-02-25',
                    endDate: '2029-02-25',
                    status: '成功',
                    operator: '王律师'
                }
            ],
            derivativeProceedings: []
        }
    }
  }),

  withDefaultMembers({
    id: 'c-credit-002',
    key: 'GZ-RZRQ-2026-020',
    code: 'GZ-RZRQ-2026-020',
    issueType: IssueType.CASE,
    title: '李四 融资融券交易纠纷',
    description: '客户李四信用账户维持担保比例低于130%，且未在规定时间内追加担保物，我司依约进行强制平仓。客户主张平仓时机不当造成损失，提起诉讼。',
    stage: CaseStage.FIRST_INSTANCE,
    status: CaseStage.FIRST_INSTANCE,
    procedureType: 'CIVIL_LITIGATION',
    businessLine: BusinessLine.CREDIT,
    ourRole: CaseRole.DEFENDANT,
    cause: '融资融券交易纠纷',
    riskLevel: RiskLevel.MEDIUM,
    plaintiff: '李四',
    defendant: '我司',
    court: '深圳市福田区人民法院',
    filingDate: '2026-02-20',
    createdAt: '2026-02-20',
    nextDeadline: '2026-04-15',
    caseType: CaseType.STANDARD,
    tags: ['融资融券', '强制平仓'],
    regulatoryAttrs: {
        regCaseCode: 'R05',
        regCauseName: '融资融券纠纷',
        amountNoInterest: 1500000,
        amountWithInterest: 1500000,
        sector: '主板',
        isInvestorProtection: false,
        isMajor: false
    },
    linkedIssues: []
  }),
  withDefaultMembers({
    id: 'c-credit-003',
    key: 'ZD-RZRQ-2026-018',
    code: 'ZD-RZRQ-2026-018',
    issueType: IssueType.CASE,
    title: '王五 融资融券强平后追偿案',
    description: '客户王五信用账户穿仓，倒欠公司本金及利息共计 320 万元。公司提起诉讼追偿。',
    stage: CaseStage.FILING,
    status: CaseStage.FILING,
    procedureType: 'CIVIL_LITIGATION',
    businessLine: BusinessLine.CREDIT,
    ourRole: CaseRole.PLAINTIFF,
    cause: '融资融券交易纠纷',
    riskLevel: RiskLevel.LOW,
    plaintiff: '我司',
    defendant: '王五',
    court: '深圳市福田区人民法院',
    filingDate: '2026-03-01',
    createdAt: '2026-03-01',
    nextDeadline: '2026-03-20',
    caseType: CaseType.STANDARD,
    tags: ['融资融券', '追偿'],
    regulatoryAttrs: {
        regCaseCode: 'R06',
        regCauseName: '融资融券纠纷',
        amountNoInterest: 3200000,
        amountWithInterest: 3250000,
        sector: '主板',
        isInvestorProtection: false,
        isMajor: false
    },
    linkedIssues: []
  })
];

// Helper to update store synchronously (for other services)
export const updateCaseStoreInternal = (caseId: string, updates: Partial<Case>) => {
    developmentBoundary('cases.updateCaseStoreInternal', true);
    const idx = MOCK_CASES_STORE.findIndex(c => c.id === caseId);
    if (idx !== -1) {
        const oldCase = MOCK_CASES_STORE[idx];
        MOCK_CASES_STORE[idx] = { ...oldCase, ...updates };
        
        if (oldCase.parentId) {
            triggerSeriesAggregation(oldCase.parentId);
        }
    }
};

const triggerSeriesAggregation = (masterId: string) => {
    const children = MOCK_CASES_STORE.filter(c => c.parentId === masterId);
    const masterIndex = MOCK_CASES_STORE.findIndex(c => c.id === masterId);
    
    if (masterIndex === -1) return;

    const totalAmountNoInterest = children.reduce((sum, c) => sum + (c.regulatoryAttrs?.amountNoInterest || 0), 0);
    const totalAmountWithInterest = children.reduce((sum, c) => sum + (c.regulatoryAttrs?.amountWithInterest || 0), 0);

    const masterCase = MOCK_CASES_STORE[masterIndex];
    
    MOCK_CASES_STORE[masterIndex] = {
        ...masterCase,
        regulatoryAttrs: {
            ...masterCase.regulatoryAttrs!,
            amountNoInterest: totalAmountNoInterest,
            amountWithInterest: totalAmountWithInterest
        }
    };
    
    console.log(`[Aggregation Engine] Updated Master Case ${masterId}: New Total Amount = ${totalAmountNoInterest}`);
};

const checkRisk = (caseData: Case) => {
    const task = scanCaseForRisks(caseData);
    if (task) {
        addDisclosureTask(task);
    }
};

export const getCases = async (): Promise<Case[]> => {
    developmentBoundary('cases.getCases', false);
  return new Promise((resolve) => {
    triggerSeriesAggregation('CASE-EPIC-001');
    setTimeout(() => {
      resolve([...MOCK_CASES_STORE]);
    }, 600); 
  });
};

export const getCaseById = async (id: string): Promise<Case | undefined> => {
    developmentBoundary('cases.getCaseById', false);
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve(MOCK_CASES_STORE.find(c => c.id === id));
        }, 300);
    });
};

export const addCase = async (newCase: Omit<Case, 'id' | 'key' | 'issueType' | 'status' | 'createdAt'>): Promise<Case> => {
    developmentBoundary('cases.addCase', true);
    return new Promise(resolve => {
        const created: Case = {
            ...newCase,
            id: `c-${Date.now()}`,
            key: newCase.code, 
            issueType: IssueType.CASE, 
            status: newCase.stage,
            createdAt: new Date().toISOString().split('T')[0],
            linkedIssues: [],
            // Default Creator becomes OWNER
            authorizedMembers: [
                { userId: 'legal-1', userName: '陈法务', role: 'OWNER', joinedAt: new Date().toISOString().split('T')[0] }
            ]
        };
        MOCK_CASES_STORE = [created, ...MOCK_CASES_STORE];
        
        if (created.parentId) {
            triggerSeriesAggregation(created.parentId);
        }

        logHistoryInternal({
            caseId: created.id,
            operator: '当前用户',
            action: '创建案件',
            details: '案件初始化建立'
        });

        checkRisk(created);

        setTimeout(() => resolve(created), 500);
    });
};

export const updateCaseGeneralInfo = async (caseId: string, updates: Partial<Case>): Promise<Case> => {
    developmentBoundary('cases.updateCaseGeneralInfo', true);
    return new Promise(resolve => {
        setTimeout(() => {
            const idx = MOCK_CASES_STORE.findIndex(c => c.id === caseId);
            if (idx !== -1) {
                const oldCase = MOCK_CASES_STORE[idx];
                const updatedCase = { ...oldCase, ...updates };
                
                if (updates.stage) {
                    updatedCase.status = updates.stage;
                }

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
                
                if (updatedCase.parentId) {
                    triggerSeriesAggregation(updatedCase.parentId);
                }

                checkRisk(updatedCase);

                resolve(updatedCase);
            }
        }, 400);
    });
};

export const updateCase = updateCaseGeneralInfo;

export const addCaseLink = async (caseId: string, link: IssueLink): Promise<Case> => {
    developmentBoundary('cases.addCaseLink', true);
    return new Promise(resolve => {
        setTimeout(() => {
            const idx = MOCK_CASES_STORE.findIndex(c => c.id === caseId);
            if (idx !== -1) {
                const currentCase = MOCK_CASES_STORE[idx];
                const newLinks = [...(currentCase.linkedIssues || []), link];
                
                MOCK_CASES_STORE[idx] = { ...currentCase, linkedIssues: newLinks };
                
                logHistoryInternal({
                    caseId: caseId,
                    operator: '当前用户',
                    action: '关联事项',
                    details: `添加关联: [${link.type}] ${link.targetKey}`
                });
                
                resolve(MOCK_CASES_STORE[idx]);
            }
        }, 300);
    });
};

export const updateCaseStage = async (caseId: string, newStage: CaseStage): Promise<Case> => {
    developmentBoundary('cases.updateCaseStage', true);
    return updateCaseGeneralInfo(caseId, { stage: newStage });
};

export const batchUpdateCaseStage = async (caseIds: string[], newStage: CaseStage): Promise<void> => {
    developmentBoundary('cases.batchUpdateCaseStage', true);
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
    developmentBoundary('cases.updateRegulatoryAttributes', true);
    return new Promise(resolve => {
        setTimeout(() => {
            const index = MOCK_CASES_STORE.findIndex(c => c.id === caseId);
            if (index !== -1) {
                MOCK_CASES_STORE[index] = { ...MOCK_CASES_STORE[index], regulatoryAttrs: attrs };
                
                if (MOCK_CASES_STORE[index].parentId) {
                    triggerSeriesAggregation(MOCK_CASES_STORE[index].parentId);
                }

                checkRisk(MOCK_CASES_STORE[index]);

                resolve(MOCK_CASES_STORE[index]);
            }
        }, 400);
    });
};

export const updateCaseDeadline = async (id: string, deadline: string): Promise<void> => {
    developmentBoundary('cases.updateCaseDeadline', true);
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

export const addCaseMember = async (caseId: string, member: any): Promise<Case> => {
    developmentBoundary('cases.addCaseMember', true);
    return new Promise(resolve => {
        setTimeout(() => {
            const idx = MOCK_CASES_STORE.findIndex(c => c.id === caseId);
            if (idx !== -1) {
                const currentCase = MOCK_CASES_STORE[idx];
                // Check if already exists
                if (!currentCase.authorizedMembers?.find(m => m.userId === member.userId)) {
                    MOCK_CASES_STORE[idx] = {
                        ...currentCase,
                        authorizedMembers: [...(currentCase.authorizedMembers || []), member]
                    };
                }
                resolve(MOCK_CASES_STORE[idx]);
            }
        }, 300);
    });
};

export const removeCaseMember = async (caseId: string, userId: string): Promise<Case> => {
    developmentBoundary('cases.removeCaseMember', true);
    return new Promise(resolve => {
        setTimeout(() => {
            const idx = MOCK_CASES_STORE.findIndex(c => c.id === caseId);
            if (idx !== -1) {
                const currentCase = MOCK_CASES_STORE[idx];
                MOCK_CASES_STORE[idx] = {
                    ...currentCase,
                    authorizedMembers: (currentCase.authorizedMembers || []).filter(m => m.userId !== userId)
                };
                resolve(MOCK_CASES_STORE[idx]);
            }
        }, 300);
    });
};

export { getCaseHistory, getCaseComments, addCaseComment } from './caseActivity';