import { useState, useCallback } from 'react';
import { getAttachmentPresignUrl, registerAttachment } from '../../services/case';

export interface UploadedFile {
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
}

interface UseFileUploadOptions {
  businessType: string;
}

interface UseFileUploadReturn {
  uploading: boolean;
  uploadFiles: (files: File[], businessId: string) => Promise<UploadedFile[]>;
}

/**
 * presign → PUT → register 三步直传 hook (4.S2 D1)
 *
 * businessType 在 hook 初始化时固定，businessId 在每次调用时传入（支持动态切换）。
 *
 * 用法:
 *   const { uploading, uploadFiles } = useFileUpload({ businessType: 'INBOX_EMAIL' });
 *   const uploaded = await uploadFiles(selectedFiles, emailId);
 *   // uploaded[i].fileUrl 即 objectKey，可传给后端 fileUrls 字段
 */
export function useFileUpload({ businessType }: UseFileUploadOptions): UseFileUploadReturn {
  const [uploading, setUploading] = useState(false);

  const uploadFiles = useCallback(async (files: File[], businessId: string): Promise<UploadedFile[]> => {
    if (files.length === 0) return [];
    setUploading(true);
    try {
      const results: UploadedFile[] = [];

      for (const file of files) {
        try {
          // Step 1: 获取 presigned PUT URL
          const presign = await getAttachmentPresignUrl({
            fileName: file.name,
            contentType: file.type || null,
          });
          if (!presign) continue;

          // Step 2: 直传文件到存储后端
          const putRes = await fetch(presign.presignedUrl, {
            method: 'PUT',
            body: file,
            headers: file.type ? { 'Content-Type': file.type } : {},
          });
          if (!putRes.ok) continue;

          // Step 3: 注册元数据
          const ext = file.name.includes('.') ? file.name.split('.').pop() : undefined;
          const registered = await registerAttachment({
            businessType,
            businessId,
            fileName: file.name,
            fileUrl: presign.objectKey,
            fileExtension: ext ?? null,
            fileSize: file.size,
            mimeType: file.type || null,
          });
          if (!registered) continue;

          results.push({
            fileName: file.name,
            fileUrl: presign.objectKey,
            fileSize: file.size,
            mimeType: file.type,
          });
        } catch {
          // 单文件失败不中断其他文件
        }
      }

      return results;
    } finally {
      setUploading(false);
    }
  }, [businessType]);

  return { uploading, uploadFiles };
}
