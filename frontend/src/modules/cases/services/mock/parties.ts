import {developmentBoundary} from '../../../../platform/developmentBoundary';
import { Party } from '../../types';

export const MOCK_PARTIES: Party[] = [
  {
    id: 'p-001',
    name: '永绿控股集团有限公司',
    type: 'COMPANY',
    isBlacklisted: true,
    historyCaseCount: 5,
    creditCode: '91310000XXXXXXXX01'
  },
  {
    id: 'p-002',
    name: 'TechNova科技股份有限公司',
    type: 'COMPANY',
    isBlacklisted: false,
    historyCaseCount: 1,
    creditCode: '91110000XXXXXXXX02'
  },
  {
    id: 'p-003',
    name: '张三',
    type: 'INDIVIDUAL',
    isBlacklisted: false,
    historyCaseCount: 0
  },
  {
    id: 'p-004',
    name: '李四',
    type: 'INDIVIDUAL',
    isBlacklisted: true, // 恶意投诉客户
    historyCaseCount: 3
  }
];

export const searchParties = async (query: string): Promise<Party[]> => {
    developmentBoundary('parties.searchParties', false);
  return new Promise((resolve) => {
    setTimeout(() => {
      if (!query) return resolve([]);
      const results = MOCK_PARTIES.filter(p => p.name.includes(query));
      resolve(results);
    }, 200);
  });
};
