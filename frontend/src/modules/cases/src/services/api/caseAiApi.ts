/**
 * AI 案件辅助能力 API 封装 (WP-AI-00)
 *
 * 只做 HTTP 封装与类型声明，不写组件适配逻辑。
 * 挂载路径: /api/bff/v1/*
 * 所有响应经 apiClient 拦截器自动完成 snake_case ↔ camelCase 转换。
 */

import apiClient from './client'
import type {
  CaseAiContextBuildRequest,
  CaseAiContextBuildResponse,
  StrategyRecommendRequest,
  StrategyRecommendResponse,
  InternalReportGenerateRequest,
  InternalReportGenerateResponse,
  ClosingLegalDraftGenerateRequest,
  ClosingLegalDraftGenerateResponse,
  DossierParseRetryRequest,
  DossierParseRetryResponse,
} from '@cases/types/api/caseAi'
import type { StandardResponse } from '@cases/types/api/case'

// BFF 基础路径：从 /api/v1 的 baseURL 中提取 origin，拼接 /api/bff/v1
const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/api\/v1\/?$/, '')
const BFF = `${API_ORIGIN}/api/bff/v1`

/**
 * 封装 POST 请求，提取 StandardResponse.data
 * LLM 相关接口使用 120s 超时（默认 30s 不够）
 */
async function post<T>(url: string, body: unknown, timeoutMs = 30000): Promise<T> {
  const res = await apiClient.post<StandardResponse<T>>(url, body, { timeout: timeoutMs })
  return res.data.data
}

export const caseAiApi = {
  /**
   * 构建案件 AI 标准上下文
   * POST /api/bff/v1/cases/ai/context/build
   */
  buildCaseAiContext: (params: CaseAiContextBuildRequest): Promise<CaseAiContextBuildResponse> =>
    post(`${BFF}/cases/ai/context/build`, params),

  /**
   * 生成应对策略建议
   * POST /api/bff/v1/cases/strategy/recommend
   */
  recommendStrategy: (params: StrategyRecommendRequest): Promise<StrategyRecommendResponse> =>
    post(`${BFF}/cases/strategy/recommend`, params, 120000),

  /**
   * 年度综合分析报告生成
   * POST /api/bff/v1/internal-reports/generate
   */
  generateInternalReport: (params: InternalReportGenerateRequest): Promise<InternalReportGenerateResponse> =>
    post(`${BFF}/internal-reports/generate`, params, 120000),

  /**
   * 结案法律建议书/备案报告草稿生成
   * POST /api/bff/v1/cases/closing/legal-advice/generate
   */
  generateClosingLegalDraft: (params: ClosingLegalDraftGenerateRequest): Promise<ClosingLegalDraftGenerateResponse> =>
    post(`${BFF}/cases/closing/legal-advice/generate`, params, 120000),

  /**
   * 卷宗解析重试
   * POST /api/bff/v1/cases/dossier/documents/parse/retry
   */
  retryDossierParse: (params: DossierParseRetryRequest): Promise<DossierParseRetryResponse> =>
    post(`${BFF}/cases/dossier/documents/parse/retry`, params),
}

export default caseAiApi
