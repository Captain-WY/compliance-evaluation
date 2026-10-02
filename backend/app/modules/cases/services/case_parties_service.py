"""案件当事人 Service (切片 2.S3).

实现当事人 CRUD + 批量 upsert + 利益冲突检索 + 审计日志联动.

设计约束:
  1. 写操作 (add/update/remove/batch) 使用显式事务 `async with session.begin()`,
     审计日志与业务变更在同一事务内, 保证原子性
  2. 权限门槛: 复用 `case_detail_ext_service._compute_permissions` 的 `can_edit_base_info` 键
  3. 主表冗余字段 `cases.plaintiff_name` / `defendant_name` 在关键当事人变更时自动同步
  4. 冲突检索不入事务 (纯读), 仅做租户隔离
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.exceptions import BusinessException, NotFoundException, ValidationException
from ..enums import IdentityType, PartyType, label_of
from ..models.case_audit_logs import CaseAuditLog
from ..models.case_parties import CaseParty
from ..models.cases import Case
from ..models.sys_users import SysUser
from ..schemas.parties import (
    AuditLogPagination,
    AuditLogQueryRequest,
    AuditLogQueryResponse,
    AuditLogVO,
    BatchPartyItem,
    BatchUpsertPartiesRequest,
    ConflictCheckRequest,
    ConflictCheckResponse,
    ConflictWarningVO,
    PartiesListResponse,
    PartyAddResponse,
    PartyCreateRequest,
    PartyUpdateRequest,
    PartyVO,
)
from .audit_log_service import (
    compute_field_diff,
    query_by_case as _audit_query_by_case,
    write_audit_log,
)
from .case_detail_ext_service import _compute_permissions


# 用于主表冗余字段同步: 每组取 sort_order 最小 (= 第一顺位) 的当事人名称
_PLAINTIFF_TYPES: frozenset[str] = frozenset({
    PartyType.PLAINTIFF.value,
    PartyType.APPELLANT.value,
})
_DEFENDANT_TYPES: frozenset[str] = frozenset({
    PartyType.DEFENDANT.value,
    PartyType.APPELLEE.value,
    PartyType.RESPONDENT.value,
})


# =============================================================================
# 共用工具
# =============================================================================


def _party_to_vo(p: CaseParty) -> PartyVO:
    """模型 -> VO + Enum 标签翻译."""
    return PartyVO(
        id=p.id,
        case_id=p.case_id,
        party_type=PartyType(p.party_type),
        party_type_name=label_of(p.party_type, PartyType),
        is_our_side=bool(p.is_our_side),
        party_name=p.party_name,
        identity_type=IdentityType(p.identity_type),
        identity_type_name=label_of(p.identity_type, IdentityType),
        identity_number=p.identity_number,
        legal_representative=p.legal_representative,
        contact_number=p.contact_number,
        service_address=p.service_address,
        claim_amount=p.claim_amount,
        claim_details=p.claim_details,
        agent_name=p.agent_name,
        agent_law_firm=p.agent_law_firm,
        agent_contact=p.agent_contact,
        sort_order=int(p.sort_order or 0),
        extended_data=p.extended_data,
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


def _party_snapshot(p: CaseParty) -> dict[str, Any]:
    """JSONB 友好快照 (审计日志 before/after 用)."""
    return {
        "party_type": p.party_type,
        "is_our_side": bool(p.is_our_side),
        "party_name": p.party_name,
        "identity_type": p.identity_type,
        "identity_number": p.identity_number,
        "legal_representative": p.legal_representative,
        "contact_number": p.contact_number,
        "service_address": p.service_address,
        "claim_amount": str(p.claim_amount) if p.claim_amount is not None else None,
        "claim_details": p.claim_details,
        "agent_name": p.agent_name,
        "agent_law_firm": p.agent_law_firm,
        "agent_contact": p.agent_contact,
        "sort_order": int(p.sort_order or 0),
    }


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


async def _load_party_or_404(
    session: AsyncSession, tenant_id: str, party_id: str
) -> CaseParty:
    stmt = select(CaseParty).where(
        and_(
            CaseParty.id == party_id,
            CaseParty.tenant_id == tenant_id,
            CaseParty.is_deleted.is_(False),
        )
    )
    party = (await session.execute(stmt)).scalar_one_or_none()
    if party is None:
        raise NotFoundException(resource="当事人", resource_id=party_id)
    return party


async def _sync_case_redundant_fields(
    session: AsyncSession, tenant_id: str, case_id: str
) -> None:
    """将 case_parties 中 sort_order 最小的当事人姓名同步到 cases.plaintiff_name / defendant_name.

    并发安全: 用 `with_for_update()` 锁 Case 行, 防止并发写 (两次删除, 两次 update_party)
    导致的冗余字段丢失更新。调用方必须在事务内使用。
    """
    # 先锁 Case
    case = (
        await session.execute(
            select(Case)
            .where(
                and_(
                    Case.id == case_id,
                    Case.tenant_id == tenant_id,
                    Case.is_deleted.is_(False),
                )
            )
            .with_for_update()
        )
    ).scalar_one_or_none()
    if case is None:
        raise NotFoundException(resource="案件", resource_id=case_id)

    stmt = (
        select(CaseParty)
        .where(
            and_(
                CaseParty.case_id == case_id,
                CaseParty.tenant_id == tenant_id,
                CaseParty.is_deleted.is_(False),
            )
        )
        .order_by(CaseParty.sort_order.asc(), CaseParty.created_at.asc())
    )
    rows = (await session.execute(stmt)).scalars().all()

    plaintiff_name: str | None = None
    defendant_name: str | None = None
    for p in rows:
        if plaintiff_name is None and p.party_type in _PLAINTIFF_TYPES:
            plaintiff_name = p.party_name
        if defendant_name is None and p.party_type in _DEFENDANT_TYPES:
            defendant_name = p.party_name
        if plaintiff_name and defendant_name:
            break

    if case.plaintiff_name != plaintiff_name:
        case.plaintiff_name = plaintiff_name
    if case.defendant_name != defendant_name:
        case.defendant_name = defendant_name


async def _require_readable(
    session: AsyncSession, tenant_id: str, case_id: str, user: SysUser
) -> Case:
    """案件读权限 = 案件成员 或 LEGAL_ADMIN/SYS_ADMIN. 否则返回 NotFoundException (不泄漏)."""
    case = await _load_case_or_404(session, tenant_id, case_id)
    perms = await _compute_permissions(session, tenant_id, case_id, user.id, case=case)
    # 无任何一个权限键为 True 且非案件成员 -> 按不存在处理 (租户内隔离)
    if not any(perms.model_dump().values()):
        raise NotFoundException(resource="案件", resource_id=case_id)
    return case


async def _require_editable(
    session: AsyncSession, tenant_id: str, case_id: str, user: SysUser
) -> Case:
    """编辑权限 = can_edit_base_info."""
    case = await _load_case_or_404(session, tenant_id, case_id)
    perms = await _compute_permissions(session, tenant_id, case_id, user.id, case=case)
    if not perms.can_edit_base_info:
        raise BusinessException(code=4003, message="无权编辑该案件当事人")
    return case


# =============================================================================
# CRUD
# =============================================================================


async def list_parties(
    session: AsyncSession, tenant_id: str, case_id: str, user: SysUser
) -> PartiesListResponse:
    """列表: 按 sort_order 升序, 我方优先前置."""
    await _require_readable(session, tenant_id, case_id, user)

    stmt = (
        select(CaseParty)
        .where(
            and_(
                CaseParty.case_id == case_id,
                CaseParty.tenant_id == tenant_id,
                CaseParty.is_deleted.is_(False),
            )
        )
        .order_by(
            CaseParty.is_our_side.desc(),
            CaseParty.sort_order.asc(),
            CaseParty.created_at.asc(),
        )
    )
    rows = (await session.execute(stmt)).scalars().all()
    parties = [_party_to_vo(p) for p in rows]
    return PartiesListResponse(
        case_id=case_id,
        total=len(parties),
        parties=parties,
        our_side_count=sum(1 for p in parties if p.is_our_side),
        opposing_count=sum(1 for p in parties if not p.is_our_side),
    )


async def get_party(
    session: AsyncSession, tenant_id: str, party_id: str, user: SysUser
) -> PartyVO:
    party = await _load_party_or_404(session, tenant_id, party_id)
    await _require_readable(session, tenant_id, party.case_id, user)
    return _party_to_vo(party)


async def add_party(
    session: AsyncSession,
    tenant_id: str,
    payload: PartyCreateRequest,
    user: SysUser,
) -> PartyAddResponse:
    """新增当事人, 审计日志 + 冗余字段同步 原子完成.

    设计 §2.3: 同时触发一次冲突检查 (不阻塞保存), 命中对方阵营的结果回传 warnings 字段.
    """
    async with session.begin():
        case = await _require_editable(session, tenant_id, payload.case_id, user)

        party = CaseParty(
            id=f"party_{uuid.uuid4().hex[:12]}",
            tenant_id=tenant_id,
            case_id=payload.case_id,
            party_type=payload.party_type.value,
            is_our_side=payload.is_our_side,
            party_name=payload.party_name,
            identity_type=payload.identity_type.value,
            identity_number=payload.identity_number,
            legal_representative=payload.legal_representative,
            contact_number=payload.contact_number,
            service_address=payload.service_address,
            claim_amount=payload.claim_amount,
            claim_details=payload.claim_details,
            agent_name=payload.agent_name,
            agent_law_firm=payload.agent_law_firm,
            agent_contact=payload.agent_contact,
            sort_order=payload.sort_order,
            extended_data=payload.extended_data,
            created_by=user.id,
            updated_by=user.id,
        )
        session.add(party)
        await session.flush()

        await _sync_case_redundant_fields(session, tenant_id, payload.case_id)

        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=payload.case_id,
            operator=user,
            action_module="PARTIES",
            action_type="CREATE",
            action_detail=f"新增当事人【{party.party_name}】({party.party_type})",
            target_record_id=party.id,
            before_data=None,
            after_data=_party_snapshot(party),
        )
        await session.refresh(party)

    # 事务外执行冲突检查 (纯读, 不影响新增结果)
    # 仅对非我方阵营做冲突预警 (我方当事人不会触发利益冲突)
    warnings: list[ConflictWarningVO] = []
    if not payload.is_our_side and payload.party_name:
        conflict_query = ConflictCheckRequest(
            party_name=payload.party_name,
            identity_number=payload.identity_number,
            exclude_case_id=payload.case_id,
        )
        conflict_result = await conflict_check(session, tenant_id, conflict_query)
        warnings = conflict_result.warnings

    return PartyAddResponse(party=_party_to_vo(party), warnings=warnings)


async def update_party(
    session: AsyncSession,
    tenant_id: str,
    party_id: str,
    patch: PartyUpdateRequest,
    user: SysUser,
) -> PartyVO:
    """编辑当事人 (PATCH), 白名单由 Schema 保证."""
    async with session.begin():
        party = await _load_party_or_404(session, tenant_id, party_id)
        await _require_editable(session, tenant_id, party.case_id, user)

        before = _party_snapshot(party)
        patch_dict = patch.model_dump(exclude_unset=True)
        if not patch_dict:
            raise ValidationException("至少提供一个要更新的字段")

        for k, v in patch_dict.items():
            # Enum 类型自动转 value
            if hasattr(v, "value"):
                v = v.value
            setattr(party, k, v)
        party.updated_by = user.id
        await session.flush()

        after = _party_snapshot(party)
        before_diff, after_diff = compute_field_diff(before, after)

        # 如果 party_type / is_our_side / sort_order / party_name 变更, 同步主表冗余
        if any(k in patch_dict for k in ("party_type", "is_our_side", "sort_order", "party_name")):
            await _sync_case_redundant_fields(session, tenant_id, party.case_id)

        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=party.case_id,
            operator=user,
            action_module="PARTIES",
            action_type="UPDATE",
            action_detail=f"更新当事人【{party.party_name}】字段 {sorted(after_diff.keys())}",
            target_record_id=party.id,
            before_data=before_diff,
            after_data=after_diff,
        )
        await session.refresh(party)

    return _party_to_vo(party)


async def remove_party(
    session: AsyncSession,
    tenant_id: str,
    party_id: str,
    reason: str | None,
    user: SysUser,
) -> None:
    """软删除当事人. 若删除后主表冗余字段会变空且无替补, 抛 4006."""
    async with session.begin():
        party = await _load_party_or_404(session, tenant_id, party_id)
        await _require_editable(session, tenant_id, party.case_id, user)

        case_id = party.case_id
        before = _party_snapshot(party)

        # 检测删除后主表冗余是否失去来源.
        # 语义: `cases.plaintiff_name` 由 `_sync_case_redundant_fields` 取同案所有
        # PLAINTIFF_TYPES 中 sort_order 最小者 (不分 is_our_side). 删除该类型最后一条
        # 会导致主表冗余变 None, 此时要求前端先指定替补再执行删除.
        case = await _load_case_or_404(session, tenant_id, case_id)
        if party.party_type in _PLAINTIFF_TYPES or party.party_type in _DEFENDANT_TYPES:
            peer_types = _PLAINTIFF_TYPES if party.party_type in _PLAINTIFF_TYPES else _DEFENDANT_TYPES
            remaining_stmt = select(func.count(CaseParty.id)).where(
                and_(
                    CaseParty.case_id == case_id,
                    CaseParty.tenant_id == tenant_id,
                    CaseParty.is_deleted.is_(False),
                    CaseParty.id != party.id,
                    CaseParty.party_type.in_(peer_types),
                )
            )
            remaining = (await session.execute(remaining_stmt)).scalar() or 0
            current_redundant = (
                case.plaintiff_name if peer_types is _PLAINTIFF_TYPES else case.defendant_name
            )
            if remaining == 0 and current_redundant:
                raise BusinessException(
                    code=4006,
                    message="删除该当事人会导致主表冗余字段为空, 请先指定替补",
                )

        party.is_deleted = True
        party.updated_by = user.id
        await session.flush()

        await _sync_case_redundant_fields(session, tenant_id, case_id)

        reason_suffix = f" (原因: {reason})" if reason else ""
        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=case_id,
            operator=user,
            action_module="PARTIES",
            action_type="DELETE",
            action_detail=f"删除当事人【{party.party_name}】{reason_suffix}",
            target_record_id=party.id,
            before_data=before,
            after_data=None,
        )


async def batch_upsert(
    session: AsyncSession,
    tenant_id: str,
    payload: BatchUpsertPartiesRequest,
    user: SysUser,
) -> PartiesListResponse:
    """批量维护: id 存在则更新, 否则新增; 未传入的既有记录保持不变."""
    async with session.begin():
        await _require_editable(session, tenant_id, payload.case_id, user)

        for item in payload.parties:
            if item.id:
                # UPDATE 分支
                party = await _load_party_or_404(session, tenant_id, item.id)
                if party.case_id != payload.case_id:
                    raise ValidationException(
                        f"当事人 {item.id} 不属于案件 {payload.case_id}"
                    )
                before = _party_snapshot(party)
                for field_name in (
                    "party_type", "is_our_side", "party_name", "identity_type",
                    "identity_number", "legal_representative", "contact_number",
                    "service_address", "claim_amount", "claim_details",
                    "agent_name", "agent_law_firm", "agent_contact",
                    "sort_order", "extended_data",
                ):
                    value = getattr(item, field_name)
                    if hasattr(value, "value"):
                        value = value.value
                    setattr(party, field_name, value)
                party.updated_by = user.id
                await session.flush()
                after = _party_snapshot(party)
                before_diff, after_diff = compute_field_diff(before, after)
                if before_diff:
                    await write_audit_log(
                        session,
                        tenant_id=tenant_id,
                        case_id=payload.case_id,
                        operator=user,
                        action_module="PARTIES",
                        action_type="UPDATE",
                        action_detail=f"批量更新当事人【{party.party_name}】",
                        target_record_id=party.id,
                        before_data=before_diff,
                        after_data=after_diff,
                    )
            else:
                # CREATE 分支
                party = CaseParty(
                    id=f"party_{uuid.uuid4().hex[:12]}",
                    tenant_id=tenant_id,
                    case_id=payload.case_id,
                    party_type=item.party_type.value,
                    is_our_side=item.is_our_side,
                    party_name=item.party_name,
                    identity_type=item.identity_type.value,
                    identity_number=item.identity_number,
                    legal_representative=item.legal_representative,
                    contact_number=item.contact_number,
                    service_address=item.service_address,
                    claim_amount=item.claim_amount,
                    claim_details=item.claim_details,
                    agent_name=item.agent_name,
                    agent_law_firm=item.agent_law_firm,
                    agent_contact=item.agent_contact,
                    sort_order=item.sort_order,
                    extended_data=item.extended_data,
                    created_by=user.id,
                    updated_by=user.id,
                )
                session.add(party)
                await session.flush()
                await write_audit_log(
                    session,
                    tenant_id=tenant_id,
                    case_id=payload.case_id,
                    operator=user,
                    action_module="PARTIES",
                    action_type="CREATE",
                    action_detail=f"批量新增当事人【{party.party_name}】",
                    target_record_id=party.id,
                    before_data=None,
                    after_data=_party_snapshot(party),
                )

        await _sync_case_redundant_fields(session, tenant_id, payload.case_id)

    return await list_parties(session, tenant_id, payload.case_id, user)


# =============================================================================
# 冲突检索 (决策 D1)
# =============================================================================


async def conflict_check(
    session: AsyncSession,
    tenant_id: str,
    query: ConflictCheckRequest,
) -> ConflictCheckResponse:
    """立案/当事人录入前的利益冲突检索.

    判定:
      - ONGOING: 命中方 is_our_side=FALSE 且 cases.case_status IN (IN_PROGRESS, SUSPENDED, PENDING)
      - HISTORY: 命中方 is_our_side=FALSE 且 cases.case_status = CLOSED
      - BLACKLIST: 预留, 本切片永远返回空
    """
    if not query.party_name and not query.identity_number:
        raise ValidationException("party_name 与 identity_number 至少提供一项")

    or_clauses = []
    if query.party_name:
        or_clauses.append(CaseParty.party_name.ilike(f"%{query.party_name}%"))
    if query.identity_number:
        or_clauses.append(
            and_(
                CaseParty.identity_number.is_not(None),
                CaseParty.identity_number == query.identity_number,
            )
        )

    conditions = [
        CaseParty.tenant_id == tenant_id,
        CaseParty.is_deleted.is_(False),
        or_(*or_clauses),
    ]
    if query.party_type is not None:
        conditions.append(CaseParty.party_type == query.party_type.value)
    if query.exclude_case_id:
        conditions.append(CaseParty.case_id != query.exclude_case_id)

    stmt = (
        select(CaseParty, Case)
        .join(Case, and_(CaseParty.case_id == Case.id, Case.is_deleted.is_(False)))
        .where(*conditions)
        .order_by(Case.created_at.desc())
        .limit(50)
    )
    rows = (await session.execute(stmt)).all()

    warnings: list[ConflictWarningVO] = []
    for party, case in rows:
        # 当前逻辑: 仅对方阵营的命中才算冲突 (我方阵营的历史记录不算冲突)
        if bool(party.is_our_side):
            continue
        is_closed = case.case_status == "CLOSED"
        warning_type = "HISTORY" if is_closed else "ONGOING"
        code_ref = case.internal_case_no or case.id
        if warning_type == "ONGOING":
            message = f"该主体目前是进行中案件 {code_ref} 的对方当事人"
        else:
            message = f"该主体曾是已结案件 {code_ref} 的对方当事人"
        warnings.append(
            ConflictWarningVO(
                type=warning_type,
                message=message,
                party_name=party.party_name,
                related_case_id=case.id,
                related_case_code=case.internal_case_no,
                related_case_name=case.case_name,
                match_side="OPPOSING",
            )
        )

    return ConflictCheckResponse(total=len(warnings), warnings=warnings)


# =============================================================================
# 审计日志查询 (决策 D6)
# =============================================================================


async def query_audit_logs(
    session: AsyncSession,
    tenant_id: str,
    request: AuditLogQueryRequest,
    user: SysUser,
) -> AuditLogQueryResponse:
    """查询案件审计日志时间轴."""
    await _require_readable(session, tenant_id, request.case_id, user)

    pagination = request.pagination or AuditLogPagination()
    total, rows = await _audit_query_by_case(
        session,
        tenant_id=tenant_id,
        case_id=request.case_id,
        action_modules=request.action_modules,
        page=pagination.page,
        size=pagination.size,
    )
    items = [
        AuditLogVO(
            id=r.id,
            case_id=r.case_id,
            operator_id=r.operator_id,
            operator_name=r.operator_name,
            action_module=r.action_module,
            action_type=r.action_type,
            action_detail=r.action_detail,
            target_record_id=r.target_record_id,
            before_data=r.before_data,
            after_data=r.after_data,
            created_at=r.created_at,
        )
        for r in rows
    ]
    return AuditLogQueryResponse(
        total=total, page=pagination.page, size=pagination.size, items=items
    )
