export type InspectionReportFactConfirmStatus = 'AGREED' | 'DISPUTED' | 'PENDING';
export type InspectionReportDefenseStatus = 'RESOLVED' | 'PENDING' | 'NA';

export interface InspectionReportBranchStatus {
  branchId: string;
  branchName: string;
  confirmStatus: InspectionReportFactConfirmStatus;
  defenseStatus: InspectionReportDefenseStatus;
}

export interface InspectionReportVersion {
  reportVersionId: string;
  version: string;
  name: string;
  method: string;
  uploader: string;
  time: string;
}

export const mockInspectionReportBranches: InspectionReportBranchStatus[] = [
  { branchId: 'BR-SH-001', branchName: '上海分公司', confirmStatus: 'AGREED', defenseStatus: 'RESOLVED' },
  { branchId: 'BR-SZ-001', branchName: '深圳分公司', confirmStatus: 'PENDING', defenseStatus: 'PENDING' },
];

export const mockInspectionReportVersions: InspectionReportVersion[] = [
  { reportVersionId: 'REPORT-2026-AML-V1', version: 'v1.0 初稿', name: '2026年反洗钱(AML)专项现场检查报告_初稿.docx', method: 'AI 智能生成', uploader: 'System', time: '2026-05-14 10:00' },
];

