import {developmentBoundary} from '../../../../platform/developmentBoundary';

import { LegalContract, FeeModel } from '../../types';

// Mock Contracts
const MOCK_CONTRACTS: LegalContract[] = [
  {
    id: 'lc-001',
    caseId: 'c-001',
    vendorId: 'v-001', // KWM
    contractNo: 'HT-2025-LEGAL-088',
    title: '永绿集团债券违约案 专项法律服务合同',
    signDate: '2025-11-10',
    feeModel: FeeModel.HYBRID,
    fixedFee: 500000,
    deductFixedFromRisk: true,
    totalCap: 5000000, // 封顶 500万
    riskTiers: [
      { minAmount: 0, maxAmount: 10000000, rate: 0.05 }, // 1000万以下 5%
      { minAmount: 10000000, maxAmount: 50000000, rate: 0.03 }, // 1000-5000万 3%
      { minAmount: 50000000, maxAmount: null, rate: 0.01 }, // 5000万以上 1%
    ],
    status: 'ACTIVE'
  },
  {
    id: 'lc-002',
    caseId: 'c-002',
    vendorId: 'v-002', // ZhongLun
    contractNo: 'HT-2024-LEGAL-102',
    title: 'TechNova IPO 虚假陈述案 代理合同',
    signDate: '2024-05-15',
    feeModel: FeeModel.FIXED,
    fixedFee: 2800000,
    deductFixedFromRisk: false,
    status: 'ACTIVE'
  },
  {
    id: 'lc-003',
    caseId: 'c-004',
    vendorId: 'v-001', // KWM again
    contractNo: 'HT-2026-LEGAL-012',
    title: '实控人股票质押违约案 专项代理合同',
    signDate: '2026-01-08',
    feeModel: FeeModel.RISK,
    fixedFee: 0,
    deductFixedFromRisk: false,
    status: 'ACTIVE'
  }
];

export const getContractByCaseId = async (caseId: string): Promise<LegalContract | null> => {
    developmentBoundary('contracts.getContractByCaseId', false);
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(MOCK_CONTRACTS.find(c => c.caseId === caseId) || null);
    }, 300);
  });
};

export const getContractsByVendorId = async (vendorId: string): Promise<LegalContract[]> => {
    developmentBoundary('contracts.getContractsByVendorId', false);
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(MOCK_CONTRACTS.filter(c => c.vendorId === vendorId));
      }, 300);
    });
};
