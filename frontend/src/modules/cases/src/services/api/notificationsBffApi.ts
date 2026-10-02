/**
 * 站内通知 BFF API (2.S18)
 *
 * notifications: list, unread-count, mark-read, mark-all-read  (4 POST)
 * SSE:           sse                                            (1 GET 例外)
 *
 * 挂载路径: /api/bff/v1/notifications/*
 * 错误码: 5400
 *
 * 注意：schemas 使用裸 BaseModel（无 alias_generator）→ camelCase 字段名
 * SSE 流不经 axios 拦截器，字段直接为 camelCase
 */

import apiClient from './client';

const post = async (url: string, body: Record<string, unknown> = {}): Promise<any> => {
  const res = await apiClient.post(url, body);
  return res.data?.data ?? res.data;
};

// 从 baseURL 提取 origin（去掉 /api/v1 路径前缀），POST 和 SSE 共用
const _base = (import.meta.env.VITE_API_BASE_URL as string) || '/api/v1';
const _origin = '';
const BASE = `${_origin}/api/bff/v1/notifications`;

// SSE 使用原始 EventSource，不经过 axios 拦截器
export const SSE_URL = `${BASE}/sse`;

const notificationsBffApi = {
  list: (params: {
    page?: number;
    pageSize?: number;
    notifyType?: string | null;
    isRead?: boolean | null;
  } = {}): Promise<any> =>
    post(`${BASE}/list`, {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 20,
      notifyType: params.notifyType ?? null,
      isRead: params.isRead ?? null,
    }),

  unreadCount: (): Promise<any> =>
    post(`${BASE}/unread-count`),

  markRead: (notificationId: string): Promise<any> =>
    post(`${BASE}/mark-read`, { notificationId }),

  markAllRead: (): Promise<any> =>
    post(`${BASE}/mark-all-read`),
};

export default notificationsBffApi;
