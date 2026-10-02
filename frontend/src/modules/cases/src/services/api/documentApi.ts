/**
 * 文档管理 API
 */

import apiClient from './client'
import type {
  DocumentUploadRequest,
  DocumentResponse,
  DocumentListResponse,
  DocumentAccessRequest,
  AccessRequestResponse,
} from '@cases/types/api/document'

export const documentApi = {
  /**
   * 获取案件文档列表
   * GET /api/v1/cases/{case_id}/documents
   */
  getDocuments: async (
    caseId: string,
    params?: { page?: number; size?: number }
  ): Promise<DocumentListResponse> => {
    const response = await apiClient.get<DocumentListResponse>(
      `/cases/${caseId}/documents`,
      { params }
    )
    return response.data
  },

  /**
   * 上传文档
   * POST /api/v1/cases/{case_id}/documents
   */
  uploadDocument: async (
    caseId: string,
    file: File,
    metadata: DocumentUploadRequest
  ): Promise<DocumentResponse> => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('document_type', metadata.documentType)

    if (metadata.description) {
      formData.append('description', metadata.description)
    }
    if (metadata.confidentialityLevel) {
      formData.append('confidentiality_level', metadata.confidentialityLevel)
    }
    if (metadata.documentDate) {
      formData.append('document_date', metadata.documentDate)
    }

    const response = await apiClient.post<DocumentResponse>(
      `/cases/${caseId}/documents`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    )
    return response.data
  },

  /**
   * 下载文档
   * GET /api/v1/documents/{document_id}/download
   */
  downloadDocument: async (documentId: string): Promise<Blob> => {
    const response = await apiClient.get(`/documents/${documentId}/download`, {
      responseType: 'blob',
    })
    return response.data
  },

  /**
   * 请求文档访问权限
   * POST /api/v1/documents/{document_id}/request-access
   */
  requestAccess: async (
    documentId: string,
    requestData: DocumentAccessRequest
  ): Promise<AccessRequestResponse> => {
    const response = await apiClient.post<AccessRequestResponse>(
      `/documents/${documentId}/request-access`,
      requestData
    )
    return response.data
  },
}