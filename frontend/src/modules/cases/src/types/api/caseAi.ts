/**
 * AI 案件辅助能力 API 类型定义
 * 与后端 schemas/case_ai.py 严格对齐（snake_case ↔ camelCase 自动转换）
 *
 * 参考: docs/plan/2026Q2_AI_CASE_ASSISTANT_WP_AI_00_API_CONTRACT_DESIGN.md (v1.1)
 */

// ==================== 枚举类型（字符串字面量联合）====================

export type SourceScope = 'EXTERNAL' | 'INTERNAL' | 'ALL'
export type AiRunMode = 'MOCK' | 'CONTEXT_ONLY' | 'EXTERNAL_SEARCH' | 'LLM'
export type LegalDraftType = 'LEGAL_ADVICE' | 'FILING_REPORT' | 'PHASE_LEGAL_OPINION'
export type ReportPeriodType = 'YEAR' | 'QUARTER' | 'MONTH' | 'RANGE'
export type ParseScope = 'DOCUMENTS' | 'CASE' | 'ALL_PENDING'
export type DocumentParseStatus = 'PENDING' | 'PENDING_OCR' | 'PARSED' | 'FAILED' | 'SKIPPED'
export type InternalReportStorageMode = 'TRANSIENT' | 'REPORTING_TASK_DRAFT'
export type CompletenessLevel = 'LOW' | 'MEDIUM' | 'HIGH'

// ==================== 通用 VO ====================

export interface AiSourceRef {
  sourceType: string
  sourceId?: string | null
  sourceName?: string | null
  fieldPath?: string | null
  excerpt?: string | null
  confidence?: number | null
}

export interface MaterialCompleteness {
  score: number
  level: CompletenessLevel
  missingItems: string[]
}

export interface AiCommonMeta {
  isStub: boolean
  runMode: AiRunMode
  generatedAt: string // ISO 8601
  confidence: number
  sourceRefs: AiSourceRef[]
  materialCompleteness: MaterialCompleteness
  pendingMaterialTasks: string[]
}

// ==================== 上下文 VO ====================

export interface ClaimDefense {
  ourClaim?: string | null
  opponentClaim?: string | null
  ourPosition?: string | null
  opponentPosition?: string | null
}

export interface AmountSummary {
  currency: string
  targetAmount?: number | null
  claimAmount?: number | null
  judgmentAmount?: number | null
  recoveredAmount?: number | null
  provisionAmount?: number | null
  budgetAmount?: number | null
  paidAmount?: number | null
  pendingAmount?: number | null
  financeVisible: boolean
  financeHiddenReason?: string | null
}

export interface StrategySnapshot {
  strategyId?: string | null
  strategyText?: string | null
  winRate?: number | null
  riskLevel?: string | null
  updatedAt?: string | null // ISO 8601
}

export interface ClosureSnapshot {
  closureId?: string | null
  closureType?: string | null
  closureDate?: string | null // ISO 8601 date
  reviewSummary?: string | null
  improvementActions: string[]
}

export interface DossierDocumentSummary {
  documentId: string
  documentName: string
  docCategory?: string | null
  parseStatus: DocumentParseStatus
  aiSummary?: string | null
  extractedFacts: string[]
  proofPurpose?: string | null
}

export interface DossierSummary {
  totalDocuments: number
  parsedCount: number
  pendingCount: number
  failedCount: number
  keyMaterials: DossierDocumentSummary[]
}

// ==================== 类案检索 VO ====================

export interface SimilarCaseItem {
  // 旧字段（兼容前端已有组件）
  caseId: string
  caseName: string
  similarity: number
  outcome?: string | null
  outcomeName?: string | null
  amount?: number | null

  // 新字段（WP-AI-00 扩展）
  displayId: string
  sourceScope: SourceScope
  sourceIndex?: string | null
  externalDocId?: string | null
  internalCaseId?: string | null
  title?: string | null
  caseNo?: string | null
  courtName?: string | null
  courtLevel?: string | null
  province?: string | null
  causeOfAction?: string | null
  trialProcedure?: string | null
  documentType?: string | null
  refereeDate?: string | null // ISO 8601 date
  refereeResult?: string | null
  refereeBasis?: string | null
  summary?: string | null
  basicFact?: string | null
  focusDispute?: string | null
  courtBelieves?: string | null
  courtFound?: string | null
  alleged?: string | null
  argue?: string | null
  keywords?: string | null
  litigationParticipant?: string | null
  score?: number | null
  matchedFields: string[]
  matchReason: string
  snippets: string[]
}

// ==================== 内部报告 VO ====================

export interface InternalReportMetrics {
  totalCases: number
  newCases: number
  closedCases: number
  majorRiskCases: number
  totalTargetAmount?: number | null
  totalProvisionAmount?: number | null
}

export interface InternalReportSection {
  sectionKey: string
  title: string
  content: string
  sourceRefs: AiSourceRef[]
}

// ==================== 卷宗解析重试 VO ====================

export interface DossierParseRetryItem {
  documentId: string
  documentName: string
  previousStatus?: DocumentParseStatus | null
  accepted: boolean
  nextStatus: DocumentParseStatus
  skipReason?: string | null
}

// ==================== 请求 DTO ====================

/** 构建案件 AI 上下文请求 */
export interface CaseAiContextBuildRequest {
  caseId: string
  includeDocuments?: boolean
  includeFinance?: boolean
  forceRebuild?: boolean
}

/** 相似案例检索请求（新契约） */
export interface SimilarCaseSearchRequest {
  caseId?: string | null
  query?: string | null
  topK?: number
  sourceScope?: SourceScope
}

/** 策略建议请求 */
export interface StrategyRecommendRequest {
  caseId: string
  topK?: number
  sourceScope?: SourceScope
  forceRefresh?: boolean
}

/** 内部报告生成请求 */
export interface InternalReportGenerateRequest {
  periodType?: ReportPeriodType
  year?: number | null
  quarter?: string | null
  month?: string | null
  dateStart?: string | null // ISO 8601 date
  dateEnd?: string | null // ISO 8601 date
  saveDraft?: boolean
}

/** 结案法律文书草稿生成请求 */
export interface ClosingLegalDraftGenerateRequest {
  caseId: string
  draftType?: LegalDraftType
  allowPhaseOpinion?: boolean
}

/** 卷宗解析重试请求 */
export interface DossierParseRetryRequest {
  caseId: string
  documentIds?: string[]
  scope?: ParseScope
  force?: boolean
}

// ==================== 响应 VO ====================

/** 构建案件 AI 上下文响应 */
export interface CaseAiContextBuildResponse extends AiCommonMeta {
  caseId: string
  contextVersion: string
  caseSummary: string
  causeOfAction?: string | null
  claimAndDefense: ClaimDefense
  disputeFocus: string[]
  amountSummary: AmountSummary
  evidenceSummary: string[]
  strategySnapshot?: StrategySnapshot | null
  closureSnapshot?: ClosureSnapshot | null
  dossierSummary?: DossierSummary | null
}

/** 相似案例检索响应 */
export interface SimilarCaseSearchResponse extends AiCommonMeta {
  queryText?: string | null
  sourceScope: SourceScope
  items: SimilarCaseItem[]
  total: number
  warnings: string[]
}

/** 策略建议响应 */
export interface StrategyRecommendResponse extends AiCommonMeta {
  caseId: string
  caseAutoSummary: string
  similarCases: SimilarCaseItem[]
  strategyPoints: string[]
  actionRecommendations: string[]
  evidenceReinforcement: string[]
  riskWarnings: string[]
  recommendedStrategyText: string
}

/** 内部报告生成响应 */
export interface InternalReportGenerateResponse extends AiCommonMeta {
  taskId?: string | null
  storageMode: InternalReportStorageMode
  reportCategory?: string | null
  title: string
  periodLabel: string
  metrics: InternalReportMetrics
  sections: InternalReportSection[]
  contentData: string
}

/** 结案法律文书草稿生成响应 */
export interface ClosingLegalDraftGenerateResponse extends AiCommonMeta {
  caseId: string
  draftType: LegalDraftType
  title: string
  content: string
  documentCategory: string
  canArchive: boolean
  recommendedFolderId?: string | null
  warnings: string[]
}

/** 卷宗解析重试响应 */
export interface DossierParseRetryResponse extends AiCommonMeta {
  taskId?: string | null
  acceptedCount: number
  skippedCount: number
  items: DossierParseRetryItem[]
}
