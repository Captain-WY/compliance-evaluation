/**
 * 数据快照 BFF API (2.S19 / 4.S3 修正)
 *
 * snapshots: list, detail, download-url  (3 POST, 只读)
 *
 * 挂载路径: /api/bff/v1/snapshots/*
 * 错误码: 5510-5512
 *
 * snapshotType 路由约定：
 *   FINANCIAL  → financial_snapshots 表（无实体文件，downloadUrl=null）
 *   COMPLIANCE → data_snapshots 表（有 downloadUrl）
 *
 * 4.S3 修正说明：
 *   - 原 create/list/download 三方法与后端端点不对齐，已重写
 *   - list 参数从 businessType 改为 snapshotType，补 period 参数
 *   - download-url 端点补 snapshotType 必填参数
 *   - 移除 create()（后端无此端点，快照由系统生成）
 */

import apiClient from './client';

const post = async (url: string, body: Record<string, unknown> = {}): Promise<any> => {
  const res = await apiClient.post(url, body);
  return res.data?.data ?? res.data;
};

const _origin = ((import.meta.env.VITE_API_BASE_URL as string) || '/api/v1').replace(/\/api\/v1\/?$/, '');
const BASE = `${_origin}/api/bff/v1/snapshots`;

const snapshotsBffApi = {
  list: (params: {
    snapshotType?: 'FINANCIAL' | 'COMPLIANCE' | null;
    period?: string | null;
    page?: number;
    pageSize?: number;
  } = {}): Promise<any> =>
    post(`${BASE}/list`, {
      snapshotType: params.snapshotType ?? null,
      period: params.period ?? null,
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 20,
    }),

  detail: (params: {
    snapshotId: string;
    snapshotType: 'FINANCIAL' | 'COMPLIANCE';
  }): Promise<any> =>
    post(`${BASE}/detail`, {
      snapshotId: params.snapshotId,
      snapshotType: params.snapshotType,
    }),

  downloadUrl: (params: {
    snapshotId: string;
    snapshotType: 'FINANCIAL' | 'COMPLIANCE';
  }): Promise<any> =>
    post(`${BASE}/download-url`, {
      snapshotId: params.snapshotId,
      snapshotType: params.snapshotType,
    }),
};

export default snapshotsBffApi;
