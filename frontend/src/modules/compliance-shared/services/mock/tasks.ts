import { UnifiedTask } from '../../types';
import { buildTaskActionTarget } from './routes';

// Helper to generate dates relative to "today" (2026-04-12)
const TODAY = '2026-04-12T23:59:59Z';
const YESTERDAY = '2026-04-11T23:59:59Z';
const TWO_DAYS_AGO = '2026-04-10T23:59:59Z';
const TOMORROW = '2026-04-13T23:59:59Z';
const NEXT_WEEK = '2026-04-19T23:59:59Z';

const CREATED_RECENTLY = '2026-04-10T09:00:00Z';
const CREATED_OLDER = '2026-04-05T14:30:00Z';

type TaskSeed = Omit<UnifiedTask, 'actionTarget' | 'deepLink'> & {
  menuId: string;
  params?: Record<string, string | number | boolean | undefined>;
  action?: string;
};

const createTask = ({ menuId, params, action, ...task }: TaskSeed): UnifiedTask => {
  const actionTarget = buildTaskActionTarget(menuId, params, action);
  return {
    ...task,
    actionTarget,
    deepLink: actionTarget.publicPath,
  };
};

export const mockHQTasks: UnifiedTask[] = [
  createTask({
    id: 'TASK-HQ-001',
    category: 'ASSESSMENT',
    actionType: 'REVIEW',
    title: '复核上海分公司自评分',
    description: '上海分公司已提交 2026年Q1 综合考核自评，包含 15 项指标及佐证材料，请进行复核。',
    priority: 'HIGH',
    dueDate: TOMORROW,
    status: 'PENDING',
    sourceId: 'ASSESS-SH-2026Q1',
    menuId: 'hq-review',
    params: { branch: 'SH' },
    action: 'review_assessment_submission',
    createdAt: CREATED_RECENTLY,
  }),
  createTask({
    id: 'TASK-HQ-002',
    category: 'ISSUE',
    actionType: 'APPROVE',
    title: '审核北京营业部反洗钱整改材料',
    description: '北京营业部已提交关于“大额交易报告漏报”问题的整改报告及系统优化截图，请审核是否予以闭环。',
    priority: 'MEDIUM',
    dueDate: NEXT_WEEK,
    status: 'PENDING',
    sourceId: 'ISS-2026-042',
    menuId: 'hq-issue-hub',
    params: { issueId: 'ISS-2026-042' },
    action: 'verify_rectification',
    createdAt: CREATED_OLDER,
  }),
  createTask({
    id: 'TASK-HQ-003',
    category: 'INSPECTION',
    actionType: 'APPROVE',
    title: '审批 2026年年度检查方案',
    description: '稽核部已起草《2026年分支机构年度综合检查方案》，需合规总监审批后正式立项下发。',
    priority: 'HIGH',
    dueDate: TODAY,
    status: 'PENDING',
    sourceId: 'PLAN-2026-ANNUAL',
    menuId: 'hq-plans',
    params: { planId: 'PLAN-2026-ANNUAL' },
    action: 'approve_inspection_plan',
    createdAt: CREATED_RECENTLY,
  })
];

export const mockBranchTasks: UnifiedTask[] = [
  createTask({
    id: 'TASK-BR-001',
    category: 'ASSESSMENT',
    actionType: 'SUBMIT',
    title: '提交 Q1 考核佐证材料',
    description: '总部已下发《2026年Q1分支机构综合合规考核》，请在截止日期前完成自评打分并上传相关佐证材料。',
    priority: 'HIGH',
    dueDate: TODAY, // Due Today!
    status: 'PENDING',
    sourceId: 'ASSESS-2026Q1',
    menuId: 'branch-reporting',
    action: 'submit_assessment_evidence',
    createdAt: CREATED_OLDER,
  }),
  createTask({
    id: 'TASK-BR-002',
    category: 'INSPECTION',
    actionType: 'SUBMIT',
    title: '上传‘员工执业行为’检查底稿',
    description: '根据年度检查计划，需补充上传本月员工异常交易监控记录及谈话底稿。',
    priority: 'MEDIUM',
    dueDate: NEXT_WEEK,
    status: 'PENDING',
    sourceId: 'WP-2026-088',
    menuId: 'branch-upload',
    params: { paperId: 'WP-2026-088' },
    action: 'upload_inspection_working_paper',
    createdAt: CREATED_RECENTLY,
  }),
  createTask({
    id: 'TASK-BR-003',
    category: 'ISSUE',
    actionType: 'RECTIFY',
    title: '处理‘代销产品公示不全’的逾期整改单',
    description: '现场检查发现网点大堂未公示部分代销私募产品费率，该整改单已逾期，请立即处理并提交整改报告！',
    priority: 'HIGH',
    dueDate: TWO_DAYS_AGO, // Overdue
    status: 'PENDING',
    sourceId: 'ISS-2026-015',
    menuId: 'branch-ledger',
    params: { issueId: 'ISS-2026-015' },
    action: 'submit_rectification_feedback',
    createdAt: CREATED_OLDER,
  })
];
