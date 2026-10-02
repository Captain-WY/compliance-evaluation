/**
 * 模板库 BFF API (2.S17)
 *
 * 文档模板:   list, detail, create, update, replace-file, toggle  (6)
 * 流程模板:   list, detail, create, update, toggle                 (5)
 * 任务模板:   list, create, update, delete                         (4)
 *
 * 挂载路径: /api/bff/v1/{templates|process-templates|task-templates}/*
 * 错误码: 5220-5259
 *
 * 注意：schemas 使用裸 BaseModel（无 alias_generator）→ camelCase 字段名
 * D1=A: fileUrl 为直链字符串，无 MinIO 预签名
 */

import apiClient from './client';

const post = async (url: string, body: Record<string, unknown> = {}): Promise<any> => {
  const res = await apiClient.post(url, body);
  return res.data?.data ?? res.data;
};

const _origin = ((import.meta.env.VITE_API_BASE_URL as string) || '/api/v1').replace(/\/api\/v1\/?$/, '');
const DOC = `${_origin}/api/bff/v1/templates`;
const PROC = `${_origin}/api/bff/v1/process-templates`;
const TASK = `${_origin}/api/bff/v1/task-templates`;

const templatesBffApi = {
  // ── 文档模板 (6 端点) ─────────────────────────────────────────────────────

  docList: (params: {
    page?: number;
    pageSize?: number;
    keyword?: string | null;
    category?: string | null;
    status?: string | null;
  } = {}): Promise<any> =>
    post(`${DOC}/list`, {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 20,
      keyword: params.keyword ?? null,
      category: params.category ?? null,
      status: params.status ?? null,
    }),

  docDetail: (templateId: string): Promise<any> =>
    post(`${DOC}/detail`, { templateId }),

  docCreate: (params: {
    templateName: string;
    category: string;
    fileUrl: string;
    fileType: string;
    description?: string | null;
  }): Promise<any> =>
    post(`${DOC}/create`, {
      templateName: params.templateName,
      category: params.category,
      fileUrl: params.fileUrl,
      fileType: params.fileType,
      description: params.description ?? null,
    }),

  docUpdate: (params: {
    templateId: string;
    templateName: string;
    category: string;
    description?: string | null;
  }): Promise<any> =>
    post(`${DOC}/update`, {
      templateId: params.templateId,
      templateName: params.templateName,
      category: params.category,
      description: params.description ?? null,
    }),

  // D1=A: fileUrl 直链，前端填文本 URL
  docReplaceFile: (params: {
    templateId: string;
    fileUrl: string;
    fileType: string;
    versionNote?: string | null;
  }): Promise<any> =>
    post(`${DOC}/replace-file`, {
      templateId: params.templateId,
      fileUrl: params.fileUrl,
      fileType: params.fileType,
      versionNote: params.versionNote ?? null,
    }),

  docToggle: (templateId: string, targetStatus: string): Promise<any> =>
    post(`${DOC}/toggle`, { templateId, targetStatus }),

  // ── 流程模板 (5 端点) ─────────────────────────────────────────────────────

  processList: (params: {
    page?: number;
    pageSize?: number;
    caseTypeCode?: string | null;
    stageCode?: string | null;
    isActive?: boolean | null;
  } = {}): Promise<any> =>
    post(`${PROC}/list`, {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 50,
      caseTypeCode: params.caseTypeCode ?? null,
      stageCode: params.stageCode ?? null,
      isActive: params.isActive ?? null,
    }),

  processDetail: (processTemplateId: string): Promise<any> =>
    post(`${PROC}/detail`, { processTemplateId }),

  processCreate: (params: {
    caseTypeCode: string;
    stageCode: string;
    stageName: string;
    sortOrder?: number;
    isRequired?: boolean;
    description?: string | null;
  }): Promise<any> =>
    post(`${PROC}/create`, {
      caseTypeCode: params.caseTypeCode,
      stageCode: params.stageCode,
      stageName: params.stageName,
      sortOrder: params.sortOrder ?? 0,
      isRequired: params.isRequired ?? true,
      description: params.description ?? null,
    }),

  processUpdate: (params: {
    processTemplateId: string;
    stageName: string;
    sortOrder: number;
    isRequired: boolean;
    description?: string | null;
  }): Promise<any> =>
    post(`${PROC}/update`, {
      processTemplateId: params.processTemplateId,
      stageName: params.stageName,
      sortOrder: params.sortOrder,
      isRequired: params.isRequired,
      description: params.description ?? null,
    }),

  processToggle: (processTemplateId: string, isActive: boolean): Promise<any> =>
    post(`${PROC}/toggle`, { processTemplateId, isActive }),

  // ── 任务模板 (4 端点) ─────────────────────────────────────────────────────

  taskList: (processTemplateId: string, params: { page?: number; pageSize?: number } = {}): Promise<any> =>
    post(`${TASK}/list`, {
      processTemplateId,
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 100,
    }),

  taskCreate: (params: {
    processTemplateId: string;
    taskName: string;
    taskCode?: string | null;
    taskGroup?: string | null;
    isMilestone?: boolean;
    isRequired?: boolean;
    sortOrder?: number;
    defaultDaysDue?: number | null;
    description?: string | null;
  }): Promise<any> =>
    post(`${TASK}/create`, {
      processTemplateId: params.processTemplateId,
      taskName: params.taskName,
      taskCode: params.taskCode ?? null,
      taskGroup: params.taskGroup ?? null,
      isMilestone: params.isMilestone ?? false,
      isRequired: params.isRequired ?? true,
      sortOrder: params.sortOrder ?? 0,
      defaultDaysDue: params.defaultDaysDue ?? null,
      description: params.description ?? null,
    }),

  taskUpdate: (params: {
    taskTemplateId: string;
    taskName?: string | null;
    taskGroup?: string | null;
    isMilestone?: boolean | null;
    isRequired?: boolean | null;
    sortOrder?: number | null;
    defaultDaysDue?: number | null;
    description?: string | null;
  }): Promise<any> =>
    post(`${TASK}/update`, {
      taskTemplateId: params.taskTemplateId,
      taskName: params.taskName ?? null,
      taskGroup: params.taskGroup ?? null,
      isMilestone: params.isMilestone ?? null,
      isRequired: params.isRequired ?? null,
      sortOrder: params.sortOrder ?? null,
      defaultDaysDue: params.defaultDaysDue ?? null,
      description: params.description ?? null,
    }),

  taskDelete: (taskTemplateId: string): Promise<any> =>
    post(`${TASK}/delete`, { taskTemplateId }),
};

export default templatesBffApi;
