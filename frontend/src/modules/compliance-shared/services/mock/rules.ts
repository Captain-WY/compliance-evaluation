import { Indicator, AssessmentScheme } from '../../types';

export const mockIndicators: Indicator[] = [
  {
    id: 'IND-001',
    code: 'AML-01',
    name: '反洗钱大额及可疑交易报送及时率',
    category: '反洗钱',
    dataType: 'PERCENTAGE',
    defaultWeight: 15,
    scoringRules: [
      { id: 'R-001', minVal: 100, maxVal: 100, scoreEffect: 'DIRECT', points: 15, description: '报送及时率100%，得满分' },
      { id: 'R-002', minVal: 90, maxVal: 99.99, scoreEffect: 'DEDUCTION', points: 5, description: '及时率在90%-100%之间，扣5分' },
      { id: 'R-003', minVal: 0, maxVal: 89.99, scoreEffect: 'DIRECT', points: 0, description: '及时率低于90%，该项不得分' }
    ]
  },
  {
    id: 'IND-002',
    code: 'AML-02',
    name: '客户身份识别(KYC)完成率',
    category: '反洗钱',
    dataType: 'PERCENTAGE',
    defaultWeight: 10,
    scoringRules: [
      { id: 'R-004', minVal: 95, maxVal: 100, scoreEffect: 'DIRECT', points: 10, description: '完成率≥95%，得满分' },
      { id: 'R-005', minVal: 0, maxVal: 94.99, scoreEffect: 'DEDUCTION', points: 2, description: '每低于1%扣2分，扣完为止' }
    ]
  },
  {
    id: 'IND-003',
    code: 'EDU-01',
    name: '合规宣导及培训次数',
    category: '合规文化',
    dataType: 'NUMBER',
    defaultWeight: 5,
    scoringRules: [
      { id: 'R-006', minVal: 12, maxVal: 999, scoreEffect: 'DIRECT', points: 5, description: '年度培训≥12次，得满分' },
      { id: 'R-007', minVal: 0, maxVal: 11, scoreEffect: 'DEDUCTION', points: 1, description: '少于12次，每少1次扣1分' }
    ]
  },
  {
    id: 'IND-004',
    code: 'SRV-01',
    name: '客户投诉结案率',
    category: '客户服务',
    dataType: 'PERCENTAGE',
    defaultWeight: 10,
    scoringRules: [
      { id: 'R-008', minVal: 100, maxVal: 100, scoreEffect: 'DIRECT', points: 10, description: '结案率100%，得满分' },
      { id: 'R-009', minVal: 0, maxVal: 99.99, scoreEffect: 'DIRECT', points: 0, description: '存在未结案投诉，该项不得分' }
    ]
  },
  {
    id: 'IND-005',
    code: 'EMP-01',
    name: '员工违规代客理财事件',
    category: '员工行为',
    dataType: 'NUMBER',
    defaultWeight: 20,
    scoringRules: [
      { id: 'R-010', minVal: 0, maxVal: 0, scoreEffect: 'DIRECT', points: 20, description: '未发生违规事件，得满分' },
      { id: 'R-011', minVal: 1, maxVal: 999, scoreEffect: 'DIRECT', points: 0, description: '发生1起及以上，该项不得分（一票否决）' }
    ]
  },
  {
    id: 'IND-006',
    code: 'EMP-02',
    name: '员工异常交易排查覆盖率',
    category: '员工行为',
    dataType: 'PERCENTAGE',
    defaultWeight: 10,
    scoringRules: [
      { id: 'R-012', minVal: 100, maxVal: 100, scoreEffect: 'DIRECT', points: 10, description: '排查覆盖率100%，得满分' },
      { id: 'R-013', minVal: 0, maxVal: 99.99, scoreEffect: 'DEDUCTION', points: 5, description: '未达100%，直接扣5分' }
    ]
  },
  {
    id: 'IND-007',
    code: 'CTRL-01',
    name: '印章及空白合同管理规范性',
    category: '内控管理',
    dataType: 'BOOLEAN',
    defaultWeight: 10,
    scoringRules: [
      { id: 'R-014', minVal: 1, maxVal: 1, scoreEffect: 'DIRECT', points: 10, description: '规范（True），得满分' },
      { id: 'R-015', minVal: 0, maxVal: 0, scoreEffect: 'DIRECT', points: 0, description: '不规范（False），不得分' }
    ]
  },
  {
    id: 'IND-008',
    code: 'CTRL-02',
    name: '监管报表报送差错次数',
    category: '内控管理',
    dataType: 'NUMBER',
    defaultWeight: 10,
    scoringRules: [
      { id: 'R-016', minVal: 0, maxVal: 0, scoreEffect: 'DIRECT', points: 10, description: '无差错，得满分' },
      { id: 'R-017', minVal: 1, maxVal: 999, scoreEffect: 'DEDUCTION', points: 2, description: '每发生1次差错扣2分' }
    ]
  },
  {
    id: 'IND-009',
    code: 'BIZ-01',
    name: '适当性双录视频抽检合格率',
    category: '业务合规',
    dataType: 'PERCENTAGE',
    defaultWeight: 10,
    scoringRules: [
      { id: 'R-018', minVal: 98, maxVal: 100, scoreEffect: 'DIRECT', points: 10, description: '合格率≥98%，得满分' },
      { id: 'R-019', minVal: 0, maxVal: 97.99, scoreEffect: 'DEDUCTION', points: 1, description: '每低于1%扣1分' }
    ]
  },
  {
    id: 'IND-010',
    code: 'BIZ-02',
    name: '创新业务合规评估报备率',
    category: '业务合规',
    dataType: 'PERCENTAGE',
    defaultWeight: 5,
    scoringRules: [
      { id: 'R-020', minVal: 100, maxVal: 100, scoreEffect: 'DIRECT', points: 5, description: '100%报备，得满分' },
      { id: 'R-021', minVal: 0, maxVal: 99.99, scoreEffect: 'DIRECT', points: 0, description: '未达100%，不得分' }
    ]
  },
  {
    id: 'IND-011',
    code: 'BONUS-01',
    name: '获监管部门表彰或表扬',
    category: '加分项',
    dataType: 'NUMBER',
    defaultWeight: 0,
    scoringRules: [
      { id: 'R-022', minVal: 1, maxVal: 999, scoreEffect: 'BONUS', points: 2, description: '每次表彰加2分，最高加5分' }
    ]
  }
];

export const mockSchemes: AssessmentScheme[] = [
  {
    id: 'SCH-2026-001',
    title: '2026年度分支机构综合合规考核',
    period: '2026_ANNUAL',
    targetGroups: ['所有营业部', '分公司'],
    status: 'ACTIVE',
    updatedAt: '2026-01-05T10:00:00Z',
    items: [
      { indicatorId: 'IND-001', actualWeight: 15 }, // 反洗钱报送
      { indicatorId: 'IND-002', actualWeight: 10 }, // KYC
      { indicatorId: 'IND-003', actualWeight: 5 },  // 培训
      { indicatorId: 'IND-004', actualWeight: 10 }, // 投诉
      { indicatorId: 'IND-005', actualWeight: 20 }, // 代客理财
      { indicatorId: 'IND-006', actualWeight: 10 }, // 异常交易排查
      { indicatorId: 'IND-007', actualWeight: 10 }, // 印章管理
      { indicatorId: 'IND-008', actualWeight: 10 }, // 报表差错
      { indicatorId: 'IND-009', actualWeight: 10 }, // 双录合格率
      // Total: 15+10+5+10+20+10+10+10+10 = 100
    ]
  },
  {
    id: 'SCH-2026-002',
    title: '2026年Q1财富管理条线专项考核',
    period: '2026_Q1',
    targetGroups: ['财富管理中心', '重点营业部'],
    status: 'DRAFT',
    updatedAt: '2026-03-20T14:30:00Z',
    items: [
      { indicatorId: 'IND-005', actualWeight: 30 }, // 代客理财 (重点)
      { indicatorId: 'IND-009', actualWeight: 30 }, // 双录合格率 (重点)
      { indicatorId: 'IND-004', actualWeight: 20 }, // 投诉结案率
      { indicatorId: 'IND-006', actualWeight: 20 }, // 异常交易排查
      // Total: 30+30+20+20 = 100
    ]
  }
];

export function validateSchemeWeight(scheme: AssessmentScheme): boolean {
  const totalWeight = scheme.items.reduce((sum, item) => sum + item.actualWeight, 0);
  return totalWeight === 100;
}
