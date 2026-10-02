/**
 * Case Service - Unified exports
 *
 * Uses real API for data operations, with mock fallback for features not yet implemented
 */
// 3.S11: 财务看板跨案件适配器 — 调用路径独立于 caseApi（不同权限模型）
import { financeBoardApi } from '../src/services/api/financeBoardApi';
// 3.S12: 资产保全台账适配器
import { assetPreservationApi } from '../src/services/api/assetPreservationApi';
// 3.S13: 合规中心适配器
import { complianceBffApi } from '../src/services/api/complianceBffApi';

// Import real API
import { caseApi } from '../src/services/api/caseApi';
import type { CaseStats, PaginatedSearchResult, SearchIssueItem } from '../src/services/api/caseApi';

// WP-AI-02: AI 案件辅助能力 API
import { caseAiApi } from '../src/services/api/caseAiApi';
import type { StrategyRecommendResponse, SimilarCaseItem } from '../src/types/api/caseAi';

// Import mock for features not yet implemented in backend
import * as caseActivity from './mock/caseActivity';
import * as caseClosing from './mock/caseClosing';

import { Case, IssueType, CaseType, RiskLevel, CaseStage, CaseParty, ConflictWarning, FinancialRecord, BusinessLine, CaseStrategy } from '../types';

// Adapter to reshape backend responses into the legacy BaseIssue/Case UI structures
const convertCaseStage = (code: string | undefined | null): CaseStage => {
  const map: Record<string, CaseStage> = {
    'CLUE': CaseStage.CLUE,
    'PRE_LITIGATION': CaseStage.FILING,
    'FILING': CaseStage.FILING,
    'ARBITRATION': CaseStage.ARBITRATION,
    'FIRST_INSTANCE': CaseStage.FIRST_INSTANCE,
    'SECOND_INSTANCE': CaseStage.SECOND_INSTANCE,
    'RETRIAL': CaseStage.SECOND_INSTANCE,
    'ENFORCEMENT': CaseStage.ENFORCEMENT,
    'SUSPENDED': CaseStage.ENFORCEMENT,
    'CLOSED': CaseStage.CLOSED,
  };
  return (code && map[code]) || CaseStage.CLUE;
};

const ADMIN_CASE_TYPES = new Set(['ADMINISTRATIVE_LITIGATION', 'ADMINISTRATIVE_SUPERVISION']);

// Backend business_line dict codes → frontend BusinessLine enum values
const BACKEND_CODE_TO_BUSINESS_LINE: Record<string, BusinessLine> = {
  'INVESTMENT_BANKING': BusinessLine.IB,
  'IB': BusinessLine.IB,
  'PROP_TRADING': BusinessLine.PROPRIETARY,
  'PROPRIETARY': BusinessLine.PROPRIETARY,
  'BROKERAGE': BusinessLine.BROKERAGE,
  'ASSET_MANAGEMENT': BusinessLine.ASSET_MGMT,
  'ASSET_MGMT': BusinessLine.ASSET_MGMT,
  'CREDIT': BusinessLine.CREDIT,
  'WEALTH_MANAGEMENT': BusinessLine.WEALTH_MGMT,
  'RESEARCH': BusinessLine.RESEARCH,
  'CUSTODY': BusinessLine.CUSTODY,
  'DERIVATIVES': BusinessLine.DERIVATIVES,
  'INTERNATIONAL': BusinessLine.INTERNATIONAL,
  'OTHER_LINE': BusinessLine.OTHER,
  'SUPPORT': BusinessLine.SUPPORT,
  // Chinese labels (fallback for already-mapped data)
  '投资银行': BusinessLine.IB,
  '自营投资': BusinessLine.PROPRIETARY,
  '经纪业务': BusinessLine.BROKERAGE,
  '资产管理': BusinessLine.ASSET_MGMT,
  '信用业务': BusinessLine.CREDIT,
  '财富管理': BusinessLine.WEALTH_MGMT,
  '研究所': BusinessLine.RESEARCH,
  '托管业务': BusinessLine.CUSTODY,
  '衍生品业务': BusinessLine.DERIVATIVES,
  '国际业务': BusinessLine.INTERNATIONAL,
  '其他': BusinessLine.OTHER,
  '职能支持': BusinessLine.SUPPORT,
};

function resolveBusinessLine(raw?: string | null): BusinessLine {
  if (!raw) return BusinessLine.IB;
  return BACKEND_CODE_TO_BUSINESS_LINE[raw] ?? BusinessLine.IB;
}

// ==================== BFF 参数构建器 ====================

// CaseStage 中文显示值 → backend current_stage_code
const STAGE_LABEL_TO_CODE: Record<string, string> = {
  '线索': 'CLUE',
  '立案': 'FILING',
  '一审': 'FIRST_INSTANCE',
  '二审': 'SECOND_INSTANCE',
  '执行': 'ENFORCEMENT',
  '已结案': 'CLOSED',
  '仲裁': 'ARBITRATION',
  '行政听证': 'ADMIN_HEARING',
  '已归档': 'CLOSED',
};

// RiskLevel 中文显示值 → backend risk_level code
const RISK_LABEL_TO_CODE: Record<string, string> = {
  '特大': 'CRITICAL',
  '重大': 'MAJOR',
  '较大': 'IMPORTANT',
  '关注': 'IMPORTANT',
  '一般': 'GENERAL',
  '轻微': 'MINOR',
  // 兼容 enum key 直接透传
  'CRITICAL': 'CRITICAL',
  'HIGH': 'MAJOR',
  'MEDIUM': 'IMPORTANT',
  'LOW': 'GENERAL',
};

// BusinessLine 中文显示值 → backend business_line code
const BIZ_LABEL_TO_CODE: Record<string, string> = {
  '投资银行': 'INVESTMENT_BANKING',
  '资产管理': 'ASSET_MANAGEMENT',
  '经纪业务': 'BROKERAGE',
  '财富管理': 'WEALTH_MANAGEMENT',
  '自营投资': 'PROP_TRADING',
  '研究所': 'RESEARCH',
  '托管业务': 'CUSTODY',
  '衍生品业务': 'DERIVATIVES',
  '国际业务': 'INTERNATIONAL',
  '信用业务': 'BROKERAGE',  // 前端枚举中存在，映射到最近的后端 code
  '职能支持': 'OTHER_LINE',
  '其他': 'OTHER_LINE',
};

// 前端 ProcedureType 值 → backend case_type_code 列表
// SECURITIES_DISPUTE 归入民事诉讼（证券纠纷本质为民事诉讼程序）
const PROCEDURE_TO_CASE_TYPE: Record<string, string[]> = {
  'CIVIL_LITIGATION': ['CIVIL_LITIGATION', 'SECURITIES_DISPUTE'],
  'ARBITRATION': ['COMMERCIAL_ARBITRATION'],
  'ADMIN': ['ADMINISTRATIVE_LITIGATION', 'ADMINISTRATIVE_SUPERVISION'],
  'LABOR': ['LABOR_DISPUTE'],
};

/**
 * 将前端 baseFilterParams（GET 风格 snake_case 单值，含中文枚举值）转换为 BFF POST body。
 * 注意：axios 请求拦截器会把 camelCase key 转为 snake_case，因此 body 需用 camelCase。
 */
const buildBffFilter = (params: Record<string, any>) => {
  const toCode = (val: any, map: Record<string, string>): string | null => {
    if (!val || val === 'ALL') return null;
    return map[val] || val;  // 无匹配时原值透传（已是 code）
  };

  // case_status 来自前端 stage 筛选，实际是 current_stage_code
  const stageCode = toCode(params.case_status, STAGE_LABEL_TO_CODE);
  const riskCode = toCode(params.risk_level, RISK_LABEL_TO_CODE);
  const bizCode = toCode(params.business_line, BIZ_LABEL_TO_CODE);
  const caseTypeCodes = params.procedure_type && params.procedure_type !== 'ALL'
    ? (PROCEDURE_TO_CASE_TYPE[params.procedure_type] || [params.procedure_type])
    : null;

  return {
    keyword: params.keyword || null,
    currentStageCode: stageCode ? [stageCode] : null,
    riskLevel: riskCode ? [riskCode] : null,
    businessLine: bizCode ? [bizCode] : null,
    caseTypeCode: caseTypeCodes,
    dateStart: params.date_start || null,
    dateEnd: params.date_end || null,
  };
};

const SORT_FIELD_MAP: Record<string, string> = {
  created_at: 'created_at',
  target_amount: 'target_amount',
  filing_date: 'filing_date',
  close_date: 'close_date',
  internal_case_no: 'internal_case_no',
};

const convertRiskLevel = (code: string): RiskLevel => {
  const map: Record<string, RiskLevel> = {
    'MAJOR': RiskLevel.HIGH,
    'IMPORTANT': RiskLevel.MEDIUM,
    'GENERAL': RiskLevel.LOW,
    'MINOR': RiskLevel.LOW,
    // 兼容旧映射
    'LOW': RiskLevel.LOW,
    'MEDIUM': RiskLevel.MEDIUM,
    'HIGH': RiskLevel.HIGH,
    'CRITICAL': RiskLevel.CRITICAL,
  };
  return map[code] || RiskLevel.LOW;
};

const adaptCases = (items: any[]): Case[] => {
  return items.map((c: any) => ({
    id: c.id,
    key: c.internalCaseNo || c.id?.substring(0, 8) || 'Unknown',
    issueType: IssueType.CASE,
    caseType: CaseType.STANDARD,
    title: c.caseName || '未命名案件',
    status: c.caseStatus === 'CLOSED' ? CaseStage.CLOSED : convertCaseStage(c.currentStageCode),
    stage: convertCaseStage(c.currentStageCode),
    priority: convertRiskLevel(c.riskLevel),
    assignee: c.handlingLawyerId || '待分配',
    createdAt: c.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    code: c.internalCaseNo,
    externalCaseNo: c.externalCaseNo || undefined,
    businessLine: resolveBusinessLine(c.businessLine || c.business_line),
    cause: c.caseCause || c.causeOfAction || c.causeOfActionName || '',
    riskLevel: convertRiskLevel(c.riskLevel),
    plaintiff: c.plaintiffName || '',
    defendant: c.defendantName || '',
    court: c.acceptingCourt || '',
    filingDate: c.filingDate || '',
    nextDeadline: c.filingDate || undefined,
    procedureType: ADMIN_CASE_TYPES.has(c.caseTypeCode || '') ? 'ADMIN' : 'CIVIL_LITIGATION',
    // 台账字段
    targetSubject: c.targetSubject || undefined,
    ourRole: (c.ourRoleName || c.ourRole) as any,
    provisionAmount: c.provisionAmount ? Number(c.provisionAmount) : undefined,
    judge: c.presidingJudge ? { name: c.presidingJudge } : undefined,
    lawyerId: c.handlingLawyerId || undefined,
    regulatoryAttrs: {
      amountNoInterest: c.targetAmount ? Number(c.targetAmount) : 0,
      amountWithInterest: c.targetAmount ? Number(c.targetAmount) : 0,
      regCaseCode: '',
      regCauseName: '',
      sector: '主板',
      isInvestorProtection: false,
      isMajor: false,
      estimatedRiskCapitalDeduction: c.extendedData?.estimatedRiskCapitalDeduction
        ?? c.extended_data?.estimatedRiskCapitalDeduction
        ?? 0,
    }
  } as Case));
};

/** 将 searchIssues 返回的 item 适配为 Case UI 结构 */
const adaptSearchItems = (items: SearchIssueItem[]): Case[] => {
  return items.map((c) => ({
    id: c.id,
    key: c.code || c.id?.substring(0, 8) || 'Unknown',
    issueType: IssueType.CASE,
    caseType: CaseType.STANDARD,
    title: c.title || '未命名案件',
    status: c.status === 'CLOSED' ? CaseStage.CLOSED : convertCaseStage(c.stage),
    stage: convertCaseStage(c.stage),
    priority: convertRiskLevel(c.riskLevel),
    assignee: c.assigneeId || '待分配',
    createdAt: c.createdAt || new Date().toISOString(),
    updatedAt: c.updatedAt || new Date().toISOString(),
    code: c.code,
    businessLine: resolveBusinessLine(c.businessLine),
    cause: c.causeOfAction || '',
    riskLevel: convertRiskLevel(c.riskLevel),
    plaintiff: c.plaintiffName || '',
    defendant: c.defendantName || '',
    court: c.acceptingCourt || '',
    filingDate: c.filingDate || '',
    nextDeadline: c.filingDate || undefined,
    procedureType: c.procedureType || '',
    regulatoryAttrs: {
      amountNoInterest: c.targetAmount || 0,
      amountWithInterest: c.targetAmount || 0,
      regCaseCode: '',
      regCauseName: '',
      sector: '主板',
      isInvestorProtection: false,
      isMajor: false,
      estimatedRiskCapitalDeduction: 0,
    }
  } as Case));
};

// 2.S2.a: 从 BFF drawer/summary CASE 响应构造前端 Case 结构.
// 与 adaptCases() 一样产出 Case, 但字段源是 CaseDrawerVO 而非 list view item.
const adaptDrawerCaseToCase = (raw: any): Case => {
  const ext = raw.extendedData || {};
  const reg = ext.regulatory || {};
  // caseType: 根据主子案关联推导
  const caseType: CaseType = (raw.isMainCase && !raw.mainCaseId)
    ? CaseType.SERIES_MASTER
    : raw.mainCaseId
      ? CaseType.SERIES_CHILD
      : CaseType.STANDARD;
  return {
    id: raw.id,
    key: raw.code || raw.id?.substring(0, 8) || 'Unknown',
    issueType: IssueType.CASE,
    caseType,
    title: raw.title || '未命名案件',
    status: raw.caseStatus === 'CLOSED' ? CaseStage.CLOSED : convertCaseStage(raw.stageCode),
    stage: convertCaseStage(raw.stageCode),
    priority: convertRiskLevel(raw.riskLevel),
    assignee: raw.assignee || raw.handlingLawyerId || '待分配',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    code: raw.code,
    externalCaseNo: undefined,
    businessLine: resolveBusinessLine(raw.businessLineName || raw.businessLine || raw.business_line),
    cause: raw.causeOfActionName || raw.causeOfAction || '',
    riskLevel: convertRiskLevel(raw.riskLevel),
    plaintiff: '',
    defendant: '',
    court: raw.acceptingCourt || '',
    filingDate: raw.filingDate || '',
    nextDeadline: raw.nextDeadline || undefined,
    procedureType: raw.procedureType || (ADMIN_CASE_TYPES.has(raw.caseTypeCode || '') ? 'ADMIN' : 'CIVIL_LITIGATION'),
    lawyerId: raw.handlingLawyerId || undefined,
    description: raw.description || undefined,
    isPilot: raw.isMainCase,
    parentId: raw.mainCaseId,
    regulatoryAttrs: {
      amountNoInterest: raw.targetAmount ? Number(raw.targetAmount) : 0,
      amountWithInterest: raw.targetAmount ? Number(raw.targetAmount) : 0,
      regCaseCode: reg.regCaseCode || '',
      regCauseName: reg.regCauseName || '',
      securityCode: reg.securityCode,
      securityName: reg.securityName,
      sector: raw.sectorName || raw.sector || '主板',
      isInvestorProtection: Boolean(raw.isInvestorProtection),
      isMajor: Boolean(raw.isMajor),
      estimatedRiskCapitalDeduction: raw.extendedData?.estimatedRiskCapitalDeduction
        ?? raw.extended_data?.estimatedRiskCapitalDeduction
        ?? 0,
    } as any,
  } as Case;
};

// 封装的独立导出函数
export const getCases = async (params: any = {page: 1, size: 1000}) => {
  const { page, size, ...rest } = params;
  const filter = buildBffFilter(rest);
  const result = await caseApi.getListViewBff({ ...filter, pagination: { page: page || 1, size: size || 1000 } });
  return adaptCases(result.cases || []);
};

// 2.S2.a: getCaseById 改走 BFF drawer/summary (CASE 变体); 旧 REST GET 已下线
export const getCaseById = async (id: string): Promise<Case | null> => {
  const raw = await caseApi.getDrawerSummaryBff(id, 'CASE');
  if (!raw || raw.itemType !== 'CASE') return null;
  return adaptDrawerCaseToCase(raw);
};

export const createCase = caseApi.createCase;

// 2.S2.a: updateCase (ProcessTimeline.stageDetails) 暂 mock 化, 真实实现由 2.S4 补齐
export const updateCase = async (id: string, data: any): Promise<Case | null> => {
  throw new Error('开发占位：此编辑尚未接入保存接口');
  return await getCaseById(id);
};

// 2.S2.a: deleteCase 暂 mock 化, 结案能力由 2.S2.b 的 /cases/close 端点承接
export const deleteCase = async (id: string): Promise<void> => {
  throw new Error('开发占位：此删除尚未接入保存接口');
};

// 2.S2.a: updateCaseStage 改走 BFF /cases/stage/change
export const updateCaseStage = async (id: string, stage: string | CaseStage): Promise<Case | null> => {
  // stage 入参可能是中文 (CaseStage enum 的 value) 或 code; 统一转 code
  const stageCode = STAGE_LABEL_TO_CODE[stage as string] || (stage as string);
  const raw = await caseApi.changeCaseStageBff(id, stageCode);
  if (!raw) return null;
  return adaptDrawerCaseToCase(raw);
};

export const updateCaseDeadline = async (id: string, deadline: string): Promise<void> => {
  await caseApi.updateCaseBaseInfoBff(id, {
    extended_data: { next_deadline: deadline },
  });
};
export const batchUpdateCaseStage = async (ids: string[], stage: string | CaseStage) => {
    for (const id of ids) await updateCaseStage(id, stage);
};
export const getCaseHistory = async (id: string) => {
  const result = await caseApi.queryActivitiesBff({
    caseId: id,
    modules: ['CASES', 'PARTIES', 'MEMBERS', 'PROCESS', 'TASK', 'DOCUMENTS', 'STAGE'],
    pagination: { page: 1, size: 50 },
  });
  return (result?.items || []).map((item: any) => ({
    id: item.id,
    caseId: item.caseId,
    operator: item.operatorName,
    timestamp: item.createdAt,
    action: item.actionType,
    details: item.actionDetail,
  }));
};

export const getCaseComments = async (id: string) => {
  const result = await caseApi.queryActivitiesBff({
    caseId: id,
    modules: ['MEMO'],
    pagination: { page: 1, size: 50 },
  });
  return (result?.items || []).map((item: any) => ({
    id: item.id,
    caseId: item.caseId,
    userId: item.operatorId,
    userName: item.operatorName,
    userRole: '',
    content: item.actionDetail,
    createdAt: item.createdAt,
    isInternal: true,
  }));
};

export const addCaseComment = async (params: {
  caseId: string;
  content: string;
  isInternal?: boolean;
  [key: string]: any;
}) => {
  await caseApi.addMemoBff({
    caseId: params.caseId,
    memoType: 'COMMENT',
    content: params.content,
    visibility: params.isInternal ? 'INTERNAL_LEGAL_ONLY' : 'PUBLIC_TO_FOLLOWERS',
  });
  return {
    id: `memo-${Date.now()}`,
    caseId: params.caseId,
    userId: '',
    userName: params.userName || '',
    userRole: params.userRole || '',
    content: params.content,
    createdAt: new Date().toISOString(),
    isInternal: params.isInternal ?? true,
  };
};

const RISK_LEVEL_TO_BACKEND: Record<string, string> = {
  '一般': 'GENERAL',
  '关注': 'IMPORTANT',
  '重大': 'MAJOR',
  '特大': 'CRITICAL',
};

export const updateCaseGeneralInfo = async (id: string, data: any) => {
  const patch: Record<string, any> = {};
  // case_name 不在 BASE_INFO_ALLOWED_FIELDS 白名单，跳过（案件名称通过立案流程修改）
  if (data.description !== undefined) patch.latest_progress = data.description;
  if (data.riskLevel !== undefined) {
    patch.risk_level = RISK_LEVEL_TO_BACKEND[data.riskLevel] || data.riskLevel;
  }
  if (data.businessLine !== undefined) patch.business_line = data.businessLine;
  if (data.court !== undefined) patch.accepting_court = data.court;
  // filing_date 不在 CaseBaseInfoPatch 白名单，跳过（走专用端点或立案流程修改）
  if (data.tags !== undefined) patch.extended_data = { tags: data.tags };
  if (Object.keys(patch).length > 0) {
    await caseApi.updateCaseBaseInfoBff(id, patch);
  }
};
export const updateRegulatoryAttributes = async (id: string, data: any) => {
  return caseApi.updateCaseBaseInfoBff(id, { extended_data: { regulatory: data } });
};
export const addCaseLink = async (id: string, data: any) => null;
export const searchCaseMemberCandidates = (q: string) => caseApi.searchMemberCandidatesBff(q);
const mapStrategyResponse = (raw: any): CaseStrategy | null => {
  if (!raw) return null;
  return {
    id: raw.id,
    caseId: raw.caseId ?? raw.case_id,
    direction: (raw.direction || '积极应诉') as CaseStrategy['direction'],
    winProbability: raw.winProbability ?? raw.win_probability ?? 50,
    analysis: raw.analysis ?? '',
    updatedAt: raw.updatedAt ?? raw.updated_at ?? new Date().toISOString(),
  };
};

export const getStrategyByCaseId = async (caseId: string): Promise<CaseStrategy | null> => {
  const raw = await caseApi.getStrategyBff(caseId);
  return mapStrategyResponse(raw);
};

export const saveStrategy = async (strategy: {
  caseId: string;
  direction: string;
  winProbability: number;
  analysis: string;
}): Promise<CaseStrategy> => {
  const raw = await caseApi.saveStrategyBff(strategy);
  const mapped = mapStrategyResponse(raw);
  if (!mapped) throw new Error('策略保存后返回空');
  return mapped;
};
export const searchIssues = async (params: { search?: string; [key: string]: any }) => {
  const result = await caseApi.searchIssues(params);
  return result.items.map(item => ({ ...item, key: item.code }));
};
export const addCaseMember = async (caseId: string, data: { userId: string; roleCode?: string }) => {
  return caseApi.manageCaseMembersBff({
    caseId,
    action: 'ADD',
    roleCode: data.roleCode || 'MEMBER',
    userIds: [data.userId],
  });
};
export const removeCaseMember = async (caseId: string, userId: string) => {
  return caseApi.manageCaseMembersBff({ caseId, action: 'REMOVE', userIds: [userId] });
};

// Export service object using real API
export const caseService = {
  // Direct Real API methods
  getCases: caseApi.getCases,
  createCase: caseApi.createCase,
  // updateCase / deleteCase: 走顶层导出的 mock 版, 真实 REST 端点已于 2.S2.a 下线
  updateCase,
  deleteCase,

  // ===== NEW: Stats & Search =====
  /** 顶部统计卡 - 全量聚合，不受分页影响，替代旧 GET /cases/stats */
  getCaseStats: async (params: Record<string, any>) => {
    const filter = buildBffFilter(params);
    return caseApi.getSummaryStatsBff(filter);
  },

  /** 全局搜索 - 返回带分页元数据的结果 */
  searchIssuesPaginated: async (params: Record<string, any>): Promise<{ items: Case[], total: number, page: number, size: number }> => {
    const result = await caseApi.searchIssues(params);
    return {
      items: adaptSearchItems(result.items),
      total: result.total,
      page: result.page,
      size: result.size,
    };
  },

  // ===== BFF 视图方法（POST /api/bff/v1/cases/views/*）=====

  /** 列表视图 - BFF POST */
  getListView: async (params: any): Promise<Case[]> => {
    const filter = buildBffFilter(params);
    const body = {
      ...filter,
      pagination: { page: params.page || 1, size: params.size || 20 },
      sortField: SORT_FIELD_MAP[params.sort_by] || 'created_at',
      sortOrder: params.sort_order || 'desc',
    };
    const result = await caseApi.getListViewBff(body);
    return adaptCases(result.cases);
  },

  /** 列表视图 - 带分页元数据 */
  getListViewPaginated: async (params: any): Promise<{ items: Case[], total: number, page: number, size: number }> => {
    const filter = buildBffFilter(params);
    const body = {
      ...filter,
      pagination: { page: params.page || 1, size: params.size || 20 },
      sortField: SORT_FIELD_MAP[params.sort_by] || 'created_at',
      sortOrder: params.sort_order || 'desc',
    };
    const result = await caseApi.getListViewBff(body);
    return { items: adaptCases(result.cases), total: result.casesTotal, page: result.casesPage, size: result.casesSize };
  },

  /** 看板视图 - BFF POST，展平 columns → items 供 CaseKanban 自行分组 */
  getKanbanViewPaginated: async (params: any): Promise<{ items: Case[], total: number, page: number, size: number }> => {
    const filter = buildBffFilter(params);
    const body = { ...filter, casesPerColumn: params.size || 500 };
    const result = await caseApi.getKanbanViewBff(body);
    const allCases = result.columns.flatMap(col => col.cases);
    const total = result.columns.reduce((sum, col) => sum + col.totalCount, 0);
    return { items: adaptCases(allCases), total, page: 1, size: allCases.length };
  },

  getKanbanView: async (params: any): Promise<Case[]> => {
    const filter = buildBffFilter(params);
    const body = { ...filter, casesPerColumn: 500 };
    const result = await caseApi.getKanbanViewBff(body);
    return adaptCases(result.columns.flatMap(col => col.cases));
  },

  /** 台账视图 - BFF POST */
  getLedgerView: async (params: any): Promise<Case[]> => {
    const filter = buildBffFilter(params);
    const body = {
      ...filter,
      pagination: { page: params.page || 1, size: params.size || 20 },
      sortField: SORT_FIELD_MAP[params.sort_by] || 'target_amount',
      sortOrder: params.sort_order || 'desc',
    };
    const result = await caseApi.getLedgerViewBff(body);
    return adaptCases(result.items);
  },

  /** 日历视图 - BFF POST，将 events 转为带 nextDeadline 的 Case 对象供 CalendarView 使用 */
  getCalendarView: async (params: any): Promise<Case[]> => {
    const d = new Date(params.date_start || new Date());
    const rangeStart = params.date_start || new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
    const rangeEnd = params.date_end || new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
    const filter = buildBffFilter(params);
    // 日历视图由后端自行处理日期范围（filing_date/close_date/process_nodes.deadline），
    // 不在 base_stmt 中做日期过滤，避免仅返回 filing_date 在范围内的案件而漏掉 close_date/deadline 匹配的案件
    const { dateStart, dateEnd, ...filterWithoutDate } = filter;
    const body = { ...filterWithoutDate, rangeStart, rangeEnd };
    const result = await caseApi.getCalendarViewBff(body);
    return result.events.map((ev, idx) => ({
      id: `${ev.caseId}_${idx}`,
      caseId: ev.caseId,
      key: ev.caseInternalNo || ev.caseId,
      issueType: IssueType.CASE,
      caseType: CaseType.STANDARD,
      title: ev.title || ev.caseName,
      status: CaseStage.FILING,
      stage: CaseStage.FILING,
      priority: convertRiskLevel(ev.riskLevel || ''),
      riskLevel: convertRiskLevel(ev.riskLevel || ''),
      assignee: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      code: ev.caseInternalNo || ev.caseId,
      businessLine: '',
      cause: '',
      plaintiff: '',
      defendant: '',
      court: '',
      filingDate: '',
      nextDeadline: ev.eventDate,
      calendarEventType: ev.eventType,
      procedureType: 'CIVIL_LITIGATION',
      regulatoryAttrs: { amountNoInterest: 0, amountWithInterest: 0, regCaseCode: '', regCauseName: '', sector: '主板', isInvestorProtection: false, isMajor: false }
    } as Case));
  },

  /** 台账视图 - BFF POST，带分页元数据和全量聚合 */
  getLedgerViewPaginated: async (params: any): Promise<{ items: Case[], total: number, page: number, size: number, aggregate: { totalTargetAmount: number } }> => {
    const filter = buildBffFilter(params);
    const body = {
      ...filter,
      pagination: { page: params.page || 1, size: params.size || 20 },
      sortField: SORT_FIELD_MAP[params.sort_by] || 'target_amount',
      sortOrder: params.sort_order || 'desc',
    };
    const result = await caseApi.getLedgerViewBff(body);
    return { items: adaptCases(result.items), total: result.total, page: result.page, size: result.size, aggregate: result.aggregate };
  },


  getCaseById,
  // changeStage: 走新 BFF /cases/stage/change (2.S2.a)
  changeStage: async (id: string, stage: CaseStage) => await updateCaseStage(id, stage),

  updateCaseStage,
  updateCaseDeadline,

  // ===== 2.S2.b: 案件详情页 (右侧栏 / 概览 / 权限 / 成员管理) =====

  /** 详情页固定右侧栏 (全局属性 + 人员矩阵) */
  getCaseSidebar: async (caseId: string) => {
    return await caseApi.getCaseDetailSidebarBff(caseId);
  },

  /** 详情页概览 Tab (基础案情 + 业务绑定 + 指标快照) */
  getCaseOverview: async (caseId: string) => {
    return await caseApi.getCaseDetailOverviewBff(caseId);
  },

  /** 当前用户对该案件的 9 键权限 (前端据此 show/hide 操作按钮) */
  getCasePermissions: async (caseId: string) => {
    return await caseApi.getCaseDetailPermissionsBff(caseId);
  },

  /** 案件成员管理 (ADD / REMOVE / SET_PRIMARY) */
  manageCaseMembers: async (params: {
    caseId: string
    action: 'ADD' | 'REMOVE' | 'SET_PRIMARY'
    roleCode?: string
    userIds: string[]
    customPermissions?: Record<string, any>
  }) => {
    return await caseApi.manageCaseMembersBff(params);
  },

  // ===== 2.S2.a: 抽屉 + 基础信息更新 =====

  /**
   * 抽屉概要 - 多态 (CASE / CLUE / EXECUTABLE_TASK)
   * 对接 POST /api/bff/v1/cases/drawer/summary
   *
   * axios 拦截器已做 snake_case → camelCase 转换. adapter 层补齐:
   *   - CASE: 从 is_main_case 推 caseType; 读取 isInvestorProtection/isMajor;
   *           回填 CasePreview 期望的 stage/riskLevel/cause 中文字段
   *   - CLUE: source ← sourceType (前端字段名差异)
   *   - EXECUTABLE_TASK: 字段直通
   */
  getDrawerSummary: async (id: string, itemType: 'CASE' | 'CLUE' | 'EXECUTABLE_TASK') => {
    const raw = await caseApi.getDrawerSummaryBff(id, itemType);
    if (!raw) return null;
    if (raw.itemType === 'CASE') {
      const ext = raw.extendedData || {};
      const reg = ext.regulatory || {};
      // 向 CasePreview 补齐 Case 风格字段, 同时保留原字段
      return {
        ...raw,
        caseType: (raw.isMainCase && !raw.mainCaseId) ? CaseType.SERIES_MASTER : (raw.mainCaseId ? CaseType.SERIES_CHILD : CaseType.STANDARD),
        stage: raw.stageName || raw.stageCode,
        riskLevelCode: raw.riskLevel,
        riskLevel: raw.riskLevelName || raw.riskLevel,
        cause: raw.causeOfActionName || raw.causeOfAction,
        businessLine: raw.businessLineName || raw.businessLine,
        court: raw.acceptingCourt,
        filingDate: raw.filingDate,
        nextDeadline: raw.nextDeadline,
        regulatoryAttrs: {
          amountNoInterest: raw.targetAmount ? Number(raw.targetAmount) : 0,
          amountWithInterest: raw.targetAmount ? Number(raw.targetAmount) : 0,
          regCaseCode: reg.regCaseCode || '',
          regCauseName: reg.regCauseName || '',
          securityCode: reg.securityCode || '',
          securityName: reg.securityName || '',
          sector: raw.sectorName || raw.sector || '主板',
          isInvestorProtection: Boolean(raw.isInvestorProtection),
          isMajor: Boolean(raw.isMajor),
          estimatedRiskCapitalDeduction: raw.extendedData?.estimatedRiskCapitalDeduction
            ?? raw.extended_data?.estimatedRiskCapitalDeduction
            ?? 0,
        },
      };
    }
    if (raw.itemType === 'CLUE') {
      return {
        ...raw,
        source: raw.sourceType,
      };
    }
    return raw;
  },

  /**
   * 基础信息局部更新
   * 对接 POST /api/bff/v1/cases/base-info/update
   */
  updateCaseBaseInfo: async (caseId: string, patch: Record<string, any>) => {
    return await caseApi.updateCaseBaseInfoBff(caseId, patch);
  },

  // Mock methods for sub-features not yet fully stripped
  ...caseActivity,
  ...caseClosing,
};

// ==================== 3.S3: 当事人 Tab ====================

export const listParties = async (caseId: string): Promise<{
  caseId: string;
  total: number;
  parties: CaseParty[];
  ourSideCount: number;
  opposingCount: number;
}> => {
  const result = await caseApi.listPartiesBff(caseId);
  return result;
};

export const addParty = async (payload: {
  caseId: string;
  partyType: string;
  isOurSide: boolean;
  partyName: string;
  identityType: string;
  identityNumber?: string;
  legalRepresentative?: string;
  contactNumber?: string;
  serviceAddress?: string;
  claimAmount?: number;
  claimDetails?: string;
  agentName?: string;
  agentLawFirm?: string;
  agentContact?: string;
  sortOrder?: number;
}): Promise<{ party: CaseParty; warnings: ConflictWarning[] }> => {
  return caseApi.addPartyBff({
    case_id: payload.caseId,
    party_type: payload.partyType,
    is_our_side: payload.isOurSide,
    party_name: payload.partyName,
    identity_type: payload.identityType,
    identity_number: payload.identityNumber,
    legal_representative: payload.legalRepresentative,
    contact_number: payload.contactNumber,
    service_address: payload.serviceAddress,
    claim_amount: payload.claimAmount,
    claim_details: payload.claimDetails,
    agent_name: payload.agentName,
    agent_law_firm: payload.agentLawFirm,
    agent_contact: payload.agentContact,
    sort_order: payload.sortOrder ?? 0,
  });
};

export const updateParty = async (partyId: string, patch: Partial<{
  partyType: string;
  isOurSide: boolean;
  partyName: string;
  identityType: string;
  identityNumber: string;
  legalRepresentative: string;
  contactNumber: string;
  serviceAddress: string;
  claimAmount: number;
  claimDetails: string;
  agentName: string;
  agentLawFirm: string;
  agentContact: string;
  sortOrder: number;
}>): Promise<CaseParty> => {
  const snakePatch: Record<string, unknown> = {};
  if (patch.partyType !== undefined) snakePatch.party_type = patch.partyType;
  if (patch.isOurSide !== undefined) snakePatch.is_our_side = patch.isOurSide;
  if (patch.partyName !== undefined) snakePatch.party_name = patch.partyName;
  if (patch.identityType !== undefined) snakePatch.identity_type = patch.identityType;
  if (patch.identityNumber !== undefined) snakePatch.identity_number = patch.identityNumber;
  if (patch.legalRepresentative !== undefined) snakePatch.legal_representative = patch.legalRepresentative;
  if (patch.contactNumber !== undefined) snakePatch.contact_number = patch.contactNumber;
  if (patch.serviceAddress !== undefined) snakePatch.service_address = patch.serviceAddress;
  if (patch.claimAmount !== undefined) snakePatch.claim_amount = patch.claimAmount;
  if (patch.claimDetails !== undefined) snakePatch.claim_details = patch.claimDetails;
  if (patch.agentName !== undefined) snakePatch.agent_name = patch.agentName;
  if (patch.agentLawFirm !== undefined) snakePatch.agent_law_firm = patch.agentLawFirm;
  if (patch.agentContact !== undefined) snakePatch.agent_contact = patch.agentContact;
  if (patch.sortOrder !== undefined) snakePatch.sort_order = patch.sortOrder;
  return caseApi.updatePartyBff(partyId, snakePatch);
};

export const removeParty = async (partyId: string, reason?: string): Promise<void> => {
  await caseApi.removePartyBff(partyId, reason);
};

export const checkConflicts = async (params: {
  partyName?: string;
  identityNumber?: string;
  partyType?: string;
  excludeCaseId?: string;
}): Promise<ConflictWarning[]> => {
  const result = await caseApi.conflictCheck(params);
  return Array.isArray(result) ? result : (result as any)?.warnings || [];
};

// ==================== 3.S4: 流程 Tab + 协作任务看板 ====================

export const getProcessTimeline = async (caseId: string): Promise<any[]> => {
  const result = await caseApi.getProcessTimelineBff(caseId);
  return Array.isArray(result?.instances) ? result.instances : (Array.isArray(result) ? result : []);
};

export const completeProcessNode = async (nodeId: string, opts?: { remark?: string }): Promise<void> => {
  await caseApi.completeNodeBff({ nodeId, remark: opts?.remark });
};

export interface MemoItem {
  id: string;
  content: string;
  actorName: string;
  createdAt: string;
}

export const getMemos = async (caseId: string): Promise<MemoItem[]> => {
  const result = await caseApi.queryActivitiesBff({ caseId, modules: ['MEMO'] });
  const items: any[] = Array.isArray(result?.items) ? result.items : (Array.isArray(result) ? result : []);
  return items.map((item: any) => ({
    id: item.id,
    content: item.content ?? '',
    actorName: item.actorName ?? item.actor_name ?? '未知',
    createdAt: item.createdAt ?? item.created_at ?? '',
  }));
};

export const addMemo = async (caseId: string, content: string): Promise<void> => {
  await caseApi.addMemoBff({ caseId, memoType: 'NOTE', content });
};

// ==================== OBS-007: 子台账真实 API 适配器 ====================

import { ProcedureRecord, FeeTransaction, CommunicationLog, TransactionType, TransactionStatus } from '../types';

/** 程序与时效 - 从 process/timeline 适配为 ProcedureRecord */
export const getProcedureRecords = async (caseId: string): Promise<ProcedureRecord[]> => {
  const result = await caseApi.getProcessTimelineBff(caseId);
  const instances: any[] = Array.isArray(result?.instances) ? result.instances : [];
  const records: ProcedureRecord[] = [];
  for (const inst of instances) {
    const stageName = inst.stageName ?? inst.stage_code ?? '未知阶段';
    const nodes: any[] = Array.isArray(inst.nodes) ? inst.nodes : [];
    for (const node of nodes) {
      let status: ProcedureRecord['status'] = 'PENDING';
      const rawStatus = (node.status ?? '').toString().toUpperCase();
      if (rawStatus === 'COMPLETED') status = 'COMPLETED';
      else if (node.isOverdue || rawStatus === 'OVERDUE') status = 'OVERDUE';
      records.push({
        id: node.id,
        caseId,
        stage: stageName,
        nodeName: node.taskName ?? node.task_name ?? '未命名节点',
        deadline: node.deadline ? String(node.deadline).split('T')[0] : '',
        completionDate: node.completedDate ?? node.completed_date
          ? String(node.completedDate ?? node.completed_date).split('T')[0]
          : undefined,
        assignee: node.assigneeName ?? node.assignee_name ?? '-',
        status,
        note: node.description ?? '',
      });
    }
  }
  return records;
};

/** 费用与财务 - 从 finance/spend/list 适配为 FeeTransaction */
export const getFinancialRecords = async (caseId: string): Promise<FeeTransaction[]> => {
  const result = await caseApi.getSpendListBff({ caseId });
  const items: any[] = Array.isArray(result?.items) ? result.items : [];

  const typeMap: Record<string, TransactionType> = {
    'LITIGATION_FEE': TransactionType.COURT_FEE,
    'COURT_FEE': TransactionType.COURT_FEE,
    'LAWYER_FEE': TransactionType.LAWYER_FEE,
    'LEGAL_FEE': TransactionType.LAWYER_FEE,
    'TRAVEL_EXPENSE': TransactionType.TRAVEL_EXPENSE,
    'COMPENSATION': TransactionType.COMPENSATION_PAID,
    'COMPENSATION_PAID': TransactionType.COMPENSATION_PAID,
    'RECOVERY': TransactionType.RECOVERY_RECEIVED,
    'RECOVERY_RECEIVED': TransactionType.RECOVERY_RECEIVED,
    'APPRAISAL_FEE': TransactionType.TRAVEL_EXPENSE,
    'PRESERVATION_FEE': TransactionType.COURT_FEE,
  };

  const statusMap: Record<string, TransactionStatus> = {
    'EXECUTED': TransactionStatus.PAID,
    'APPROVED': TransactionStatus.APPROVED,
    'PENDING': TransactionStatus.PENDING,
    'REJECTED': TransactionStatus.PENDING,
    'CANCELLED': TransactionStatus.PENDING,
  };

  return items.map((item: any) => ({
    id: item.id,
    caseId,
    type: typeMap[item.transactionType ?? item.transaction_type] ?? TransactionType.LAWYER_FEE,
    amount: Number(item.amount ?? 0),
    currency: item.currency ?? 'CNY',
    date: item.applyDate ?? item.apply_date ?? item.transactionDate ?? item.transaction_date ?? '',
    applicant: item.counterpartyName ?? item.counterparty_name ?? '-',
    description: item.description ?? '',
    status: statusMap[item.transactionStatus ?? item.transaction_status] ?? TransactionStatus.PENDING,
  }));
};

/** 沟通日志 - 从 activities/query (audit logs) 适配为 CommunicationLog */
export const getCommunicationLogs = async (caseId: string): Promise<CommunicationLog[]> => {
  const result = await caseApi.queryActivitiesBff({ caseId });
  const items: any[] = Array.isArray(result?.items) ? result.items : [];

  const moduleTypeMap: Record<string, CommunicationLog['type']> = {
    'PARTIES': '跨部门协同',
    'MEMBERS': '跨部门协同',
    'PROCESS': '策略研讨会',
    'TASK': '策略研讨会',
    'FINANCE': '跨部门协同',
    'COUNSELS': '外聘律师沟通',
    'COMPLIANCE': '策略研讨会',
    'DOSSIER': '跨部门协同',
    'MEMO': '其他',
    'CLOSURE': '策略研讨会',
    'CASES': '跨部门协同',
  };

  return items.map((item: any) => ({
    id: item.id,
    caseId,
    date: item.createdAt ?? item.created_at ? String(item.createdAt ?? item.created_at).split('T')[0] : '',
    type: moduleTypeMap[item.actionModule ?? item.action_module] ?? '其他',
    participants: item.operatorName ?? item.operator_name ?? '-',
    summary: `${item.actionType ?? item.action_type ?? ''}: ${item.actionDetail ?? item.action_detail ?? ''}`,
    recorder: item.operatorName ?? item.operator_name ?? '-',
    status: '已确认',
    attachments: [],
  }));
};

export interface CollabTask {
  id: string;
  title: string;
  description: string;
  assigneeName: string;
  deadline?: string;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
  createdAt?: string;
  attachmentCount: number;
}

export const listCollabTasks = async (caseId: string): Promise<CollabTask[]> => {
  const result = await caseApi.listTasksBff({ caseId });
  const items: any[] = Array.isArray(result?.items) ? result.items : [];
  return items.map((item: any) => ({
    id: item.id,
    title: item.title ?? '',
    description: item.description ?? '',
    assigneeName: item.assigneeName ?? item.assignee_name ?? '',
    deadline: item.dueDate ?? item.due_date,
    status: item.status ?? 'TODO',
    createdAt: item.createdAt ?? item.created_at,
    attachmentCount: item.attachmentCount ?? item.attachment_count ?? 0,
  }));
};

export const createCollabTask = async (payload: {
  caseId: string;
  title: string;
  assigneeName: string;
  deadline?: string;
  description?: string;
}): Promise<CollabTask> => {
  const result = await caseApi.createTaskBff({
    case_id: payload.caseId,
    title: payload.title,
    assignee_name: payload.assigneeName,
    due_date: payload.deadline ?? null,
    description: payload.description ?? null,
  });
  return {
    id: result?.id ?? '',
    title: result?.title ?? payload.title,
    description: result?.description ?? payload.description ?? '',
    assigneeName: result?.assigneeName ?? result?.assignee_name ?? payload.assigneeName,
    deadline: result?.dueDate ?? result?.due_date ?? payload.deadline,
    status: result?.status ?? 'TODO',
    createdAt: result?.createdAt ?? result?.created_at,
    attachmentCount: 0,
  };
};

export const updateTaskStatus = async (
  taskId: string,
  newStatus: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED',
): Promise<void> => {
  await caseApi.updateTaskStatusBff({ taskId, newStatus });
};

// ==================== 3.S5: 外聘律师 Tab ====================

export interface CounselItem {
  id: string;
  counselType: 'INTERNAL' | 'EXTERNAL';
  counselTypeName: string;
  lawyerId: string;
  lawyerName: string;
  lawFirmId?: string;
  lawFirmName?: string;
  roleInCase: 'LEAD' | 'CO_COUNSEL';
  roleInCaseName: string;
  contractId?: string;
  contactPhone?: string;
  contactEmail?: string;
  status: 'ACTIVE' | 'TERMINATED' | 'COMPLETED';
  statusName: string;
  performanceRating?: number;
  evaluationComment?: string;
  createdAt?: string;
}

const mapCounselItem = (item: any): CounselItem => ({
  id: item.id,
  counselType: item.counselType,
  counselTypeName: item.counselTypeName ?? '',
  lawyerId: item.lawyerId ?? '',
  lawyerName: item.lawyerName ?? '',
  lawFirmId: item.lawFirmId,
  lawFirmName: item.lawFirmName,
  roleInCase: item.roleInCase ?? 'LEAD',
  roleInCaseName: item.roleInCaseName ?? '',
  contractId: item.contractId,
  contactPhone: item.contactPhone,
  contactEmail: item.contactEmail,
  status: item.status ?? 'ACTIVE',
  statusName: item.statusName ?? '',
  performanceRating: item.performanceRating,
  evaluationComment: item.evaluationComment,
  createdAt: item.createdAt,
});

export const listCounsel = async (caseId: string): Promise<{
  internalCounsels: CounselItem[];
  externalCounsels: CounselItem[];
}> => {
  const result = await caseApi.getCounselsListBff({ caseId });
  return {
    internalCounsels: Array.isArray(result?.internalCounsels) ? result.internalCounsels.map(mapCounselItem) : [],
    externalCounsels: Array.isArray(result?.externalCounsels) ? result.externalCounsels.map(mapCounselItem) : [],
  };
};

export const assignInternalCounsel = async (params: {
  caseId: string;
  userId: string;
  roleInCase?: 'LEAD' | 'CO_COUNSEL';
  contactPhone?: string;
  contactEmail?: string;
}): Promise<CounselItem> => {
  const result = await caseApi.assignInternalCounselBff({
    caseId: params.caseId,
    userId: params.userId,
    roleInCase: params.roleInCase ?? 'LEAD',
    contactPhone: params.contactPhone ?? null,
    contactEmail: params.contactEmail ?? null,
  });
  return mapCounselItem(result?.counsel ?? result);
};

export const assignExternalCounsel = async (params: {
  caseId: string;
  externalLawyerId: string;
  lawFirmId?: string;
  roleInCase?: 'LEAD' | 'CO_COUNSEL';
  contactPhone?: string;
  contactEmail?: string;
}): Promise<CounselItem> => {
  const result = await caseApi.assignExternalCounselBff({
    caseId: params.caseId,
    externalLawyerId: params.externalLawyerId,
    roleInCase: params.roleInCase ?? 'LEAD',
    contactPhone: params.contactPhone ?? null,
    contactEmail: params.contactEmail ?? null,
  });
  return mapCounselItem(result?.counsel ?? result);
};

export const unassignCounsel = async (params: {
  counselId: string;
  reason?: string;
  performanceRating?: number;
  evaluationComment?: string;
}): Promise<void> => {
  await caseApi.unassignCounselBff({
    counselId: params.counselId,
    reason: params.reason ?? null,
    performanceRating: params.performanceRating ?? null,
    evaluationComment: params.evaluationComment ?? null,
  });
};

export const attachCounselContract = async (params: {
  caseId: string;
  contractName: string;
  lawFirmId: string;
  feeType: 'FIXED' | 'HOURLY' | 'CONTINGENCY' | 'MIXED';
  totalAmount?: number;
  contingencyRate?: number;
  signDate?: string;
  bindCounselId?: string;
}): Promise<string | null> => {
  const result = await caseApi.attachContractBff({
    caseId: params.caseId,
    contractName: params.contractName,
    lawFirmId: params.lawFirmId,
    feeType: params.feeType,
    totalAmount: params.totalAmount ?? null,
    contingencyRate: params.contingencyRate ?? null,
    signDate: params.signDate ?? null,
    bindCounselId: params.bindCounselId ?? null,
  });
  return result?.id ?? null;
};

// ==================== 3.S6: 财务 Tab ====================

export interface SpendItem {
  id: string;
  transactionType: string;
  transactionTypeName: string;
  amount: number;
  currency: string;
  applyDate?: string;
  counterpartyName?: string;
  description?: string;
  status: 'PENDING' | 'APPROVED' | 'EXECUTED' | 'REJECTED' | 'CANCELLED';
  statusName: string;
  createdAt?: string;
}

export interface ProvisionHistoryItem {
  id: string;
  actionType: 'PROVISION' | 'ADJUSTMENT' | 'REVERSAL';
  actionTypeName: string;
  adjustmentAmount: number;
  currentAmount: number;
  previousAmount: number;
  currency: string;
  assessmentDate?: string;
  riskProbability: string;
  riskProbabilityName: string;
  basisOfEstimate?: string;
  createdAt?: string;
}

const mapSnapshotToLegacy = (snap: any): FinancialRecord => ({
  caseId: snap.caseId ?? '',
  claimedAmount: snap.claims?.ourClaimAmount ?? snap.claims?.claimedAmount ?? 0,
  judgedAmount: snap.judgments?.finalAmount ?? snap.judgments?.judgmentAmount ?? 0,
  executedAmount: snap.recoveries?.recoveredAmount ?? snap.recoveries?.totalRecovered ?? 0,
  currency: snap.claims?.currency ?? 'CNY',
  legalFeeBudget: snap.legalFees?.budgetAmount ?? 0,
  legalFeePaid: snap.legalFees?.paidAmount ?? snap.legalFees?.totalPaid ?? 0,
  otherFeesPaid: 0,
  provisionAmount: snap.provisions?.currentAmount ?? 0,
  provisionStatus: (snap.provisions?.currentAmount ?? 0) > 0 ? '已确认' : '未计提',
});

const mapSpendItem = (item: any): SpendItem => ({
  id: item.id,
  transactionType: item.transactionType ?? '',
  transactionTypeName: item.transactionTypeName ?? item.transactionType ?? '',
  amount: Number(item.amount ?? 0),
  currency: item.currency ?? 'CNY',
  applyDate: item.applyDate,
  counterpartyName: item.counterpartyName,
  description: item.description,
  status: item.transactionStatus ?? item.status ?? 'PENDING',
  statusName: item.transactionStatusName ?? item.statusName ?? item.transactionStatus ?? item.status ?? '',
  createdAt: item.createdAt,
});

const mapProvisionItem = (item: any): ProvisionHistoryItem => ({
  id: item.id,
  actionType: item.actionType ?? 'PROVISION',
  actionTypeName: item.actionTypeName ?? item.actionType ?? '',
  adjustmentAmount: Number(item.adjustmentAmount ?? 0),
  currentAmount: Number(item.currentAmount ?? 0),
  previousAmount: Number(item.previousAmount ?? 0),
  currency: item.currency ?? 'CNY',
  assessmentDate: item.assessmentDate,
  riskProbability: item.riskProbability ?? '',
  riskProbabilityName: item.riskProbabilityName ?? item.riskProbability ?? '',
  basisOfEstimate: item.basisOfEstimate,
  createdAt: item.createdAt,
});

export const getFinanceSnapshot = async (caseId: string): Promise<FinancialRecord | null> => {
  try {
    const result = await caseApi.getFinanceSnapshotBff(caseId);
    if (!result) return null;
    return mapSnapshotToLegacy(result);
  } catch {
    return null;
  }
};

export const updateFinance = async (caseId: string, fields: {
  targetAmount?: number | null;
  provisionAmount?: number | null;
  judgmentAmount?: number | null;
  notes?: string | null;
}): Promise<void> => {
  await caseApi.updateFinanceBff(caseId, {
    target_amount: fields.targetAmount ?? null,
    provision_amount: fields.provisionAmount ?? null,
    judgment_amount: fields.judgmentAmount ?? null,
    notes: fields.notes ?? null,
  });
};

export const addProvision = async (params: {
  caseId: string;
  actionType: 'PROVISION' | 'ADJUSTMENT' | 'REVERSAL';
  adjustmentAmount: number;
  assessmentDate: string;
  riskProbability: 'PROBABLE' | 'POSSIBLE' | 'REMOTE';
  basisOfEstimate: string;
}): Promise<void> => {
  await caseApi.addProvisionBff({
    caseId: params.caseId,
    actionType: params.actionType,
    adjustmentAmount: params.adjustmentAmount,
    assessmentDate: params.assessmentDate,
    riskProbability: params.riskProbability,
    basisOfEstimate: params.basisOfEstimate,
  });
};

export const getProvisionsHistory = async (caseId: string): Promise<ProvisionHistoryItem[]> => {
  const result = await caseApi.getProvisionsHistoryBff({ caseId });
  const items = Array.isArray(result?.items) ? result.items : (Array.isArray(result) ? result : []);
  return items.map(mapProvisionItem);
};

export const recordSpend = async (params: {
  caseId: string;
  transactionType: string;
  amount: number;
  applyDate?: string;
  counterpartyName?: string;
  description?: string;
}): Promise<SpendItem> => {
  const result = await caseApi.recordSpendBff({
    caseId: params.caseId,
    transactionType: params.transactionType,
    amount: params.amount,
    applyDate: params.applyDate ?? null,
    counterpartyName: params.counterpartyName ?? null,
    description: params.description ?? null,
  });
  return mapSpendItem(result?.transaction ?? result);
};

export const getSpendList = async (caseId: string): Promise<SpendItem[]> => {
  const result = await caseApi.getSpendListBff({ caseId });
  const items = Array.isArray(result?.items) ? result.items : (Array.isArray(result) ? result : []);
  return items.map(mapSpendItem);
};

// ==================== 3.S7: 卷宗 / 文档 ====================

export interface DossierFolder {
  id: string;
  name: string;
  documentCount: number;
  children: DossierFolder[];
  isSystem: boolean;
}

export interface DossierItem {
  id: string;
  name: string;
  type: 'folder' | 'pdf' | 'doc' | 'docx' | 'xls' | 'xlsx' | 'jpg' | 'png' | 'other';
  size: string;
  uploadDate: string;
  uploader: string;
  evidenceNo?: string;
  isFolder: boolean;
  documentCount?: number;
  version?: number;
}

const formatBytes = (bytes: number): string => {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const mapDocVO = (doc: any): DossierItem => ({
  id: doc.id,
  name: doc.docName,
  type: (doc.docType || 'other') as DossierItem['type'],
  size: formatBytes(doc.docSize ?? 0),
  uploadDate: doc.uploadTime ? String(doc.uploadTime).slice(0, 10) : '',
  uploader: doc.uploaderName ?? '',
  evidenceNo: doc.evidenceNo ?? undefined,
  isFolder: false,
  version: doc.version,
});

const mapFolderNode = (f: any): DossierFolder => ({
  id: f.id,
  name: f.folderName,
  documentCount: f.documentCount ?? 0,
  children: (f.children ?? []).map(mapFolderNode),
  isSystem: f.isSystem ?? false,
});

export const getDossierTree = async (caseId: string): Promise<DossierFolder[]> => {
  const result = await caseApi.getDossierTreeBff(caseId);
  return (result?.folders ?? []).map(mapFolderNode);
};

export const listDossierDocuments = async (caseId: string, folderId: string): Promise<DossierItem[]> => {
  const result = await caseApi.listDocumentsBff({ caseId, folderId });
  return (result?.items ?? []).map(mapDocVO);
};

export const uploadDocument = async (
  caseId: string,
  folderId: string,
  file: File,
  meta: { evidenceNo?: string; parentDocId?: string },
): Promise<DossierItem> => {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'other';
  const init = await caseApi.initUploadBff({
    caseId,
    folderId,
    docName: file.name,
    docType: ext,
    docSize: file.size,
    evidenceNo: meta.evidenceNo,
    parentDocId: meta.parentDocId,
  });
  if (!init.skipUpload) {
    await fetch(init.presignedUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
    });
  }
  const doc = await caseApi.completeUploadBff(init.uploadId);
  return mapDocVO(doc);
};

export const createDossierFolder = async (
  caseId: string,
  parentId: string | undefined,
  folderName: string,
): Promise<void> => {
  await caseApi.createFolderBff({ caseId, parentId, folderName });
};

export const deleteDossierDocument = async (docId: string): Promise<void> => {
  await caseApi.deleteDocumentBff(docId);
};

export const renameDocument = async (docId: string, newName: string): Promise<void> => {
  await caseApi.renameDocumentBff(docId, newName);
};

export const moveDocument = async (docId: string, targetFolderId: string): Promise<void> => {
  await caseApi.moveDocumentBff(docId, targetFolderId);
};

export const getDocumentDownloadUrl = async (docId: string): Promise<string | null> => {
  const result = await caseApi.getDownloadUrlBff(docId, 'attachment');
  return result?.presignedUrl ?? null;
};

export const getDocumentPreviewUrl = async (docId: string): Promise<string | null> => {
  const result = await caseApi.getDownloadUrlBff(docId, 'inline');
  return result?.presignedUrl ?? null;
};

export const checkDocumentPermission = async (
  caseId: string,
  docId: string,
): Promise<'VIEW' | 'DOWNLOAD' | 'EDIT' | null> => {
  const result = await caseApi.listPermissionsBff({ caseId, targetType: 'DOCUMENT', targetId: docId });
  const perms: any[] = result?.items ?? (Array.isArray(result) ? result : []);
  if (!perms.length) return null;
  if (perms.some((p: any) => p.permissionType === 'EDIT')) return 'EDIT';
  if (perms.some((p: any) => p.permissionType === 'DOWNLOAD')) return 'DOWNLOAD';
  return 'VIEW';
};

export const requestDocumentAccess = async (params: {
  caseId: string;
  docId: string;
  requestedPermission: 'VIEW' | 'DOWNLOAD';
  reason: string;
}): Promise<void> => {
  await caseApi.createAuthRequestBff({
    caseId: params.caseId,
    targetType: 'DOCUMENT',
    targetId: params.docId,
    requestedPermission: params.requestedPermission,
    reason: params.reason,
  });
};

export const generateEvidenceCatalog = async (caseId: string): Promise<any> => {
  return await caseApi.generateEvidenceCatalogBff(caseId);
};

// Re-export types
export type { CaseStats, PaginatedSearchResult, SearchIssueItem };

// Re-export types and utilities
export * from './mock/caseActivity';

// ==================== 3.S8: 合规 Tab 披露历史 ====================

export interface HistoricalDisclosure {
  id: string;
  materialType: string;
  disclosureStatus: string;
  disclosureStatusName: string | null;
  disclosureDate: string | null;
  reportingPeriod: string | null;
}

export interface ComplianceDisclosures {
  disclosureTriggered: boolean;
  disclosureReason: string | null;
  items: HistoricalDisclosure[];
}

const mapHistoricalDisclosure = (d: any): HistoricalDisclosure => ({
  id: d.id,
  materialType: d.material_type ?? '',
  disclosureStatus: d.disclosure_status ?? '',
  disclosureStatusName: d.disclosure_status_name ?? null,
  disclosureDate: d.disclosure_date ?? null,
  reportingPeriod: d.reporting_period ?? null,
});

export const getComplianceDisclosures = async (caseId: string): Promise<ComplianceDisclosures> => {
  const result = await caseApi.getComplianceDisclosuresBff(caseId);
  return {
    disclosureTriggered: result?.disclosure_triggered ?? false,
    disclosureReason: result?.disclosure_reason ?? null,
    items: (result?.historical_disclosures ?? []).map(mapHistoricalDisclosure),
  };
};

// ==================== 3.S9: 结案/归档/终本 Tab ====================

export const CLOSURE_TYPE_LABELS: Record<string, string> = {
  JUDGMENT_WON: '判决胜诉',
  JUDGMENT_LOST: '判决败诉',
  SETTLED: '和解结案',
  WITHDRAWN: '撤诉',
  MEDIATED: '调解结案',
};

export interface ClosureRecord {
  id: string;
  caseId: string;
  closureDate: string;
  closureType: string;
  closureTypeName: string | null;
  status: string;
  statusName: string | null;
  reviewSummary: string;
  improvementPlan: string | null;
  checklistData: Record<string, boolean> | null;
  approvedBy: string | null;
}

export interface ClosingInfo {
  caseId: string;
  registered: boolean;
  closure: ClosureRecord | null;
  caseStatus: string;
  caseStatusName: string | null;
}

export interface ArchivingCheck {
  ruleId: string;
  name: string;
  source: string;
  passed: boolean;
  message: string;
}

export interface ArchivingValidation {
  caseId: string;
  canArchive: boolean;
  passedCount: number;
  totalCount: number;
  checks: ArchivingCheck[];
}

export interface ZhongbenReminder {
  reminderId: string;
  intervalMonths: number;
  assigneeId: string;
  assigneeName: string | null;
  nextTriggerDate: string | null;
  note: string | null;
}

export interface ZhongbenPlan {
  registered: boolean;
  registerDate: string | null;
  nonExecutedAmount: string | null;
  currency: string | null;
  rulingNo: string | null;
  reason: string | null;
  reminders: ZhongbenReminder[];
}

const mapClosureRecord = (c: any): ClosureRecord => ({
  id: c.id,
  caseId: c.case_id,
  closureDate: c.closure_date ?? '',
  closureType: c.closure_type ?? '',
  closureTypeName: c.closure_type_name ?? null,
  status: c.status ?? '',
  statusName: c.status_name ?? null,
  reviewSummary: c.review_summary ?? '',
  improvementPlan: c.improvement_plan ?? null,
  checklistData: c.checklist_data ?? null,
  approvedBy: c.approved_by ?? null,
});

const mapZhongbenReminder = (r: any): ZhongbenReminder => ({
  reminderId: r.reminder_id,
  intervalMonths: r.interval_months,
  assigneeId: r.assignee_id,
  assigneeName: r.assignee_name ?? null,
  nextTriggerDate: r.next_trigger_date ?? null,
  note: r.note ?? null,
});

const mapZhongbenPlan = (p: any): ZhongbenPlan => ({
  registered: p.registered ?? false,
  registerDate: p.register_date ?? null,
  nonExecutedAmount: p.non_executed_amount != null ? String(p.non_executed_amount) : null,
  currency: p.currency ?? null,
  rulingNo: p.ruling_no ?? null,
  reason: p.reason ?? null,
  reminders: (p.reminders ?? []).map(mapZhongbenReminder),
});

export const getClosingInfo = async (caseId: string): Promise<ClosingInfo> => {
  const result = await caseApi.getClosingInfoBff(caseId);
  return {
    caseId: result?.case_id ?? caseId,
    registered: result?.registered ?? false,
    closure: result?.closure ? mapClosureRecord(result.closure) : null,
    caseStatus: result?.case_status ?? '',
    caseStatusName: result?.case_status_name ?? null,
  };
};

export const submitClosing = async (params: {
  caseId: string;
  closureDate: string;
  closureType: string;
  reviewSummary: string;
  improvementPlan?: string | null;
  checklistData?: Record<string, boolean>;
  status?: 'DRAFT' | 'APPROVED';
}): Promise<{ closureId: string; caseStatus: string; closureStatus: string; warnings: string[] }> => {
  const result = await caseApi.submitClosingBff({
    caseId: params.caseId,
    closureDate: params.closureDate,
    closureType: params.closureType,
    reviewSummary: params.reviewSummary,
    improvementPlan: params.improvementPlan ?? null,
    checklistData: params.checklistData,
    status: params.status ?? 'DRAFT',
  });
  return {
    closureId: result?.closure_id ?? '',
    caseStatus: result?.case_status ?? '',
    closureStatus: result?.closure_status ?? '',
    warnings: result?.warnings ?? [],
  };
};

export const validateArchiving = async (caseId: string): Promise<ArchivingValidation> => {
  const result = await caseApi.validateArchivingBff(caseId);
  return {
    caseId: result?.case_id ?? caseId,
    canArchive: result?.can_archive ?? false,
    passedCount: result?.passed_count ?? 0,
    totalCount: result?.total_count ?? 6,
    checks: (result?.checks ?? []).map((c: any): ArchivingCheck => ({
      ruleId: c.rule_id,
      name: c.name,
      source: c.source,
      passed: c.passed,
      message: c.message,
    })),
  };
};

export const submitArchiving = async (params: {
  caseId: string;
  archiveNo: string;
  archiveNote?: string | null;
}): Promise<{ caseStatus: string; archiveNo: string; archiveDate: string; warnings: string[] }> => {
  const result = await caseApi.submitArchivingBff(params);
  return {
    caseStatus: result?.case_status ?? '',
    archiveNo: result?.archive_no ?? '',
    archiveDate: result?.archive_date ?? '',
    warnings: result?.warnings ?? [],
  };
};

export const registerZhongben = async (params: {
  caseId: string;
  registerDate: string;
  nonExecutedAmount: string | number;
  currency?: string;
  rulingNo?: string | null;
  reason?: string | null;
}): Promise<{ zhongbenPlan: ZhongbenPlan; warnings: string[] }> => {
  const result = await caseApi.registerZhongbenBff(params);
  return {
    zhongbenPlan: mapZhongbenPlan(result?.zhongben_plan ?? {}),
    warnings: result?.warnings ?? [],
  };
};

export const setupZhongbenReminder = async (params: {
  caseId: string;
  intervalMonths: number;
  assigneeId: string;
  note?: string | null;
}): Promise<{ reminderId: string; nextTriggerDate: string; warnings: string[] }> => {
  const result = await caseApi.setupZhongbenReminderBff(params);
  return {
    reminderId: result?.reminder_id ?? '',
    nextTriggerDate: result?.next_trigger_date ?? '',
    warnings: result?.warnings ?? [],
  };
};

// =============================================================================
// 财务看板（跨案件聚合）适配器 — 3.S11
// 权限模型：角色级 DataRole（后端 _compute_board_scope），与案件级不同
// =============================================================================

export interface FinanceBoardKPI {
  totalExposure: number;
  totalProvision: number;
  totalLegalSpend: number;
  totalRecovered: number;
}

export interface FinanceBoardDistributionItem {
  name: string;
  fees: number;
  provision: number;
}

export interface FinanceBoardSpendItem {
  id: string;
  description: string;
  date: string;
  amount: number;
}

export interface FinanceBoardBudgetItem {
  dimensionName: string;
  totalBudget: number;
  consumedAmount: number;
  executionRate: number;
  isWarning: boolean;
}

function currentYearRange(): { start: string; end: string } {
  const y = new Date().getFullYear();
  return { start: `${y}-01-01`, end: `${y}-12-31` };
}

export const getFinanceBoardKPI = async (): Promise<FinanceBoardKPI> => {
  try {
    const [kpi, provSummary] = await Promise.all([
      financeBoardApi.getKpiBff({ timeRange: currentYearRange() }),
      financeBoardApi.getProvisionsSummaryBff(),
    ]);
    return {
      totalExposure: Number(kpi?.totalClaims ?? kpi?.total_claims ?? 0),
      totalLegalSpend: Number(kpi?.totalLegalSpend ?? kpi?.total_legal_spend ?? 0),
      totalRecovered: Number(kpi?.totalRecovered ?? kpi?.total_recovered ?? 0),
      // provisions/summary 返回 totalProvisionedAmount (APPROVED) 或 totalProvisioned (含 PENDING)
      totalProvision: Number(provSummary?.totalProvisionedAmount ?? provSummary?.total_provisioned_amount ?? provSummary?.totalProvisioned ?? provSummary?.total_provisioned ?? 0),
    };
  } catch {
    return { totalExposure: 0, totalProvision: 0, totalLegalSpend: 0, totalRecovered: 0 };
  }
};

export const getFinanceBoardDistribution = async (): Promise<FinanceBoardDistributionItem[]> => {
  try {
    const range = currentYearRange();
    // D80: 两个维度并行拉取，BY_BUSINESS_UNIT，与原 bizLineData 结构对齐
    const [feesData, provData] = await Promise.all([
      financeBoardApi.getDistributionBff({ metric: 'LEGAL_SPEND', dimension: 'BY_BUSINESS_UNIT', timeRange: range }),
      financeBoardApi.getDistributionBff({ metric: 'PROVISION_AMOUNT', dimension: 'BY_BUSINESS_UNIT', timeRange: range }),
    ]);
    const feesItems: { label: string; value: string | number }[] = feesData?.items ?? [];
    const provMap: Record<string, number> = {};
    ((provData?.items ?? []) as { label: string; value: string | number }[]).forEach(it => {
      provMap[it.label] = Number(it.value ?? 0);
    });
    return feesItems.map(it => ({
      name: it.label ?? '',
      fees: Number(it.value ?? 0),
      provision: provMap[it.label] ?? 0,
    }));
  } catch {
    return [];
  }
};

export const listFinanceBoardSpend = async (limit = 5): Promise<FinanceBoardSpendItem[]> => {
  try {
    const result = await financeBoardApi.listSpendBff({ pagination: { page: 1, size: limit } });
    const items: {
      id: string;
      caseName?: string;
      case_name?: string;
      expenseType?: string;
      expense_type?: string;
      dueDate?: string;
      due_date?: string;
      createdAt?: string;
      created_at?: string;
      amount: string | number;
    }[] = result?.items ?? [];
    return items.map(it => ({
      id: it.id ?? '',
      description: it.caseName ?? it.case_name ?? it.expenseType ?? it.expense_type ?? '',
      date: it.dueDate ?? it.due_date ?? (it.createdAt ?? it.created_at ? (it.createdAt ?? it.created_at).slice(0, 10) : ''),
      amount: Number(it.amount ?? 0),
    }));
  } catch {
    return [];
  }
};

export const getFinanceBoardBudgetExecution = async (): Promise<FinanceBoardBudgetItem[]> => {
  try {
    const result = await financeBoardApi.getBudgetExecutionBff({ year: new Date().getFullYear() });
    const items: {
      dimensionName?: string;
      dimension_name?: string;
      totalBudget?: string | number;
      total_budget?: string | number;
      consumedAmount?: string | number;
      consumed_amount?: string | number;
      executionRate?: number;
      execution_rate?: number;
      isWarning?: boolean;
      is_warning?: boolean;
    }[] = result?.items ?? [];
    return items.map(it => ({
      dimensionName: it.dimensionName ?? it.dimension_name ?? '',
      totalBudget: Number(it.totalBudget ?? it.total_budget ?? 0),
      consumedAmount: Number(it.consumedAmount ?? it.consumed_amount ?? 0),
      executionRate: Number(it.executionRate ?? it.execution_rate ?? 0),
      isWarning: Boolean(it.isWarning ?? it.is_warning),
    }));
  } catch {
    return [];
  }
};
// ─── 3.S12: 资产保全台账适配器 ─────────────────────────────────────────────

export interface AssetPreservationRecord {
  id: string;
  caseId: string;
  assetType: string;
  assetTypeName: string;
  assetName: string;
  preservationType: string;
  preservationTypeName: string;
  effectiveStatus: string;
  effectiveStatusName: string;
  startDate: string;
  expireDate: string;
  daysUntilExpiry: number;
  estimatedValue: number;
  currency: string;
  executionCourt?: string;
  isExpiringSoon: boolean;
  ownerPartyId: string;
  ownerPartyName?: string;
  // detail only
  extendHistory?: { extendedAt: string; previousExpireDate: string; newExpireDate: string; reason?: string }[];
  assetIdentifiers?: Record<string, unknown>;
  realizedValue?: number;
  rulingDocumentId?: string;
  description?: string;
}

export interface ExpiryAlertSummary {
  overdueCount: number;
  expiring7dCount: number;
  expiring30dCount: number;
  totalAtRiskValue: number;
}

export interface ExpiryAlertResult {
  summary: ExpiryAlertSummary;
  items: AssetPreservationRecord[];
}

function mapPreservationItem(raw: Record<string, unknown>): AssetPreservationRecord {
  return {
    id: String(raw.id ?? ''),
    caseId: String(raw.caseId ?? raw.case_id ?? ''),
    assetType: String(raw.assetType ?? raw.asset_type ?? ''),
    assetTypeName: String(raw.assetTypeName ?? raw.asset_type_name ?? raw.assetType ?? raw.asset_type ?? ''),
    assetName: String(raw.assetName ?? raw.asset_name ?? ''),
    preservationType: String(raw.preservationType ?? raw.preservation_type ?? ''),
    preservationTypeName: String(raw.preservationTypeName ?? raw.preservation_type_name ?? raw.preservationType ?? raw.preservation_type ?? ''),
    effectiveStatus: String(raw.effectiveStatus ?? raw.effective_status ?? raw.status ?? ''),
    effectiveStatusName: String(raw.effectiveStatusName ?? raw.effective_status_name ?? raw.effectiveStatus ?? raw.effective_status ?? raw.status ?? ''),
    startDate: String(raw.startDate ?? raw.start_date ?? ''),
    expireDate: String(raw.expireDate ?? raw.expire_date ?? ''),
    daysUntilExpiry: Number(raw.daysUntilExpiry ?? raw.days_until_expiry ?? 0),
    estimatedValue: Number(raw.estimatedValue ?? raw.estimated_value ?? 0),
    currency: String(raw.currency ?? 'CNY'),
    executionCourt: raw.executionCourt ?? raw.execution_court ? String(raw.executionCourt ?? raw.execution_court) : undefined,
    isExpiringSoon: Boolean(raw.isExpiringSoon ?? raw.is_expiring_soon),
    ownerPartyId: String(raw.ownerPartyId ?? raw.owner_party_id ?? ''),
    ownerPartyName: raw.ownerPartyName ?? raw.owner_party_name ? String(raw.ownerPartyName ?? raw.owner_party_name) : undefined,
    extendHistory: Array.isArray(raw.extendHistory ?? raw.extend_history)
      ? (raw.extendHistory ?? raw.extend_history as Record<string, unknown>[]).map(h => ({
          extendedAt: String(h.extendedAt ?? h.extended_at ?? ''),
          previousExpireDate: String(h.previousExpireDate ?? h.previous_expire_date ?? ''),
          newExpireDate: String(h.newExpireDate ?? h.new_expire_date ?? ''),
          reason: h.reason ? String(h.reason) : undefined,
        }))
      : undefined,
    assetIdentifiers: (raw.assetIdentifiers ?? raw.asset_identifiers) as Record<string, unknown> | undefined,
    realizedValue: (raw.realizedValue ?? raw.realized_value) != null ? Number(raw.realizedValue ?? raw.realized_value) : undefined,
    rulingDocumentId: raw.rulingDocumentId ?? raw.ruling_document_id ? String(raw.rulingDocumentId ?? raw.ruling_document_id) : undefined,
    description: raw.description ? String(raw.description) : undefined,
  };
}

export const listPreservations = async (
  caseId?: string | null,
  statusFilter?: 'ACTIVE' | 'RELEASED' | 'REALIZED' | 'EXPIRED' | null,
): Promise<AssetPreservationRecord[]> => {
  try {
    const result = await assetPreservationApi.listPreservationsBff({ caseId, statusFilter });
    const items: Record<string, unknown>[] = result?.items ?? [];
    return items.map(mapPreservationItem);
  } catch {
    return [];
  }
};

export const createPreservation = async (params: {
  caseId: string;
  ownerPartyId: string;
  assetType: string;
  assetName: string;
  preservationType: string;
  startDate: string;
  expireDate: string;
  estimatedValue?: number | null;
  currency?: string;
  executionCourt?: string | null;
  rulingDocumentId?: string | null;
  description?: string | null;
  assetIdentifiers?: Record<string, unknown> | null;
}): Promise<AssetPreservationRecord | null> => {
  try {
    const raw = await assetPreservationApi.createPreservationBff(params);
    return raw ? mapPreservationItem(raw as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

export const extendPreservation = async (params: {
  preservationId: string;
  newExpireDate: string;
  reason?: string | null;
}): Promise<AssetPreservationRecord | null> => {
  try {
    const raw = await assetPreservationApi.extendPreservationBff(params);
    return raw ? mapPreservationItem(raw as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

export const releasePreservation = async (params: {
  preservationId: string;
  releaseDate: string;
  releaseReason?: string | null;
  rulingDocumentId?: string | null;
}): Promise<AssetPreservationRecord | null> => {
  try {
    const raw = await assetPreservationApi.releasePreservationBff(params);
    return raw ? mapPreservationItem(raw as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

export const realizePreservation = async (params: {
  preservationId: string;
  realizedValue: number;
  realizeDate: string;
  remarks?: string | null;
}): Promise<AssetPreservationRecord | null> => {
  try {
    const raw = await assetPreservationApi.realizePreservationBff(params);
    return raw ? mapPreservationItem(raw as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

export const getExpiryAlerts = async (params: {
  caseId?: string | null;
  daysThreshold?: number;
} = {}): Promise<ExpiryAlertResult> => {
  try {
    const result = await assetPreservationApi.getExpiryAlertsBff({
      caseId: params.caseId,
      daysThreshold: params.daysThreshold ?? 30,
    });
    const rawSummary = (result?.summary ?? {}) as Record<string, unknown>;
    const rawItems: Record<string, unknown>[] = result?.items ?? [];
    return {
      summary: {
        overdueCount: Number(rawSummary.overdue_count ?? 0),
        expiring7dCount: Number(rawSummary.expiring_7d_count ?? 0),
        expiring30dCount: Number(rawSummary.expiring_30d_count ?? 0),
        totalAtRiskValue: Number(rawSummary.total_at_risk_value ?? 0),
      },
      items: rawItems.map(mapPreservationItem),
    };
  } catch {
    return {
      summary: { overdueCount: 0, expiring7dCount: 0, expiring30dCount: 0, totalAtRiskValue: 0 },
      items: [],
    };
  }
};

// ─── 3.S13: 合规中心适配器 ─────────────────────────────────────────────────

export interface ComplianceAlertRecord {
  alertId: string;
  caseId: string;
  caseCode: string;
  caseTitle: string;
  ruleName: string;
  alertMessage: string;
  alertLevel: string;
  alertLevelName: string;
  status: 'PENDING' | 'REPORTED' | 'EXEMPTED';
  statusName: string;
  createdAt: string;
  reportingTaskId?: string;
}

export interface ComplianceRuleRecord {
  ruleId: string;
  ruleCode: string;
  ruleName: string;
  ruleType: string;
  ruleTypeName: string;
  actionType: string;
  actionTypeName: string;
  status: 'ACTIVE' | 'INACTIVE' | 'DRAFT';
  statusName: string;
}

export interface DataQualityIssueRecord {
  issueId: string;
  caseId: string;
  caseCode: string;
  issueType: string;
  description: string;
  severity: 'BLOCKER' | 'WARNING';
  severityName: string;
  status: 'PENDING' | 'RESOLVED' | 'IGNORED';
  statusName: string;
  createdAt: string;
}

export interface GovernanceScanResult {
  scanId: string;
  status: string;
  estimatedCases: number;
}

function mapAlertItem(raw: Record<string, unknown>): ComplianceAlertRecord {
  return {
    alertId: String(raw.alert_id ?? raw.id ?? ''),
    caseId: String(raw.case_id ?? ''),
    caseCode: String(raw.case_code ?? ''),
    caseTitle: String(raw.case_title ?? ''),
    ruleName: String(raw.rule_name ?? ''),
    alertMessage: String(raw.alert_message ?? ''),
    alertLevel: String(raw.alert_level ?? ''),
    alertLevelName: String(raw.alert_level_name ?? raw.alert_level ?? ''),
    status: (raw.status as ComplianceAlertRecord['status']) ?? 'PENDING',
    statusName: String(raw.status_name ?? raw.status ?? ''),
    createdAt: String(raw.created_at ?? ''),
    reportingTaskId: raw.reporting_task_id ? String(raw.reporting_task_id) : undefined,
  };
}

function mapRuleItem(raw: Record<string, unknown>): ComplianceRuleRecord {
  return {
    ruleId: String(raw.ruleId ?? raw.id ?? ''),
    ruleCode: String(raw.ruleCode ?? ''),
    ruleName: String(raw.ruleName ?? ''),
    ruleType: String(raw.ruleType ?? ''),
    ruleTypeName: String(raw.ruleType_name ?? raw.ruleType ?? ''),
    actionType: String(raw.actionType ?? ''),
    actionTypeName: String(raw.actionType_name ?? raw.actionType ?? ''),
    status: (raw.status as ComplianceRuleRecord['status']) ?? 'INACTIVE',
    statusName: String(raw.status_name ?? raw.status ?? ''),
  };
}

function mapIssueItem(raw: Record<string, unknown>): DataQualityIssueRecord {
  return {
    issueId: String(raw.issueId ?? raw.id ?? ''),
    caseId: String(raw.caseId ?? ''),
    caseCode: String(raw.caseCode ?? ''),
    issueType: String(raw.issueType ?? ''),
    description: String(raw.description ?? ''),
    severity: (raw.severity as DataQualityIssueRecord['severity']) ?? 'WARNING',
    severityName: String(raw.severity_name ?? raw.severity ?? ''),
    status: (raw.status as DataQualityIssueRecord['status']) ?? 'PENDING',
    statusName: String(raw.status_name ?? raw.status ?? ''),
    createdAt: String(raw.createdAt ?? raw.created_at ?? ''),
  };
}

export const listComplianceAlerts = async (params: {
  status?: 'PENDING' | 'REPORTED' | 'EXEMPTED' | null;
  alertLevel?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | null;
} = {}): Promise<ComplianceAlertRecord[]> => {
  try {
    const result = await complianceBffApi.listAlertsBff(params);
    const items: Record<string, unknown>[] = result?.items ?? [];
    return items.map(mapAlertItem);
  } catch {
    return [];
  }
};

export const handleComplianceAlert = async (params: {
  alertId: string;
  action: 'CONVERT_TO_TASK' | 'DISMISS';
  notes?: string | null;
}): Promise<{ success: boolean; newTaskId?: string }> => {
  try {
    const result = await complianceBffApi.handleAlertBff(params);
    return { success: true, newTaskId: result?.new_task_id };
  } catch {
    return { success: false };
  }
};

export const listGovernanceIssues = async (params: {
  severity?: 'BLOCKER' | 'WARNING' | null;
  status?: 'PENDING' | 'RESOLVED' | 'IGNORED' | null;
} = {}): Promise<DataQualityIssueRecord[]> => {
  try {
    const result = await complianceBffApi.listGovernanceIssuesBff(params);
    const items: Record<string, unknown>[] = result?.items ?? [];
    return items.map(mapIssueItem);
  } catch {
    return [];
  }
};

export const triggerGovernanceScan = async (): Promise<GovernanceScanResult | null> => {
  try {
    const raw = await complianceBffApi.triggerGovernanceScanBff({ scope: 'ALL_ACTIVE' });
    if (!raw) return null;
    return {
      scanId: String(raw.scan_id ?? ''),
      status: String(raw.status ?? ''),
      estimatedCases: Number(raw.estimated_cases ?? 0),
    };
  } catch {
    return null;
  }
};

export const ignoreGovernanceIssue = async (issueId: string, reason: string): Promise<boolean> => {
  try {
    await complianceBffApi.ignoreGovernanceIssueBff({ issueId, reason });
    return true;
  } catch {
    return false;
  }
};

export const listComplianceRules = async (): Promise<ComplianceRuleRecord[]> => {
  try {
    const result = await complianceBffApi.listRulesBff();
    const items: Record<string, unknown>[] = result?.items ?? [];
    return items.map(mapRuleItem);
  } catch {
    return [];
  }
};

export const toggleComplianceRule = async (ruleId: string): Promise<boolean> => {
  try {
    await complianceBffApi.toggleRuleBff(ruleId);
    return true;
  } catch {
    return false;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 3.S14 — 报送任务中心 + AI 物料生成
// 退役: mock/reporting (getReportingTasks, updateTaskStatus, getSnapshots,
//        createSnapshot, createReportingTask, runConsistencyCheck, getTemplates)
//        mock/riskEngine (getDisclosureTasks in Workbench/Wizard)
// 接入: complianceBffApi tasks/* 12 端点
// D93 TemplateFactory 延迟 (R26) — compliance templates BFF 不在 2.S14 范围
// D94 getDisclosureTasks → listComplianceAlerts (PENDING)
// D95 R24 getReportDefinitions → listComplianceRules(CREATE_TASK) 映射
// D96 状态机标签: DATA_PREP/PENDING_APPROVAL/APPROVED/CANCELLED → 中文
// D97 runConsistencyCheck → listGovernanceIssues(BLOCKER) + 4210 拦截
// ─────────────────────────────────────────────────────────────────────────────

// ReportingTaskStatus 中文标签 (D96)
const TASK_STATUS_NAMES: Record<string, string> = {
  DATA_PREP: '数据准备中',
  PENDING_APPROVAL: '待审批',
  APPROVED: '已审批',
  CANCELLED: '已取消',
};

export interface ReportingTaskRecord {
  taskId: string;
  taskName: string;
  category: string;
  status: 'DATA_PREP' | 'PENDING_APPROVAL' | 'APPROVED' | 'CANCELLED';
  statusName: string;
  templateId: string | null;
  snapshotId: string | null;
  dueDate: string | null;
  cycleValue: string | null;
  reportUrl: string | null;
  contentData: string | null;
  createdAt: string;
  createdBy: string;
}

export interface DataSnapshotRecord {
  snapshotId: string;
  taskId: string;
  snapshotName: string;
  lockDate: string;
  recordCount: number;
  ossUrl: string | null;
  description: string | null;
  createdAt: string;
}

export interface TaskCreateResult {
  taskId: string;
  taskName: string;
  status: string;
}

export interface SnapshotCreateResult {
  snapshotId: string;
  snapshotName: string;
  lockDate: string;
  status: string;
}

export interface AiSummaryResult {
  taskId: string;
  snapshotId: string;
  promptType: string;
  summary: string;
  generatedAt: string;
  isStub: boolean;
}

// D95: ReportDefinition 兼容接口 (映射自 ComplianceRuleRecord, actionType=CREATE_TASK)
export interface ReportDefinitionFromRule {
  id: string;
  name: string;
  category: string;
  frequency: string;
  triggerType: string;
  targetOrg: string;
  format: string;
}

const mapTaskItem = (raw: Record<string, unknown>): ReportingTaskRecord => ({
  taskId: String(raw.task_id ?? raw.taskId ?? ''),
  taskName: String(raw.task_name ?? raw.taskName ?? ''),
  category: String(raw.category ?? 'COMPLIANCE_DISCLOSURE'),
  status: (raw.status ?? 'DATA_PREP') as ReportingTaskRecord['status'],
  statusName: TASK_STATUS_NAMES[String(raw.status ?? '')] ?? String(raw.status_name ?? raw.status ?? ''),
  templateId: raw.template_id != null ? String(raw.template_id) : null,
  snapshotId: raw.snapshot_id != null ? String(raw.snapshot_id) : null,
  dueDate: raw.due_date != null ? String(raw.due_date) : null,
  cycleValue: raw.cycle_value != null ? String(raw.cycle_value) : null,
  reportUrl: raw.report_url != null ? String(raw.report_url) : null,
  contentData: raw.content_data != null ? String(raw.content_data) : null,
  createdAt: String(raw.created_at ?? raw.createdAt ?? ''),
  createdBy: String(raw.created_by ?? raw.createdBy ?? ''),
});

const mapSnapshotItem = (raw: Record<string, unknown>): DataSnapshotRecord => ({
  snapshotId: String(raw.snapshot_id ?? raw.snapshotId ?? ''),
  taskId: String(raw.task_id ?? raw.taskId ?? ''),
  snapshotName: String(raw.snapshot_name ?? raw.snapshotName ?? ''),
  lockDate: String(raw.lock_date ?? raw.lockDate ?? ''),
  recordCount: Number(raw.record_count ?? raw.recordCount ?? 0),
  ossUrl: raw.oss_url != null ? String(raw.oss_url) : null,
  description: raw.description != null ? String(raw.description) : null,
  createdAt: String(raw.created_at ?? raw.createdAt ?? ''),
});

// — 报送任务列表
export const listReportingTasks = async (params: {
  status?: ReportingTaskRecord['status'] | null;
} = {}): Promise<ReportingTaskRecord[]> => {
  try {
    const result = await complianceBffApi.listTasksBff({
      category: 'COMPLIANCE_DISCLOSURE',
      status: params.status ?? null,
    });
    const items: Record<string, unknown>[] = result?.items ?? [];
    return items.map(mapTaskItem);
  } catch {
    return [];
  }
};

// — 创建报送任务
export const createReportingTaskBff = async (params: {
  taskName: string;
  templateId?: string | null;
  dueDate?: string | null;
  cycleValue?: string | null;
}): Promise<TaskCreateResult | null> => {
  try {
    const raw = await complianceBffApi.createTaskBff(params);
    if (!raw) return null;
    return {
      taskId: String(raw.task_id ?? ''),
      taskName: String(raw.task_name ?? ''),
      status: String(raw.status ?? 'DATA_PREP'),
    };
  } catch {
    return null;
  }
};

// — 更新任务状态 (D96: 状态机, Q5: APPROVED 终态)
export const updateReportingTaskStatus = async (
  taskId: string,
  targetStatus: ReportingTaskRecord['status'],
  comment?: string,
): Promise<boolean> => {
  try {
    await complianceBffApi.updateTaskStatusBff({ taskId, targetStatus, comment: comment ?? null });
    return true;
  } catch {
    return false;
  }
};

// — 关联案件 (Q4: 幂等)
export const linkCasesToTask = async (taskId: string, caseIds: string[]): Promise<number> => {
  try {
    const raw = await complianceBffApi.linkCasesToTaskBff({ taskId, caseIds });
    return Number(raw?.linked_count ?? 0);
  } catch {
    return 0;
  }
};

// — 创建快照 (D9: BLOCKER 拦截, 返回 null 并 throw 以便上层处理 4210)
export const createSnapshotBff = async (params: {
  taskId: string;
  snapshotName: string;
  lockDate: string;
  description?: string;
}): Promise<SnapshotCreateResult> => {
  const raw = await complianceBffApi.createSnapshotBff({
    taskId: params.taskId,
    snapshotName: params.snapshotName,
    lockDate: params.lockDate,
    description: params.description ?? null,
  });
  return {
    snapshotId: String(raw?.snapshot_id ?? ''),
    snapshotName: String(raw?.snapshot_name ?? ''),
    lockDate: String(raw?.lock_date ?? ''),
    status: String(raw?.status ?? ''),
  };
};

// — 快照历史列表
export const listSnapshotsBff = async (taskId: string): Promise<DataSnapshotRecord[]> => {
  try {
    const result = await complianceBffApi.listSnapshotsBff({ taskId });
    const items: Record<string, unknown>[] = result?.items ?? [];
    return items.map(mapSnapshotItem);
  } catch {
    return [];
  }
};

// — 定稿渲染 (D5=Stub, Q3: 仅 DATA_PREP 可调用)
export const generateReport = async (params: {
  taskId: string;
  snapshotId: string;
  excludedCaseIds?: string[];
}): Promise<{ reportUrl: string; isStub: boolean } | null> => {
  try {
    const raw = await complianceBffApi.generateReportBff(params);
    if (!raw) return null;
    return {
      reportUrl: String(raw.report_url ?? ''),
      isStub: Boolean(raw.is_stub ?? true),
    };
  } catch {
    return null;
  }
};

// — 组合下载 (错误码 4213: 未生成则抛出)
export const downloadTaskFiles = async (taskId: string): Promise<{ reportUrl: string; ossUrls: string[] } | null> => {
  try {
    const raw = await complianceBffApi.downloadTaskBff(taskId);
    if (!raw) return null;
    return {
      reportUrl: String(raw.report_url ?? ''),
      ossUrls: Array.isArray(raw.oss_urls) ? raw.oss_urls.map(String) : [],
    };
  } catch {
    return null;
  }
};

// D95 — R24: getReportDefinitions → 从 listComplianceRules(CREATE_TASK) 映射
// 仅返回 actionType=GENERATE_TASK 的规则，映射为向导兼容格式
export const getReportDefinitions = async (): Promise<ReportDefinitionFromRule[]> => {
  try {
    const rules = await listComplianceRules();
    return rules
      .filter(r => r.actionType === 'GENERATE_TASK' || r.actionType === 'CREATE_TASK')
      .map(r => ({
        id: r.ruleId,
        name: r.ruleName,
        category: r.ruleType,
        frequency: r.ruleType === 'TIME_TRIGGERED' ? 'PERIODIC' : 'EVENT_DRIVEN',
        triggerType: r.ruleType,
        targetOrg: '监管机构',
        format: 'EXCEL',
      }));
  } catch {
    return [];
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// ─── 3.S15: 线索管理 + 智能收件箱适配器 ────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

import clueBffApi from '../src/services/api/clueBffApi';

// ── 接口类型 ────────────────────────────────────────────────────────────────

export interface ClueRecord {
  clueId: string;
  clueTitle: string;
  description: string | null;
  sourceType: string;
  sourceTypeName: string;
  sourceId: string | null;
  businessLine: string | null;
  estimatedAmount: number | null;
  currency: string;
  opponentName: string | null;
  assigneeId: string | null;
  status: 'NEW' | 'FOLLOWING' | 'CONVERTED' | 'REJECTED' | 'CLOSED';
  statusName: string;
  convertedCaseId: string | null;
  closedReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InboxEmailRecord {
  emailId: string;
  subject: string;
  senderAddress: string;
  senderName: string;
  receivedAt: string;
  hasAttachments: boolean;
  isRead: boolean;
  processingStatus: 'UNPROCESSED' | 'CONVERTED_TO_CLUE' | 'LINKED_TO_CASE' | 'IGNORED';
  processingStatusName: string;
  aiSummary: string;
  aiRecommendation: string;
  aiRecommendationName: string;
  aiTags: string[];
  bodyHtml?: string;
  bodyText?: string;
  recipientTo?: string | null;
  recipientCc?: string | null;
  processedBy?: string | null;
  processedAt?: string | null;
}

export interface CluePrefillData {
  clueId: string;
  clueTitle: string;
  prefillData: {
    caseName: string;
    businessLine: string | null;
    estimatedAmount: number | null;
    currency: string;
    opponentName: string | null;
    sourceClueId: string;
    caseTypeCode: string;
  };
}

// ── Mappers ─────────────────────────────────────────────────────────────────

const CLUE_STATUS_NAMES: Record<string, string> = {
  NEW: '新线索',
  FOLLOWING: '跟进中',
  CONVERTED: '已转立案',
  REJECTED: '已驳回',
  CLOSED: '已关闭',
};

const mapClueItem = (raw: Record<string, unknown>): ClueRecord => ({
  clueId: String(raw.clue_id ?? raw.clueId ?? ''),
  clueTitle: String(raw.clue_title ?? raw.clueTitle ?? ''),
  description: raw.description != null ? String(raw.description) : null,
  sourceType: String(raw.source_type ?? raw.sourceType ?? 'MANUAL'),
  sourceTypeName: String(raw.source_type_name ?? raw.sourceTypeName ?? ''),
  sourceId: raw.source_id != null ? String(raw.source_id) : null,
  businessLine: raw.business_line != null ? String(raw.business_line) : null,
  estimatedAmount: raw.estimated_amount != null ? Number(raw.estimated_amount) : null,
  currency: String(raw.currency ?? 'CNY'),
  opponentName: raw.opponent_name != null ? String(raw.opponent_name) : null,
  assigneeId: raw.assignee_id != null ? String(raw.assignee_id) : null,
  status: (raw.status ?? 'NEW') as ClueRecord['status'],
  statusName: String(raw.status_name ?? raw.statusName ?? CLUE_STATUS_NAMES[String(raw.status ?? '')] ?? String(raw.status ?? '')),
  convertedCaseId: raw.converted_case_id != null ? String(raw.converted_case_id) : null,
  closedReason: raw.closed_reason != null ? String(raw.closed_reason) : null,
  createdAt: String(raw.created_at ?? raw.createdAt ?? ''),
  updatedAt: String(raw.updated_at ?? raw.updatedAt ?? ''),
});

const mapEmailItem = (raw: Record<string, unknown>): InboxEmailRecord => ({
  emailId: String(raw.email_id ?? raw.emailId ?? ''),
  subject: String(raw.subject ?? ''),
  senderAddress: String(raw.sender_address ?? raw.senderAddress ?? ''),
  senderName: String(raw.sender_name ?? raw.senderName ?? ''),
  receivedAt: String(raw.received_at ?? raw.receivedAt ?? ''),
  hasAttachments: Boolean(raw.has_attachments ?? raw.hasAttachments ?? false),
  isRead: Boolean(raw.is_read ?? raw.isRead ?? false),
  processingStatus: (raw.processing_status ?? 'UNPROCESSED') as InboxEmailRecord['processingStatus'],
  processingStatusName: String(raw.processing_status_name ?? raw.processingStatusName ?? ''),
  aiSummary: String(raw.ai_summary ?? raw.aiSummary ?? ''),
  aiRecommendation: String(raw.ai_recommendation ?? raw.aiRecommendation ?? ''),
  aiRecommendationName: String(raw.ai_recommendation_name ?? raw.aiRecommendationName ?? ''),
  aiTags: Array.isArray(raw.ai_tags) ? (raw.ai_tags as unknown[]).map(String) : [],
  bodyHtml: raw.body_html != null ? String(raw.body_html) : undefined,
  bodyText: raw.body_text != null ? String(raw.body_text) : undefined,
  recipientTo: raw.recipient_to != null ? String(raw.recipient_to) : null,
  recipientCc: raw.recipient_cc != null ? String(raw.recipient_cc) : null,
  processedBy: raw.processed_by != null ? String(raw.processed_by) : null,
  processedAt: raw.processed_at != null ? String(raw.processed_at) : null,
});

// ── 线索管理 ─────────────────────────────────────────────────────────────────

export const listClues = async (params: {
  status?: ClueRecord['status'] | null;
  sourceType?: string | null;
  keyword?: string | null;
  page?: number;
} = {}): Promise<ClueRecord[]> => {
  try {
    const result = await clueBffApi.listCluesBff(params);
    const items: Record<string, unknown>[] = result?.items ?? [];
    return items.map(mapClueItem);
  } catch {
    return [];
  }
};

export const getClueDetail = async (clueId: string): Promise<ClueRecord | null> => {
  try {
    const raw = await clueBffApi.getClueDetailBff(clueId);
    if (!raw) return null;
    return mapClueItem(raw as Record<string, unknown>);
  } catch {
    return null;
  }
};

export const createClue = async (params: {
  clueTitle: string;
  description?: string | null;
  sourceType?: string;
  opponentName?: string | null;
  estimatedAmount?: number | null;
  businessLine?: string | null;
  sourceId?: string | null;
}): Promise<{ clueId: string; status: string } | null> => {
  try {
    const raw = await clueBffApi.createClueBff({
      clueTitle: params.clueTitle,
      description: params.description ?? null,
      sourceType: params.sourceType ?? 'MANUAL',
      opponentName: params.opponentName ?? null,
      estimatedAmount: params.estimatedAmount ?? null,
      businessLine: params.businessLine ?? null,
      sourceId: params.sourceId ?? null,
    });
    if (!raw) return null;
    return { clueId: String(raw.clue_id ?? ''), status: String(raw.status ?? 'NEW') };
  } catch {
    return null;
  }
};

export const updateClue = async (params: {
  clueId: string;
  clueTitle?: string;
  description?: string | null;
  opponentName?: string | null;
  estimatedAmount?: number | null;
  businessLine?: string | null;
}): Promise<boolean> => {
  try {
    await clueBffApi.updateClueBff(params);
    return true;
  } catch {
    return false;
  }
};

export const assignClue = async (clueId: string, assigneeId: string): Promise<boolean> => {
  try {
    await clueBffApi.assignClueBff(clueId, assigneeId);
    return true;
  } catch {
    return false;
  }
};

export const closeClue = async (
  clueId: string,
  targetStatus: 'REJECTED' | 'CLOSED',
  closedReason?: string,
): Promise<boolean> => {
  try {
    await clueBffApi.closeClueBff({ clueId, targetStatus, closedReason });
    return true;
  } catch {
    return false;
  }
};

export const prepareClueForCase = async (clueId: string): Promise<CluePrefillData | null> => {
  try {
    const raw = await clueBffApi.prepareClueForCaseBff(clueId);
    if (!raw) return null;
    const pf = (raw.prefill_data ?? raw.prefillData ?? {}) as Record<string, unknown>;
    return {
      clueId: String(raw.clue_id ?? raw.clueId ?? clueId),
      clueTitle: String(raw.clue_title ?? raw.clueTitle ?? ''),
      prefillData: {
        caseName: String(pf.case_name ?? pf.caseName ?? ''),
        businessLine: pf.business_line != null ? String(pf.business_line) : pf.businessLine != null ? String(pf.businessLine) : null,
        estimatedAmount: pf.estimated_amount != null ? Number(pf.estimated_amount) : pf.estimatedAmount != null ? Number(pf.estimatedAmount) : null,
        currency: String(pf.currency ?? 'CNY'),
        opponentName: pf.opponent_name != null ? String(pf.opponent_name) : pf.opponentName != null ? String(pf.opponentName) : null,
        sourceClueId: String(pf.source_clue_id ?? pf.sourceClueId ?? clueId),
        caseTypeCode: String(pf.case_type_code ?? pf.caseTypeCode ?? 'CIVIL_LITIGATION'),
      },
    };
  } catch {
    return null;
  }
};

// ── 智能收件箱 ───────────────────────────────────────────────────────────────

export const listInboxEmails = async (params: {
  processingStatus?: InboxEmailRecord['processingStatus'] | null;
  isRead?: boolean | null;
  keyword?: string | null;
} = {}): Promise<{ items: InboxEmailRecord[]; unreadCount: number; total: number }> => {
  try {
    const result = await clueBffApi.listInboxEmailsBff(params);
    const items: Record<string, unknown>[] = result?.items ?? [];
    return {
      items: items.map(mapEmailItem),
      unreadCount: Number(result?.unread_count ?? 0),
      total: Number(result?.total ?? items.length),
    };
  } catch {
    return { items: [], unreadCount: 0, total: 0 };
  }
};

export const getInboxEmailDetail = async (emailId: string): Promise<InboxEmailRecord | null> => {
  try {
    const raw = await clueBffApi.getInboxEmailDetailBff(emailId);
    if (!raw) return null;
    return mapEmailItem(raw as Record<string, unknown>);
  } catch {
    return null;
  }
};

export const markEmailRead = async (emailId: string): Promise<boolean> => {
  try {
    await clueBffApi.markEmailReadBff(emailId);
    return true;
  } catch {
    return false;
  }
};

export const convertEmailToClue = async (params: {
  emailId: string;
  clueTitle?: string;
  description?: string | null;
  estimatedAmount?: number | null;
  opponentName?: string | null;
}): Promise<{ emailId: string; clueId: string } | null> => {
  try {
    const raw = await clueBffApi.convertEmailToClueBff(params);
    if (!raw) return null;
    return {
      emailId: String(raw.email_id ?? params.emailId),
      clueId: String(raw.clue_id ?? ''),
    };
  } catch {
    return null;
  }
};

export const linkEmailToCase = async (params: {
  emailId: string;
  caseId: string;
  note?: string;
}): Promise<boolean> => {
  try {
    await clueBffApi.linkEmailToCaseBff(params);
    return true;
  } catch {
    return false;
  }
};

export const ignoreEmail = async (emailId: string, reason?: string): Promise<boolean> => {
  try {
    await clueBffApi.ignoreEmailBff(emailId, reason);
    return true;
  } catch {
    return false;
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// ─── 3.S16: 系统字典后台 + RBAC/菜单管理适配器 ──────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

import adminBffApi from '../src/services/api/adminBffApi';

// ── 接口类型 ────────────────────────────────────────────────────────────────

export interface DictTypeRecord {
  dictType: string;
  dictTypeName: string;
  itemCount: number;
}

export interface DictItemRecord {
  namespace?: string;
  version?: number;
  isSystem?: boolean;
  editPolicy?: string;
  dictId: string;
  dictType: string;
  dictCode: string;
  dictName: string;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  remark: string | null;
  children?: DictItemRecord[];
}

export interface RoleRecord {
  roleId: string;
  roleCode: string;
  roleName: string;
  description: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  isBuiltin: boolean;
  createdAt: string;
}

export interface MenuNode {
  menuId: string;
  menuName: string;
  menuType: 'DIR' | 'MENU' | 'BUTTON';
  parentId: string | null;
  path: string | null;
  permissionKey: string | null;
  icon: string | null;
  sortOrder: number;
  status: 'ACTIVE' | 'INACTIVE';
  children?: MenuNode[];
}

// ── 字段映射 ────────────────────────────────────────────────────────────────

function mapDictType(raw: Record<string, unknown>): DictTypeRecord {
  return {
    dictType: String(raw.dict_type ?? raw.dictType ?? ''),
    dictTypeName: String(raw.dict_type_name ?? raw.dictTypeName ?? raw.dict_type ?? ''),
    itemCount: Number(raw.item_count ?? raw.itemCount ?? 0),
  };
}

function mapDictItem(raw: Record<string, unknown>): DictItemRecord {
  const children = Array.isArray(raw.children)
    ? (raw.children as Record<string, unknown>[]).map(mapDictItem)
    : undefined;
  return {
    namespace: String(raw.namespace ?? 'cases'),
    version: Number(raw.version ?? 1),
    isSystem: Boolean(raw.isSystem ?? raw.is_system ?? false),
    editPolicy: String(raw.editPolicy ?? raw.edit_policy ?? ''),
    dictId: String(raw.dict_id ?? raw.dictId ?? raw.id ?? ''),
    dictType: String(raw.dict_type ?? raw.dictType ?? ''),
    dictCode: String(raw.dict_code ?? raw.dictCode ?? ''),
    dictName: String(raw.dict_name ?? raw.dictName ?? ''),
    parentId: raw.parent_id != null ? String(raw.parent_id) : (raw.parentId != null ? String(raw.parentId) : null),
    sortOrder: Number(raw.sort_order ?? raw.sortOrder ?? 0),
    isActive: Boolean(raw.is_active ?? raw.isActive ?? true),
    remark: raw.remark != null ? String(raw.remark) : raw.description != null ? String(raw.description) : null,
    children,
  };
}

function mapRole(raw: Record<string, unknown>): RoleRecord {
  return {
    roleId: String(raw.role_id ?? raw.roleId ?? ''),
    roleCode: String(raw.role_code ?? raw.roleCode ?? ''),
    roleName: String(raw.role_name ?? raw.roleName ?? ''),
    description: raw.description != null ? String(raw.description) : null,
    status: (raw.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE') as RoleRecord['status'],
    isBuiltin: Boolean(raw.is_builtin ?? raw.isBuiltin ?? false),
    createdAt: String(raw.created_at ?? raw.createdAt ?? ''),
  };
}

function mapMenuNode(raw: Record<string, unknown>): MenuNode {
  const children = Array.isArray(raw.children)
    ? (raw.children as Record<string, unknown>[]).map(mapMenuNode)
    : undefined;
  return {
    menuId: String(raw.menu_id ?? raw.menuId ?? ''),
    menuName: String(raw.menu_name ?? raw.menuName ?? ''),
    menuType: (raw.menu_type ?? raw.menuType ?? 'MENU') as MenuNode['menuType'],
    parentId: raw.parent_id != null ? String(raw.parent_id) : (raw.parentId != null ? String(raw.parentId) : null),
    path: raw.routePath != null ? String(raw.routePath) : (raw.path != null ? String(raw.path) : null),
    permissionKey: raw.permission_key != null ? String(raw.permission_key) : (raw.permissionKey != null ? String(raw.permissionKey) : null),
    icon: raw.icon != null ? String(raw.icon) : null,
    sortOrder: Number(raw.sort_order ?? raw.sortOrder ?? 0),
    status: (raw.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE') as MenuNode['status'],
    children,
  };
}

// ── 字典管理 ─────────────────────────────────────────────────────────────────

export const listDictTypes = async (): Promise<DictTypeRecord[]> => {
  try {
    const raw = await adminBffApi.dictTypesList();
    const items: Record<string, unknown>[] = raw?.items ?? raw ?? [];
    return items.map(mapDictType);
  } catch (error) { throw error; }
};

export const getDictTree = async (dictType: string): Promise<DictItemRecord[]> => {
  try {
    const raw = await adminBffApi.dictItemsTree(dictType);
    const items: Record<string, unknown>[] = raw?.items ?? raw ?? [];
    return items.map(mapDictItem);
  } catch (error) { throw error; }
};

export const listDictItems = async (params: {
  dictType?: string | null;
  keyword?: string | null;
} = {}): Promise<DictItemRecord[]> => {
  try {
    const raw = await adminBffApi.dictItemsList(params);
    const items: Record<string, unknown>[] = raw?.items ?? raw ?? [];
    return items.map(mapDictItem);
  } catch (error) { throw error; }
};

export const createDictItem = async (params: {
  dictType: string;
  dictCode: string;
  dictName: string;
  parentId?: string | null;
  sortOrder?: number;
  remark?: string | null;
}): Promise<DictItemRecord | null> => {
  try {
    const raw = await adminBffApi.dictItemsCreate({ ...params, description: params.remark });
    if (!raw) return null;
    return mapDictItem(raw as Record<string, unknown>);
  } catch (error) { throw error; }
};

export const updateDictItem = async (params: {
  version?: number;
  dictId: string;
  dictName: string;
  sortOrder?: number;
  isActive?: boolean;
  remark?: string | null;
}): Promise<boolean> => {
  try {
    await adminBffApi.dictItemsUpdate({
      itemId: params.dictId,
      version: params.version,
      dictName: params.dictName,
      sortOrder: params.sortOrder,
      isActive: params.isActive,
      description: params.remark,
    });
    return true;
  } catch (error) { throw error; }
};

export const deleteDictItem = async (dictId: string): Promise<boolean> => {
  try {
    await adminBffApi.dictItemsDelete(dictId);
    return true;
  } catch (error) { throw error; }
};

// ── 角色管理 ─────────────────────────────────────────────────────────────────

export const listRoles = async (params: {
  keyword?: string | null;
  status?: string | null;
} = {}): Promise<RoleRecord[]> => {
  try {
    const raw = await adminBffApi.rolesList(params);
    const items: Record<string, unknown>[] = raw?.items ?? raw ?? [];
    return items.map(mapRole);
  } catch (error) { throw error; }
};

export const createRole = async (params: {
  roleCode: string;
  roleName: string;
  description?: string | null;
}): Promise<RoleRecord | null> => {
  try {
    const raw = await adminBffApi.rolesCreate(params);
    if (!raw) return null;
    return mapRole(raw as Record<string, unknown>);
  } catch (error) { throw error; }
};

export const updateRole = async (params: {
  roleId: string;
  roleName: string;
  description?: string | null;
}): Promise<boolean> => {
  try {
    await adminBffApi.rolesUpdate(params);
    return true;
  } catch (error) { throw error; }
};

export const deleteRole = async (roleId: string): Promise<boolean> => {
  try {
    await adminBffApi.rolesDelete(roleId);
    return true;
  } catch (error) { throw error; }
};

export const toggleRole = async (roleId: string, status: 'ACTIVE' | 'INACTIVE'): Promise<boolean> => {
  try {
    await adminBffApi.rolesToggle(roleId, status);
    return true;
  } catch (error) { throw error; }
};

export const getRoleMenuIds = async (roleId: string): Promise<string[]> => {
  try {
    const raw = await adminBffApi.roleMenusList(roleId);
    const ids: unknown[] = raw?.menu_ids ?? raw?.menuIds ?? raw ?? [];
    return ids.map(String);
  } catch (error) { throw error; }
};

export const saveRoleMenus = async (roleId: string, menuIds: string[]): Promise<boolean> => {
  try {
    await adminBffApi.roleMenusSave(roleId, menuIds);
    return true;
  } catch (error) { throw error; }
};

// ── 菜单管理 ─────────────────────────────────────────────────────────────────

export const getMenuTree = async (): Promise<MenuNode[]> => {
  try {
    const raw = await adminBffApi.menusTree();
    const items: Record<string, unknown>[] = raw?.items ?? raw ?? [];
    return items.map(mapMenuNode);
  } catch (error) { throw error; }
};

export const createMenu = async (params: {
  menuName: string;
  menuType: 'DIR' | 'MENU' | 'BUTTON';
  parentId?: string | null;
  path?: string | null;
  permissionKey?: string | null;
  icon?: string | null;
  sortOrder?: number;
}): Promise<MenuNode | null> => {
  try {
    const raw = await adminBffApi.menusCreate({
      menuName: params.menuName,
      menuType: params.menuType,
      parentId: params.parentId,
      routePath: params.path,
      permissionKey: params.permissionKey,
      icon: params.icon,
      sortOrder: params.sortOrder,
    });
    if (!raw) return null;
    return mapMenuNode(raw as Record<string, unknown>);
  } catch (error) { throw error; }
};

export const updateMenu = async (params: {
  menuId: string;
  menuName: string;
  path?: string | null;
  permissionKey?: string | null;
  icon?: string | null;
  sortOrder?: number;
}): Promise<boolean> => {
  try {
    await adminBffApi.menusUpdate({
      menuId: params.menuId,
      menuName: params.menuName,
      routePath: params.path,
      permissionKey: params.permissionKey,
      icon: params.icon,
      sortOrder: params.sortOrder,
    });
    return true;
  } catch (error) { throw error; }
};

export const deleteMenu = async (menuId: string): Promise<boolean> => {
  try {
    await adminBffApi.menusDelete(menuId);
    return true;
  } catch (error) { throw error; }
};

// ═══════════════════════════════════════════════════════════════════════════════
// ─── 3.S17: 律所库 + 模板库 + 法律大脑适配器 ─────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

import vendorsBffApi from '../src/services/api/vendorsBffApi';
import templatesBffApi from '../src/services/api/templatesBffApi';
import aiBffApi from '../src/services/api/aiBffApi';

// ── 接口类型 ────────────────────────────────────────────────────────────────

export interface VendorRecord {
  firmId: string;
  firmName: string;
  unifiedSocialCreditCode: string | null;
  cooperationStatus: string;
  cooperationStatusName: string;
  ratingLevel: string | null;
  ratingLevelName: string | null;
  activeLawyerCount: number;
  profile?: string | null;
  rateCardSummary?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface VendorCaseItem {
  counselId: string;
  caseId: string;
  caseName: string;
  role: string;
  roleName: string;
  status: string;
  statusName: string;
}

export interface LawyerRecord {
  lawyerId: string;
  firmId: string;
  firmName: string | null;
  lawyerName: string;
  licenseNumber: string | null;
  title: string | null;
  expertise: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  status: string;
  statusName: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface DocTemplateRecord {
  templateId: string;
  templateName: string;
  category: string;
  categoryName: string;
  fileType: string;
  fileTypeName: string;
  fileUrl: string;
  version: number;
  status: string;
  statusName: string;
  description: string | null;
  updatedAt: string | null;
}

export interface ProcessTemplateRecord {
  processTemplateId: string;
  caseTypeCode: string;
  stageCode: string;
  stageName: string;
  sortOrder: number;
  isRequired: boolean;
  description: string | null;
  isActive: boolean;
  taskCount: number;
  tasks?: TaskTemplateRecord[];
}

export interface TaskTemplateRecord {
  taskTemplateId: string;
  processTemplateId: string;
  taskCode: string | null;
  taskName: string;
  taskGroup: string | null;
  isMilestone: boolean;
  isRequired: boolean;
  sortOrder: number;
  defaultDaysDue: number | null;
  description: string | null;
  isActive: boolean;
}

export interface SimilarCaseRecord {
  caseId: string;
  caseName: string;
  similarity: number;
  outcome: string | null;
  outcomeName: string | null;
  amount: number | null;
  isStub: boolean;
  // WP-AI-00 扩展字段（兼容外部类案检索新契约）
  sourceScope?: 'EXTERNAL' | 'INTERNAL' | 'ALL';
  sourceIndex?: string | null;
  matchReason?: string | null;
  matchedFields?: string[];
  // WP-AI-04 增强：类案详情字段
  caseNo?: string | null;
  courtName?: string | null;
  courtLevel?: string | null;
  province?: string | null;
  causeOfAction?: string | null;
  trialProcedure?: string | null;
  documentType?: string | null;
  refereeDate?: string | null;
  refereeResult?: string | null;
  refereeBasis?: string | null;
  summary?: string | null;
  basicFact?: string | null;
  focusDispute?: string | null;
  courtBelieves?: string | null;
  courtFound?: string | null;
  alleged?: string | null;
  argue?: string | null;
  keywords?: string | null;
  litigationParticipant?: string | null;
  snippets?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// WP-AI-02: 策略推荐前端业务类型
// ═══════════════════════════════════════════════════════════════════════════════

export interface StrategyRecommendationRecord {
  caseId: string;
  isStub: boolean;
  generatedAt: string;
  confidence: number;
  caseAutoSummary: string;
  materialCompleteness: {
    score: number;
    level: 'LOW' | 'MEDIUM' | 'HIGH';
    missingItems: string[];
  };
  pendingMaterialTasks: string[];
  similarCases: SimilarCaseRecord[];
  strategyPoints: string[];
  actionRecommendations: string[];
  evidenceReinforcement: string[];
  riskWarnings: string[];
  recommendedStrategyText: string;
}

// ── 字段映射 ────────────────────────────────────────────────────────────────

function mapVendor(raw: Record<string, unknown>): VendorRecord {
  return {
    firmId: String(raw.firmId ?? raw.firm_id ?? ''),
    firmName: String(raw.firmName ?? raw.firm_name ?? ''),
    unifiedSocialCreditCode: raw.unifiedSocialCreditCode != null ? String(raw.unifiedSocialCreditCode) : null,
    cooperationStatus: String(raw.cooperationStatus ?? raw.cooperation_status ?? ''),
    cooperationStatusName: String(raw.cooperationStatusName ?? raw.cooperation_status_name ?? ''),
    ratingLevel: raw.ratingLevel != null ? String(raw.ratingLevel) : null,
    ratingLevelName: raw.ratingLevelName != null ? String(raw.ratingLevelName) : null,
    activeLawyerCount: Number(raw.activeLawyerCount ?? raw.active_lawyer_count ?? 0),
    profile: raw.profile != null ? String(raw.profile) : null,
    rateCardSummary: raw.rateCardSummary != null ? String(raw.rateCardSummary) : null,
    createdAt: raw.createdAt != null ? String(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt != null ? String(raw.updatedAt) : undefined,
  };
}

function mapLawyer(raw: Record<string, unknown>): LawyerRecord {
  return {
    lawyerId: String(raw.lawyerId ?? raw.lawyer_id ?? ''),
    firmId: String(raw.firmId ?? raw.firm_id ?? ''),
    firmName: raw.firmName != null ? String(raw.firmName) : null,
    lawyerName: String(raw.lawyerName ?? raw.lawyer_name ?? ''),
    licenseNumber: raw.licenseNumber != null ? String(raw.licenseNumber) : null,
    title: raw.title != null ? String(raw.title) : null,
    expertise: raw.expertise != null ? String(raw.expertise) : null,
    contactPhone: raw.contactPhone != null ? String(raw.contactPhone) : null,
    contactEmail: raw.contactEmail != null ? String(raw.contactEmail) : null,
    status: String(raw.status ?? 'ACTIVE'),
    statusName: String(raw.statusName ?? raw.status_name ?? ''),
    createdAt: raw.createdAt != null ? String(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt != null ? String(raw.updatedAt) : undefined,
  };
}

function mapDocTemplate(raw: Record<string, unknown>): DocTemplateRecord {
  return {
    templateId: String(raw.templateId ?? raw.template_id ?? ''),
    templateName: String(raw.templateName ?? raw.template_name ?? ''),
    category: String(raw.category ?? ''),
    categoryName: String(raw.categoryName ?? raw.category_name ?? ''),
    fileType: String(raw.fileType ?? raw.file_type ?? ''),
    fileTypeName: String(raw.fileTypeName ?? raw.file_type_name ?? ''),
    fileUrl: String(raw.fileUrl ?? raw.file_url ?? ''),
    version: Number(raw.version ?? 1),
    status: String(raw.status ?? 'ACTIVE'),
    statusName: String(raw.statusName ?? raw.status_name ?? ''),
    description: raw.description != null ? String(raw.description) : null,
    updatedAt: raw.updatedAt != null ? String(raw.updatedAt) : null,
  };
}

function mapProcessTemplate(raw: Record<string, unknown>): ProcessTemplateRecord {
  const tasks = Array.isArray(raw.tasks)
    ? (raw.tasks as Record<string, unknown>[]).map(mapTaskTemplate)
    : undefined;
  return {
    processTemplateId: String(raw.processTemplateId ?? raw.process_template_id ?? ''),
    caseTypeCode: String(raw.caseTypeCode ?? raw.case_type_code ?? ''),
    stageCode: String(raw.stageCode ?? raw.stage_code ?? ''),
    stageName: String(raw.stageName ?? raw.stage_name ?? ''),
    sortOrder: Number(raw.sortOrder ?? raw.sort_order ?? 0),
    isRequired: Boolean(raw.isRequired ?? raw.is_required ?? true),
    description: raw.description != null ? String(raw.description) : null,
    isActive: Boolean(raw.isActive ?? raw.is_active ?? true),
    taskCount: Number(raw.taskCount ?? raw.task_count ?? 0),
    tasks,
  };
}

function mapTaskTemplate(raw: Record<string, unknown>): TaskTemplateRecord {
  return {
    taskTemplateId: String(raw.taskTemplateId ?? raw.task_template_id ?? ''),
    processTemplateId: String(raw.processTemplateId ?? raw.process_template_id ?? ''),
    taskCode: raw.taskCode != null ? String(raw.taskCode) : null,
    taskName: String(raw.taskName ?? raw.task_name ?? ''),
    taskGroup: raw.taskGroup != null ? String(raw.taskGroup) : null,
    isMilestone: Boolean(raw.isMilestone ?? raw.is_milestone ?? false),
    isRequired: Boolean(raw.isRequired ?? raw.is_required ?? true),
    sortOrder: Number(raw.sortOrder ?? raw.sort_order ?? 0),
    defaultDaysDue: raw.defaultDaysDue != null ? Number(raw.defaultDaysDue) : null,
    description: raw.description != null ? String(raw.description) : null,
    isActive: Boolean(raw.isActive ?? raw.is_active ?? true),
  };
}

function mapSimilarCase(raw: Record<string, unknown>, isStubOverride?: boolean): SimilarCaseRecord {
  // WP-AI-00 兼容映射: internal_case_id ?? external_doc_id ?? display_id -> caseId
  const caseId = String(
    raw.internalCaseId ?? raw.internal_case_id
      ?? raw.externalDocId ?? raw.external_doc_id
      ?? raw.caseId ?? raw.case_id
      ?? raw.displayId ?? raw.display_id
      ?? '',
  );
  const caseName = String(
    raw.caseName ?? raw.case_name
      ?? raw.title
      ?? raw.displayTitle ?? raw.display_title
      ?? raw.displayId ?? raw.display_id
      ?? '未命名文书',
  );
  const outcome = raw.refereeResult != null ? String(raw.refereeResult)
    : raw.referee_result != null ? String(raw.referee_result)
    : raw.outcome != null ? String(raw.outcome)
    : null;
  return {
    caseId,
    caseName,
    similarity: Number(raw.similarity ?? 0),
    outcome,
    outcomeName: outcome,
    amount: raw.amount != null ? Number(raw.amount) : null,
    isStub: isStubOverride ?? Boolean(raw.isStub ?? raw.is_stub ?? true),
    sourceScope: (raw.sourceScope ?? raw.source_scope ?? 'EXTERNAL') as SimilarCaseRecord['sourceScope'],
    sourceIndex: raw.sourceIndex != null ? String(raw.sourceIndex)
      : raw.source_index != null ? String(raw.source_index) : null,
    matchReason: raw.matchReason != null ? String(raw.matchReason)
      : raw.match_reason != null ? String(raw.match_reason) : null,
    matchedFields: Array.isArray(raw.matchedFields ?? raw.matched_fields)
      ? ((raw.matchedFields ?? raw.matched_fields) as string[])
      : [],
    // WP-AI-04 增强字段
    caseNo: raw.caseNo != null ? String(raw.caseNo)
      : raw.case_no != null ? String(raw.case_no) : null,
    courtName: raw.courtName != null ? String(raw.courtName)
      : raw.court_name != null ? String(raw.court_name) : null,
    courtLevel: raw.courtLevel != null ? String(raw.courtLevel)
      : raw.court_level != null ? String(raw.court_level) : null,
    province: raw.province != null ? String(raw.province) : null,
    causeOfAction: raw.causeOfAction != null ? String(raw.causeOfAction)
      : raw.cause_of_action != null ? String(raw.cause_of_action) : null,
    trialProcedure: raw.trialProcedure != null ? String(raw.trialProcedure)
      : raw.trial_procedure != null ? String(raw.trial_procedure) : null,
    documentType: raw.documentType != null ? String(raw.documentType)
      : raw.document_type != null ? String(raw.document_type) : null,
    refereeDate: raw.refereeDate != null ? String(raw.refereeDate)
      : raw.referee_date != null ? String(raw.referee_date) : null,
    refereeResult: raw.refereeResult != null ? String(raw.refereeResult)
      : raw.referee_result != null ? String(raw.referee_result) : null,
    refereeBasis: raw.refereeBasis != null ? String(raw.refereeBasis)
      : raw.referee_basis != null ? String(raw.referee_basis) : null,
    summary: raw.summary != null ? String(raw.summary) : null,
    basicFact: raw.basicFact != null ? String(raw.basicFact)
      : raw.basic_fact != null ? String(raw.basic_fact) : null,
    focusDispute: raw.focusDispute != null ? String(raw.focusDispute)
      : raw.focus_dispute != null ? String(raw.focus_dispute) : null,
    courtBelieves: raw.courtBelieves != null ? String(raw.courtBelieves)
      : raw.court_believes != null ? String(raw.court_believes) : null,
    courtFound: raw.courtFound != null ? String(raw.courtFound)
      : raw.court_found != null ? String(raw.court_found) : null,
    alleged: raw.alleged != null ? String(raw.alleged) : null,
    argue: raw.argue != null ? String(raw.argue) : null,
    keywords: raw.keywords != null ? String(raw.keywords) : null,
    litigationParticipant: raw.litigationParticipant != null ? String(raw.litigationParticipant)
      : raw.litigation_participant != null ? String(raw.litigation_participant) : null,
    snippets: Array.isArray(raw.snippets ?? raw.snippets)
      ? ((raw.snippets ?? raw.snippets) as string[])
      : [],
  };
}

// ── 律所管理 ──────────────────────────────────────────────────────────────────

export const listVendors = async (params: {
  page?: number;
  pageSize?: number;
  keyword?: string | null;
  cooperationStatus?: string | null;
  ratingLevel?: string | null;
} = {}): Promise<{ total: number; items: VendorRecord[] }> => {
  try {
    const raw = await vendorsBffApi.vendorsList(params);
    const items: Record<string, unknown>[] = raw?.items ?? [];
    return { total: Number(raw?.total ?? items.length), items: items.map(mapVendor) };
  } catch {
    return { total: 0, items: [] };
  }
};

export const getVendorDetail = async (firmId: string): Promise<VendorRecord | null> => {
  try {
    const raw = await vendorsBffApi.vendorsDetail(firmId);
    if (!raw) return null;
    return mapVendor(raw as Record<string, unknown>);
  } catch (error) { throw error; }
};

export const createVendorRecord = async (params: {
  firmName: string;
  unifiedSocialCreditCode?: string | null;
  profile?: string | null;
  rateCardSummary?: string | null;
  cooperationStatus?: string;
  ratingLevel?: string | null;
}): Promise<{ firmId: string; firmName: string } | null> => {
  try {
    const raw = await vendorsBffApi.vendorsCreate(params);
    if (!raw) return null;
    return { firmId: String(raw.firmId ?? ''), firmName: String(raw.firmName ?? '') };
  } catch (error) { throw error; }
};

export const updateVendorRecord = async (params: {
  firmId: string;
  firmName: string;
  unifiedSocialCreditCode?: string | null;
  profile?: string | null;
  rateCardSummary?: string | null;
  ratingLevel?: string | null;
}): Promise<boolean> => {
  try {
    await vendorsBffApi.vendorsUpdate(params);
    return true;
  } catch (error) { throw error; }
};

export const toggleVendorStatus = async (firmId: string, targetStatus: string): Promise<boolean> => {
  try {
    await vendorsBffApi.vendorsToggle(firmId, targetStatus);
    return true;
  } catch (error) { throw error; }
};

export const getVendorCases = async (firmId: string, params: { page?: number; pageSize?: number } = {}): Promise<{ total: number; items: VendorCaseItem[] }> => {
  try {
    const raw = await vendorsBffApi.vendorsCases(firmId, params);
    const items: Record<string, unknown>[] = raw?.items ?? [];
    return {
      total: Number(raw?.total ?? items.length),
      items: items.map(r => ({
        counselId: String(r.counselId ?? ''),
        caseId: String(r.caseId ?? ''),
        caseName: String(r.caseName ?? ''),
        role: String(r.role ?? ''),
        roleName: String(r.roleName ?? ''),
        status: String(r.status ?? ''),
        statusName: String(r.statusName ?? ''),
      })),
    };
  } catch {
    return { total: 0, items: [] };
  }
};

// ── 外部律师管理 ──────────────────────────────────────────────────────────────

export const listLawyers = async (params: {
  page?: number;
  pageSize?: number;
  keyword?: string | null;
  firmId?: string | null;
  status?: string | null;
} = {}): Promise<{ total: number; items: LawyerRecord[] }> => {
  try {
    const raw = await vendorsBffApi.lawyersList(params);
    const items: Record<string, unknown>[] = raw?.items ?? [];
    return { total: Number(raw?.total ?? items.length), items: items.map(mapLawyer) };
  } catch {
    return { total: 0, items: [] };
  }
};

export const getLawyerDetail = async (lawyerId: string): Promise<LawyerRecord | null> => {
  try {
    const raw = await vendorsBffApi.lawyersDetail(lawyerId);
    if (!raw) return null;
    return mapLawyer(raw as Record<string, unknown>);
  } catch (error) { throw error; }
};

export const createLawyer = async (params: {
  firmId: string;
  lawyerName: string;
  licenseNumber?: string | null;
  title?: string | null;
  expertise?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  status?: string;
}): Promise<{ lawyerId: string } | null> => {
  try {
    const raw = await vendorsBffApi.lawyersCreate(params);
    if (!raw) return null;
    return { lawyerId: String(raw.lawyerId ?? '') };
  } catch (error) { throw error; }
};

export const updateLawyer = async (params: {
  lawyerId: string;
  lawyerName?: string | null;
  licenseNumber?: string | null;
  title?: string | null;
  expertise?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  status?: string | null;
}): Promise<boolean> => {
  try {
    await vendorsBffApi.lawyersUpdate(params);
    return true;
  } catch (error) { throw error; }
};

// ── 文档模板管理 ──────────────────────────────────────────────────────────────

export const listDocTemplates = async (params: {
  page?: number;
  pageSize?: number;
  keyword?: string | null;
  category?: string | null;
  status?: string | null;
} = {}): Promise<{ total: number; items: DocTemplateRecord[] }> => {
  try {
    const raw = await templatesBffApi.docList(params);
    const items: Record<string, unknown>[] = raw?.items ?? [];
    return { total: Number(raw?.total ?? items.length), items: items.map(mapDocTemplate) };
  } catch {
    return { total: 0, items: [] };
  }
};

export const getDocTemplateDetail = async (templateId: string): Promise<DocTemplateRecord | null> => {
  try {
    const raw = await templatesBffApi.docDetail(templateId);
    if (!raw) return null;
    return mapDocTemplate(raw as Record<string, unknown>);
  } catch (error) { throw error; }
};

export const createDocTemplate = async (params: {
  templateName: string;
  category: string;
  fileUrl: string;
  fileType: string;
  description?: string | null;
}): Promise<{ templateId: string } | null> => {
  try {
    const raw = await templatesBffApi.docCreate(params);
    if (!raw) return null;
    return { templateId: String(raw.templateId ?? '') };
  } catch (error) { throw error; }
};

export const updateDocTemplate = async (params: {
  templateId: string;
  templateName: string;
  category: string;
  description?: string | null;
}): Promise<boolean> => {
  try {
    await templatesBffApi.docUpdate(params);
    return true;
  } catch (error) { throw error; }
};

export const replaceDocTemplateFile = async (params: {
  templateId: string;
  fileUrl: string;
  fileType: string;
  versionNote?: string | null;
}): Promise<{ version: number } | null> => {
  try {
    const raw = await templatesBffApi.docReplaceFile(params);
    if (!raw) return null;
    return { version: Number(raw.version ?? 1) };
  } catch (error) { throw error; }
};

export const toggleDocTemplate = async (templateId: string, targetStatus: string): Promise<boolean> => {
  try {
    await templatesBffApi.docToggle(templateId, targetStatus);
    return true;
  } catch (error) { throw error; }
};

// ── 流程模板管理 ──────────────────────────────────────────────────────────────

export const listProcessTemplates = async (params: {
  page?: number;
  pageSize?: number;
  caseTypeCode?: string | null;
  stageCode?: string | null;
  isActive?: boolean | null;
} = {}): Promise<{ total: number; items: ProcessTemplateRecord[] }> => {
  try {
    const raw = await templatesBffApi.processList(params);
    const items: Record<string, unknown>[] = raw?.items ?? [];
    return { total: Number(raw?.total ?? items.length), items: items.map(mapProcessTemplate) };
  } catch {
    return { total: 0, items: [] };
  }
};

export const getProcessTemplateDetail = async (processTemplateId: string): Promise<ProcessTemplateRecord | null> => {
  try {
    const raw = await templatesBffApi.processDetail(processTemplateId);
    if (!raw) return null;
    return mapProcessTemplate(raw as Record<string, unknown>);
  } catch (error) { throw error; }
};

export const createProcessTemplate = async (params: {
  caseTypeCode: string;
  stageCode: string;
  stageName: string;
  sortOrder?: number;
  isRequired?: boolean;
  description?: string | null;
}): Promise<{ processTemplateId: string } | null> => {
  try {
    const raw = await templatesBffApi.processCreate(params);
    if (!raw) return null;
    return { processTemplateId: String(raw.processTemplateId ?? '') };
  } catch (error) { throw error; }
};

export const updateProcessTemplate = async (params: {
  processTemplateId: string;
  stageName: string;
  sortOrder: number;
  isRequired: boolean;
  description?: string | null;
}): Promise<boolean> => {
  try {
    await templatesBffApi.processUpdate(params);
    return true;
  } catch (error) { throw error; }
};

export const toggleProcessTemplate = async (processTemplateId: string, isActive: boolean): Promise<boolean> => {
  try {
    await templatesBffApi.processToggle(processTemplateId, isActive);
    return true;
  } catch (error) { throw error; }
};

// ── 任务模板管理 ──────────────────────────────────────────────────────────────

export const listTaskTemplates = async (processTemplateId: string): Promise<TaskTemplateRecord[]> => {
  try {
    const raw = await templatesBffApi.taskList(processTemplateId);
    const items: Record<string, unknown>[] = raw?.items ?? [];
    return items.map(mapTaskTemplate);
  } catch (error) { throw error; }
};

export const createTaskTemplate = async (params: {
  processTemplateId: string;
  taskName: string;
  taskCode?: string | null;
  taskGroup?: string | null;
  isMilestone?: boolean;
  isRequired?: boolean;
  sortOrder?: number;
  defaultDaysDue?: number | null;
  description?: string | null;
}): Promise<{ taskTemplateId: string } | null> => {
  try {
    const raw = await templatesBffApi.taskCreate(params);
    if (!raw) return null;
    return { taskTemplateId: String(raw.taskTemplateId ?? '') };
  } catch (error) { throw error; }
};

export const updateTaskTemplate = async (params: {
  taskTemplateId: string;
  taskName?: string | null;
  sortOrder?: number | null;
  defaultDaysDue?: number | null;
  description?: string | null;
}): Promise<boolean> => {
  try {
    await templatesBffApi.taskUpdate(params);
    return true;
  } catch (error) { throw error; }
};

export const deleteTaskTemplate = async (taskTemplateId: string): Promise<boolean> => {
  try {
    await templatesBffApi.taskDelete(taskTemplateId);
    return true;
  } catch (error) { throw error; }
};

// ── 法律大脑 AI ───────────────────────────────────────────────────────────────

export const searchSimilarCasesBff = async (query: string, topK = 5): Promise<{ items: SimilarCaseRecord[]; isStub: boolean }> => {
  try {
    const raw = await aiBffApi.similarCasesSearch({ query, topK });
    const items: Record<string, unknown>[] = raw?.items ?? [];
    return {
      items: items.map(item => mapSimilarCase(item)),
      isStub: Boolean(raw?.isStub ?? true),
    };
  } catch {
    return { items: [], isStub: true };
  }
};

// ── WP-AI-02: 策略推荐 ────────────────────────────────────────────────────────

const mapStrategyRecommendResponse = (raw: StrategyRecommendResponse): StrategyRecommendationRecord => ({
  caseId: raw.caseId,
  isStub: raw.isStub,
  generatedAt: raw.generatedAt,
  confidence: raw.confidence,
  caseAutoSummary: raw.caseAutoSummary,
  materialCompleteness: {
    score: raw.materialCompleteness?.score ?? 0,
    level: raw.materialCompleteness?.level ?? 'LOW',
    missingItems: raw.materialCompleteness?.missingItems ?? [],
  },
  pendingMaterialTasks: raw.pendingMaterialTasks ?? [],
  similarCases: (raw.similarCases ?? []).map((item: SimilarCaseItem): SimilarCaseRecord =>
    mapSimilarCase(item as unknown as Record<string, unknown>, raw.isStub),
  ),
  strategyPoints: raw.strategyPoints ?? [],
  actionRecommendations: raw.actionRecommendations ?? [],
  evidenceReinforcement: raw.evidenceReinforcement ?? [],
  riskWarnings: raw.riskWarnings ?? [],
  recommendedStrategyText: raw.recommendedStrategyText ?? '',
});

/** 本地降级 stub：后端未就绪时返回受控占位数据 */
const createLocalStrategyStub = (caseId: string): StrategyRecommendationRecord => ({
  caseId,
  isStub: true,
  generatedAt: new Date().toISOString(),
  confidence: 0.55,
  caseAutoSummary: '案件信息尚未完整汇聚，以下为基于现有字段的降级建议。',
  materialCompleteness: {
    score: 35,
    level: 'LOW',
    missingItems: ['当事人诉求详情', '卷宗材料摘要', '既有策略记录'],
  },
  pendingMaterialTasks: [
    '补充当事人诉辩要点以提升策略准确度',
    '上传并解析关键卷宗材料',
    '完善案件描述与争议焦点',
  ],
  similarCases: [],
  strategyPoints: [
    '建议在掌握更多案情后再制定详细策略',
    '重点关注证据链完整性',
    '评估管辖权与程序风险',
  ],
  actionRecommendations: [
    '收集并整理核心证据材料',
    '明确争议焦点与法律依据',
    '评估和解可能性与诉讼成本',
  ],
  evidenceReinforcement: [
    '补充合同文本与往来函件',
    '整理付款流水与财务凭证',
  ],
  riskWarnings: [
    '当前材料不完备，策略建议置信度较低',
    '缺少类案参考，法律风险评估可能不足',
  ],
  recommendedStrategyText:
    '基于现有材料，建议先以保守防御为主，待补充当事人信息、证据材料及类案参考后，再制定针对性策略方案。',
});

/**
 * 生成应对策略建议
 *
 * 调用路径: caseAiApi.recommendStrategy -> POST /api/bff/v1/cases/strategy/recommend
 * 降级规则: BFF 未实现/404 时返回本地 stub；网络错误抛错。
 */
export const generateStrategyRecommendation = async (params: {
  caseId: string;
  sourceScope?: 'EXTERNAL' | 'INTERNAL' | 'ALL';
  topK?: number;
}): Promise<StrategyRecommendationRecord> => {
  try {
    const raw = await caseAiApi.recommendStrategy({
      caseId: params.caseId,
      sourceScope: params.sourceScope ?? 'EXTERNAL',
      topK: params.topK ?? 5,
    });
    return mapStrategyRecommendResponse(raw);
  } catch (err: unknown) {
    const isNotImplemented =
      err instanceof Error &&
      (/404|Not Found|未实现|not implemented/i.test(err.message));
    if (isNotImplemented) {
      return createLocalStrategyStub(params.caseId);
    }
    throw err;
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// S18 — 通知 + 附件 + 统一审批
// ═══════════════════════════════════════════════════════════════════════════════

import notificationsBffApi from '../src/services/api/notificationsBffApi';
import approvalsBffApi from '../src/services/api/approvalsBffApi';
import attachmentsBffApi from '../src/services/api/attachmentsBffApi';

// ── 接口类型 ──────────────────────────────────────────────────────────────────

export type NotifyType = 'TODO_TASK' | 'SYSTEM_ALERT' | 'MENTION' | 'DUE_REMINDER';

export interface NotificationRecord {
  notificationId: string;
  notifyType: NotifyType;
  notifyTypeName: string;
  title: string;
  content: string;
  referenceUrl: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface AttachmentRecord {
  attachmentId: string;
  fileName: string;
  fileExtension: string | null;
  fileSize: number | null;
  mimeType: string | null;
  fileUrl: string;
  storageProvider: string;
  description: string | null;
  uploaderId: string | null;
  createdAt: string;
}

export interface ApprovalTodoItem {
  taskId: string;
  instanceId: string;
  businessType: string;
  title: string;
  applicantId: string;
  applicantName: string;
  submittedAt: string;
  referenceUrl: string | null;
}

export interface ApprovalTaskDetail {
  taskId: string;
  nodeName: string;
  approverId: string;
  approverName: string;
  status: string;
  statusName: string;
  comment: string | null;
  processedAt: string | null;
}

export interface ApprovalDetail {
  instanceId: string;
  businessType: string;
  businessId: string;
  title: string;
  status: string;
  statusName: string;
  applicantId: string;
  submittedAt: string;
  completedAt: string | null;
  task: ApprovalTaskDetail | null;
}

// ── Mappers ───────────────────────────────────────────────────────────────────

const mapNotification = (raw: Record<string, unknown>): NotificationRecord => ({
  notificationId: String(raw.notificationId ?? raw.notification_id ?? ''),
  notifyType: (raw.notifyType ?? raw.notify_type ?? 'SYSTEM_ALERT') as NotifyType,
  notifyTypeName: String(raw.notifyTypeName ?? raw.notify_type_name ?? ''),
  title: String(raw.title ?? ''),
  content: String(raw.content ?? ''),
  referenceUrl: raw.referenceUrl != null ? String(raw.referenceUrl) : (raw.reference_url != null ? String(raw.reference_url) : null),
  isRead: Boolean(raw.isRead ?? raw.is_read ?? false),
  createdAt: String(raw.createdAt ?? raw.created_at ?? ''),
});

const mapAttachment = (raw: Record<string, unknown>): AttachmentRecord => ({
  attachmentId: String(raw.attachmentId ?? raw.attachment_id ?? ''),
  fileName: String(raw.fileName ?? raw.file_name ?? ''),
  fileExtension: raw.fileExtension != null ? String(raw.fileExtension) : (raw.file_extension != null ? String(raw.file_extension) : null),
  fileSize: raw.fileSize != null ? Number(raw.fileSize) : (raw.file_size != null ? Number(raw.file_size) : null),
  mimeType: raw.mimeType != null ? String(raw.mimeType) : (raw.mime_type != null ? String(raw.mime_type) : null),
  fileUrl: String(raw.fileUrl ?? raw.file_url ?? ''),
  storageProvider: String(raw.storageProvider ?? raw.storage_provider ?? 'OSS'),
  description: raw.description != null ? String(raw.description) : null,
  uploaderId: raw.uploaderId != null ? String(raw.uploaderId) : (raw.uploader_id != null ? String(raw.uploader_id) : null),
  createdAt: String(raw.createdAt ?? raw.created_at ?? ''),
});

const mapApprovalTodo = (raw: Record<string, unknown>): ApprovalTodoItem => ({
  taskId: String(raw.taskId ?? raw.task_id ?? ''),
  instanceId: String(raw.instanceId ?? raw.instance_id ?? ''),
  businessType: String(raw.businessType ?? raw.business_type ?? ''),
  title: String(raw.title ?? ''),
  applicantId: String(raw.applicantId ?? raw.applicant_id ?? ''),
  applicantName: String(raw.applicantName ?? raw.applicant_name ?? ''),
  submittedAt: String(raw.submittedAt ?? raw.submitted_at ?? ''),
  referenceUrl: raw.referenceUrl != null ? String(raw.referenceUrl) : (raw.reference_url != null ? String(raw.reference_url) : null),
});

const mapApprovalTaskDetail = (raw: Record<string, unknown>): ApprovalTaskDetail => ({
  taskId: String(raw.taskId ?? raw.task_id ?? ''),
  nodeName: String(raw.nodeName ?? raw.node_name ?? '审批'),
  approverId: String(raw.approverId ?? raw.approver_id ?? ''),
  approverName: String(raw.approverName ?? raw.approver_name ?? ''),
  status: String(raw.status ?? 'PENDING'),
  statusName: String(raw.statusName ?? raw.status_name ?? ''),
  comment: raw.comment != null ? String(raw.comment) : null,
  processedAt: raw.processedAt != null ? String(raw.processedAt) : (raw.processed_at != null ? String(raw.processed_at) : null),
});

const mapApprovalDetail = (raw: Record<string, unknown>): ApprovalDetail => ({
  instanceId: String(raw.instanceId ?? raw.instance_id ?? ''),
  businessType: String(raw.businessType ?? raw.business_type ?? ''),
  businessId: String(raw.businessId ?? raw.business_id ?? ''),
  title: String(raw.title ?? ''),
  status: String(raw.status ?? ''),
  statusName: String(raw.statusName ?? raw.status_name ?? ''),
  applicantId: String(raw.applicantId ?? raw.applicant_id ?? ''),
  submittedAt: String(raw.submittedAt ?? raw.submitted_at ?? ''),
  completedAt: raw.completedAt != null ? String(raw.completedAt) : (raw.completed_at != null ? String(raw.completed_at) : null),
  task: raw.task ? mapApprovalTaskDetail(raw.task as Record<string, unknown>) : null,
});

// ── 通知包装函数 ──────────────────────────────────────────────────────────────

export const listNotifications = async (params: {
  page?: number;
  pageSize?: number;
  notifyType?: NotifyType | null;
  isRead?: boolean | null;
} = {}): Promise<{ total: number; items: NotificationRecord[]; unreadCount: number }> => {
  try {
    const raw = await notificationsBffApi.list(params);
    const items: Record<string, unknown>[] = raw?.items ?? [];
    return {
      total: Number(raw?.total ?? 0),
      unreadCount: Number(raw?.unreadCount ?? raw?.unread_count ?? 0),
      items: items.map(mapNotification),
    };
  } catch {
    return { total: 0, items: [], unreadCount: 0 };
  }
};

export const getUnreadCount = async (): Promise<number> => {
  try {
    const raw = await notificationsBffApi.unreadCount();
    return Number(raw?.unreadCount ?? raw?.unread_count ?? 0);
  } catch {
    return 0;
  }
};

export const markNotificationRead = async (notificationId: string): Promise<boolean> => {
  try {
    await notificationsBffApi.markRead(notificationId);
    return true;
  } catch (error) { throw error; }
};

export const markAllNotificationsRead = async (): Promise<number> => {
  try {
    const raw = await notificationsBffApi.markAllRead();
    return Number(raw?.markedCount ?? raw?.marked_count ?? 0);
  } catch {
    return 0;
  }
};

// ── 附件包装函数 ──────────────────────────────────────────────────────────────

export const registerAttachment = async (params: {
  businessType: string;
  businessId: string;
  fileName: string;
  fileUrl: string;
  fileExtension?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  storageProvider?: string;
  description?: string | null;
}): Promise<AttachmentRecord | null> => {
  try {
    const raw = await attachmentsBffApi.register(params);
    if (!raw) return null;
    return mapAttachment(raw);
  } catch (error) { throw error; }
};

export const listAttachments = async (params: {
  businessType: string;
  businessId: string;
  page?: number;
  pageSize?: number;
}): Promise<{ total: number; items: AttachmentRecord[] }> => {
  try {
    const raw = await attachmentsBffApi.list(params);
    const items: Record<string, unknown>[] = raw?.items ?? [];
    return {
      total: Number(raw?.total ?? 0),
      items: items.map(mapAttachment),
    };
  } catch {
    return { total: 0, items: [] };
  }
};

export const deleteAttachment = async (attachmentId: string): Promise<boolean> => {
  try {
    await attachmentsBffApi.delete(attachmentId);
    return true;
  } catch (error) { throw error; }
};

export interface AttachmentPresignResult {
  presignedUrl: string;
  objectKey: string;
  expiresIn: number;
}

export const getAttachmentPresignUrl = async (params: {
  fileName: string;
  contentType?: string | null;
  expiresIn?: number;
}): Promise<AttachmentPresignResult | null> => {
  try {
    const raw = await attachmentsBffApi.presignPut(params);
    if (!raw) return null;
    return {
      presignedUrl: String(raw.presignedUrl ?? raw.presigned_url ?? ''),
      objectKey: String(raw.objectKey ?? raw.object_key ?? ''),
      expiresIn: Number(raw.expiresIn ?? raw.expires_in ?? 900),
    };
  } catch (error) { throw error; }
};

// ── 审批包装函数 ──────────────────────────────────────────────────────────────

export const listMyApprovalTodos = async (params: {
  page?: number;
  pageSize?: number;
  businessType?: string | null;
} = {}): Promise<{ total: number; items: ApprovalTodoItem[] }> => {
  try {
    const raw = await approvalsBffApi.myTodos(params);
    const items: Record<string, unknown>[] = raw?.items ?? [];
    return {
      total: Number(raw?.total ?? 0),
      items: items.map(mapApprovalTodo),
    };
  } catch {
    return { total: 0, items: [] };
  }
};

export const getApprovalDetail = async (instanceId: string): Promise<ApprovalDetail | null> => {
  try {
    const raw = await approvalsBffApi.detail(instanceId);
    if (!raw) return null;
    return mapApprovalDetail(raw);
  } catch (error) { throw error; }
};

export const processApproval = async (params: {
  taskId: string;
  action: 'APPROVE' | 'REJECT';
  comment?: string | null;
}): Promise<{ instanceStatus: string; taskStatus: string } | null> => {
  try {
    const raw = await approvalsBffApi.process(params);
    if (!raw) return null;
    return {
      instanceStatus: String(raw.instanceStatus ?? raw.instance_status ?? ''),
      taskStatus: String(raw.taskStatus ?? raw.task_status ?? ''),
    };
  } catch (error) { throw error; }
};

export const cancelApproval = async (instanceId: string, reason?: string): Promise<boolean> => {
  try {
    await approvalsBffApi.cancel(instanceId, reason);
    return true;
  } catch (error) { throw error; }
};

export const createApproval = async (params: {
  businessType: string;
  businessId: string;
  title: string;
  approverId: string;
  processCode?: string | null;
}): Promise<{ instanceId: string; taskId: string } | null> => {
  try {
    const raw = await approvalsBffApi.create(params);
    if (!raw) return null;
    return {
      instanceId: String(raw.instanceId ?? raw.instance_id ?? ''),
      taskId: String(raw.taskId ?? raw.task_id ?? ''),
    };
  } catch (error) { throw error; }
};

// ─── S19: 驾驶舱 + 业务门户 + 供应商门户 + 数据快照 ────────────────────────

import dashboardBffApi from '../src/services/api/dashboardBffApi';
import businessPortalBffApi from '../src/services/api/businessPortalBffApi';
import vendorPortalBffApi from '../src/services/api/vendorPortalBffApi';
import snapshotsBffApi from '../src/services/api/snapshotsBffApi';

// --- 类型定义 ---

export interface DashboardSummary {
  activeCaseCount: number;
  criticalCount: number;
  dueSoonCount: number;
  recoveredAmount: number;
}

export interface DashboardRiskItem {
  riskItemId: string;
  caseId: string;
  caseTitle: string;
  riskLevel: string;
  triggerType: string;
  status: string;
  deadline?: string;
}

export interface EvidenceTaskRecord {
  taskId: string;
  title: string;
  description: string;
  status: string;
  caseTitle: string;
  deadline: string;
  submitDate: string;
  rejectReason: string | null;
}

export interface VendorPortalSummary {
  firmName: string;
  firmId: string;
  rating: number;
  pendingTaskCount: number;
  lawyerName: string;
}

export interface VendorCaseRecord {
  caseId: string;
  caseCode: string;
  caseTitle: string;
  stage: string;
  lastUpdateDate: string;
}

export interface SnapshotRecord {
  snapshotId: string;
  snapshotType: 'FINANCIAL' | 'COMPLIANCE';
  snapshotTypeName: string;
  snapshotName: string;
  period: string | null;
  snapshotDate: string | null;
  status: string;
  statusName: string;
  fileSize: number | null;
  lockedAt: string | null;
  createdAt: string;
}

export interface SnapshotDownloadResult {
  snapshotId: string;
  downloadUrl: string | null;
  expiresAt: string | null;
  fileName: string | null;
}

// --- Mapper ---

const mapDashboardSummary = (raw: any): DashboardSummary => ({
  activeCaseCount: Number(raw.activeCaseCount ?? raw.active_case_count ?? 0),
  criticalCount: Number(raw.criticalCount ?? raw.critical_count ?? 0),
  dueSoonCount: Number(raw.dueSoonCount ?? raw.due_soon_count ?? 0),
  recoveredAmount: Number(raw.recoveredAmount ?? raw.recovered_amount ?? 0),
});

const mapRiskItem = (raw: any): DashboardRiskItem => ({
  riskItemId: String(raw.riskItemId ?? raw.risk_item_id ?? ''),
  caseId: String(raw.caseId ?? raw.case_id ?? ''),
  caseTitle: String(raw.caseTitle ?? raw.case_title ?? ''),
  riskLevel: String(raw.riskLevel ?? raw.risk_level ?? ''),
  triggerType: String(raw.triggerType ?? raw.trigger_type ?? ''),
  status: String(raw.status ?? ''),
  deadline: raw.deadline ?? undefined,
});

const mapEvidenceTask = (raw: any): EvidenceTaskRecord => ({
  taskId: String(raw.taskId ?? raw.task_id ?? ''),
  title: String(raw.title ?? ''),
  description: String(raw.description ?? ''),
  status: String(raw.status ?? ''),
  caseTitle: String(raw.caseTitle ?? raw.case_title ?? ''),
  deadline: String(raw.deadline ?? ''),
  submitDate: String(raw.submitDate ?? raw.submit_date ?? ''),
  rejectReason: raw.rejectReason ?? raw.reject_reason ?? null,
});

const mapVendorSummary = (raw: any): VendorPortalSummary => ({
  firmName: String(raw.firmName ?? raw.firm_name ?? ''),
  firmId: String(raw.firmId ?? raw.firm_id ?? ''),
  rating: Number(raw.rating ?? 0),
  pendingTaskCount: Number(raw.pendingTaskCount ?? raw.pending_task_count ?? 0),
  lawyerName: String(raw.lawyerName ?? raw.lawyer_name ?? ''),
});

const mapVendorCase = (raw: any): VendorCaseRecord => ({
  caseId: String(raw.caseId ?? raw.case_id ?? ''),
  caseCode: String(raw.caseCode ?? raw.case_code ?? ''),
  caseTitle: String(raw.caseTitle ?? raw.case_title ?? ''),
  stage: String(raw.stage ?? ''),
  lastUpdateDate: String(raw.lastUpdateDate ?? raw.last_update_date ?? ''),
});

const mapSnapshot = (raw: any): SnapshotRecord => ({
  snapshotId: String(raw.snapshotId ?? raw.snapshot_id ?? ''),
  snapshotType: (raw.snapshotType ?? raw.snapshot_type ?? 'COMPLIANCE') as SnapshotRecord['snapshotType'],
  snapshotTypeName: String(raw.snapshotTypeName ?? raw.snapshot_type_name ?? ''),
  snapshotName: String(raw.snapshotName ?? raw.snapshot_name ?? ''),
  period: raw.period ?? null,
  snapshotDate: raw.snapshotDate ?? raw.snapshot_date ?? null,
  status: String(raw.status ?? ''),
  statusName: String(raw.statusName ?? raw.status_name ?? ''),
  fileSize: raw.fileSize != null ? Number(raw.fileSize) : (raw.file_size != null ? Number(raw.file_size) : null),
  lockedAt: raw.lockedAt ?? raw.locked_at ?? null,
  createdAt: String(raw.createdAt ?? raw.created_at ?? ''),
});

// --- 驾驶舱包装函数 ---

export const getDashboardSummary = async (): Promise<DashboardSummary | null> => {
  try {
    const raw = await dashboardBffApi.legalSummary();
    if (!raw) return null;
    return mapDashboardSummary(raw);
  } catch (error) { throw error; }
};

export const getDashboardRiskItems = async (params: {
  status?: string | null;
} = {}): Promise<DashboardRiskItem[]> => {
  try {
    const raw = await dashboardBffApi.riskItems(params);
    const items = Array.isArray(raw) ? raw : (raw?.items ?? []);
    return items.map(mapRiskItem);
  } catch (error) { throw error; }
};

// --- 业务门户包装函数 ---

export const getMyEvidenceTasks = async (params: {
  status?: string | null;
} = {}): Promise<EvidenceTaskRecord[]> => {
  try {
    const raw = await businessPortalBffApi.myTasks(params);
    const items = Array.isArray(raw) ? raw : (raw?.items ?? []);
    return items.map(mapEvidenceTask);
  } catch (error) { throw error; }
};

export const submitEvidenceTask = async (params: {
  taskId: string;
  fileUrls: string[];
  comment?: string;
}): Promise<boolean> => {
  try {
    await businessPortalBffApi.submitEvidence(params);
    return true;
  } catch (error) { throw error; }
};

// --- 供应商门户包装函数 ---

export const getVendorPortalSummary = async (): Promise<VendorPortalSummary | null> => {
  try {
    const raw = await vendorPortalBffApi.summary();
    if (!raw) return null;
    return mapVendorSummary(raw);
  } catch (error) { throw error; }
};

export const getVendorMyCases = async (params: {
  page?: number;
  pageSize?: number;
} = {}): Promise<VendorCaseRecord[]> => {
  try {
    const raw = await vendorPortalBffApi.myCases(params);
    const items = Array.isArray(raw) ? raw : (raw?.items ?? []);
    return items.map(mapVendorCase);
  } catch (error) { throw error; }
};

export const updateVendorProgress = async (params: {
  caseId: string;
  progressNote: string;
}): Promise<boolean> => {
  try {
    await vendorPortalBffApi.updateProgress(params);
    return true;
  } catch (error) { throw error; }
};

export const submitVendorReport = async (params: {
  caseId: string;
  reportContent: string;
  reportType: string;
}): Promise<boolean> => {
  try {
    await vendorPortalBffApi.submitReport(params);
    return true;
  } catch (error) { throw error; }
};

// --- 数据快照包装函数 ---

export const listSnapshots = async (params: {
  snapshotType?: 'FINANCIAL' | 'COMPLIANCE' | null;
  period?: string | null;
  page?: number;
  pageSize?: number;
} = {}): Promise<{ total: number; items: SnapshotRecord[] }> => {
  try {
    const raw = await snapshotsBffApi.list(params);
    const items: any[] = Array.isArray(raw) ? raw : (raw?.items ?? []);
    return {
      total: Number(raw?.total ?? items.length),
      items: items.map(mapSnapshot),
    };
  } catch {
    return { total: 0, items: [] };
  }
};

export const getSnapshotDownloadUrl = async (params: {
  snapshotId: string;
  snapshotType: 'FINANCIAL' | 'COMPLIANCE';
}): Promise<SnapshotDownloadResult | null> => {
  try {
    const raw = await snapshotsBffApi.downloadUrl(params);
    if (!raw) return null;
    return {
      snapshotId: String(raw.snapshotId ?? raw.snapshot_id ?? params.snapshotId),
      downloadUrl: raw.downloadUrl ?? raw.download_url ?? null,
      expiresAt: raw.expiresAt ?? raw.expires_at ?? null,
      fileName: raw.fileName ?? raw.file_name ?? null,
    };
  } catch (error) { throw error; }
};
