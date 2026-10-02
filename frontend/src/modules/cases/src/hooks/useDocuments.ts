/**
 * 文档管理 React Query Hooks
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { documentApi } from '@cases/services/api/documentApi'
import type { DocumentUploadRequest, DocumentAccessRequest } from '@cases/types/api/document'

/**
 * 查询案件文档列表
 */
export function useDocuments(caseId: string, page = 1, size = 20) {
  return useQuery({
    queryKey: ['documents', caseId, page, size],
    queryFn: () => documentApi.getDocuments(caseId, { page, size }),
    enabled: !!caseId,
  })
}

/**
 * 上传文档
 */
export function useUploadDocument() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      caseId,
      file,
      metadata,
    }: {
      caseId: string
      file: File
      metadata: DocumentUploadRequest
    }) => documentApi.uploadDocument(caseId, file, metadata),
    onSuccess: (_, variables) => {
      // 刷新文档列表
      queryClient.invalidateQueries({ queryKey: ['documents', variables.caseId] })
    },
  })
}

/**
 * 下载文档
 */
export function useDownloadDocument() {
  return useMutation({
    mutationFn: (documentId: string) => documentApi.downloadDocument(documentId),
    onSuccess: (blob) => {
      // 创建下载链接
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `document-${Date.now()}` // 实际文件名应该从响应头获取
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    },
  })
}

/**
 * 请求文档访问权限
 */
export function useRequestDocumentAccess() {
  return useMutation({
    mutationFn: ({
      documentId,
      requestData,
    }: {
      documentId: string
      requestData: DocumentAccessRequest
    }) => documentApi.requestAccess(documentId, requestData),
  })
}