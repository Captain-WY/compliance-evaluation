"""数据治理 Service (2.S13).

端点对应:
  - POST /compliance/governance/issues/list   → list_issues()
  - POST /compliance/governance/scan          → trigger_scan() (异步, Q3=BackgroundTasks)
  - POST /compliance/governance/issues/ignore → ignore_issue()

D5 内置扫描规则 (v1.2, 4条):
  1. CLOSED_WITHOUT_CLOSURE — case_status=CLOSED 但无 case_closures 记录 (BLOCKER)
  2. DATE_REVERSED          — close_date < filing_date (BLOCKER)
  3. NEGATIVE_TRANSACTION   — financial_transactions.amount <= 0 (WARNING)
  4. ACTIVE_NO_PARTIES      — case_status=IN_PROGRESS 且 case_parties 数量=0 (WARNING)

Q3: run_scan 不接收 session 参数, 参照 S11 pattern 自建 AsyncSessionLocal().
Q6: ignore 仅允许 severity=WARNING (BLOCKER 返回 4200).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import AsyncSessionLocal
from ..core.exceptions import BusinessException, NotFoundException
from ..enums.case_enums import IssueSeverity, IssueStatus, IssueType
from ..enums.labels import label_of as get_label
from ..models.case_closures import CaseClosure
from ..models.case_parties import CaseParty
from ..models.cases import Case
from ..models.data_quality_issues import DataQualityIssue
from ..models.financial_transactions import FinancialTransaction
from ..models.sys_users import SysUser
from ..schemas.compliance_s13 import (
    IssueIgnoreRequest,
    IssueIgnoreResponse,
    IssueItem,
    IssueListRequest,
    IssueListResponse,
    ScanRequest,
    ScanResponse,
)
from .audit_log_service import write_audit_log


async def list_issues(
    session: AsyncSession,
    *,
    tenant_id: str,
    req: IssueListRequest,
) -> IssueListResponse:
    """分页获取数据质量异常记录列表."""
    base_q = (
        select(DataQualityIssue, Case.case_code)
        .join(Case, Case.id == DataQualityIssue.case_id)
        .where(
            DataQualityIssue.is_deleted == False,
            DataQualityIssue.tenant_id == tenant_id,
            Case.is_deleted == False,
        )
    )
    if req.severity:
        base_q = base_q.where(DataQualityIssue.severity == req.severity)
    if req.issueType:
        base_q = base_q.where(DataQualityIssue.issue_type == req.issueType)
    if req.status:
        base_q = base_q.where(DataQualityIssue.status == req.status)

    total: int = (
        await session.execute(select(func.count()).select_from(base_q.subquery()))
    ).scalar_one()

    offset = (req.page - 1) * req.pageSize
    rows = (await session.execute(base_q.offset(offset).limit(req.pageSize))).all()

    items = [
        IssueItem(
            issueId=str(issue.id),
            caseId=str(issue.case_id),
            caseCode=case_code,
            issueType=issue.issue_type,
            description=issue.description,
            severity=issue.severity,
            severity_name=get_label(issue.severity),
            status=issue.status,
            status_name=get_label(issue.status),
            createdAt=issue.created_at,
        )
        for issue, case_code in rows
    ]
    return IssueListResponse(total=total, page=req.page, pageSize=req.pageSize, items=items)


async def trigger_scan(
    session: AsyncSession,
    *,
    tenant_id: str,
    user: SysUser,
    req: ScanRequest,
) -> ScanResponse:
    """触发数据质量扫描 (同步返回 QUEUED, 实际扫描由 BackgroundTask 执行)."""
    if req.scope == "SPECIFIC_CASES" and not req.caseIds:
        raise BusinessException(code=4000, message="scope=SPECIFIC_CASES 时 caseIds 不能为空")

    # 估算待扫描案件数
    count_q = select(func.count(Case.id)).where(
        Case.is_deleted == False,
        Case.tenant_id == tenant_id,
    )
    if req.scope == "SPECIFIC_CASES" and req.caseIds:
        count_q = count_q.where(Case.id.in_(req.caseIds))
    else:
        count_q = count_q.where(Case.case_status.in_(["IN_PROGRESS", "CLOSED"]))

    estimated = (await session.execute(count_q)).scalar_one()
    scan_id = str(uuid.uuid4())
    return ScanResponse(scan_id=scan_id, status="QUEUED", estimated_cases=estimated)


async def run_scan(
    tenant_id: str,
    user_id: str,
    req: ScanRequest,
) -> None:
    """后台执行数据质量扫描 (由 BackgroundTasks 调用, D5 规则集 v1.2).

    不接收 session 参数 — 参照 S11 _generate_report_background pattern,
    自建 AsyncSessionLocal() 避免使用请求生命周期已关闭的 session (Q3).

    规则:
      1. CLOSED_WITHOUT_CLOSURE (BLOCKER) — case_status=CLOSED 无 case_closures
      2. DATE_REVERSED          (BLOCKER) — close_date < filing_date
      3. NEGATIVE_TRANSACTION   (WARNING) — financial_transactions.amount <= 0
      4. ACTIVE_NO_PARTIES      (WARNING) — case_status=IN_PROGRESS 且 case_parties=0
    """
    async with AsyncSessionLocal() as session:
        async with session.begin():
            # 确定扫描范围
            case_q = select(Case).where(
                Case.is_deleted == False,
                Case.tenant_id == tenant_id,
            )
            if req.scope == "SPECIFIC_CASES" and req.caseIds:
                case_q = case_q.where(Case.id.in_(req.caseIds))

            cases: List[Case] = (await session.execute(case_q)).scalars().all()

            for case in cases:
                case_id_str = str(case.id)

                # Rule 1: CLOSED_WITHOUT_CLOSURE
                if case.case_status == "CLOSED":
                    closure_count = (
                        await session.execute(
                            select(func.count(CaseClosure.id)).where(
                                CaseClosure.case_id == case_id_str,
                                CaseClosure.is_deleted == False,
                            )
                        )
                    ).scalar_one()
                    if closure_count == 0:
                        await _upsert_issue(
                            session,
                            tenant_id=tenant_id,
                            case_id=case_id_str,
                            rule_code="CLOSED_WITHOUT_CLOSURE",
                            issue_type=IssueType.LOGICAL_CONTRADICTION.value,
                            severity=IssueSeverity.BLOCKER.value,
                            description="案件状态为已结案，但缺少结案登记记录",
                            user_id=user_id,
                        )

                # Rule 2: DATE_REVERSED
                if case.close_date and case.filing_date and case.close_date < case.filing_date:
                    await _upsert_issue(
                        session,
                        tenant_id=tenant_id,
                        case_id=case_id_str,
                        rule_code="DATE_REVERSED",
                        issue_type=IssueType.LOGICAL_CONTRADICTION.value,
                        severity=IssueSeverity.BLOCKER.value,
                        description=f"结案日期 {case.close_date} 早于立案日期 {case.filing_date}",
                        user_id=user_id,
                    )

                # Rule 3: NEGATIVE_TRANSACTION
                neg_count = (
                    await session.execute(
                        select(func.count(FinancialTransaction.id)).where(
                            FinancialTransaction.case_id == case_id_str,
                            FinancialTransaction.amount <= 0,
                            FinancialTransaction.is_deleted == False,
                        )
                    )
                ).scalar_one()
                if neg_count > 0:
                    await _upsert_issue(
                        session,
                        tenant_id=tenant_id,
                        case_id=case_id_str,
                        rule_code="NEGATIVE_TRANSACTION",
                        issue_type=IssueType.LOGICAL_CONTRADICTION.value,
                        severity=IssueSeverity.WARNING.value,
                        description=f"存在 {neg_count} 条金额 ≤ 0 的财务流水",
                        user_id=user_id,
                    )

                # Rule 4: ACTIVE_NO_PARTIES
                if case.case_status == "IN_PROGRESS":
                    party_count = (
                        await session.execute(
                            select(func.count(CaseParty.id)).where(
                                CaseParty.case_id == case_id_str,
                                CaseParty.is_deleted == False,
                            )
                        )
                    ).scalar_one()
                    if party_count == 0:
                        await _upsert_issue(
                            session,
                            tenant_id=tenant_id,
                            case_id=case_id_str,
                            rule_code="ACTIVE_NO_PARTIES",
                            issue_type=IssueType.MISSING_MANDATORY.value,
                            severity=IssueSeverity.WARNING.value,
                            description="在办案件未登记任何当事方信息",
                            user_id=user_id,
                        )


async def _upsert_issue(
    session: AsyncSession,
    *,
    tenant_id: str,
    case_id: str,
    rule_code: str,
    issue_type: str,
    severity: str,
    description: str,
    user_id: str,
) -> None:
    """幂等写入数据质量异常 (已存在 PENDING 则跳过)."""
    existing = (
        await session.execute(
            select(DataQualityIssue).where(
                DataQualityIssue.tenant_id == tenant_id,
                DataQualityIssue.case_id == case_id,
                DataQualityIssue.field_name == rule_code,
                DataQualityIssue.status == IssueStatus.PENDING.value,
                DataQualityIssue.is_deleted == False,
            )
        )
    ).scalar_one_or_none()

    if existing:
        return

    issue = DataQualityIssue(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        case_id=case_id,
        issue_type=issue_type,
        field_name=rule_code,
        severity=severity,
        description=description,
        status=IssueStatus.PENDING.value,
        created_by=user_id,
        updated_by=user_id,
    )
    session.add(issue)


async def ignore_issue(
    session: AsyncSession,
    *,
    tenant_id: str,
    user: SysUser,
    req: IssueIgnoreRequest,
) -> IssueIgnoreResponse:
    """忽略数据质量 WARNING 级别异常 (Q6: BLOCKER 不可忽略 → 4200)."""
    issue: DataQualityIssue | None = await session.get(DataQualityIssue, req.issueId)
    if not issue or issue.is_deleted or str(issue.tenant_id) != tenant_id:
        raise NotFoundException(f"数据质量问题 {req.issueId} 不存在")

    if issue.severity == IssueSeverity.BLOCKER.value:
        raise BusinessException(code=4200, message="BLOCKER 级别问题不允许忽略，必须修复后方可关闭")

    async with session.begin():
        issue.status = IssueStatus.IGNORED.value
        issue.resolved_by = str(user.id)
        issue.resolved_at = datetime.now(timezone.utc)
        issue.updated_by = str(user.id)

        await write_audit_log(
            session,
            tenant_id=tenant_id,
            case_id=str(issue.case_id),
            operator=user,
            action_module="DATA_QUALITY_ISSUE",
            action_type="UPDATE",
            action_detail=f"忽略数据质量问题: issueId={req.issueId}, reason={req.reason}",
        )

    return IssueIgnoreResponse(issueId=req.issueId, status=issue.status)
