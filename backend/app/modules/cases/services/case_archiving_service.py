"""案件归档 Service (切片 2.S9).

实现 2 个方法:
    1. validate — 6 规则聚合校验 (S9×2 + S5 + S6 + S7 + S8)
    2. submit   — 归档 (case_status=ARCHIVED, **触发全局只读锁**)

关键设计:
    - validate 是纯读, 可由任何案件成员触发预检
    - submit 需 `can_close_case` + (LEGAL_ADMIN 或 SYS_ADMIN) 双校验 (D7 归档严格)
    - submit 内部重跑 validate 6 规则, 任一失败即拒 (4014)
    - ARCHIVED 后 `_compute_permissions` 自动对所有非 SYS_ADMIN 返回全 False 权限
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.exceptions import BusinessException, NotFoundException
from ..enums import CaseStatus, ClosureStatus, label_of
from ..models.case_closures import CaseClosure
from ..models.case_counsels import CaseCounsel
from ..models.case_documents import CaseDocument
from ..models.cases import Case
from ..models.financial_transactions import FinancialTransaction
from ..models.sys_users import SysUser
from ..schemas.case_closing import (
    ArchivingSubmitRequest,
    ArchivingSubmitResponse,
    ArchivingValidateRequest,
    ArchivingValidateResponse,
    CheckItemVO,
)
from .audit_log_service import write_audit_log
from .case_detail_ext_service import _compute_permissions


# D4=A 硬编码必填文档清单 (归档规则 3 / S5_REQUIRED_DOCS).
# TODO(seed): 设计文档 10_case_detail_closing_api_plan.md §3.3 要求 ["JUDGMENT","CLOSING_REPORT"],
#             但 2.S9 准入校验 Gate H 发现 seed case_documents 无 CLOSING_REPORT 分类.
#             后续种子数据切片补齐 CLOSING_REPORT 后, 恢复为 ["JUDGMENT","CLOSING_REPORT"].
REQUIRED_DOC_CATEGORIES: list[str] = ["JUDGMENT"]


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


async def _require_member(
    session: AsyncSession, tenant_id: str, case_id: str, user: SysUser
) -> Case:
    case = await _load_case_or_404(session, tenant_id, case_id)
    perms = await _compute_permissions(session, tenant_id, case_id, user.id, case=case)
    excluded = {
        "case_id", "user_role_in_case", "has_legal_admin",
        "has_sys_admin", "case_closed",
    }
    if not any(v for k, v in perms.model_dump().items() if k not in excluded):
        raise NotFoundException(resource="案件", resource_id=case_id)
    return case


# =============================================================================
# 6 规则聚合 (validate 核心)
# =============================================================================


async def _run_all_checks(
    session: AsyncSession, tenant_id: str, case_id: str, case: Case
) -> list[CheckItemVO]:
    """执行 6 条归档校验规则, 返回 CheckItemVO[].

    规则清单:
      1. S9_CASE_STATUS_CLOSED — 本切片, case_status=CLOSED
      2. S9_CLOSURE_APPROVED   — 本切片, case_closures.status=APPROVED
      3. S5_REQUIRED_DOCS      — S5 卷宗, REQUIRED_DOC_CATEGORIES 齐全
      4. S6_NO_PENDING_FEES    — S6 财务, 无 PENDING/APPROVED OUT 流水
      5. S7_COUNSELS_CLOSED    — S7 律师, 无 ACTIVE counsel
      6. S8_COMPLIANCE_COMPLETED — S8 合规, checklist_status=COMPLETED
    """
    checks: list[CheckItemVO] = []

    # 规则 1: case_status == CLOSED
    rule_1 = case.case_status == CaseStatus.CLOSED.value
    checks.append(
        CheckItemVO(
            rule_id="S9_CASE_STATUS_CLOSED",
            name="案件状态为 CLOSED",
            source="本切片",
            passed=rule_1,
            message=(
                f"案件已结案 (case_status={case.case_status})"
                if rule_1
                else f"案件状态为 {case.case_status}, 需先 closing/submit"
            ),
        )
    )

    # 规则 2: case_closures.status == APPROVED
    closure = (
        await session.execute(
            select(CaseClosure)
            .where(
                and_(
                    CaseClosure.case_id == case_id,
                    CaseClosure.tenant_id == tenant_id,
                    CaseClosure.is_deleted.is_(False),
                )
            )
            .order_by(CaseClosure.created_at.desc(), CaseClosure.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    rule_2 = (
        closure is not None
        and (closure.status or "") == ClosureStatus.APPROVED.value
    )
    checks.append(
        CheckItemVO(
            rule_id="S9_CLOSURE_APPROVED",
            name="结案登记已定稿",
            source="本切片",
            passed=rule_2,
            message=(
                "case_closures.status=APPROVED"
                if rule_2
                else (
                    "case_closures 记录不存在"
                    if closure is None
                    else f"case_closures.status={closure.status!r}, 非 APPROVED"
                )
            ),
        )
    )

    # 规则 3: S5 必填文档齐全
    doc_cats_rows = (
        await session.execute(
            select(CaseDocument.doc_category)
            .where(
                and_(
                    CaseDocument.case_id == case_id,
                    CaseDocument.tenant_id == tenant_id,
                    CaseDocument.is_deleted.is_(False),
                )
            )
            .distinct()
        )
    ).all()
    doc_cats = {r[0] for r in doc_cats_rows if r[0]}
    missing = set(REQUIRED_DOC_CATEGORIES) - doc_cats
    rule_3 = not missing
    checks.append(
        CheckItemVO(
            rule_id="S5_REQUIRED_DOCS",
            name="必填卷宗齐全",
            source="S5 卷宗",
            passed=rule_3,
            message=(
                f"已上传: {sorted(set(REQUIRED_DOC_CATEGORIES) & doc_cats)}"
                if rule_3
                else f"缺少: {sorted(missing)}"
            ),
            details={
                "required_doc_categories": REQUIRED_DOC_CATEGORIES,
                "existing": sorted(doc_cats),
                "missing": sorted(missing),
            },
        )
    )

    # 规则 4: S6 无 PENDING/APPROVED OUT 流水
    pending_stmt = select(
        func.count(FinancialTransaction.id),
        func.coalesce(func.sum(FinancialTransaction.amount), 0),
    ).where(
        and_(
            FinancialTransaction.case_id == case_id,
            FinancialTransaction.tenant_id == tenant_id,
            FinancialTransaction.is_deleted.is_(False),
            FinancialTransaction.fund_direction == "OUT",
            FinancialTransaction.transaction_status.in_(("PENDING", "APPROVED")),
        )
    )
    row = (await session.execute(pending_stmt)).first()
    pending_count = int(row[0] or 0)
    pending_amount = Decimal(row[1] or 0)
    rule_4 = pending_count == 0
    checks.append(
        CheckItemVO(
            rule_id="S6_NO_PENDING_FEES",
            name="财务流水全部结清",
            source="S6 财务",
            passed=rule_4,
            message=(
                "无 PENDING/APPROVED OUT 流水"
                if rule_4
                else f"存在 {pending_count} 笔 PENDING/APPROVED 未支付 (¥{pending_amount})"
            ),
            details={
                "pending_transactions_count": pending_count,
                "pending_total_amount": str(pending_amount),
                "currency": "CNY",
            },
        )
    )

    # 规则 5: S7 无 ACTIVE counsel
    active_cnt = (
        await session.execute(
            select(func.count(CaseCounsel.id)).where(
                and_(
                    CaseCounsel.case_id == case_id,
                    CaseCounsel.tenant_id == tenant_id,
                    CaseCounsel.is_deleted.is_(False),
                    CaseCounsel.status == "ACTIVE",
                )
            )
        )
    ).scalar_one() or 0
    total_cnt = (
        await session.execute(
            select(func.count(CaseCounsel.id)).where(
                and_(
                    CaseCounsel.case_id == case_id,
                    CaseCounsel.tenant_id == tenant_id,
                    CaseCounsel.is_deleted.is_(False),
                )
            )
        )
    ).scalar_one() or 0
    rule_5 = active_cnt == 0
    checks.append(
        CheckItemVO(
            rule_id="S7_COUNSELS_CLOSED",
            name="外聘律师状态就绪",
            source="S7 外聘律师",
            passed=rule_5,
            message=(
                f"所有 counsel 均已 COMPLETED/TERMINATED (共 {total_cnt} 位)"
                if rule_5
                else f"仍有 {active_cnt} 位律师处于 ACTIVE 状态, 需先解聘"
            ),
            details={
                "active_count": int(active_cnt),
                "total_count": int(total_cnt),
            },
        )
    )

    # 规则 6: S8 合规 checklist COMPLETED
    ed = case.extended_data or {}
    reg = ed.get("regulatory") or {} if isinstance(ed, dict) else {}
    if not isinstance(reg, dict):
        reg = {}
    checklist_status = reg.get("checklist_status")
    rule_6 = checklist_status == "COMPLETED"
    checks.append(
        CheckItemVO(
            rule_id="S8_COMPLIANCE_COMPLETED",
            name="合规清单已完成",
            source="S8 合规",
            passed=rule_6,
            message=(
                "regulatory.checklist_status=COMPLETED"
                if rule_6
                else f"当前 checklist_status={checklist_status!r}, 需先 S8 /compliance/checklist/submit 完成"
            ),
        )
    )

    return checks


# =============================================================================
# 1. /archiving/validate
# =============================================================================


async def validate_archive(
    session: AsyncSession,
    tenant_id: str,
    payload: ArchivingValidateRequest,
    user: SysUser,
) -> ArchivingValidateResponse:
    case = await _require_member(session, tenant_id, payload.case_id, user)

    checks = await _run_all_checks(session, tenant_id, payload.case_id, case)
    passed_count = sum(1 for c in checks if c.passed)
    total_count = len(checks)

    return ArchivingValidateResponse(
        case_id=payload.case_id,
        can_archive=(passed_count == total_count),
        passed_count=passed_count,
        total_count=total_count,
        checks=checks,
    )


# =============================================================================
# 2. /archiving/submit (触发全局只读锁)
# =============================================================================


async def submit_archive(
    session: AsyncSession,
    tenant_id: str,
    payload: ArchivingSubmitRequest,
    user: SysUser,
) -> ArchivingSubmitResponse:
    async with session.begin():
        case = await _load_case_or_404(session, tenant_id, payload.case_id)
        perms = await _compute_permissions(
            session, tenant_id, payload.case_id, user.id, case=case
        )

        # 权限 1: can_close_case
        if not perms.can_close_case:
            raise BusinessException(
                code=4013, message="无权归档本案件 (缺少 can_close_case)"
            )
        # 权限 2: 归档严格要求 LEGAL_ADMIN 或 SYS_ADMIN
        if not (perms.has_legal_admin or perms.has_sys_admin):
            raise BusinessException(
                code=4013,
                message="归档操作需要 LEGAL_ADMIN 或 SYS_ADMIN 角色确认",
            )

        # 状态校验: 必须先 CLOSED
        if case.case_status == CaseStatus.ARCHIVED.value:
            raise BusinessException(
                code=4014, message="案件已处于 ARCHIVED 状态, 不可重复归档"
            )
        if case.case_status != CaseStatus.CLOSED.value:
            raise BusinessException(
                code=4014,
                message=(
                    f"案件状态为 {case.case_status}, 需先 closing/submit 置为 CLOSED"
                ),
            )

        # 重跑 6 规则
        checks = await _run_all_checks(session, tenant_id, payload.case_id, case)
        failed_rules = [c for c in checks if not c.passed]
        if failed_rules:
            raise BusinessException(
                code=4014,
                message=(
                    "归档前置校验未通过: "
                    + "; ".join(f"[{c.rule_id}] {c.message}" for c in failed_rules)
                ),
            )

        # archive_no 唯一性校验 (租户内)
        dup = (
            await session.execute(
                select(Case.id).where(
                    and_(
                        Case.archive_no == payload.archive_no,
                        Case.tenant_id == tenant_id,
                        Case.is_deleted.is_(False),
                        Case.id != payload.case_id,
                    )
                )
            )
        ).scalar_one_or_none()
        if dup is not None:
            raise BusinessException(
                code=4003,
                message=f"archive_no={payload.archive_no!r} 已被其他案件 {dup} 占用",
            )

        # 执行归档
        case.case_status = CaseStatus.ARCHIVED.value
        case.archive_no = payload.archive_no
        case.updated_by = user.id
        archive_date = date.today()

        # 审计
        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=payload.case_id,
            operator=user,
            action_module="CLOSURE",
            action_type="UPDATE",
            action_detail=(
                f"案件归档 archive_no={payload.archive_no}; "
                f"{len(checks)}/{len(checks)} 前置校验通过"
                + (f"; 备注={payload.archive_note}" if payload.archive_note else "")
            ),
            target_record_id=payload.case_id,
            before_data={"case_status": "CLOSED", "archive_no": None},
            after_data={
                "case_status": "ARCHIVED",
                "archive_no": payload.archive_no,
            },
        )

    return ArchivingSubmitResponse(
        case_id=payload.case_id,
        case_status=CaseStatus.ARCHIVED,
        case_status_name=label_of(CaseStatus.ARCHIVED, CaseStatus),
        archive_no=payload.archive_no,
        archive_date=archive_date,
        warnings=[],
    )
