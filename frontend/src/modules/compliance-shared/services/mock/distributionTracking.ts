import { DistributionTask, SchemeMonitorStats } from '../../types';

const SCHEME_ID = 'SCHEME-2026-001'; // Assuming this is the ID for "2026年Q1综合考核"
const DISTRIBUTE_TIME = '2026-04-01T09:00:00Z';

export const mockDistributionTasks: DistributionTask[] = [
  // 5 NOT_STARTED
  {
    id: 'TASK-001',
    schemeId: SCHEME_ID,
    branchName: '上海陆家嘴营业部',
    distributeTime: DISTRIBUTE_TIME,
    status: 'NOT_STARTED',
    progress: 0,
  },
  {
    id: 'TASK-002',
    schemeId: SCHEME_ID,
    branchName: '北京国贸营业部',
    distributeTime: DISTRIBUTE_TIME,
    status: 'NOT_STARTED',
    progress: 0,
    lastRemindTime: '2026-04-10T10:00:00Z',
  },
  {
    id: 'TASK-003',
    schemeId: SCHEME_ID,
    branchName: '广州天河营业部',
    distributeTime: DISTRIBUTE_TIME,
    status: 'NOT_STARTED',
    progress: 0,
  },
  {
    id: 'TASK-004',
    schemeId: SCHEME_ID,
    branchName: '深圳福田营业部',
    distributeTime: DISTRIBUTE_TIME,
    status: 'NOT_STARTED',
    progress: 0,
  },
  {
    id: 'TASK-005',
    schemeId: SCHEME_ID,
    branchName: '杭州钱江新城营业部',
    distributeTime: DISTRIBUTE_TIME,
    status: 'NOT_STARTED',
    progress: 0,
    lastRemindTime: '2026-04-11T14:30:00Z',
  },

  // 10 IN_PROGRESS
  {
    id: 'TASK-006',
    schemeId: SCHEME_ID,
    branchName: '南京新街口营业部',
    distributeTime: DISTRIBUTE_TIME,
    status: 'IN_PROGRESS',
    progress: 15,
  },
  {
    id: 'TASK-007',
    schemeId: SCHEME_ID,
    branchName: '成都高新营业部',
    distributeTime: DISTRIBUTE_TIME,
    status: 'IN_PROGRESS',
    progress: 25,
  },
  {
    id: 'TASK-008',
    schemeId: SCHEME_ID,
    branchName: '武汉光谷营业部',
    distributeTime: DISTRIBUTE_TIME,
    status: 'IN_PROGRESS',
    progress: 30,
  },
  {
    id: 'TASK-009',
    schemeId: SCHEME_ID,
    branchName: '重庆解放碑营业部',
    distributeTime: DISTRIBUTE_TIME,
    status: 'IN_PROGRESS',
    progress: 45,
  },
  {
    id: 'TASK-010',
    schemeId: SCHEME_ID,
    branchName: '西安高新营业部',
    distributeTime: DISTRIBUTE_TIME,
    status: 'IN_PROGRESS',
    progress: 50,
  },
  {
    id: 'TASK-011',
    schemeId: SCHEME_ID,
    branchName: '苏州工业园区营业部',
    distributeTime: DISTRIBUTE_TIME,
    status: 'IN_PROGRESS',
    progress: 65,
  },
  {
    id: 'TASK-012',
    schemeId: SCHEME_ID,
    branchName: '青岛香港中路营业部',
    distributeTime: DISTRIBUTE_TIME,
    status: 'IN_PROGRESS',
    progress: 75,
  },
  {
    id: 'TASK-013',
    schemeId: SCHEME_ID,
    branchName: '大连星海广场营业部',
    distributeTime: DISTRIBUTE_TIME,
    status: 'IN_PROGRESS',
    progress: 80,
  },
  {
    id: 'TASK-014',
    schemeId: SCHEME_ID,
    branchName: '宁波天一广场营业部',
    distributeTime: DISTRIBUTE_TIME,
    status: 'IN_PROGRESS',
    progress: 85,
  },
  {
    id: 'TASK-015',
    schemeId: SCHEME_ID,
    branchName: '厦门鹭江道营业部',
    distributeTime: DISTRIBUTE_TIME,
    status: 'IN_PROGRESS',
    progress: 90,
  },

  // 2 SUBMITTED
  {
    id: 'TASK-016',
    schemeId: SCHEME_ID,
    branchName: '福州五四路营业部',
    distributeTime: DISTRIBUTE_TIME,
    status: 'SUBMITTED',
    progress: 100,
    submitTime: '2026-04-12T09:15:00Z',
  },
  {
    id: 'TASK-017',
    schemeId: SCHEME_ID,
    branchName: '长沙五一广场营业部',
    distributeTime: DISTRIBUTE_TIME,
    status: 'SUBMITTED',
    progress: 100,
    submitTime: '2026-04-12T11:45:00Z',
  },

  // 1 RECALLED
  {
    id: 'TASK-018',
    schemeId: SCHEME_ID,
    branchName: '郑州郑东新区营业部',
    distributeTime: DISTRIBUTE_TIME,
    status: 'RECALLED',
    progress: 100,
    submitTime: '2026-04-09T16:20:00Z', // It was submitted, then recalled
  },
];

export const calculateSchemeMonitorStats = (tasks: DistributionTask[]): SchemeMonitorStats => {
  return {
    totalTarget: tasks.length,
    notStarted: tasks.filter(t => t.status === 'NOT_STARTED').length,
    inProgress: tasks.filter(t => t.status === 'IN_PROGRESS').length,
    submitted: tasks.filter(t => t.status === 'SUBMITTED').length,
    recalled: tasks.filter(t => t.status === 'RECALLED').length,
  };
};

export const mockSchemeMonitorStats = calculateSchemeMonitorStats(mockDistributionTasks);
