"""统一审批 Service (2.S18).

端点映射:
  POST /approvals/create    -> create_approval
  POST /approvals/my-todos  -> get_my_todos
  POST /approvals/detail    -> get_approval_detail
  POST /approvals/process   -> process_approval
  POST /approvals/cancel    -> cancel_approval

决策:
  D2 = 单节点: 每个 instance 创建唯一一个 task, node_sort 固定为 1
  D3 = 不对接 OA: external_process_id 保留但不同步
  D5 = 简单回调注册表: 按 business_type 分发到对应 Service 函数
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Callable

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.exceptions import BusinessException
from ..enums.case_enums import ApprovalInstanceStatus, ApprovalTaskStatus, NotifyType
from ..enums.labels import label_of
from ..models.approval_instances import ApprovalInstance
from ..models.approval_tasks import ApprovalTask
from ..models.sys_users import SysUser
from ..schemas.notifications import (
    ApprovalCreateRequest,
    ApprovalCreateResponse,
    ApprovalMyTodosRequest,
    ApprovalMyTodosResponse,
    ApprovalTodoItem,
    ApprovalDetailRequest,
    ApprovalDetailResponse,
    ApprovalTaskVO,
    ApprovalProcessRequest,
    ApprovalProcessResponse,
    ApprovalCancelRequest,
    ApprovalCancelResponse,
)
from .notification_service import push_notification

# D5 回调注册表 — 外部模块可调用 register_callback() 注册
_CALLBACKS: dict[str, Callable] = {}

_VALID_ACTIONS = {"APPROVE", "REJECT"}

_REFERENCE_URL_MAP: dict[str, str] = {
    "CASE_CLOSURE": "/cases/{businessId}/closing",
    "PAYMENT_REQ": "/cases/{businessId}/finance",
    "DOC_AUTH": "/cases/{businessId}/dossier",
    "REPORT_TASK": "/compliance/tasks/{businessId}",
    "CONTRACT_APPROVAL": "/cases/{businessId}/counsels",
}


def register_callback(business_type: str, fn: Callable) -> None:
    _CALLBACKS[business_type] = fn


def _make_reference_url(business_type: str, business_id: str) -> str:
    template = _REFERENCE_URL_MAP.get(business_type)
    if not template:
        return f"/{business_type.lower()}/{business_id}"
    return template.replace("{businessId}", business_id)


async def _get_user_name(user_id: str, tenant_id: str, db: AsyncSession) -> str:
    stmt = select(SysUser).where(
        SysUser.is_deleted == False,
        SysUser.tenant_id == tenant_id,
        SysUser.id == user_id,
    )
    user = (await db.execute(stmt)).scalar_one_or_none()
    if not user:
        return user_id
    return user.real_name or user.username or user_id


async def create_approval(
    req: ApprovalCreateRequest,
    tenant_id: str,
    user_id: str,
    db: AsyncSession,
) -> ApprovalCreateResponse:
    now = datetime.now(timezone.utc)
    async with db.begin():
        approver = (await db.execute(
            select(SysUser).where(
                SysUser.is_deleted == False,
                SysUser.tenant_id == tenant_id,
                SysUser.id == req.approverId,
            )
        )).scalar_one_or_none()
        if not approver:
            raise BusinessException(code=5422, message="审批人不存在")

        existing = (await db.execute(
            select(ApprovalInstance).where(
                ApprovalInstance.is_deleted == False,
                ApprovalInstance.tenant_id == tenant_id,
                ApprovalInstance.business_type == req.businessType,
                ApprovalInstance.business_id == req.businessId,
                ApprovalInstance.status == ApprovalInstanceStatus.IN_PROGRESS.value,
            )
        )).scalar_one_or_none()
        if existing:
            raise BusinessException(code=5421, message="该业务记录已有进行中的审批")

        instance = ApprovalInstance(
            tenant_id=tenant_id,
            business_type=req.businessType,
            business_id=req.businessId,
            title=req.title,
            process_code=req.processCode,
            status=ApprovalInstanceStatus.IN_PROGRESS.value,
            applicant_id=user_id,
            submitted_at=now,
            created_by=user_id,
        )
        db.add(instance)
        await db.flush()

        task = ApprovalTask(
            tenant_id=tenant_id,
            instance_id=instance.id,
            node_name="审批",
            node_sort=1,
            approver_id=req.approverId,
            status=ApprovalTaskStatus.PENDING.value,
            created_by=user_id,
        )
        db.add(task)
        await db.flush()

        await push_notification(
            tenant_id=tenant_id,
            user_id=req.approverId,
            notify_type=NotifyType.TODO_TASK.value,
            title=f"【审批待办】{req.title}",
            content="您有一条待处理的审批任务，请及时处理。",
            reference_url=_make_reference_url(req.businessType, req.businessId),
            db=db,
        )

        instance_id = instance.id
        task_id = task.id

    return ApprovalCreateResponse(
        instanceId=instance_id,
        taskId=task_id,
        businessType=req.businessType,
        status=ApprovalInstanceStatus.IN_PROGRESS.value,
        statusName=label_of(ApprovalInstanceStatus.IN_PROGRESS.value),
    )


async def get_my_todos(
    req: ApprovalMyTodosRequest,
    tenant_id: str,
    user_id: str,
    db: AsyncSession,
) -> ApprovalMyTodosResponse:
    stmt = (
        select(ApprovalTask, ApprovalInstance)
        .join(ApprovalInstance, ApprovalTask.instance_id == ApprovalInstance.id)
        .where(
            ApprovalTask.is_deleted == False,
            ApprovalTask.tenant_id == tenant_id,
            ApprovalTask.approver_id == user_id,
            ApprovalTask.status == ApprovalTaskStatus.PENDING.value,
            ApprovalInstance.is_deleted == False,
            ApprovalInstance.status == ApprovalInstanceStatus.IN_PROGRESS.value,
        )
    )
    if req.businessType:
        stmt = stmt.where(ApprovalInstance.business_type == req.businessType)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar_one()

    stmt = stmt.order_by(ApprovalInstance.submitted_at.desc())
    stmt = stmt.offset((req.page - 1) * req.pageSize).limit(req.pageSize)
    rows = (await db.execute(stmt)).all()

    items = []
    for task_row, inst_row in rows:
        applicant_name = await _get_user_name(inst_row.applicant_id, tenant_id, db)
        items.append(ApprovalTodoItem(
            taskId=task_row.id,
            instanceId=inst_row.id,
            businessType=inst_row.business_type,
            title=inst_row.title,
            applicantId=inst_row.applicant_id,
            applicantName=applicant_name,
            submittedAt=inst_row.submitted_at.isoformat() if inst_row.submitted_at else None,
            referenceUrl=_make_reference_url(inst_row.business_type, inst_row.business_id),
        ))

    return ApprovalMyTodosResponse(
        total=total,
        page=req.page,
        pageSize=req.pageSize,
        items=items,
    )


async def get_approval_detail(
    req: ApprovalDetailRequest,
    tenant_id: str,
    db: AsyncSession,
) -> ApprovalDetailResponse:
    inst_stmt = select(ApprovalInstance).where(
        ApprovalInstance.is_deleted == False,
        ApprovalInstance.tenant_id == tenant_id,
        ApprovalInstance.id == req.instanceId,
    )
    inst = (await db.execute(inst_stmt)).scalar_one_or_none()
    if not inst:
        raise BusinessException(code=5423, message="审批实例不存在")

    task_stmt = select(ApprovalTask).where(
        ApprovalTask.is_deleted == False,
        ApprovalTask.instance_id == inst.id,
        ApprovalTask.node_sort == 1,
    )
    task = (await db.execute(task_stmt)).scalar_one_or_none()
    if not task:
        raise BusinessException(code=5424, message="审批任务不存在")

    approver_name = await _get_user_name(task.approver_id, tenant_id, db)

    return ApprovalDetailResponse(
        instanceId=inst.id,
        businessType=inst.business_type,
        businessId=inst.business_id,
        title=inst.title,
        status=inst.status,
        statusName=label_of(inst.status) if inst.status else "",
        applicantId=inst.applicant_id,
        submittedAt=inst.submitted_at.isoformat() if inst.submitted_at else None,
        completedAt=inst.completed_at.isoformat() if inst.completed_at else None,
        task=ApprovalTaskVO(
            taskId=task.id,
            nodeName=task.node_name,
            approverId=task.approver_id,
            approverName=approver_name,
            status=task.status,
            statusName=label_of(task.status) if task.status else "",
            comment=task.comment,
            processedAt=task.processed_at.isoformat() if task.processed_at else None,
        ),
    )


async def process_approval(
    req: ApprovalProcessRequest,
    tenant_id: str,
    user_id: str,
    db: AsyncSession,
) -> ApprovalProcessResponse:
    if req.action not in _VALID_ACTIONS:
        raise BusinessException(code=5427, message="action 非法值，允许: APPROVE / REJECT")

    now = datetime.now(timezone.utc)
    new_task_status = ApprovalTaskStatus.APPROVED.value if req.action == "APPROVE" else ApprovalTaskStatus.REJECTED.value
    new_inst_status = ApprovalInstanceStatus.APPROVED.value if req.action == "APPROVE" else ApprovalInstanceStatus.REJECTED.value

    async with db.begin():
        task = (await db.execute(
            select(ApprovalTask).where(
                ApprovalTask.is_deleted == False,
                ApprovalTask.tenant_id == tenant_id,
                ApprovalTask.id == req.taskId,
            )
        )).scalar_one_or_none()
        if not task:
            raise BusinessException(code=5424, message="审批任务不存在")
        if task.approver_id != user_id:
            raise BusinessException(code=5425, message="无权处理此审批（当前用户非指定审批人）")
        if task.status != ApprovalTaskStatus.PENDING.value:
            raise BusinessException(code=5426, message="审批已处理，不可重复操作")

        inst = (await db.execute(
            select(ApprovalInstance).where(
                ApprovalInstance.is_deleted == False,
                ApprovalInstance.tenant_id == tenant_id,
                ApprovalInstance.id == task.instance_id,
            )
        )).scalar_one_or_none()
        if not inst:
            raise BusinessException(code=5423, message="审批实例不存在")

        # 保存事务内需要的字段值（commit 后不应再访问 non-PK 属性）
        inst_id = inst.id
        task_id = task.id
        applicant_id = inst.applicant_id
        inst_title = inst.title
        inst_business_type = inst.business_type
        inst_business_id = inst.business_id

        await db.execute(
            update(ApprovalTask)
            .where(ApprovalTask.id == task_id)
            .values(
                status=new_task_status,
                comment=req.comment,
                processed_at=now,
                updated_at=now,
                updated_by=user_id,
            )
        )
        await db.execute(
            update(ApprovalInstance)
            .where(ApprovalInstance.id == inst_id)
            .values(
                status=new_inst_status,
                completed_at=now,
                updated_at=now,
                updated_by=user_id,
            )
        )

        result_text = "已批准" if req.action == "APPROVE" else "已驳回"
        await push_notification(
            tenant_id=tenant_id,
            user_id=applicant_id,
            notify_type=NotifyType.SYSTEM_ALERT.value,
            title=f"【审批结果】{inst_title} — {result_text}",
            content=req.comment,
            reference_url=_make_reference_url(inst_business_type, inst_business_id),
            db=db,
        )

        callback = _CALLBACKS.get(inst_business_type)
        if callback:
            try:
                await callback(inst, db)
            except Exception:
                pass

    return ApprovalProcessResponse(
        instanceId=inst_id,
        taskId=task_id,
        instanceStatus=new_inst_status,
        instanceStatusName=label_of(new_inst_status),
        taskStatus=new_task_status,
        processedAt=now.isoformat(),
    )


async def cancel_approval(
    req: ApprovalCancelRequest,
    tenant_id: str,
    user_id: str,
    db: AsyncSession,
) -> ApprovalCancelResponse:
    now = datetime.now(timezone.utc)
    new_status = ApprovalInstanceStatus.CANCELLED.value
    async with db.begin():
        inst = (await db.execute(
            select(ApprovalInstance).where(
                ApprovalInstance.is_deleted == False,
                ApprovalInstance.tenant_id == tenant_id,
                ApprovalInstance.id == req.instanceId,
            )
        )).scalar_one_or_none()
        if not inst:
            raise BusinessException(code=5423, message="审批实例不存在")
        if inst.applicant_id != user_id:
            raise BusinessException(code=5428, message="无权撤销（非申请人）")
        if inst.status != ApprovalInstanceStatus.IN_PROGRESS.value:
            raise BusinessException(code=5429, message="审批已终结，不可撤销")

        inst_id = inst.id
        await db.execute(
            update(ApprovalInstance)
            .where(ApprovalInstance.id == inst_id)
            .values(
                status=new_status,
                completed_at=now,
                updated_at=now,
                updated_by=user_id,
            )
        )

    return ApprovalCancelResponse(
        instanceId=inst_id,
        status=new_status,
        statusName=label_of(new_status),
    )
