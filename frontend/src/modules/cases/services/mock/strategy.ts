import {developmentBoundary} from '../../../../platform/developmentBoundary';
import { CaseStrategy } from '../../types';

let MOCK_STRATEGIES: CaseStrategy[] = [
  {
    id: 'strat-001',
    caseId: 'c-001',
    direction: '积极应诉',
    winProbability: 65,
    analysis: '虽然合同条款存在一定争议，但我方已掌握对方违约的关键证据（资金流向证明）。建议一审采取强硬姿态，争取驳回对方全部诉请，即便败诉也要拖延至执行阶段寻求和解。',
    updatedAt: '2025-11-20'
  },
  {
    id: 'strat-002',
    caseId: 'c-002',
    direction: '寻求和解',
    winProbability: 30,
    analysis: '作为保荐人，在“勤勉尽责”方面存在取证困难。鉴于本案为示范判决，为避免引发大规模跟风诉讼，建议在二审前与主要原告达成秘密和解，降低声誉风险。',
    updatedAt: '2025-06-01'
  }
];

export const getStrategyByCaseId = async (caseId: string): Promise<CaseStrategy | null> => {
    developmentBoundary('strategy.getStrategyByCaseId', false);
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(MOCK_STRATEGIES.find(s => s.caseId === caseId) || null);
    }, 300);
  });
};

export const saveStrategy = async (strategy: Omit<CaseStrategy, 'id'>): Promise<CaseStrategy> => {
    developmentBoundary('strategy.saveStrategy', true);
  return new Promise((resolve) => {
    setTimeout(() => {
      const existingIdx = MOCK_STRATEGIES.findIndex(s => s.caseId === strategy.caseId);
      const newStrategy = {
          ...strategy,
          id: existingIdx >= 0 ? MOCK_STRATEGIES[existingIdx].id : `strat-${Date.now()}`
      };
      
      if (existingIdx >= 0) {
          MOCK_STRATEGIES[existingIdx] = newStrategy;
      } else {
          MOCK_STRATEGIES.push(newStrategy);
      }
      resolve(newStrategy);
    }, 500);
  });
};