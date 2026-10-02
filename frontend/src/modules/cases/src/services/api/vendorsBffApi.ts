/**
 * 律所 & 外部律师 BFF API (2.S17)
 *
 * vendors:  list, detail, create, update, toggle, cases  (6)
 * lawyers:  list, detail, create, update                 (4)
 *
 * 挂载路径: /api/bff/v1/{vendors|lawyers}/*
 * 错误码: 5200-5219
 *
 * 注意：schemas 使用裸 BaseModel（无 alias_generator）→ camelCase 字段名
 */

import apiClient from './client';

const post = async (url: string, body: Record<string, unknown> = {}): Promise<any> => {
  const res = await apiClient.post(url, body);
  return res.data?.data ?? res.data;
};

const _origin = ((import.meta.env.VITE_API_BASE_URL as string) || '/api/v1').replace(/\/api\/v1\/?$/, '');
const VENDORS = `${_origin}/api/bff/v1/vendors`;
const LAWYERS = `${_origin}/api/bff/v1/lawyers`;

const vendorsBffApi = {
  // ── 律所 (6 端点) ────────────────────────────────────────────────────────

  vendorsList: (params: {
    page?: number;
    pageSize?: number;
    keyword?: string | null;
    cooperationStatus?: string | null;
    ratingLevel?: string | null;
  } = {}): Promise<any> =>
    post(`${VENDORS}/list`, {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 20,
      keyword: params.keyword ?? null,
      cooperationStatus: params.cooperationStatus ?? null,
      ratingLevel: params.ratingLevel ?? null,
    }),

  vendorsDetail: (firmId: string): Promise<any> =>
    post(`${VENDORS}/detail`, { firmId }),

  vendorsCreate: (params: {
    firmName: string;
    unifiedSocialCreditCode?: string | null;
    profile?: string | null;
    rateCardSummary?: string | null;
    cooperationStatus?: string;
    ratingLevel?: string | null;
  }): Promise<any> =>
    post(`${VENDORS}/create`, {
      firmName: params.firmName,
      unifiedSocialCreditCode: params.unifiedSocialCreditCode ?? null,
      profile: params.profile ?? null,
      rateCardSummary: params.rateCardSummary ?? null,
      cooperationStatus: params.cooperationStatus ?? 'BACKUP',
      ratingLevel: params.ratingLevel ?? null,
    }),

  vendorsUpdate: (params: {
    firmId: string;
    firmName: string;
    unifiedSocialCreditCode?: string | null;
    profile?: string | null;
    rateCardSummary?: string | null;
    ratingLevel?: string | null;
  }): Promise<any> =>
    post(`${VENDORS}/update`, {
      firmId: params.firmId,
      firmName: params.firmName,
      unifiedSocialCreditCode: params.unifiedSocialCreditCode ?? null,
      profile: params.profile ?? null,
      rateCardSummary: params.rateCardSummary ?? null,
      ratingLevel: params.ratingLevel ?? null,
    }),

  // targetStatus: 'ACTIVE' | 'BACKUP' | 'BLACKLISTED'
  vendorsToggle: (firmId: string, targetStatus: string): Promise<any> =>
    post(`${VENDORS}/toggle`, { firmId, targetStatus }),

  vendorsCases: (firmId: string, params: { page?: number; pageSize?: number } = {}): Promise<any> =>
    post(`${VENDORS}/cases`, {
      firmId,
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 20,
    }),

  // ── 外部律师 (4 端点) ─────────────────────────────────────────────────────

  lawyersList: (params: {
    page?: number;
    pageSize?: number;
    keyword?: string | null;
    firmId?: string | null;
    status?: string | null;
  } = {}): Promise<any> =>
    post(`${LAWYERS}/list`, {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 20,
      keyword: params.keyword ?? null,
      firmId: params.firmId ?? null,
      status: params.status ?? null,
    }),

  lawyersDetail: (lawyerId: string): Promise<any> =>
    post(`${LAWYERS}/detail`, { lawyerId }),

  lawyersCreate: (params: {
    firmId: string;
    lawyerName: string;
    licenseNumber?: string | null;
    title?: string | null;
    expertise?: string | null;
    contactPhone?: string | null;
    contactEmail?: string | null;
    status?: string;
  }): Promise<any> =>
    post(`${LAWYERS}/create`, {
      firmId: params.firmId,
      lawyerName: params.lawyerName,
      licenseNumber: params.licenseNumber ?? null,
      title: params.title ?? null,
      expertise: params.expertise ?? null,
      contactPhone: params.contactPhone ?? null,
      contactEmail: params.contactEmail ?? null,
      status: params.status ?? 'ACTIVE',
    }),

  lawyersUpdate: (params: {
    lawyerId: string;
    lawyerName?: string | null;
    licenseNumber?: string | null;
    title?: string | null;
    expertise?: string | null;
    contactPhone?: string | null;
    contactEmail?: string | null;
    status?: string | null;
  }): Promise<any> =>
    post(`${LAWYERS}/update`, {
      lawyerId: params.lawyerId,
      lawyerName: params.lawyerName ?? null,
      licenseNumber: params.licenseNumber ?? null,
      title: params.title ?? null,
      expertise: params.expertise ?? null,
      contactPhone: params.contactPhone ?? null,
      contactEmail: params.contactEmail ?? null,
      status: params.status ?? null,
    }),
};

export default vendorsBffApi;
