/**
 * 线索管理 + 智能收件箱 BFF API
 *
 * S15 — 13 端点全 POST（D1: 零 GET，零路径参数）
 *   clues: list / detail / create / update / assign / close / prepare-for-case  (7)
 *   inbox/emails: list / detail / mark-read / convert-to-clue / link-to-case / ignore  (6)
 *
 * 挂载路径: /api/bff/v1/clues/*  /api/bff/v1/inbox/*
 * 错误码: 4300-4305 (线索), 4310-4312 (收件箱)
 */

import apiClient from './client';

const _origin = ((import.meta.env.VITE_API_BASE_URL as string) || '/api/v1').replace(/\/api\/v1\/?$/, '');
const BASE_CLUES = `${_origin}/api/bff/v1/clues`;
const BASE_INBOX = `${_origin}/api/bff/v1/inbox/emails`;

const post = async (url: string, body: Record<string, unknown> = {}): Promise<any> => {
  const res = await apiClient.post(url, body);
  return res.data?.data ?? res.data;
};

const clueBffApi = {
  // ── 线索管理 (7 端点) ────────────────────────────────────────────

  listCluesBff: (params: {
    status?: string | null;
    sourceType?: string | null;
    assigneeId?: string | null;
    keyword?: string | null;
    page?: number;
    pageSize?: number;
  } = {}): Promise<any> =>
    post(`${BASE_CLUES}/list`, {
      status: params.status ?? null,
      source_type: params.sourceType ?? null,
      assignee_id: params.assigneeId ?? null,
      keyword: params.keyword ?? null,
      page: params.page ?? 1,
      page_size: params.pageSize ?? 20,
    }),

  getClueDetailBff: (clueId: string): Promise<any> =>
    post(`${BASE_CLUES}/detail`, { clue_id: clueId }),

  createClueBff: (params: {
    clueTitle: string;
    description?: string | null;
    sourceType: string;
    sourceId?: string | null;
    businessLine?: string | null;
    estimatedAmount?: number | null;
    currency?: string;
    opponentName?: string | null;
    assigneeId?: string | null;
  }): Promise<any> =>
    post(`${BASE_CLUES}/create`, {
      clue_title: params.clueTitle,
      description: params.description ?? null,
      source_type: params.sourceType,
      source_id: params.sourceId ?? null,
      business_line: params.businessLine ?? null,
      estimated_amount: params.estimatedAmount ?? null,
      currency: params.currency ?? 'CNY',
      opponent_name: params.opponentName ?? null,
      assignee_id: params.assigneeId ?? null,
    }),

  updateClueBff: (params: {
    clueId: string;
    clueTitle?: string;
    description?: string | null;
    businessLine?: string | null;
    estimatedAmount?: number | null;
    currency?: string;
    opponentName?: string | null;
  }): Promise<any> =>
    post(`${BASE_CLUES}/update`, {
      clue_id: params.clueId,
      clue_title: params.clueTitle,
      description: params.description ?? null,
      business_line: params.businessLine ?? null,
      estimated_amount: params.estimatedAmount ?? null,
      currency: params.currency,
      opponent_name: params.opponentName ?? null,
    }),

  assignClueBff: (clueId: string, assigneeId: string): Promise<any> =>
    post(`${BASE_CLUES}/assign`, { clue_id: clueId, assignee_id: assigneeId }),

  closeClueBff: (params: {
    clueId: string;
    targetStatus: 'REJECTED' | 'CLOSED';
    closedReason?: string;
  }): Promise<any> =>
    post(`${BASE_CLUES}/close`, {
      clue_id: params.clueId,
      target_status: params.targetStatus,
      closed_reason: params.closedReason ?? null,
    }),

  prepareClueForCaseBff: (clueId: string): Promise<any> =>
    post(`${BASE_CLUES}/prepare-for-case`, { clue_id: clueId }),

  // ── 智能收件箱 (6 端点) ──────────────────────────────────────────

  listInboxEmailsBff: (params: {
    processingStatus?: string | null;
    isRead?: boolean | null;
    aiRecommendation?: string | null;
    keyword?: string | null;
    page?: number;
    pageSize?: number;
  } = {}): Promise<any> =>
    post(`${BASE_INBOX}/list`, {
      processing_status: params.processingStatus ?? null,
      is_read: params.isRead ?? null,
      ai_recommendation: params.aiRecommendation ?? null,
      keyword: params.keyword ?? null,
      page: params.page ?? 1,
      page_size: params.pageSize ?? 50,
    }),

  getInboxEmailDetailBff: (emailId: string): Promise<any> =>
    post(`${BASE_INBOX}/detail`, { email_id: emailId }),

  markEmailReadBff: (emailId: string): Promise<any> =>
    post(`${BASE_INBOX}/mark-read`, { email_id: emailId }),

  convertEmailToClueBff: (params: {
    emailId: string;
    clueTitle?: string;
    description?: string | null;
    assigneeId?: string | null;
    estimatedAmount?: number | null;
    opponentName?: string | null;
  }): Promise<any> =>
    post(`${BASE_INBOX}/convert-to-clue`, {
      email_id: params.emailId,
      clue_title: params.clueTitle ?? null,
      description: params.description ?? null,
      assignee_id: params.assigneeId ?? null,
      estimated_amount: params.estimatedAmount ?? null,
      opponent_name: params.opponentName ?? null,
    }),

  linkEmailToCaseBff: (params: {
    emailId: string;
    caseId: string;
    note?: string;
  }): Promise<any> =>
    post(`${BASE_INBOX}/link-to-case`, {
      email_id: params.emailId,
      case_id: params.caseId,
      note: params.note ?? null,
    }),

  ignoreEmailBff: (emailId: string, reason?: string): Promise<any> =>
    post(`${BASE_INBOX}/ignore`, {
      email_id: emailId,
      reason: reason ?? null,
    }),
};

export default clueBffApi;
