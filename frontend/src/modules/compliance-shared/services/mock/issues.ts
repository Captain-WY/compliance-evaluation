import { ComplianceIssue } from '../../types';

// Helper function to calculate dynamic dates relative to now
const days = (n: number) => n * 24 * 60 * 60 * 1000;
const now = Date.now();

export const mockIssues: ComplianceIssue[] = [
  {
    id: '1',
    issueCode: 'ISS-2026-001',
    title: '自营业务异常交易监控阈值设置不合理',
    sourceProject: '2026年一季度自营业务专项检查',
    businessLine: '自营业务',
    responsibleDept: '自营投资部',
    riskLevel: 'HIGH',
    status: 'PENDING_RECTIFICATION',
    discoveryDate: new Date(now - days(30)).toISOString(),
    // Strictly OVERDUE: -5 days
    slaDeadline: new Date(now - days(5)).toISOString(),
    description: '系统监控阈值未根据最新监管要求进行动态调整，导致部分异常交易未能及时拦截。',
    rectificationAdvice: '立即更新交易监控系统阈值参数，并回溯排查近三个月交易记录。',
    basisRule: '《证券基金经营机构合规管理办法》'
  },
  {
    id: '2',
    issueCode: 'ISS-2026-002',
    title: '高风险客户尽职调查(EDD)更新不及时',
    sourceProject: '2026年反洗钱专项现场检查',
    businessLine: '财富管理',
    responsibleDept: '上海分公司',
    riskLevel: 'MEDIUM',
    status: 'PENDING_RECTIFICATION',
    discoveryDate: new Date(now - days(15)).toISOString(),
    // EXPIRING SOON: +2 days
    slaDeadline: new Date(now + days(2)).toISOString(),
    description: '抽查发现3名高风险客户的尽职调查资料已过期超过6个月，未按要求进行重新识别，存在洗钱风险隐患。',
    rectificationAdvice: '限期完成上述客户的身份重新识别，并优化系统预警逻辑。',
    basisRule: '《金融机构客户尽职调查和客户身份资料及交易记录保存管理办法》'
  },
  {
    id: '3',
    issueCode: 'ISS-2026-003',
    title: '投行项目底稿归档不完整',
    sourceProject: '2025年度投行业务质量控制检查',
    businessLine: '投资银行',
    responsibleDept: '投资银行一部',
    riskLevel: 'MEDIUM',
    status: 'PENDING_VERIFICATION',
    discoveryDate: new Date(now - days(45)).toISOString(),
    // UNDER REVIEW: +10 days
    slaDeadline: new Date(now + days(10)).toISOString(),
    description: '某IPO项目工作底稿中缺失部分财务核查凭证原件扫描件，且签字审批流程不完整。',
    rectificationAdvice: '补充收集并上传缺失的核查凭证，质控部进行复核。',
    basisRule: '《保荐人尽职调查工作准则》'
  },
  {
    id: '4',
    issueCode: 'ISS-2026-004',
    title: '资管产品宣传推介材料未包含风险揭示',
    sourceProject: '资管新规落实情况例行检查',
    businessLine: '资产管理',
    responsibleDept: '资产管理部',
    riskLevel: 'LOW',
    status: 'CLOSED',
    discoveryDate: new Date(now - days(60)).toISOString(),
    // CLOSED: Past deadline
    slaDeadline: new Date(now - days(20)).toISOString(),
    description: '某固收+产品宣传单页底部风险提示字体过小，不符合醒目要求。',
    rectificationAdvice: '重新设计并印制宣传材料，废止旧版材料。',
    basisRule: '《公开募集证券投资基金宣传推介材料管理暂行规定》'
  },
  {
    id: '5',
    issueCode: 'ISS-2026-005',
    title: '员工违规代客理财及出借账户',
    sourceProject: '员工执业行为专项排查',
    businessLine: '财富管理',
    responsibleDept: '深圳营业部',
    riskLevel: 'HIGH',
    status: 'PENDING_RECTIFICATION',
    discoveryDate: new Date(now - days(10)).toISOString(),
    // Normal pending: +5 days
    slaDeadline: new Date(now + days(5)).toISOString(),
    description: '排查发现理财顾问张某存在私下接受客户委托买卖证券的行为，且涉嫌出借个人证券账户。',
    rectificationAdvice: '立即暂停该员工执业权限，启动内部问责程序，并向属地证监局报告。',
    basisRule: '《证券经纪人管理暂行规定》'
  },
  {
    id: '6',
    issueCode: 'ISS-2026-006',
    title: '信息系统灾备演练未覆盖核心交易节点',
    sourceProject: '信息技术合规专项检查',
    businessLine: '自营业务',
    responsibleDept: '信息技术中心',
    riskLevel: 'HIGH',
    status: 'PENDING_VERIFICATION',
    discoveryDate: new Date(now - days(20)).toISOString(),
    // Under review: +15 days
    slaDeadline: new Date(now + days(15)).toISOString(),
    description: '年度灾备演练计划中，未将最新上线的量化交易网关纳入切换演练范围。',
    rectificationAdvice: '补充制定专项演练方案并于本月底前完成演练。',
    basisRule: '《证券基金经营机构信息技术管理办法》'
  }
];
