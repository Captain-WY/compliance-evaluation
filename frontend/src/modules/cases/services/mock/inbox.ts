import {developmentBoundary} from '../../../../platform/developmentBoundary';

import { EmailLead, RiskLevel } from '../../types';

let MOCK_EMAILS: EmailLead[] = [
    {
        id: 'em-001',
        subject: '【电子送达】(2026)沪74民初288号 应诉通知书',
        sender: 'service@shjrfy.gov.cn (上海金融法院)',
        receivedAt: '2026-03-21 09:15',
        bodySnippet: '我院受理的原告张某诉被告我司证券虚假陈述责任纠纷一案...',
        fullBody: `
            被告：我司
            
            本院受理的原告张某诉被告你司证券虚假陈述责任纠纷一案，案号为(2026)沪74民初288号。
            现依法向你司送达起诉状副本、应诉通知书、举证通知书等法律文书。
            
            诉讼请求：
            1. 判令被告赔偿投资差额损失人民币 1,250,000 元；
            2. 判令被告承担本案诉讼费用。
            
            请在收到本通知书之日起十五日内提交答辩状。
        `,
        attachments: [
            { name: '起诉状.pdf', size: '2.4MB', type: 'application/pdf' },
            { name: '证据清单.pdf', size: '5.1MB', type: 'application/pdf' },
            { name: '应诉通知书.pdf', size: '0.5MB', type: 'application/pdf' }
        ],
        status: 'UNREAD',
        aiAnalysis: {
            confidence: 98,
            category: 'CASE_NEW',
            title: '张某诉我司证券虚假陈述案',
            cause: '证券虚假陈述责任纠纷',
            court: '上海金融法院',
            plaintiff: '张某',
            defendant: '我司',
            amount: 1250000,
            riskLevel: RiskLevel.MEDIUM,
            filingDate: '2026-03-21'
        }
    },
    {
        id: 'em-002',
        subject: '转发：关于XX项目客户投诉升级的预警',
        sender: 'liqiang@brokerage-dept.com (李强-经纪业务)',
        receivedAt: '2026-03-20 16:45',
        bodySnippet: '客户对上周的强平操作非常不满，声称我们要负责...',
        fullBody: `
            法务同事好，
            
            附件是客户王总发来的律师函。他对上周账户被强平一事非常有异议，认为我们通知不到位。
            目前涉及金额约 80 万。请法务部评估一下风险。
        `,
        attachments: [
            { name: '律师函_扫描件.jpg', size: '1.2MB', type: 'image/jpeg' }
        ],
        status: 'READ',
        aiAnalysis: {
            confidence: 75,
            category: 'RISK_CLUE',
            title: '经纪业务客户投诉纠纷',
            cause: '融资融券交易纠纷',
            court: '未立案',
            plaintiff: '王某',
            defendant: '我司',
            amount: 800000,
            riskLevel: RiskLevel.LOW
        }
    },
    {
        id: 'em-003',
        subject: '回复：[取证任务:et-001] 关于提供债券认购协议原件',
        sender: 'trader_zhang@prop-dept.com (张自营)',
        receivedAt: '2026-03-22 10:30',
        bodySnippet: '王法务，您要的认购协议和当时投决会的审批单都在附件里了，请查收...',
        fullBody: `
            王法务，
            
            您好！
            
            关于 "永绿集团债券违约纠纷案" 的取证需求已收到。
            附件包含了：
            1. 2023年签署的《认购协议》扫描件（有公章）。
            2. 当时的投决会审批记录。
            
            原件我已归档在部门档案柜A-03，如需出庭请提前联系我借阅。
            
            张自营
            自营投资部
        `,
        attachments: [
            { name: '20永绿01_认购协议.pdf', size: '3.5MB', type: 'application/pdf' },
            { name: '投决会决议_20230512.pdf', size: '1.2MB', type: 'application/pdf' }
        ],
        status: 'UNREAD',
        aiAnalysis: {
            confidence: 95,
            category: 'EVIDENCE_REPLY',
            relatedTaskId: 'et-001', // Links to MOCK_EVIDENCE_TASKS in collaboration.ts
            relatedCaseTitle: '永绿集团债券违约纠纷案'
        }
    }
];

export const getEmails = async (): Promise<EmailLead[]> => {
    developmentBoundary('inbox.getEmails', false);
    return new Promise(resolve => setTimeout(() => resolve([...MOCK_EMAILS]), 300));
};

export const updateEmailStatus = async (id: string, status: EmailLead['status']): Promise<void> => {
    developmentBoundary('inbox.updateEmailStatus', true);
    return new Promise(resolve => {
        MOCK_EMAILS = MOCK_EMAILS.map(e => e.id === id ? { ...e, status } : e);
        setTimeout(resolve, 200);
    });
};
