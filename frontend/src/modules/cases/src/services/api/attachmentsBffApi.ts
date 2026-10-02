/**
 * 附件管理 BFF API (2.S18)
 *
 * attachments: register, list, delete, presign-put  (4 POST)
 *
 * 挂载路径: /api/bff/v1/attachments/*
 * 错误码: 5410-5412
 *
 * 注意：schemas 使用裸 BaseModel（无 alias_generator）→ camelCase 字段名
 * D1=简化直传：客户端直传存储后调用 register 写入元数据
 * AttachmentBusinessType: INBOX_EMAIL / CASE_CLUE / GENERAL
 */

import apiClient from './client';

const post = async (url: string, body: Record<string, unknown> = {}): Promise<any> => {
  const res = await apiClient.post(url, body);
  return res.data?.data ?? res.data;
};

const _origin = ((import.meta.env.VITE_API_BASE_URL as string) || '/api/v1').replace(/\/api\/v1\/?$/, '');
const BASE = `${_origin}/api/bff/v1/attachments`;

const attachmentsBffApi = {
  register: (params: {
    businessType: string;
    businessId: string;
    fileName: string;
    fileUrl: string;
    fileExtension?: string | null;
    fileSize?: number | null;
    mimeType?: string | null;
    storageProvider?: string;
    description?: string | null;
  }): Promise<any> =>
    post(`${BASE}/register`, {
      businessType: params.businessType,
      businessId: params.businessId,
      fileName: params.fileName,
      fileUrl: params.fileUrl,
      fileExtension: params.fileExtension ?? null,
      fileSize: params.fileSize ?? null,
      mimeType: params.mimeType ?? null,
      storageProvider: params.storageProvider ?? 'OSS',
      description: params.description ?? null,
    }),

  list: (params: {
    businessType: string;
    businessId: string;
    page?: number;
    pageSize?: number;
  }): Promise<any> =>
    post(`${BASE}/list`, {
      businessType: params.businessType,
      businessId: params.businessId,
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 50,
    }),

  delete: (attachmentId: string): Promise<any> =>
    post(`${BASE}/delete`, { attachmentId }),

  presignPut: (params: {
    fileName: string;
    contentType?: string | null;
    expiresIn?: number;
  }): Promise<any> =>
    post(`${BASE}/presign-put`, {
      fileName: params.fileName,
      contentType: params.contentType ?? null,
      expiresIn: params.expiresIn ?? 900,
    }),
};

export default attachmentsBffApi;
