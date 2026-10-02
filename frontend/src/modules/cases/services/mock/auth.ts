import {developmentBoundary} from '../../../../platform/developmentBoundary';

import { User, UserRole } from '../../types';

const MOCK_USERS: Record<string, User> = {
  'legal-1': {
    id: 'legal-1',
    name: '陈法务',
    role: UserRole.LEGAL_ADMIN,
    department: '法律合规部'
  },
  'legal-2': {
    id: 'legal-2',
    name: '李总监',
    role: UserRole.LEGAL_ADMIN,
    department: '法律合规部'
  },
  'biz-1': {
    id: 'biz-1',
    name: '王业务',
    role: UserRole.BUSINESS_UNIT,
    department: '投资银行部'
  },
  'biz-2': {
    id: 'biz-2',
    name: '张自营',
    role: UserRole.BUSINESS_UNIT,
    department: '自营投资部'
  },
  'ext-1': {
    id: 'ext-1',
    name: '张律师 (合伙人)',
    role: UserRole.EXTERNAL_LAWYER,
    department: '金杜律师事务所'
  }
};

export const getCurrentUser = (): Promise<User> => {
    developmentBoundary('auth.getCurrentUser', false);
  return new Promise((resolve) => {
    // Simulate network delay
    setTimeout(() => {
      // Defaulting to Legal Admin for demo purposes
      // In a real app, this would check a token/session
      const storedRole = localStorage.getItem('sld_demo_role');
      if (storedRole === UserRole.BUSINESS_UNIT) return resolve(MOCK_USERS['biz-1']);
      if (storedRole === UserRole.EXTERNAL_LAWYER) return resolve(MOCK_USERS['ext-1']);
      return resolve(MOCK_USERS['legal-1']);
    }, 400);
  });
};

export const getAllUsers = async (): Promise<User[]> => {
    developmentBoundary('auth.getAllUsers', false);
    return new Promise(resolve => setTimeout(() => resolve(Object.values(MOCK_USERS)), 300));
};

export const switchRole = (role: UserRole) => {
    developmentBoundary('auth.switchRole', true);
  localStorage.setItem('sld_demo_role', role);
  window.location.reload(); // Simple reload to refresh app state for the demo
};
