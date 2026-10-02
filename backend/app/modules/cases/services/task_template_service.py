"""任务模板管理 Service (2.S17, D2=A).

错误码:
  5303 流程模板不存在
  5304 任务模板不存在
  5305 taskCode 在同一流程模板下重复
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
    TaskTemplateListRequest, TaskTemplateListResponse, TaskTemplateListItem,
    TaskTemplateCreateRequest, TaskTemplateCreateResponse,
    TaskTemplateUpdateRequest, TaskTemplateUpdateResponse,
    TaskTemplateDeleteRequest, TaskTemplateDeleteResponse,
)


async def _get_task_template_or_404(
    session: AsyncSession, tt_id: str, tenant_id: str
) -> TaskTemplate:
    row = (
        await session.execute(
            select(TaskTemplate).where(
                TaskTemplate.id == tt_id,
                TaskTemplate.tenant_id == tenant_id,
                TaskTemplate.is_deleted.is_(False),
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise BusinessException(code=5304, message="任务模板不存在")
    return row


async def _assert_process_template_exists(
    session: AsyncSession, pt_id: str, tenant_id: str
) -> None:
    row = (
        await session.execute(
            select(ProcessTemplate.id).where(
                ProcessTemplate.id == pt_id,
                ProcessTemplate.tenant_id == tenant_id,
                ProcessTemplate.is_deleted.is_(False),
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise BusinessException(code=5303, message="流程模板不存在")


async def list_task_templates(
    session: AsyncSession,
    *,
    req: TaskTemplateListRequest,
    tenant_id: str,
) -> TaskTemplateListResponse:
    await _assert_process_template_exists(session, req.processTemplateId, tenant_id)

    q = select(TaskTemplate).where(
        TaskTemplate.process_template_id == req.processTemplateId,
        TaskTemplate.tenant_id == tenant_id,
        TaskTemplate.is_deleted.is_(False),
    ).order_by(TaskTemplate.sort_order)

    total: int = (await session.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    offset = (req.page - 1) * req.pageSize
    tasks = (await session.execute(q.offset(offset).limit(req.pageSize))).scalars().all()

    items = [
        TaskTemplateListItem(
            taskTemplateId=t.id,
            processTemplateId=t.process_template_id,
            taskCode=t.task_code,
            taskName=t.task_name,
            taskGroup=t.task_group,
            displayStyle=t.display_style,
            isMilestone=t.is_milestone if t.is_milestone is not None else False,
            isRequired=t.is_required if t.is_required is not None else True,
            sortOrder=t.sort_order or 0,
            defaultDaysDue=t.default_days_due,
            description=t.description,
            isActive=t.is_active if t.is_active is not None else True,
        )
        for t in tasks
    ]
    return TaskTemplateListResponse(
        processTemplateId=req.processTemplateId,
        total=total,
        page=req.page,
        pageSize=req.pageSize,
        items=items,
    )


async def create_task_template(
    session: AsyncSession,
    *,
    req: TaskTemplateCreateRequest,
    tenant_id: str,
    operator_id: str,
) -> TaskTemplateCreateResponse:
    await _assert_process_template_exists(session, req.processTemplateId, tenant_id)

    if req.taskCode:
        dup = (
            await session.execute(
                select(TaskTemplate.id).where(
                    TaskTemplate.process_template_id == req.processTemplateId,
                    TaskTemplate.tenant_id == tenant_id,
                    TaskTemplate.task_code == req.taskCode,
                    TaskTemplate.is_deleted.is_(False),
                )
            )
        ).scalar_one_or_none()
        if dup:
            raise BusinessException(code=5305, message=f"taskCode={req.taskCode!r} 在该流程模板下已存在")

    tt = TaskTemplate(
        id=generate_uuid(),
        tenant_id=tenant_id,
        process_template_id=req.processTemplateId,
        task_code=req.taskCode,
        task_name=req.taskName,
        task_group=req.taskGroup,
        display_style=req.displayStyle,
        is_milestone=req.isMilestone,
        is_required=req.isRequired,
        sort_order=req.sortOrder,
        default_days_due=req.defaultDaysDue,
        description=req.description,
        extended_config=req.extendedConfig,
        action_type=req.actionType,
        action_config=req.actionConfig,
        required_doc_types=req.requiredDocTypes,
        is_active=True,
        created_by=operator_id,
    )
    async with session.begin():
        session.add(tt)

    return TaskTemplateCreateResponse(
        taskTemplateId=tt.id,
        taskName=tt.task_name,
        processTemplateId=tt.process_template_id,
    )


async def update_task_template(
    session: AsyncSession,
    *,
    req: TaskTemplateUpdateRequest,
    tenant_id: str,
    operator_id: str,
) -> TaskTemplateUpdateResponse:
    tt = await _get_task_template_or_404(session, req.taskTemplateId, tenant_id)
    now = datetime.now(timezone.utc)
    async with session.begin():
        if req.taskName is not None:
            tt.task_name = req.taskName
        if req.taskGroup is not None:
            tt.task_group = req.taskGroup
        if req.isMilestone is not None:
            tt.is_milestone = req.isMilestone
        if req.isRequired is not None:
            tt.is_required = req.isRequired
        if req.sortOrder is not None:
            tt.sort_order = req.sortOrder
        if req.defaultDaysDue is not None:
            tt.default_days_due = req.defaultDaysDue
        if req.description is not None:
            tt.description = req.description
        tt.updated_by = operator_id
        tt.updated_at = now
        session.add(tt)

    return TaskTemplateUpdateResponse(taskTemplateId=tt.id, updatedAt=now.strftime("%Y-%m-%dT%H:%M:%SZ"))


async def delete_task_template(
    session: AsyncSession,
    *,
    req: TaskTemplateDeleteRequest,
    tenant_id: str,
    operator_id: str,
) -> TaskTemplateDeleteResponse:
    tt = await _get_task_template_or_404(session, req.taskTemplateId, tenant_id)
    now = datetime.now(timezone.utc)
    async with session.begin():
        tt.is_deleted = True
        tt.updated_by = operator_id
        tt.updated_at = now
        session.add(tt)

    return TaskTemplateDeleteResponse(taskTemplateId=tt.id, deleted=True)
