"""文书模板管理 BFF 路由 (2.S17).

挂载路径: POST /api/bff/v1/templates/*
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ....core.database import get_db
from ....core.deps import get_current_user
from ....models.sys_users import SysUser
from ....schemas.common import StandardResponse
from ....schemas.templates import (
    TemplateListRequest, TemplateListResponse,
    TemplateDetailRequest, TemplateDetailResponse,
    TemplateCreateRequest, TemplateCreateResponse,
    TemplateUpdateRequest, TemplateUpdateResponse,
    TemplateReplaceFileRequest, TemplateReplaceFileResponse,
    TemplateToggleRequest, TemplateToggleResponse,
)
from ....services import template_service

router = APIRouter(tags=["BFF - 文书模板管理"])


@router.post("/list", response_model=StandardResponse[TemplateListResponse])
async def list_templates(
    req: TemplateListRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await template_service.list_templates(db, req=req, tenant_id=current_user.tenant_id)
    return StandardResponse(code=200, message="获取成功", data=data)


@router.post("/detail", response_model=StandardResponse[TemplateDetailResponse])
async def get_template_detail(
    req: TemplateDetailRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await template_service.get_template_detail(
        db, template_id=req.templateId, tenant_id=current_user.tenant_id
    )
    return StandardResponse(code=200, message="获取成功", data=data)


@router.post("/create", response_model=StandardResponse[TemplateCreateResponse])
async def create_template(
    req: TemplateCreateRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await template_service.create_template(
        db, req=req, tenant_id=current_user.tenant_id, operator_id=current_user.id
    )
    return StandardResponse(code=200, message="创建成功", data=data)


@router.post("/update", response_model=StandardResponse[TemplateUpdateResponse])
async def update_template(
    req: TemplateUpdateRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await template_service.update_template(
        db, req=req, tenant_id=current_user.tenant_id, operator_id=current_user.id
    )
    return StandardResponse(code=200, message="更新成功", data=data)


@router.post("/replace-file", response_model=StandardResponse[TemplateReplaceFileResponse])
async def replace_template_file(
    req: TemplateReplaceFileRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await template_service.replace_template_file(
        db, req=req, tenant_id=current_user.tenant_id, operator_id=current_user.id
    )
    return StandardResponse(code=200, message="文件替换成功", data=data)


@router.post("/toggle", response_model=StandardResponse[TemplateToggleResponse])
async def toggle_template(
    req: TemplateToggleRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await template_service.toggle_template(
        db, req=req, tenant_id=current_user.tenant_id, operator_id=current_user.id
    )
    return StandardResponse(code=200, message="操作成功", data=data)
