import { WorkingPaper, ExecutionStats } from '../../types';

const now = Date.now();
const days = (n: number) => n * 24 * 60 * 60 * 1000;
const formatDate = (timestamp: number) => new Date(timestamp).toISOString();

export const mockWorkingPapers: WorkingPaper[] = [
  {
    id: 'WP-2026-001',
    planId: 'IP-2026-001',
    paperCode: 'WP-2026-001',
    title: '三方存管签约规范性',
    category: '业务合规',
    inspector: '张建国',
    guidelines: [
      '核查客户三方存管协议签署是否完整',
      '确认是否存在员工违规代签协议的情况',
      '核对系统登记的存管银行账户与协议是否一致'
    ],
    procedure: '1. 从集中交易系统导出本季度新开户清单；2. 随机抽取50户调阅纸质/电子档案；3. 交叉比对协议签名与身份证件。',
    executionRecord: '现场抽查了2026年Q1新开户的50份档案，三方存管协议签署完整，要素齐全，系统登记信息与协议内容一致，未发现违规代签或漏签情况。',
    result: 'NO_ISSUE',
    evidenceList: [],
    isConvertedToIssue: false,
    updateTime: formatDate(now - days(2))
  },
  {
    id: 'WP-2026-002',
    planId: 'IP-2026-001',
    paperCode: 'WP-2026-002',
    title: '员工违规代客理财排查',
    category: '执业行为',
    inspector: '李明',
    guidelines: [
      '对比员工名下通讯工具、设备IP/MAC地址是否与客户交易终端重合',
      '核查员工是否存在向客户承诺收益的聊天记录',
      '排查员工银行账户与客户是否存在异常资金往来'
    ],
    procedure: '1. 提取营业部全体员工及配偶的银行流水；2. 运行MAC/IP地址重合度筛查模型；3. 调阅可疑人员的工作手机微信记录。',
    executionRecord: '通过系统数据筛查，发现理财经理王某某的工作电脑MAC地址与客户李某的交易终端MAC地址在近一个月内存在15次重合。进一步核查工作微信，发现存在“保证年化收益8%”等违规承诺话术，存在代客理财嫌疑。',
    result: 'DEFICIENCY',
    evidenceList: [
      {
        id: 'EVI-001',
        fileName: 'MAC地址重合度筛查报告.pdf',
        fileSize: '1.5MB',
        uploadTime: formatDate(now - days(1))
      },
      {
        id: 'EVI-002',
        fileName: '王某某工作微信聊天截图.png',
        fileSize: '850KB',
        uploadTime: formatDate(now - days(1))
      }
    ],
    isConvertedToIssue: false,
    updateTime: formatDate(now - days(1))
  },
  {
    id: 'WP-2026-003',
    planId: 'IP-2026-001',
    paperCode: 'WP-2026-003',
    title: '反洗钱客户身份识别(KYC)',
    category: '反洗钱',
    inspector: '王芳',
    guidelines: [
      '核查高风险客户是否按期进行强化尽职调查',
      '核查身份证件过期的客户是否在90天内更新，逾期是否采取限制措施',
      '核查非自然人客户的受益所有人识别是否穿透至25%以上股权的自然人'
    ],
    procedure: '1. 导出身份证件过期超90天客户清单及账户限制状态；2. 抽取20户高风险客户档案查阅尽调报告；3. 抽取10户机构客户核对受益所有人穿透图谱。',
    executionRecord: '抽查高风险客户20户，其中3户（客户号：883921, 883925, 884102）身份证件过期已超过90天，但营业部未按规定采取“限制资金转出”等管控措施，且未在系统中补充最新的尽调记录。',
    result: 'DEFICIENCY',
    evidenceList: [
      {
        id: 'EVI-003',
        fileName: '证件过期未限制账户清单.xlsx',
        fileSize: '420KB',
        uploadTime: formatDate(now - days(3))
      }
    ],
    isConvertedToIssue: true,
    relatedIssueId: 'ISS-2026-041',
    updateTime: formatDate(now - days(3))
  },
  {
    id: 'WP-2026-004',
    planId: 'IP-2026-001',
    paperCode: 'WP-2026-004',
    title: '适当性管理及双录规范性',
    category: '业务合规',
    inspector: '张建国',
    guidelines: [
      '核查购买高风险理财产品的客户风险等级是否匹配',
      '核查双录（录音录像）视频是否完整，话术是否规范',
      '核查是否存在诱导客户修改风险测评问卷的情况'
    ],
    procedure: '1. 抽取本季度代销金融产品（R4及以上）交易记录50笔；2. 调阅对应的双录视频及风险测评问卷；3. 检查双录质检台账。',
    executionRecord: '',
    result: 'PENDING',
    evidenceList: [],
    isConvertedToIssue: false,
    updateTime: formatDate(now)
  },
  {
    id: 'WP-2026-005',
    planId: 'IP-2026-001',
    paperCode: 'WP-2026-005',
    title: '融资融券强制平仓执行情况',
    category: '信用业务',
    inspector: '李明',
    guidelines: [
      '核查维持担保比例低于130%的客户是否及时发送追保通知',
      '核查T+2日未追加担保物的客户是否严格执行强制平仓',
      '核查强平操作是否符合公司规定的平仓顺序和比例'
    ],
    procedure: '1. 导出本季度维持担保比例低于130%的预警清单；2. 核对短信/电话通知记录；3. 核对强平交易流水。',
    executionRecord: '经核查系统数据及营业部台账，该营业部本季度未发生维持担保比例低于130%的客户，未发生融资融券强制平仓业务，故本项不适用。',
    result: 'NOT_APPLICABLE',
    evidenceList: [],
    isConvertedToIssue: false,
    updateTime: formatDate(now - days(4))
  },
  {
    id: 'WP-2026-006',
    planId: 'IP-2026-001',
    paperCode: 'WP-2026-006',
    title: '客户回访制度落实情况',
    category: '内控合规',
    inspector: '王芳',
    guidelines: [
      '核查新开户客户是否在规定时间内完成回访',
      '核查回访内容是否包含风险揭示、密码安全提示等核心要素',
      '核查回访失败的客户是否采取了后续跟进措施'
    ],
    procedure: '1. 导出客服中心本季度新开户回访明细表；2. 随机抽取30条回访录音进行试听；3. 检查回访失败客户的限制措施。',
    executionRecord: '核查了客服中心的回访台账及30条回访录音，新开户回访率达到100%，回访话术规范，风险揭示充分，未发现违规情况。',
    result: 'NO_ISSUE',
    evidenceList: [],
    isConvertedToIssue: false,
    updateTime: formatDate(now - days(1))
  },
  {
    id: 'WP-2026-007',
    planId: 'IP-2026-001',
    paperCode: 'WP-2026-007',
    title: '印章与合同管理',
    category: '内控合规',
    inspector: '张建国',
    guidelines: [
      '核查营业部公章、业务专用章是否实行双人分管',
      '核查用印登记簿记录是否完整，审批流程是否合规',
      '核查空白合同的领用、作废登记是否规范'
    ],
    procedure: '1. 现场盘点印章及保险柜；2. 抽查近三个月的用印登记簿及对应的OA审批单；3. 盘点空白合同库存。',
    executionRecord: '',
    result: 'PENDING',
    evidenceList: [],
    isConvertedToIssue: false,
    updateTime: formatDate(now)
  },
  {
    id: 'WP-2026-008',
    planId: 'IP-2026-001',
    paperCode: 'WP-2026-008',
    title: '异常交易监控与报告',
    category: '反洗钱',
    inspector: '李明',
    guidelines: [
      '核查反洗钱系统预警的异常交易是否及时人工甄别',
      '核查确认为可疑交易的，是否在5个工作日内上报',
      '核查甄别排除的理由是否充分合理'
    ],
    procedure: '1. 从反洗钱系统导出本季度预警任务清单；2. 抽查50笔人工甄别记录；3. 核对重点可疑交易的上报时间节点。',
    executionRecord: '发现2笔大额可疑交易（交易流水号：TX99281, TX99305）在人工甄别确认为可疑后，未在规定的5个工作日内上报总部反洗钱中心，存在迟报现象。',
    result: 'DEFICIENCY',
    evidenceList: [
      {
        id: 'EVI-004',
        fileName: '可疑交易迟报明细表.pdf',
        fileSize: '310KB',
        uploadTime: formatDate(now - days(2))
      }
    ],
    isConvertedToIssue: false,
    updateTime: formatDate(now - days(2))
  }
];

export const calculateStats = (papers: WorkingPaper[]): ExecutionStats => {
  return {
    total: papers.length,
    completed: papers.filter(p => p.result !== 'PENDING').length,
    deficiencyFound: papers.filter(p => p.result === 'DEFICIENCY').length,
    noIssue: papers.filter(p => p.result === 'NO_ISSUE').length,
  };
};
