/**
 * API 服务统一导出
 */

export { default as apiClient } from './client'
export * from './client' // 导出 Token 管理函数

export { caseApi } from './caseApi'
export { caseAiApi } from './caseAiApi'

// 导出类型
export type {
  CaseListRequest,
  CaseCreateRequest,
  CaseUpdateRequest,
  CaseResponse,
  CaseListResponse,
  PaginatedResponse,
  StandardResponse,
} from '@cases/types/api/case'

export { CaseStage, CaseStatus } from '@cases/types/api/case'

// AI 案件辅助能力类型 (WP-AI-00)
export type {
  // Enums
  SourceScope,
  AiRunMode,
  LegalDraftType,
  ReportPeriodType,
  ParseScope,
  DocumentParseStatus,
  InternalReportStorageMode,
  CompletenessLevel,
  // Common VO
  AiSourceRef,
  MaterialCompleteness,
  AiCommonMeta,
  // Context VO
  ClaimDefense,
  AmountSummary,
  StrategySnapshot,
  ClosureSnapshot,
  DossierDocumentSummary,
  DossierSummary,
  // Similar case VO
  SimilarCaseItem,
  // Report VO
  InternalReportMetrics,
  InternalReportSection,
  // Dossier retry VO
  DossierParseRetryItem,
  // Requests
  CaseAiContextBuildRequest,
  SimilarCaseSearchRequest,
  StrategyRecommendRequest,
  InternalReportGenerateRequest,
  ClosingLegalDraftGenerateRequest,
  DossierParseRetryRequest,
  // Responses
  CaseAiContextBuildResponse,
  SimilarCaseSearchResponse,
  StrategyRecommendResponse,
  InternalReportGenerateResponse,
  ClosingLegalDraftGenerateResponse,
  DossierParseRetryResponse,
} from '@cases/types/api/caseAi'