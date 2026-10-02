/**
 * 业务门户 BFF API (3.S19)
 *
 * business-portal: my-tasks, submit-evidence, task-detail  (3 POST)
 *
 * 挂载路径: /api/bff/v1/business-portal/*
 * 错误码: 5600
 *
 * 注意：schemas 使用裸 BaseModel（无 alias_generator）→ camelCase 字段名
 * BFF 通过 current_user.id 过滤任务，无需传 userDept
 */

import apiClient from './client';

const post = async (url: string, body: Record<string, unknown> = {}): Promise<any> => {
  const res = await apiClient.post(url, body);
  return res.data?.data ?? res.data;
};

const _origin = ((import.meta.env.VITE_API_BASE_URL as string) || '/api/v1').replace(/\/api\/v1\/?$/, '');
const BASE = `${_origin}/api/bff/v1/business-portal`;

const businessPortalBffApi = {
  myTasks: (params: {
    status?: string | null;
    page?: number;
    pageSize?: number;
  } = {}): Promise<any> =>
    post(`${BASE}/my-tasks`, {
      status: params.status ?? null,
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 50,
    }),

  submitEvidence: (params: {
    taskId: string;
    fileUrls: string[];
    comment?: string;
  }): Promise<any> =>
    post(`${BASE}/submit-evidence`, {
      taskId: params.taskId,
      fileUrls: params.fileUrls,
      comment: params.comment ?? null,
    }),

  taskDetail: (taskId: string): Promise<any> =>
    post(`${BASE}/task-detail`, { taskId }),
};

export default businessPortalBffApi;
