from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from operator import attrgetter
from typing import Any

from app.modules.compliance.core.config import get_settings
from app.modules.compliance.core.errors import AppError, ForbiddenError
from app.modules.compliance.domain.auth_store import AuthUserRecord, SeedAuthStore
from app.modules.compliance.domain.dictionaries import validate_code, validate_codes
from app.modules.compliance.domain.file_policy import (
    ALLOWED_FILE_TYPES,
    DEFAULT_SCAN_STATUS,
    MAX_FILE_SIZE,
)
from app.modules.compliance.domain.inspection_plan_store import (
    IntegrationEventRecord,
    inspection_plan_store,
)
from app.modules.compliance.domain.seed_time import relative_date_iso, relative_datetime_iso, seed_base_date
from app.modules.compliance.providers.storage import ObjectStorageProvider

BUSINESS_NOW = seed_base_date()
WORKING_PAPER_RESULTS = {"DRAFT", "RECORDED", "NEEDS_FOLLOWUP", "ISSUE_CANDIDATE", "CLOSED"}
LEGACY_WORKING_PAPER_RESULTS = {"PENDING", "NO_ISSUE", "DEFICIENCY", "NOT_APPLICABLE", "COMPLETED"}


@dataclass
class EvidenceRequirementRecord:
    requirement_id: str
    inspection_plan_id: str
    title: str
    description: str
    required_tags: list[str]
    due_date: str
    target_org_ids: list[str]
    target_org_snapshots: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class FileAssetRecord:
    file_id: str
    file_name: str
    content_type: str
    file_size: int
    storage_key: str
    checksum: str
    uploaded_by: str
    uploaded_at: str
    scan_status: str = DEFAULT_SCAN_STATUS
    uploaded_by_snapshot: dict[str, Any] = field(default_factory=dict)


@dataclass
class EvidenceSubmissionRecord:
    evidence_submission_id: str
    requirement_id: str
    inspection_plan_id: str
    branch_id: str
    file_ids: list[str]
    status: str
    submitted_by: str
    submitted_at: str
    branch_snapshot: dict[str, Any] = field(default_factory=dict)
    submitted_by_snapshot: dict[str, Any] = field(default_factory=dict)
    hq_feedback: str | None = None
    related_issue_id: str | None = None
    reviewed_by: str | None = None
    reviewed_by_snapshot: dict[str, Any] = field(default_factory=dict)
    reviewed_at: str | None = None
    review_comment: str | None = None
    review_idempotency_key: str | None = None


@dataclass
class WorkingPaperRecord:
    working_paper_id: str
    inspection_plan_id: str
    paper_code: str
    title: str
    category: str
    inspector_user_id: str
    branch_id: str
    guidelines: list[str]
    procedure: str
    result: str
    execution_record: str
    file_ids: list[str] = field(default_factory=list)
    evidence_list: list[str] = field(default_factory=list)
    converted_issue_id: str | None = None
    related_issue_id: str | None = None
    created_at: str = field(default_factory=relative_datetime_iso)
    updated_at: str = field(default_factory=relative_datetime_iso)
    inspector_snapshot: dict[str, Any] = field(default_factory=dict)
    target_org_snapshot: dict[str, Any] = field(default_factory=dict)


class SeedEvidenceStore:
    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self.requirements = self._build_requirements()
        self.file_assets: dict[str, FileAssetRecord] = {}
        self.submissions: dict[str, EvidenceSubmissionRecord] = {}
        self.working_papers = self._build_working_papers()
        self.events: dict[str, IntegrationEventRecord] = {}
        self._seed_file_assets()

    def _seed_file_assets(self) -> None:
        """Seed lightweight non-sensitive file assets for SIT closeout verification."""
        seed_files = [
            {
                "file_id": "FILE-SEED-0001",
                "file_name": "inspection-notice-sample.txt",
                "content_type": "text/plain",
                "file_size": 256,
                "storage_key": "seed/inspection-notice-sample.txt",
                "checksum": "a" * 64,
                "uploaded_by": "USER-HQ-COMP-001",
                "scan_status": "SCAN_DEFERRED",
            },
            {
                "file_id": "FILE-SEED-0002",
                "file_name": "onsite-scheme-sample.txt",
                "content_type": "text/plain",
                "file_size": 512,
                "storage_key": "seed/onsite-scheme-sample.txt",
                "checksum": "b" * 64,
                "uploaded_by": "USER-HQ-COMP-001",
                "scan_status": "SCAN_DEFERRED",
            },
            {
                "file_id": "FILE-SEED-0003",
                "file_name": "working-paper-template.txt",
                "content_type": "text/plain",
                "file_size": 128,
                "storage_key": "seed/working-paper-template.txt",
                "checksum": "c" * 64,
                "uploaded_by": "USER-HQ-COMP-001",
                "scan_status": "SCAN_DEFERRED",
            },
            {
                "file_id": "FILE-SEED-0004",
                "file_name": "other-reference-note.txt",
                "content_type": "text/plain",
                "file_size": 192,
                "storage_key": "seed/other-reference-note.txt",
                "checksum": "d" * 64,
                "uploaded_by": "USER-HQ-COMP-001",
                "scan_status": "SCAN_DEFERRED",
            },
            {
                "file_id": "FILE-SEED-0005",
                "file_name": "file02-inspection-notice.pdf",
                "content_type": "application/pdf",
                "file_size": 231019,
                "storage_key": "seed/file02-inspection-notice.pdf",
                "checksum": "263700e1f55ac134fabb3ca3c35caa4ad15a6258e956e20490ff73b44b31dbe6",
                "uploaded_by": "USER-HQ-COMP-001",
                "scan_status": "SCAN_DEFERRED",
            },
            {
                "file_id": "FILE-SEED-0006",
                "file_name": "file02-onsite-scheme.docx",
                "content_type": (
                    "application/vnd.openxmlformats-officedocument."
                    "wordprocessingml.document"
                ),
                "file_size": 1629,
                "storage_key": "seed/file02-onsite-scheme.docx",
                "checksum": "719f1b52d267640cb834844684cf191d18600b8754c93103b511f1f11834e1e2",
                "uploaded_by": "USER-HQ-COMP-001",
                "scan_status": "SCAN_DEFERRED",
            },
            {
                "file_id": "FILE-SEED-0007",
                "file_name": "file02-working-paper-template.xlsx",
                "content_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "file_size": 2259,
                "storage_key": "seed/file02-working-paper-template.xlsx",
                "checksum": "ad61b46b75f0c4885a66a6843aa3b765d4923f9ebb24d12e102c7bef414038e4",
                "uploaded_by": "USER-HQ-COMP-001",
                "scan_status": "SCAN_DEFERRED",
            },
            {
                "file_id": "FILE-SEED-0008",
                "file_name": "file02-other-screenshot.png",
                "content_type": "image/png",
                "file_size": 102075,
                "storage_key": "seed/file02-other-screenshot.png",
                "checksum": "08dd8f7b45a1f2507e1dea350771ef798be420fb797f1aff56483a4a121979af",
                "uploaded_by": "USER-HQ-COMP-001",
                "scan_status": "SCAN_DEFERRED",
            },
        ]
        for f in seed_files:
            self.file_assets[f["file_id"]] = FileAssetRecord(
                file_id=f["file_id"],
                file_name=f["file_name"],
                content_type=f["content_type"],
                file_size=f["file_size"],
                storage_key=f["storage_key"],
                checksum=f["checksum"],
                uploaded_by=f["uploaded_by"],
                uploaded_at=relative_datetime_iso(),
                scan_status=f["scan_status"],
            )

    def requirements_for_plan(
        self,
        *,
        inspection_plan_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> list[dict[str, Any]]:
        plan = inspection_plan_store._get_plan(inspection_plan_id)
        if not self._can_read_plan(plan.target_org_ids, user, auth_store):
            raise ForbiddenError()
        return [
            self.requirement_view(requirement)
            for requirement in self.requirements.values()
            if requirement.inspection_plan_id == inspection_plan_id
            and self._requirement_visible_to_user(requirement, user, auth_store)
        ]

    async def upload_file(
        self,
        *,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        storage: ObjectStorageProvider,
        file_name: str,
        content_type: str,
        content: bytes,
    ) -> dict[str, Any]:
        if not self._can_upload(user, auth_store):
            raise ForbiddenError()
        if content_type not in ALLOWED_FILE_TYPES:
            raise AppError(
                code="FILE_TYPE_INVALID",
                message="File type is not allowed",
                status_code=422,
            )
        max_file_size = get_settings().upload_max_file_size_bytes or MAX_FILE_SIZE
        if len(content) > max_file_size:
            raise AppError(
                code="FILE_SIZE_EXCEEDED",
                message="File size exceeds the maximum allowed size",
                status_code=413,
            )
        file_id = f"FILE-SEED-{len(self.file_assets) + 1:04d}"
        storage_key = f"inspection/{user.user_id}/{file_id}/{file_name}"
        try:
            stored = await storage.put_object(
                key=storage_key,
                content=content,
                content_type=content_type,
            )
        except Exception as exc:
            raise AppError(code="UPLOAD_FAILED", message="Upload failed", status_code=502) from exc
        record = FileAssetRecord(
            file_id=file_id,
            file_name=file_name,
            content_type=stored.content_type,
            file_size=stored.size,
            storage_key=stored.storage_key,
            checksum=stored.checksum or "",
            uploaded_by=user.user_id,
            uploaded_at=relative_datetime_iso(),
            scan_status=DEFAULT_SCAN_STATUS,
            uploaded_by_snapshot=auth_store.user_snapshot(user.user_id),
        )
        self.file_assets[file_id] = record
        return self.file_view(record)

    def create_evidence_submission(
        self,
        *,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        requirement_id: str,
        file_ids: list[str],
    ) -> dict[str, Any]:
        requirement = self.requirements.get(requirement_id)
        if not requirement:
            raise AppError(
                code="REQUIREMENT_NOT_FOUND",
                message="Evidence requirement not found",
                status_code=404,
            )
        if not self._can_submit_requirement(requirement, user, auth_store):
            raise ForbiddenError()
        if date.fromisoformat(requirement.due_date) < BUSINESS_NOW:
            raise AppError(
                code="DEADLINE_PASSED",
                message="Evidence deadline passed",
                status_code=409,
            )
        self.require_file_assets_for_user(
            file_ids=file_ids,
            user=user,
            auth_store=auth_store,
        )
        latest_submission = self._latest_submission_for_requirement_branch(
            requirement_id=requirement.requirement_id,
            branch_id=user.org_id,
        )
        if latest_submission and latest_submission.status == "SUBMITTED":
            raise AppError(
                code="SUBMISSION_ALREADY_PENDING_REVIEW",
                message="Evidence submission is already pending review",
                status_code=409,
            )
        if latest_submission and latest_submission.status == "APPROVED":
            raise AppError(
                code="SUBMISSION_ALREADY_APPROVED",
                message="Evidence submission is already approved",
                status_code=409,
            )
        if latest_submission and latest_submission.status != "REJECTED":
            raise AppError(
                code="INVALID_SUBMISSION_STATUS",
                message="Evidence submission cannot be resubmitted in its current status",
                status_code=409,
            )
        submission_id = f"EVSUB-SEED-{len(self.submissions) + 1:04d}"
        submission = EvidenceSubmissionRecord(
            evidence_submission_id=submission_id,
            requirement_id=requirement.requirement_id,
            inspection_plan_id=requirement.inspection_plan_id,
            branch_id=user.org_id,
            file_ids=file_ids,
            status="SUBMITTED",
            submitted_by=user.user_id,
            submitted_at=relative_datetime_iso(),
            branch_snapshot=auth_store.org_snapshot(user.org_id),
            submitted_by_snapshot=auth_store.user_snapshot(user.user_id),
        )
        self.submissions[submission_id] = submission
        return self.submission_view(submission, auth_store)

    def review_evidence_submission(
        self,
        *,
        submission_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        decision: str,
        feedback: str | None = None,
        comment: str | None = None,
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        auth_store.require_permission(user, "PERM-HQ-INSPECTION-MANAGE")
        submission = self.submissions.get(submission_id)
        if not submission:
            raise AppError(
                code="EVIDENCE_SUBMISSION_NOT_FOUND",
                message="Evidence submission not found",
                status_code=404,
            )
        normalized_decision = decision.strip().upper()
        if normalized_decision not in {"APPROVE", "REJECT"}:
            raise AppError(
                code="INVALID_REVIEW_DECISION",
                message="Review decision must be APPROVE or REJECT",
                status_code=422,
            )
        review_text = (feedback or comment or "").strip()
        if normalized_decision == "REJECT" and not review_text:
            raise AppError(
                code="REJECT_REASON_REQUIRED",
                message="Reject reason is required",
                status_code=422,
            )
        target_status = "APPROVED" if normalized_decision == "APPROVE" else "REJECTED"
        if submission.status != "SUBMITTED":
            if (
                idempotency_key
                and submission.review_idempotency_key == idempotency_key
                and submission.status == target_status
                and (submission.review_comment or "") == review_text
            ):
                return self.submission_view(submission, auth_store)
            raise AppError(
                code="INVALID_SUBMISSION_STATUS",
                message="Only submitted evidence can be reviewed",
                status_code=409,
            )
        submission.status = target_status
        submission.hq_feedback = review_text or None
        submission.review_comment = review_text or None
        submission.review_idempotency_key = idempotency_key
        submission.reviewed_by = user.user_id
        submission.reviewed_by_snapshot = auth_store.user_snapshot(user.user_id)
        submission.reviewed_at = relative_datetime_iso()
        return self.submission_view(submission, auth_store)

    def require_file_assets_for_user(
        self,
        *,
        file_ids: list[str],
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> list[FileAssetRecord]:
        missing_file_ids = [file_id for file_id in file_ids if file_id not in self.file_assets]
        if missing_file_ids:
            raise AppError(
                code="FILE_ASSET_NOT_FOUND",
                message="File asset not found",
                status_code=404,
                details={"fileIds": missing_file_ids},
            )
        if auth_store.has_permission(user, "PERM-BRANCH-INSPECTION-HANDLE"):
            cross_scope_file_ids = [
                file_id
                for file_id in file_ids
                if not auth_store.org_in_scope(
                    user,
                    auth_store.users[self.file_assets[file_id].uploaded_by].org_id,
                )
            ]
            if cross_scope_file_ids:
                raise AppError(
                    code="FILE_ASSET_NOT_FOUND",
                    message="File asset not found",
                    status_code=404,
                    details={"fileIds": cross_scope_file_ids},
                )
        return [self.file_assets[file_id] for file_id in file_ids]

    def can_download_via_plan_scope(
        self,
        *,
        file_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> bool:
        """Plan-scoped download exception for target-branch users.

        When a file is bound to an InspectionPlan.files record, the current
        user's org is in that plan's target_org_ids, and the plan phase is
        at least PLAN_APPROVED, allow download even if the generic
        FileAsset organization scope would deny it.
        """
        if not auth_store.has_permission(user, "PERM-BRANCH-INSPECTION-HANDLE"):
            return False
        for plan in inspection_plan_store.plans.values():
            plan_file_ids = {f.get("fileId") for f in plan.files}
            if file_id not in plan_file_ids:
                continue
            if not any(auth_store.org_in_scope(user, org_id) for org_id in plan.target_org_ids):
                continue
            approved_phases = {
                "PLAN_APPROVED",
                "EVIDENCE_COLLECTING",
                "EXECUTION_IN_PROGRESS",
                "FACT_CONFIRMATION",
                "ADJUDICATION",
                "REPORTING",
                "RECTIFICATION",
                "CLOSED",
            }
            if plan.phase in approved_phases:
                return True
        return False

    def execution_summary(
        self,
        *,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        year: int | None = None,
        status: str | None = None,
        phase: str | None = None,
        business_line: str | None = None,
        target_org_id: str | None = None,
    ) -> dict[str, Any]:
        if not auth_store.has_permission(user, "PERM-HQ-INSPECTION-MANAGE"):
            raise ForbiddenError()
        validate_codes(
            (status, "inspection_status", "status"),
            (phase, "inspection_phase", "phase"),
            (business_line, "business_line", "businessLine"),
        )
        plans = list(inspection_plan_store.plans.values())
        filtered = [
            plan
            for plan in plans
            if (year is None or plan.planned_start_date.startswith(str(year)))
            and (status is None or plan.status == status)
            and (phase is None or plan.phase == phase)
            and (target_org_id is None or target_org_id in plan.target_org_ids)
        ]
        if business_line:
            filtered = [plan for plan in filtered if business_line in plan.title]
        requirement_ids = {
            item.requirement_id
            for item in self.requirements.values()
            if item.inspection_plan_id in {plan.inspection_plan_id for plan in filtered}
        }
        submissions = self._latest_submissions(
            inspection_plan_ids={plan.inspection_plan_id for plan in filtered},
        )
        submitted_requirement_ids = {item.requirement_id for item in submissions}
        approved_requirement_ids = {
            item.requirement_id for item in submissions if item.status == "APPROVED"
        }
        rejected_requirement_ids = {
            item.requirement_id for item in submissions if item.status == "REJECTED"
        }
        overdue_requirements = [
            item
            for item in self.requirements.values()
            if item.requirement_id in requirement_ids
            and item.requirement_id not in submitted_requirement_ids
            and date.fromisoformat(item.due_date) < BUSINESS_NOW
        ]
        return {
            "cards": {
                "planCount": len(filtered),
                "requirementCount": len(requirement_ids),
                "submittedRequirementCount": len(submitted_requirement_ids),
                "approvedRequirementCount": len(approved_requirement_ids),
                "rejectedRequirementCount": len(rejected_requirement_ids),
                "pendingRequirementCount": len(requirement_ids - submitted_requirement_ids),
                "overdueRequirementCount": len(overdue_requirements),
                "workingPaperCount": len(
                    [
                        item
                        for item in self.working_papers.values()
                        if item.inspection_plan_id in {plan.inspection_plan_id for plan in filtered}
                    ],
                ),
            },
            "flightBoard": [
                {
                    "inspectionPlanId": plan.inspection_plan_id,
                    "title": plan.title,
                    "status": plan.status,
                    "phase": plan.phase,
                    "phaseProgress": plan.phase_progress,
                    "targetOrgIds": plan.target_org_ids,
                    "submittedRequirementCount": len(
                        [
                            item
                            for item in submissions
                            if item.inspection_plan_id == plan.inspection_plan_id
                        ],
                    ),
                }
                for plan in filtered
            ],
        }

    def execution_detail(
        self,
        *,
        inspection_plan_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        branch_id: str | None = None,
    ) -> dict[str, Any]:
        plan = inspection_plan_store._get_plan(inspection_plan_id)
        if not self._can_read_plan(plan.target_org_ids, user, auth_store):
            raise ForbiddenError()
        if auth_store.has_permission(user, "PERM-HQ-INSPECTION-MANAGE"):
            target_branch_id = branch_id or (
                plan.target_org_ids[0] if plan.target_org_ids else None
            )
        else:
            target_branch_id = next(
                (org_id for org_id in plan.target_org_ids if auth_store.org_in_scope(user, org_id)),
                None,
            )
            if target_branch_id is None:
                raise ForbiddenError()
        requirements = [
            self.requirement_view(item)
            for item in self.requirements.values()
            if item.inspection_plan_id == inspection_plan_id
            and (target_branch_id is None or target_branch_id in item.target_org_ids)
        ]
        latest_submission_records = self._latest_submissions(
            inspection_plan_ids={inspection_plan_id},
            branch_id=target_branch_id,
        )
        submissions = [self.submission_view(item, auth_store) for item in latest_submission_records]
        working_papers = [
            self.working_paper_view(item, auth_store)
            for item in self.working_papers.values()
            if item.inspection_plan_id == inspection_plan_id
        ]
        return {
            "inspectionPlan": inspection_plan_store.plan_view(plan, auth_store),
            "branchId": target_branch_id,
            "evidenceRequirements": requirements,
            "evidenceSubmissions": submissions,
            "workingPapers": working_papers,
            "executionStats": {
                "requirementCount": len(requirements),
                "submissionCount": len(submissions),
                "submittedRequirementCount": len(submissions),
                "approvedRequirementCount": len(
                    [item for item in latest_submission_records if item.status == "APPROVED"]
                ),
                "rejectedRequirementCount": len(
                    [item for item in latest_submission_records if item.status == "REJECTED"]
                ),
                "workingPaperCount": len(working_papers),
                "pendingRequirementCount": len(requirements) - len(submissions),
            },
        }

    def list_working_papers(
        self,
        *,
        inspection_plan_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        plan = inspection_plan_store._get_plan(inspection_plan_id)
        self._require_hq_working_paper_access(plan.target_org_ids, user, auth_store)
        items = [
            self.working_paper_view(item, auth_store)
            for item in self.working_papers.values()
            if item.inspection_plan_id == inspection_plan_id
        ]
        return {"items": items, "total": len(items)}

    def create_working_paper(
        self,
        *,
        inspection_plan_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        plan = inspection_plan_store._get_plan(inspection_plan_id)
        self._require_hq_working_paper_access(plan.target_org_ids, user, auth_store)
        branch_id = payload.get("branchId") or payload.get("targetOrgId")
        if branch_id not in plan.target_org_ids:
            raise AppError(
                code="WORKING_PAPER_TARGET_NOT_IN_PLAN",
                message="Working paper target org must belong to the inspection plan",
                status_code=422,
            )
        result = (payload.get("result") or "DRAFT").strip().upper()
        self._validate_working_paper_result(result, allow_legacy=False)
        paper_code = payload["paperCode"].strip()
        if any(
            item.inspection_plan_id == inspection_plan_id and item.paper_code == paper_code
            for item in self.working_papers.values()
        ):
            raise AppError(
                code="WORKING_PAPER_CODE_EXISTS",
                message="Working paper code already exists for this inspection plan",
                status_code=409,
            )
        file_ids = payload.get("fileIds") or []
        self.require_file_assets_for_user(file_ids=file_ids, user=user, auth_store=auth_store)
        working_paper_id = f"WP-SEED-{len(self.working_papers) + 1:04d}"
        now = relative_datetime_iso()
        record = WorkingPaperRecord(
            working_paper_id=working_paper_id,
            inspection_plan_id=inspection_plan_id,
            paper_code=paper_code,
            title=payload["title"].strip(),
            category=payload["category"].strip(),
            inspector_user_id=user.user_id,
            branch_id=branch_id,
            guidelines=payload.get("guidelines") or [],
            procedure=payload["procedure"].strip(),
            result=result,
            execution_record=payload["executionRecord"].strip(),
            file_ids=file_ids,
            evidence_list=payload.get("evidenceList") or [],
            related_issue_id=payload.get("relatedIssueId"),
            converted_issue_id=payload.get("convertedIssueId"),
            created_at=now,
            updated_at=now,
            inspector_snapshot=auth_store.user_snapshot(user.user_id),
            target_org_snapshot=auth_store.org_snapshot(branch_id),
        )
        self.working_papers[working_paper_id] = record
        return self.working_paper_view(record, auth_store)

    def update_working_paper_result(
        self,
        *,
        working_paper_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        record = self.working_papers.get(working_paper_id)
        if not record:
            raise AppError(
                code="WORKING_PAPER_NOT_FOUND",
                message="Working paper not found",
                status_code=404,
            )
        plan = inspection_plan_store._get_plan(record.inspection_plan_id)
        self._require_hq_working_paper_access(plan.target_org_ids, user, auth_store)
        if "result" in payload and payload["result"] is not None:
            result = payload["result"].strip().upper()
            self._validate_working_paper_result(result, allow_legacy=False)
            record.result = result
        if payload.get("executionRecord") is not None:
            record.execution_record = payload["executionRecord"].strip()
        if payload.get("fileIds") is not None:
            file_ids = payload["fileIds"]
            self.require_file_assets_for_user(file_ids=file_ids, user=user, auth_store=auth_store)
            record.file_ids = file_ids
        if payload.get("evidenceList") is not None:
            record.evidence_list = payload["evidenceList"]
        if "relatedIssueId" in payload:
            record.related_issue_id = payload.get("relatedIssueId")
        if "convertedIssueId" in payload:
            record.converted_issue_id = payload.get("convertedIssueId")
        record.updated_at = relative_datetime_iso()
        return self.working_paper_view(record, auth_store)

    def create_ekp_reminder(
        self,
        *,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        target_type: str,
        target_id: str,
        message: str,
        channel: str = "EKP",
    ) -> dict[str, Any]:
        if not (
            auth_store.has_permission(user, "PERM-HQ-INSPECTION-MANAGE")
            or auth_store.has_permission(user, "PERM-ISSUE-HQ")
        ):
            raise ForbiddenError()
        validate_code(target_type, category="ekp_reminder_target_type", field="targetType")
        duplicate = next(
            (
                event
                for event in self.events.values()
                if event.target_type == target_type
                and event.target_id == target_id
                and event.payload.get("message") == message
            ),
            None,
        )
        if duplicate:
            raise AppError(
                code="DUPLICATE_REMINDER",
                message="Reminder already exists",
                status_code=409,
            )
        event_id = f"EVT-EKP-{len(self.events) + 1:04d}"
        event = IntegrationEventRecord(
            integration_event_id=event_id,
            type="EKP_REMINDER",
            target_type=target_type,
            target_id=target_id,
            payload={"message": message, "channel": channel},
            status="RECORDED",
            created_by=user.user_id,
            created_by_snapshot=auth_store.user_snapshot(user.user_id),
            created_at=relative_datetime_iso(),
        )
        self.events[event_id] = event
        return self.integration_event_view(event)

    def requirement_view(self, record: EvidenceRequirementRecord) -> dict[str, Any]:
        return {
            "requirementId": record.requirement_id,
            "id": record.requirement_id,
            "inspectionPlanId": record.inspection_plan_id,
            "inspectionId": record.inspection_plan_id,
            "title": record.title,
            "description": record.description,
            "requiredTags": record.required_tags,
            "dueDate": record.due_date,
            "targetOrgIds": record.target_org_ids,
            "publicPath": (
                f"/compliance/branch/inspection/materials/{record.inspection_plan_id}"
                f"/requirements/{record.requirement_id}"
            ),
        }

    def file_view(self, record: FileAssetRecord) -> dict[str, Any]:
        return {
            "fileId": record.file_id,
            "fileName": record.file_name,
            "contentType": record.content_type,
            "fileSize": record.file_size,
            "storageKey": record.storage_key,
            "checksum": record.checksum,
            "uploadedBy": record.uploaded_by,
            "uploadedBySnapshot": record.uploaded_by_snapshot,
            "uploadedAt": record.uploaded_at,
            "scanStatus": record.scan_status,
        }

    def submission_view(
        self,
        record: EvidenceSubmissionRecord,
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        branch = auth_store.orgs.get(record.branch_id)
        branch_snapshot = record.branch_snapshot or auth_store.org_snapshot(record.branch_id)
        submitted_by_snapshot = record.submitted_by_snapshot or auth_store.user_snapshot(
            record.submitted_by
        )
        reviewed_by_snapshot = (
            record.reviewed_by_snapshot
            if record.reviewed_by_snapshot
            else auth_store.user_snapshot(record.reviewed_by)
            if record.reviewed_by
            else {}
        )
        review_decision = None
        if record.status == "APPROVED":
            review_decision = "APPROVE"
        elif record.status == "REJECTED":
            review_decision = "REJECT"
        return {
            "evidenceSubmissionId": record.evidence_submission_id,
            "id": record.evidence_submission_id,
            "requirementId": record.requirement_id,
            "inspectionPlanId": record.inspection_plan_id,
            "branchId": record.branch_id,
            "branchName": branch_snapshot.get("orgName") or (branch.org_name if branch else ""),
            "branchSnapshot": branch_snapshot,
            "fileIds": record.file_ids,
            "files": [
                self.file_view(self.file_assets[file_id])
                for file_id in record.file_ids
                if file_id in self.file_assets
            ],
            "status": record.status,
            "submittedBy": record.submitted_by,
            "submittedByName": submitted_by_snapshot.get("displayName", ""),
            "submittedBySnapshot": submitted_by_snapshot,
            "submittedAt": record.submitted_at,
            "submitTime": record.submitted_at,
            "hqFeedback": record.hq_feedback,
            "relatedIssueId": record.related_issue_id,
            "reviewedBy": record.reviewed_by,
            "reviewedByName": reviewed_by_snapshot.get("displayName", ""),
            "reviewedBySnapshot": reviewed_by_snapshot,
            "reviewedAt": record.reviewed_at,
            "reviewComment": record.review_comment,
            "reviewDecision": review_decision,
        }

    def working_paper_view(
        self,
        record: WorkingPaperRecord,
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        inspector = auth_store.users.get(record.inspector_user_id)
        inspector_snapshot = record.inspector_snapshot or auth_store.user_snapshot(
            record.inspector_user_id
        )
        target_org_snapshot = record.target_org_snapshot or auth_store.org_snapshot(
            record.branch_id
        )
        return {
            "workingPaperId": record.working_paper_id,
            "id": record.working_paper_id,
            "inspectionPlanId": record.inspection_plan_id,
            "planId": record.inspection_plan_id,
            "paperCode": record.paper_code,
            "title": record.title,
            "category": record.category,
            "inspectorUserId": record.inspector_user_id,
            "inspector": inspector_snapshot.get("displayName")
            or (inspector.display_name if inspector else ""),
            "inspectorSnapshot": inspector_snapshot,
            "branchId": record.branch_id,
            "targetOrgId": record.branch_id,
            "targetOrgName": target_org_snapshot.get("orgName", ""),
            "targetOrgSnapshot": target_org_snapshot,
            "guidelines": record.guidelines,
            "procedure": record.procedure,
            "result": record.result,
            "executionRecord": record.execution_record,
            "fileIds": record.file_ids,
            "files": [
                self.file_view(self.file_assets[file_id])
                for file_id in record.file_ids
                if file_id in self.file_assets
            ],
            "evidenceList": record.evidence_list,
            "convertedIssueId": record.converted_issue_id,
            "relatedIssueId": record.related_issue_id,
            "createdAt": record.created_at,
            "updatedAt": record.updated_at,
            "updateTime": record.updated_at,
        }

    @staticmethod
    def integration_event_view(record: IntegrationEventRecord) -> dict[str, Any]:
        return {
            "integrationEventId": record.integration_event_id,
            "type": record.type,
            "targetType": record.target_type,
            "targetId": record.target_id,
            "payload": record.payload,
            "status": record.status,
            "createdBy": record.created_by,
            "createdBySnapshot": record.created_by_snapshot,
            "createdAt": record.created_at,
            "externalRef": record.external_ref,
        }

    def _latest_submission_for_requirement_branch(
        self,
        *,
        requirement_id: str,
        branch_id: str,
    ) -> EvidenceSubmissionRecord | None:
        submissions = [
            item
            for item in self.submissions.values()
            if item.requirement_id == requirement_id and item.branch_id == branch_id
        ]
        if not submissions:
            return None
        return max(submissions, key=attrgetter("submitted_at", "evidence_submission_id"))

    def _latest_submissions(
        self,
        *,
        inspection_plan_ids: set[str],
        branch_id: str | None = None,
    ) -> list[EvidenceSubmissionRecord]:
        latest: dict[tuple[str, str], EvidenceSubmissionRecord] = {}
        for submission in self.submissions.values():
            if submission.inspection_plan_id not in inspection_plan_ids:
                continue
            if branch_id is not None and submission.branch_id != branch_id:
                continue
            key = (submission.requirement_id, submission.branch_id)
            current = latest.get(key)
            if current is None or (
                submission.submitted_at,
                submission.evidence_submission_id,
            ) > (
                current.submitted_at,
                current.evidence_submission_id,
            ):
                latest[key] = submission
        return sorted(latest.values(), key=attrgetter("requirement_id", "branch_id"))

    def _requirement_visible_to_user(
        self,
        requirement: EvidenceRequirementRecord,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> bool:
        if auth_store.has_permission(user, "PERM-HQ-INSPECTION-MANAGE"):
            return True
        return any(auth_store.org_in_scope(user, org_id) for org_id in requirement.target_org_ids)

    def _can_read_plan(
        self,
        target_org_ids: list[str],
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> bool:
        if auth_store.has_permission(user, "PERM-HQ-INSPECTION-MANAGE"):
            return True
        return auth_store.has_permission(user, "PERM-BRANCH-INSPECTION-HANDLE") and (
            any(auth_store.org_in_scope(user, org_id) for org_id in target_org_ids)
        )

    def _can_submit_requirement(
        self,
        requirement: EvidenceRequirementRecord,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> bool:
        return auth_store.has_permission(user, "PERM-BRANCH-INSPECTION-HANDLE") and (
            any(auth_store.org_in_scope(user, org_id) for org_id in requirement.target_org_ids)
        )

    @staticmethod
    def _can_upload(user: AuthUserRecord, auth_store: SeedAuthStore) -> bool:
        return any(
            auth_store.has_permission(user, permission_id)
            for permission_id in (
                "PERM-BRANCH-INSPECTION-HANDLE",
                "PERM-HQ-INSPECTION-MANAGE",
                "PERM-ISSUE-HQ",
            )
        )

    def _require_hq_working_paper_access(
        self,
        target_org_ids: list[str],
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> None:
        if auth_store.has_permission(user, "PERM-HQ-INSPECTION-MANAGE"):
            return
        raise ForbiddenError()

    def _validate_working_paper_result(
        self,
        result: str,
        allow_legacy: bool = False,
    ) -> None:
        if result in WORKING_PAPER_RESULTS:
            return
        if allow_legacy and result in LEGACY_WORKING_PAPER_RESULTS:
            return
        raise AppError(
            code="INVALID_WORKING_PAPER_RESULT",
            message=(
                f"Invalid working paper result: {result}. "
                f"Must be one of {sorted(WORKING_PAPER_RESULTS)}"
            ),
            status_code=422,
        )

    def _build_requirements(self) -> dict[str, EvidenceRequirementRecord]:
        records = [
            EvidenceRequirementRecord(
                requirement_id="REQ-WLZQ-AML-001",
                inspection_plan_id="INSP-PLAN-WLZQ-2026-AML-001",
                title="反洗钱客户身份识别材料",
                description="提交抽样客户身份识别、受益所有人识别和持续尽调材料。",
                required_tags=["制度文件", "业务凭证", "自查报告"],
                due_date=relative_date_iso(20),
                target_org_ids=["WLZQ-RBC-GZ-NANSHA"],
                target_org_snapshots=[],
            ),
            EvidenceRequirementRecord(
                requirement_id="REQ-WLZQ-AML-OVERDUE-001",
                inspection_plan_id="INSP-PLAN-WLZQ-2026-AML-001",
                title="逾期材料补交测试要求",
                description="用于验证 DEADLINE_PASSED 的种子要求。",
                required_tags=["系统截图"],
                due_date=relative_date_iso(-20),
                target_org_ids=["WLZQ-RBC-GZ-NANSHA"],
                target_org_snapshots=[],
            ),
            EvidenceRequirementRecord(
                requirement_id="REQ-WLZQ-AML-SZ-001",
                inspection_plan_id="INSP-PLAN-WLZQ-2026-AML-001",
                title="深圳分公司抽样材料",
                description="用于验证分支机构范围隔离。",
                required_tags=["业务凭证"],
                due_date=relative_date_iso(20),
                target_org_ids=["WLZQ-RBC-SHENZHEN"],
                target_org_snapshots=[],
            ),
            EvidenceRequirementRecord(
                requirement_id="REQ-SIT-SEED-0015-NANSHA-001",
                inspection_plan_id="INSP-PLAN-SEED-0015",
                title="SIT-IMPL-01 实施材料自查包",
                description="提交本轮实施阶段材料链路验证所需的自查报告、业务凭证和制度文件。",
                required_tags=["制度文件", "业务凭证", "自查报告"],
                due_date=relative_date_iso(20),
                target_org_ids=["WLZQ-RBC-GZ-NANSHA"],
                target_org_snapshots=[],
            ),
        ]
        return {record.requirement_id: record for record in records}

    def _build_working_papers(self) -> dict[str, WorkingPaperRecord]:
        records = [
            WorkingPaperRecord(
                working_paper_id="WP-WLZQ-AML-001",
                inspection_plan_id="INSP-PLAN-WLZQ-2026-AML-001",
                paper_code="WP-AML-001",
                title="客户身份识别抽查底稿",
                category="反洗钱",
                inspector_user_id="USER-HQ-INSP-001",
                branch_id="WLZQ-RBC-GZ-NANSHA",
                guidelines=["检查客户身份识别资料完整性", "检查高风险客户持续尽调记录"],
                procedure="抽取样本并核对系统记录、纸质/电子材料和审批留痕。",
                result="PENDING",
                execution_record="待执行",
            ),
            WorkingPaperRecord(
                working_paper_id="WP-WLZQ-AML-REPORT-READY-001",
                inspection_plan_id="INSP-PLAN-WLZQ-2026-AML-REPORT-READY-001",
                paper_code="WP-AML-RR-001",
                title="报告出具夹具反洗钱检查底稿",
                category="反洗钱",
                inspector_user_id="USER-HQ-INSP-001",
                branch_id="WLZQ-RBC-GZ-NANSHA",
                guidelines=["复核事实确认结果", "复核申辩裁定结果", "汇总报告出具依据"],
                procedure="基于已确认问题、已裁定申辩和底稿摘要生成报告出具快照。",
                result="COMPLETED",
                execution_record="报告出具夹具已完成底稿复核。",
            ),
            WorkingPaperRecord(
                working_paper_id="WP-SIT-SEED-0015-001",
                inspection_plan_id="INSP-PLAN-SEED-0015",
                paper_code="WP-SIT-IMPL-02-SEED-001",
                title="SIT-IMPL-02 现场访谈记录底稿",
                category="ONSITE_INTERVIEW",
                inspector_user_id="USER-HQ-INSP-001",
                branch_id="WLZQ-RBC-GZ-NANSHA",
                guidelines=["核验材料自查包", "记录现场访谈和抽样过程"],
                procedure="围绕南沙分支材料包执行现场访谈和抽样复核。",
                result="DRAFT",
                execution_record="SIT-IMPL-02 seed 底稿待补充执行记录。",
                file_ids=["FILE-SEED-0003"],
            ),
        ]
        return {record.working_paper_id: record for record in records}


evidence_store = SeedEvidenceStore()
