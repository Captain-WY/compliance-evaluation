"""文书模板管理 Service (2.S17).

D1=A: 直接返回 file_url，无预签名
错误码:
  5300 文书模板不存在
  5301 category 非法值
  5302 fileType 非法值
  5306 targetStatus 非法值 (5303 已被 process_template_service 占用)
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.exceptions import BusinessException
from ..enums.case_enums import TemplateCategory, TemplateFileType, SystemEntityStatus
from ..enums.labels import label_of
from ..models.legal_doc_templates import LegalDocTemplate
from ..models.base import generate_uuid
from ..schemas.templates import (
    TemplateListRequest, TemplateListResponse, TemplateListItem,
    TemplateDetailResponse,
    TemplateCreateRequest, TemplateCreateResponse,
    TemplateUpdateRequest, TemplateUpdateResponse,
    TemplateReplaceFileRequest, TemplateReplaceFileResponse,
    TemplateToggleRequest, TemplateToggleResponse,
)

_ALLOWED_FILE_TYPE = {e.value for e in TemplateFileType}
_ALLOWED_STATUS = {e.value for e in SystemEntityStatus}


def _category_name(val: str) -> str:
    return label_of(val, TemplateCategory) or val


def _file_type_name(val: str) -> str:
    return label_of(val, TemplateFileType) or val


def _status_name(val: str) -> str:
    return label_of(val, SystemEntityStatus) or val


async def _get_template_or_404(session: AsyncSession, template_id: str, tenant_id: str) -> LegalDocTemplate:
    row = (
        await session.execute(
            select(LegalDocTemplate).where(
                LegalDocTemplate.id == template_id,
                LegalDocTemplate.tenant_id == tenant_id,
                LegalDocTemplate.is_deleted.is_(False),
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise BusinessException(code=5300, message="文书模板不存在")
    return row


async def list_templates(
    session: AsyncSession,
    *,
    req: TemplateListRequest,
    tenant_id: str,
) -> TemplateListResponse:
    q = select(LegalDocTemplate).where(
        LegalDocTemplate.tenant_id == tenant_id,
        LegalDocTemplate.is_deleted.is_(False),
    )
    if req.category:
        q = q.where(LegalDocTemplate.category == req.category)
    if req.status:
        q = q.where(LegalDocTemplate.status == req.status)
    if req.keyword:
        kw = f"%{req.keyword}%"
        q = q.where(LegalDocTemplate.template_name.ilike(kw))

    total: int = (await session.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    offset = (req.page - 1) * req.pageSize
    templates = (await session.execute(q.order_by(LegalDocTemplate.created_at.desc()).offset(offset).limit(req.pageSize))).scalars().all()

    items = [
        TemplateListItem(
            templateId=t.id,
            templateName=t.template_name,
            category=t.category,
            categoryName=_category_name(t.category),
            fileType=t.file_type,
            fileTypeName=_file_type_name(t.file_type),
            version=t.version or 1,
            status=t.status or "ACTIVE",
            statusName=_status_name(t.status or "ACTIVE"),
            fileUrl=t.file_url,
            updatedAt=t.updated_at.strftime("%Y-%m-%dT%H:%M:%SZ") if t.updated_at else None,
        )
        for t in templates
    ]
    return TemplateListResponse(total=total, page=req.page, pageSize=req.pageSize, items=items)


async def get_template_detail(
    session: AsyncSession,
    *,
    template_id: str,
    tenant_id: str,
) -> TemplateDetailResponse:
    t = await _get_template_or_404(session, template_id, tenant_id)
    return TemplateDetailResponse(
        templateId=t.id,
        templateName=t.template_name,
        category=t.category,
        categoryName=_category_name(t.category),
        description=t.description,
        fileUrl=t.file_url,
        fileType=t.file_type,
        fileTypeName=_file_type_name(t.file_type),
        version=t.version or 1,
        status=t.status or "ACTIVE",
        statusName=_status_name(t.status or "ACTIVE"),
        createdAt=t.created_at.strftime("%Y-%m-%dT%H:%M:%SZ") if t.created_at else None,
        updatedAt=t.updated_at.strftime("%Y-%m-%dT%H:%M:%SZ") if t.updated_at else None,
    )


async def create_template(
    session: AsyncSession,
    *,
    req: TemplateCreateRequest,
    tenant_id: str,
    operator_id: str,
) -> TemplateCreateResponse:
    if not req.category or not req.category.strip():
        raise BusinessException(code=5301, message="category 不能为空")
    if req.fileType not in _ALLOWED_FILE_TYPE:
        raise BusinessException(code=5302, message=f"fileType={req.fileType!r} 非法，允许值: {sorted(_ALLOWED_FILE_TYPE)}")

    tpl = LegalDocTemplate(
        id=generate_uuid(),
        tenant_id=tenant_id,
        template_name=req.templateName,
        category=req.category,
        description=req.description,
        file_url=req.fileUrl,
        file_type=req.fileType,
        version=1,
        status="ACTIVE",
        created_by=operator_id,
    )
    async with session.begin():
        session.add(tpl)

    return TemplateCreateResponse(templateId=tpl.id, templateName=tpl.template_name, status=tpl.status)


async def update_template(
    session: AsyncSession,
    *,
    req: TemplateUpdateRequest,
    tenant_id: str,
    operator_id: str,
) -> TemplateUpdateResponse:
    tpl = await _get_template_or_404(session, req.templateId, tenant_id)
    if not req.category or not req.category.strip():
        raise BusinessException(code=5301, message="category 不能为空")

    now = datetime.now(timezone.utc)
    async with session.begin():
        tpl.template_name = req.templateName
        tpl.category = req.category
        tpl.description = req.description
        tpl.updated_by = operator_id
        tpl.updated_at = now
        session.add(tpl)

    return TemplateUpdateResponse(templateId=tpl.id, updatedAt=now.strftime("%Y-%m-%dT%H:%M:%SZ"))


async def replace_template_file(
    session: AsyncSession,
    *,
    req: TemplateReplaceFileRequest,
    tenant_id: str,
    operator_id: str,
) -> TemplateReplaceFileResponse:
    tpl = await _get_template_or_404(session, req.templateId, tenant_id)
    if req.fileType not in _ALLOWED_FILE_TYPE:
        raise BusinessException(code=5302, message=f"fileType={req.fileType!r} 非法，允许值: {sorted(_ALLOWED_FILE_TYPE)}")

    new_version = (tpl.version or 1) + 1
    now = datetime.now(timezone.utc)
    async with session.begin():
        tpl.file_url = req.fileUrl
        tpl.file_type = req.fileType
        tpl.version = new_version
        tpl.updated_by = operator_id
        tpl.updated_at = now
        session.add(tpl)

    return TemplateReplaceFileResponse(templateId=tpl.id, version=new_version, fileUrl=req.fileUrl)


async def toggle_template(
    session: AsyncSession,
    *,
    req: TemplateToggleRequest,
    tenant_id: str,
    operator_id: str,
) -> TemplateToggleResponse:
    if req.targetStatus not in _ALLOWED_STATUS:
        raise BusinessException(code=5306, message=f"targetStatus={req.targetStatus!r} 非法，允许值: {sorted(_ALLOWED_STATUS)}")

    tpl = await _get_template_or_404(session, req.templateId, tenant_id)
    now = datetime.now(timezone.utc)
    async with session.begin():
        tpl.status = req.targetStatus
        tpl.updated_by = operator_id
        tpl.updated_at = now
        session.add(tpl)

    return TemplateToggleResponse(
        templateId=tpl.id,
        status=req.targetStatus,
        statusName=_status_name(req.targetStatus),
    )
