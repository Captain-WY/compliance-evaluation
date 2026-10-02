from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from threading import RLock
from typing import Any

from app.modules.compliance.core.errors import AppError, ForbiddenError, NotFoundError
from app.modules.compliance.domain.auth_store import AuthUserRecord, SeedAuthStore
from app.modules.compliance.domain.evidence_store import FileAssetRecord, evidence_store
from app.modules.compliance.domain.inspection_plan_store import InspectionPlanRecord, inspection_plan_store
from app.modules.compliance.domain.issue_store import issue_store
from app.modules.compliance.domain.rectification_store import (
    ComplianceIssueRecord,
    RectificationRecordData,
    rectification_store,
)
from app.modules.compliance.domain.seed_time import relative_date_iso, relative_datetime_iso
from app.modules.compliance.domain.task_store import UnifiedTaskActionTargetRecord, UnifiedTaskRecord, task_store

REPORT_STATUSES = {"DRAFT_GENERATED", "FINAL_UPLOADED", "RELEASED", "SUPERSEDED"}
REPORT_METHODS = {"SYSTEM_GENERATED", "MANUAL_UPLOAD"}
PENDING_APPEAL_STATUSES = {"SUBMITTED", "UNDER_ADJUDICATION"}
PENDING_FACT_STATUSES = {"PENDING_CONFIRMATION", "APPEALED"}
PDF_CONTENT_TYPES = {"application/pdf"}


@dataclass
class InspectionReportVersionRecord:
    report_version_id: str
    inspection_plan_id: str
    version_no: str
    label: str
    method: str
    status: str
    file_asset_id: str | None
    supporting_file_asset_ids: list[str]
    source_snapshot_hash: str
    source_summary: dict[str, Any]
    created_by: str
    created_by_snapshot: dict[str, Any]
    created_at: str
    remarks: str | None = None
    released_at: str | None = None
    released_by: str | None = None
    released_by_snapshot: dict[str, Any] | None = None
    optimistic_version: int = 1
    idempotency_key: str | None = None
    payload_hash: str | None = None


@dataclass
class InspectionReportAuditEventRecord:
    report_audit_event_id: str
    inspection_plan_id: str
    report_version_id: str | None
    action: str
    actor_user_id: str
    actor_org_id: str
    actor_snapshot: dict[str, Any]
    occurred_at: str
    request_id: str | None = None
    idempotency_key: str | None = None
    payload_hash: str | None = None
    from_status: str | None = None
    to_status: str | None = None
    file_asset_ids: list[str] = field(default_factory=list)
    details: dict[str, Any] = field(default_factory=dict)


@dataclass
class InspectionReportCommandRecord:
    command_key_id: str
    inspection_plan_id: str
    command_type: str
    actor_user_id: str
    idempotency_key: str
    payload_hash: str
    result_ref: str
    created_at: str


class SeedInspectionReportStore:
    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self.versions: dict[str, InspectionReportVersionRecord] = {}
        self.audit_events: dict[str, InspectionReportAuditEventRecord] = {}
        self.command_keys: dict[tuple[str, str, str, str], InspectionReportCommandRecord] = {}
        self._lock = RLock()

    def hydrate(
        self,
        *,
        versions: dict[str, InspectionReportVersionRecord],
        audit_events: dict[str, InspectionReportAuditEventRecord],
        command_keys: dict[tuple[str, str, str, str], InspectionReportCommandRecord],
    ) -> None:
        with self._lock:
            self.versions = dict(versions)
            self.audit_events = dict(audit_events)
            self.command_keys = dict(command_keys)

    def workspace(
        self,
        *,
        inspection_plan_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        idempotent_replay: bool = False,
    ) -> dict[str, Any]:
        self._require_read(user, auth_store)
        plan = self._get_scoped_plan(inspection_plan_id, user, auth_store)
        return self.workspace_view(
            plan=plan,
            user=user,
            auth_store=auth_store,
            idempotent_replay=idempotent_replay,
        )

    def generate_draft(
        self,
        *,
        inspection_plan_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        payload: dict[str, Any],
        request_id: str | None = None,
    ) -> dict[str, Any]:
        with self._lock:
            self._require_manage(user, auth_store)
            plan = self._get_scoped_plan(inspection_plan_id, user, auth_store)
            fmt = (payload.get("format") or "DOCX").upper()
            remarks = payload.get("remarks")
            idempotency_key = self._require_idempotency_key(payload.get("idempotencyKey"))
            payload_hash = self._payload_hash(
                {
                    "inspectionPlanId": inspection_plan_id,
                    "format": fmt,
                    "remarks": remarks or "",
                }
            )
            replay = self._command_replay(
                inspection_plan_id=inspection_plan_id,
                command_type="generate",
                actor_user_id=user.user_id,
                idempotency_key=idempotency_key,
                payload_hash=payload_hash,
            )
            if replay:
                return self.version_view(
                    self._get_version(replay.result_ref, inspection_plan_id),
                    auth_store,
                    idempotent_replay=True,
                )

            readiness = self._readiness(plan, auth_store)
            self._assert_report_phase(plan)
            self._assert_generation_unblocked(readiness)
            source_snapshot = self._source_snapshot(plan)
            version = InspectionReportVersionRecord(
                report_version_id=self._next_version_id(plan.inspection_plan_id),
                inspection_plan_id=plan.inspection_plan_id,
                version_no=self._next_version_no(plan.inspection_plan_id, draft=True),
                label="Generated draft inspection report",
                method="SYSTEM_GENERATED",
                status="DRAFT_GENERATED",
                file_asset_id=None,
                supporting_file_asset_ids=[],
                source_snapshot_hash=source_snapshot["snapshotHash"],
                source_summary=source_snapshot["summary"],
                created_by=user.user_id,
                created_by_snapshot=auth_store.user_snapshot(user.user_id),
                created_at=relative_datetime_iso(),
                remarks=remarks,
                idempotency_key=idempotency_key,
                payload_hash=payload_hash,
            )
            self.versions[version.report_version_id] = version
            event = self._append_audit(
                inspection_plan_id=plan.inspection_plan_id,
                report_version_id=version.report_version_id,
                action="GENERATE_DRAFT",
                user=user,
                auth_store=auth_store,
                request_id=request_id,
                idempotency_key=idempotency_key,
                payload_hash=payload_hash,
                to_status=version.status,
                file_asset_ids=[],
                details={
                    "format": fmt,
                    "artifactMode": "SNAPSHOT_ONLY",
                    "downloadableFileAsset": False,
                    "sourceSnapshotHash": source_snapshot["snapshotHash"],
                },
            )
            self._remember_command(
                inspection_plan_id=plan.inspection_plan_id,
                command_type="generate",
                actor_user_id=user.user_id,
                idempotency_key=idempotency_key,
                payload_hash=payload_hash,
                result_ref=version.report_version_id,
            )
            view = self.version_view(version, auth_store)
            view["auditEventId"] = event.report_audit_event_id
            return view

    def bind_final(
        self,
        *,
        inspection_plan_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        payload: dict[str, Any],
        request_id: str | None = None,
    ) -> dict[str, Any]:
        with self._lock:
            self._require_manage(user, auth_store)
            plan = self._get_scoped_plan(inspection_plan_id, user, auth_store)
            file_asset_id = str(payload.get("fileAssetId") or "").strip()
            supporting_file_asset_ids = sorted(set(payload.get("supportingFileAssetIds") or []))
            label = (payload.get("label") or "Final signed inspection report").strip()
            remarks = payload.get("remarks")
            idempotency_key = self._require_idempotency_key(payload.get("idempotencyKey"))
            payload_hash = self._payload_hash(
                {
                    "inspectionPlanId": inspection_plan_id,
                    "fileAssetId": file_asset_id,
                    "supportingFileAssetIds": supporting_file_asset_ids,
                    "label": label,
                    "remarks": remarks or "",
                }
            )
            replay = self._command_replay(
                inspection_plan_id=inspection_plan_id,
                command_type="bind_final",
                actor_user_id=user.user_id,
                idempotency_key=idempotency_key,
                payload_hash=payload_hash,
            )
            if replay:
                return self.version_view(
                    self._get_version(replay.result_ref, inspection_plan_id),
                    auth_store,
                    idempotent_replay=True,
                )

            readiness = self._readiness(plan, auth_store)
            self._assert_report_phase(plan)
            self._assert_generation_unblocked(readiness)
            if not file_asset_id:
                raise AppError(
                    code="FILE_ASSET_REQUIRED",
                    message="A final signed report FileAsset is required",
                    status_code=422,
                )
            assets = self._require_report_file_assets(
                plan=plan,
                file_ids=[file_asset_id, *supporting_file_asset_ids],
                user=user,
                auth_store=auth_store,
            )
            final_asset = assets[0]
            if not self._is_pdf(final_asset):
                raise AppError(
                    code="FILE_TYPE_INVALID",
                    message="Final signed inspection report must be a PDF FileAsset",
                    status_code=422,
                    details={"fileAssetId": file_asset_id},
                )
            source_snapshot = self._source_snapshot(plan)
            version = InspectionReportVersionRecord(
                report_version_id=self._next_version_id(plan.inspection_plan_id),
                inspection_plan_id=plan.inspection_plan_id,
                version_no=self._next_version_no(plan.inspection_plan_id, draft=False),
                label=label,
                method="MANUAL_UPLOAD",
                status="FINAL_UPLOADED",
                file_asset_id=final_asset.file_id,
                supporting_file_asset_ids=supporting_file_asset_ids,
                source_snapshot_hash=source_snapshot["snapshotHash"],
                source_summary=source_snapshot["summary"],
                created_by=user.user_id,
                created_by_snapshot=auth_store.user_snapshot(user.user_id),
                created_at=relative_datetime_iso(),
                remarks=remarks,
                idempotency_key=idempotency_key,
                payload_hash=payload_hash,
            )
            self.versions[version.report_version_id] = version
            event = self._append_audit(
                inspection_plan_id=plan.inspection_plan_id,
                report_version_id=version.report_version_id,
                action="BIND_FINAL",
                user=user,
                auth_store=auth_store,
                request_id=request_id,
                idempotency_key=idempotency_key,
                payload_hash=payload_hash,
                to_status=version.status,
                file_asset_ids=[final_asset.file_id, *supporting_file_asset_ids],
                details={
                    "label": label,
                    "supportingFileAssetCount": len(supporting_file_asset_ids),
                },
            )
            self._remember_command(
                inspection_plan_id=plan.inspection_plan_id,
                command_type="bind_final",
                actor_user_id=user.user_id,
                idempotency_key=idempotency_key,
                payload_hash=payload_hash,
                result_ref=version.report_version_id,
            )
            view = self.version_view(version, auth_store)
            view["auditEventId"] = event.report_audit_event_id
            return view

    def release(
        self,
        *,
        inspection_plan_id: str,
        report_version_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        payload: dict[str, Any],
        request_id: str | None = None,
    ) -> dict[str, Any]:
        with self._lock:
            self._require_release(user, auth_store)
            plan = self._get_scoped_plan(inspection_plan_id, user, auth_store)
            comment = payload.get("comment")
            optimistic_version = payload.get("optimisticVersion")
            idempotency_key = self._require_idempotency_key(payload.get("idempotencyKey"))
            payload_hash = self._payload_hash(
                {
                    "inspectionPlanId": inspection_plan_id,
                    "reportVersionId": report_version_id,
                    "comment": comment or "",
                    "optimisticVersion": optimistic_version,
                }
            )
            replay = self._command_replay(
                inspection_plan_id=inspection_plan_id,
                command_type="release",
                actor_user_id=user.user_id,
                idempotency_key=idempotency_key,
                payload_hash=payload_hash,
            )
            if replay:
                return self.workspace(
                    inspection_plan_id=inspection_plan_id,
                    user=user,
                    auth_store=auth_store,
                    idempotent_replay=True,
                )

            version = self._get_version(report_version_id, inspection_plan_id)
            readiness = self._readiness(plan, auth_store)
            self._assert_report_phase(plan)
            self._assert_generation_unblocked(readiness)
            if version.status != "FINAL_UPLOADED":
                raise AppError(
                    code="VERSION_NOT_FINAL",
                    message="Only FINAL_UPLOADED report versions can be released",
                    status_code=409,
                    details={
                        "reportVersionId": report_version_id,
                        "status": version.status,
                    },
                )
            if not version.file_asset_id or version.file_asset_id not in evidence_store.file_assets:
                raise AppError(
                    code="FINAL_REPORT_REQUIRED",
                    message="A bound final report FileAsset is required before release",
                    status_code=409,
                )
            if optimistic_version is not None and optimistic_version != version.optimistic_version:
                raise AppError(
                    code="VERSION_CONFLICT",
                    message="Report version was changed by another command",
                    status_code=409,
                    details={
                        "expected": version.optimistic_version,
                        "received": optimistic_version,
                    },
                )
            before_status = version.status
            version.status = "RELEASED"
            version.released_at = relative_datetime_iso()
            version.released_by = user.user_id
            version.released_by_snapshot = auth_store.user_snapshot(user.user_id)
            version.optimistic_version += 1
            self._transition_plan_to_rectification(
                plan=plan,
                user=user,
                auth_store=auth_store,
                comment=comment,
            )
            side_effects = self._ensure_rectification_side_effects(plan, auth_store)
            event = self._append_audit(
                inspection_plan_id=plan.inspection_plan_id,
                report_version_id=version.report_version_id,
                action="RELEASE_REPORT",
                user=user,
                auth_store=auth_store,
                request_id=request_id,
                idempotency_key=idempotency_key,
                payload_hash=payload_hash,
                from_status=before_status,
                to_status=version.status,
                file_asset_ids=[version.file_asset_id],
                details={
                    "comment": comment,
                    "planPhase": plan.phase,
                    "sideEffects": side_effects,
                },
            )
            self._remember_command(
                inspection_plan_id=plan.inspection_plan_id,
                command_type="release",
                actor_user_id=user.user_id,
                idempotency_key=idempotency_key,
                payload_hash=payload_hash,
                result_ref=version.report_version_id,
            )
            workspace = self.workspace_view(
                plan=plan,
                user=user,
                auth_store=auth_store,
            )
            workspace["auditEventId"] = event.report_audit_event_id
            workspace["sideEffects"] = side_effects
            return workspace

    def audit_page(
        self,
        *,
        inspection_plan_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        page: int = 1,
        page_size: int = 50,
    ) -> dict[str, Any]:
        self._require_read(user, auth_store)
        self._get_scoped_plan(inspection_plan_id, user, auth_store)
        rows = [
            event
            for event in self.audit_events.values()
            if event.inspection_plan_id == inspection_plan_id
        ]
        rows.sort(key=lambda item: (item.occurred_at, item.report_audit_event_id), reverse=True)
        start = (page - 1) * page_size
        end = start + page_size
        return {
            "items": [self.audit_view(event) for event in rows[start:end]],
            "page": page,
            "pageSize": page_size,
            "total": len(rows),
        }

    def version_detail(
        self,
        *,
        inspection_plan_id: str,
        report_version_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        self._require_read(user, auth_store)
        self._get_scoped_plan(inspection_plan_id, user, auth_store)
        return self.version_view(
            self._get_version(report_version_id, inspection_plan_id), auth_store
        )

    def download_deferred(
        self,
        *,
        inspection_plan_id: str,
        report_version_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        request_id: str | None = None,
    ) -> None:
        self._require_read(user, auth_store)
        self._get_scoped_plan(inspection_plan_id, user, auth_store)
        version = self._get_version(report_version_id, inspection_plan_id)
        self._append_audit(
            inspection_plan_id=inspection_plan_id,
            report_version_id=report_version_id,
            action="DOWNLOAD_DEFERRED",
            user=user,
            auth_store=auth_store,
            request_id=request_id,
            file_asset_ids=([version.file_asset_id] if version.file_asset_id else []),
            details={
                "downloadEnabled": False,
                "reason": "P2 download is deferred; no raw storage path or signed URL is exposed.",
            },
        )
        raise AppError(
            code="DOWNLOAD_DEFERRED",
            message="Report download is deferred for P2; no file payload or storage URL is exposed",
            status_code=409,
        )

    def workspace_view(
        self,
        *,
        plan: InspectionPlanRecord,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        idempotent_replay: bool = False,
    ) -> dict[str, Any]:
        readiness = self._readiness(plan, auth_store)
        versions = [
            version
            for version in self.versions.values()
            if version.inspection_plan_id == plan.inspection_plan_id
        ]
        versions.sort(key=lambda item: (item.created_at, item.report_version_id), reverse=True)
        final_versions = [
            item for item in versions if item.status in {"FINAL_UPLOADED", "RELEASED"}
        ]
        released = next((item for item in versions if item.status == "RELEASED"), None)
        can_generate = not readiness["blockingCodes"] and plan.phase == "REPORTING"
        can_upload = can_generate
        can_release = can_generate and bool(final_versions) and released is None
        permissions = {
            "canRead": self._can_read(user, auth_store),
            "canGenerate": self._can_manage(user, auth_store) and can_generate,
            "canUpload": self._can_manage(user, auth_store) and can_upload,
            "canRelease": self._can_release(user, auth_store) and can_release,
            "canDownload": False,
            "downloadDeferred": True,
        }
        blockers = list(readiness["blockers"])
        if plan.phase != "REPORTING":
            blockers.insert(
                0,
                {
                    "code": "INVALID_STATE",
                    "message": (
                        "Inspection plan must be in REPORTING before report commands are allowed"
                    ),
                    "severity": "BLOCKING",
                },
            )
        if not final_versions:
            blockers.append(
                {
                    "code": "FINAL_REPORT_REQUIRED",
                    "message": "Upload and bind a final signed PDF before release",
                    "severity": "BLOCKING",
                },
            )
        return {
            "inspectionPlanId": plan.inspection_plan_id,
            "planSnapshot": inspection_plan_store.plan_view(plan, auth_store),
            "readiness": {
                "score": readiness["score"],
                "factConfirmed": readiness["factConfirmed"],
                "appealsResolved": readiness["appealsResolved"],
                "finalReportPresent": bool(final_versions),
                "currentPhase": plan.phase,
                "canGenerate": permissions["canGenerate"],
                "canUpload": permissions["canUpload"],
                "canRelease": permissions["canRelease"],
                "released": released is not None,
            },
            "branchStatuses": readiness["branchStatuses"],
            "versions": [self.version_view(version, auth_store) for version in versions],
            "currentFinalVersionId": final_versions[0].report_version_id
            if final_versions
            else None,
            "currentReleasedVersionId": released.report_version_id if released else None,
            "permissions": permissions,
            "blockers": blockers,
            "download": {
                "enabled": False,
                "reason": "DOWNLOAD_DEFERRED",
                "label": "Download is deferred until bounded backend streaming is implemented.",
            },
            "idempotentReplay": idempotent_replay,
        }

    def version_view(
        self,
        record: InspectionReportVersionRecord,
        auth_store: SeedAuthStore,
        *,
        idempotent_replay: bool = False,
    ) -> dict[str, Any]:
        file_asset = (
            evidence_store.file_assets.get(record.file_asset_id) if record.file_asset_id else None
        )
        supporting_assets = [
            evidence_store.file_assets[file_id]
            for file_id in record.supporting_file_asset_ids
            if file_id in evidence_store.file_assets
        ]
        return {
            "reportVersionId": record.report_version_id,
            "inspectionPlanId": record.inspection_plan_id,
            "versionNo": record.version_no,
            "version": record.version_no,
            "label": record.label,
            "name": file_asset.file_name if file_asset else record.label,
            "method": self._method_label(record.method),
            "methodCode": record.method,
            "status": record.status,
            "fileAssetId": record.file_asset_id,
            "fileAsset": self._safe_file_view(file_asset) if file_asset else None,
            "supportingFileAssetIds": record.supporting_file_asset_ids,
            "supportingFileAssets": [self._safe_file_view(asset) for asset in supporting_assets],
            "sourceSnapshotHash": record.source_snapshot_hash,
            "sourceSummary": record.source_summary,
            "createdBy": record.created_by,
            "createdByName": record.created_by_snapshot.get("displayName", record.created_by),
            "createdBySnapshot": record.created_by_snapshot,
            "createdAt": record.created_at,
            "time": record.created_at,
            "uploader": record.created_by_snapshot.get("displayName", record.created_by),
            "releasedAt": record.released_at,
            "releasedBy": record.released_by,
            "releasedBySnapshot": record.released_by_snapshot,
            "remarks": record.remarks,
            "optimisticVersion": record.optimistic_version,
            "downloadEnabled": False,
            "downloadDeferred": True,
            "idempotentReplay": idempotent_replay,
        }

    @staticmethod
    def audit_view(record: InspectionReportAuditEventRecord) -> dict[str, Any]:
        return {
            "reportAuditEventId": record.report_audit_event_id,
            "inspectionPlanId": record.inspection_plan_id,
            "reportVersionId": record.report_version_id,
            "action": record.action,
            "actorUserId": record.actor_user_id,
            "actorOrgId": record.actor_org_id,
            "actorSnapshot": record.actor_snapshot,
            "occurredAt": record.occurred_at,
            "requestId": record.request_id,
            "idempotencyKey": record.idempotency_key,
            "payloadHash": record.payload_hash,
            "fromStatus": record.from_status,
            "toStatus": record.to_status,
            "fileAssetIds": record.file_asset_ids,
            "details": record.details,
        }

    def _readiness(self, plan: InspectionPlanRecord, auth_store: SeedAuthStore) -> dict[str, Any]:
        branch_statuses = []
        pending_facts = 0
        pending_appeals = 0
        for org_id in plan.target_org_ids:
            issues = [
                issue
                for issue in issue_store.issues.values()
                if issue.inspection_plan_id == plan.inspection_plan_id and issue.branch_id == org_id
            ]
            appeals = [
                appeal
                for appeal in issue_store.appeals.values()
                if any(issue.issue_id == appeal.issue_id for issue in issues)
            ]
            has_pending_fact = any(issue.status in PENDING_FACT_STATUSES for issue in issues)
            has_pending_appeal = any(appeal.status in PENDING_APPEAL_STATUSES for appeal in appeals)
            pending_facts += 1 if has_pending_fact else 0
            pending_appeals += 1 if has_pending_appeal else 0
            branch_statuses.append(
                {
                    "branchId": org_id,
                    "branchName": auth_store.org_snapshot(org_id).get("orgName", org_id),
                    "confirmStatus": (
                        "PENDING"
                        if has_pending_fact
                        else "DISPUTED"
                        if any(issue.status == "APPEALED" for issue in issues)
                        else "AGREED"
                    ),
                    "defenseStatus": (
                        "PENDING" if has_pending_appeal else "RESOLVED" if appeals else "NA"
                    ),
                    "issueCount": len(issues),
                    "pendingIssueCount": sum(
                        1 for issue in issues if issue.status in PENDING_FACT_STATUSES
                    ),
                    "appealCount": len(appeals),
                }
            )
        fact_confirmed = pending_facts == 0
        appeals_resolved = pending_appeals == 0
        blockers = []
        if not fact_confirmed:
            blockers.append(
                {
                    "code": "REPORT_BLOCKED",
                    "message": "Some target organizations still have pending fact confirmation",
                    "severity": "BLOCKING",
                }
            )
        if not appeals_resolved:
            blockers.append(
                {
                    "code": "APPEALS_NOT_DECIDED",
                    "message": "Some appeals are still pending adjudication",
                    "severity": "BLOCKING",
                }
            )
        score = round(((1 if fact_confirmed else 0) + (1 if appeals_resolved else 0)) / 2 * 100)
        return {
            "score": score,
            "factConfirmed": fact_confirmed,
            "appealsResolved": appeals_resolved,
            "branchStatuses": branch_statuses,
            "blockers": blockers,
            "blockingCodes": {item["code"] for item in blockers},
        }

    def _source_snapshot(self, plan: InspectionPlanRecord) -> dict[str, Any]:
        issues = [
            issue
            for issue in issue_store.issues.values()
            if issue.inspection_plan_id == plan.inspection_plan_id
        ]
        appeals = [
            appeal
            for appeal in issue_store.appeals.values()
            if any(issue.issue_id == appeal.issue_id for issue in issues)
        ]
        decisions = [
            decision
            for decision in issue_store.decisions.values()
            if any(appeal.appeal_id == decision.appeal_id for appeal in appeals)
        ]
        papers = [
            paper
            for paper in evidence_store.working_papers.values()
            if paper.inspection_plan_id == plan.inspection_plan_id
        ]
        payload = {
            "inspectionPlanId": plan.inspection_plan_id,
            "issueIds": sorted(issue.issue_id for issue in issues),
            "appealDecisionIds": sorted(decision.decision_id for decision in decisions),
            "workingPaperIds": sorted(paper.working_paper_id for paper in papers),
            "rectificationCandidateIssueIds": sorted(
                issue.issue_id for issue in issues if issue.validity != "INVALID"
            ),
            "generatedAt": relative_datetime_iso(),
        }
        snapshot_hash = self._payload_hash(payload)
        return {
            **payload,
            "snapshotHash": snapshot_hash,
            "summary": {
                "issueCount": len(issues),
                "appealDecisionCount": len(decisions),
                "workingPaperCount": len(papers),
                "rectificationCandidateIssueCount": len(payload["rectificationCandidateIssueIds"]),
            },
        }

    def _append_audit(
        self,
        *,
        inspection_plan_id: str,
        report_version_id: str | None,
        action: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        request_id: str | None = None,
        idempotency_key: str | None = None,
        payload_hash: str | None = None,
        from_status: str | None = None,
        to_status: str | None = None,
        file_asset_ids: list[str] | None = None,
        details: dict[str, Any] | None = None,
    ) -> InspectionReportAuditEventRecord:
        event_id = f"IRAE-{len(self.audit_events) + 1:05d}"
        event = InspectionReportAuditEventRecord(
            report_audit_event_id=event_id,
            inspection_plan_id=inspection_plan_id,
            report_version_id=report_version_id,
            action=action,
            actor_user_id=user.user_id,
            actor_org_id=user.org_id,
            actor_snapshot=auth_store.user_snapshot(user.user_id),
            occurred_at=relative_datetime_iso(),
            request_id=request_id,
            idempotency_key=idempotency_key,
            payload_hash=payload_hash,
            from_status=from_status,
            to_status=to_status,
            file_asset_ids=file_asset_ids or [],
            details=details or {},
        )
        self.audit_events[event_id] = event
        return event

    def _command_replay(
        self,
        *,
        inspection_plan_id: str,
        command_type: str,
        actor_user_id: str,
        idempotency_key: str,
        payload_hash: str,
    ) -> InspectionReportCommandRecord | None:
        record = self.command_keys.get(
            (inspection_plan_id, command_type, actor_user_id, idempotency_key)
        )
        if not record:
            return None
        if record.payload_hash != payload_hash:
            raise AppError(
                code="IDEMPOTENCY_KEY_CONFLICT",
                message="idempotencyKey was already used with a different report command payload",
                status_code=409,
                details={
                    "commandType": command_type,
                    "idempotencyKey": idempotency_key,
                    "existingPayloadHash": record.payload_hash,
                    "incomingPayloadHash": payload_hash,
                },
            )
        return record

    def _remember_command(
        self,
        *,
        inspection_plan_id: str,
        command_type: str,
        actor_user_id: str,
        idempotency_key: str,
        payload_hash: str,
        result_ref: str,
    ) -> None:
        key = (inspection_plan_id, command_type, actor_user_id, idempotency_key)
        self.command_keys[key] = InspectionReportCommandRecord(
            command_key_id=f"IRCK-{len(self.command_keys) + 1:05d}",
            inspection_plan_id=inspection_plan_id,
            command_type=command_type,
            actor_user_id=actor_user_id,
            idempotency_key=idempotency_key,
            payload_hash=payload_hash,
            result_ref=result_ref,
            created_at=relative_datetime_iso(),
        )

    def _require_file_assets(
        self,
        *,
        file_ids: list[str],
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> list[FileAssetRecord]:
        assets = evidence_store.require_file_assets_for_user(
            file_ids=file_ids,
            user=user,
            auth_store=auth_store,
        )
        return assets

    def _require_report_file_assets(
        self,
        *,
        plan: InspectionPlanRecord,
        file_ids: list[str],
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> list[FileAssetRecord]:
        assets = self._require_file_assets(
            file_ids=file_ids,
            user=user,
            auth_store=auth_store,
        )
        out_of_scope_file_ids = [
            asset.file_id
            for asset in assets
            if asset.uploaded_by != user.user_id
            or not asset.storage_key.startswith(f"inspection/{user.user_id}/")
            or asset.storage_key.startswith("generated-report/")
            or self._file_asset_bound_to_other_plan(asset.file_id, plan.inspection_plan_id)
            or self._file_asset_used_outside_report(asset.file_id)
        ]
        if out_of_scope_file_ids:
            raise AppError(
                code="FILE_ASSET_NOT_FOUND",
                message="File asset is not available for this inspection report binding",
                status_code=404,
                details={
                    "fileIds": out_of_scope_file_ids,
                    "inspectionPlanId": plan.inspection_plan_id,
                },
            )
        return assets

    def _file_asset_bound_to_other_plan(self, file_id: str, inspection_plan_id: str) -> bool:
        for version in self.versions.values():
            if version.inspection_plan_id == inspection_plan_id:
                continue
            if version.file_asset_id == file_id or file_id in version.supporting_file_asset_ids:
                return True
        return False

    @staticmethod
    def _file_asset_used_outside_report(file_id: str) -> bool:
        if any(
            file_id in submission.file_ids
            for submission in evidence_store.submissions.values()
        ):
            return True
        if any(file_id in appeal.file_ids for appeal in issue_store.appeals.values()):
            return True
        if any(file_id in feedback.file_ids for feedback in rectification_store.feedbacks.values()):
            return True
        return False

    def _transition_plan_to_rectification(
        self,
        *,
        plan: InspectionPlanRecord,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        comment: str | None,
    ) -> None:
        inspection_plan_store.transition_plan(
            inspection_plan_id=plan.inspection_plan_id,
            user=user,
            auth_store=auth_store,
            action="release_inspection_report",
            comment=comment,
        )

    def _ensure_rectification_side_effects(
        self,
        plan: InspectionPlanRecord,
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        created_issue_ids: list[str] = []
        created_rectification_ids: list[str] = []
        task_ids: list[str] = []
        valid_issues = [
            issue
            for issue in issue_store.issues.values()
            if issue.inspection_plan_id == plan.inspection_plan_id and issue.validity != "INVALID"
        ]
        for issue in valid_issues:
            compliance_issue = next(
                (
                    item
                    for item in rectification_store.issues.values()
                    if item.source_type == "INSPECTION"
                    and item.source_id == plan.inspection_plan_id
                    and item.responsible_org_id == issue.branch_id
                    and item.description == issue.description
                ),
                None,
            )
            if not compliance_issue:
                compliance_issue_id = f"CI-REPORT-{len(rectification_store.issues) + 1:04d}"
                compliance_issue = ComplianceIssueRecord(
                    issue_id=compliance_issue_id,
                    issue_code=issue.issue_code,
                    title=issue.title,
                    source_type="INSPECTION",
                    source_id=plan.inspection_plan_id,
                    source_project=plan.title,
                    business_line="财富管理",
                    responsible_org_id=issue.branch_id,
                    responsible_dept=auth_store.org_snapshot(issue.branch_id).get(
                        "orgName", issue.branch_id
                    ),
                    risk_level=issue.risk_level,
                    status="PENDING_RECTIFICATION",
                    discovery_date=relative_date_iso(0),
                    sla_deadline=relative_date_iso(60),
                    description=issue.description,
                    rectification_advice="Resolve the finding and upload rectification evidence.",
                    basis_rule=issue.basis_rule,
                    responsible_org_snapshot=auth_store.org_snapshot(issue.branch_id),
                )
                rectification_store.issues[compliance_issue_id] = compliance_issue
                created_issue_ids.append(compliance_issue_id)
            rectification = next(
                (
                    item
                    for item in rectification_store.rectifications.values()
                    if item.source_issue_id == compliance_issue.issue_id
                ),
                None,
            )
            if not rectification:
                rectification_id = f"RECT-REPORT-{len(rectification_store.rectifications) + 1:04d}"
                rectification = RectificationRecordData(
                    rectification_id=rectification_id,
                    source_issue_id=compliance_issue.issue_id,
                    responsible_org_id=issue.branch_id,
                    issue_description=issue.description,
                    rectification_goal="Resolve the finding and provide verifiable evidence.",
                    risk_level=issue.risk_level,
                    due_date=relative_date_iso(60),
                    status="PENDING_RECTIFICATION",
                    responsible_org_snapshot=auth_store.org_snapshot(issue.branch_id),
                )
                rectification_store.rectifications[rectification_id] = rectification
                created_rectification_ids.append(rectification_id)
            task_id = f"TASK-REPORT-{rectification.rectification_id}"
            task_store.upsert_task(
                UnifiedTaskRecord(
                    task_id=task_id,
                    category="ISSUE",
                    action_type="RECTIFY",
                    title=f"Submit rectification feedback for {issue.title}",
                    description="Report release opened rectification for this inspection finding.",
                    priority=issue.risk_level
                    if issue.risk_level in {"HIGH", "MEDIUM", "LOW"}
                    else "MEDIUM",
                    due_date=rectification.due_date,
                    status="PENDING",
                    source_id=rectification.rectification_id,
                    action_target=UnifiedTaskActionTargetRecord(
                        kind="route",
                        menu_id="branch-ledger",
                        app_path=f"/branch/issues/rectifications/{rectification.rectification_id}",
                        public_path=(
                            f"/compliance/branch/issues/rectifications/"
                            f"{rectification.rectification_id}"
                        ),
                        params={"rectificationId": rectification.rectification_id},
                        action="RECTIFICATION_SUBMIT_FEEDBACK",
                    ),
                    created_at=relative_datetime_iso(),
                    scope="branch",
                    scoped_org_id=issue.branch_id,
                    project_id=plan.inspection_plan_id,
                )
            )
            task_ids.append(task_id)
        return {
            "candidateIssueCount": len(valid_issues),
            "createdComplianceIssueIds": created_issue_ids,
            "createdRectificationIds": created_rectification_ids,
            "rectificationTaskIds": task_ids,
        }

    def _assert_report_phase(self, plan: InspectionPlanRecord) -> None:
        if plan.phase != "REPORTING":
            raise AppError(
                code="INVALID_STATE",
                message="Inspection plan must be in REPORTING before report commands are allowed",
                status_code=409,
                details={"inspectionPlanId": plan.inspection_plan_id, "phase": plan.phase},
            )

    @staticmethod
    def _assert_generation_unblocked(readiness: dict[str, Any]) -> None:
        if "APPEALS_NOT_DECIDED" in readiness["blockingCodes"]:
            raise AppError(
                code="APPEALS_NOT_DECIDED",
                message="All appeals must be decided before report generation or release",
                status_code=409,
            )
        if "REPORT_BLOCKED" in readiness["blockingCodes"]:
            raise AppError(
                code="REPORT_BLOCKED",
                message="All target facts must be confirmed before report generation or release",
                status_code=409,
            )

    def _get_scoped_plan(
        self,
        inspection_plan_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> InspectionPlanRecord:
        plan = inspection_plan_store._get_plan(inspection_plan_id)
        if not self._can_read_plan(plan, user, auth_store):
            raise ForbiddenError()
        return plan

    def _get_version(
        self,
        report_version_id: str,
        inspection_plan_id: str,
    ) -> InspectionReportVersionRecord:
        version = self.versions.get(report_version_id)
        if not version or version.inspection_plan_id != inspection_plan_id:
            raise NotFoundError("Inspection report version not found")
        return version

    @staticmethod
    def _can_read(user: AuthUserRecord, auth_store: SeedAuthStore) -> bool:
        return auth_store.has_permission(user, "PERM-HQ-INSPECTION-MANAGE")

    def _can_read_plan(
        self,
        plan: InspectionPlanRecord,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> bool:
        if not self._can_read(user, auth_store):
            return False
        if {"ROLE_COMPLIANCE_DIRECTOR", "ROLE_COMPLIANCE_MANAGER"}.intersection(user.role_ids):
            return True
        return user.user_id in {plan.leader_user_id, *plan.team_member_user_ids}

    def _require_read(self, user: AuthUserRecord, auth_store: SeedAuthStore) -> None:
        if not self._can_read(user, auth_store):
            raise ForbiddenError()

    @staticmethod
    def _can_manage(user: AuthUserRecord, auth_store: SeedAuthStore) -> bool:
        return auth_store.has_permission(user, "PERM-HQ-INSPECTION-MANAGE") and bool(
            {
                "ROLE_INSPECTION_LEAD",
                "ROLE_COMPLIANCE_MANAGER",
                "ROLE_COMPLIANCE_DIRECTOR",
            }.intersection(user.role_ids)
        )

    def _require_manage(self, user: AuthUserRecord, auth_store: SeedAuthStore) -> None:
        if not self._can_manage(user, auth_store):
            raise ForbiddenError()

    @staticmethod
    def _can_release(user: AuthUserRecord, auth_store: SeedAuthStore) -> bool:
        return auth_store.has_permission(user, "PERM-HQ-INSPECTION-MANAGE") and bool(
            {"ROLE_COMPLIANCE_MANAGER", "ROLE_COMPLIANCE_DIRECTOR"}.intersection(user.role_ids)
        )

    def _require_release(self, user: AuthUserRecord, auth_store: SeedAuthStore) -> None:
        if not self._can_release(user, auth_store):
            raise ForbiddenError()

    @staticmethod
    def _require_idempotency_key(value: Any) -> str:
        key = str(value or "").strip()
        if not key:
            raise AppError(
                code="IDEMPOTENCY_KEY_REQUIRED",
                message="idempotencyKey is required for report commands",
                status_code=422,
            )
        return key

    def _next_version_id(self, inspection_plan_id: str) -> str:
        count = sum(
            1 for item in self.versions.values() if item.inspection_plan_id == inspection_plan_id
        )
        return f"IRV-{inspection_plan_id}-{count + 1:03d}"

    def _next_version_no(self, inspection_plan_id: str, *, draft: bool) -> str:
        count = sum(
            1 for item in self.versions.values() if item.inspection_plan_id == inspection_plan_id
        )
        return f"v{count + 1}.0 {'Draft' if draft else 'Final'}"

    @staticmethod
    def _is_pdf(asset: FileAssetRecord) -> bool:
        return asset.content_type in PDF_CONTENT_TYPES or asset.file_name.lower().endswith(".pdf")

    @staticmethod
    def _safe_file_view(record: FileAssetRecord) -> dict[str, Any]:
        return {
            "fileId": record.file_id,
            "fileName": record.file_name,
            "contentType": record.content_type,
            "fileSize": record.file_size,
            "checksum": record.checksum,
            "uploadedBy": record.uploaded_by,
            "uploadedBySnapshot": record.uploaded_by_snapshot,
            "uploadedAt": record.uploaded_at,
            "scanStatus": record.scan_status,
        }

    @staticmethod
    def _method_label(method: str) -> str:
        return {
            "SYSTEM_GENERATED": "Backend generated draft",
            "MANUAL_UPLOAD": "Manual final PDF upload",
        }.get(method, method)

    @staticmethod
    def _payload_hash(payload: dict[str, Any]) -> str:
        encoded = json.dumps(payload, sort_keys=True, ensure_ascii=True, separators=(",", ":"))
        return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


inspection_report_store = SeedInspectionReportStore()
