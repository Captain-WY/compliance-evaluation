"""Business Portal BFF Service (2.S19).

clues/list:           case_clues WHERE created_by = current_user.id
evidence-tasks/list:  cross_dept_requests WHERE assignee_id = current_user.id
evidence-tasks/submit: cross_dept_requests status → SUBMITTED
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.exceptions import BusinessException
from ..models.case_clues import CaseClue
from ..models.cases import Case
from ..models.cross_dept_requests import CrossDeptRequest
from ..schemas.dashboard import (
    ClueListItem,
    ClueListRequest,
    ClueListResponse,
    EvidenceTaskListItem,
    EvidenceTaskListRequest,
    EvidenceTaskListResponse,
    EvidenceTaskSubmitRequest,
    EvidenceTaskSubmitResponse,
)

_CLUE_SOURCE_NAMES: dict[str, str] = {
    "EMAIL": "邮件线索",
    "MANUAL": "手工录入",
    "API": "系统对接",
    "INTERNAL_REPORT": "内部上报",
}
_CLUE_STATUS_NAMES: dict[str, str] = {
    "NEW": "待跟进",
    "FOLLOWING": "跟进中",
    "CONVERTED": "已转立案",
    "REJECTED": "已驳回",
    "CLOSED": "已关闭",
}
_EVIDENCE_STATUS_NAMES: dict[str, str] = {
    "PENDING": "待处理",
    "SUBMITTED": "已提交",
    "REJECTED": "已驳回",
    "APPROVED": "已批准",
}


def _fmt(dt) -> Optional[str]:
    if dt is None:
        return None
    if hasattr(dt, "isoformat"):
        return dt.isoformat()
    return str(dt)


async def list_clues(
    req: ClueListRequest,
    tenant_id: str,
    user_id: str,
    db: AsyncSession,
) -> ClueListResponse:
    stmt = select(CaseClue).where(
        CaseClue.is_deleted == False,
        CaseClue.tenant_id == tenant_id,
        CaseClue.created_by == user_id,
    )
    if req.status:
        stmt = stmt.where(CaseClue.status == req.status)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total: int = (await db.execute(count_stmt)).scalar_one()

    stmt = stmt.order_by(CaseClue.created_at.desc())
    stmt = stmt.offset((req.page - 1) * req.pageSize).limit(req.pageSize)
    rows = (await db.execute(stmt)).scalars().all()

    items: list[ClueListItem] = []
    for r in rows:
        case_name: Optional[str] = None
        if r.converted_case_id:
            case_name = (
                await db.execute(
                    select(Case.case_name).where(
                        Case.id == r.converted_case_id,
                        Case.is_deleted == False,
                    )
                )
            ).scalar_one_or_none()

        content = r.description[:200] if r.description else None
        source = r.source_type or ""
        status = r.status or ""
        items.append(
            ClueListItem(
                clueId=r.id,
                title=r.clue_title,
                content=content,
                sourceType=source,
                sourceTypeName=_CLUE_SOURCE_NAMES.get(source, source),
                status=status,
                statusName=_CLUE_STATUS_NAMES.get(status, status),
                submittedAt=_fmt(r.created_at) or "",
                caseId=r.converted_case_id,
                caseTitle=case_name,
            )
        )

    return ClueListResponse(total=total, page=req.page, pageSize=req.pageSize, items=items)


async def list_evidence_tasks(
    req: EvidenceTaskListRequest,
    tenant_id: str,
    user_id: str,
    db: AsyncSession,
) -> EvidenceTaskListResponse:
    stmt = select(CrossDeptRequest).where(
        CrossDeptRequest.is_deleted == False,
        CrossDeptRequest.tenant_id == tenant_id,
        CrossDeptRequest.assignee_id == user_id,
    )
    if req.status:
        stmt = stmt.where(CrossDeptRequest.status == req.status)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total: int = (await db.execute(count_stmt)).scalar_one()

    stmt = stmt.order_by(CrossDeptRequest.created_at.desc())
    stmt = stmt.offset((req.page - 1) * req.pageSize).limit(req.pageSize)
    rows = (await db.execute(stmt)).scalars().all()

    items: list[EvidenceTaskListItem] = []
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

        status = r.status or "PENDING"
        reject_reason: Optional[str] = None
        submitted_at: Optional[str] = None
        if status == "REJECTED":
            reject_reason = r.response_content
        if status in ("SUBMITTED", "APPROVED"):
            submitted_at = _fmt(r.updated_at)

        items.append(
            EvidenceTaskListItem(
                taskId=r.id,
                requestNo=r.request_no,
                title=r.title,
                description=r.request_content,
                caseId=r.case_id,
                caseTitle=case_name,
                caseCode=case_code,
                deadline=_fmt(r.deadline),
                status=status,
                statusName=_EVIDENCE_STATUS_NAMES.get(status, status),
                rejectReason=reject_reason,
                submittedAt=submitted_at,
                createdAt=_fmt(r.created_at) or "",
            )
        )

    return EvidenceTaskListResponse(total=total, page=req.page, pageSize=req.pageSize, items=items)


async def submit_evidence_task(
    req: EvidenceTaskSubmitRequest,
    tenant_id: str,
    user_id: str,
    db: AsyncSession,
) -> EvidenceTaskSubmitResponse:
    row = (
        await db.execute(
            select(CrossDeptRequest).where(
                CrossDeptRequest.id == req.taskId,
                CrossDeptRequest.is_deleted == False,
                CrossDeptRequest.tenant_id == tenant_id,
                CrossDeptRequest.assignee_id == user_id,
            )
        )
    ).scalar_one_or_none()

    if not row:
        raise BusinessException(code=5521, message="取证任务不存在或未分配给当前用户")

    if row.status not in ("PENDING", "REJECTED"):
        raise BusinessException(code=5522, message="取证任务状态不允许提交（已提交/已批准）")

    now = datetime.now(timezone.utc)
    attachment_ids = req.attachmentIds if req.attachmentIds else None

    async with db.begin():
        await db.execute(
            update(CrossDeptRequest)
            .where(CrossDeptRequest.id == req.taskId)
            .values(
                status="SUBMITTED",
                response_content=req.remark,
                attachment_ids=attachment_ids,
                updated_at=now,
                updated_by=user_id,
            )
        )

    return EvidenceTaskSubmitResponse(
        taskId=req.taskId,
        status="SUBMITTED",
        statusName="已提交",
        submittedAt=now.isoformat(),
    )
