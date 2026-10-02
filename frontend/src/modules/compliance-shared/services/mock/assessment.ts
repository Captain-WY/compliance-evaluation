import { ReportingTask, AssessmentResult, ReviewTask, AssessmentScheme } from '../../types';

const now = Date.now();
const days = (n: number) => n * 24 * 60 * 60 * 1000;

export const mockReportingTasks: ReportingTask[] = [
  {
    id: 'RT-2026-001',
    category: '反洗钱专项',
    indicatorName: '高风险客户尽职调查(EDD)完成率',
    description: '填报本季度高风险客户尽职调查完成比例，并上传相关系统截图及抽查底稿。',
    isRequired: true,
    reportedValue: '100%',
    status: 'SUBMITTED',
    evidenceList: [
      {
        id: 'EV-001',
        fileName: '2026Q1_高风险客户EDD清单及系统截图.pdf',
        fileSize: '2.4 MB',
        uploadTime: new Date(now - days(2)).toISOString()
      },
      {
        id: 'EV-002',
        fileName: '抽查客户(张某等3人)尽调底稿.pdf',
        fileSize: '5.1 MB',
        uploadTime: new Date(now - days(2)).toISOString()
      }
    ]
  },
  {
    id: 'RT-2026-002',
    category: '员工执业行为管理',
    indicatorName: '员工异常交易排查次数',
    description: '填报本季度针对员工及利害关系人证券账户异常交易的排查次数。',
    isRequired: true,
    reportedValue: '12', // TRAP TASK: Has value but no evidence
    status: 'PENDING',
    evidenceList: [] 
  },
  {
    id: 'RT-2026-003',
    category: '投资者教育与保护',
    indicatorName: '防范非法证券活动投教场次',
    description: '填报本季度独立举办的防范非法证券活动（打非）投资者教育活动场次。',
    isRequired: true,
    reportedValue: undefined, // Pending task
    status: 'PENDING',
    evidenceList: []
  }
];

export const mockAssessmentResults: AssessmentResult[] = [
  {
    id: 'AR-2026-001',
    category: '合规人员配备',
    indicatorName: '分支机构合规专员专职化及资质达标率',
    maxScore: 15,
    systemScore: 15,
    isDisputed: false,
    evidenceList: [
      {
        id: 'EV-101',
        fileName: '合规人员资质及社保缴纳证明.pdf',
        fileSize: '1.2 MB',
        uploadTime: new Date(now - days(15)).toISOString()
      }
    ]
  },
  {
    id: 'AR-2026-002',
    category: '合规检查整改',
    indicatorName: '历次检查发现问题按期整改率',
    maxScore: 10,
    systemScore: 5,
    deductionReason: '系统查考联动拦截：该机构上季度存在1项高风险逾期未整改缺陷，按规则直接扣减5分',
    isDisputed: false,
    evidenceList: []
  },
  {
    id: 'AR-2026-003',
    category: '客户适当性管理',
    indicatorName: '双录(录音录像)完成率及规范性',
    maxScore: 20,
    systemScore: 15,
    deductionReason: '总部非现场抽查发现3笔双录视频存在风险揭示话术不规范、画面模糊等问题，每笔扣减1.67分。',
    isDisputed: true, // Disputed score
    evidenceList: [
      {
        id: 'EV-102',
        fileName: '双录系统导出数据汇总表.xlsx',
        fileSize: '850 KB',
        uploadTime: new Date(now - days(10)).toISOString()
      },
      {
        id: 'EV-103',
        fileName: '申诉说明及补充录音材料.zip',
        fileSize: '12.5 MB',
        uploadTime: new Date(now - days(1)).toISOString()
      }
    ]
  }
];

// 在 mockAssessmentResults 的某条扣分项中加入数据 (用于总部复核视角)
export const mockReviewTask: ReviewTask = {
  indicatorId: 'AML-001',
  indicatorName: '反洗钱专项培训覆盖率',
  branchName: '上海分公司',
  branchSelfScore: 10,
  systemInitialScore: 5,
  evidenceList: [
    { 
      id: 'e1', 
      fileName: '2026年Q1反洗钱培训签到表及会议纪要.pdf', 
      fileSize: '4.2MB',
      uploadTime: new Date(now - days(3)).toISOString()
    }
  ],
  // AI 预处理结果
  aiInsights: {
    summary: "AI 识别到该附件包含培训记录，但签到人数（45人）少于分公司在册人数（50人）。",
    highlights: [
      {
        location: "第 3 页，培训人员名单",
        keyQuote: "实到人数：45人；缺席：5人（未提供请假证明）",
        matchStatus: "PARTIAL_MATCH" // 部分匹配
      }
    ]
  }
};

export interface AssessmentSchemeItem {
  id: string;
  name: string;
  frequency: string;
  timeRange: string;
  status: AssessmentScheme['status'];
  lastRunTime: string;
  targetType: string;
  targetCount: string;
  indicatorCount: number;
  weightTotal: string;
}

export const mockSchemeItems: AssessmentSchemeItem[] = [
  {
    id: 'SCH-2026-001',
    name: '2026年Q1营业部综合合规考核',
    frequency: '按季 (Quarterly)',
    timeRange: '2026.01.01 - 2026.03.31',
    status: 'ACTIVE',
    lastRunTime: '2026-04-30 09:00',
    targetType: '🏢 财富营业部',
    targetCount: '命中: 50 家',
    indicatorCount: 15,
    weightTotal: '100%'
  },
  {
    id: 'SCH-2026-002',
    name: '2026年反洗钱专项合规排查',
    frequency: '一次性 (One-Time)',
    timeRange: '2026.04.01 - 2026.04.30',
    status: 'DRAFT',
    lastRunTime: '-',
    targetType: '💼 核心业务部',
    targetCount: '命中: 12 个',
    indicatorCount: 8,
    weightTotal: '100%'
  },
  {
    id: 'SCH-2025-012',
    name: '2025年12月投行业务执业质量考核',
    frequency: '按月 (Monthly)',
    timeRange: '2025.12.01 - 2025.12.31',
    status: 'EXPIRED',
    lastRunTime: '2025-12-31 18:00',
    targetType: '🏛️ 投行分公司',
    targetCount: '命中: 1 家',
    indicatorCount: 20,
    weightTotal: '100%'
  },
  {
    id: 'SCH-2026-003',
    name: '2026年上半年廉洁从业专项考核',
    frequency: '临时 (Ad-hoc)',
    timeRange: '2026.01.01 - 2026.06.30',
    status: 'DRAFT',
    lastRunTime: '-',
    targetType: '👥 全体高管人员',
    targetCount: '命中: 300 人',
    indicatorCount: 5,
    weightTotal: '100%'
  }
];

export type FormIndicator = {
  id: string;
  indicatorId?: string;
  type: 'QUANTITATIVE' | 'QUALITATIVE';
  title: string;
  description: string;
  value?: string;
  unit?: string;
  files: { id: string; name: string; fromLedger?: boolean }[];
  status?: 'LOCKED' | 'REJECTED' | 'PENDING';
  hqComment?: string;
};

export const mockFormIndicators: FormIndicator[] = [
  {
    id: 'IND-01',
    type: 'QUANTITATIVE',
    title: '营业部合规宣导完成率',
    description: '营业部每月需开展至少1次防范非法集资、反洗钱等主题的合规宣导及培训。\n考核标准：覆盖率 = 实际参与人数 / 应参与人数。需上传签到表及现场照片。',
    value: '95',
    unit: '%',
    files: [
      { id: 'F1', name: '全员合规培训签到表.pdf' },
      { id: 'F2', name: '现场培训照片.png' }
    ],
    status: 'LOCKED'
  },
  {
    id: 'IND-02',
    type: 'QUALITATIVE',
    title: '员工异常交易排查情况说明',
    description: '详细说明本考核周期内发现疑似异常交易线索的情况、上报流程及后续处置结果。\n考核标准：描述清晰、流程合规且有据可查。如有详细底稿可附上。',
    value: '本季度共完成了3次员工异常交易排查...',
    files: [],
    status: 'REJECTED',
    hqComment: '客户异常交易排查次数与系统底稿不符，请重新核对台账并补充最新月份的佐证材料。 —— 张三 (合规部) 2026-05-08'
  },
  {
    id: 'IND-03',
    type: 'QUANTITATIVE',
    title: '投诉纠纷处理时效达标率',
    description: '客户投诉及纠纷事件在3个工作日内响应并启动调查的比例。\n考核标准：要求达到100%。若不足请附说明及事件台账。',
    value: '100',
    unit: '%',
    files: [{ id: 'F3', name: '客诉台账.xlsx' }],
    status: 'LOCKED'
  },
  {
    id: 'IND-04',
    type: 'QUALITATIVE',
    title: '自查自纠与内部审计发现问题整改情况',
    description: '本考核期内，对于合规总部检查发现或分支机构内部自查发现的问题，是否已按照要求完成整改闭环。',
    value: '已完成反洗钱专项检查中发现的2项低优问题整改，具体整改计划与验证报告见附件。',
    files: [
      { id: 'F3', name: '反洗钱专项整改回复函.pdf' }
    ],
    status: 'LOCKED'
  }
];

export const mockBranches = [
  { id: 'b1', name: '上海分公司', status: 'pending', progress: '12/45' },
  { id: 'b2', name: '北京分公司', status: 'done', progress: '45/45' },
  { id: 'b3', name: '深圳分公司', status: 'pending', progress: '30/45' },
  { id: 'b4', name: '广州分公司', status: 'pending', progress: '0/45' },
  { id: 'b5', name: '杭州营业部', status: 'done', progress: '20/20' },
];

export const mockReviewTasks: ReviewTask[] = [
  mockReviewTask,
  {
    ...mockReviewTask,
    indicatorId: 'AML-002',
    indicatorName: '客户身份识别(KYC)完整率',
    branchSelfScore: 15,
    systemInitialScore: 15,
    aiInsights: undefined,
    evidenceList: [
      { id: 'e2', fileName: '2026年Q1_KYC抽查报告.pdf', fileSize: '1.2MB', uploadTime: new Date().toISOString() }
    ]
  },
  {
    ...mockReviewTask,
    indicatorId: 'EMP-001',
    indicatorName: '员工异常交易排查次数',
    branchSelfScore: 5,
    systemInitialScore: 0,
    aiInsights: {
      summary: "AI 未在附件中找到本季度的排查台账，附件内容为上季度总结。",
      highlights: [
        {
          location: "文档标题及第1段",
          keyQuote: "2025年Q4员工异常交易排查总结报告...",
          matchStatus: "DATE_MISMATCH"
        }
      ]
    },
    evidenceList: [
      { id: 'e3', fileName: '异常交易排查报告.pdf', fileSize: '800KB', uploadTime: new Date().toISOString() }
    ]
  },
  {
    ...mockReviewTask,
    indicatorId: 'L3-001',
    indicatorName: '合规履职底线要求',
    branchSelfScore: 90,
    systemInitialScore: 90,
    aiInsights: undefined,
    evidenceList: [
      { id: 'e4', fileName: '底线要求整改版.pdf', fileSize: '2.1MB', uploadTime: new Date().toISOString() }
    ]
  }
];

export const mockTriageTasks = [
  { 
    id: 'TSK-101', 
    branch: '上海分公司', 
    indicator: '反洗钱培训覆盖率', 
    sla: '1天前',
    isOverdue: true,
  },
  { 
    id: 'TSK-102', 
    branch: '深圳深南大道营业部', 
    indicator: '异常交易排查及时率', 
    sla: '还有 2 天',
    isOverdue: false,
  },
  { 
    id: 'TSK-103', 
    branch: '投行华南部', 
    indicator: '内幕信息知情人登记', 
    sla: '还有 5 天',
    isOverdue: false,
  }
];

export const mockActiveAssessmentCycles = [
  { 
    id: 'CYC-2026-Q1', 
    title: '2026年Q1 分支机构综合合规考核', 
    currentStage: 'HQ_REVIEW', 
    overallProgress: 68,
    deadline: '2026-05-15',
    stats: { total: 50, submitted: 35, reviewing: 10, completed: 5 }
  }
];

export const mockAssessmentWorkflowBranchTasks = [
  { id: '1', branch: '上海分公司', status: 'WAITING_REVIEW', progress: 100, lastAction: '2小时前已提交', reviewer: '-' },
  { id: '2', branch: '深圳分公司', status: 'SUBMITTING', progress: 45, lastAction: '由 张三 编辑中', reviewer: '-' },
  { id: '3', branch: '北京营业部', status: 'OVERDUE', progress: 80, lastAction: '已超期未提交', reviewer: '-' },
  { id: '4', branch: '广州分公司', status: 'COMPLETED', progress: 100, lastAction: '总部已复核确认', reviewer: '王五 (合规部)' },
  { id: '5', branch: '杭州营业部', status: 'SUBMITTING', progress: 10, lastAction: '尚未开始填报', reviewer: '-' },
  { id: '6', branch: '南京分公司', status: 'WAITING_REVIEW', progress: 100, lastAction: '1天前已提交', reviewer: '-' },
];

export const mockAppealEkpNodes = [
  { id: 'n1', label: '营业部合规专员 发起', status: 'done', date: '2026-04-10 10:00' },
  { id: 'n2', label: '分公司合规总监 审批', status: 'done', date: '2026-04-10 14:30' },
  { id: 'n3', label: '法律合规部总监 审批', status: 'active', date: '处理中...' },
  { id: 'n4', label: '系统自动回推归档', status: 'pending', date: '' }
];

export const mockAssessmentTrendDataMap: Record<string, { name: string, score: number, rank?: string }[]> = {
  comprehensive: [
    { name: '2025Q2', score: 82, rank: 'A' },
    { name: '2025Q3', score: 88, rank: 'A' },
    { name: '2025Q4', score: 85, rank: 'B' },
    { name: '2026Q1', score: 92, rank: 'A' },
  ],
  aml: [
    { name: '2025H1', score: 90 },
    { name: '2025H2', score: 95 },
    { name: '2026H1', score: 98 },
  ],
  investor: [
    { name: '2025', score: 80, rank: 'C' },
    { name: '2026', score: 89, rank: 'B' },
  ],
  empty: []
};

export const mockAssessmentSearchItems = [
  { value: 'comprehensive', label: '营业部季度综合考核' },
  { value: 'aml', label: '反洗钱专项排查' },
  { value: 'investor', label: '投资者适当性专项' },
  { value: 'empty', label: '网络安全飞行检查（样例空数据）' },
];

  export const mockAssessmentLeaderboardData = [
    {
      id: 'region-1',
      rank: 1,
      name: '上海分公司',
      score: 96.5,
      status: '🟢 已确认',
      statusClass: 'text-emerald-600 border-emerald-200 bg-emerald-50',
      scoreClass: 'text-emerald-600',
      rankClass: 'bg-amber-100 text-amber-600 border-amber-200',
      children: [
        { id: 'dept-1-1', rank: 1, name: '浦东营业部', score: 98.0, status: '🟢 已确认', statusClass: 'text-emerald-600 border-emerald-200 bg-emerald-50', scoreClass: 'text-emerald-600' },
        { id: 'dept-1-2', rank: 2, name: '黄浦营业部', score: 95.0, status: '🟢 已确认', statusClass: 'text-emerald-600 border-emerald-200 bg-emerald-50', scoreClass: 'text-emerald-600' }
      ]
    },
    {
      id: 'region-2',
      rank: 15,
      name: '深圳分公司',
      score: 85.0,
      status: '🟡 申诉处理中',
      statusClass: 'text-amber-600 border-amber-200 bg-amber-50',
      scoreClass: 'text-blue-600',
      rankClass: 'bg-slate-100 text-slate-600 border-slate-200',
      children: [
        { id: 'dept-2-1', rank: 1, name: '福田营业部', score: 88.0, status: '🟢 已确认', statusClass: 'text-emerald-600 border-emerald-200 bg-emerald-50', scoreClass: 'text-emerald-600' },
        { id: 'dept-2-2', rank: 2, name: '南山营业部', score: 82.0, status: '🟡 申诉处理中', statusClass: 'text-amber-600 border-amber-200 bg-amber-50', scoreClass: 'text-blue-600' }
      ]
    },
    {
      id: 'region-3',
      rank: 48,
      name: '北京分公司',
      score: 72.5,
      status: '🔒 逾期锁死',
      statusClass: 'text-slate-500 border-slate-200 bg-slate-50',
      scoreClass: 'text-rose-600',
      rankClass: 'bg-slate-100 text-slate-600 border-slate-200',
      children: []
    }
  ];


// --- Mock Data ---
export const mockUnifiedReviewHistory = [
  { level: 'Origin', user: '上海分公司-张三', action: '提交自评', opinion: '已按要求完成全员培训。', time: '2026-04-10 10:00', status: 'submit' },
  { level: 'L1', user: '上海分公司合规官-李四', action: '初审通过', opinion: '核对签到表无误，准予上报。', time: '2026-04-11 14:30', status: 'approve' }
];

export const mockUnifiedReviewTasks = [
  { 
    id: 'TSK-101', 
    branch: '上海分公司', 
    indicator: '反洗钱培训覆盖率', 
    value: '95%', 
    score: 15,
    currentLevel: 'L2 (条线总部)',
    levelCode: 'L2',
    sla: '1天前',
    isOverdue: true,
    history: mockUnifiedReviewHistory
  },
  { 
    id: 'TSK-102', 
    branch: '深圳深南大道营业部', 
    indicator: '异常交易排查及时率', 
    value: '100%', 
    score: 20,
    currentLevel: 'L2 (条线总部)',
    levelCode: 'L2',
    sla: '还有 2 天',
    isOverdue: false,
    history: [
      { level: 'Origin', user: '深圳营业部-王五', action: '提交自评', opinion: '当日发现当日排查，无遗漏。', time: '2026-04-12 09:15', status: 'submit' },
    ]
  },
  { 
    id: 'TSK-103', 
    branch: '投行华南部', 
    indicator: '内幕信息知情人登记', 
    value: '未发现违规', 
    score: 30,
    currentLevel: 'L3 (合规部终审)',
    levelCode: 'L3',
    sla: '还有 5 天',
    isOverdue: false,
    history: [
      { level: 'Origin', user: '投行华南-赵六', action: '提交自评', opinion: '严格执行内幕信息登记机制', time: '2026-04-09 11:00', status: 'submit' },
      { level: 'L2', user: '投行管理总部-钱七', action: '复核通过', opinion: '符合监管要求，材料真实有效', time: '2026-04-10 16:00', status: 'approve' },
    ]
  }
];

export const mockUnifiedReviewQuickPhrases = ["核对无误", "资料不全，请补充", "计算口径有误，请核查", "符合制度要求，建议通过", "需进一步核实细节"];
