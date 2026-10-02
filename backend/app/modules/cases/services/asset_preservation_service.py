"""资产保全台账 Service (切片 2.S12).

实现 7 个 BFF 方法:
    list_preservations / detail_preservation / create_preservation /
    extend_preservation / release_preservation / realize_preservation /
    expiry_alerts

设计约束 (对齐 docs/design/v1/api/04_asset_preservation/00_asset_preservation_api_plan.md):
    D1: /extend 就地更新 expire_date, 续期历史追加至 extended_data.extend_history[]
    D2: EXPIRED 为 Service 层视图计算态 (DB 不写), status 字段仅 ACTIVE/RELEASED/REALIZED
    D3: /release ruling_document_id 可选, RELEASED 终态不可逆
    D4: /realize 强制在同一事务内创建 financial_transactions RECOVERY 记录 (设计文档 §3.2)
    D5: expiry-alerts 单端点, summary 固定统计 7d/30d, items 跟随 days_threshold 分页
    D6: 案件成员级权限 (OWNER/CO_COUNSEL 写, 成员读, 管理层全租户)
    D7: asset_identifiers JSONB 软校验 (仅检查必填字段)
    D8: 审计日志 action_module=ASSET_PRESERVATION
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.exceptions import BusinessException, NotFoundException
from ..enums import (
    AssetType,
    FundDirection,
    PreservationStatus,
    PreservationType,
    TransactionStatus,
    label_of,
)
from ..models.asset_preservations import AssetPreservation
from ..models.case_members import CaseMember
from ..models.case_parties import CaseParty
from ..models.cases import Case
from ..models.financial_transactions import FinancialTransaction
from ..models.sys_users import SysUser
from ..schemas.asset_preservation import (
    AlertSummary,
    CreatePreservationRequest,
    CreatePreservationResponse,
    DetailPreservationRequest,
    DetailPreservationResponse,
    ExtendHistoryEntry,
    ExtendPreservationRequest,
    ExtendPreservationResponse,
    ExpiryAlertItem,
    ExpiryAlertsRequest,
    ExpiryAlertsResponse,
    ListPreservationsRequest,
    ListPreservationsResponse,
    ListSummary,
    PreservationDetailVO,
    PreservationListItem,
    RealizePreservationRequest,
    RealizePreservationResponse,
    ReleasePreservationRequest,
    ReleasePreservationResponse,
)
from .audit_log_service import write_audit_log
from .case_detail_ext_service import is_global_admin

# ── 管理层角色集 (可读全租户)
_ADMIN_ROLES = {"SYS_ADMIN", "LEGAL_ADMIN", "LEGAL_DIRECTOR"}
# ── 写权限角色集 (案件成员中的写入方)
_WRITE_ROLES = {"OWNER", "CO_COUNSEL"}
# ── 到期预警阈值 (固定, 不随请求参数变化)
_ALERT_7D = 7
_ALERT_30D = 30


# ---------------------------------------------------------------------------
# 内部辅助函数
# ---------------------------------------------------------------------------

def _today() -> date:
    return datetime.now(timezone.utc).date()


def _compute_effective_status(row: AssetPreservation) -> str:
    """D2: DB status=ACTIVE 且 expire_date 已过 → 返回 EXPIRED (不写 DB)."""
    if row.status == PreservationStatus.ACTIVE.value and row.expire_date < _today():
        return PreservationStatus.EXPIRED.value
    return row.status


def _days_until_expiry(expire_date: date) -> int:
    return (expire_date - _today()).days


def _alert_level(days: int) -> str:
    if days < 0:
        return "OVERDUE"
    if days <= _ALERT_7D:
        return "URGENT"
    return "WARNING"


def _asset_identifiers_soft_validate(asset_type: str, identifiers: dict | None) -> list[str]:
    """D7: 软校验 asset_identifiers 必填字段, 返回警告列表."""
    required: dict[str, list[str]] = {
        AssetType.BANK_ACCOUNT.value: ["bank_name", "account_no"],
        AssetType.REAL_ESTATE.value: ["property_cert_no", "address"],
        AssetType.EQUITY.value: ["company_name"],
        AssetType.VEHICLE.value: ["license_plate"],
        AssetType.IP.value: ["ip_type", "ip_name"],
        AssetType.OTHER.value: ["description"],
    }
    warnings: list[str] = []
    fields = required.get(asset_type, [])
    if fields and not identifiers:
        warnings.append(f"asset_type={asset_type} 建议填写 asset_identifiers: {fields}")
        return warnings
    if identifiers:
        missing = [f for f in fields if not identifiers.get(f)]
        for f in missing:
            warnings.append(f"asset_identifiers 缺少建议字段: {f}")
    return warnings


async def _get_preservation_or_404(
    session: AsyncSession, preservation_id: str, tenant_id: str
) -> AssetPreservation:
    row = await session.scalar(
        select(AssetPreservation).where(
            AssetPreservation.id == preservation_id,
            AssetPreservation.tenant_id == tenant_id,
            AssetPreservation.is_deleted == False,
        )
    )
    if not row:
        raise NotFoundException("资产保全记录", preservation_id)
    return row


async def _assert_case_not_archived(
    session: AsyncSession, case_id: str, tenant_id: str
) -> None:
    """S9 全局只读锁: 归档案件禁止写入 (D8: 4102)."""
    case_status = await session.scalar(
        select(Case.case_status).where(
            Case.id == case_id,
            Case.tenant_id == tenant_id,
            Case.is_deleted == False,
        )
    )
    if case_status == "ARCHIVED":
        raise BusinessException(4102, "案件已归档，禁止修改资产保全")


async def _assert_write_permission(
    session: AsyncSession, case_id: str, tenant_id: str, user: SysUser
) -> None:
    """D6: 写权限校验 (OWNER/CO_COUNSEL 或管理层)."""
    if is_global_admin(user, _ADMIN_ROLES):
        return
    member = await session.scalar(
        select(CaseMember).where(
            CaseMember.case_id == case_id,
            CaseMember.user_id == user.id,
            CaseMember.tenant_id == tenant_id,
            CaseMember.status == "ACTIVE",
            CaseMember.role_code.in_(_WRITE_ROLES),
            CaseMember.is_deleted == False,
        )
    )
    if not member:
        raise BusinessException(4013, "无权限操作该资产保全记录")


async def _assert_read_permission(
    session: AsyncSession, case_id: str, tenant_id: str, user: SysUser
) -> None:
    """D6: 读权限校验 (案件 ACTIVE 成员 或管理层)."""
    if is_global_admin(user, _ADMIN_ROLES):
        return
    member = await session.scalar(
        select(CaseMember).where(
            CaseMember.case_id == case_id,
            CaseMember.user_id == user.id,
            CaseMember.tenant_id == tenant_id,
            CaseMember.status == "ACTIVE",
            CaseMember.is_deleted == False,
        )
    )
    if not member:
        raise BusinessException(4013, "无权限查看该案件资产保全记录")


async def _fetch_party_name_map(
    session: AsyncSession, tenant_id: str, party_ids: list[str]
) -> dict[str, str]:
    """批量查询 case_parties.party_name."""
    if not party_ids:
        return {}
    rows = await session.execute(
        select(CaseParty.id, CaseParty.party_name).where(
            CaseParty.id.in_(party_ids),
            CaseParty.tenant_id == tenant_id,
            CaseParty.is_deleted == False,
        )
    )
    return {str(r.id): r.party_name for r in rows}


async def _fetch_case_info_map(
    session: AsyncSession, tenant_id: str, case_ids: list[str]
) -> dict[str, dict]:
    """批量查询 cases.internal_case_no + case_name."""
    if not case_ids:
        return {}
    rows = await session.execute(
        select(Case.id, Case.internal_case_no, Case.case_name).where(
            Case.id.in_(case_ids),
            Case.tenant_id == tenant_id,
            Case.is_deleted == False,
        )
    )
    return {str(r.id): {"internal_case_no": r.internal_case_no, "case_name": r.case_name} for r in rows}


def _to_list_item(
    row: AssetPreservation,
    party_name: str | None,
    case_info: dict | None,
) -> PreservationListItem:
    eff = _compute_effective_status(row)
    days = _days_until_expiry(row.expire_date)
    return PreservationListItem(
        id=str(row.id),
        case_id=str(row.case_id),
        internal_case_no=(case_info or {}).get("internal_case_no"),
        case_name=(case_info or {}).get("case_name"),
        asset_type=row.asset_type,
        asset_type_name=label_of(AssetType(row.asset_type)),
        asset_name=row.asset_name,
        preservation_type=row.preservation_type,
        preservation_type_name=label_of(PreservationType(row.preservation_type)),
        status=row.status,
        effective_status=eff,
        effective_status_name=label_of(PreservationStatus(eff)),
        start_date=row.start_date,
        expire_date=row.expire_date,
        days_until_expiry=days,
        estimated_value=row.estimated_value,
        currency=row.currency or "CNY",
        execution_court=row.execution_court,
        is_expiring_soon=(0 <= days <= _ALERT_30D),
        owner_party_id=str(row.owner_party_id),
        owner_party_name=party_name,
    )


# ---------------------------------------------------------------------------
# 1. list_preservations
# ---------------------------------------------------------------------------

async def list_preservations(
    session: AsyncSession,
    tenant_id: str,
    user: SysUser,
    req: ListPreservationsRequest,
) -> ListPreservationsResponse:
    is_admin = is_global_admin(user, _ADMIN_ROLES)

    # ── 构建 case_id 范围 (D6 / Q12)
    if req.case_id:
        if not is_admin:
            await _assert_read_permission(session, req.case_id, tenant_id, user)
        case_ids_filter = [req.case_id]
    elif is_admin:
        case_ids_filter = None  # 全租户
    else:
        # Q12: 本人参与案件
        rows = await session.execute(
            select(CaseMember.case_id).where(
                CaseMember.user_id == user.id,
                CaseMember.tenant_id == tenant_id,
                CaseMember.status == "ACTIVE",
                CaseMember.is_deleted == False,
            )
        )
        case_ids_filter = [str(r.case_id) for r in rows]
        if not case_ids_filter:
            empty_summary = ListSummary(
                active_count=0, expiring_30d_count=0,
                expired_count=0, released_count=0, realized_count=0,
            )
            return ListPreservationsResponse(total=0, page=req.pagination.page, size=req.pagination.size, items=[], summary=empty_summary)

    # ── 基础过滤条件
    conditions = [
        AssetPreservation.tenant_id == tenant_id,
        AssetPreservation.is_deleted == False,
    ]
    if case_ids_filter is not None:
        conditions.append(AssetPreservation.case_id.in_(case_ids_filter))
    if req.asset_type:
        conditions.append(AssetPreservation.asset_type == req.asset_type)

    # ── 拉取全量数据 (status_filter 和 expiring_within_days 在内存中计算, 因为 EXPIRED 是视图态)
    stmt = select(AssetPreservation).where(*conditions).order_by(AssetPreservation.expire_date.asc())
    all_rows = list((await session.execute(stmt)).scalars())

    # ── 计算 effective_status 并过滤
    today = _today()
    filtered: list[AssetPreservation] = []
    for row in all_rows:
        eff = _compute_effective_status(row)
        if req.status_filter and eff not in req.status_filter:
            continue
        if req.expiring_within_days is not None:
            days = _days_until_expiry(row.expire_date)
            if days > req.expiring_within_days:
                continue
        filtered.append(row)

    # ── 统计摘要 (基于全量, 不受 status_filter 影响)
    active_count = sum(1 for r in all_rows if r.status == PreservationStatus.ACTIVE.value and r.expire_date >= today)
    expired_count = sum(1 for r in all_rows if r.status == PreservationStatus.ACTIVE.value and r.expire_date < today)
    expiring_30d = sum(1 for r in all_rows if r.status == PreservationStatus.ACTIVE.value and 0 <= _days_until_expiry(r.expire_date) <= _ALERT_30D)
    released_count = sum(1 for r in all_rows if r.status == PreservationStatus.RELEASED.value)
    realized_count = sum(1 for r in all_rows if r.status == PreservationStatus.REALIZED.value)
    total_value = sum(
        (r.estimated_value or Decimal(0))
        for r in all_rows
        if r.status == PreservationStatus.ACTIVE.value
    ) or None

    summary = ListSummary(
        total_estimated_value=total_value,
        active_count=active_count,
        expiring_30d_count=expiring_30d,
        expired_count=expired_count,
        released_count=released_count,
        realized_count=realized_count,
    )

    # ── 分页
    total = len(filtered)
    offset = (req.pagination.page - 1) * req.pagination.size
    page_rows = filtered[offset: offset + req.pagination.size]

    # ── 批量补全关联名称
    party_ids = [str(r.owner_party_id) for r in page_rows]
    case_ids = list({str(r.case_id) for r in page_rows})
    party_map = await _fetch_party_name_map(session, tenant_id, party_ids)
    case_map = await _fetch_case_info_map(session, tenant_id, case_ids)

    items = [
        _to_list_item(r, party_map.get(str(r.owner_party_id)), case_map.get(str(r.case_id)))
        for r in page_rows
    ]

    return ListPreservationsResponse(
        total=total, page=req.pagination.page, size=req.pagination.size,
        items=items, summary=summary,
    )


# ---------------------------------------------------------------------------
# 2. detail_preservation
# ---------------------------------------------------------------------------

async def detail_preservation(
    session: AsyncSession,
    tenant_id: str,
    user: SysUser,
    req: DetailPreservationRequest,
) -> DetailPreservationResponse:
    row = await _get_preservation_or_404(session, req.preservation_id, tenant_id)
    await _assert_read_permission(session, str(row.case_id), tenant_id, user)

    party_map = await _fetch_party_name_map(session, tenant_id, [str(row.owner_party_id)])
    case_map = await _fetch_case_info_map(session, tenant_id, [str(row.case_id)])

    base = _to_list_item(row, party_map.get(str(row.owner_party_id)), case_map.get(str(row.case_id)))
    ext_data = row.extended_data or {}
    history_raw = ext_data.get("extend_history", [])
    history = [ExtendHistoryEntry(**h) for h in history_raw]

    vo = PreservationDetailVO(
        **base.model_dump(),
        asset_identifiers=row.asset_identifiers,
        realized_value=row.realized_value,
        ruling_document_id=str(row.ruling_document_id) if row.ruling_document_id else None,
        description=row.description,
        extend_history=history,
        created_at=row.created_at,
        created_by=str(row.created_by) if row.created_by else None,
        updated_at=row.updated_at,
    )
    return DetailPreservationResponse(data=vo)


# ---------------------------------------------------------------------------
# 3. create_preservation
# ---------------------------------------------------------------------------

async def create_preservation(
    session: AsyncSession,
    tenant_id: str,
    user: SysUser,
    req: CreatePreservationRequest,
) -> CreatePreservationResponse:
    await _assert_case_not_archived(session, req.case_id, tenant_id)
    await _assert_write_permission(session, req.case_id, tenant_id, user)

    # D7 软校验
    _asset_identifiers_soft_validate(req.asset_type, req.asset_identifiers)

    # 校验 owner_party_id 属于该案件
    party = await session.scalar(
        select(CaseParty).where(
            CaseParty.id == req.owner_party_id,
            CaseParty.case_id == req.case_id,
            CaseParty.tenant_id == tenant_id,
            CaseParty.is_deleted == False,
        )
    )
    if not party:
        raise BusinessException(4301, "案件当事方不存在", {"owner_party_id": req.owner_party_id})

    new_id = f"prsv_{uuid.uuid4().hex[:16]}"
    now = datetime.now(timezone.utc)

    tx_cm = session.begin_nested() if session.in_transaction() else session.begin()
    async with tx_cm:
        preservation = AssetPreservation(
            id=new_id,
            tenant_id=tenant_id,
            case_id=req.case_id,
            process_node_id=req.process_node_id,
            owner_party_id=req.owner_party_id,
            asset_type=req.asset_type,
            asset_name=req.asset_name,
            asset_identifiers=req.asset_identifiers,
            preservation_type=req.preservation_type,
            status=PreservationStatus.ACTIVE.value,
            start_date=req.start_date,
            expire_date=req.expire_date,
            estimated_value=req.estimated_value,
            currency=req.currency,
            execution_court=req.execution_court,
            ruling_document_id=req.ruling_document_id,
            description=req.description,
            created_by=user.id,
            updated_by=user.id,
        )
        session.add(preservation)

        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=req.case_id,
            operator=user,
            action_module="ASSET_PRESERVATION",
            action_type="CREATE",
            action_detail=f"新建资产保全: {req.asset_name} ({req.asset_type})",
            target_record_id=new_id,
            after_data={"asset_type": req.asset_type, "preservation_type": req.preservation_type, "expire_date": str(req.expire_date)},
        )

    return CreatePreservationResponse(
        preservation_id=new_id,
        case_id=req.case_id,
        status=PreservationStatus.ACTIVE.value,
        effective_status=PreservationStatus.ACTIVE.value,
        created_at=now,
    )


# ---------------------------------------------------------------------------
# 4. extend_preservation
# ---------------------------------------------------------------------------

async def extend_preservation(
    session: AsyncSession,
    tenant_id: str,
    user: SysUser,
    req: ExtendPreservationRequest,
) -> ExtendPreservationResponse:
    row = await _get_preservation_or_404(session, req.preservation_id, tenant_id)
    await _assert_case_not_archived(session, str(row.case_id), tenant_id)
    await _assert_write_permission(session, str(row.case_id), tenant_id, user)

    if row.status != PreservationStatus.ACTIVE.value:
        raise BusinessException(4100, "资产保全已解除/变现，不可再操作")
    if req.new_expire_date <= row.expire_date:
        raise BusinessException(4101, "续期日期不得早于当前到期日", {"current": str(row.expire_date), "requested": str(req.new_expire_date)})

    prev_date = row.expire_date
    now = datetime.now(timezone.utc)

    tx_cm = session.begin_nested() if session.in_transaction() else session.begin()
    async with tx_cm:
        # D1: 就地更新 + 追加 extend_history
        ext = row.extended_data or {}
        history = ext.get("extend_history", [])
        history.append({
            "extended_at": now.isoformat(),
            "previous_expire_date": str(prev_date),
            "new_expire_date": str(req.new_expire_date),
            "operator_id": str(user.id),
            "reason": req.reason,
        })
        row.expire_date = req.new_expire_date
        row.extended_data = {**ext, "extend_history": history}
        row.updated_by = user.id
        row.updated_at = now

        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=str(row.case_id),
            operator=user,
            action_module="ASSET_PRESERVATION",
            action_type="UPDATE",
            action_detail=f"续期资产保全: {prev_date} → {req.new_expire_date}",
            target_record_id=req.preservation_id,
            before_data={"expire_date": str(prev_date)},
            after_data={"expire_date": str(req.new_expire_date)},
        )

    eff = _compute_effective_status(row)
    return ExtendPreservationResponse(
        preservation_id=req.preservation_id,
        previous_expire_date=prev_date,
        new_expire_date=req.new_expire_date,
        effective_status=eff,
        updated_at=now,
    )


# ---------------------------------------------------------------------------
# 5. release_preservation
# ---------------------------------------------------------------------------

async def release_preservation(
    session: AsyncSession,
    tenant_id: str,
    user: SysUser,
    req: ReleasePreservationRequest,
) -> ReleasePreservationResponse:
    row = await _get_preservation_or_404(session, req.preservation_id, tenant_id)
    await _assert_case_not_archived(session, str(row.case_id), tenant_id)
    await _assert_write_permission(session, str(row.case_id), tenant_id, user)

    if row.status != PreservationStatus.ACTIVE.value:
        raise BusinessException(4100, "资产保全已解除/变现，不可再操作")

    now = datetime.now(timezone.utc)

    tx_cm = session.begin_nested() if session.in_transaction() else session.begin()
    async with tx_cm:
        row.status = PreservationStatus.RELEASED.value
        if req.ruling_document_id:
            row.ruling_document_id = req.ruling_document_id
        ext = row.extended_data or {}
        row.extended_data = {
            **ext,
            "release_date": str(req.release_date),
            "release_reason": req.release_reason,
        }
        row.updated_by = user.id
        row.updated_at = now

        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=str(row.case_id),
            operator=user,
            action_module="ASSET_PRESERVATION",
            action_type="UPDATE",
            action_detail=f"解除资产保全: {row.asset_name}",
            target_record_id=req.preservation_id,
            before_data={"status": PreservationStatus.ACTIVE.value},
            after_data={"status": PreservationStatus.RELEASED.value, "release_date": str(req.release_date)},
        )

    return ReleasePreservationResponse(
        preservation_id=req.preservation_id,
        status=PreservationStatus.RELEASED.value,
        effective_status=PreservationStatus.RELEASED.value,
        released_at=req.release_date,
        updated_at=now,
    )


# ---------------------------------------------------------------------------
# 6. realize_preservation
# ---------------------------------------------------------------------------

async def realize_preservation(
    session: AsyncSession,
    tenant_id: str,
    user: SysUser,
    req: RealizePreservationRequest,
) -> RealizePreservationResponse:
    row = await _get_preservation_or_404(session, req.preservation_id, tenant_id)
    await _assert_case_not_archived(session, str(row.case_id), tenant_id)
    await _assert_write_permission(session, str(row.case_id), tenant_id, user)

    if row.status != PreservationStatus.ACTIVE.value:
        raise BusinessException(4100, "资产保全已解除/变现，不可再操作")

    now = datetime.now(timezone.utc)
    tx_id = f"tx_{uuid.uuid4().hex[:16]}"

    tx_cm = session.begin_nested() if session.in_transaction() else session.begin()
    async with tx_cm:
        # 更新保全记录
        prev_status = row.status
        row.status = PreservationStatus.REALIZED.value
        row.realized_value = req.realized_value
        row.updated_by = user.id
        row.updated_at = now

        # D4=B: 同事务创建 RECOVERY financial_transaction (Q11 字段映射)
        tx = FinancialTransaction(
            id=tx_id,
            tenant_id=tenant_id,
            case_id=str(row.case_id),
            transaction_type="RECOVERY",
            fund_direction=FundDirection.IN.value,
            amount=req.realized_value,
            currency=row.currency or "CNY",
            transaction_status=TransactionStatus.PENDING.value,
            transaction_date=req.realize_date,
            description=req.remarks or f"资产保全变现: {row.asset_name}",
            extended_data={"preservation_id": req.preservation_id},
            created_by=user.id,
            updated_by=user.id,
        )
        session.add(tx)

        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=str(row.case_id),
            operator=user,
            action_module="ASSET_PRESERVATION",
            action_type="UPDATE",
            action_detail=f"标记资产保全变现: {row.asset_name}, 变现金额={req.realized_value}",
            target_record_id=req.preservation_id,
            before_data={"status": prev_status},
            after_data={"status": PreservationStatus.REALIZED.value, "realized_value": str(req.realized_value), "recovery_transaction_id": tx_id},
        )

    recovery_rate: float | None = None
    if row.estimated_value and row.estimated_value > 0:
        recovery_rate = float(req.realized_value / row.estimated_value)

    return RealizePreservationResponse(
        preservation_id=req.preservation_id,
        status=PreservationStatus.REALIZED.value,
        effective_status=PreservationStatus.REALIZED.value,
        estimated_value=row.estimated_value,
        realized_value=req.realized_value,
        recovery_rate=recovery_rate,
        recovery_transaction_id=tx_id,
        updated_at=now,
    )


# ---------------------------------------------------------------------------
# 7. expiry_alerts
# ---------------------------------------------------------------------------

async def expiry_alerts(
    session: AsyncSession,
    tenant_id: str,
    user: SysUser,
    req: ExpiryAlertsRequest,
) -> ExpiryAlertsResponse:
    is_admin = is_global_admin(user, _ADMIN_ROLES)

    # 构建 case_id 范围 (与 list 逻辑一致)
    conditions = [
        AssetPreservation.tenant_id == tenant_id,
        AssetPreservation.status == PreservationStatus.ACTIVE.value,
        AssetPreservation.is_deleted == False,
    ]
    if req.case_id:
        if not is_admin:
            await _assert_read_permission(session, req.case_id, tenant_id, user)
        conditions.append(AssetPreservation.case_id == req.case_id)
    elif not is_admin:
        my_cases = await session.execute(
            select(CaseMember.case_id).where(
                CaseMember.user_id == user.id,
                CaseMember.tenant_id == tenant_id,
                CaseMember.status == "ACTIVE",
                CaseMember.is_deleted == False,
            )
        )
        my_case_ids = [str(r.case_id) for r in my_cases]
        if not my_case_ids:
            empty_summary = AlertSummary(overdue_count=0, expiring_7d_count=0, expiring_30d_count=0)
            return ExpiryAlertsResponse(summary=empty_summary, total=0, page=req.pagination.page, size=req.pagination.size, items=[])
        conditions.append(AssetPreservation.case_id.in_(my_case_ids))

    all_active = list((await session.execute(select(AssetPreservation).where(*conditions))).scalars())
    today = _today()

    # D5: summary 固定统计 7d/30d (不随 days_threshold 变化)
    overdue = [r for r in all_active if r.expire_date < today]
    expiring_7d = [r for r in all_active if 0 <= _days_until_expiry(r.expire_date) <= _ALERT_7D]
    expiring_30d = [r for r in all_active if 0 <= _days_until_expiry(r.expire_date) <= _ALERT_30D]
    at_risk = overdue + expiring_30d
    total_value = sum((r.estimated_value or Decimal(0)) for r in at_risk) or None

    summary = AlertSummary(
        overdue_count=len(overdue),
        expiring_7d_count=len(expiring_7d),
        expiring_30d_count=len(expiring_30d),
        total_at_risk_value=total_value,
    )

    # items: 仅含 days_until_expiry <= days_threshold 或已过期
    at_risk_items = [r for r in all_active if _days_until_expiry(r.expire_date) <= req.days_threshold]
    at_risk_items.sort(key=lambda r: r.expire_date)  # 最紧急在前

    total = len(at_risk_items)
    offset = (req.pagination.page - 1) * req.pagination.size
    page_rows = at_risk_items[offset: offset + req.pagination.size]

    case_ids = list({str(r.case_id) for r in page_rows})
    party_ids = [str(r.owner_party_id) for r in page_rows]
    case_map = await _fetch_case_info_map(session, tenant_id, case_ids)

    items = []
    for r in page_rows:
        days = _days_until_expiry(r.expire_date)
        eff = _compute_effective_status(r)
        ci = case_map.get(str(r.case_id), {})
        items.append(ExpiryAlertItem(
            id=str(r.id),
            case_id=str(r.case_id),
            internal_case_no=ci.get("internal_case_no"),
            case_name=ci.get("case_name"),
            asset_type=r.asset_type,
            asset_type_name=label_of(AssetType(r.asset_type)),
            asset_name=r.asset_name,
            preservation_type=r.preservation_type,
            preservation_type_name=label_of(PreservationType(r.preservation_type)),
            effective_status=eff,
            effective_status_name=label_of(PreservationStatus(eff)),
            expire_date=r.expire_date,
            days_until_expiry=days,
            estimated_value=r.estimated_value,
            currency=r.currency or "CNY",
            is_overdue=(days < 0),
            alert_level=_alert_level(days),
        ))

    return ExpiryAlertsResponse(
        summary=summary,
        total=total,
        page=req.pagination.page,
        size=req.pagination.size,
        items=items,
    )
