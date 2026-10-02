import {developmentBoundary} from '../../../../platform/developmentBoundary';

import { AssetClue, AssetType, AssetStatus } from '../../types';

let MOCK_ASSETS: AssetClue[] = [
  {
    id: 'ast-1',
    caseId: 'c-001',
    type: AssetType.REAL_ESTATE,
    description: '上海市浦东新区银城中路X号 办公楼 12层',
    valuation: 45000000,
    status: AssetStatus.CONTROLLED,
    controlMeasure: '查封',
    controlStartDate: '2025-12-01',
    controlEndDate: '2028-11-30', // 3 years for Real Estate
    ranking: '首封',
    preservationRulingNo: '(2025)沪74执保88号',
    executingCourt: '上海金融法院',
    logs: [
        { date: '2025-12-01', content: '收到法院查封裁定书，已送达房产交易中心', operator: '王法务' },
        { date: '2026-02-15', content: '前往现场查看，物业正常出租中', operator: '王法务' }
    ]
  },
  {
    id: 'ast-2',
    caseId: 'c-001',
    type: AssetType.BANK,
    description: '工商银行上海分行账户 (尾号 9527)',
    valuation: 1200000,
    status: AssetStatus.CONTROLLED,
    controlMeasure: '冻结',
    controlStartDate: '2025-04-10',
    controlEndDate: '2026-04-09', // Expiring soon! (Assuming current date is March 2026)
    ranking: '首封',
    preservationRulingNo: '(2025)沪74执保88号之一',
    executingCourt: '上海金融法院'
  },
  {
    id: 'ast-3',
    caseId: 'c-001',
    type: AssetType.EQUITY,
    description: '持有 "ST永绿" 500万股 (限售流通股)',
    valuation: 15000000,
    status: AssetStatus.PENDING,
    securityCode: '600XXX',
    executingCourt: '待申请'
  },
  {
    id: 'ast-4',
    caseId: 'c-003',
    type: AssetType.VEHICLE,
    description: '迈巴赫 S450 (沪A XXXXX)',
    valuation: 1200000,
    status: AssetStatus.DISPOSING,
    controlMeasure: '扣押',
    controlStartDate: '2024-01-10',
    controlEndDate: '2026-01-09',
    ranking: '轮候',
    firstSeizureCourt: '杭州市中级人民法院',
    firstSeizureCaseNo: '(2023)浙01执456号',
    executingCourt: '深圳福田区人民法院 (轮候)',
    logs: [
        { date: '2024-01-10', content: '车辆被交警扣押，我方申请轮候查封', operator: '张律师' },
        { date: '2025-11-20', content: '联系首封法院法官，告知正在进行评估', operator: '王法务' }
    ]
  }
];

export const getAssetsByCaseId = async (caseId: string): Promise<AssetClue[]> => {
    developmentBoundary('assets.getAssetsByCaseId', false);
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(MOCK_ASSETS.filter(a => a.caseId === caseId));
    }, 400);
  });
};

export const addAsset = async (asset: Omit<AssetClue, 'id'>): Promise<AssetClue> => {
    developmentBoundary('assets.addAsset', true);
    return new Promise((resolve) => {
        setTimeout(() => {
            const newAsset: AssetClue = {
                ...asset,
                id: `ast-${Date.now()}`,
                logs: []
            };
            MOCK_ASSETS = [newAsset, ...MOCK_ASSETS];
            resolve(newAsset);
        }, 400);
    });
};

export const updateAsset = async (id: string, updates: Partial<AssetClue>): Promise<void> => {
    developmentBoundary('assets.updateAsset', true);
    return new Promise((resolve) => {
        setTimeout(() => {
            MOCK_ASSETS = MOCK_ASSETS.map(a => a.id === id ? { ...a, ...updates } : a);
            resolve();
        }, 300);
    });
};

// Helper to simulate renewal logic
export const renewAssetControl = async (id: string, newEndDate: string): Promise<void> => {
    developmentBoundary('assets.renewAssetControl', true);
    return updateAsset(id, { controlEndDate: newEndDate });
};

export const addExecutionLog = async (assetId: string, content: string): Promise<void> => {
    developmentBoundary('assets.addExecutionLog', true);
    return new Promise((resolve) => {
        setTimeout(() => {
            MOCK_ASSETS = MOCK_ASSETS.map(a => {
                if (a.id === assetId) {
                    const newLog = {
                        date: new Date().toISOString().split('T')[0],
                        content,
                        operator: '当前用户'
                    };
                    return { ...a, logs: [newLog, ...(a.logs || [])] };
                }
                return a;
            });
            resolve();
        }, 300);
    });
};