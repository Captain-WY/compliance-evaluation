import {developmentBoundary} from '../../../../platform/developmentBoundary';

import { DisclosureRecord } from '../../types';

// Mock Disclosures Store
export let MOCK_DISCLOSURES: DisclosureRecord[] = [
    {
        id: 'dis-001',
        caseId: 'c-004',
        date: '2026-01-07',
        target: '深圳证券交易所',
        type: '临时公告',
        title: '关于收到法院应诉通知书的公告',
        contentSummary: '披露案号(2026)粤03民初12号，涉案金额4.5亿元，对期后利润可能产生影响。',
        status: '已披露',
        operator: '李合规'
    },
    {
        id: 'dis-003',
        caseId: 'CASE-EPIC-001', // Converted from c-002
        date: '2024-05-25',
        target: '上海证券交易所', // 科创板
        type: '临时公告',
        title: '关于涉及诉讼的公告',
        contentSummary: 'TechNova虚假陈述案立案公告。',
        status: '已披露',
        operator: '张合规'
    }
];

export const getDisclosuresByCaseId = async (caseId: string): Promise<DisclosureRecord[]> => {
    developmentBoundary('caseDisclosures.getDisclosuresByCaseId', false);
    return new Promise(resolve => {
        setTimeout(() => {
            resolve(MOCK_DISCLOSURES.filter(d => d.caseId === caseId).sort((a, b) => b.date.localeCompare(a.date)));
        }, 300);
    });
};

export const addDisclosure = async (disclosure: Omit<DisclosureRecord, 'id'>): Promise<DisclosureRecord> => {
    developmentBoundary('caseDisclosures.addDisclosure', true);
    return new Promise(resolve => {
        setTimeout(() => {
            const newRecord: DisclosureRecord = {
                ...disclosure,
                id: `dis-${Date.now()}`
            };
            MOCK_DISCLOSURES = [newRecord, ...MOCK_DISCLOSURES];
            resolve(newRecord);
        }, 400);
    });
};
