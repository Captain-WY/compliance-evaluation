import {requestRaw} from '../../../../platform/transport';
/**
 * Documents API Service
 * Handles document upload, download, and management
 */

import { apiClient } from './client';
import { CaseDocument } from '../../types';

// Backend response types
interface DocumentResponse {
  id: string;
  caseId: string;
  documentName: string;
  documentType: string;
  documentCategory: string;
  fileSize: number;
  fileFormat: string;
  uploadDate: string;
  uploaderId: string;
  uploaderName: string;
  version: number;
  parentId?: string;
  tags?: string[];
  evidenceNo?: string;
  proofPurpose?: string;
  accessLevel?: string;
  downloadCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

// Map backend document to frontend CaseDocument
function mapDocument(backendDoc: DocumentResponse): CaseDocument {
  // Map file format
  const formatMap: Record<string, 'pdf' | 'doc' | 'docx' | 'xls' | 'xlsx' | 'jpg' | 'png' | 'other'> = {
    'pdf': 'pdf',
    'doc': 'doc',
    'docx': 'docx',
    'xls': 'xls',
    'xlsx': 'xlsx',
    'jpg': 'jpg',
    'jpeg': 'jpg',
    'png': 'png'
  };

  const format = formatMap[backendDoc.fileFormat.toLowerCase()] || 'other';

  return {
    id: backendDoc.id,
    name: backendDoc.documentName,
    type: format,
    category: backendDoc.documentCategory,
    uploadDate: backendDoc.uploadDate,
    uploader: backendDoc.uploaderName,
    size: formatFileSize(backendDoc.fileSize),
    tags: backendDoc.tags,
    version: backendDoc.version,
    parentId: backendDoc.parentId,
    evidenceNo: backendDoc.evidenceNo,
    proofPurpose: backendDoc.proofPurpose
  };
}

// Format file size
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export const documentsApi = {
  /**
   * Get documents for a case
   */
  async getCaseDocuments(caseId: string): Promise<CaseDocument[]> {
    const response: DocumentResponse[] = await apiClient.get<DocumentResponse[]>(
      `/cases/${caseId}/documents`
    );
    return response.map(mapDocument);
  },

  /**
   * Upload document
   * Note: File upload requires FormData, not JSON
   */
  async uploadDocument(
    caseId: string,
    file: File,
    metadata: {
      documentCategory: string;
      evidenceNo?: string;
      proofPurpose?: string;
      tags?: string[];
    }
  ): Promise<CaseDocument> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('document_name', file.name);
    formData.append('document_type', file.type);
    formData.append('document_category', metadata.documentCategory);
    if (metadata.evidenceNo) formData.append('evidence_no', metadata.evidenceNo);
    if (metadata.proofPurpose) formData.append('proof_purpose', metadata.proofPurpose);
    if (metadata.tags) formData.append('tags', JSON.stringify(metadata.tags));

    // For file uploads, we need to use fetch directly
    const token = localStorage.getItem('compliance-platform-token');
    const response = await requestRaw(`${import.meta.env.VITE_API_BASE_URL || '/api/v1'}/cases/${caseId}/documents`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    if (!response.ok) {
      throw new Error('Document upload failed');
    }

    const result = await response.json();
    return mapDocument(result.data);
  },

  /**
   * Download document
   */
  async downloadDocument(documentId: string): Promise<Blob> {
    const token = localStorage.getItem('compliance-platform-token');
    const response = await requestRaw(
      `${import.meta.env.VITE_API_BASE_URL || '/api/v1'}/documents/${documentId}/download`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );

    if (!response.ok) {
      throw new Error('Document download failed');
    }

    return await response.blob();
  },

  /**
   * Delete document
   */
  async deleteDocument(caseId: string, documentId: string): Promise<void> {
    await apiClient.delete(`/cases/${caseId}/documents/${documentId}`);
  },

  /**
   * Update document metadata
   */
  async updateDocument(
    caseId: string,
    documentId: string,
    updates: {
      documentName?: string;
      documentCategory?: string;
      tags?: string[];
      evidenceNo?: string;
      proofPurpose?: string;
    }
  ): Promise<CaseDocument> {
    const response: DocumentResponse = await apiClient.patch<DocumentResponse>(
      `/cases/${caseId}/documents/${documentId}`,
      updates
    );
    return mapDocument(response);
  }
};