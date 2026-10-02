"""AI 赋能与物料导出 Service (2.S14) — AI 摘要 / 草稿保存 / 定稿渲染 / 组合下载.

端点对应:
  POST /compliance/tasks/ai-summary    → generate_ai_summary()
  POST /compliance/tasks/content/save  → save_content()
  POST /compliance/tasks/generate      → generate_report()
  POST /compliance/tasks/download      → download_files()

D5=Stub: AI 摘要和定稿渲染均返回占位结果, 不调用真实 LLM / OSS.
         S17 Legal Brain 切片接入 Qwen 后移除 Stub.
Q1: generate_report 写入 reporting_tasks.snapshot_id (绑定数据源快照).
Q3: generate_report 仅允许 status=DATA_PREP.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.exceptions import BusinessException
from ..enums.case_enums import ReportingTaskStatus
from ..models.data_snapshots import DataSnapshot
from ..models.reporting_tasks import ReportingTask
from ..models.sys_users import SysUser
from ..schemas.compliance_s14 import (
    AiSummaryRequest,
    AiSummaryResponse,
    ContentSaveRequest,
    ContentSaveResponse,
    DownloadFileItem,
    DownloadRequest,
    DownloadResponse,
    GenerateRequest,
    GenerateResponse,
)
from .audit_log_service import write_audit_log

_SENTINEL_CASE_ID = "00000000-0000-0000-0000-000000000000"

_PROMPT_TYPE_LABELS = {
    "RISK_SUMMARY": "风险综述",
    "MANAGEMENT_ADVICE": "管理建议",
    "CASE_BRIEF": "单案摘要",
}


async def _get_task_or_404(session: AsyncSession, task_id: str, tenant_id: str) -> ReportingTask:
    task: ReportingTask | None = await session.get(ReportingTask, task_id)
    if not task or task.is_deleted or str(task.tenant_id) != tenant_id:
        raise BusinessException(code=4205, message=f"报送任务 {task_id} 不存在")
    return task


async def _get_snapshot_or_404(
    session: AsyncSession, snapshot_id: str, task_id: str
) -> DataSnapshot:
    """校验快照存在且归属于指定任务 (防止跨任务引用, 错误码 4211)."""
    snap: DataSnapshot | None = await session.get(DataSnapshot, snapshot_id)
    if not snap or snap.is_deleted or str(snap.reporting_task_id) != task_id:
        raise BusinessException(
            code=4211,
            message=f"快照 {snapshot_id} 不存在或不属于任务 {task_id}",
        )
    return snap


# ---------------------------------------------------------------------------
# 9. tasks/ai-summary  (D5=Stub)
# ---------------------------------------------------------------------------

async def generate_ai_summary(
    session: AsyncSession,
    *,
    tenant_id: str,
    req: AiSummaryRequest,
) -> AiSummaryResponse:
    await _get_task_or_404(session, req.taskId, tenant_id)
    snap = await _get_snapshot_or_404(session, req.snapshotId, req.taskId)

    prompt_label = _PROMPT_TYPE_LABELS.get(req.promptType, req.promptType)
    # D5=Stub: 不调用 LLM, 返回结构化占位文本
    summary = (
        f"[AI 摘要 Stub - {prompt_label}] "
        f"基于快照「{snap.snapshot_name}」，共 {snap.record_count or 0} 条案件记录。"
        f"风险综述功能将在 S17 Legal Brain 切片中接入 Qwen 模型实现，"
        f"届时将对案件风险态势进行深度分析并输出结构化报告。"
    )
    return AiSummaryResponse(
        taskId=req.taskId,
        snapshotId=req.snapshotId,
        promptType=req.promptType,
        summary=summary,
        generatedAt=datetime.now(timezone.utc),
        isStub=True,
    )


# ---------------------------------------------------------------------------
# 10. tasks/content/save
# ---------------------------------------------------------------------------

async def save_content(
    session: AsyncSession,
    *,
    tenant_id: str,
    user: SysUser,
    req: ContentSaveRequest,
) -> ContentSaveResponse:
    task = await _get_task_or_404(session, req.taskId, tenant_id)
    now = datetime.now(timezone.utc)

    async with session.begin():
        task.content_data = req.contentData
        task.updated_by = str(user.id)
        task.updated_at = now

    return ContentSaveResponse(taskId=req.taskId, savedAt=now)


# ---------------------------------------------------------------------------
# 11. tasks/generate  (D5=Stub + Q1 绑定快照 + Q3 状态守卫)
# ---------------------------------------------------------------------------

async def generate_report(
    session: AsyncSession,
    *,
    tenant_id: str,
    user: SysUser,
    req: GenerateRequest,
) -> GenerateResponse:
    task = await _get_task_or_404(session, req.taskId, tenant_id)

    # Q3: 仅 DATA_PREP 状态允许生成
    if task.status != ReportingTaskStatus.DATA_PREP.value:
        raise BusinessException(
            code=4206,
            message=f"仅 DATA_PREP 状态的任务可执行定稿渲染，当前状态: {task.status}",
        )

    snap = await _get_snapshot_or_404(session, req.snapshotId, req.taskId)

    # D5=Stub: 不实际渲染文件
    stub_report_url = f"stub://reports/{req.taskId}.xlsx"

    async with session.begin():
        # Q1: 写入绑定快照 ID (锁定数据源)
        task.snapshot_id = req.snapshotId
        task.report_url = stub_report_url
        task.updated_by = str(user.id)

        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=_SENTINEL_CASE_ID,
            operator=user,
            action_module="REPORTING_TASK",
            action_type="UPDATE",
            action_detail=(
                f"定稿渲染 (Stub): taskId={req.taskId}, "
                f"snapshotId={req.snapshotId}, reportUrl={stub_report_url}"
            ),
        )

    return GenerateResponse(
        taskId=req.taskId,
        snapshotId=req.snapshotId,
        reportUrl=stub_report_url,
    )


# ---------------------------------------------------------------------------
# 12. tasks/download
# ---------------------------------------------------------------------------

async def download_files(
    session: AsyncSession,
    *,
    tenant_id: str,
    req: DownloadRequest,
) -> DownloadResponse:
    task = await _get_task_or_404(session, req.taskId, tenant_id)

    if not task.report_url:
        raise BusinessException(
            code=4213,
            message="报告尚未生成，请先调用 tasks/generate 完成定稿渲染",
        )

    files: list[DownloadFileItem] = [
        DownloadFileItem(
            type="REPORT",
            url=task.report_url,
            fileName=f"{task.task_name}.xlsx",
        )
    ]

    # Q1: 通过 snapshot_id 定位数据底稿
    if req.includeDataDraft and task.snapshot_id:
        snap: DataSnapshot | None = await session.get(DataSnapshot, str(task.snapshot_id))
        if snap and not snap.is_deleted:
            files.append(DownloadFileItem(
                type="DATA_DRAFT",
                url=snap.s3_file_url,
                fileName=f"{snap.snapshot_name}_数据底稿.json",
            ))

    return DownloadResponse(taskId=req.taskId, files=files)
