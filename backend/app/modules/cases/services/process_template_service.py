"""流程模板管理 Service (2.S17, D2=A).

错误码:
  5303 流程模板不存在
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.exceptions import BusinessException
from ..models.process_templates import ProcessTemplate
from ..models.task_templates import TaskTemplate
from ..models.base import generate_uuid
from ..schemas.templates import (
    ProcessTemplateListRequest, ProcessTemplateListResponse, ProcessTemplateListItem,
    ProcessTemplateDetailRequest, ProcessTemplateDetailResponse, TaskTemplateSummary,
    ProcessTemplateCreateRequest, ProcessTemplateCreateResponse,
    ProcessTemplateUpdateRequest, ProcessTemplateUpdateResponse,
    ProcessTemplateToggleRequest, ProcessTemplateToggleResponse,
)


async def _get_process_template_or_404(
    session: AsyncSession, pt_id: str, tenant_id: str
) -> ProcessTemplate:
    row = (
        await session.execute(
            select(ProcessTemplate).where(
                ProcessTemplate.id == pt_id,
                ProcessTemplate.tenant_id == tenant_id,
                ProcessTemplate.is_deleted.is_(False),
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise BusinessException(code=5303, message="流程模板不存在")
    return row


async def list_process_templates(
    session: AsyncSession,
    *,
    req: ProcessTemplateListRequest,
    tenant_id: str,
) -> ProcessTemplateListResponse:
    q = select(ProcessTemplate).where(
        ProcessTemplate.tenant_id == tenant_id,
        ProcessTemplate.is_deleted.is_(False),
    )
    if req.caseTypeCode:
        q = q.where(ProcessTemplate.case_type_code == req.caseTypeCode)
    if req.stageCode:
        q = q.where(ProcessTemplate.stage_code == req.stageCode)
    if req.isActive is not None:
        q = q.where(ProcessTemplate.is_active.is_(req.isActive))

    total: int = (await session.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    offset = (req.page - 1) * req.pageSize
    pts = (await session.execute(q.order_by(ProcessTemplate.sort_order).offset(offset).limit(req.pageSize))).scalars().all()

    pt_ids = [pt.id for pt in pts]
    task_counts: dict[str, int] = {}
    if pt_ids:
        rows = (
            await session.execute(
                select(TaskTemplate.process_template_id, func.count().label("cnt"))
                .where(
                    TaskTemplate.process_template_id.in_(pt_ids),
                    TaskTemplate.tenant_id == tenant_id,
                    TaskTemplate.is_deleted.is_(False),
                    TaskTemplate.is_active.is_(True),
                )
                .group_by(TaskTemplate.process_template_id)
            )
        ).all()
        task_counts = {r.process_template_id: r.cnt for r in rows}

    items = [
        ProcessTemplateListItem(
            processTemplateId=pt.id,
            caseTypeCode=pt.case_type_code,
            stageCode=pt.stage_code,
            stageName=pt.stage_name,
            sortOrder=pt.sort_order or 0,
            isRequired=pt.is_required if pt.is_required is not None else True,
            description=pt.description,
            isActive=pt.is_active if pt.is_active is not None else True,
            taskCount=task_counts.get(pt.id, 0),
        )
        for pt in pts
    ]
    return ProcessTemplateListResponse(total=total, page=req.page, pageSize=req.pageSize, items=items)


async def get_process_template_detail(
    session: AsyncSession,
    *,
    req: ProcessTemplateDetailRequest,
    tenant_id: str,
) -> ProcessTemplateDetailResponse:
    pt = await _get_process_template_or_404(session, req.processTemplateId, tenant_id)

    task_rows = (
        await session.execute(
            select(TaskTemplate).where(
                TaskTemplate.process_template_id == pt.id,
                TaskTemplate.tenant_id == tenant_id,
                TaskTemplate.is_deleted.is_(False),
            ).order_by(TaskTemplate.sort_order)
        )
    ).scalars().all()

    tasks = [
        TaskTemplateSummary(
            taskTemplateId=t.id,
            taskCode=t.task_code,
            taskName=t.task_name,
            sortOrder=t.sort_order or 0,
            isMilestone=t.is_milestone if t.is_milestone is not None else False,
            isRequired=t.is_required if t.is_required is not None else True,
            defaultDaysDue=t.default_days_due,
        )
        for t in task_rows
    ]

    return ProcessTemplateDetailResponse(
        processTemplateId=pt.id,
        caseTypeCode=pt.case_type_code,
        stageCode=pt.stage_code,
        stageName=pt.stage_name,
        sortOrder=pt.sort_order or 0,
        isRequired=pt.is_required if pt.is_required is not None else True,
        description=pt.description,
        isActive=pt.is_active if pt.is_active is not None else True,
        tasks=tasks,
    )


async def create_process_template(
    session: AsyncSession,
    *,
    req: ProcessTemplateCreateRequest,
    tenant_id: str,
    operator_id: str,
) -> ProcessTemplateCreateResponse:
    pt = ProcessTemplate(
        id=generate_uuid(),
        tenant_id=tenant_id,
        case_type_code=req.caseTypeCode,
        stage_code=req.stageCode,
        stage_name=req.stageName,
        sort_order=req.sortOrder,
        is_required=req.isRequired,
        description=req.description,
        is_active=True,
        created_by=operator_id,
    )
    async with session.begin():
        session.add(pt)

    return ProcessTemplateCreateResponse(
        processTemplateId=pt.id,
        stageName=pt.stage_name,
        isActive=True,
    )


async def update_process_template(
    session: AsyncSession,
    *,
    req: ProcessTemplateUpdateRequest,
    tenant_id: str,
    operator_id: str,
) -> ProcessTemplateUpdateResponse:
    pt = await _get_process_template_or_404(session, req.processTemplateId, tenant_id)
    now = datetime.now(timezone.utc)
    async with session.begin():
        pt.stage_name = req.stageName
        pt.sort_order = req.sortOrder
        pt.is_required = req.isRequired
        pt.description = req.description
        pt.updated_by = operator_id
        pt.updated_at = now
        session.add(pt)

    return ProcessTemplateUpdateResponse(
        processTemplateId=pt.id,
        updatedAt=now.strftime("%Y-%m-%dT%H:%M:%SZ"),
    )


async def toggle_process_template(
    session: AsyncSession,
    *,
    req: ProcessTemplateToggleRequest,
    tenant_id: str,
    operator_id: str,
) -> ProcessTemplateToggleResponse:
    pt = await _get_process_template_or_404(session, req.processTemplateId, tenant_id)
    now = datetime.now(timezone.utc)
    async with session.begin():
        pt.is_active = req.isActive
        pt.updated_by = operator_id
        pt.updated_at = now
        session.add(pt)

    return ProcessTemplateToggleResponse(processTemplateId=pt.id, isActive=req.isActive)
