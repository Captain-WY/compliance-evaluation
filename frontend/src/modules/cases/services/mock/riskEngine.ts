import {developmentBoundary} from '../../../../platform/developmentBoundary';

/**
 * [退役边界说明 — 4.S6 主切片]
 *
 * 可退役 (仅 RiskRulesPanel 使用, 4.S6 主切片替换为真实 BFF):
 *   - getRiskRules
 *   - updateRiskRule
 *   - addRiskRule
 *
 * 不可退役 (其他消费者, 请勿删除):
 *   - MOCK_NET_ASSETS     → aiDrafting.ts 使用
 *   - scanCaseForRisks    → mock/cases.ts 使用
 *   - addDisclosureTask   → mock/cases.ts 使用
 */
import { Case, DisclosureTask, RiskLevel, RiskRule, DisclosureType } from '../../types';

// Mock Net Asset Value (50 Billion CNY)
export const MOCK_NET_ASSETS = 5000000000;

// Enhanced Dynamic Rules Store
let MOCK_RULES: RiskRule[] = [
    // 1. Single Case Rules (Realtime)
    {
        id: 'rule-001',
        name: '特大金额披露阈值 (单案)',
        category: 'SINGLE_CASE',
        conditionType: 'AMOUNT_GREATER',
        params: { value: 100000000 }, // 1亿
        targetRiskLevel: RiskLevel.CRITICAL,
        triggerType: '临时公告',
        scanFrequency: 'REALTIME',
        isActive: true
    },
    {
        id: 'rule-002',
        name: '重大金额披露阈值 (单案)',
        category: 'SINGLE_CASE',
        conditionType: 'AMOUNT_GREATER',
        params: { value: 10000000 }, // 1000万
        targetRiskLevel: RiskLevel.HIGH,
        triggerType: '重大事项专报',
        scanFrequency: 'REALTIME',
        isActive: true
    },
    {
        id: 'rule-003',
        name: '敏感案由关键词监测',
        category: 'SINGLE_CASE',
        conditionType: 'KEYWORD_MATCH',
        params: { keywords: ['刑事', '证券虚假陈述', '操纵证券市场', '内幕交易', '退市'] },
        targetRiskLevel: RiskLevel.HIGH,
        triggerType: '重大事项专报',
        scanFrequency: 'REALTIME',
        isActive: true
    },
    // New Rule: Net Asset Ratio
    {
        id: 'rule-004',
        name: '重大资产影响预警 (>10%净资产)',
        category: 'SINGLE_CASE',
        conditionType: 'RATIO_GREATER',
        params: { value: 0.1, baseIndicator: 'NET_ASSETS' }, // 10%
        targetRiskLevel: RiskLevel.CRITICAL,
        triggerType: '临时公告',
        scanFrequency: 'REALTIME',
        isActive: true
    },
    // 2. Cumulative Rules (Periodic)
    {
        id: 'rule-cumulative-01',
        name: '累计诉讼金额预警 (12个月)',
        category: 'CUMULATIVE',
        conditionType: 'AMOUNT_GREATER',
        params: { value: 50000000, periodMonths: 12 }, // 12个月累计5000万
        targetRiskLevel: RiskLevel.HIGH,
        triggerType: '累计披露预警',
        scanFrequency: 'DAILY',
        isActive: true
    }
];

let MOCK_TASKS: DisclosureTask[] = [];
let isInitialized = false;

// Generate simulated tasks (Self-contained to avoid circular deps)
const initializeMockTasks = async () => {
    if (isInitialized) return;
    
    // Seed some initial tasks manually instead of pulling from cases to avoid circular dep
    MOCK_TASKS.push({
        id: 'task-001',
        caseId: 'c-004',
        caseCode: 'TD-GPYW-2026-012',
        caseTitle: '实控人股票质押式回购违约案',
        triggerType: '临时公告',
        triggerReason: '触发生效规则：特大金额披露阈值 (涉案 4.5亿 > 1亿)',
        detectedAt: '2026-03-20',
        deadline: '2026-03-22', 
        status: 'PENDING',
        riskLevel: RiskLevel.CRITICAL,
        relatedRuleId: 'rule-001'
    });

    MOCK_TASKS.push({
        id: 'task-demo-01',
        caseTitle: '某资管计划底层资产违约案',
        caseCode: 'ZD-ZG-2026-005',
        triggerType: '重大事项专报',
        triggerReason: '涉案金额 6800万 > 1000万 阈值',
        detectedAt: '2026-03-21',
        deadline: '2026-03-23',
        status: 'PENDING',
        riskLevel: RiskLevel.HIGH,
        relatedRuleId: 'rule-002'
    });
        
    MOCK_TASKS.push({
        id: 'task-demo-02',
        caseTitle: 'XX营业部代客理财群体性投诉',
        caseCode: 'PT-JJ-2026-042',
        triggerType: '临时公告',
        triggerReason: '涉及人数 > 50人，且金额 > 1000万，触发舆情风险规则',
        detectedAt: '2026-03-22',
        deadline: '2026-03-24',
        status: 'PROCESSING', 
        riskLevel: RiskLevel.CRITICAL,
        relatedRuleId: 'rule-003'
    });

    isInitialized = true;
};

// Public API
export const getDisclosureTasks = async (): Promise<DisclosureTask[]> => {
    developmentBoundary('riskEngine.getDisclosureTasks', false);
    await initializeMockTasks();
    return new Promise(resolve => {
        setTimeout(() => resolve([...MOCK_TASKS]), 400);
    });
};

export const getDisclosureTasksByCaseId = async (caseId: string): Promise<DisclosureTask[]> => {
    developmentBoundary('riskEngine.getDisclosureTasksByCaseId', false);
    await initializeMockTasks();
    return new Promise(resolve => {
        setTimeout(() => resolve(MOCK_TASKS.filter(t => t.caseId === caseId)), 200);
    });
};

export const updateTaskStatus = async (taskId: string, status: DisclosureTask['status']): Promise<void> => {
    developmentBoundary('riskEngine.updateTaskStatus', true);
    return new Promise(resolve => {
        setTimeout(() => {
            MOCK_TASKS = MOCK_TASKS.map(t => t.id === taskId ? { ...t, status } : t);
            resolve();
        }, 300);
    });
};

// --- Rule Management API ---

export const getRiskRules = async (): Promise<RiskRule[]> => {
    developmentBoundary('riskEngine.getRiskRules', false);
    return new Promise(resolve => setTimeout(() => resolve([...MOCK_RULES]), 300));
};

export const updateRiskRule = async (ruleId: string, updates: Partial<RiskRule>): Promise<void> => {
    developmentBoundary('riskEngine.updateRiskRule', true);
    return new Promise(resolve => {
        setTimeout(() => {
            MOCK_RULES = MOCK_RULES.map(r => r.id === ruleId ? { ...r, ...updates } : r);
            resolve();
        }, 300);
    });
};

export const addRiskRule = async (rule: Omit<RiskRule, 'id' | 'isActive'>): Promise<RiskRule> => {
    developmentBoundary('riskEngine.addRiskRule', true);
    return new Promise(resolve => {
        setTimeout(() => {
            const newRule: RiskRule = {
                ...rule,
                id: `rule-${Date.now()}`,
                isActive: true
            };
            MOCK_RULES = [newRule, ...MOCK_RULES];
            resolve(newRule);
        }, 400);
    });
};

// --- Automation Triggers (No Circular Dependency) ---

// 1. Scan Logic
export const scanCaseForRisks = (caseData: Case): DisclosureTask | null => {
    developmentBoundary('riskEngine.scanCaseForRisks', true);
    const amount = caseData.regulatoryAttrs?.amountNoInterest || 0;
    const cause = caseData.cause || '';

    // Iterate through active SINGLE_CASE rules
    for (const rule of MOCK_RULES) {
        if (!rule.isActive || rule.category !== 'SINGLE_CASE') continue;

        let triggered = false;
        let reason = '';

        if (rule.conditionType === 'AMOUNT_GREATER' && rule.params.value) {
            if (amount > rule.params.value) {
                triggered = true;
                reason = `金额 ${(amount/10000).toFixed(0)}万 超过阈值规则 [${rule.name}]`;
            }
        } else if (rule.conditionType === 'KEYWORD_MATCH' && rule.params.keywords) {
            const hit = rule.params.keywords.find(kw => cause.includes(kw));
            if (hit) {
                triggered = true;
                reason = `案由命中敏感词 "${hit}"，触发规则 [${rule.name}]`;
            }
        } else if (rule.conditionType === 'RATIO_GREATER' && rule.params.baseIndicator === 'NET_ASSETS' && rule.params.value) {
            const ratio = amount / MOCK_NET_ASSETS;
            if (ratio > rule.params.value) {
                triggered = true;
                reason = `涉案金额占净资产 ${(ratio * 100).toFixed(2)}%，超过 ${(rule.params.value * 100)}% 披露阈值`;
            }
        }

        if (triggered) {
            return {
                id: `task-gen-${Date.now()}`,
                caseId: caseData.id,
                caseCode: caseData.code,
                caseTitle: caseData.title,
                triggerType: rule.triggerType,
                triggerReason: reason,
                detectedAt: new Date().toISOString().split('T')[0],
                deadline: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0], // Default T+2
                status: 'PENDING',
                riskLevel: rule.targetRiskLevel,
                relatedRuleId: rule.id
            };
        }
    }

    return null;
};

// 2. Add Task (Publicly accessible)
export const addDisclosureTask = (task: DisclosureTask) => {
    developmentBoundary('riskEngine.addDisclosureTask', true);
    // Deduplicate: check if same case has same rule pending
    const exists = MOCK_TASKS.some(t => 
        t.caseId === task.caseId && 
        t.relatedRuleId === task.relatedRuleId && 
        (t.status === 'PENDING' || t.status === 'PROCESSING')
    );
    
    if (!exists) {
        MOCK_TASKS.unshift(task);
        console.log(`[Risk Engine] Auto-generated disclosure task for Case ${task.caseCode}`);
    }
};
