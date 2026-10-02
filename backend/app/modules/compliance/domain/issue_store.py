from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any

from app.modules.compliance.core.errors import AppError, ForbiddenError, NotFoundError
from app.modules.compliance.domain.auth_store import AuthUserRecord, SeedAuthStore
from app.modules.compliance.domain.dictionaries import validate_code
from app.modules.compliance.domain.evidence_store import evidence_store
from app.modules.compliance.domain.inspection_plan_store import inspection_plan_store
from app.modules.compliance.domain.seed_time import relative_date_iso, relative_datetime_iso, seed_base_date


@dataclass
class InspectionIssueRecord:
    issue_id: str
    inspection_plan_id: str
    branch_id: str
    issue_code: str
    title: str
    risk_level: str
    status: str
    description: str
    basis_rule: str
    appeal_deadline: str
    validity: str = "PENDING"
    branch_snapshot: dict[str, Any] | None = None
    source_working_paper_id: str | None = None
    created_by: str = "SYSTEM-SEED"
    created_by_snapshot: dict[str, Any] | None = None
    created_at: str = field(default_factory=relative_datetime_iso)


@dataclass
class FactConfirmationRecord:
    confirmation_id: str
    issue_id: str
    branch_id: str
    decision: str
    comment: str | None
    confirmed_by: str
    confirmed_at: str
    branch_snapshot: dict[str, Any] | None = None
    confirmed_by_snapshot: dict[str, Any] | None = None


@dataclass
class IssueAppealRecord:
    appeal_id: str
    issue_id: str
    branch_id: str
    reason: str
    file_ids: list[str]
    status: str
    submitted_by: str
    submitted_at: str
    branch_snapshot: dict[str, Any] | None = None
    submitted_by_snapshot: dict[str, Any] | None = None


@dataclass
class AdjudicationDecisionRecord:
    decision_id: str
    appeal_id: str
    decision: str
    decision_reason: str
    decided_by: str
    decided_at: str
    decided_by_snapshot: dict[str, Any] | None = None


class SeedIssueStore:
    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self.issues = self._build_issues()
        self.confirmations = self._build_confirmations()
        self.appeals = self._build_appeals()
        self.decisions = self._build_decisions()
        self.issue_create_idempotency: dict[str, str] = {}

    def create_issue(
        self,
        *,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        if not auth_store.has_permission(user, "PERM-HQ-INSPECTION-MANAGE"):
            raise ForbiddenError()
        inspection_plan_id = self._require_text(payload, "inspectionPlanId")
        branch_id = self._require_text(payload, "branchId")
        title = self._require_text(payload, "title")
        description = self._require_text(payload, "description")
        risk_level = self._require_text(payload, "riskLevel").upper()
        basis_rule = (payload.get("basisRule") or "").strip()
        source_working_paper_id = payload.get("sourceWorkingPaperId")
        idempotency_key = payload.get("idempotencyKey")

        plan = inspection_plan_store._get_plan(inspection_plan_id)
        if branch_id not in plan.target_org_ids:
            raise AppError(
                code="ISSUE_TARGET_NOT_IN_PLAN",
                message="Issue target org must belong to the inspection plan",
                status_code=422,
            )
        validate_code(risk_level, category="risk_level", field="riskLevel")

        if idempotency_key:
            existing_issue_id = self.issue_create_idempotency.get(idempotency_key)
            if existing_issue_id and existing_issue_id in self.issues:
                return self.issue_view(self.issues[existing_issue_id])

        working_paper = None
        if source_working_paper_id:
            working_paper = evidence_store.working_papers.get(source_working_paper_id)
            if not working_paper:
                raise AppError(
                    code="WORKING_PAPER_NOT_FOUND",
                    message="Working paper not found",
                    status_code=404,
                )
            if working_paper.inspection_plan_id != inspection_plan_id:
                raise AppError(
                    code="ISSUE_SOURCE_WORKING_PAPER_PLAN_MISMATCH",
                    message="Working paper does not belong to the inspection plan",
                    status_code=422,
                )
            if working_paper.branch_id != branch_id:
                raise AppError(
                    code="ISSUE_SOURCE_WORKING_PAPER_BRANCH_MISMATCH",
                    message="Working paper branch does not match issue branch",
                    status_code=422,
                )
            existing_issue_id = working_paper.converted_issue_id or working_paper.related_issue_id
            if existing_issue_id and existing_issue_id in self.issues:
                if idempotency_key:
                    self.issue_create_idempotency[idempotency_key] = existing_issue_id
                return self.issue_view(self.issues[existing_issue_id])

        issue_number = len(self.issues) + 1
        issue_id = f"ISSUE-SEED-{issue_number:04d}"
        issue = InspectionIssueRecord(
            issue_id=issue_id,
            inspection_plan_id=inspection_plan_id,
            branch_id=branch_id,
            issue_code=(payload.get("issueCode") or f"SIT-ISSUE-{issue_number:04d}").strip(),
            title=title,
            risk_level=risk_level,
            status="PENDING_CONFIRMATION",
            description=description,
            basis_rule=basis_rule,
            appeal_deadline=(payload.get("appealDeadline") or relative_date_iso(30)).strip(),
            validity="PENDING",
            branch_snapshot=auth_store.org_snapshot(branch_id),
            source_working_paper_id=source_working_paper_id,
            created_by=user.user_id,
            created_by_snapshot=auth_store.user_snapshot(user.user_id),
            created_at=relative_datetime_iso(),
        )
        self.issues[issue_id] = issue
        if idempotency_key:
            self.issue_create_idempotency[idempotency_key] = issue_id
        if working_paper:
            working_paper.converted_issue_id = issue_id
            working_paper.related_issue_id = issue_id
            working_paper.result = "ISSUE_CANDIDATE"
            working_paper.updated_at = relative_datetime_iso()
        return self.issue_view(issue)

    def issue_page(
        self,
        *,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        status: str | None = None,
        inspection_plan_id: str | None = None,
        branch_id: str | None = None,
        keyword: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        validate_code(status, category="inspection_issue_status", field="status")
        visible = self._visible_issues(user, auth_store)
        filtered = [
            issue
            for issue in visible
            if (status is None or issue.status == status)
            and (inspection_plan_id is None or issue.inspection_plan_id == inspection_plan_id)
            and (branch_id is None or issue.branch_id == branch_id)
            and self._matches_issue_keyword(issue, keyword)
        ]
        filtered.sort(key=lambda item: (item.appeal_deadline, item.issue_id))
        start = (page - 1) * page_size
        end = start + page_size
        return {
            "items": [self.issue_view(issue) for issue in filtered[start:end]],
            "page": page,
            "pageSize": page_size,
            "total": len(filtered),
        }

    def create_confirmation(
        self,
        *,
        issue_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        decision: str = "NO_OBJECTION",
        comment: str | None = None,
    ) -> dict[str, Any]:
        validate_code(decision, category="fact_confirmation_decision", field="decision")
        issue = self._get_issue(issue_id)
        self._require_branch_issue_scope(issue, user, auth_store)
        self._require_deadline_open(issue, code="APPEAL_DEADLINE_CLOSED")
        confirmation_id = f"CONF-SEED-{len(self.confirmations) + 1:04d}"
        confirmation = FactConfirmationRecord(
            confirmation_id=confirmation_id,
            issue_id=issue.issue_id,
            branch_id=issue.branch_id,
            decision=decision,
            comment=comment,
            confirmed_by=user.user_id,
            confirmed_at=relative_datetime_iso(),
            branch_snapshot=auth_store.org_snapshot(issue.branch_id),
            confirmed_by_snapshot=auth_store.user_snapshot(user.user_id),
        )
        self.confirmations[confirmation_id] = confirmation
        issue.status = "FACT_CONFIRMED"
        issue.validity = "CONFIRMED"
        return self.confirmation_view(confirmation)

    def submit_appeal(
        self,
        *,
        issue_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        reason: str,
        file_ids: list[str],
    ) -> dict[str, Any]:
        issue = self._get_issue(issue_id)
        self._require_branch_issue_scope(issue, user, auth_store)
        if not reason.strip():
            raise AppError(
                code="MISSING_REASON",
                message="Appeal reason is required",
                status_code=422,
            )
        self._require_deadline_open(issue, code="DEADLINE_PASSED")
        duplicate = next(
            (
                appeal
                for appeal in self.appeals.values()
                if appeal.issue_id == issue_id
                and appeal.status in {"SUBMITTED", "UNDER_ADJUDICATION"}
            ),
            None,
        )
        if duplicate:
            raise AppError(
                code="DUPLICATE_ACTIVE_APPEAL",
                message="Duplicate active appeal",
                status_code=409,
            )
        evidence_store.require_file_assets_for_user(
            file_ids=file_ids,
            user=user,
            auth_store=auth_store,
        )
        appeal_id = f"APPEAL-SEED-{len(self.appeals) + 1:04d}"
        appeal = IssueAppealRecord(
            appeal_id=appeal_id,
            issue_id=issue.issue_id,
            branch_id=issue.branch_id,
            reason=reason,
            file_ids=file_ids,
            status="SUBMITTED",
            submitted_by=user.user_id,
            submitted_at=relative_datetime_iso(),
            branch_snapshot=auth_store.org_snapshot(issue.branch_id),
            submitted_by_snapshot=auth_store.user_snapshot(user.user_id),
        )
        self.appeals[appeal_id] = appeal
        issue.status = "APPEALED"
        return self.appeal_view(appeal, auth_store)

    def appeal_page(
        self,
        *,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        status: str | None = None,
        inspection_plan_id: str | None = None,
        branch_id: str | None = None,
        keyword: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        if not auth_store.has_permission(user, "PERM-HQ-ADJUDICATION"):
            raise ForbiddenError()
        validate_code(status, category="appeal_status", field="status")
        visible = [
            appeal
            for appeal in self.appeals.values()
            if (status is None or appeal.status == status)
            and (branch_id is None or appeal.branch_id == branch_id)
            and self._matches_appeal_plan(appeal, inspection_plan_id)
            and self._matches_appeal_keyword(appeal, keyword)
        ]
        visible.sort(key=lambda item: (item.submitted_at, item.appeal_id))
        start = (page - 1) * page_size
        end = start + page_size
        return {
            "items": [self.appeal_view(appeal, auth_store) for appeal in visible[start:end]],
            "page": page,
            "pageSize": page_size,
            "total": len(visible),
        }

    def decide_appeal(
        self,
        *,
        appeal_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        decision: str,
        decision_reason: str,
    ) -> dict[str, Any]:
        if not auth_store.has_permission(user, "PERM-HQ-INSPECTION-MANAGE"):
            raise ForbiddenError()
        appeal = self._get_appeal(appeal_id)
        if appeal.status in {"ADOPTED", "REJECTED", "WITHDRAWN"} or appeal_id in {
            item.appeal_id for item in self.decisions.values()
        }:
            raise AppError(
                code="APPEAL_ALREADY_DECIDED",
                message="Appeal has already been decided",
                status_code=409,
            )
        if not decision_reason.strip():
            raise AppError(
                code="DECISION_REASON_MISSING",
                message="Decision reason is required",
                status_code=422,
            )
        validate_code(decision, category="adjudication_decision", field="decision")
        decision_id = f"ADJ-SEED-{len(self.decisions) + 1:04d}"
        record = AdjudicationDecisionRecord(
            decision_id=decision_id,
            appeal_id=appeal.appeal_id,
            decision=decision,
            decision_reason=decision_reason,
            decided_by=user.user_id,
            decided_at=relative_datetime_iso(),
            decided_by_snapshot=auth_store.user_snapshot(user.user_id),
        )
        self.decisions[decision_id] = record
        appeal.status = decision
        issue = self._get_issue(appeal.issue_id)
        issue.status = "APPEAL_ADOPTED" if decision == "ADOPTED" else "APPEAL_REJECTED"
        issue.validity = "INVALID" if decision == "ADOPTED" else "VALID"
        return self.decision_view(record)

    def issue_view(self, record: InspectionIssueRecord) -> dict[str, Any]:
        return {
            "issueId": record.issue_id,
            "id": record.issue_id,
            "inspectionPlanId": record.inspection_plan_id,
            "branchId": record.branch_id,
            "branchSnapshot": record.branch_snapshot,
            "issueCode": record.issue_code,
            "title": record.title,
            "riskLevel": record.risk_level,
            "status": record.status,
            "description": record.description,
            "basisRule": record.basis_rule,
            "appealDeadline": record.appeal_deadline,
            "validity": record.validity,
            "sourceWorkingPaperId": record.source_working_paper_id,
            "createdBy": record.created_by,
            "createdBySnapshot": record.created_by_snapshot,
            "createdAt": record.created_at,
        }

    @staticmethod
    def confirmation_view(record: FactConfirmationRecord) -> dict[str, Any]:
        return {
            "confirmationId": record.confirmation_id,
            "issueId": record.issue_id,
            "branchId": record.branch_id,
            "decision": record.decision,
            "comment": record.comment,
            "confirmedBy": record.confirmed_by,
            "confirmedByName": (
                record.confirmed_by_snapshot or {}
            ).get("displayName", ""),
            "confirmedBySnapshot": record.confirmed_by_snapshot,
            "branchSnapshot": record.branch_snapshot,
            "confirmedAt": record.confirmed_at,
        }

    def appeal_view(self, record: IssueAppealRecord, auth_store: SeedAuthStore) -> dict[str, Any]:
        issue = self.issues.get(record.issue_id)
        branch = auth_store.orgs.get(record.branch_id)
        branch_snapshot = record.branch_snapshot or auth_store.org_snapshot(record.branch_id)
        submitted_by_snapshot = record.submitted_by_snapshot or auth_store.user_snapshot(
            record.submitted_by
        )
        decision = next(
            (
                self.decision_view(item)
                for item in self.decisions.values()
                if item.appeal_id == record.appeal_id
            ),
            None,
        )
        return {
            "appealId": record.appeal_id,
            "id": record.appeal_id,
            "issueId": record.issue_id,
            "branchId": record.branch_id,
            "branchName": branch_snapshot.get("orgName") or (branch.org_name if branch else ""),
            "branchSnapshot": branch_snapshot,
            "reason": record.reason,
            "fileIds": record.file_ids,
            "files": [
                evidence_store.file_view(evidence_store.file_assets[file_id])
                for file_id in record.file_ids
                if file_id in evidence_store.file_assets
            ],
            "status": record.status,
            "submittedBy": record.submitted_by,
            "submittedByName": submitted_by_snapshot.get("displayName", ""),
            "submittedBySnapshot": submitted_by_snapshot,
            "submittedAt": record.submitted_at,
            "issue": self.issue_view(issue) if issue else None,
            "decision": decision,
            "publicPath": f"/compliance/hq/inspection/appeals/{record.appeal_id}",
            "branchPublicPath": f"/compliance/branch/inspection/issues/{record.issue_id}/appeal",
        }

    @staticmethod
    def decision_view(record: AdjudicationDecisionRecord) -> dict[str, Any]:
        return {
            "decisionId": record.decision_id,
            "appealId": record.appeal_id,
            "decision": record.decision,
            "decisionReason": record.decision_reason,
            "decidedBy": record.decided_by,
            "decidedByName": (
                record.decided_by_snapshot or {}
            ).get("displayName", ""),
            "decidedBySnapshot": record.decided_by_snapshot,
            "decidedAt": record.decided_at,
        }

    @staticmethod
    def _require_text(payload: dict[str, Any], field: str) -> str:
        value = payload.get(field)
        if value is None:
            raise AppError(
                code="VALIDATION_ERROR",
                message=f"Issue {field} is required",
                status_code=422,
                details={"field": field, "reason": "required"},
            )
        normalized = str(value).strip()
        if not normalized:
            raise AppError(
                code="VALIDATION_ERROR",
                message=f"Issue {field} is required",
                status_code=422,
                details={"field": field, "reason": "required"},
            )
        return normalized

    def _require_branch_issue_scope(
        self,
        issue: InspectionIssueRecord,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> None:
        if not auth_store.has_permission(user, "PERM-BRANCH-INSPECTION-HANDLE"):
            raise ForbiddenError()
        if not auth_store.org_in_scope(user, issue.branch_id):
            raise AppError(
                code="ISSUE_NOT_ASSIGNED_TO_BRANCH",
                message="Issue is not assigned to current branch",
                status_code=403,
            )

    @staticmethod
    def _require_deadline_open(issue: InspectionIssueRecord, *, code: str) -> None:
        if date.fromisoformat(issue.appeal_deadline) < seed_base_date():
            raise AppError(code=code, message="Appeal deadline has closed", status_code=409)

    def _matches_appeal_plan(
        self,
        appeal: IssueAppealRecord,
        inspection_plan_id: str | None,
    ) -> bool:
        if inspection_plan_id is None:
            return True
        issue = self.issues.get(appeal.issue_id)
        return bool(issue and issue.inspection_plan_id == inspection_plan_id)

    def _matches_appeal_keyword(self, appeal: IssueAppealRecord, keyword: str | None) -> bool:
        if not keyword:
            return True
        normalized = keyword.lower()
        issue = self.issues.get(appeal.issue_id)
        return normalized in appeal.reason.lower() or bool(
            issue
            and (
                normalized in issue.title.lower()
                or normalized in issue.issue_code.lower()
                or normalized in issue.description.lower()
            )
        )

    def _visible_issues(
        self,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> list[InspectionIssueRecord]:
        if auth_store.has_permission(user, "PERM-HQ-INSPECTION-MANAGE"):
            return list(self.issues.values())
        if not auth_store.has_permission(user, "PERM-BRANCH-INSPECTION-HANDLE"):
            raise ForbiddenError()
        return [
            issue
            for issue in self.issues.values()
            if auth_store.org_in_scope(user, issue.branch_id)
        ]

    @staticmethod
    def _matches_issue_keyword(issue: InspectionIssueRecord, keyword: str | None) -> bool:
        if not keyword:
            return True
        normalized = keyword.lower()
        return (
            normalized in issue.title.lower()
            or normalized in issue.issue_code.lower()
            or normalized in issue.description.lower()
        )

    def _get_issue(self, issue_id: str) -> InspectionIssueRecord:
        issue = self.issues.get(issue_id)
        if not issue:
            raise NotFoundError("Inspection issue not found")
        return issue

    def _get_appeal(self, appeal_id: str) -> IssueAppealRecord:
        appeal = self.appeals.get(appeal_id)
        if not appeal:
            raise NotFoundError("Appeal not found")
        return appeal

    @staticmethod
    def _build_issues() -> dict[str, InspectionIssueRecord]:
        records = [
            InspectionIssueRecord(
                issue_id="ISSUE-WLZQ-AML-001",
                inspection_plan_id="INSP-PLAN-WLZQ-2026-AML-001",
                branch_id="WLZQ-RBC-GZ-NANSHA",
                issue_code="WLZQ-ISSUE-AML-001",
                title="客户身份识别资料缺失",
                risk_level="HIGH",
                status="PENDING_CONFIRMATION",
                description="抽样客户档案中缺少受益所有人识别材料。",
                basis_rule="反洗钱客户身份识别检查要点第 3 条",
                appeal_deadline=relative_date_iso(30),
            ),
            InspectionIssueRecord(
                issue_id="ISSUE-WLZQ-AML-APPEAL-001",
                inspection_plan_id="INSP-PLAN-WLZQ-2026-AML-001",
                branch_id="WLZQ-RBC-GZ-NANSHA",
                issue_code="WLZQ-ISSUE-AML-002",
                title="高风险客户持续尽调记录不完整",
                risk_level="MEDIUM",
                status="PENDING_CONFIRMATION",
                description="部分高风险客户复核材料未在系统中完整留痕。",
                basis_rule="反洗钱持续尽调检查要点第 5 条",
                appeal_deadline=relative_date_iso(30),
            ),
            InspectionIssueRecord(
                issue_id="ISSUE-WLZQ-AML-OVERDUE-001",
                inspection_plan_id="INSP-PLAN-WLZQ-2026-AML-001",
                branch_id="WLZQ-RBC-GZ-NANSHA",
                issue_code="WLZQ-ISSUE-AML-003",
                title="申诉截止后补充材料问题",
                risk_level="LOW",
                status="PENDING_CONFIRMATION",
                description="申诉窗口已关闭，后续补充材料需走例外处理。",
                basis_rule="反洗钱申诉时限规则",
                appeal_deadline=relative_date_iso(-20),
            ),
            InspectionIssueRecord(
                issue_id="ISSUE-WLZQ-AML-SEED-APPEAL-001",
                inspection_plan_id="INSP-PLAN-WLZQ-2026-AML-001",
                branch_id="WLZQ-RBC-GZ-NANSHA",
                issue_code="WLZQ-ISSUE-AML-005",
                title="申辩队列待处理问题",
                risk_level="MEDIUM",
                status="PENDING_CONFIRMATION",
                description="用于保持总部裁决队列存在一条可查看的待处理申辩样本。",
                basis_rule="反洗钱申辩处理规则",
                appeal_deadline=relative_date_iso(30),
            ),
            InspectionIssueRecord(
                issue_id="ISSUE-WLZQ-AML-SZ-001",
                inspection_plan_id="INSP-PLAN-WLZQ-2026-AML-001",
                branch_id="WLZQ-RBC-SHENZHEN",
                issue_code="WLZQ-ISSUE-AML-004",
                title="深圳分公司范围隔离关注问题",
                risk_level="MEDIUM",
                status="PENDING_CONFIRMATION",
                description="该问题只归属深圳分公司，其他分支机构不可处理。",
                basis_rule="分支数据范围隔离规则",
                appeal_deadline=relative_date_iso(30),
            ),
            InspectionIssueRecord(
                issue_id="ISSUE-WLZQ-AML-REPORT-READY-001",
                inspection_plan_id="INSP-PLAN-WLZQ-2026-AML-REPORT-READY-001",
                branch_id="WLZQ-RBC-GZ-NANSHA",
                issue_code="WLZQ-ISSUE-AML-RR-001",
                title="报告编制准备客户尽调资料已确认问题",
                risk_level="HIGH",
                status="FACT_CONFIRMED",
                description="用于报告编制准备场景的事实确认来源问题。",
                basis_rule="反洗钱客户身份识别检查要点第 3 条",
                appeal_deadline=relative_date_iso(30),
                validity="CONFIRMED",
            ),
            InspectionIssueRecord(
                issue_id="ISSUE-WLZQ-AML-REPORT-READY-002",
                inspection_plan_id="INSP-PLAN-WLZQ-2026-AML-REPORT-READY-001",
                branch_id="WLZQ-RBC-GZ-NANSHA",
                issue_code="WLZQ-ISSUE-AML-RR-002",
                title="报告编制准备持续尽调申辩已裁定问题",
                risk_level="MEDIUM",
                status="APPEAL_REJECTED",
                description="用于报告编制准备场景的申辩裁定来源问题。",
                basis_rule="反洗钱持续尽调检查要点第 5 条",
                appeal_deadline=relative_date_iso(30),
                validity="VALID",
            ),
            InspectionIssueRecord(
                issue_id="ISSUE-WLZQ-AML-PUBLIC-REPORTING-001",
                inspection_plan_id="INSP-PLAN-WLZQ-2026-AML-PUBLIC-REPORTING-001",
                branch_id="WLZQ-RBC-GZ-NANSHA",
                issue_code="WLZQ-ISSUE-AML-PR-001",
                title="报告编制准入客户身份识别已确认问题",
                risk_level="HIGH",
                status="FACT_CONFIRMED",
                description=(
                    "用于验证 enter_report_preparation 可在事实确认完毕后进入报告编制。"
                ),
                basis_rule="反洗钱客户身份识别检查要点第 3 条",
                appeal_deadline=relative_date_iso(30),
                validity="CONFIRMED",
            ),
            InspectionIssueRecord(
                issue_id="ISSUE-WLZQ-AML-PUBLIC-REPORTING-BLOCKED-001",
                inspection_plan_id="INSP-PLAN-WLZQ-2026-AML-PUBLIC-REPORTING-BLOCKED-001",
                branch_id="WLZQ-RBC-GZ-NANSHA",
                issue_code="WLZQ-ISSUE-AML-PR-BLOCKED-001",
                title="报告编制准入待裁定申辩问题",
                risk_level="MEDIUM",
                status="APPEALED",
                description="用于验证存在未裁定申辩时不能进入报告编制。",
                basis_rule="反洗钱持续尽调检查要点第 5 条",
                appeal_deadline=relative_date_iso(30),
                validity="PENDING",
            ),
            InspectionIssueRecord(
                issue_id="ISSUE-SEED-SIT-0015-001",
                inspection_plan_id="INSP-PLAN-SEED-0015",
                branch_id="WLZQ-RBC-GZ-NANSHA",
                issue_code="SIT-ISSUE-0015-001",
                title="SIT 种子问题：反洗钱大额交易报送缺失",
                risk_level="HIGH",
                status="PENDING_CONFIRMATION",
                description="南沙分支大额交易报送样本中缺少 3 笔可疑报告，需现场核实。",
                basis_rule="反洗钱大额交易报告检查要点第 2 条",
                appeal_deadline=relative_date_iso(30),
                source_working_paper_id="WP-SIT-SEED-0015-001",
                created_by="USER-HQ-INSP-001",
            ),
            InspectionIssueRecord(
                issue_id="ISSUE-SEED-SIT-0015-002",
                inspection_plan_id="INSP-PLAN-SEED-0015",
                branch_id="WLZQ-RBC-GZ-NANSHA",
                issue_code="SIT-ISSUE-0015-002",
                title="SIT 种子问题：客户身份识别资料过期",
                risk_level="MEDIUM",
                status="PENDING_CONFIRMATION",
                description="部分客户身份识别资料超过有效期限未更新。",
                basis_rule="反洗钱客户身份识别检查要点第 4 条",
                appeal_deadline=relative_date_iso(30),
                created_by="USER-HQ-INSP-001",
            ),
            InspectionIssueRecord(
                issue_id="ISSUE-SEED-SIT-0015-003",
                inspection_plan_id="INSP-PLAN-SEED-0015",
                branch_id="WLZQ-RBC-GZ-NANSHA",
                issue_code="SIT-ISSUE-0015-003",
                title="SIT 种子问题：培训记录不完整",
                risk_level="LOW",
                status="PENDING_CONFIRMATION",
                description="反洗钱培训档案中缺少 2 名新入职员工的培训记录。",
                basis_rule="反洗钱培训管理检查要点第 1 条",
                appeal_deadline=relative_date_iso(30),
                created_by="USER-HQ-INSP-001",
            ),
        ]
        return {record.issue_id: record for record in records}

    @staticmethod
    def _build_confirmations() -> dict[str, FactConfirmationRecord]:
        records = [
            FactConfirmationRecord(
                confirmation_id="FACT-WLZQ-AML-REPORT-READY-001",
                issue_id="ISSUE-WLZQ-AML-REPORT-READY-001",
                branch_id="WLZQ-RBC-GZ-NANSHA",
                decision="NO_OBJECTION",
                comment="Seeded report-ready scenario fact confirmation.",
                confirmed_by="USER-BRANCH-COMP-001",
                confirmed_at=relative_datetime_iso(),
            ),
            FactConfirmationRecord(
                confirmation_id="FACT-WLZQ-AML-PUBLIC-REPORTING-001",
                issue_id="ISSUE-WLZQ-AML-PUBLIC-REPORTING-001",
                branch_id="WLZQ-RBC-GZ-NANSHA",
                decision="NO_OBJECTION",
                comment="Seeded public reporting transition fact confirmation.",
                confirmed_by="USER-BRANCH-COMP-001",
                confirmed_at=relative_datetime_iso(),
            ),
        ]
        return {record.confirmation_id: record for record in records}

    @staticmethod
    def _build_appeals() -> dict[str, IssueAppealRecord]:
        records = [
            IssueAppealRecord(
                appeal_id="APPEAL-WLZQ-AML-REPORT-READY-001",
                issue_id="ISSUE-WLZQ-AML-REPORT-READY-002",
                branch_id="WLZQ-RBC-GZ-NANSHA",
                reason="Seeded branch appeal for report-ready scenario adjudication proof.",
                file_ids=[],
                status="REJECTED",
                submitted_by="USER-BRANCH-COMP-001",
                submitted_at=relative_datetime_iso(),
            ),
            IssueAppealRecord(
                appeal_id="APPEAL-WLZQ-AML-PUBLIC-REPORTING-BLOCKED-001",
                issue_id="ISSUE-WLZQ-AML-PUBLIC-REPORTING-BLOCKED-001",
                branch_id="WLZQ-RBC-GZ-NANSHA",
                reason="Seeded pending appeal for public reporting transition negative guard.",
                file_ids=[],
                status="SUBMITTED",
                submitted_by="USER-BRANCH-COMP-001",
                submitted_at=relative_datetime_iso(),
            ),
        ]
        return {record.appeal_id: record for record in records}

    @staticmethod
    def _build_decisions() -> dict[str, AdjudicationDecisionRecord]:
        records = [
            AdjudicationDecisionRecord(
                decision_id="ADJ-WLZQ-AML-REPORT-READY-001",
                appeal_id="APPEAL-WLZQ-AML-REPORT-READY-001",
                decision="REJECTED",
                decision_reason="Seeded report-ready scenario adjudication decision.",
                decided_by="USER-HQ-COMP-001",
                decided_at=relative_datetime_iso(),
            ),
        ]
        return {record.decision_id: record for record in records}


issue_store = SeedIssueStore()
