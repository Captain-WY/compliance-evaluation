import type { IssueRectificationStatus, RiskLevel } from '../../types';

export interface IssueLedgerRecord {
  issueId: string;
  rectificationId?: string;
  title: string;
  responsibleOrgName: string;
  riskLevel: RiskLevel;
  status: IssueRectificationStatus;
  slaDays: number;
}

export interface IssueLedgerPage {
  totalRecords: number;
  currentPage: number;
  pageSize: number;
  records: IssueLedgerRecord[];
}

export const mockIssueLedgerPage: IssueLedgerPage = {
  totalRecords: 1245,
  currentPage: 1,
  pageSize: 10,
  records: [
    { issueId: 'ISS-2026-001', title: '自营业务异常交易监控阈值设置不合理', responsibleOrgName: '自营投资部', riskLevel: 'HIGH', status: 'PENDING_RECTIFICATION', slaDays: -5 },
    { issueId: 'ISS-2026-002', title: '高风险客户尽职调查更新不及时', responsibleOrgName: '上海分公司', riskLevel: 'MEDIUM', status: 'PENDING_VERIFICATION', slaDays: 2 },
    { issueId: 'ISS-2026-003', title: '员工异常行为监测不到位', responsibleOrgName: '深圳分公司', riskLevel: 'HIGH', status: 'RECTIFYING', slaDays: 1 },
    { issueId: 'ISS-2026-004', title: '客户身份资料留存不完整', responsibleOrgName: '北京营业部', riskLevel: 'LOW', status: 'CLOSED', slaDays: 14 },
    { issueId: 'ISS-2026-005', title: '交易记录未按规定期限保存', responsibleOrgName: '广州营业部', riskLevel: 'MEDIUM', status: 'PENDING_RECTIFICATION', slaDays: -1 },
  ],
};

