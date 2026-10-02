"""Vendor Portal BFF Service (2.S19).

外部律师门户：所有端点需先查 external_lawyers WHERE user_id=current_user.id。
找不到律师档案 → BusinessException(5530)。

状态映射（D22/Gap3）：
  case_action_items.status → 门户语义
    TODO + deadline 未到期 → PENDING
    TODO + deadline < now  → OVERDUE
    DONE                   → COMPLETED
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.exceptions import BusinessException
from ..models.case_action_items import CaseActionItem
from ..models.case_counsels import CaseCounsel
from ..models.cases import Case
from ..models.external_lawyers import ExternalLawyer
from ..models.law_firms import LawFirm
from ..models.sys_attachments import SysAttachment
from ..schemas.dashboard import (
    VendorSummaryRequest,
    VendorSummaryResponse,
    VendorTaskAttachment,
    VendorTaskDetailRequest,
    VendorTaskDetailResponse,
    VendorTaskListItem,
    VendorTaskListRequest,
    VendorTaskListResponse,
    VendorTaskSubmitRequest,
    VendorTaskSubmitResponse,
)
from . import attachment_service
from ..schemas.notifications import AttachmentListRequest, AttachmentRegisterRequest

_TASK_STATUS_NAMES = {
    "PENDING": "待处理",
    "OVERDUE": "已逾期",
    "COMPLETED": "已完成",
}


def _fmt(dt) -> Optional[str]:
    if dt is None:
        return None
    if hasattr(dt, "isoformat"):
        return dt.isoformat()
    return str(dt)


async def _get_lawyer(user_id: str, tenant_id: str, db: AsyncSession) -> ExternalLawyer:
    """从 sys_users.id 反查律师档案，未找到则抛 5530。"""
    lawyer = (
        await db.execute(
            select(ExternalLawyer).where(
                ExternalLawyer.user_id == user_id,
                ExternalLawyer.is_deleted == False,
                ExternalLawyer.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not lawyer:
        raise BusinessException(code=5530, message="当前用户未关联外部律师档案")
    return lawyer


def _portal_status(item: CaseActionItem, now: datetime) -> str:
    if item.status == "DONE":
        return "COMPLETED"
    if item.due_date and item.due_date < now:
        return "OVERDUE"
    return "PENDING"


def _is_overdue(item: CaseActionItem, now: datetime) -> bool:
    return item.status != "DONE" and item.due_date is not None and item.due_date < now


async def get_summary(
    req: VendorSummaryRequest,
    tenant_id: str,
    user_id: str,
    db: AsyncSession,
) -> VendorSummaryResponse:
    lawyer = await _get_lawyer(user_id, tenant_id, db)

    # 律所名称
    law_firm_name: Optional[str] = None
    if lawyer.firm_id:
        law_firm_name = (
            await db.execute(
                select(LawFirm.firm_name).where(
                    LawFirm.id == lawyer.firm_id,
                    LawFirm.is_deleted == False,
                )
            )
        ).scalar_one_or_none()

    # 评级均值
    rating_raw = (
        await db.execute(
            select(func.avg(CaseCounsel.performance_rating)).where(
                CaseCounsel.lawyer_id == lawyer.id,
                CaseCounsel.is_deleted == False,
            )
        )
    ).scalar_one()
    rating = str(Decimal(str(rating_raw)).quantize(Decimal("0.1"))) if rating_raw else None

    now = datetime.now(timezone.utc)

    # pendingTaskCount
    pending_count: int = (
        await db.execute(
            select(func.count()).where(
                CaseActionItem.is_deleted == False,
                CaseActionItem.tenant_id == tenant_id,
                CaseActionItem.assignee_id == lawyer.id,
                CaseActionItem.status == "TODO",
            )
        )
    ).scalar_one()

    # activeCaseCount
    active_case_count: int = (
        await db.execute(
            select(func.count()).where(
                CaseCounsel.is_deleted == False,
                CaseCounsel.tenant_id == tenant_id,
                CaseCounsel.lawyer_id == lawyer.id,
                CaseCounsel.status == "ACTIVE",
            )
        )
    ).scalar_one()

    # totalCaseCount
    total_case_count: int = (
        await db.execute(
            select(func.count()).where(
                CaseCounsel.is_deleted == False,
                CaseCounsel.tenant_id == tenant_id,
                CaseCounsel.lawyer_id == lawyer.id,
            )
        )
    ).scalar_one()

    return VendorSummaryResponse(
        lawyerId=lawyer.id,
        lawyerName=lawyer.lawyer_name,
        lawFirmId=lawyer.firm_id,
        lawFirmName=law_firm_name,
        rating=rating,
        pendingTaskCount=pending_count,
        activeCaseCount=active_case_count,
        totalCaseCount=total_case_count,
    )


async def list_tasks(
    req: VendorTaskListRequest,
    tenant_id: str,
    user_id: str,
    db: AsyncSession,
) -> VendorTaskListResponse:
    lawyer = await _get_lawyer(user_id, tenant_id, db)
    now = datetime.now(timezone.utc)
    portal_status = req.status

    stmt = select(CaseActionItem).where(
        CaseActionItem.is_deleted == False,
        CaseActionItem.tenant_id == tenant_id,
        CaseActionItem.assignee_id == lawyer.id,
    )

    # 状态映射
    if portal_status == "PENDING":
        stmt = stmt.where(
            CaseActionItem.status == "TODO",
            or_(CaseActionItem.due_date.is_(None), CaseActionItem.due_date >= now),
        )
    elif portal_status == "OVERDUE":
        stmt = stmt.where(
            CaseActionItem.status == "TODO",
            CaseActionItem.due_date < now,
        )
    elif portal_status == "COMPLETED":
        stmt = stmt.where(CaseActionItem.status == "DONE")
    else:
        stmt = stmt.where(CaseActionItem.status.in_(["TODO", "DONE"]))

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total: int = (await db.execute(count_stmt)).scalar_one()

    stmt = stmt.order_by(CaseActionItem.created_at.desc())
    stmt = stmt.offset((req.page - 1) * req.pageSize).limit(req.pageSize)
    rows = (await db.execute(stmt)).scalars().all()

    items: list[VendorTaskListItem] = []
    for r in rows:
        case_name: Optional[str] = None
        case_code: Optional[str] = None
        if r.case_id:
            case_row = (
                await db.execute(
                    select(Case.case_name, Case.internal_case_no).where(
                        Case.id == r.case_id,
                        Case.is_deleted == False,
                    )
                )
            ).one_or_none()
            if case_row:
                case_name, case_code = case_row

        overdue = _is_overdue(r, now)
        p_status = _portal_status(r, now)

        items.append(
            VendorTaskListItem(
                taskId=r.id,
                title=r.title,
                description=r.description,
                caseId=r.case_id,
                caseTitle=case_name,
                caseCode=case_code,
                deadline=_fmt(r.due_date),
                isOverdue=overdue,
                status=p_status,
                statusName=_TASK_STATUS_NAMES.get(p_status, p_status),
                createdAt=_fmt(r.created_at) or "",
            )
        )

    return VendorTaskListResponse(total=total, page=req.page, pageSize=req.pageSize, items=items)


async def submit_task(
    req: VendorTaskSubmitRequest,
    tenant_id: str,
    user_id: str,
    db: AsyncSession,
) -> VendorTaskSubmitResponse:
    lawyer = await _get_lawyer(user_id, tenant_id, db)

    row = (
        await db.execute(
            select(CaseActionItem).where(
                CaseActionItem.id == req.taskId,
                CaseActionItem.is_deleted == False,
                CaseActionItem.tenant_id == tenant_id,
                CaseActionItem.assignee_id == lawyer.id,
            )
        )
    ).scalar_one_or_none()

    if not row:
        raise BusinessException(code=5531, message="任务不存在或未分配给当前律师")

    if row.status == "DONE":
        raise BusinessException(code=5532, message="任务状态不允许提交（已完成）")

    now = datetime.now(timezone.utc)

    async with db.begin():
        await db.execute(
            update(CaseActionItem)
            .where(CaseActionItem.id == req.taskId)
            .values(
                status="DONE",
                submit_note=req.notes,
                completed_at=now,
                updated_at=now,
                updated_by=user_id,
            )
        )
        # 注册附件（CASE_ACTION_ITEM）
        for att_id in req.attachmentIds:
            att = (
                await db.execute(
                    select(SysAttachment).where(
                        SysAttachment.id == att_id,
                        SysAttachment.is_deleted == False,
                        SysAttachment.tenant_id == tenant_id,
                    )
                )
            ).scalar_one_or_none()
            if not att:
                raise BusinessException(code=5533, message=f"附件 ID 不存在或无权访问: {att_id}")
            await db.execute(
                update(SysAttachment)
                .where(SysAttachment.id == att_id)
                .values(
                    business_type="CASE_ACTION_ITEM",
                    business_id=req.taskId,
                    updated_at=now,
                    updated_by=user_id,
                )
            )

    return VendorTaskSubmitResponse(
        taskId=req.taskId,
        status="COMPLETED",
        statusName="已完成",
        completedAt=now.isoformat(),
    )


async def get_task_detail(
    req: VendorTaskDetailRequest,
    tenant_id: str,
    user_id: str,
    db: AsyncSession,
) -> VendorTaskDetailResponse:
    lawyer = await _get_lawyer(user_id, tenant_id, db)
    now = datetime.now(timezone.utc)

    row = (
        await db.execute(
            select(CaseActionItem).where(
                CaseActionItem.id == req.taskId,
                CaseActionItem.is_deleted == False,
                CaseActionItem.tenant_id == tenant_id,
                CaseActionItem.assignee_id == lawyer.id,
            )
        )
    ).scalar_one_or_none()

    if not row:
        raise BusinessException(code=5531, message="任务不存在或未分配给当前律师")

    case_name: Optional[str] = None
    case_code: Optional[str] = None
    if row.case_id:
        case_row = (
            await db.execute(
                select(Case.case_name, Case.internal_case_no).where(
                    Case.id == row.case_id,
                    Case.is_deleted == False,
                )
            )
        ).one_or_none()
        if case_row:
            case_name, case_code = case_row

    # 附件列表
    att_req = AttachmentListRequest(
        businessType="CASE_ACTION_ITEM",
        businessId=req.taskId,
        page=1,
        pageSize=50,
    )
    att_result = await attachment_service.list_attachments(
        req=att_req, tenant_id=tenant_id, db=db
    )
    attachments = [
        VendorTaskAttachment(
            attachmentId=a.attachmentId,
            fileName=a.fileName,
            fileUrl=a.fileUrl,
            fileSize=a.fileSize,
            uploadedAt=a.createdAt,
        )
        for a in att_result.items
    ]

    overdue = _is_overdue(row, now)
    p_status = _portal_status(row, now)

    return VendorTaskDetailResponse(
        taskId=row.id,
        title=row.title,
        description=row.description,
        caseId=row.case_id,
        caseTitle=case_name,
        caseCode=case_code,
        deadline=_fmt(row.due_date),
        isOverdue=overdue,
        status=p_status,
        statusName=_TASK_STATUS_NAMES.get(p_status, p_status),
        attachments=attachments,
        notes=row.submit_note,
        createdAt=_fmt(row.created_at) or "",
        completedAt=_fmt(row.completed_at),
    )

async def list_my_cases(
    *, tenant_id: str, user_id: str, page: int, page_size: int, db: AsyncSession,
) -> dict:
    """Read only cases delegated to, or actively joined by, this external lawyer."""
    from ..models.case_members import CaseMember
    lawyer = await _get_lawyer(user_id, tenant_id, db)
    delegated_ids = select(CaseCounsel.case_id).where(
        CaseCounsel.tenant_id == tenant_id,
        CaseCounsel.lawyer_id == lawyer.id,
        CaseCounsel.counsel_type == "EXTERNAL",
        CaseCounsel.status == "ACTIVE",
        CaseCounsel.is_deleted.is_(False),
    )
    member_ids = select(CaseMember.case_id).where(
        CaseMember.tenant_id == tenant_id,
        CaseMember.user_id == user_id,
        CaseMember.status == "ACTIVE",
        CaseMember.is_deleted.is_(False),
    )
    query = select(Case).where(
        Case.tenant_id == tenant_id,
        Case.is_deleted.is_(False),
        or_(Case.id.in_(delegated_ids), Case.id.in_(member_ids)),
    )
    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    rows = (await db.scalars(
        query.order_by(Case.updated_at.desc(), Case.id)
        .offset((page - 1) * page_size).limit(page_size)
    )).all()
    return {
        "items": [
            {
                "caseId": case.id,
                "caseCode": case.internal_case_no,
                "caseTitle": case.case_name,
                "stage": case.current_stage_code or case.case_status or "",
                "lastUpdateDate": _fmt(case.updated_at) or "",
            }
            for case in rows
        ],
        "total": total,
        "page": page,
        "pageSize": page_size,
    }
