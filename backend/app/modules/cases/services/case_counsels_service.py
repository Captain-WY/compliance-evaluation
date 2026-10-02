"""案件详情 - 外聘律师 Tab Service (切片 2.S7).

实现 5 个 BFF 方法: list_counsels / assign_internal / assign_external /
unassign / attach_contract.

设计约束 (对齐 docs/design/v1/api/02_case_center/08_case_detail_counsels_api_plan.md):
    1. 单向调用链: BFF -> 本 Service -> Model
    2. 显式事务: 所有写方法用 `async with session.begin():`
    3. 软删 + 审计字段: 统一 `is_deleted=False` 过滤
    4. 业务异常: `BusinessException(4003)` 业务拒 / `BusinessException(4013)` 权限拒
    5. 主数据快照: assign 时冻结 law_firm_name + lawyer_name (D2 防失真)
    6. 黑名单律所拦截: `law_firms.cooperation_status='BLACKLISTED'` 拒新增

权限 (D4=A):
    - 读 (list): 案件成员即可 (含 EXTERNAL_COUNSEL)
    - 写 (assign/unassign/attach): 需 `can_manage_members`

审计 (COUNSELS 模块, 2.S7-PRE D6):
    - list: 无审计
    - internal/assign / external/assign: COUNSELS.CREATE
    - unassign: COUNSELS.UPDATE
    - contracts/attach: COUNSELS.CREATE
"""
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.exceptions import BusinessException, NotFoundException, ValidationException
from ..enums import (
    ContractStatus,
    CounselRoleInCase,
    CounselStatus,
    CounselType,
    CurrencyCode,
    LawyerStatus,
    label_of,
)
from ..models.case_contracts import CaseContract
from ..models.case_counsels import CaseCounsel
from ..models.case_documents import CaseDocument
from ..models.cases import Case
from ..models.external_lawyers import ExternalLawyer
from ..models.law_firms import LawFirm
from ..models.sys_users import SysUser
from ..schemas.case_counsels import (
    ContractAttachRequest,
    ContractAttachResponse,
    ContractVO,
    CounselExternalAssignRequest,
    CounselExternalAssignResponse,
    CounselInternalAssignRequest,
    CounselInternalAssignResponse,
    CounselsListRequest,
    CounselsListResponse,
    CounselUnassignRequest,
    CounselUnassignResponse,
    CounselVO,
)
from .audit_log_service import write_audit_log
from .case_detail_ext_service import _compute_permissions


# 合法 FeeType 值集 (D7 延后注册 Enum, 本切片字符串白名单硬编码)
_VALID_FEE_TYPES: set[str] = {"FIXED", "HOURLY", "CONTINGENCY", "MIXED"}

# 黑名单律所合作状态
_BLACKLISTED = "BLACKLISTED"


# =============================================================================
# 通用工具
# =============================================================================


async def _load_case_or_404(
    session: AsyncSession, tenant_id: str, case_id: str
) -> Case:
    stmt = select(Case).where(
        and_(
            Case.id == case_id,
            Case.tenant_id == tenant_id,
            Case.is_deleted.is_(False),
        )
    )
    case = (await session.execute(stmt)).scalar_one_or_none()
    if case is None:
        raise NotFoundException(resource="案件", resource_id=case_id)
    return case


async def _require_counsels_read(
    session: AsyncSession, tenant_id: str, case_id: str, user: SysUser
) -> Case:
    """读权限: 案件成员即可 (与 S3 parties/list 模式一致)."""
    case = await _load_case_or_404(session, tenant_id, case_id)
    perms = await _compute_permissions(session, tenant_id, case_id, user.id, case=case)
    # 仅拒完全非成员 (所有 10 键都 False)
    if not any(perms.model_dump(exclude={
        "case_id", "user_role_in_case", "has_legal_admin", "has_sys_admin", "case_closed",
    }).values()):
        raise NotFoundException(resource="案件", resource_id=case_id)
    return case


async def _require_counsels_write(
    session: AsyncSession, tenant_id: str, case_id: str, user: SysUser
) -> Case:
    """写权限 (D4=A): can_manage_members."""
    case = await _load_case_or_404(session, tenant_id, case_id)
    perms = await _compute_permissions(session, tenant_id, case_id, user.id, case=case)
    if not perms.can_manage_members:
        raise BusinessException(
            code=4013, message="无权管理该案件外聘律师 (缺少 can_manage_members)"
        )
    return case


def _counsel_to_vo(c: CaseCounsel) -> CounselVO:
    """CaseCounsel -> CounselVO + Enum 翻译."""
    return CounselVO(
        id=c.id,
        case_id=c.case_id,
        counsel_type=CounselType(c.counsel_type),
        counsel_type_name=label_of(c.counsel_type, CounselType),
        lawyer_id=c.lawyer_id,
        lawyer_name=c.lawyer_name,
        law_firm_id=c.law_firm_id,
        law_firm_name=c.law_firm_name,
        role_in_case=(
            CounselRoleInCase(c.role_in_case) if c.role_in_case else None
        ),
        role_in_case_name=(
            label_of(c.role_in_case, CounselRoleInCase) if c.role_in_case else None
        ),
        contract_id=c.contract_id,
        contact_phone=c.contact_phone,
        contact_email=c.contact_email,
        status=CounselStatus(c.status or "ACTIVE"),
        status_name=label_of(c.status or "ACTIVE", CounselStatus),
        performance_rating=c.performance_rating,
        evaluation_comment=c.evaluation_comment,
        created_at=c.created_at,
    )


def _contract_to_vo(k: CaseContract, law_firm_name: str | None) -> ContractVO:
    """CaseContract -> ContractVO + Enum 翻译 + 律所名 join 注入."""
    return ContractVO(
        id=k.id,
        case_id=k.case_id,
        contract_no=k.contract_no,
        contract_name=k.contract_name,
        law_firm_id=k.law_firm_id,
        law_firm_name=law_firm_name,
        sign_date=k.sign_date,
        fee_type=k.fee_type,
        currency=CurrencyCode(k.currency or "CNY"),
        currency_name=label_of(k.currency or "CNY", CurrencyCode),
        total_amount=k.total_amount,
        contingency_rate=k.contingency_rate,
        payment_terms=k.payment_terms,
        status=ContractStatus(k.status or "SIGNED"),
        status_name=label_of(k.status or "SIGNED", ContractStatus),
        attachment_ids=list(k.attachment_ids) if k.attachment_ids else [],
        created_at=k.created_at,
    )


async def _assert_law_firm_not_blacklisted(
    session: AsyncSession, tenant_id: str, law_firm_id: str
) -> LawFirm:
    """校验律所存在 + 非黑名单. 返回 LawFirm 实例 (供 firm_name 快照)."""
    firm = (await session.execute(
        select(LawFirm).where(
            and_(
                LawFirm.id == law_firm_id,
                LawFirm.tenant_id == tenant_id,
                LawFirm.is_deleted.is_(False),
            )
        )
    )).scalar_one_or_none()
    if firm is None:
        raise NotFoundException(resource="律所", resource_id=law_firm_id)
    if (firm.cooperation_status or "") == _BLACKLISTED:
        raise BusinessException(
            code=4003,
            message=f"律所 {firm.firm_name!r} 处于黑名单, 拒绝代理/签约",
        )
    return firm


async def _assert_counsel_not_duplicate(
    session: AsyncSession,
    tenant_id: str,
    case_id: str,
    lawyer_id: str,
) -> None:
    """校验该 lawyer 在本案件无 ACTIVE 记录 (防重复 assign)."""
    dup = (await session.execute(
        select(CaseCounsel.id).where(
            and_(
                CaseCounsel.case_id == case_id,
                CaseCounsel.tenant_id == tenant_id,
                CaseCounsel.lawyer_id == lawyer_id,
                CaseCounsel.status == CounselStatus.ACTIVE.value,
                CaseCounsel.is_deleted.is_(False),
            )
        )
    )).scalar_one_or_none()
    if dup is not None:
        raise BusinessException(
            code=4003,
            message=f"该律师已在本案件代理中 (counsel_id={dup}), 请勿重复指派",
        )


# =============================================================================
# 1. /counsels/list
# =============================================================================


async def list_counsels(
    session: AsyncSession,
    tenant_id: str,
    payload: CounselsListRequest,
    user: SysUser,
) -> CounselsListResponse:
    await _require_counsels_read(session, tenant_id, payload.case_id, user)

    stmt = select(CaseCounsel).where(
        and_(
            CaseCounsel.case_id == payload.case_id,
            CaseCounsel.tenant_id == tenant_id,
            CaseCounsel.is_deleted.is_(False),
        )
    )
    if payload.status_filter:
        vals = [s.value for s in payload.status_filter]
        stmt = stmt.where(CaseCounsel.status.in_(vals))
    stmt = stmt.order_by(
        CaseCounsel.counsel_type.asc(),              # INTERNAL -> EXTERNAL
        CaseCounsel.role_in_case.desc(),             # LEAD 优先
        CaseCounsel.created_at.asc(),
    )
    rows = (await session.execute(stmt)).scalars().all()

    internal: list[CounselVO] = []
    external: list[CounselVO] = []
    for c in rows:
        vo = _counsel_to_vo(c)
        if c.counsel_type == CounselType.INTERNAL.value:
            internal.append(vo)
        else:
            external.append(vo)

    return CounselsListResponse(
        case_id=payload.case_id,
        total=len(rows),
        internal_counsels=internal,
        external_counsels=external,
    )


# =============================================================================
# 2. /counsels/internal/assign
# =============================================================================


async def assign_internal(
    session: AsyncSession,
    tenant_id: str,
    payload: CounselInternalAssignRequest,
    user: SysUser,
) -> CounselInternalAssignResponse:
    async with session.begin():
        await _require_counsels_write(session, tenant_id, payload.case_id, user)

        # 1. 校验 user 存在, 读取 real_name 快照
        sys_user = (await session.execute(
            select(SysUser).where(
                and_(
                    SysUser.id == payload.user_id,
                    SysUser.tenant_id == tenant_id,
                    SysUser.is_deleted.is_(False),
                )
            )
        )).scalar_one_or_none()
        if sys_user is None:
            raise NotFoundException(resource="系统用户", resource_id=payload.user_id)

        # 2. 重复 assign 校验
        await _assert_counsel_not_duplicate(
            session, tenant_id, payload.case_id, payload.user_id
        )

        # 3. 插入 case_counsels (INTERNAL)
        new_counsel = CaseCounsel(
            id=f"cc_{uuid.uuid4().hex[:12]}",
            tenant_id=tenant_id,
            case_id=payload.case_id,
            counsel_type=CounselType.INTERNAL.value,
            law_firm_id=None,
            law_firm_name=None,
            lawyer_id=payload.user_id,
            lawyer_name=sys_user.real_name or sys_user.username or payload.user_id,
            role_in_case=payload.role_in_case.value,
            contract_id=None,
            contact_phone=payload.contact_phone,
            contact_email=payload.contact_email,
            status=CounselStatus.ACTIVE.value,
            created_by=user.id,
            updated_by=user.id,
        )
        session.add(new_counsel)
        await session.flush()

        # 4. 审计 COUNSELS.CREATE
        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=payload.case_id,
            operator=user,
            action_module="COUNSELS",
            action_type="CREATE",
            action_detail=(
                f"指派内部律师 {new_counsel.lawyer_name} 为 "
                f"{payload.role_in_case.value}"
            ),
            target_record_id=new_counsel.id,
            before_data=None,
            after_data={
                "counsel_type": "INTERNAL",
                "lawyer_id": new_counsel.lawyer_id,
                "lawyer_name": new_counsel.lawyer_name,
                "role_in_case": new_counsel.role_in_case,
            },
        )

        await session.refresh(new_counsel)

    return CounselInternalAssignResponse(
        counsel=_counsel_to_vo(new_counsel),
        warnings=[],
    )


# =============================================================================
# 3. /counsels/external/assign
# =============================================================================


async def assign_external(
    session: AsyncSession,
    tenant_id: str,
    payload: CounselExternalAssignRequest,
    user: SysUser,
) -> CounselExternalAssignResponse:
    async with session.begin():
        await _require_counsels_write(session, tenant_id, payload.case_id, user)

        # 1. 读 external_lawyer + 校验 ACTIVE
        lawyer = (await session.execute(
            select(ExternalLawyer).where(
                and_(
                    ExternalLawyer.id == payload.external_lawyer_id,
                    ExternalLawyer.tenant_id == tenant_id,
                    ExternalLawyer.is_deleted.is_(False),
                )
            )
        )).scalar_one_or_none()
        if lawyer is None:
            raise NotFoundException(resource="外部律师", resource_id=payload.external_lawyer_id)
        if (lawyer.status or "") != LawyerStatus.ACTIVE.value:
            raise BusinessException(
                code=4003,
                message=f"律师 {lawyer.lawyer_name!r} 已停用 (status={lawyer.status}), 不可指派",
            )

        # 2. 校验律所 + 非黑名单 (快照律所名)
        firm = await _assert_law_firm_not_blacklisted(session, tenant_id, lawyer.firm_id)

        # 3. 重复 assign 校验
        await _assert_counsel_not_duplicate(
            session, tenant_id, payload.case_id, payload.external_lawyer_id
        )

        # 4. 合同绑定校验 (若提供)
        if payload.contract_id:
            ct = (await session.execute(
                select(CaseContract).where(
                    and_(
                        CaseContract.id == payload.contract_id,
                        CaseContract.tenant_id == tenant_id,
                        CaseContract.is_deleted.is_(False),
                    )
                )
            )).scalar_one_or_none()
            if ct is None:
                raise NotFoundException(resource="合同", resource_id=payload.contract_id)
            if ct.case_id != payload.case_id:
                raise BusinessException(
                    code=4003,
                    message=f"合同 {payload.contract_id} 不属于本案件",
                )
            if ct.status == ContractStatus.TERMINATED.value:
                raise BusinessException(
                    code=4003, message="合同已解除, 不可用于新指派",
                )

        # 5. 插入 case_counsels (EXTERNAL, 双快照)
        new_counsel = CaseCounsel(
            id=f"cc_{uuid.uuid4().hex[:12]}",
            tenant_id=tenant_id,
            case_id=payload.case_id,
            counsel_type=CounselType.EXTERNAL.value,
            law_firm_id=firm.id,
            law_firm_name=firm.firm_name,
            lawyer_id=lawyer.id,
            lawyer_name=lawyer.lawyer_name,
            role_in_case=payload.role_in_case.value,
            contract_id=payload.contract_id,
            contact_phone=payload.contact_phone or lawyer.contact_phone,
            contact_email=payload.contact_email or lawyer.contact_email,
            status=CounselStatus.ACTIVE.value,
            created_by=user.id,
            updated_by=user.id,
        )
        session.add(new_counsel)
        await session.flush()

        # 6. 审计
        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=payload.case_id,
            operator=user,
            action_module="COUNSELS",
            action_type="CREATE",
            action_detail=(
                f"指派外部律师 {firm.firm_name}·{lawyer.lawyer_name} 为 "
                f"{payload.role_in_case.value}"
                + (f", 合同={payload.contract_id}" if payload.contract_id else "")
            ),
            target_record_id=new_counsel.id,
            before_data=None,
            after_data={
                "counsel_type": "EXTERNAL",
                "lawyer_id": new_counsel.lawyer_id,
                "lawyer_name": new_counsel.lawyer_name,
                "law_firm_id": new_counsel.law_firm_id,
                "law_firm_name": new_counsel.law_firm_name,
                "role_in_case": new_counsel.role_in_case,
                "contract_id": new_counsel.contract_id,
            },
        )

        await session.refresh(new_counsel)

    return CounselExternalAssignResponse(
        counsel=_counsel_to_vo(new_counsel),
        warnings=[],
    )


# =============================================================================
# 4. /counsels/unassign (D5=A status=TERMINATED, soft)
# =============================================================================


async def unassign(
    session: AsyncSession,
    tenant_id: str,
    payload: CounselUnassignRequest,
    user: SysUser,
) -> CounselUnassignResponse:
    async with session.begin():
        c = (await session.execute(
            select(CaseCounsel).where(
                and_(
                    CaseCounsel.id == payload.counsel_id,
                    CaseCounsel.tenant_id == tenant_id,
                    CaseCounsel.is_deleted.is_(False),
                )
            )
        )).scalar_one_or_none()
        if c is None:
            raise NotFoundException(resource="代理律师", resource_id=payload.counsel_id)

        await _require_counsels_write(session, tenant_id, c.case_id, user)

        # 幂等性: 已 TERMINATED 拒
        if c.status == CounselStatus.TERMINATED.value:
            raise BusinessException(
                code=4003, message="该代理律师已解聘, 不可重复操作",
            )

        before: dict[str, Any] = {
            "status": c.status,
            "performance_rating": c.performance_rating,
            "evaluation_comment": c.evaluation_comment,
        }

        c.status = CounselStatus.TERMINATED.value
        if payload.performance_rating is not None:
            c.performance_rating = payload.performance_rating
        if payload.evaluation_comment is not None:
            c.evaluation_comment = payload.evaluation_comment
        c.updated_by = user.id
        await session.flush()

        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=c.case_id,
            operator=user,
            action_module="COUNSELS",
            action_type="UPDATE",
            action_detail=(
                f"解聘 {c.lawyer_name}"
                + (f": {payload.reason}" if payload.reason else "")
                + (f", 评分={payload.performance_rating}" if payload.performance_rating else "")
            ),
            target_record_id=c.id,
            before_data=before,
            after_data={
                "status": c.status,
                "performance_rating": c.performance_rating,
                "evaluation_comment": c.evaluation_comment,
            },
        )

    return CounselUnassignResponse(
        counsel_id=c.id,
        status=CounselStatus.TERMINATED,
        status_name=label_of(CounselStatus.TERMINATED, CounselStatus),
        warnings=[],
    )


# =============================================================================
# 5. /contracts/attach (D3=C 一体式)
# =============================================================================


async def attach_contract(
    session: AsyncSession,
    tenant_id: str,
    payload: ContractAttachRequest,
    user: SysUser,
) -> ContractAttachResponse:
    async with session.begin():
        await _require_counsels_write(session, tenant_id, payload.case_id, user)

        # 1. 校验律所 + 非黑名单
        firm = await _assert_law_firm_not_blacklisted(session, tenant_id, payload.law_firm_id)

        # 2. fee_type 白名单 (D7 延后 Enum)
        if payload.fee_type not in _VALID_FEE_TYPES:
            raise ValidationException(
                f"fee_type={payload.fee_type!r} not in {sorted(_VALID_FEE_TYPES)}"
            )

        # 3. 校验 attachment_ids 均属本案 (D1=A case_documents)
        if payload.attachment_ids:
            rows = (await session.execute(
                select(CaseDocument.id, CaseDocument.case_id).where(
                    and_(
                        CaseDocument.id.in_(payload.attachment_ids),
                        CaseDocument.tenant_id == tenant_id,
                        CaseDocument.is_deleted.is_(False),
                    )
                )
            )).all()
            found_ids = {r[0] for r in rows}
            missing = set(payload.attachment_ids) - found_ids
            if missing:
                raise NotFoundException(
                    resource="案件文档",
                    resource_id=",".join(sorted(missing)),
                )
            bad_case = [r[0] for r in rows if r[1] != payload.case_id]
            if bad_case:
                raise BusinessException(
                    code=4003,
                    message=f"附件 {bad_case} 不属于本案件",
                )

        # 4. 绑定 counsel 校验 (若提供)
        bound_counsel_id: str | None = None
        target_counsel: CaseCounsel | None = None
        if payload.bind_counsel_id:
            target_counsel = (await session.execute(
                select(CaseCounsel).where(
                    and_(
                        CaseCounsel.id == payload.bind_counsel_id,
                        CaseCounsel.tenant_id == tenant_id,
                        CaseCounsel.is_deleted.is_(False),
                    )
                )
            )).scalar_one_or_none()
            if target_counsel is None:
                raise NotFoundException(
                    resource="代理律师", resource_id=payload.bind_counsel_id,
                )
            if target_counsel.case_id != payload.case_id:
                raise BusinessException(
                    code=4003,
                    message="bind_counsel_id 不属于本案件",
                )

        # 5. 插入 case_contracts
        new_contract = CaseContract(
            id=f"ct_{uuid.uuid4().hex[:12]}",
            tenant_id=tenant_id,
            case_id=payload.case_id,
            contract_no=payload.contract_no,
            contract_name=payload.contract_name,
            law_firm_id=firm.id,
            sign_date=payload.sign_date,
            fee_type=payload.fee_type,
            currency=payload.currency.value,
            total_amount=payload.total_amount,
            contingency_rate=payload.contingency_rate,
            payment_terms=payload.payment_terms,
            status=payload.status.value,
            attachment_ids=payload.attachment_ids or None,
            created_by=user.id,
            updated_by=user.id,
        )
        session.add(new_contract)
        await session.flush()

        # 6. 可选 bind counsel
        if target_counsel is not None:
            target_counsel.contract_id = new_contract.id
            target_counsel.updated_by = user.id
            bound_counsel_id = target_counsel.id

        # 7. 审计 COUNSELS.CREATE
        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=payload.case_id,
            operator=user,
            action_module="COUNSELS",
            action_type="CREATE",
            action_detail=(
                f"创建合同 {payload.contract_name} 律所={firm.firm_name} "
                f"fee={payload.fee_type} 金额={payload.total_amount or 0} "
                f"{payload.currency.value}"
                + (f", 绑定 counsel={bound_counsel_id}" if bound_counsel_id else "")
            ),
            target_record_id=new_contract.id,
            before_data=None,
            after_data={
                "contract_name": new_contract.contract_name,
                "law_firm_id": new_contract.law_firm_id,
                "law_firm_name": firm.firm_name,
                "fee_type": new_contract.fee_type,
                "currency": new_contract.currency,
                "total_amount": str(new_contract.total_amount) if new_contract.total_amount else None,
                "attachment_count": len(payload.attachment_ids or []),
                "bound_counsel_id": bound_counsel_id,
            },
        )

        await session.refresh(new_contract)

    return ContractAttachResponse(
        contract=_contract_to_vo(new_contract, law_firm_name=firm.firm_name),
        bound_counsel_id=bound_counsel_id,
        warnings=[],
    )
