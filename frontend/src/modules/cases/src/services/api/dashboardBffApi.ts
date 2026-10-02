/**
 * 法务驾驶舱 BFF API (3.S19)
 *
 * dashboard: legal-summary, risk-items  (2 POST)
 *
 * 挂载路径: /api/bff/v1/dashboard/*
 * 错误码: 5500
 *
 * 注意：schemas 使用裸 BaseModel（无 alias_generator）→ camelCase 字段名
 */

import apiClient from './client';

const post = async (url: string, body: Record<string, unknown> = {}): Promise<any> => {
  const res = await apiClient.post(url, body);
  return res.data?.data ?? res.data;
};

const _origin = ((import.meta.env.VITE_API_BASE_URL as string) || '/api/v1').replace(/\/api\/v1\/?$/, '');
const BASE = `${_origin}/api/bff/v1/dashboard`;

const dashboardBffApi = {
  legalSummary: (): Promise<any> =>
    post(`${BASE}/metrics`),

  riskItems: (params: {
    status?: string | null;
    page?: number;
    pageSize?: number;
  } = {}): Promise<any> =>
    post(`${BASE}/alerts`, {
      status: params.status ?? null,
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 20,
    }),
};

export default dashboardBffApi;
