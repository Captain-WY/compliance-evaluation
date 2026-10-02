import { LocalBranchProfile } from '../../types';

export const mockCurrentBranchProfile: LocalBranchProfile = {
  branchId: 'BR-SH-001',
  branchName: '上海分公司',
  
  // 核心成绩单
  currentScore: 78,
  rank: 35,
  totalBranches: 45,
  
  // 趋势与画像
  scoreTrend: [
    { period: '2025 Q2', score: 88, companyAverage: 85 },
    { period: '2025 Q3', score: 85, companyAverage: 86 },
    { period: '2025 Q4', score: 81, companyAverage: 87 },
    { period: '2026 Q1', score: 78, companyAverage: 88 },
  ],
  
  radarData: [
    { dimensionName: '员工执业行为', fullScore: 100, actualScore: 85 },
    { dimensionName: '内控管理', fullScore: 100, actualScore: 90 },
    { dimensionName: '信息安全', fullScore: 100, actualScore: 88 },
    { dimensionName: '反洗钱', fullScore: 100, actualScore: 45 }, // Significantly lower to highlight weakness
    { dimensionName: '适当性管理', fullScore: 100, actualScore: 82 },
  ],
  
  // 预警与行动
  urgency: {
    daysToNextSubmission: 3, // Critical warning
    overdueIssuesCount: 2,
    highRiskIssuesCount: 1,
    expiringTasksCount: 4,
  }
};
