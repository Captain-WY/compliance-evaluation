import { EvidenceRequirement, EvidenceSubmission, SubmissionStatus } from '../../types';

export const mockRequirements: EvidenceRequirement[] = [
  {
    id: 'REQ-001',
    inspectionId: 'INSP-2026-Q1',
    title: '反洗钱大额交易清单',
    description: '请提供2026年第一季度所有单笔超过50万元人民币的大额交易明细清单，需包含客户姓名、交易时间、金额及资金流向说明。',
    requiredTags: ['业务凭证', '系统截图'],
    dueDate: '2026-04-15T23:59:59Z'
  },
  {
    id: 'REQ-002',
    inspectionId: 'INSP-2026-Q1',
    title: '员工违规外联排查表',
    description: '请提交本季度全体员工微信、QQ等外部通讯工具使用情况的自查报告，并附带抽查记录。',
    requiredTags: ['自查报告'],
    dueDate: '2026-04-18T23:59:59Z'
  },
  {
    id: 'REQ-003',
    inspectionId: 'INSP-2026-Q1',
    title: '营业部合规宣导记录',
    description: '请上传本季度组织的至少两次全员合规培训会议纪要、签到表及现场照片。',
    requiredTags: ['会议纪要', '制度文件'],
    dueDate: '2026-04-20T23:59:59Z'
  }
];

export const mockSubmissions: EvidenceSubmission[] = [
  {
    id: 'SUB-001',
    requirementId: 'REQ-001',
    branchId: 'BR-SH-001',
    branchName: '上海分公司',
    files: [
      {
        name: '上海分公司_Q1大额交易明细.xlsx',
        url: '#',
        size: '1.2 MB',
        type: 'xlsx',
        tags: ['业务凭证']
      },
      {
        name: '系统导出截图证明.pdf',
        url: '#',
        size: '3.5 MB',
        type: 'pdf',
        tags: ['系统截图']
      }
    ],
    status: 'SUBMITTED',
    submitTime: '2026-04-12T10:30:00Z'
  },
  {
    id: 'SUB-002',
    requirementId: 'REQ-002',
    branchId: 'BR-BJ-001',
    branchName: '北京分公司',
    files: [
      {
        name: '北京分公司_员工外联自查报告.pdf',
        url: '#',
        size: '2.1 MB',
        type: 'pdf',
        tags: ['自查报告']
      }
    ],
    status: 'REJECTED',
    submitTime: '2026-04-11T15:45:00Z',
    hqFeedback: '文件内容不完整，缺少3月份的抽查数据，请补充后重新提交。'
  },
  {
    id: 'SUB-003',
    requirementId: 'REQ-003',
    branchId: 'BR-SZ-001',
    branchName: '深圳分公司',
    files: [],
    status: 'PENDING'
  },
  {
    id: 'SUB-004',
    requirementId: 'REQ-001',
    branchId: 'BR-GZ-001',
    branchName: '广州分公司',
    files: [
      {
        name: '广州分公司_大额交易清单(部分).xlsx',
        url: '#',
        size: '0.8 MB',
        type: 'xlsx',
        tags: ['业务凭证']
      }
    ],
    status: 'ISSUE_CREATED',
    submitTime: '2026-04-10T09:15:00Z',
    relatedIssueId: 'ISS-2026-045'
  }
];

/**
 * Perspective Logic Helper
 * Returns the appropriate localized string for the UI based on the user's role.
 */
export function getStatusLabel(status: SubmissionStatus, role: 'HQ' | 'BRANCH'): string {
  switch (status) {
    case 'PENDING':
      return role === 'HQ' ? '等待中' : '待上传';
    case 'SUBMITTED':
      return role === 'HQ' ? '待审核' : '已提交';
    case 'REJECTED':
      return role === 'HQ' ? '已退回' : '被退回 (需重传)';
    case 'APPROVED':
      return role === 'HQ' ? '已归档' : '审核通过';
    case 'ISSUE_CREATED':
      return role === 'HQ' ? '已转问题库' : '整改中';
    default:
      return '未知状态';
  }
}
