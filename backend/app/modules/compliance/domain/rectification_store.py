"""WP-P0-BE-06 — Compliance Issue Hub & Rectification Loop domain store.

Implements:
- ComplianceIssue hub (list/detail/supervision)
- RectificationRecord lifecycle (feedback/verification)
- SM-ISSUE-RECTIFICATION state machine guards

Depends on:
- WP-P0-BE-04 FileAsset reuse (evidence_store.require_file_assets_for_user)
- WP-P0-BE-01 auth/permission model
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.modules.compliance.core.errors import AppError, ForbiddenError, NotFoundError
from app.modules.compliance.domain.auth_store import AuthUserRecord, SeedAuthStore
from app.modules.compliance.domain.dictionaries import validate_code, validate_codes
from app.modules.compliance.domain.evidence_store import evidence_store
from app.modules.compliance.domain.seed_time import relative_date_iso, relative_datetime_iso

# ---------------------------------------------------------------------------
# Data records
# ---------------------------------------------------------------------------


@dataclass
class ComplianceIssueRecord:
    issue_id: str
    issue_code: str
    title: str
    source_type: str  # "INSPECTION", "ASSESSMENT", "MANUAL"
    source_id: str  # e.g. inspection plan id
    source_project: str  # display label
    business_line: str
    responsible_org_id: str
    responsible_dept: str  # display label
    risk_level: str
    status: str
    discovery_date: str
    sla_deadline: str
    description: str
    rectification_advice: str
    basis_rule: str
    responsible_org_snapshot: dict[str, Any] | None = None


@dataclass
class IssueSupervisionEventRecord:
    supervision_event_id: str
    issue_id: str
    message: str
    channel: str
    created_by: str
    created_at: str
    created_by_snapshot: dict[str, Any] | None = None
    integration_event_id: str | None = None


@dataclass
class RectificationRecordData:
    rectification_id: str
    source_issue_id: str
    responsible_org_id: str
    issue_description: str
    rectification_goal: str
    risk_level: str
    due_date: str
    status: str
    extension: str = "NONE"
    hq_reject_reason: str | None = None
    responsible_org_snapshot: dict[str, Any] | None = None


@dataclass
class RectificationFeedbackRecord:
    feedback_id: str
    rectification_id: str
    content: str
    file_ids: list[str] = field(default_factory=list)
    submitted_by: str = ""
    submitted_at: str = ""
    submitted_by_snapshot: dict[str, Any] | None = None


# ---------------------------------------------------------------------------
# Seed store
# ---------------------------------------------------------------------------

# Terminal states where no further feedback may be submitted
_CLOSED_STATUSES = {"CLOSED", "ARCHIVED"}

# States from which feedback submission is valid
_FEEDBACK_SUBMITTABLE = {"RECTIFYING", "VERIFICATION_REJECTED"}

# The status that must be active for HQ verification
_PENDING_VERIFICATION = "PENDING_VERIFICATION"


class SeedRectificationStore:
    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self.issues = self._build_compliance_issues()
        self.supervision_events: dict[str, IssueSupervisionEventRecord] = {}
        self.rectifications = self._build_rectification_records()
        self.feedbacks: dict[str, RectificationFeedbackRecord] = {}

    # ------------------------------------------------------------------
    # Issue Hub — List
    # ------------------------------------------------------------------

    def issue_page(
        self,
        *,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        status: str | None = None,
        risk_level: str | None = None,
        responsible_org_id: str | None = None,
        source: str | None = None,
        source_id: str | None = None,
        business_line: str | None = None,
        keyword: str | None = None,
        due_date_start: str | None = None,
        due_date_end: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        self._require_issue_read(user, auth_store)
        validate_codes(
            (status, "issue_rectification_status", "status"),
            (risk_level, "risk_level", "riskLevel"),
            (source, "issue_source_type", "source"),
            (business_line, "business_line", "businessLine"),
        )
        visible = self._visible_issues(user, auth_store)
        filtered = [
            issue
            for issue in visible
            if (status is None or issue.status == status)
            and (risk_level is None or issue.risk_level == risk_level)
            and (responsible_org_id is None or issue.responsible_org_id == responsible_org_id)
            and (source is None or issue.source_type == source)
            and (source_id is None or issue.source_id == source_id)
            and (business_line is None or issue.business_line == business_line)
            and (due_date_start is None or issue.sla_deadline >= due_date_start)
            and (due_date_end is None or issue.sla_deadline <= due_date_end)
            and self._matches_issue_keyword(issue, keyword)
        ]
        filtered.sort(key=lambda item: (item.discovery_date, item.issue_id))
        start = (page - 1) * page_size
        end = start + page_size
        return {
            "items": [self.issue_view(issue, auth_store) for issue in filtered[start:end]],
            "page": page,
            "pageSize": page_size,
            "total": len(filtered),
        }

    # ------------------------------------------------------------------
    # Issue Hub — Detail
    # ------------------------------------------------------------------

    def issue_detail(
        self,
        *,
        issue_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        issue = self._get_issue(issue_id)
        self._require_issue_read(user, auth_store)
        if not self._issue_visible_to_user(issue, user, auth_store):
            raise ForbiddenError()
        detail = self.issue_view(issue, auth_store)
        # Nest rectification records
        recs = [
            rec
            for rec in self.rectifications.values()
            if rec.source_issue_id == issue_id
        ]
        detail["rectifications"] = [self.rectification_view(rec, auth_store) for rec in recs]
        # Nest supervision events
        events = [
            ev
            for ev in self.supervision_events.values()
            if ev.issue_id == issue_id
        ]
        detail["supervisionEvents"] = [self.supervision_event_view(ev) for ev in events]
        return detail

    # ------------------------------------------------------------------
    # Supervision Event
    # ------------------------------------------------------------------

    def create_supervision_event(
        self,
        *,
        issue_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        message: str,
        channel: str = "EKP",
    ) -> dict[str, Any]:
        self._require_hq_supervision(user, auth_store)
        issue = self._get_issue(issue_id)
        # Duplicate supervision guard: same issue plus same channel within 24h
        # (simplified here as any existing event).
        duplicate = next(
            (
                ev
                for ev in self.supervision_events.values()
                if ev.issue_id == issue_id and ev.channel == channel
            ),
            None,
        )
        if duplicate:
            raise AppError(
                code="DUPLICATE_SUPERVISION",
                message="Supervision event already exists for this issue and channel",
                status_code=409,
            )
        event_id = f"SUPV-SEED-{len(self.supervision_events) + 1:04d}"
        integration_event_id = f"INTEV-SEED-{event_id}"
        event = IssueSupervisionEventRecord(
            supervision_event_id=event_id,
            issue_id=issue.issue_id,
            message=message,
            channel=channel,
            created_by=user.user_id,
            created_at=relative_datetime_iso(),
            created_by_snapshot=auth_store.user_snapshot(user.user_id),
            integration_event_id=integration_event_id,
        )
        self.supervision_events[event_id] = event
        return self.supervision_event_view(event)

    # ------------------------------------------------------------------
    # Rectification List
    # ------------------------------------------------------------------

    def rectification_page(
        self,
        *,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        status: str | None = None,
        branch_id: str | None = None,
        issue_id: str | None = None,
        due_date_start: str | None = None,
        due_date_end: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        validate_code(status, category="issue_rectification_status", field="status")
        visible = self._visible_rectifications(user, auth_store)
        filtered = [
            rec
            for rec in visible
            if (status is None or rec.status == status)
            and (branch_id is None or rec.responsible_org_id == branch_id)
            and (issue_id is None or rec.source_issue_id == issue_id)
            and (due_date_start is None or rec.due_date >= due_date_start)
            and (due_date_end is None or rec.due_date <= due_date_end)
        ]
        filtered.sort(key=lambda item: (item.due_date, item.rectification_id))
        start = (page - 1) * page_size
        end = start + page_size
        return {
            "items": [self.rectification_view(rec, auth_store) for rec in filtered[start:end]],
            "page": page,
            "pageSize": page_size,
            "total": len(filtered),
        }

    # ------------------------------------------------------------------
    # Rectification Feedback (Branch submits)
    # ------------------------------------------------------------------

    def start_rectification(
        self,
        *,
        rectification_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        rec = self._get_rectification(rectification_id)
        self._require_branch_rectification_scope(rec, user, auth_store)

        if rec.status != "PENDING_RECTIFICATION":
            raise AppError(
                code="RECORD_NOT_PENDING_RECTIFICATION",
                message=f"Rectification status '{rec.status}' does not allow starting",
                status_code=409,
            )

        rec.status = "RECTIFYING"
        
        # Also update parent issue status
        issue = self.issues.get(rec.source_issue_id)
        if issue and issue.status == "PENDING_RECTIFICATION":
            issue.status = "RECTIFYING"

        return self.rectification_view(rec, auth_store)

    def submit_feedback(
        self,
        *,
        rectification_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        content: str,
        file_ids: list[str],
    ) -> dict[str, Any]:
        rec = self._get_rectification(rectification_id)
        self._require_branch_rectification_scope(rec, user, auth_store)

        if rec.status in _CLOSED_STATUSES:
            raise AppError(
                code="RECORD_ALREADY_CLOSED",
                message="Rectification record is already closed",
                status_code=409,
            )
        if rec.status not in _FEEDBACK_SUBMITTABLE:
            raise AppError(
                code="RECORD_NOT_IN_FEEDBACK_STATE",
                message=f"Rectification status '{rec.status}' does not allow feedback submission",
                status_code=409,
            )
        if not content.strip():
            raise AppError(
                code="MISSING_FEEDBACK",
                message="Feedback content is required",
                status_code=422,
            )
        # Validate file assets via WP-P0-BE-04 shared guard
        if file_ids:
            evidence_store.require_file_assets_for_user(
                file_ids=file_ids,
                user=user,
                auth_store=auth_store,
            )
        feedback_id = f"RFBK-SEED-{len(self.feedbacks) + 1:04d}"
        feedback = RectificationFeedbackRecord(
            feedback_id=feedback_id,
            rectification_id=rectification_id,
            content=content,
            file_ids=file_ids,
            submitted_by=user.user_id,
            submitted_at=relative_datetime_iso(),
            submitted_by_snapshot=auth_store.user_snapshot(user.user_id),
        )
        self.feedbacks[feedback_id] = feedback
        # State transition: → PENDING_VERIFICATION
        rec.status = _PENDING_VERIFICATION
        issue = self.issues.get(rec.source_issue_id)
        if issue and issue.status in {"RECTIFYING", "VERIFICATION_REJECTED"}:
            issue.status = _PENDING_VERIFICATION
        return self.rectification_view(rec, auth_store)

    # ------------------------------------------------------------------
    # Rectification Verification (HQ approves / rejects)
    # ------------------------------------------------------------------

    def verify_rectification(
        self,
        *,
        rectification_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        decision: str,
        reject_reason: str | None = None,
    ) -> dict[str, Any]:
        self._require_hq_supervision(user, auth_store)
        rec = self._get_rectification(rectification_id)

        if rec.status != _PENDING_VERIFICATION:
            raise AppError(
                code="RECORD_NOT_PENDING_VERIFICATION",
                message="Rectification is not pending verification",
                status_code=409,
            )
        validate_code(decision, category="rectification_verification_decision", field="decision")
        if decision == "APPROVE":
            rec.status = "CLOSED"
            # Also close the parent compliance issue
            issue = self.issues.get(rec.source_issue_id)
            if issue:
                issue.status = "CLOSED"
        elif decision == "REJECT":
            if not reject_reason or not reject_reason.strip():
                raise AppError(
                    code="REJECT_REASON_MISSING",
                    message="Rejection reason is required",
                    status_code=422,
                )
            rec.status = "VERIFICATION_REJECTED"
            rec.hq_reject_reason = reject_reason
            issue = self.issues.get(rec.source_issue_id)
            if issue:
                issue.status = "VERIFICATION_REJECTED"
        return self.rectification_view(rec, auth_store)

    def archive_rectification(
        self,
        *,
        rectification_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        self._require_hq_supervision(user, auth_store)
        rec = self._get_rectification(rectification_id)

        if rec.status != "CLOSED":
            raise AppError(
                code="RECORD_NOT_CLOSED",
                message="Rectification is not closed and cannot be archived",
                status_code=409,
            )

        rec.status = "ARCHIVED"
        
        # Also archive parent issue status
        issue = self.issues.get(rec.source_issue_id)
        if issue and issue.status == "CLOSED":
            issue.status = "ARCHIVED"

        return self.rectification_view(rec, auth_store)

    # ------------------------------------------------------------------
    # View helpers
    # ------------------------------------------------------------------

    def issue_view(
        self,
        record: ComplianceIssueRecord,
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        return {
            "issueId": record.issue_id,
            "id": record.issue_id,
            "issueCode": record.issue_code,
            "title": record.title,
            "sourceType": record.source_type,
            "sourceId": record.source_id,
            "sourceProject": record.source_project,
            "businessLine": record.business_line,
            "responsibleOrgId": record.responsible_org_id,
            "responsibleDept": record.responsible_dept,
            "responsibleOrgSnapshot": record.responsible_org_snapshot,
            "riskLevel": record.risk_level,
            "status": record.status,
            "discoveryDate": record.discovery_date,
            "slaDeadline": record.sla_deadline,
            "description": record.description,
            "rectificationAdvice": record.rectification_advice,
            "basisRule": record.basis_rule,
            "publicPath": f"/compliance/hq/issues/{record.issue_id}",
        }

    @staticmethod
    def supervision_event_view(record: IssueSupervisionEventRecord) -> dict[str, Any]:
        return {
            "supervisionEventId": record.supervision_event_id,
            "issueId": record.issue_id,
            "message": record.message,
            "channel": record.channel,
            "createdBy": record.created_by,
            "createdByName": (
                record.created_by_snapshot or {}
            ).get("displayName", ""),
            "createdBySnapshot": record.created_by_snapshot,
            "createdAt": record.created_at,
            "integrationEventId": record.integration_event_id,
        }

    def rectification_view(
        self,
        record: RectificationRecordData,
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        org = auth_store.orgs.get(record.responsible_org_id)
        responsible_org_snapshot = record.responsible_org_snapshot or auth_store.org_snapshot(
            record.responsible_org_id
        )
        # Gather latest feedback
        feedbacks = [
            fb for fb in self.feedbacks.values()
            if fb.rectification_id == record.rectification_id
        ]
        feedbacks.sort(key=lambda item: item.submitted_at, reverse=True)
        latest_feedback = self.feedback_view(feedbacks[0]) if feedbacks else None
        return {
            "rectificationId": record.rectification_id,
            "id": record.rectification_id,
            "sourceIssueId": record.source_issue_id,
            "responsibleOrgId": record.responsible_org_id,
            "responsibleDept": responsible_org_snapshot.get("orgName")
            or (org.org_name if org else ""),
            "responsibleOrgSnapshot": responsible_org_snapshot,
            "issueDescription": record.issue_description,
            "rectificationGoal": record.rectification_goal,
            "riskLevel": record.risk_level,
            "dueDate": record.due_date,
            "status": record.status,
            "extension": record.extension,
            "hqRejectReason": record.hq_reject_reason,
            "feedback": latest_feedback,
            "feedbackHistory": [self.feedback_view(fb) for fb in feedbacks],
            "publicPath": f"/compliance/branch/issues/rectifications/{record.rectification_id}",
        }

    def feedback_view(self, record: RectificationFeedbackRecord) -> dict[str, Any]:
        return {
            "feedbackId": record.feedback_id,
            "rectificationId": record.rectification_id,
            "content": record.content,
            "fileIds": record.file_ids,
            "files": [
                evidence_store.file_view(evidence_store.file_assets[fid])
                for fid in record.file_ids
                if fid in evidence_store.file_assets
            ],
            "submittedBy": record.submitted_by,
            "submittedByName": (
                record.submitted_by_snapshot or {}
            ).get("displayName", ""),
            "submittedBySnapshot": record.submitted_by_snapshot,
            "submittedAt": record.submitted_at,
        }

    # ------------------------------------------------------------------
    # Permission & scope helpers
    # ------------------------------------------------------------------

    def _require_issue_read(self, user: AuthUserRecord, auth_store: SeedAuthStore) -> None:
        """Either HQ issue permission or branch scoped."""
        if auth_store.has_permission(user, "PERM-ISSUE-HQ"):
            return
        if auth_store.has_permission(user, "PERM-HQ-INSPECTION-MANAGE"):
            return
        if auth_store.has_permission(user, "PERM-ISSUE-BRANCH"):
            return
        if auth_store.has_permission(user, "PERM-BRANCH-INSPECTION-HANDLE"):
            return
        raise ForbiddenError()

    def _require_hq_supervision(self, user: AuthUserRecord, auth_store: SeedAuthStore) -> None:
        if auth_store.has_permission(user, "PERM-ISSUE-HQ"):
            return
        if auth_store.has_permission(user, "PERM-HQ-INSPECTION-MANAGE"):
            return
        raise ForbiddenError()

    def _require_branch_rectification_scope(
        self,
        rec: RectificationRecordData,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> None:
        if not (
            auth_store.has_permission(user, "PERM-ISSUE-BRANCH")
            or auth_store.has_permission(user, "PERM-BRANCH-INSPECTION-HANDLE")
        ):
            raise ForbiddenError()
        if not auth_store.org_in_scope(user, rec.responsible_org_id):
            raise AppError(
                code="RECTIFICATION_NOT_ASSIGNED_TO_BRANCH",
                message="Rectification is not assigned to current branch",
                status_code=403,
            )

    def _visible_issues(
        self, user: AuthUserRecord, auth_store: SeedAuthStore
    ) -> list[ComplianceIssueRecord]:
        if auth_store.has_permission(user, "PERM-ISSUE-HQ") or auth_store.has_permission(
            user, "PERM-HQ-INSPECTION-MANAGE"
        ):
            return list(self.issues.values())
        # Branch scoped
        return [
            issue
            for issue in self.issues.values()
            if auth_store.org_in_scope(user, issue.responsible_org_id)
        ]

    def _visible_rectifications(
        self, user: AuthUserRecord, auth_store: SeedAuthStore
    ) -> list[RectificationRecordData]:
        if auth_store.has_permission(user, "PERM-ISSUE-HQ") or auth_store.has_permission(
            user, "PERM-HQ-INSPECTION-MANAGE"
        ):
            return list(self.rectifications.values())
        # Branch scoped
        return [
            rec
            for rec in self.rectifications.values()
            if auth_store.org_in_scope(user, rec.responsible_org_id)
        ]

    def _issue_visible_to_user(
        self, issue: ComplianceIssueRecord, user: AuthUserRecord, auth_store: SeedAuthStore
    ) -> bool:
        if auth_store.has_permission(user, "PERM-ISSUE-HQ") or auth_store.has_permission(
            user, "PERM-HQ-INSPECTION-MANAGE"
        ):
            return True
        return auth_store.org_in_scope(user, issue.responsible_org_id)

    @staticmethod
    def _matches_issue_keyword(issue: ComplianceIssueRecord, keyword: str | None) -> bool:
        if not keyword:
            return True
        normalized = keyword.lower()
        return (
            normalized in issue.title.lower()
            or normalized in issue.issue_code.lower()
            or normalized in issue.description.lower()
            or normalized in issue.source_project.lower()
        )

    def _get_issue(self, issue_id: str) -> ComplianceIssueRecord:
        issue = self.issues.get(issue_id)
        if not issue:
            raise NotFoundError("Compliance issue not found")
        return issue

    def _get_rectification(self, rectification_id: str) -> RectificationRecordData:
        rec = self.rectifications.get(rectification_id)
        if not rec:
            raise NotFoundError("Rectification record not found")
        return rec

    # ------------------------------------------------------------------
    # Seed data builders
    # ------------------------------------------------------------------

    @staticmethod
    def _build_compliance_issues() -> dict[str, ComplianceIssueRecord]:
        records = [
            ComplianceIssueRecord(
                issue_id="CI-WLZQ-2026-001",
                issue_code="CI-WLZQ-AML-001",
                title="客户身份识别资料缺失（台账）",
                source_type="INSPECTION",
                source_id="INSP-PLAN-WLZQ-2026-AML-001",
                source_project="2026年反洗钱专项检查",
                business_line="财富管理",
                responsible_org_id="WLZQ-RBC-GZ-NANSHA",
                responsible_dept="广州南沙营业部",
                risk_level="HIGH",
                status="PENDING_RECTIFICATION",
                discovery_date=relative_date_iso(-36),
                sla_deadline=relative_date_iso(55),
                description="抽样客户档案中缺少受益所有人识别材料。",
                rectification_advice="补充完善客户受益所有人信息，确保100%合规。",
                basis_rule="反洗钱客户身份识别检查要点第3条",
            ),
            ComplianceIssueRecord(
                issue_id="CI-WLZQ-2026-002",
                issue_code="CI-WLZQ-AML-002",
                title="高风险客户持续尽调记录不完整",
                source_type="INSPECTION",
                source_id="INSP-PLAN-WLZQ-2026-AML-001",
                source_project="2026年反洗钱专项检查",
                business_line="财富管理",
                responsible_org_id="WLZQ-RBC-GZ-NANSHA",
                responsible_dept="广州南沙营业部",
                risk_level="MEDIUM",
                status="RECTIFYING",
                discovery_date=relative_date_iso(-36),
                sla_deadline=relative_date_iso(-7),
                description="部分高风险客户复核材料未在系统中完整留痕。",
                rectification_advice="对高风险客户档案逐一核查并补齐缺失材料。",
                basis_rule="反洗钱持续尽调检查要点第5条",
            ),
            ComplianceIssueRecord(
                issue_id="CI-WLZQ-2026-003",
                issue_code="CI-WLZQ-AML-003",
                title="深圳分公司范围隔离测试问题（台账）",
                source_type="INSPECTION",
                source_id="INSP-PLAN-WLZQ-2026-AML-001",
                source_project="2026年反洗钱专项检查",
                business_line="自营业务",
                responsible_org_id="WLZQ-RBC-SHENZHEN",
                responsible_dept="深圳分公司",
                risk_level="LOW",
                status="PENDING_RECTIFICATION",
                discovery_date=relative_date_iso(-31),
                sla_deadline=relative_date_iso(91),
                description="用于验证分支机构只能查看和处理本机构负责的问题。",
                rectification_advice="测试整改建议。",
                basis_rule="测试规则",
            ),
            ComplianceIssueRecord(
                issue_id="CI-WLZQ-2026-004",
                issue_code="CI-WLZQ-AML-004",
                title="已关闭的问题（用于测试关闭后不可再提交）",
                source_type="INSPECTION",
                source_id="INSP-PLAN-WLZQ-2026-GUARDRAIL-001",
                source_project="2026年分支机构整改闭环专项检查",
                business_line="财富管理",
                responsible_org_id="WLZQ-RBC-GZ-NANSHA",
                responsible_dept="广州南沙营业部",
                risk_level="LOW",
                status="CLOSED",
                discovery_date=relative_date_iso(-81),
                sla_deadline=relative_date_iso(60),
                description="此问题已完成整改闭环，用于验证已关闭的记录不可再提交。",
                rectification_advice="已完成。",
                basis_rule="测试规则",
            ),
        ]
        return {record.issue_id: record for record in records}

    @staticmethod
    def _build_rectification_records() -> dict[str, RectificationRecordData]:
        records = [
            RectificationRecordData(
                rectification_id="RECT-WLZQ-2026-001",
                source_issue_id="CI-WLZQ-2026-001",
                responsible_org_id="WLZQ-RBC-GZ-NANSHA",
                issue_description="抽样客户档案中缺少受益所有人识别材料。",
                rectification_goal="补充完善客户受益所有人信息，确保100%合规。",
                risk_level="HIGH",
                due_date=relative_date_iso(55),
                status="PENDING_RECTIFICATION",
            ),
            RectificationRecordData(
                rectification_id="RECT-WLZQ-2026-002",
                source_issue_id="CI-WLZQ-2026-002",
                responsible_org_id="WLZQ-RBC-GZ-NANSHA",
                issue_description="部分高风险客户复核材料未在系统中完整留痕。",
                rectification_goal="对高风险客户档案逐一核查并补齐缺失材料。",
                risk_level="MEDIUM",
                due_date=relative_date_iso(-7),
                status="RECTIFYING",
            ),
            RectificationRecordData(
                rectification_id="RECT-WLZQ-2026-003",
                source_issue_id="CI-WLZQ-2026-003",
                responsible_org_id="WLZQ-RBC-SHENZHEN",
                issue_description="用于验证分支机构只能查看和处理本机构负责的问题。",
                rectification_goal="测试整改目标。",
                risk_level="LOW",
                due_date=relative_date_iso(91),
                status="PENDING_RECTIFICATION",
            ),
            RectificationRecordData(
                rectification_id="RECT-WLZQ-2026-004",
                source_issue_id="CI-WLZQ-2026-004",
                responsible_org_id="WLZQ-RBC-GZ-NANSHA",
                issue_description="此问题已完成整改闭环，用于验证已关闭的记录不可再提交。",
                rectification_goal="已完成。",
                risk_level="LOW",
                due_date=relative_date_iso(60),
                status="CLOSED",
            ),
        ]
        return {record.rectification_id: record for record in records}


rectification_store = SeedRectificationStore()
