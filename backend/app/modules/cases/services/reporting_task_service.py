"""合规报送任务 Service (2.S14) — 任务 / 案件圈定 / 数据快照.

端点对应:
  POST /compliance/tasks/list           → list_tasks()
  POST /compliance/tasks/detail         → get_task_detail()
  POST /compliance/tasks/create         → create_task()
  POST /compliance/tasks/update-status  → update_task_status()
  POST /compliance/tasks/cases/link     → link_cases()
  POST /compliance/tasks/cases/list     → list_task_cases()
  POST /compliance/tasks/snapshots/create → create_snapshot()
  POST /compliance/tasks/snapshots/list   → list_snapshots()

Q 系列决策落地:
  Q1: 快照与任务一对多; reporting_tasks.snapshot_id 由 tasks/generate 写入
  Q2: create_task 显式设 status=DATA_PREP (不依赖 ORM default=DRAFT)
  Q3: 状态机: DATA_PREP→PENDING_APPROVAL→APPROVED; APPROVED 终态
  Q4: link_cases 幂等, linkedCount 仅计新增
  Q5: APPROVED 终态, 禁止转 CANCELLED (错误码 4207)
  D9: snapshots/create 前置 BLOCKER 实时 JOIN 拦截 (错误码 4210)
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.exceptions import BusinessException
from ..enums.case_enums import IssueSeverity, IssueStatus, ReportingTaskStatus
from ..enums.labels import label_of as get_label
from ..models.case_parties import CaseParty
from ..models.cases import Case
from ..models.data_quality_issues import DataQualityIssue
from ..models.data_snapshots import DataSnapshot
from ..models.report_case_links import ReportCaseLink
from ..models.reporting_tasks import ReportingTask
from ..models.sys_users import SysUser
from ..schemas.compliance_s14 import (
    BlockerIssueItem,
    CaseWithBlockerItem,
    ContentSaveRequest,
    ContentSaveResponse,
    SnapshotCreateRequest,
    SnapshotCreateResponse,
    SnapshotItem,
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
    TaskItem,
    TaskListRequest,
    TaskListResponse,
    TaskUpdateStatusRequest,
    TaskUpdateStatusResponse,
)
from .audit_log_service import write_audit_log

_SENTINEL_CASE_ID = "00000000-0000-0000-0000-000000000000"

# 合法状态机转移表 (Q3/Q5)
_ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    ReportingTaskStatus.DATA_PREP.value:        {ReportingTaskStatus.PENDING_APPROVAL.value, ReportingTaskStatus.CANCELLED.value},
    ReportingTaskStatus.PENDING_APPROVAL.value: {ReportingTaskStatus.APPROVED.value, ReportingTaskStatus.DATA_PREP.value, ReportingTaskStatus.CANCELLED.value},
    ReportingTaskStatus.APPROVED.value:         set(),          # Q5: 终态, 不可流转
    ReportingTaskStatus.CANCELLED.value:        set(),          # 终态
}


async def _get_task_or_404(session: AsyncSession, task_id: str, tenant_id: str) -> ReportingTask:
    task: ReportingTask | None = await session.get(ReportingTask, task_id)
    if not task or task.is_deleted or str(task.tenant_id) != tenant_id:
        raise BusinessException(code=4205, message=f"报送任务 {task_id} 不存在")
    return task


def _task_to_item(task: ReportingTask) -> TaskItem:
    return TaskItem(
        taskId=str(task.id),
        taskName=task.task_name,
        category=task.report_category,
        dueDate=task.due_date,
        status=task.status,
        status_name=get_label(task.status) or task.status,
        assigneeId=str(task.assignee_id),
        templateId=str(task.template_id) if task.template_id else None,
        snapshotId=str(task.snapshot_id) if task.snapshot_id else None,
        createdAt=task.created_at,
    )


# ---------------------------------------------------------------------------
# 1. tasks/list
# ---------------------------------------------------------------------------

async def list_tasks(
    session: AsyncSession,
    *,
    tenant_id: str,
    req: TaskListRequest,
) -> TaskListResponse:
    base_q = select(ReportingTask).where(
        ReportingTask.is_deleted == False,
        ReportingTask.tenant_id == tenant_id,
    )
    if req.category:
        base_q = base_q.where(ReportingTask.report_category == req.category)
    if req.status:
        base_q = base_q.where(ReportingTask.status == req.status)
    if req.dueDateStart:
        base_q = base_q.where(ReportingTask.due_date >= req.dueDateStart)
    if req.dueDateEnd:
        base_q = base_q.where(ReportingTask.due_date <= req.dueDateEnd)

    total: int = (
        await session.execute(select(func.count()).select_from(base_q.subquery()))
    ).scalar_one()

    offset = (req.page - 1) * req.pageSize
    rows = (
        await session.execute(
            base_q.order_by(ReportingTask.due_date.asc()).offset(offset).limit(req.pageSize)
        )
    ).scalars().all()

    return TaskListResponse(
        total=total,
        page=req.page,
        pageSize=req.pageSize,
        items=[_task_to_item(t) for t in rows],
    )


# ---------------------------------------------------------------------------
# 2. tasks/detail
# ---------------------------------------------------------------------------

async def get_task_detail(
    session: AsyncSession,
    *,
    tenant_id: str,
    req: TaskDetailRequest,
) -> TaskDetailResponse:
    task = await _get_task_or_404(session, req.taskId, tenant_id)

    snapshot_count: int = (
        await session.execute(
            select(func.count(DataSnapshot.id)).where(
                DataSnapshot.reporting_task_id == req.taskId,
                DataSnapshot.is_deleted == False,
            )
        )
    ).scalar_one()

    return TaskDetailResponse(
        taskId=str(task.id),
        taskName=task.task_name,
        category=task.report_category,
        dueDate=task.due_date,
        status=task.status,
        status_name=get_label(task.status) or task.status,
        assigneeId=str(task.assignee_id),
        templateId=str(task.template_id) if task.template_id else None,
        snapshotId=str(task.snapshot_id) if task.snapshot_id else None,
        contentData=task.content_data,
        reportUrl=task.report_url,
        snapshotCount=snapshot_count,
        createdAt=task.created_at,
        updatedAt=task.updated_at,
    )


# ---------------------------------------------------------------------------
# 3. tasks/create
# ---------------------------------------------------------------------------

async def create_task(
    session: AsyncSession,
    *,
    tenant_id: str,
    user: SysUser,
    req: TaskCreateRequest,
) -> TaskCreateResponse:
    task_id = str(uuid.uuid4())
    async with session.begin():
        task = ReportingTask(
            id=task_id,
            tenant_id=tenant_id,
            task_name=req.taskName,
            report_category=req.category,
            assignee_id=req.assigneeId,
            due_date=req.dueDate,
            template_id=req.templateId,
            status=ReportingTaskStatus.DATA_PREP.value,   # Q2: 显式设置, 不依赖 ORM default
            created_by=str(user.id),
            updated_by=str(user.id),
        )
        session.add(task)

        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=_SENTINEL_CASE_ID,
            operator=user,
            action_module="REPORTING_TASK",
            action_type="CREATE",
            action_detail=f"创建报送任务: taskName={req.taskName}, category={req.category}, dueDate={req.dueDate}",
        )

    return TaskCreateResponse(taskId=task_id, status=ReportingTaskStatus.DATA_PREP.value)


# ---------------------------------------------------------------------------
# 4. tasks/update-status
# ---------------------------------------------------------------------------

async def update_task_status(
    session: AsyncSession,
    *,
    tenant_id: str,
    user: SysUser,
    req: TaskUpdateStatusRequest,
) -> TaskUpdateStatusResponse:
    task = await _get_task_or_404(session, req.taskId, tenant_id)
    current = task.status

    # Q5: APPROVED 终态守卫
    if current == ReportingTaskStatus.APPROVED.value:
        raise BusinessException(code=4207, message="已审批任务处于终态，不允许状态流转")

    # Q3: 合法转移检查
    allowed = _ALLOWED_TRANSITIONS.get(current, set())
    if req.targetStatus not in allowed:
        raise BusinessException(
            code=4206,
            message=f"状态 {current} 不允许转移到 {req.targetStatus}，合法目标: {sorted(allowed) or '无 (终态)'}",
        )

    async with session.begin():
        task.status = req.targetStatus
        task.updated_by = str(user.id)
        task.updated_at = datetime.now(timezone.utc)

        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=_SENTINEL_CASE_ID,
            operator=user,
            action_module="REPORTING_TASK",
            action_type="UPDATE",
            action_detail=f"状态流转: {current} → {req.targetStatus}, comment={req.comment}",
        )

    return TaskUpdateStatusResponse(
        taskId=req.taskId,
        previousStatus=current,
        currentStatus=req.targetStatus,
    )


# ---------------------------------------------------------------------------
# 5. tasks/cases/link
# ---------------------------------------------------------------------------

async def link_cases(
    session: AsyncSession,
    *,
    tenant_id: str,
    user: SysUser,
    req: TaskCaseLinkRequest,
) -> TaskCaseLinkResponse:
    await _get_task_or_404(session, req.taskId, tenant_id)

    # Q4: 校验 case 属于当前租户
    valid_cases = (
        await session.execute(
            select(Case.id).where(
                Case.id.in_(req.caseIds),
                Case.tenant_id == tenant_id,
                Case.is_deleted == False,
            )
        )
    ).scalars().all()
    valid_ids = {str(c) for c in valid_cases}
    invalid = [cid for cid in req.caseIds if cid not in valid_ids]
    if invalid:
        raise BusinessException(code=4209, message=f"案件 {invalid} 不属于当前租户或不存在")

    # Q4: 查询已存在的关联 (幂等)
    existing = (
        await session.execute(
            select(ReportCaseLink.case_id).where(
                ReportCaseLink.reporting_task_id == req.taskId,
                ReportCaseLink.case_id.in_(req.caseIds),
                ReportCaseLink.is_deleted == False,
            )
        )
    ).scalars().all()
    existing_ids = {str(c) for c in existing}

    new_ids = [cid for cid in req.caseIds if cid not in existing_ids]
    linked_count = len(new_ids)

    if new_ids:
        async with session.begin():
            for case_id in new_ids:
                link = ReportCaseLink(
                    id=str(uuid.uuid4()),
                    tenant_id=tenant_id,
                    reporting_task_id=req.taskId,
                    case_id=case_id,
                    created_by=str(user.id),
                    updated_by=str(user.id),
                )
                session.add(link)

            await write_audit_log(
                session,
                tenant_id=tenant_id,
                case_id=_SENTINEL_CASE_ID,
                operator=user,
                action_module="REPORTING_TASK",
                action_type="UPDATE",
                action_detail=f"关联案件: taskId={req.taskId}, 新增 {linked_count} 个案件",
            )

    return TaskCaseLinkResponse(taskId=req.taskId, linkedCount=linked_count)


# ---------------------------------------------------------------------------
# 6. tasks/cases/list
# ---------------------------------------------------------------------------

async def list_task_cases(
    session: AsyncSession,
    *,
    tenant_id: str,
    req: TaskCaseListRequest,
) -> TaskCaseListResponse:
    await _get_task_or_404(session, req.taskId, tenant_id)

    base_q = (
        select(ReportCaseLink, Case.case_code, Case.case_name)
        .join(Case, Case.id == ReportCaseLink.case_id)
        .where(
            ReportCaseLink.reporting_task_id == req.taskId,
            ReportCaseLink.is_deleted == False,
            Case.is_deleted == False,
        )
    )
    total: int = (
        await session.execute(select(func.count()).select_from(base_q.subquery()))
    ).scalar_one()

    offset = (req.page - 1) * req.pageSize
    rows = (await session.execute(base_q.offset(offset).limit(req.pageSize))).all()

    # D9: 单次 GROUP BY 查询所有案件的 BLOCKER 数，避免 N+1
    page_case_ids = [str(link.case_id) for link, _, _ in rows]
    blocker_map: dict[str, int] = {}
    if page_case_ids:
        blocker_rows = (
            await session.execute(
                select(DataQualityIssue.case_id, func.count(DataQualityIssue.id))
                .where(
                    DataQualityIssue.case_id.in_(page_case_ids),
                    DataQualityIssue.severity == IssueSeverity.BLOCKER.value,
                    DataQualityIssue.status == IssueStatus.PENDING.value,
                    DataQualityIssue.is_deleted == False,
                )
                .group_by(DataQualityIssue.case_id)
            )
        ).all()
        blocker_map = {str(cid): cnt for cid, cnt in blocker_rows}

    items: list[CaseWithBlockerItem] = []
    for link, case_code, case_name in rows:
        blocker_count = blocker_map.get(str(link.case_id), 0)
        items.append(CaseWithBlockerItem(
            caseId=str(link.case_id),
            caseCode=case_code,
            caseName=case_name or "",
            hasBlocker=blocker_count > 0,
            blockerCount=blocker_count,
        ))

    return TaskCaseListResponse(total=total, page=req.page, pageSize=req.pageSize, items=items)


# ---------------------------------------------------------------------------
# 7. tasks/snapshots/create
# ---------------------------------------------------------------------------

async def create_snapshot(
    session: AsyncSession,
    *,
    tenant_id: str,
    user: SysUser,
    req: SnapshotCreateRequest,
) -> SnapshotCreateResponse:
    await _get_task_or_404(session, req.taskId, tenant_id)

    # 获取关联案件 ID 列表
    linked_case_ids = (
        await session.execute(
            select(ReportCaseLink.case_id).where(
                ReportCaseLink.reporting_task_id == req.taskId,
                ReportCaseLink.is_deleted == False,
            )
        )
    ).scalars().all()
    linked_ids = [str(c) for c in linked_case_ids]

    # D9: 实时 BLOCKER 前置拦截
    if linked_ids:
        blocker_issues = (
            await session.execute(
                select(DataQualityIssue, Case.case_code)
                .join(Case, Case.id == DataQualityIssue.case_id)
                .where(
                    DataQualityIssue.case_id.in_(linked_ids),
                    DataQualityIssue.severity == IssueSeverity.BLOCKER.value,
                    DataQualityIssue.status == IssueStatus.PENDING.value,
                    DataQualityIssue.is_deleted == False,
                )
            )
        ).all()
        if blocker_issues:
            raise BusinessException(
                code=4210,
                message="存在 BLOCKER 级数据质量问题，禁止生成快照",
                details={
                    "blockerCount": len(blocker_issues),
                    "issues": [
                        BlockerIssueItem(
                            caseId=str(issue.case_id),
                            caseCode=case_code,
                            description=issue.description or "",
                        ).model_dump()
                        for issue, case_code in blocker_issues
                    ],
                },
            )

    snapshot_id = str(uuid.uuid4())
    record_count = len(linked_ids)
    # D5=Stub: 不实际上传 OSS, 写占位 URL
    stub_url = f"stub://snapshots/{snapshot_id}.json"
    now = datetime.now(timezone.utc)

    async with session.begin():
        snapshot = DataSnapshot(
            id=snapshot_id,
            tenant_id=tenant_id,
            reporting_task_id=req.taskId,
            snapshot_name=req.snapshotName,
            description=req.description,
            record_count=record_count,
            s3_file_url=stub_url,
            created_by=str(user.id),
            updated_by=str(user.id),
        )
        session.add(snapshot)

        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=_SENTINEL_CASE_ID,
            operator=user,
            action_module="REPORTING_TASK",
            action_type="CREATE",
            action_detail=f"生成数据快照: snapshotName={req.snapshotName}, taskId={req.taskId}, recordCount={record_count}",
        )

    return SnapshotCreateResponse(
        snapshotId=snapshot_id,
        taskId=req.taskId,
        snapshotName=req.snapshotName,
        ossUrl=stub_url,
        recordCount=record_count,
        createdAt=now,
    )


# ---------------------------------------------------------------------------
# 8. tasks/snapshots/list
# ---------------------------------------------------------------------------

async def list_snapshots(
    session: AsyncSession,
    *,
    tenant_id: str,
    req: SnapshotListRequest,
) -> SnapshotListResponse:
    await _get_task_or_404(session, req.taskId, tenant_id)

    base_q = select(DataSnapshot).where(
        DataSnapshot.reporting_task_id == req.taskId,
        DataSnapshot.is_deleted == False,
    )
    total: int = (
        await session.execute(select(func.count()).select_from(base_q.subquery()))
    ).scalar_one()

    offset = (req.page - 1) * req.pageSize
    rows = (
        await session.execute(
            base_q.order_by(DataSnapshot.created_at.desc()).offset(offset).limit(req.pageSize)
        )
    ).scalars().all()

    items = [
        SnapshotItem(
            snapshotId=str(s.id),
            taskId=str(s.reporting_task_id),
            snapshotName=s.snapshot_name,
            description=s.description,
            recordCount=s.record_count or 0,
            ossUrl=s.s3_file_url,
            createdAt=s.created_at,
            createdBy=str(s.created_by),
        )
        for s in rows
    ]
    return SnapshotListResponse(total=total, page=req.page, pageSize=req.pageSize, items=items)
