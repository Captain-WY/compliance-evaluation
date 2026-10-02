export interface TriageRow {
  id: string;
  targetOrgId?: string;
  org: string;
  status: '被退回' | '待启动' | '填报中' | '审批流转中' | '待确认' | '已确认' | '申辩中' | '已完结';
  statusColor: string;
  progress: number;
  processor: string;
  role: string;
}

export interface WorkflowInstance {
  id: string;
  title: string;
  subtitle: string;
  status: string;
  statusBadgeColor: string;
  progress: number;
  progressText: string;
  hoverBorderColor?: string;
  isArchivingStage?: boolean;
  bucket?: 'active' | 'pending' | 'archived';
  rawStatus?: string;
  cycleCode?: string;
  schemeId?: string;
  year?: number;
  periodStart?: string;
  periodEnd?: string;
  dispatchMode?: string;
  targetCount?: number;
  selectedTargetCount?: number;
  completedCount?: number;
  reviewingCount?: number;
  fillingCount?: number;
  waitingCount?: number;
  returnedCount?: number;
  confirmedCount?: number;
  appealingCount?: number;
  resultPendingCount?: number;
  warningCount?: number;
  dueDate?: string | null;
  createdAt?: string;
  dispatchedAtRef?: string | null;
  closedAtRef?: string | null;
  archivedReason?: string | null;
  tableData: TriageRow[];
}

export const mockInstances: Record<string, WorkflowInstance> = {
  'collectQ2': {
    id: 'collectQ2',
    title: '2026年Q2分公司专项考核',
    subtitle: '考核批次: 2026Q2 | 考核对象总数: 50 家',
    status: '✍️ 考核数据填报中',
    statusBadgeColor: 'text-blue-600 border-blue-200 bg-blue-50',
    hoverBorderColor: 'hover:border-blue-300',
    progress: 30,
    progressText: '15 / 50 家',
    tableData: [
      { id: 'shanghai', org: '上海分公司', status: '被退回', statusColor: 'text-rose-500 border-rose-200 bg-rose-50', progress: 20, processor: '张三', role: '分公司合规' },
      { id: 'shenzhen', org: '深圳分公司', status: '审批流转中', statusColor: 'text-blue-500 border-blue-200 bg-blue-50', progress: 70, processor: '王五', role: '区域总监' },
      { id: 'beijing', org: '北京分公司', status: '待启动', statusColor: 'text-slate-500 border-slate-200 bg-slate-50', progress: 0, processor: '李四', role: '分支合规' },
      { id: 'guangzhou', org: '广州营业部', status: '填报中', statusColor: 'text-amber-500 border-amber-200 bg-amber-50', progress: 45, processor: '赵六', role: '分支合规' },
      { id: 'hangzhou', org: '杭州营业部', status: '填报中', statusColor: 'text-amber-500 border-amber-200 bg-amber-50', progress: 15, processor: '陈七', role: '分支合规' },
    ]
  },
  'reviewQ1': {
    id: 'reviewQ1',
    title: '2026年Q1营业部综合考核',
    subtitle: '考核批次: 2026Q1 | 考核对象总数: 50 家',
    status: '🛡️ 多级复核审批中',
    statusBadgeColor: 'text-indigo-600 border-indigo-200 bg-indigo-50',
    hoverBorderColor: 'hover:border-indigo-300',
    progress: 85,
    progressText: '42 / 50 家',
    tableData: [
      { id: 'shanghai', org: '上海分公司', status: '已完结', statusColor: 'text-emerald-500 border-emerald-200 bg-emerald-50', progress: 100, processor: '-', role: '-' },
      { id: 'shenzhen', org: '深圳分公司', status: '审批流转中', statusColor: 'text-blue-500 border-blue-200 bg-blue-50', progress: 90, processor: '王五', role: '区域总监' },
      { id: 'beijing', org: '北京分公司', status: '审批流转中', statusColor: 'text-blue-500 border-blue-200 bg-blue-50', progress: 85, processor: '李四', role: '区域审核' },
      { id: 'guangzhou', org: '广州营业部', status: '已完结', statusColor: 'text-emerald-500 border-emerald-200 bg-emerald-50', progress: 100, processor: '-', role: '-' },
      { id: 'hangzhou', org: '杭州营业部', status: '已完结', statusColor: 'text-emerald-500 border-emerald-200 bg-emerald-50', progress: 100, processor: '-', role: '-' },
    ]
  },
  'archive2025': {
    id: 'archive2025',
    title: '2025年度总部合规考核',
    subtitle: '考核批次: 2025年度 | 考核对象总数: 10 家',
    status: '🏁 待结果确认与归档',
    statusBadgeColor: 'text-emerald-600 border-emerald-200 bg-emerald-50',
    hoverBorderColor: 'hover:border-emerald-300',
    progress: 100,
    progressText: '10 / 10 家',
    isArchivingStage: true,
    tableData: [
      { id: 'org1', org: '组织部', status: '已完结', statusColor: 'text-emerald-500 border-emerald-200 bg-emerald-50', progress: 100, processor: '-', role: '-' },
      { id: 'org2', org: '自营业务部', status: '已完结', statusColor: 'text-emerald-500 border-emerald-200 bg-emerald-50', progress: 100, processor: '-', role: '-' },
      { id: 'org3', org: '投行总部', status: '已完结', statusColor: 'text-emerald-500 border-emerald-200 bg-emerald-50', progress: 100, processor: '-', role: '-' },
      { id: 'org4', org: '资管总部', status: '已完结', statusColor: 'text-emerald-500 border-emerald-200 bg-emerald-50', progress: 100, processor: '-', role: '-' },
      { id: 'org5', org: '合规法务部', status: '已完结', statusColor: 'text-emerald-500 border-emerald-200 bg-emerald-50', progress: 100, processor: '-', role: '-' },
    ]
  }
};
