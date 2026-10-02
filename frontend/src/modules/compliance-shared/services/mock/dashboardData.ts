import { BranchPortrait, GlobalMetrics } from '../../types';

export const mockBranchPortraits: BranchPortrait[] = [
  {
    // The "Star" Branch
    branchId: 'BR-001',
    branchName: '上海陆家嘴营业部',
    region: '华东',
    totalScore: 98.5,
    rank: 1,
    scoreTrend: [95, 96, 96.5, 97, 98, 98.5],
    openIssues: 0,
    highRiskIssues: 0,
    rectificationRate: 100,
    riskLevel: 'SAFE',
    dimensions: [
      { name: '反洗钱', score: 20, weight: 20, issueCount: 0 },
      { name: '员工行为', score: 25, weight: 25, issueCount: 0 },
      { name: '内控管理', score: 19.5, weight: 20, issueCount: 0 },
      { name: '适当性管理', score: 14.5, weight: 15, issueCount: 0 },
      { name: '客户服务', score: 19.5, weight: 20, issueCount: 0 },
    ]
  },
  {
    // The "Problem" Branch
    branchId: 'BR-002',
    branchName: '深圳福田营业部',
    region: '华南',
    totalScore: 65.0,
    rank: 10,
    scoreTrend: [75, 72, 70, 68, 66, 65],
    openIssues: 8,
    highRiskIssues: 3,
    rectificationRate: 45,
    riskLevel: 'CRITICAL',
    dimensions: [
      { name: '反洗钱', score: 12, weight: 20, issueCount: 4 }, // Low score, high issues
      { name: '员工行为', score: 15, weight: 25, issueCount: 3 }, // Low score, high issues
      { name: '内控管理', score: 14, weight: 20, issueCount: 1 },
      { name: '适当性管理', score: 10, weight: 15, issueCount: 2 },
      { name: '客户服务', score: 14, weight: 20, issueCount: 0 },
    ]
  },
  {
    // The "Improving" Branch
    branchId: 'BR-003',
    branchName: '北京国贸营业部',
    region: '华北',
    totalScore: 82.5,
    rank: 4,
    scoreTrend: [70, 73, 75, 78, 80, 82.5],
    openIssues: 2,
    highRiskIssues: 0,
    rectificationRate: 90,
    riskLevel: 'SAFE',
    dimensions: [
      { name: '反洗钱', score: 18, weight: 20, issueCount: 1 },
      { name: '员工行为', score: 20, weight: 25, issueCount: 1 },
      { name: '内控管理', score: 16, weight: 20, issueCount: 0 },
      { name: '适当性管理', score: 12.5, weight: 15, issueCount: 0 },
      { name: '客户服务', score: 16, weight: 20, issueCount: 0 },
    ]
  },
  {
    branchId: 'BR-004',
    branchName: '广州天河营业部',
    region: '华南',
    totalScore: 88.0,
    rank: 2,
    scoreTrend: [85, 86, 86, 87, 87.5, 88],
    openIssues: 1,
    highRiskIssues: 0,
    rectificationRate: 95,
    riskLevel: 'SAFE',
    dimensions: [
      { name: '反洗钱', score: 19, weight: 20, issueCount: 0 },
      { name: '员工行为', score: 22, weight: 25, issueCount: 1 },
      { name: '内控管理', score: 18, weight: 20, issueCount: 0 },
      { name: '适当性管理', score: 13, weight: 15, issueCount: 0 },
      { name: '客户服务', score: 16, weight: 20, issueCount: 0 },
    ]
  },
  {
    branchId: 'BR-005',
    branchName: '成都高新营业部',
    region: '西部',
    totalScore: 76.5,
    rank: 7,
    scoreTrend: [78, 77, 76, 76, 75, 76.5],
    openIssues: 4,
    highRiskIssues: 1,
    rectificationRate: 65,
    riskLevel: 'WARNING',
    dimensions: [
      { name: '反洗钱', score: 15, weight: 20, issueCount: 2 },
      { name: '员工行为', score: 18, weight: 25, issueCount: 1 },
      { name: '内控管理', score: 15, weight: 20, issueCount: 1 },
      { name: '适当性管理', score: 12, weight: 15, issueCount: 0 },
      { name: '客户服务', score: 16.5, weight: 20, issueCount: 0 },
    ]
  },
  {
    branchId: 'BR-006',
    branchName: '杭州钱江新城营业部',
    region: '华东',
    totalScore: 85.0,
    rank: 3,
    scoreTrend: [82, 83, 84, 84.5, 85, 85],
    openIssues: 2,
    highRiskIssues: 0,
    rectificationRate: 85,
    riskLevel: 'SAFE',
    dimensions: [
      { name: '反洗钱', score: 17, weight: 20, issueCount: 1 },
      { name: '员工行为', score: 21, weight: 25, issueCount: 0 },
      { name: '内控管理', score: 17, weight: 20, issueCount: 1 },
      { name: '适当性管理', score: 13, weight: 15, issueCount: 0 },
      { name: '客户服务', score: 17, weight: 20, issueCount: 0 },
    ]
  },
  {
    branchId: 'BR-007',
    branchName: '南京新街口营业部',
    region: '华东',
    totalScore: 79.0,
    rank: 6,
    scoreTrend: [80, 79, 79, 78.5, 79, 79],
    openIssues: 3,
    highRiskIssues: 0,
    rectificationRate: 75,
    riskLevel: 'WARNING',
    dimensions: [
      { name: '反洗钱', score: 16, weight: 20, issueCount: 1 },
      { name: '员工行为', score: 19, weight: 25, issueCount: 1 },
      { name: '内控管理', score: 16, weight: 20, issueCount: 1 },
      { name: '适当性管理', score: 12, weight: 15, issueCount: 0 },
      { name: '客户服务', score: 16, weight: 20, issueCount: 0 },
    ]
  },
  {
    branchId: 'BR-008',
    branchName: '武汉光谷营业部',
    region: '华中',
    totalScore: 72.0,
    rank: 8,
    scoreTrend: [75, 74, 73, 72, 71, 72],
    openIssues: 5,
    highRiskIssues: 1,
    rectificationRate: 60,
    riskLevel: 'WARNING',
    dimensions: [
      { name: '反洗钱', score: 14, weight: 20, issueCount: 2 },
      { name: '员工行为', score: 17, weight: 25, issueCount: 2 },
      { name: '内控管理', score: 14, weight: 20, issueCount: 1 },
      { name: '适当性管理', score: 11, weight: 15, issueCount: 0 },
      { name: '客户服务', score: 16, weight: 20, issueCount: 0 },
    ]
  },
  {
    branchId: 'BR-009',
    branchName: '重庆解放碑营业部',
    region: '西部',
    totalScore: 81.5,
    rank: 5,
    scoreTrend: [78, 79, 80, 80.5, 81, 81.5],
    openIssues: 1,
    highRiskIssues: 0,
    rectificationRate: 90,
    riskLevel: 'SAFE',
    dimensions: [
      { name: '反洗钱', score: 17.5, weight: 20, issueCount: 0 },
      { name: '员工行为', score: 20, weight: 25, issueCount: 1 },
      { name: '内控管理', score: 16, weight: 20, issueCount: 0 },
      { name: '适当性管理', score: 12, weight: 15, issueCount: 0 },
      { name: '客户服务', score: 16, weight: 20, issueCount: 0 },
    ]
  },
  {
    branchId: 'BR-010',
    branchName: '西安高新营业部',
    region: '西部',
    totalScore: 68.5,
    rank: 9,
    scoreTrend: [72, 71, 70, 69, 68, 68.5],
    openIssues: 6,
    highRiskIssues: 2,
    rectificationRate: 50,
    riskLevel: 'CRITICAL',
    dimensions: [
      { name: '反洗钱', score: 13, weight: 20, issueCount: 3 },
      { name: '员工行为', score: 16, weight: 25, issueCount: 2 },
      { name: '内控管理', score: 14, weight: 20, issueCount: 1 },
      { name: '适当性管理', score: 11, weight: 15, issueCount: 0 },
      { name: '客户服务', score: 14.5, weight: 20, issueCount: 0 },
    ]
  }
];

// Calculate global metrics based on mockBranchPortraits
const calculateGlobalMetrics = (branches: BranchPortrait[]): GlobalMetrics => {
  const scores = branches.map((branch) => branch.totalScore).filter((score): score is number => score != null);
  const totalScore = scores.reduce((sum, score) => sum + score, 0);
  const avgComplianceScore = scores.length ? Number((totalScore / scores.length).toFixed(1)) : null;
  
  const totalActiveIssues = branches.reduce((sum, branch) => sum + (branch.openIssues ?? 0), 0);
  
  const rectificationRates = branches.map((branch) => branch.rectificationRate).filter((rate): rate is number => rate != null);
  const totalRectificationRate = rectificationRates.reduce((sum, rate) => sum + rate, 0);
  const overallRectificationRate = rectificationRates.length ? Number((totalRectificationRate / rectificationRates.length).toFixed(1)) : null;

  // Generate a mock monthly trend based on the current average
  const currentMonth = new Date().getMonth();
  const months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
  
  const monthlyTrend = [];
  for (let i = 5; i >= 0; i--) {
    const monthIndex = (currentMonth - i + 12) % 12;
    // Slight variations for historical data
    const historicalScore = avgComplianceScore == null ? null : avgComplianceScore - (i * 0.5) + (Math.random() * 2 - 1);
    const historicalIssues = totalActiveIssues + (i * 2) - Math.floor(Math.random() * 3);
    
    monthlyTrend.push({
      month: months[monthIndex],
      score: historicalScore == null ? null : Number(historicalScore.toFixed(1)),
      issueCount: Math.max(0, historicalIssues)
    });
  }

  // Ensure the last month matches current exact stats
  if (monthlyTrend.length > 0) {
    monthlyTrend[monthlyTrend.length - 1].score = avgComplianceScore;
    monthlyTrend[monthlyTrend.length - 1].issueCount = totalActiveIssues;
  }

  return {
    avgComplianceScore,
    totalActiveIssues,
    overallRectificationRate,
    monthlyTrend
  };
};

export const globalMetrics: GlobalMetrics = calculateGlobalMetrics(mockBranchPortraits);

export const mockGlobalStatsData = {
  activeProjects: 5,
  coveredBranches: 124,
  totalDefects: 86,
  highRisk: 12,
  mediumRisk: 34,
  lowRisk: 40,
  todayAlerts: 8
};

export const mockDomainRisksData = [
  { name: '反洗钱', value: 40, color: '#f43f5e' },
  { name: '员工行为', value: 30, color: '#f59e0b' },
  { name: '适当性管理', value: 20, color: '#6366f1' },
  { name: '财务合规', value: 10, color: '#3b82f6' },
];

export const mockBranchRiskData = [
  { name: '深圳分公司', defects: 25 },
  { name: '上海分公司', defects: 18 },
  { name: '北京分公司', defects: 14 },
  { name: '广州分公司', defects: 10 },
  { name: '杭州分公司', defects: 8 },
];

export const mockLiveRiskStreamData = [
  { id: 1, project: '反洗钱专项', branch: '上海分公司', issue: '大额交易系统拦截失败且未人工上报', risk: 'HIGH', time: '10 分钟前', borderColor: 'border-rose-500', riskColor: 'text-rose-400' },
  { id: 2, project: '适当性专项', branch: '深圳分公司', issue: '双录视频大面积缺失且未整改', risk: 'HIGH', time: '45 分钟前', borderColor: 'border-rose-500', riskColor: 'text-rose-400' },
  { id: 3, project: '员工行为摸排', branch: '北京分公司', issue: '发现违规代客理财疑似线索', risk: 'MEDIUM', time: '2 小时前', borderColor: 'border-amber-500', riskColor: 'text-amber-400' },
  { id: 4, project: '日常合规巡检', branch: '广州分公司', issue: '投顾服务风险揭示不到位', risk: 'MEDIUM', time: '3 小时前', borderColor: 'border-amber-500', riskColor: 'text-amber-400' },
  { id: 5, project: '财务合规检查', branch: '杭州分公司', issue: '账户类业务档案流转不达标', risk: 'LOW', time: '5 小时前', borderColor: 'border-slate-500', riskColor: 'text-slate-400' },
];

export const mockFlightBoardProjects = [
  {
    id: 'p1',
    name: '2026年反洗钱专项现场检查',
    period: '2026-04-01 ~ 2026-05-30',
    progress: 50,
    current: 15,
    total: 30,
    defects: 45,
    health: 'normal'
  },
  {
    id: 'p2',
    name: '2026年一季度适当性管理抽查',
    period: '2026-03-01 ~ 2026-04-15',
    progress: 80,
    current: 40,
    total: 50,
    defects: 120,
    health: 'warning'
  },
  {
    id: 'p3',
    name: '财务规范与报销合规核查',
    period: '2026-05-01 ~ 2026-06-30',
    progress: 10,
    current: 2,
    total: 20,
    defects: 3,
    health: 'normal'
  },
  {
    id: 'p4',
    name: '网络安全与系统权限专项',
    period: '2026-04-15 ~ 2026-05-15',
    progress: 90,
    current: 18,
    total: 20,
    defects: 8,
    health: 'normal'
  },
  {
    id: 'p5',
    name: '员工违规代客理财排查行动',
    period: '2026-05-05 ~ 2026-07-05',
    progress: 0,
    current: 0,
    total: 100,
    defects: 0,
    health: 'warning'
  }
];
