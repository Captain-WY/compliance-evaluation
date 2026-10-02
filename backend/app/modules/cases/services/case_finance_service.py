"""案件详情 - 财务 Tab Service (切片 2.S6).

实现 6 个 BFF 方法: snapshot / update / provisions_add / provisions_history /
spend_record / spend_list.

设计约束 (对齐 docs/design/v1/api/02_case_center/05_case_detail_finance_api_plan.md):
    1. 单向调用链: BFF -> 本 Service -> Model; 不在路由层写查询
    2. 显式事务: 所有写方法用 `async with session.begin():`
    3. 悲观锁 (D1=A): spend/record 对 business_line_budgets 加 `with_for_update()`
    4. 软删 + 审计字段: 统一 `is_deleted=False` 过滤
    5. 业务异常: `BusinessException(4002)` 预算不足 / `BusinessException(4003)` 权限不足
    6. 全异步 + Type Hints

权限 (D4'-1):
    - 读端点 (snapshot/history/list) 需 `can_view_finance`
    - 写端点 (update/provisions_add/spend_record) 需 `can_edit_base_info` (+ 隐式 can_view_finance)

审计 (FINANCE 模块, 使用现有 ALLOWED_ACTION_TYPES = {CREATE, UPDATE, ...}):
    - snapshot / history / list: 无审计 (纯读)
    - update: FINANCE.UPDATE (action_detail="财务字段更新: {fields}")
    - provisions_add: FINANCE.CREATE (action_detail 区分 PROVISION/ADJUSTMENT/REVERSAL)
    - spend_record: FINANCE.CREATE (action_detail="费用登记: {type}/{amount}")
"""
from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.exceptions import BusinessException, NotFoundException, ValidationException
from ..enums import (
    CurrencyCode,
    FundDirection,
    LiabilityActionType,
    LiabilityApprovalStatus,
    RiskProbability,
    TransactionStatus,
    label_of,
)
from ..models.business_line_budgets import BusinessLineBudget
from ..models.case_budgets import CaseBudget
from ..models.cases import Case
from ..models.estimated_liabilities import EstimatedLiability
from ..models.financial_transactions import FinancialTransaction
from ..models.sys_users import SysUser
from ..schemas.case_finance import (
    ClaimsSnapshot,
    FinancePagination,
    FinanceSnapshotRequest,
    FinanceSnapshotResponse,
    FinanceUpdateRequest,
    FinanceUpdateResponse,
    JudgmentsSnapshot,
    LegalFeesSnapshot,
    ProvisionAddRequest,
    ProvisionAddResponse,
    ProvisionHistoryRequest,
    ProvisionHistoryResponse,
    ProvisionVO,
    ProvisionsSnapshot,
    RecoveriesSnapshot,
    SpendListRequest,
    SpendListResponse,
    SpendRecordRequest,
    SpendRecordResponse,
    SpendTransactionVO,
)
from .audit_log_service import write_audit_log
from .case_detail_ext_service import _compute_permissions


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


async def _require_finance_read(
    session: AsyncSession, tenant_id: str, case_id: str, user: SysUser
) -> Case:
    """读权限: can_view_finance (D4'-1)."""
    case = await _load_case_or_404(session, tenant_id, case_id)
    perms = await _compute_permissions(session, tenant_id, case_id, user.id, case=case)
    if not perms.can_view_finance:
        raise BusinessException(code=4013, message="无权查看该案件财务数据 (缺少 can_view_finance)")
    return case


async def _require_finance_write(
    session: AsyncSession, tenant_id: str, case_id: str, user: SysUser
) -> Case:
    """写权限: can_edit_base_info + 隐式 can_view_finance (D4'-1)."""
    case = await _load_case_or_404(session, tenant_id, case_id)
    perms = await _compute_permissions(session, tenant_id, case_id, user.id, case=case)
    if not perms.can_view_finance:
        raise BusinessException(code=4013, message="无权查看该案件财务数据 (缺少 can_view_finance)")
    if not perms.can_edit_base_info:
        raise BusinessException(code=4013, message="无权修改该案件财务数据 (缺少 can_edit_base_info)")
    return case


def _case_status_warnings(case: Case) -> list[str]:
    """D6=B 警告式: CLOSED / ARCHIVED 状态附警告, 不硬拒."""
    warnings: list[str] = []
    status = (case.case_status or "").upper()
    if status == "CLOSED":
        warnings.append("case_status=CLOSED, 写操作已留痕; 请确认为必要补录")
    return warnings


def _provision_to_vo(row: EstimatedLiability) -> ProvisionVO:
    """EstimatedLiability -> ProvisionVO + Enum label 翻译."""
    return ProvisionVO(
        id=row.id,
        case_id=row.case_id,
        action_type=LiabilityActionType(row.action_type),
        action_type_name=label_of(row.action_type, LiabilityActionType),
        previous_amount=Decimal(row.previous_amount or 0),
        adjustment_amount=Decimal(row.adjustment_amount),
        current_amount=Decimal(row.current_amount),
        currency=CurrencyCode(row.currency or "CNY"),
        currency_name=label_of(row.currency or "CNY", CurrencyCode),
        assessment_date=row.assessment_date,
        risk_probability=RiskProbability(row.risk_probability),
        risk_probability_name=label_of(row.risk_probability, RiskProbability),
        basis_of_estimate=row.basis_of_estimate,
        attachment_ids=list(row.attachment_ids) if row.attachment_ids else [],
        approval_status=LiabilityApprovalStatus(row.approval_status or "PENDING"),
        approval_status_name=label_of(row.approval_status or "PENDING", LiabilityApprovalStatus),
        approved_by=row.approved_by,
        approved_at=row.approved_at,
        created_at=row.created_at,
    )


def _spend_tx_to_vo(row: FinancialTransaction) -> SpendTransactionVO:
    """FinancialTransaction -> SpendTransactionVO + Enum label 翻译."""
    return SpendTransactionVO(
        id=row.id,
        case_id=row.case_id,
        transaction_type=row.transaction_type,
        transaction_type_name=None,  # 字典, 本切片不做在线翻译
        fund_direction=FundDirection(row.fund_direction),
        fund_direction_name=label_of(row.fund_direction, FundDirection),
        amount=Decimal(row.amount),
        currency=CurrencyCode(row.currency or "CNY"),
        currency_name=label_of(row.currency or "CNY", CurrencyCode),
        transaction_status=TransactionStatus(row.transaction_status or "PENDING"),
        transaction_status_name=label_of(row.transaction_status or "PENDING", TransactionStatus),
        apply_date=row.apply_date,
        transaction_date=row.transaction_date,
        counterparty_name=row.counterparty_name,
        voucher_no=row.voucher_no,
        description=row.description,
        process_node_id=row.process_node_id,
        associated_party_id=row.associated_party_id,
        created_at=row.created_at,
    )


# =============================================================================
# 1. /finance/snapshot
# =============================================================================


async def snapshot(
    session: AsyncSession,
    tenant_id: str,
    payload: FinanceSnapshotRequest,
    user: SysUser,
) -> FinanceSnapshotResponse:
    case = await _require_finance_read(session, tenant_id, payload.case_id, user)

    # Claims: 主诉请 = cases.target_amount
    claims = ClaimsSnapshot(
        our_claim_amount=Decimal(case.target_amount or 0),
        counter_claim_amount=Decimal(0),  # 反诉暂不拆分字段, 留 v2
        currency=CurrencyCode.CNY,
    )

    # Judgments: 从 extended_data.judgment 读取 (如存在)
    ed = case.extended_data or {}
    j = (ed.get("judgment") or {}) if isinstance(ed, dict) else {}
    def _d(v: Any) -> Decimal | None:
        if v is None:
            return None
        try:
            return Decimal(str(v))
        except (ValueError, TypeError):
            return None

    judgments = JudgmentsSnapshot(
        first_instance_amount=_d(j.get("first_instance_amount")),
        second_instance_amount=_d(j.get("second_instance_amount")),
        final_amount=_d(j.get("final_amount") or j.get("amount")),
        principal=_d(j.get("principal")),
        interest=_d(j.get("interest")),
        penalty=_d(j.get("penalty")),
    )

    # Recoveries: sum(amount) where fund_direction=IN AND status=EXECUTED
    recovered_stmt = select(func.coalesce(func.sum(FinancialTransaction.amount), 0)).where(
        and_(
            FinancialTransaction.case_id == payload.case_id,
            FinancialTransaction.tenant_id == tenant_id,
            FinancialTransaction.is_deleted.is_(False),
            FinancialTransaction.fund_direction == FundDirection.IN.value,
            FinancialTransaction.transaction_status == TransactionStatus.EXECUTED.value,
        )
    )
    recovered = Decimal((await session.execute(recovered_stmt)).scalar_one() or 0)
    final_amount = judgments.final_amount or Decimal(0)
    recovery_rate = (
        float(recovered / final_amount) if final_amount and final_amount > 0 else 0.0
    )
    recovery_rate = max(0.0, min(1.0, recovery_rate))
    recoveries = RecoveriesSnapshot(recovered_amount=recovered, recovery_rate=recovery_rate)

    # Provisions: 取最近一条 provision 行
    prov_stmt = (
        select(EstimatedLiability)
        .where(
            and_(
                EstimatedLiability.case_id == payload.case_id,
                EstimatedLiability.tenant_id == tenant_id,
                EstimatedLiability.is_deleted.is_(False),
            )
        )
        .order_by(EstimatedLiability.created_at.desc(), EstimatedLiability.id.desc())
        .limit(1)
    )
    latest_prov = (await session.execute(prov_stmt)).scalar_one_or_none()
    if latest_prov is not None:
        provisions = ProvisionsSnapshot(
            current_amount=Decimal(latest_prov.current_amount or 0),
            approval_status=LiabilityApprovalStatus(latest_prov.approval_status or "PENDING"),
            approval_status_name=label_of(
                latest_prov.approval_status or "PENDING", LiabilityApprovalStatus
            ),
            last_provision_date=latest_prov.assessment_date,
        )
    else:
        provisions = ProvisionsSnapshot(current_amount=Decimal(0))

    # Legal fees: case_budgets.total_budget + agg financial_transactions OUT
    budget_stmt = select(CaseBudget).where(
        and_(
            CaseBudget.case_id == payload.case_id,
            CaseBudget.tenant_id == tenant_id,
            CaseBudget.is_deleted.is_(False),
        )
    ).limit(1)
    budget_row = (await session.execute(budget_stmt)).scalar_one_or_none()
    budget_amount = Decimal(budget_row.total_budget) if budget_row else Decimal(0)

    paid_stmt = select(func.coalesce(func.sum(FinancialTransaction.amount), 0)).where(
        and_(
            FinancialTransaction.case_id == payload.case_id,
            FinancialTransaction.tenant_id == tenant_id,
            FinancialTransaction.is_deleted.is_(False),
            FinancialTransaction.fund_direction == FundDirection.OUT.value,
            FinancialTransaction.transaction_status == TransactionStatus.EXECUTED.value,
        )
    )
    paid_amount = Decimal((await session.execute(paid_stmt)).scalar_one() or 0)

    pending_stmt = select(func.coalesce(func.sum(FinancialTransaction.amount), 0)).where(
        and_(
            FinancialTransaction.case_id == payload.case_id,
            FinancialTransaction.tenant_id == tenant_id,
            FinancialTransaction.is_deleted.is_(False),
            FinancialTransaction.fund_direction == FundDirection.OUT.value,
            FinancialTransaction.transaction_status.in_(
                (TransactionStatus.PENDING.value, TransactionStatus.APPROVED.value)
            ),
        )
    )
    pending_amount = Decimal((await session.execute(pending_stmt)).scalar_one() or 0)

    legal_fees = LegalFeesSnapshot(
        budget_amount=budget_amount,
        paid_amount=paid_amount,
        pending_amount=pending_amount,
        currency=CurrencyCode.CNY,
        currency_name="人民币",
    )

    return FinanceSnapshotResponse(
        case_id=payload.case_id,
        claims=claims,
        judgments=judgments,
        recoveries=recoveries,
        provisions=provisions,
        legal_fees=legal_fees,
        warnings=_case_status_warnings(case),
    )


# =============================================================================
# 2. /finance/update
# =============================================================================


async def update_finance(
    session: AsyncSession,
    tenant_id: str,
    payload: FinanceUpdateRequest,
    user: SysUser,
) -> FinanceUpdateResponse:
    patch = payload.fields.model_dump(exclude_unset=True)
    if not patch:
        raise ValidationException("至少提供一个要更新的字段")

    updated: list[str] = []
    async with session.begin():
        case = await _require_finance_write(session, tenant_id, payload.case_id, user)

        before: dict[str, Any] = {}
        after: dict[str, Any] = {}

        # target_amount / provision_amount: 直写 cases 列
        for col in ("target_amount", "provision_amount"):
            if col in patch:
                before[col] = (
                    str(getattr(case, col)) if getattr(case, col) is not None else None
                )
                new_val = patch[col]
                setattr(case, col, new_val)
                after[col] = str(new_val) if new_val is not None else None
                updated.append(col)

        # judgment 相关 → extended_data.judgment.*
        jkeys = (
            "judgment_amount",
            "judgment_principal",
            "judgment_interest",
            "judgment_penalty",
            "judgment_date",
        )
        if any(k in patch for k in jkeys) or "notes" in patch:
            ed = dict(case.extended_data) if isinstance(case.extended_data, dict) else {}
            j_before = dict(ed.get("judgment") or {})
            j = dict(j_before)
            for k in jkeys:
                if k in patch:
                    v = patch[k]
                    short_k = k.replace("judgment_", "")  # amount/principal/...
                    if isinstance(v, Decimal):
                        v = str(v)
                    elif isinstance(v, date):
                        v = v.isoformat()
                    j[short_k] = v
                    updated.append(k)
            ed["judgment"] = j

            if "notes" in patch:
                ed["finance_notes"] = patch["notes"]
                updated.append("notes")

            if j != j_before:
                before["extended_data.judgment"] = j_before
                after["extended_data.judgment"] = j
            case.extended_data = ed

        case.updated_by = user.id
        await session.flush()

        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=payload.case_id,
            operator=user,
            action_module="FINANCE",
            action_type="UPDATE",
            action_detail=f"更新财务字段 {sorted(updated)}",
            target_record_id=payload.case_id,
            before_data=before or None,
            after_data=after or None,
        )

    return FinanceUpdateResponse(
        case_id=payload.case_id,
        updated_fields=updated,
        warnings=_case_status_warnings(case),
    )


# =============================================================================
# 3. /finance/provisions/add
# =============================================================================


async def add_provision(
    session: AsyncSession,
    tenant_id: str,
    payload: ProvisionAddRequest,
    user: SysUser,
) -> ProvisionAddResponse:
    async with session.begin():
        case = await _require_finance_write(session, tenant_id, payload.case_id, user)

        # 读取上一条 provision 以计算 previous_amount (同案件, 按 created_at+id DESC)
        last_stmt = (
            select(EstimatedLiability)
            .where(
                and_(
                    EstimatedLiability.case_id == payload.case_id,
                    EstimatedLiability.tenant_id == tenant_id,
                    EstimatedLiability.is_deleted.is_(False),
                )
            )
            .order_by(
                EstimatedLiability.created_at.desc(),
                EstimatedLiability.id.desc(),
            )
            .limit(1)
        )
        last = (await session.execute(last_stmt)).scalar_one_or_none()
        previous_amount = Decimal(last.current_amount or 0) if last else Decimal(0)

        # 按 action_type 计算 current_amount + adjustment_amount
        if payload.action_type == LiabilityActionType.REVERSAL:
            # 冲销: 强制 current=0; adjustment=-previous (覆盖用户输入, 更精确)
            current_amount = Decimal(0)
            adjustment_amount = -previous_amount
        else:
            # PROVISION / ADJUSTMENT
            current_amount = previous_amount + Decimal(payload.adjustment_amount)
            adjustment_amount = Decimal(payload.adjustment_amount)

        new_row = EstimatedLiability(
            id=f"prov_{uuid.uuid4().hex[:12]}",
            tenant_id=tenant_id,
            case_id=payload.case_id,
            action_type=payload.action_type.value,
            previous_amount=previous_amount,
            adjustment_amount=adjustment_amount,
            current_amount=current_amount,
            currency=payload.currency.value,
            assessment_date=payload.assessment_date,
            risk_probability=payload.risk_probability.value,
            basis_of_estimate=payload.basis_of_estimate,
            attachment_ids=payload.attachment_ids or None,
            approval_status=LiabilityApprovalStatus.PENDING.value,
            created_by=user.id,
            updated_by=user.id,
        )
        session.add(new_row)
        await session.flush()

        # 同步更新 cases.provision_amount 冗余字段
        case.provision_amount = current_amount
        case.updated_by = user.id

        # 审计: FINANCE.CREATE (action_detail 区分 3 种)
        action_detail_map = {
            LiabilityActionType.PROVISION: f"首次/独立计提 {adjustment_amount} {payload.currency.value}",
            LiabilityActionType.ADJUSTMENT: f"计提调整 Δ={adjustment_amount} {payload.currency.value}",
            LiabilityActionType.REVERSAL: f"计提冲销 -> 0 (prev={previous_amount})",
        }
        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=payload.case_id,
            operator=user,
            action_module="FINANCE",
            action_type="CREATE",
            action_detail=action_detail_map[payload.action_type],
            target_record_id=new_row.id,
            before_data=None,
            after_data={
                "action_type": new_row.action_type,
                "previous_amount": str(previous_amount),
                "adjustment_amount": str(adjustment_amount),
                "current_amount": str(current_amount),
                "currency": new_row.currency,
                "risk_probability": new_row.risk_probability,
            },
        )

        await session.refresh(new_row)

    return ProvisionAddResponse(
        provision=_provision_to_vo(new_row),
        warnings=_case_status_warnings(case),
    )


# =============================================================================
# 4. /finance/provisions/history
# =============================================================================


async def provisions_history(
    session: AsyncSession,
    tenant_id: str,
    payload: ProvisionHistoryRequest,
    user: SysUser,
) -> ProvisionHistoryResponse:
    await _require_finance_read(session, tenant_id, payload.case_id, user)

    pg = payload.pagination or FinancePagination()
    offset = (pg.page - 1) * pg.size

    count_stmt = select(func.count(EstimatedLiability.id)).where(
        and_(
            EstimatedLiability.case_id == payload.case_id,
            EstimatedLiability.tenant_id == tenant_id,
            EstimatedLiability.is_deleted.is_(False),
        )
    )
    total = int((await session.execute(count_stmt)).scalar_one() or 0)

    stmt = (
        select(EstimatedLiability)
        .where(
            and_(
                EstimatedLiability.case_id == payload.case_id,
                EstimatedLiability.tenant_id == tenant_id,
                EstimatedLiability.is_deleted.is_(False),
            )
        )
        .order_by(
            EstimatedLiability.assessment_date.desc(),
            EstimatedLiability.created_at.desc(),
            EstimatedLiability.id.desc(),
        )
        .limit(pg.size)
        .offset(offset)
    )
    rows = (await session.execute(stmt)).scalars().all()

    return ProvisionHistoryResponse(
        case_id=payload.case_id,
        total=total,
        page=pg.page,
        size=pg.size,
        items=[_provision_to_vo(r) for r in rows],
    )


# =============================================================================
# 5. /finance/spend/record (悲观锁 D1=A)
# =============================================================================


def _fiscal_year_from(date_val: date | None) -> str:
    d = date_val or datetime.utcnow().date()
    return str(d.year)


async def spend_record(
    session: AsyncSession,
    tenant_id: str,
    payload: SpendRecordRequest,
    user: SysUser,
) -> SpendRecordResponse:
    warnings: list[str] = []
    async with session.begin():
        case = await _require_finance_write(session, tenant_id, payload.case_id, user)
        warnings.extend(_case_status_warnings(case))

        # D1=A 悲观锁: 锁 business_line_budgets 行 (若存在)
        bl_budget_row: BusinessLineBudget | None = None
        if case.business_line:
            fy = _fiscal_year_from(payload.apply_date)
            lock_stmt = (
                select(BusinessLineBudget)
                .where(
                    and_(
                        BusinessLineBudget.business_line == case.business_line,
                        BusinessLineBudget.fiscal_year == fy,
                        BusinessLineBudget.tenant_id == tenant_id,
                        BusinessLineBudget.is_deleted.is_(False),
                    )
                )
                .with_for_update()
            )
            bl_budget_row = (await session.execute(lock_stmt)).scalar_one_or_none()

        # 预算校验
        if bl_budget_row is not None:
            used_stmt = select(
                func.coalesce(func.sum(FinancialTransaction.amount), 0)
            ).where(
                and_(
                    FinancialTransaction.tenant_id == tenant_id,
                    FinancialTransaction.is_deleted.is_(False),
                    FinancialTransaction.fund_direction == FundDirection.OUT.value,
                    FinancialTransaction.transaction_status.in_(
                        (
                            TransactionStatus.PENDING.value,
                            TransactionStatus.APPROVED.value,
                            TransactionStatus.EXECUTED.value,
                        )
                    ),
                    FinancialTransaction.case_id.in_(
                        select(Case.id).where(
                            and_(
                                Case.business_line == bl_budget_row.business_line,
                                Case.tenant_id == tenant_id,
                                Case.is_deleted.is_(False),
                            )
                        )
                    ),
                )
            )
            current_used = Decimal(
                (await session.execute(used_stmt)).scalar_one() or 0
            )
            remaining = Decimal(bl_budget_row.total_budget) - current_used
            if remaining < payload.amount:
                raise BusinessException(
                    code=4002,
                    message=(
                        f"业务线预算不足 (剩余 {remaining} / 需 {payload.amount}), "
                        f"请联系财务扩展预算"
                    ),
                )
            budget_used = current_used + payload.amount
            budget_remaining = remaining - payload.amount
        else:
            if case.business_line:
                warnings.append(
                    f"business_line={case.business_line} {_fiscal_year_from(payload.apply_date)} "
                    f"未配置业务线预算, 本次登记已留痕但未做预算控制"
                )
            budget_used = Decimal(0)
            budget_remaining = Decimal(0)

        tx = FinancialTransaction(
            id=f"tx_{uuid.uuid4().hex[:12]}",
            tenant_id=tenant_id,
            case_id=payload.case_id,
            process_node_id=payload.process_node_id,
            associated_party_id=payload.associated_party_id,
            transaction_type=payload.transaction_type,
            fund_direction=FundDirection.OUT.value,
            amount=payload.amount,
            currency=payload.currency.value,
            transaction_status=TransactionStatus.PENDING.value,
            apply_date=payload.apply_date,
            transaction_date=None,
            counterparty_name=payload.counterparty_name,
            voucher_no=payload.voucher_no,
            description=payload.description,
            created_by=user.id,
            updated_by=user.id,
        )
        session.add(tx)
        await session.flush()

        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=payload.case_id,
            operator=user,
            action_module="FINANCE",
            action_type="CREATE",
            action_detail=(
                f"费用登记: {payload.transaction_type} "
                f"{payload.amount} {payload.currency.value} "
                f"-> {payload.counterparty_name or '-'}"
            ),
            target_record_id=tx.id,
            before_data=None,
            after_data={
                "transaction_type": tx.transaction_type,
                "amount": str(tx.amount),
                "currency": tx.currency,
                "fund_direction": tx.fund_direction,
                "transaction_status": tx.transaction_status,
                "counterparty_name": tx.counterparty_name,
            },
        )

        await session.refresh(tx)

    return SpendRecordResponse(
        transaction=_spend_tx_to_vo(tx),
        budget_used=budget_used,
        budget_remaining=budget_remaining,
        warnings=warnings,
    )


# =============================================================================
# 6. /finance/spend/list
# =============================================================================


async def spend_list(
    session: AsyncSession,
    tenant_id: str,
    payload: SpendListRequest,
    user: SysUser,
) -> SpendListResponse:
    await _require_finance_read(session, tenant_id, payload.case_id, user)

    pg = payload.pagination or FinancePagination()
    offset = (pg.page - 1) * pg.size

    base_where = [
        FinancialTransaction.case_id == payload.case_id,
        FinancialTransaction.tenant_id == tenant_id,
        FinancialTransaction.is_deleted.is_(False),
        FinancialTransaction.fund_direction == FundDirection.OUT.value,
    ]
    if payload.transaction_type:
        base_where.append(FinancialTransaction.transaction_type == payload.transaction_type)
    if payload.transaction_status:
        base_where.append(
            FinancialTransaction.transaction_status == payload.transaction_status.value
        )

    count_stmt = select(func.count(FinancialTransaction.id)).where(and_(*base_where))
    total = int((await session.execute(count_stmt)).scalar_one() or 0)

    stmt = (
        select(FinancialTransaction)
        .where(and_(*base_where))
        .order_by(
            FinancialTransaction.apply_date.desc().nullslast(),
            FinancialTransaction.created_at.desc(),
            FinancialTransaction.id.desc(),
        )
        .limit(pg.size)
        .offset(offset)
    )
    rows = (await session.execute(stmt)).scalars().all()

    # 分子聚合 (不受 status 筛选影响, 只过 OUT)
    agg_stmt = select(
        FinancialTransaction.transaction_status,
        func.coalesce(func.sum(FinancialTransaction.amount), 0),
    ).where(
        and_(
            FinancialTransaction.case_id == payload.case_id,
            FinancialTransaction.tenant_id == tenant_id,
            FinancialTransaction.is_deleted.is_(False),
            FinancialTransaction.fund_direction == FundDirection.OUT.value,
        )
    ).group_by(FinancialTransaction.transaction_status)
    agg_rows = (await session.execute(agg_stmt)).all()
    total_executed = Decimal(0)
    total_pending = Decimal(0)
    for st, amt in agg_rows:
        amt_d = Decimal(amt or 0)
        if st == TransactionStatus.EXECUTED.value:
            total_executed += amt_d
        elif st in (
            TransactionStatus.PENDING.value,
            TransactionStatus.APPROVED.value,
        ):
            total_pending += amt_d

    return SpendListResponse(
        case_id=payload.case_id,
        total=total,
        page=pg.page,
        size=pg.size,
        items=[_spend_tx_to_vo(r) for r in rows],
        total_out_executed=total_executed,
        total_out_pending=total_pending,
    )
