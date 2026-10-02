"""外部律师管理 Service (2.S17).

错误码:
  5201 律师不存在
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.exceptions import BusinessException
from ..enums.case_enums import LawyerStatus
from ..enums.labels import label_of
from ..models.external_lawyers import ExternalLawyer
from ..models.law_firms import LawFirm
from ..models.base import generate_uuid
from ..schemas.vendors import (
    LawyerListRequest, LawyerListResponse, LawyerListItem,
    LawyerDetailResponse,
    LawyerCreateRequest, LawyerCreateResponse,
    LawyerUpdateRequest, LawyerUpdateResponse,
)


def _status_name(val: str) -> str:
    return label_of(val, LawyerStatus) or val


async def _get_lawyer_or_404(session: AsyncSession, lawyer_id: str, tenant_id: str) -> ExternalLawyer:
    row = (
        await session.execute(
            select(ExternalLawyer).where(
                ExternalLawyer.id == lawyer_id,
                ExternalLawyer.tenant_id == tenant_id,
                ExternalLawyer.is_deleted.is_(False),
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise BusinessException(code=5201, message="律师不存在")
    return row


async def _get_firm_name(session: AsyncSession, firm_id: str, tenant_id: str) -> str | None:
    row = (
        await session.execute(
            select(LawFirm.firm_name).where(
                LawFirm.id == firm_id,
                LawFirm.tenant_id == tenant_id,
                LawFirm.is_deleted.is_(False),
            )
        )
    ).scalar_one_or_none()
    return row


async def list_lawyers(
    session: AsyncSession,
    *,
    req: LawyerListRequest,
    tenant_id: str,
) -> LawyerListResponse:
    q = select(ExternalLawyer).where(
        ExternalLawyer.tenant_id == tenant_id,
        ExternalLawyer.is_deleted.is_(False),
    )
    if req.firmId:
        q = q.where(ExternalLawyer.firm_id == req.firmId)
    if req.status:
        q = q.where(ExternalLawyer.status == req.status)
    if req.keyword:
        kw = f"%{req.keyword}%"
        q = q.where(ExternalLawyer.lawyer_name.ilike(kw))

    total: int = (await session.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    offset = (req.page - 1) * req.pageSize
    lawyers = (await session.execute(q.offset(offset).limit(req.pageSize))).scalars().all()

    firm_ids = list({lw.firm_id for lw in lawyers if lw.firm_id})
    firm_names: dict[str, str] = {}
    if firm_ids:
        rows = (
            await session.execute(
                select(LawFirm.id, LawFirm.firm_name).where(
                    LawFirm.id.in_(firm_ids),
                    LawFirm.tenant_id == tenant_id,
                    LawFirm.is_deleted.is_(False),
                )
            )
        ).all()
        firm_names = {r.id: r.firm_name for r in rows}

    items = [
        LawyerListItem(
            lawyerId=lw.id,
            lawyerName=lw.lawyer_name,
            firmId=lw.firm_id,
            firmName=firm_names.get(lw.firm_id),
            licenseNumber=lw.license_number,
            title=lw.title,
            expertise=lw.expertise,
            status=lw.status or "ACTIVE",
            statusName=_status_name(lw.status or "ACTIVE"),
        )
        for lw in lawyers
    ]
    return LawyerListResponse(total=total, page=req.page, pageSize=req.pageSize, items=items)


async def get_lawyer_detail(
    session: AsyncSession,
    *,
    lawyer_id: str,
    tenant_id: str,
) -> LawyerDetailResponse:
    lw = await _get_lawyer_or_404(session, lawyer_id, tenant_id)
    firm_name = await _get_firm_name(session, lw.firm_id, tenant_id)
    return LawyerDetailResponse(
        lawyerId=lw.id,
        firmId=lw.firm_id,
        firmName=firm_name,
        lawyerName=lw.lawyer_name,
        licenseNumber=lw.license_number,
        title=lw.title,
        expertise=lw.expertise,
        contactPhone=lw.contact_phone,
        contactEmail=lw.contact_email,
        status=lw.status or "ACTIVE",
        statusName=_status_name(lw.status or "ACTIVE"),
        createdAt=lw.created_at.strftime("%Y-%m-%dT%H:%M:%SZ") if lw.created_at else None,
        updatedAt=lw.updated_at.strftime("%Y-%m-%dT%H:%M:%SZ") if lw.updated_at else None,
    )


async def create_lawyer(
    session: AsyncSession,
    *,
    req: LawyerCreateRequest,
    tenant_id: str,
    operator_id: str,
) -> LawyerCreateResponse:
    allowed = {e.value for e in LawyerStatus}
    if req.status not in allowed:
        raise BusinessException(code=5203, message=f"status={req.status!r} 非法，允许值: {sorted(allowed)}")

    # 验证律所存在
    firm_exists = (
        await session.execute(
            select(LawFirm.id).where(
                LawFirm.id == req.firmId,
                LawFirm.tenant_id == tenant_id,
                LawFirm.is_deleted.is_(False),
            )
        )
    ).scalar_one_or_none()
    if not firm_exists:
        raise BusinessException(code=5200, message="律所不存在")

    lw = ExternalLawyer(
        id=generate_uuid(),
        tenant_id=tenant_id,
        firm_id=req.firmId,
        lawyer_name=req.lawyerName,
        license_number=req.licenseNumber,
        title=req.title,
        expertise=req.expertise,
        contact_phone=req.contactPhone,
        contact_email=req.contactEmail,
        status=req.status,
        created_by=operator_id,
    )
    async with session.begin():
        session.add(lw)

    return LawyerCreateResponse(
        lawyerId=lw.id,
        lawyerName=lw.lawyer_name,
        firmId=lw.firm_id,
        status=lw.status,
    )


async def update_lawyer(
    session: AsyncSession,
    *,
    req: LawyerUpdateRequest,
    tenant_id: str,
    operator_id: str,
) -> LawyerUpdateResponse:
    lw = await _get_lawyer_or_404(session, req.lawyerId, tenant_id)
    if req.status:
        allowed = {e.value for e in LawyerStatus}
        if req.status not in allowed:
            raise BusinessException(code=5203, message=f"status={req.status!r} 非法，允许值: {sorted(allowed)}")

    now = datetime.now(timezone.utc)
    async with session.begin():
        if req.lawyerName is not None:
            lw.lawyer_name = req.lawyerName
        if req.licenseNumber is not None:
            lw.license_number = req.licenseNumber
        if req.title is not None:
            lw.title = req.title
        if req.expertise is not None:
            lw.expertise = req.expertise
        if req.contactPhone is not None:
            lw.contact_phone = req.contactPhone
        if req.contactEmail is not None:
            lw.contact_email = req.contactEmail
        if req.status is not None:
            lw.status = req.status
        lw.updated_by = operator_id
        lw.updated_at = now
        session.add(lw)

    return LawyerUpdateResponse(lawyerId=lw.id, updatedAt=now.strftime("%Y-%m-%dT%H:%M:%SZ"))
