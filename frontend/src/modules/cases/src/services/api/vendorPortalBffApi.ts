/**
 * 供应商门户 BFF API (3.S19)
 *
 * vendor-portal: summary, my-cases, update-progress, submit-report  (4 POST)
 *
 * 挂载路径: /api/bff/v1/vendor-portal/*
 * 错误码: 5700
 *
 * 注意：schemas 使用裸 BaseModel（无 alias_generator）→ camelCase 字段名
 * D22 约定：BFF 内部处理 current_user.id → external_lawyers.user_id → external_lawyers.id
 * 前端无需传 lawyerId
 */

import apiClient from './client';

const post = async (url: string, body: Record<string, unknown> = {}): Promise<any> => {
  const res = await apiClient.post(url, body);
  return res.data?.data ?? res.data;
};

const _origin = ((import.meta.env.VITE_API_BASE_URL as string) || '/api/v1').replace(/\/api\/v1\/?$/, '');
const BASE = `${_origin}/api/bff/v1/vendor-portal`;

const vendorPortalBffApi = {
  summary: (): Promise<any> =>
    post(`${BASE}/summary`),

  myCases: (params: {
    page?: number;
    pageSize?: number;
  } = {}): Promise<any> =>
    post(`${BASE}/my-cases`, {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 20,
    }),

  updateProgress: (params: {
    caseId: string;
    progressNote: string;
  }): Promise<any> =>
    post(`${BASE}/update-progress`, params),

  submitReport: (params: {
    caseId: string;
    reportContent: string;
    reportType: string;
  }): Promise<any> =>
    post(`${BASE}/submit-report`, params),
};

export default vendorPortalBffApi;
