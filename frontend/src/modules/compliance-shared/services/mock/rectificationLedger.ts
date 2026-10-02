import { RectificationRecord } from '../../types';

// Calculate some dynamic dates for realistic mock data
const today = new Date();

const getOffsetDate = (days: number) => {
  const date = new Date(today);
  date.setDate(date.getDate() + days);
  return date.toISOString();
};

export const mockBranchRectifications: RectificationRecord[] = [
  {
    id: 'REC-2026-001',
    sourceIssueId: 'ISS-2026-045',
    issueDescription: '营业部理财产品销售区域未实现音视频监控全覆盖。',
    rectificationGoal: '完成监控设备的增补安装，确保销售区域无死角，并提交验收报告及监控截图。',
    riskLevel: 'HIGH',
    dueDate: '2026-04-28',
    status: 'PENDING_RECTIFICATION',
    extension: { status: 'NONE' }
  },
  {
    id: 'REC-2026-002',
    sourceIssueId: 'ISS-2026-089',
    issueDescription: '核心交易系统访问权限未按季复核。',
    rectificationGoal: '排查历史离职人员并注销，出具相关季度的复核表。',
    riskLevel: 'MEDIUM',
    dueDate: '2026-04-15',
    status: 'PENDING_RECTIFICATION',
    extension: { status: 'PENDING', requestedDate: '2026-05-30' }
  },
  {
    id: 'REC-2026-003',
    sourceIssueId: 'ISS-2026-112',
    issueDescription: '部分高风险客户尽职调查(EDD)资料缺失。',
    rectificationGoal: '补充客户的尽职调查信息，提供证明。',
    riskLevel: 'HIGH',
    dueDate: '2026-04-10',
    status: 'PENDING_RECTIFICATION',
    extension: { status: 'APPROVED', originalDate: '2026-04-01' }
  },
  {
    id: 'REC-2026-004',
    sourceIssueId: 'ISS-2026-033',
    issueDescription: '大堂未公示代销产品费率。',
    rectificationGoal: '公示费率并提供照片佐证。',
    riskLevel: 'HIGH',
    dueDate: '2026-04-10',
    status: 'OVERDUE',
    extension: { status: 'REJECTED', rejectReason: '该问题属于立查立改项，不予延期。' }
  },
  {
    id: 'REC-2026-005',
    sourceIssueId: 'ISS-2025-299',
    issueDescription: '投顾业务检查：部分投顾服务记录未及时录入系统。',
    rectificationGoal: '补录所有遗漏的投顾服务记录，并优化内部质检流程。',
    riskLevel: 'LOW',
    dueDate: getOffsetDate(-10),
    status: 'CLOSED',
    feedback: {
      content: '已完成所有历史投顾记录的补录，并制定了《营业部投顾服务质检实施细则》。',
      attachments: [
        { name: '投顾记录补录清单.xlsx', url: '#', type: 'xlsx' },
        { name: '营业部投顾服务质检实施细则.pdf', url: '#', type: 'pdf' }
      ],
      submittedBy: '赵六 (投顾总监)',
      submittedAt: getOffsetDate(-12)
    }
  }
];
