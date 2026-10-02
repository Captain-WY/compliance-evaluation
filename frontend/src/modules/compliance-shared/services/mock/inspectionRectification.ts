import type { IssueRectificationStatus } from '../../types';

export interface InspectionRectificationStats {
  total: number;
  closed: number;
  overdue: number;
  inProgress: number;
  rate: number;
}

export interface InspectionRectificationLedgerItem {
  issueId: string;
  branchId: string;
  branchName: string;
  description: string;
  status: IssueRectificationStatus;
  deadline: string;
  evidenceCount: number;
}

export interface InspectionRectificationWorkspaceData {
  stats: InspectionRectificationStats;
  ledger: InspectionRectificationLedgerItem[];
}

export const mockInspectionRectificationWorkspace: InspectionRectificationWorkspaceData = {
  stats: { total: 10, closed: 6, overdue: 1, inProgress: 3, rate: 60 },
  ledger: [
    { issueId: 'ISS-2026-001', branchId: 'BR-SH-001', branchName: '上海分公司', description: '大堂未公示代销产品费率', status: 'OVERDUE', deadline: '2026-04-20', evidenceCount: 0 },
    { issueId: 'ISS-2026-002', branchId: 'BR-SZ-001', branchName: '深圳分公司', description: '客户风险等级重估流程缺失', status: 'PENDING_VERIFICATION', deadline: '2026-04-25', evidenceCount: 2 },
    { issueId: 'ISS-2026-003', branchId: 'BR-BJ-001', branchName: '北京营业部', description: '反洗钱培训记录不完整', status: 'CLOSED', deadline: '2026-04-15', evidenceCount: 1 },
    { issueId: 'ISS-2026-004', branchId: 'BR-GZ-001', branchName: '广州营业部', description: '异常交易预警处理滞后', status: 'RECTIFYING', deadline: '2026-05-10', evidenceCount: 0 },
  ],
};

