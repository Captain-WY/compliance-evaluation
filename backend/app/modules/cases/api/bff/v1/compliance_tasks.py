"""合规报送任务 BFF Router (2.S14).

挂载路径: `/api/bff/v1/compliance` (与 S13 compliance_center 共享前缀, 见 main.py)

12 端点 (全部 POST, D1 v2.1):
  1. POST /tasks/list            — 报送任务列表
  2. POST /tasks/detail          — 任务详情
  3. POST /tasks/create          — 创建报送任务
  4. POST /tasks/update-status   — 更新任务状态
  5. POST /tasks/cases/link      — 关联案件 (幂等 Q4)
  6. POST /tasks/cases/list      — 已关联案件 (含 BLOCKER 状态 D9)
  7. POST /tasks/snapshots/create — 生成数据快照 (D9 BLOCKER 拦截)
  8. POST /tasks/snapshots/list   — 快照历史列表
  9. POST /tasks/ai-summary      — AI 智能摘要 (D5=Stub)
 10. POST /tasks/content/save    — 保存富文本草稿
 11. POST /tasks/generate        — 定稿渲染 (D5=Stub + Q1/Q3)
 12. POST /tasks/download        — 组合下载

对应设计文档:
  docs/design/v1/api/04_compliance_center/03_unified_tasks_api_plan.md v2.1
  docs/design/v1/api/04_compliance_center/04_ai_generation_export_api_plan.md v2.1
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ....core.database import get_db
from ....core.deps import get_current_user
from ....models.sys_users import SysUser
from ....schemas.common import StandardResponse
from ....schemas.compliance_s14 import (
    AiSummaryRequest,
    AiSummaryResponse,
    ContentSaveRequest,
    ContentSaveResponse,
    DownloadRequest,
    DownloadResponse,
    GenerateRequest,
    GenerateResponse,
    SnapshotCreateRequest,
    SnapshotCreateResponse,
    SnapshotListRequest,
    SnapshotListResponse,
    TaskCaseLinkRequest,
    TaskCaseLinkResponse,
    TaskCaseListRequest,
    TaskCaseListResponse,
    TaskCreateRequest,
    TaskCreateResponse,
    TaskDetailRequest,
    TaskDetailResponse,
    TaskListRequest,
    TaskListResponse,
    TaskUpdateStatusRequest,
    TaskUpdateStatusResponse,
)
from ....services import ai_generation_service as ai_svc
from ....services import reporting_task_service as task_svc

router = APIRouter()


# ---------------------------------------------------------------------------
# 统一报送任务
# ---------------------------------------------------------------------------

@router.post(
    "/tasks/list",
    response_model=StandardResponse[TaskListResponse],
    summary="报送任务列表",
    description="分页获取合规报送任务，支持按 category / status / dueDate 范围过滤。",
)
async def list_tasks(
    req: TaskListRequest,
    session: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
) -> StandardResponse[TaskListResponse]:
    data = await task_svc.list_tasks(
        session,
        tenant_id=str(current_user.tenant_id),
        req=req,
    )
    return StandardResponse(code=200, message="success", data=data)


@router.post(
    "/tasks/detail",
    response_model=StandardResponse[TaskDetailResponse],
    summary="任务详情",
    description="获取单个报送任务的详细信息，含 contentData / snapshotId / snapshotCount。",
)
async def get_task_detail(
    req: TaskDetailRequest,
    session: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
) -> StandardResponse[TaskDetailResponse]:
    data = await task_svc.get_task_detail(
        session,
        tenant_id=str(current_user.tenant_id),
        req=req,
    )
    return StandardResponse(code=200, message="success", data=data)


@router.post(
    "/tasks/create",
    response_model=StandardResponse[TaskCreateResponse],
    summary="创建报送任务",
    description="创建合规报送任务，初始 status=DATA_PREP。",
)
async def create_task(
    req: TaskCreateRequest,
    session: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
) -> StandardResponse[TaskCreateResponse]:
    data = await task_svc.create_task(
        session,
        tenant_id=str(current_user.tenant_id),
        user=current_user,
        req=req,
    )
    return StandardResponse(code=200, message="success", data=data)


@router.post(
    "/tasks/update-status",
    response_model=StandardResponse[TaskUpdateStatusResponse],
    summary="更新任务状态",
    description="驱动合规报送工作流状态机: DATA_PREP→PENDING_APPROVAL→APPROVED; APPROVED 为终态。",
)
async def update_task_status(
    req: TaskUpdateStatusRequest,
    session: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
) -> StandardResponse[TaskUpdateStatusResponse]:
    data = await task_svc.update_task_status(
        session,
        tenant_id=str(current_user.tenant_id),
        user=current_user,
        req=req,
    )
    return StandardResponse(code=200, message="success", data=data)


# ---------------------------------------------------------------------------
# 报送范围圈定
# ---------------------------------------------------------------------------

@router.post(
    "/tasks/cases/link",
    response_model=StandardResponse[TaskCaseLinkResponse],
    summary="关联案件到任务",
    description="幂等关联: 已存在的案件跳过，linkedCount 仅计本次新增数量。",
)
async def link_cases(
    req: TaskCaseLinkRequest,
    session: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
) -> StandardResponse[TaskCaseLinkResponse]:
    data = await task_svc.link_cases(
        session,
        tenant_id=str(current_user.tenant_id),
        user=current_user,
        req=req,
    )
    return StandardResponse(code=200, message="success", data=data)


@router.post(
    "/tasks/cases/list",
    response_model=StandardResponse[TaskCaseListResponse],
    summary="任务已关联案件列表",
    description="分页获取已圈定案件，附带每案 BLOCKER 级数据质量问题数量 (D9 联动)。",
)
async def list_task_cases(
    req: TaskCaseListRequest,
    session: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
) -> StandardResponse[TaskCaseListResponse]:
    data = await task_svc.list_task_cases(
        session,
        tenant_id=str(current_user.tenant_id),
        req=req,
    )
    return StandardResponse(code=200, message="success", data=data)


# ---------------------------------------------------------------------------
# 不可变数据快照
# ---------------------------------------------------------------------------

@router.post(
    "/tasks/snapshots/create",
    response_model=StandardResponse[SnapshotCreateResponse],
    summary="生成数据快照",
    description="D9: 前置 BLOCKER 拦截 (错误码 4210); 通过后创建快照记录 (Q1: 同一任务可有多个)。",
)
async def create_snapshot(
    req: SnapshotCreateRequest,
    session: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
) -> StandardResponse[SnapshotCreateResponse]:
    data = await task_svc.create_snapshot(
        session,
        tenant_id=str(current_user.tenant_id),
        user=current_user,
        req=req,
    )
    return StandardResponse(code=200, message="success", data=data)


@router.post(
    "/tasks/snapshots/list",
    response_model=StandardResponse[SnapshotListResponse],
    summary="快照历史列表",
    description="分页获取任务下所有快照版本，按创建时间倒序。",
)
async def list_snapshots(
    req: SnapshotListRequest,
    session: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
) -> StandardResponse[SnapshotListResponse]:
    data = await task_svc.list_snapshots(
        session,
        tenant_id=str(current_user.tenant_id),
        req=req,
    )
    return StandardResponse(code=200, message="success", data=data)


# ---------------------------------------------------------------------------
# AI 赋能与草稿编辑
# ---------------------------------------------------------------------------

@router.post(
    "/tasks/ai-summary",
    response_model=StandardResponse[AiSummaryResponse],
    summary="AI 智能摘要 (Stub)",
    description="D5=Stub: 返回占位文本，不调用真实 LLM；S17 Legal Brain 接入 Qwen 后升级。",
)
async def generate_ai_summary(
    req: AiSummaryRequest,
    session: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
) -> StandardResponse[AiSummaryResponse]:
    data = await ai_svc.generate_ai_summary(
        session,
        tenant_id=str(current_user.tenant_id),
        req=req,
    )
    return StandardResponse(code=200, message="success", data=data)


@router.post(
    "/tasks/content/save",
    response_model=StandardResponse[ContentSaveResponse],
    summary="保存富文本草稿",
    description="将 AI 生成 + 人工润色内容写入 reporting_tasks.content_data。",
)
async def save_content(
    req: ContentSaveRequest,
    session: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
) -> StandardResponse[ContentSaveResponse]:
    data = await ai_svc.save_content(
        session,
        tenant_id=str(current_user.tenant_id),
        user=current_user,
        req=req,
    )
    return StandardResponse(code=200, message="success", data=data)


# ---------------------------------------------------------------------------
# 物料渲染与组合下载
# ---------------------------------------------------------------------------

@router.post(
    "/tasks/generate",
    response_model=StandardResponse[GenerateResponse],
    summary="定稿渲染 (Stub)",
    description="Q3: 仅 DATA_PREP 状态可渲染; Q1: 写入 snapshot_id 绑定数据源; D5=Stub: 写占位 report_url。",
)
async def generate_report(
    req: GenerateRequest,
    session: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
) -> StandardResponse[GenerateResponse]:
    data = await ai_svc.generate_report(
        session,
        tenant_id=str(current_user.tenant_id),
        user=current_user,
        req=req,
    )
    return StandardResponse(code=200, message="success", data=data)


@router.post(
    "/tasks/download",
    response_model=StandardResponse[DownloadResponse],
    summary="组合下载",
    description="返回正式报告 + 数据底稿下载链接; Q1: 底稿 URL 来自 reporting_tasks.snapshot_id 绑定的快照。",
)
async def download_files(
    req: DownloadRequest,
    session: AsyncSession = Depends(get_db),
    current_user: SysUser = Depends(get_current_user),
) -> StandardResponse[DownloadResponse]:
    data = await ai_svc.download_files(
        session,
        tenant_id=str(current_user.tenant_id),
        req=req,
    )
    return StandardResponse(code=200, message="success", data=data)
