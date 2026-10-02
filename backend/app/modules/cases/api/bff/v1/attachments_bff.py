"""附件管理 BFF 路由 (2.S18 + 4.S2).

挂载前缀: /api/bff/v1/attachments
全 POST。
  /register   — 注册附件元数据
  /list       — 查询附件列表
  /delete     — 软删除附件
  /presign-put — 生成 presigned PUT URL (4.S2)
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ....core.config import settings
from ....core.database import get_db
from ....core.deps import get_storage
from ....core.deps import get_current_user
from ....models.sys_users import SysUser
from ....providers.storage import IStorageProvider
from ....schemas.notifications import (
    AttachmentRegisterRequest,
    AttachmentListRequest,
    AttachmentDeleteRequest,
    AttachmentPresignRequest,
)
from ....services import attachment_service

router = APIRouter()


@router.post("/register")
async def register_attachment(
    req: AttachmentRegisterRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await attachment_service.register_attachment(
        req=req,
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        db=db,
    )
    return {"code": 200, "message": "注册成功", "data": data.model_dump()}


@router.post("/list")
async def list_attachments(
    req: AttachmentListRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await attachment_service.list_attachments(
        req=req,
        tenant_id=current_user.tenant_id,
        db=db,
    )
    return {"code": 200, "message": "获取成功", "data": data.model_dump()}


@router.post("/delete")
async def delete_attachment(
    req: AttachmentDeleteRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await attachment_service.delete_attachment(
        req=req,
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        db=db,
    )
    return {"code": 200, "message": "删除成功", "data": {"attachmentId": req.attachmentId, "deleted": True}}


@router.post("/presign-put")
async def presign_put(
    req: AttachmentPresignRequest,
    current_user: SysUser = Depends(get_current_user),
    storage: IStorageProvider = Depends(get_storage),
):
    """生成 presigned PUT URL，供前端直传文件到存储后端 (4.S2 D1)."""
    data = await attachment_service.get_presign_put_url(
        req=req,
        storage=storage,
        bucket=settings.MINIO_BUCKET,
    )
    return {"code": 200, "message": "获取成功", "data": data.model_dump()}
