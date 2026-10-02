"""律所管理 Service (2.S17).

错误码:
  5200 律所不存在
  5202 cooperationStatus 非法值
  5203 ratingLevel 非法值
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.exceptions import BusinessException
from ..enums.case_enums import LawFirmCooperationStatus, LawFirmRatingLevel, CounselRoleInCase, CounselStatus
from ..enums.labels import label_of
from ..models.law_firms import LawFirm
from ..models.external_lawyers import ExternalLawyer
from ..models.case_counsels import CaseCounsel
from ..models.cases import Case
from ..models.base import generate_uuid
from ..schemas.vendors import (
    VendorListRequest, VendorListResponse, VendorListItem,
    VendorDetailResponse,
    VendorCreateRequest, VendorCreateResponse,
    VendorUpdateRequest, VendorUpdateResponse,
    VendorToggleRequest, VendorToggleResponse,
    VendorCasesRequest, VendorCasesResponse, VendorCaseItem,
)


def _cooperation_name(val: str) -> str:
    return label_of(val, LawFirmCooperationStatus) or val


def _rating_name(val: str | None) -> str | None:
    if not val:
        return None
    return label_of(val, LawFirmRatingLevel) or val


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


async def _get_firm_or_404(session: AsyncSession, firm_id: str, tenant_id: str) -> LawFirm:
    row = (
        await session.execute(
            select(LawFirm).where(
                LawFirm.id == firm_id,
                LawFirm.tenant_id == tenant_id,
                LawFirm.is_deleted.is_(False),
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise BusinessException(code=5200, message="律所不存在")
    return row


async def list_vendors(
    session: AsyncSession,
    *,
    req: VendorListRequest,
    tenant_id: str,
) -> VendorListResponse:
    q = select(LawFirm).where(LawFirm.tenant_id == tenant_id, LawFirm.is_deleted.is_(False))
    if req.cooperationStatus:
        q = q.where(LawFirm.cooperation_status == req.cooperationStatus)
    if req.ratingLevel:
        q = q.where(LawFirm.rating_level == req.ratingLevel)
    if req.keyword:
        kw = f"%{req.keyword}%"
        q = q.where(LawFirm.firm_name.ilike(kw))

    total: int = (await session.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    offset = (req.page - 1) * req.pageSize
    firms = (await session.execute(q.offset(offset).limit(req.pageSize))).scalars().all()

    firm_ids = [f.id for f in firms]
    lawyer_counts: dict[str, int] = {}
    if firm_ids:
        rows = (
            await session.execute(
                select(ExternalLawyer.firm_id, func.count().label("cnt"))
                .where(
                    ExternalLawyer.firm_id.in_(firm_ids),
                    ExternalLawyer.tenant_id == tenant_id,
                    ExternalLawyer.is_deleted.is_(False),
                    ExternalLawyer.status == "ACTIVE",
                )
                .group_by(ExternalLawyer.firm_id)
            )
        ).all()
        lawyer_counts = {r.firm_id: r.cnt for r in rows}

    items = [
        VendorListItem(
            firmId=f.id,
            firmName=f.firm_name,
            unifiedSocialCreditCode=f.unified_social_credit_code,
            cooperationStatus=f.cooperation_status or "BACKUP",
            cooperationStatusName=_cooperation_name(f.cooperation_status or "BACKUP"),
            ratingLevel=f.rating_level,
            ratingLevelName=_rating_name(f.rating_level),
            activeLawyerCount=lawyer_counts.get(f.id, 0),
        )
        for f in firms
    ]
    return VendorListResponse(total=total, page=req.page, pageSize=req.pageSize, items=items)


async def get_vendor_detail(
    session: AsyncSession,
    *,
    firm_id: str,
    tenant_id: str,
) -> VendorDetailResponse:
    firm = await _get_firm_or_404(session, firm_id, tenant_id)
    return VendorDetailResponse(
        firmId=firm.id,
        firmName=firm.firm_name,
        unifiedSocialCreditCode=firm.unified_social_credit_code,
        profile=firm.profile,
        rateCardSummary=firm.rate_card_summary,
        cooperationStatus=firm.cooperation_status or "BACKUP",
        cooperationStatusName=_cooperation_name(firm.cooperation_status or "BACKUP"),
        ratingLevel=firm.rating_level,
        ratingLevelName=_rating_name(firm.rating_level),
        createdAt=firm.created_at.strftime("%Y-%m-%dT%H:%M:%SZ") if firm.created_at else None,
        updatedAt=firm.updated_at.strftime("%Y-%m-%dT%H:%M:%SZ") if firm.updated_at else None,
    )


async def create_vendor(
    session: AsyncSession,
    *,
    req: VendorCreateRequest,
    tenant_id: str,
    operator_id: str,
) -> VendorCreateResponse:
    allowed_status = {e.value for e in LawFirmCooperationStatus}
    if req.cooperationStatus not in allowed_status:
        raise BusinessException(code=5202, message=f"cooperationStatus={req.cooperationStatus!r} 非法，允许值: {sorted(allowed_status)}")
    if req.ratingLevel:
        allowed_rating = {e.value for e in LawFirmRatingLevel}
        if req.ratingLevel not in allowed_rating:
            raise BusinessException(code=5203, message=f"ratingLevel={req.ratingLevel!r} 非法，允许值: {sorted(allowed_rating)}")

    firm = LawFirm(
        id=generate_uuid(),
        tenant_id=tenant_id,
        firm_name=req.firmName,
        unified_social_credit_code=req.unifiedSocialCreditCode,
        profile=req.profile,
        rate_card_summary=req.rateCardSummary,
        cooperation_status=req.cooperationStatus,
        rating_level=req.ratingLevel,
        created_by=operator_id,
    )
    async with session.begin():
        session.add(firm)

    return VendorCreateResponse(
        firmId=firm.id,
        firmName=firm.firm_name,
        cooperationStatus=firm.cooperation_status,
    )


async def update_vendor(
    session: AsyncSession,
    *,
    req: VendorUpdateRequest,
    tenant_id: str,
    operator_id: str,
) -> VendorUpdateResponse:
    firm = await _get_firm_or_404(session, req.firmId, tenant_id)
    if req.ratingLevel:
        allowed_rating = {e.value for e in LawFirmRatingLevel}
        if req.ratingLevel not in allowed_rating:
            raise BusinessException(code=5203, message=f"ratingLevel={req.ratingLevel!r} 非法，允许值: {sorted(allowed_rating)}")

    now = datetime.now(timezone.utc)
    async with session.begin():
        firm.firm_name = req.firmName
        firm.unified_social_credit_code = req.unifiedSocialCreditCode
        firm.profile = req.profile
        firm.rate_card_summary = req.rateCardSummary
        firm.rating_level = req.ratingLevel
        firm.updated_by = operator_id
        firm.updated_at = now
        session.add(firm)

    return VendorUpdateResponse(firmId=firm.id, updatedAt=now.strftime("%Y-%m-%dT%H:%M:%SZ"))


async def toggle_vendor(
    session: AsyncSession,
    *,
    req: VendorToggleRequest,
    tenant_id: str,
    operator_id: str,
) -> VendorToggleResponse:
    allowed = {e.value for e in LawFirmCooperationStatus}
    if req.targetStatus not in allowed:
        raise BusinessException(code=5201, message=f"targetStatus={req.targetStatus!r} 非法，允许值: {sorted(allowed)}")

    firm = await _get_firm_or_404(session, req.firmId, tenant_id)
    now = datetime.now(timezone.utc)
    async with session.begin():
        firm.cooperation_status = req.targetStatus
        firm.updated_by = operator_id
        firm.updated_at = now
        session.add(firm)

    return VendorToggleResponse(
        firmId=firm.id,
        cooperationStatus=req.targetStatus,
        cooperationStatusName=_cooperation_name(req.targetStatus),
    )


async def list_vendor_cases(
    session: AsyncSession,
    *,
    req: VendorCasesRequest,
    tenant_id: str,
) -> VendorCasesResponse:
    await _get_firm_or_404(session, req.firmId, tenant_id)

    q = (
        select(CaseCounsel, Case.case_name)
        .join(Case, Case.id == CaseCounsel.case_id)
        .where(
            CaseCounsel.law_firm_id == req.firmId,
            CaseCounsel.tenant_id == tenant_id,
            CaseCounsel.is_deleted.is_(False),
            Case.is_deleted.is_(False),
        )
    )
    total: int = (await session.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    offset = (req.page - 1) * req.pageSize
    rows = (await session.execute(q.offset(offset).limit(req.pageSize))).all()

    items = [
        VendorCaseItem(
            counselId=cc.id,
            caseId=cc.case_id,
            caseName=case_name or "",
            role=cc.role_in_case or "LEAD",
            roleName=label_of(cc.role_in_case or "LEAD", CounselRoleInCase) or (cc.role_in_case or "LEAD"),
            status=cc.status or "ACTIVE",
            statusName=label_of(cc.status or "ACTIVE", CounselStatus) or (cc.status or "ACTIVE"),
        )
        for cc, case_name in rows
    ]
    return VendorCasesResponse(
        firmId=req.firmId,
        total=total,
        page=req.page,
        pageSize=req.pageSize,
        items=items,
    )
