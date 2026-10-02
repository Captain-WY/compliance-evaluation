"""附件管理 Service (2.S18 + 4.S2).

端点映射:
  POST /attachments/register   → register_attachment
  POST /attachments/list       → list_attachments
  POST /attachments/delete     → delete_attachment
  POST /attachments/presign-put → get_presign_put_url  (4.S2 新增)

决策:
  D1 = 简化直传 — 客户端直传 MinIO/OSS，完成后调用 /register 注册元数据
  软删除 — is_deleted=True，不清理存储后端文件
  presign objectKey 命名: attachments/{business_type_lower}/{uuid_hex}.{ext}
"""
from __future__ import annotations

import uuid
import os
from datetime import datetime, timezone

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.exceptions import BusinessException
from ..enums.case_enums import AttachmentBusinessType, StorageProvider
from ..models.sys_attachments import SysAttachment
from ..providers.storage import IStorageProvider
from ..schemas.notifications import (
    AttachmentRegisterRequest,
    AttachmentRegisterResponse,
    AttachmentListRequest,
    AttachmentListResponse,
    AttachmentItem,
    AttachmentDeleteRequest,
    AttachmentPresignRequest,
    AttachmentPresignResponse,
)

_VALID_BUSINESS_TYPES = {e.value for e in AttachmentBusinessType}
_VALID_STORAGE_PROVIDERS = {e.value for e in StorageProvider}


def _attachment_item(a: SysAttachment) -> AttachmentItem:
    return AttachmentItem(
        attachmentId=a.id,
        fileName=a.file_name,
        fileExtension=a.file_extension,
        fileSize=a.file_size,
        mimeType=a.mime_type,
        fileUrl=a.file_url,
        storageProvider=a.storage_provider,
        description=a.description,
        uploaderId=a.uploader_id,
        createdAt=a.created_at.isoformat() if a.created_at else "",
    )


async def register_attachment(
    req: AttachmentRegisterRequest,
    tenant_id: str,
    user_id: str,
    db: AsyncSession,
) -> AttachmentRegisterResponse:
    if req.businessType not in _VALID_BUSINESS_TYPES:
        raise BusinessException(code=5410, message=f"businessType 非法值: {req.businessType}")
    provider = req.storageProvider or "OSS"
    if provider not in _VALID_STORAGE_PROVIDERS:
        raise BusinessException(code=5411, message=f"storageProvider 非法值: {provider}")

    async with db.begin():
        att = SysAttachment(
            tenant_id=tenant_id,
            business_type=req.businessType,
            business_id=req.businessId,
            file_name=req.fileName,
            file_extension=req.fileExtension,
            file_size=req.fileSize,
            mime_type=req.mimeType,
            storage_provider=provider,
            file_url=req.fileUrl,
            uploader_id=user_id,
            description=req.description,
        )
        db.add(att)
        await db.flush()
        att_id = att.id
        att_created = att.created_at

    return AttachmentRegisterResponse(
        attachmentId=att_id,
        fileName=req.fileName,
        fileUrl=req.fileUrl,
        createdAt=att_created.isoformat() if att_created else datetime.now(timezone.utc).isoformat(),
    )


async def list_attachments(
    req: AttachmentListRequest,
    tenant_id: str,
    db: AsyncSession,
) -> AttachmentListResponse:
    stmt = select(SysAttachment).where(
        SysAttachment.is_deleted == False,
        SysAttachment.tenant_id == tenant_id,
        SysAttachment.business_type == req.businessType,
        SysAttachment.business_id == req.businessId,
    )
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar_one()

    stmt = stmt.order_by(SysAttachment.created_at.desc())
    stmt = stmt.offset((req.page - 1) * req.pageSize).limit(req.pageSize)
    rows = (await db.execute(stmt)).scalars().all()

    return AttachmentListResponse(
        total=total,
        page=req.page,
        pageSize=req.pageSize,
        items=[_attachment_item(a) for a in rows],
    )


async def delete_attachment(
    req: AttachmentDeleteRequest,
    tenant_id: str,
    user_id: str,
    db: AsyncSession,
) -> None:
    now = datetime.now(timezone.utc)
    async with db.begin():
        stmt = select(SysAttachment).where(
            SysAttachment.is_deleted == False,
            SysAttachment.tenant_id == tenant_id,
            SysAttachment.id == req.attachmentId,
        )
        att = (await db.execute(stmt)).scalar_one_or_none()
        if not att:
            raise BusinessException(code=5412, message="附件不存在或无权限")

        await db.execute(
            update(SysAttachment)
            .where(SysAttachment.id == req.attachmentId)
            .values(is_deleted=True, updated_at=now, updated_by=user_id)
        )


async def get_presign_put_url(
    req: AttachmentPresignRequest,
    storage: IStorageProvider,
    bucket: str,
) -> AttachmentPresignResponse:
    """生成 presigned PUT URL (4.S2 D1).

    客户端拿到 URL 后直接 PUT 文件体，完成后调用 /register 写入元数据。
    object_key 格式: attachments/{uuid_hex}.{ext}（不含 tenant_id，由 bucket 隔离）
    """
    ext = os.path.splitext(req.fileName)[1].lstrip(".") if req.fileName else ""
    key_base = uuid.uuid4().hex
    object_key = f"attachments/{key_base}.{ext}" if ext else f"attachments/{key_base}"

    expires = max(60, min(req.expiresIn, 3600))

    presigned_url = await storage.get_presigned_put_url(
        bucket=bucket,
        object_key=object_key,
        expires_in=expires,
        content_type=req.contentType,
    )

    return AttachmentPresignResponse(
        presignedUrl=presigned_url,
        objectKey=object_key,
        expiresIn=expires,
    )
