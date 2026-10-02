/**
 * 法律大脑 AI BFF API (2.S17 + WP-AI-00 升级)
 *
 * 本切片仅接入两个端点（S17 范围）:
 *   ai/sessions/create       (1) — 创建会话（Stub）
 *   ai/similar-cases/search  (1) — 相似案例检索（Stub → WP-AI-00 升级）
 *
 * 会话管理 CRUD + ai/chat/stream 留 3.S18
 *
 * 挂载路径: /api/bff/v1/ai/*
 * 所有响应含 isStub: true（D-AI: 全 Stub 占位）
 *
 * WP-AI-00 升级说明:
 *   - similarCasesSearch 兼容旧签名 (query, topK) 与新对象签名 ({ caseId?, query?, topK?, sourceScope? })
 *   - 新增 sourceScope 参数，默认 EXTERNAL
 */

import apiClient from './client';

const post = async (url: string, body: Record<string, unknown> = {}): Promise<any> => {
  const res = await apiClient.post(url, body);
  return res.data?.data ?? res.data;
};

const _origin = ((import.meta.env.VITE_API_BASE_URL as string) || '/api/v1').replace(/\/api\/v1\/?$/, '');
const AI = `${_origin}/api/bff/v1/ai`;

/** 类案检索对象参数 */
export interface SimilarCasesSearchParams {
  query?: string;
  caseId?: string | null;
  topK?: number;
  sourceScope?: string;
}

const aiBffApi = {
  /**
   * 相似案例检索 (WP-AI-00 升级)
   *
   * 兼容两种调用方式:
   *   1) 旧签名: similarCasesSearch(query, topK)
   *   2) 新签名: similarCasesSearch({ caseId, query?, topK?, sourceScope? })
   *
   * sourceScope 默认 'EXTERNAL'，与后端 schema 默认值一致。
   */
  similarCasesSearch: (
    queryOrParams: string | SimilarCasesSearchParams,
    topK?: number,
  ): Promise<any> => {
    let payload: Record<string, unknown>;

    if (typeof queryOrParams === 'string') {
      // 旧签名: (query, topK)
      payload = {
        query: queryOrParams,
        topK: topK ?? 5,
        sourceScope: 'EXTERNAL',
      };
    } else {
      // 新签名: ({ caseId?, query?, topK?, sourceScope? })
      payload = {
        caseId: queryOrParams.caseId ?? null,
        query: queryOrParams.query ?? null,
        topK: queryOrParams.topK ?? 5,
        sourceScope: queryOrParams.sourceScope ?? 'EXTERNAL',
      };
    }

    return post(`${AI}/similar-cases/search`, payload);
  },

  sessionsCreate: (title?: string | null): Promise<any> =>
    post(`${AI}/sessions/create`, { title: title ?? null }),
};

export default aiBffApi;
