"""流程模板 + 任务模板管理 BFF 路由 (2.S17, D2=A).

挂载路径:
  POST /api/bff/v1/process-templates/*
  POST /api/bff/v1/task-templates/*
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ....core.database import get_db
from ....core.deps import get_current_user
from ....models.sys_users import SysUser
from ....schemas.common import StandardResponse
from ....schemas.templates import (
    ProcessTemplateListRequest, ProcessTemplateListResponse,
    ProcessTemplateDetailRequest, ProcessTemplateDetailResponse,
    ProcessTemplateCreateRequest, ProcessTemplateCreateResponse,
    ProcessTemplateUpdateRequest, ProcessTemplateUpdateResponse,
    ProcessTemplateToggleRequest, ProcessTemplateToggleResponse,
    TaskTemplateListRequest, TaskTemplateListResponse,
    TaskTemplateCreateRequest, TaskTemplateCreateResponse,
    TaskTemplateUpdateRequest, TaskTemplateUpdateResponse,
    TaskTemplateDeleteRequest, TaskTemplateDeleteResponse,
)
from ....services import process_template_service, task_template_service

process_router = APIRouter(tags=["BFF - 流程模板管理"])
task_router = APIRouter(tags=["BFF - 任务模板管理"])


# ---------------------------------------------------------------------------
# 流程模板
# ---------------------------------------------------------------------------

@process_router.post("/list", response_model=StandardResponse[ProcessTemplateListResponse])
async def list_process_templates(
    req: ProcessTemplateListRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await process_template_service.list_process_templates(
        db, req=req, tenant_id=current_user.tenant_id
    )
    return StandardResponse(code=200, message="获取成功", data=data)


@process_router.post("/detail", response_model=StandardResponse[ProcessTemplateDetailResponse])
async def get_process_template_detail(
    req: ProcessTemplateDetailRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await process_template_service.get_process_template_detail(
        db, req=req, tenant_id=current_user.tenant_id
    )
    return StandardResponse(code=200, message="获取成功", data=data)


@process_router.post("/create", response_model=StandardResponse[ProcessTemplateCreateResponse])
async def create_process_template(
    req: ProcessTemplateCreateRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await process_template_service.create_process_template(
        db, req=req, tenant_id=current_user.tenant_id, operator_id=current_user.id
    )
    return StandardResponse(code=200, message="创建成功", data=data)


@process_router.post("/update", response_model=StandardResponse[ProcessTemplateUpdateResponse])
async def update_process_template(
    req: ProcessTemplateUpdateRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await process_template_service.update_process_template(
        db, req=req, tenant_id=current_user.tenant_id, operator_id=current_user.id
    )
    return StandardResponse(code=200, message="更新成功", data=data)


@process_router.post("/toggle", response_model=StandardResponse[ProcessTemplateToggleResponse])
async def toggle_process_template(
    req: ProcessTemplateToggleRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await process_template_service.toggle_process_template(
        db, req=req, tenant_id=current_user.tenant_id, operator_id=current_user.id
    )
    return StandardResponse(code=200, message="操作成功", data=data)


# ---------------------------------------------------------------------------
# 任务模板
# ---------------------------------------------------------------------------

@task_router.post("/list", response_model=StandardResponse[TaskTemplateListResponse])
async def list_task_templates(
    req: TaskTemplateListRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await task_template_service.list_task_templates(
        db, req=req, tenant_id=current_user.tenant_id
    )
    return StandardResponse(code=200, message="获取成功", data=data)


@task_router.post("/create", response_model=StandardResponse[TaskTemplateCreateResponse])
async def create_task_template(
    req: TaskTemplateCreateRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await task_template_service.create_task_template(
        db, req=req, tenant_id=current_user.tenant_id, operator_id=current_user.id
    )
    return StandardResponse(code=200, message="创建成功", data=data)


@task_router.post("/update", response_model=StandardResponse[TaskTemplateUpdateResponse])
async def update_task_template(
    req: TaskTemplateUpdateRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await task_template_service.update_task_template(
        db, req=req, tenant_id=current_user.tenant_id, operator_id=current_user.id
    )
    return StandardResponse(code=200, message="更新成功", data=data)


@task_router.post("/delete", response_model=StandardResponse[TaskTemplateDeleteResponse])
async def delete_task_template(
    req: TaskTemplateDeleteRequest,
    current_user: SysUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await task_template_service.delete_task_template(
        db, req=req, tenant_id=current_user.tenant_id, operator_id=current_user.id
    )
    return StandardResponse(code=200, message="删除成功", data=data)
