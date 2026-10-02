/**
 * 统一审批 BFF API (2.S18)
 *
 * approvals: create, my-todos, detail, process, cancel  (5 POST)
 *
 * 挂载路径: /api/bff/v1/approvals/*
 * 错误码: 5420-5429
 *
 * 注意：schemas 使用裸 BaseModel（无 alias_generator）→ camelCase 字段名
 * D2=单节点：每个 instance 只有一个 task（node_sort=1）
 * D5=回调注册表：process 完成后后端自动分发回调
 */

import apiClient from './client';

const post = async (url: string, body: Record<string, unknown> = {}): Promise<any> => {
  const res = await apiClient.post(url, body);
  return res.data?.data ?? res.data;
};

const _origin = ((import.meta.env.VITE_API_BASE_URL as string) || '/api/v1').replace(/\/api\/v1\/?$/, '');
const BASE = `${_origin}/api/bff/v1/approvals`;

const approvalsBffApi = {
  create: (params: {
    businessType: string;
    businessId: string;
    title: string;
    approverId: string;
    processCode?: string | null;
  }): Promise<any> =>
    post(`${BASE}/create`, {
      businessType: params.businessType,
      businessId: params.businessId,
      title: params.title,
      approverId: params.approverId,
      processCode: params.processCode ?? null,
    }),

  myTodos: (params: {
    page?: number;
    pageSize?: number;
    businessType?: string | null;
  } = {}): Promise<any> =>
    post(`${BASE}/my-todos`, {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 20,
      businessType: params.businessType ?? null,
    }),

  detail: (instanceId: string): Promise<any> =>
    post(`${BASE}/detail`, { instanceId }),

  process: (params: {
    taskId: string;
    action: 'APPROVE' | 'REJECT';
    comment?: string | null;
  }): Promise<any> =>
    post(`${BASE}/process`, {
      taskId: params.taskId,
      action: params.action,
      comment: params.comment ?? null,
    }),

  cancel: (instanceId: string, reason?: string | null): Promise<any> =>
    post(`${BASE}/cancel`, {
      instanceId,
      reason: reason ?? null,
    }),
};

export default approvalsBffApi;
