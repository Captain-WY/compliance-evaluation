from __future__ import annotations

import hashlib
import json
from copy import deepcopy
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from threading import RLock
from typing import Any

from app.modules.compliance.core.errors import AppError, NotFoundError
from app.modules.compliance.domain.auth_store import AuthUserRecord, SeedAuthStore
from app.modules.compliance.domain.seed_time import relative_datetime_iso

READ_PERMISSION = "PERM-P2-DATA-COCKPIT-READ"
OPERATE_PERMISSION = "PERM-P2-DATA-COCKPIT-OPERATE"
EXPORT_PERMISSION = "PERM-P2-DATA-COCKPIT-EXPORT"

HEALTH_STATUSES = {"ONLINE", "DEGRADED", "OFFLINE", "UNKNOWN"}
JOB_STATUSES = {
    "PENDING",
    "RUNNING",
    "SUCCESS",
    "FAILED",
    "RETRY_REQUESTED",
    "OVERWRITE_REQUESTED",
    "CANCELLED",
}
ALERT_STATUSES = {"OPEN", "IGNORED", "RESOLVED"}
TIME_RANGES = {"7days", "30days", "all"}
EXPORT_FORMATS = {"JSON", "CSV", "PDF"}
REDACTION_POLICIES = {"STRICT", "MASKED", "SUMMARY_ONLY"}
SANDBOX_EVIDENCE_LABEL = "SANDBOX_DATA_SYNC_EVIDENCE_METADATA"


@dataclass
class ExternalDataSourceRecord:
    source_id: str
    source_code: str
    source_name: str
    owner_dept_snapshot: dict[str, Any]
    connector_type: str
    health_status: str
    last_heartbeat_at: str | None
    sandbox_only: bool = True


@dataclass
class ExternalDataConnectorBindingRecord:
    binding_id: str
    source_id: str
    binding_type: str
    endpoint_alias: str
    config_snapshot: dict[str, Any]
    created_at: str
    sandbox_only: bool = True


@dataclass
class DataSyncJobRecord:
    job_id: str
    source_id: str
    source_code: str
    indicator_id: str | None
    indicator_name: str
    cycle_id: str | None
    status: str
    records: int
    error_code: str | None
    error_message: str | None
    started_at: str
    finished_at: str | None
    has_snapshot: bool
    sandbox_only: bool = True


@dataclass
class DataSyncLogRecord:
    log_id: str
    job_id: str | None
    source_id: str | None
    event_type: str
    message: str
    actor_user_id: str | None
    created_at: str
    command_type: str | None = None
    request_id: str | None = None
    payload_hash: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class DataSyncSnapshotRecord:
    snapshot_id: str
    job_id: str
    payload_hash: str
    record_count: int
    redaction_policy: str
    captured_at: str
    sample_rows: list[dict[str, Any]]
    omitted_fields: list[str]
    file_id: str | None = None
    sandbox_only: bool = True


@dataclass
class DataSyncAlertRecord:
    alert_id: str
    job_id: str
    source_id: str
    status: str
    severity: str
    message: str
    created_at: str
    ignored_by: str | None = None
    ignored_at: str | None = None
    resolved_at: str | None = None
    audit_events: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class DataSyncRerunRequestRecord:
    rerun_request_id: str
    job_id: str
    source_id: str
    indicator_id: str | None
    cycle_id: str | None
    source_window_key: str
    status: str
    requested_by: str
    actor_snapshot: dict[str, Any]
    reason: str
    request_id: str | None
    payload_hash: str
    approval_marker: str | None
    risk_acknowledgement: bool
    audit_event_id: str
    created_at: str
    sandbox_only: bool = True


@dataclass
class ExportArtifactRecord:
    export_id: str
    export_type: str
    format: str
    filter_snapshot: dict[str, Any]
    status: str
    requested_by: str
    request_id: str | None
    redaction_policy: str
    evidence_label: str
    created_at: str
    file_id: str | None = None
    download_url: str | None = None
    expires_at: str | None = None
    checksum: str | None = None
    sandbox_only: bool = True
    formal_artifact: bool = False
    signed_artifact: bool = False


@dataclass
class ExportAuditEventRecord:
    export_audit_event_id: str
    export_id: str
    requested_by: str
    actor_snapshot: dict[str, Any]
    filter_snapshot: dict[str, Any]
    redaction_policy: str
    access_metadata: dict[str, Any]
    created_at: str


class SeedDataCockpitStore:
    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self.sources: dict[str, ExternalDataSourceRecord] = {}
        self.bindings: dict[str, ExternalDataConnectorBindingRecord] = {}
        self.jobs: dict[str, DataSyncJobRecord] = {}
        self.logs: dict[str, DataSyncLogRecord] = {}
        self.snapshots: dict[str, DataSyncSnapshotRecord] = {}
        self.alerts: dict[str, DataSyncAlertRecord] = {}
        self.rerun_requests: dict[str, DataSyncRerunRequestRecord] = {}
        self.export_artifacts: dict[str, ExportArtifactRecord] = {}
        self.export_audit_events: dict[str, ExportAuditEventRecord] = {}
        self._request_index: dict[tuple[str, str, str], str] = {}
        self._command_lock = RLock()
        self._seed_default_records()
        self._rebuild_request_index()

    def hydrate(
        self,
        *,
        sources: dict[str, ExternalDataSourceRecord],
        bindings: dict[str, ExternalDataConnectorBindingRecord],
        jobs: dict[str, DataSyncJobRecord],
        logs: dict[str, DataSyncLogRecord],
        snapshots: dict[str, DataSyncSnapshotRecord],
        alerts: dict[str, DataSyncAlertRecord],
        rerun_requests: dict[str, DataSyncRerunRequestRecord],
        export_artifacts: dict[str, ExportArtifactRecord],
        export_audit_events: dict[str, ExportAuditEventRecord],
    ) -> None:
        self.sources = sources
        self.bindings = bindings
        self.jobs = jobs
        self.logs = logs
        self.snapshots = snapshots
        self.alerts = alerts
        self.rerun_requests = rerun_requests
        self.export_artifacts = export_artifacts
        self.export_audit_events = export_audit_events
        self._rebuild_request_index()

    def health_summary(self, *, user: AuthUserRecord, auth_store: SeedAuthStore) -> dict[str, Any]:
        self._require_read(user, auth_store)
        self._assert_hq_scope(user, auth_store)
        open_alerts = [alert for alert in self.alerts.values() if alert.status == "OPEN"]
        online_sources = [
            source for source in self.sources.values() if source.health_status == "ONLINE"
        ]
        failed_jobs = [job for job in self.jobs.values() if job.status == "FAILED"]
        readiness_level = "READY"
        if any(source.health_status == "OFFLINE" for source in self.sources.values()):
            readiness_level = "BLOCKED"
        elif open_alerts or any(
            source.health_status == "DEGRADED" for source in self.sources.values()
        ):
            readiness_level = "PARTIAL"
        return {
            "generatedAt": relative_datetime_iso(),
            "sandboxOnly": True,
            "evidenceLabel": "SANDBOX_DATA_READINESS_EVIDENCE",
            "readinessLevel": readiness_level,
            "connectedSourceCount": len(online_sources),
            "totalSourceCount": len(self.sources),
            "todayRunCount": len(self.jobs),
            "unresolvedFailureCount": len(open_alerts),
            "failedJobCount": len(failed_jobs),
            "sources": [self._source_view(source) for source in self.sources.values()],
        }

    def job_page(
        self,
        *,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        time_range: str | None,
        source: str | None,
        status: str | None,
        keyword: str | None,
        page: int,
        page_size: int,
    ) -> dict[str, Any]:
        self._require_read(user, auth_store)
        self._assert_hq_scope(user, auth_store)
        resolved_time_range = self._validated_time_range(time_range)
        resolved_source = self._validated_source_code(source)
        resolved_status = self._validated_status(status)
        records = list(self.jobs.values())
        records = self._filter_by_time_range(records, resolved_time_range)
        if resolved_source:
            records = [job for job in records if job.source_code == resolved_source]
        if resolved_status:
            records = [job for job in records if job.status == resolved_status]
        if keyword:
            needle = keyword.strip().lower()
            records = [
                job
                for job in records
                if needle in job.job_id.lower()
                or needle in job.indicator_name.lower()
                or needle in job.source_code.lower()
            ]
        records.sort(key=lambda item: item.started_at, reverse=True)
        total = len(records)
        start = (page - 1) * page_size
        items = records[start : start + page_size]
        return {
            "items": [self._job_view(job) for job in items],
            "page": page,
            "pageSize": page_size,
            "total": total,
            "filterSnapshot": {
                "timeRange": resolved_time_range,
                "source": resolved_source or "all",
                "status": resolved_status or "all",
                "keyword": keyword or "",
                "sandboxOnly": True,
            },
        }

    def snapshot(
        self,
        *,
        job_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        self._require_read(user, auth_store)
        self._assert_hq_scope(user, auth_store)
        self._get_job(job_id)
        snapshot = next(
            (item for item in self.snapshots.values() if item.job_id == job_id),
            None,
        )
        if not snapshot:
            raise NotFoundError("Data sync snapshot not found")
        return self._snapshot_view(snapshot)

    def retry_job(
        self,
        *,
        job_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        with self._command_lock:
            self._require_operate(user, auth_store)
            self._assert_hq_scope(user, auth_store)
            reason = self._validated_reason(payload.get("reason"), "Retry reason is required")
            request_id = payload.get("requestId")
            payload_hash = self._payload_hash({"jobId": job_id, "reason": reason})
            replay = self._command_replay(
                actor_id=user.user_id,
                request_id=request_id,
                command="retry",
                payload_hash=payload_hash,
            )
            if replay:
                log = self.logs[replay]
                job = self._get_job(str(log.job_id))
                return self._command_response(log, job, idempotent_replay=True)

            job = self._get_job(job_id)
            if job.status != "FAILED":
                raise AppError(
                    code="INVALID_STATE_TRANSITION",
                    message="Only FAILED sandbox data sync jobs can be retried",
                    status_code=409,
                    details={"jobId": job_id, "status": job.status},
                )
            job.status = "RETRY_REQUESTED"
            log = self._append_log(
                job_id=job.job_id,
                source_id=job.source_id,
                event_type="DATA_SYNC_RETRY_REQUESTED",
                message="Sandbox data sync retry requested",
                actor_user_id=user.user_id,
                metadata={
                    "commandType": "retry",
                    "reason": reason,
                    "requestId": request_id,
                    "payloadHash": payload_hash,
                    "newStatus": job.status,
                    "sandboxOnly": True,
                },
            )
            self._remember_request(user.user_id, request_id, "retry", log.log_id)
            return self._command_response(log, job, idempotent_replay=False)

    def ignore_alert(
        self,
        *,
        alert_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        with self._command_lock:
            self._require_operate(user, auth_store)
            self._assert_hq_scope(user, auth_store)
            reason = self._validated_reason(payload.get("reason"), "Ignore reason is required")
            request_id = payload.get("requestId")
            payload_hash = self._payload_hash({"alertId": alert_id, "reason": reason})
            replay = self._command_replay(
                actor_id=user.user_id,
                request_id=request_id,
                command="ignore_alert",
                payload_hash=payload_hash,
            )
            if replay:
                log = self.logs[replay]
                alert = self._get_alert(alert_id)
                job = self._get_job(alert.job_id)
                return self._alert_response(log, alert, job, idempotent_replay=True)

            alert = self._get_alert(alert_id)
            job = self._get_job(alert.job_id)
            if alert.status not in {"OPEN", "IGNORED"}:
                raise AppError(
                    code="INVALID_STATE_TRANSITION",
                    message="Only OPEN sandbox data alerts can be ignored",
                    status_code=409,
                    details={"alertId": alert_id, "status": alert.status},
                )
            event_type = "DATA_SYNC_ALERT_IGNORED"
            if alert.status == "OPEN":
                alert.status = "IGNORED"
                alert.ignored_by = user.user_id
                alert.ignored_at = relative_datetime_iso()
            else:
                event_type = "DATA_SYNC_ALERT_IGNORE_NOOP"
            log = self._append_log(
                job_id=job.job_id,
                source_id=alert.source_id,
                event_type=event_type,
                message="Sandbox data sync alert ignore requested",
                actor_user_id=user.user_id,
                metadata={
                    "commandType": "ignore_alert",
                    "alertId": alert.alert_id,
                    "reason": reason,
                    "requestId": request_id,
                    "payloadHash": payload_hash,
                    "newStatus": alert.status,
                    "sandboxOnly": True,
                    "jobEvidenceRetained": True,
                },
            )
            alert.audit_events.append(
                {
                    "auditEventId": log.log_id,
                    "eventType": event_type,
                    "actorUserId": user.user_id,
                    "reason": reason,
                    "createdAt": log.created_at,
                    "jobEvidenceRetained": True,
                },
            )
            self._remember_request(user.user_id, request_id, "ignore_alert", log.log_id)
            return self._alert_response(log, alert, job, idempotent_replay=False)

    def overwrite_rerun(
        self,
        *,
        job_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        with self._command_lock:
            self._require_operate(user, auth_store)
            self._assert_hq_scope(user, auth_store)
            reason = self._validated_reason(
                payload.get("reason"),
                "Overwrite rerun reason is required",
            )
            request_id = payload.get("requestId")
            risk_acknowledgement = bool(payload.get("riskAcknowledgement"))
            if not risk_acknowledgement:
                raise AppError(
                    code="VALIDATION_ERROR",
                    message="riskAcknowledgement=true is required for sandbox overwrite rerun",
                    status_code=422,
                    details={"riskAcknowledgement": False},
                )
            approval_marker = payload.get("approvalMarker")
            job = self._get_job(job_id)
            payload_hash = self._payload_hash(
                {
                    "jobId": job_id,
                    "reason": reason,
                    "riskAcknowledgement": risk_acknowledgement,
                    "approvalMarker": approval_marker,
                },
            )
            replay = self._command_replay(
                actor_id=user.user_id,
                request_id=request_id,
                command="overwrite_rerun",
                payload_hash=payload_hash,
            )
            if replay:
                rerun = self.rerun_requests[replay]
                audit_log = self.logs[rerun.audit_event_id]
                return self._rerun_response(rerun, audit_log, idempotent_replay=True)

            if job.status not in {"SUCCESS", "FAILED"}:
                raise AppError(
                    code="INVALID_STATE_TRANSITION",
                    message=(
                        "Only SUCCESS or FAILED sandbox data sync jobs can request overwrite rerun"
                    ),
                    status_code=409,
                    details={"jobId": job_id, "status": job.status},
                )
            source_window_key = self._source_window_key(job)
            existing = [
                item
                for item in self.rerun_requests.values()
                if item.source_window_key == source_window_key
                and item.status in {"PENDING", "RUNNING"}
            ]
            if existing:
                raise AppError(
                    code="CONCURRENT_RERUN_EXISTS",
                    message="A sandbox overwrite rerun is already pending for this source window",
                    status_code=409,
                    details={
                        "jobId": job_id,
                        "sourceWindowKey": source_window_key,
                        "existingRerunRequestId": existing[0].rerun_request_id,
                    },
                )
            audit_log = self._append_log(
                job_id=job.job_id,
                source_id=job.source_id,
                event_type="DATA_SYNC_OVERWRITE_RERUN_REQUESTED",
                message="High-risk sandbox overwrite rerun requested",
                actor_user_id=user.user_id,
                metadata={
                    "commandType": "overwrite_rerun",
                    "reason": reason,
                    "requestId": request_id,
                    "payloadHash": payload_hash,
                    "approvalMarker": approval_marker,
                    "riskAcknowledgement": True,
                    "sourceWindowKey": source_window_key,
                    "sandboxOnly": True,
                },
            )
            rerun = DataSyncRerunRequestRecord(
                rerun_request_id=f"DSRERUN-{len(self.rerun_requests) + 1:04d}",
                job_id=job.job_id,
                source_id=job.source_id,
                indicator_id=job.indicator_id,
                cycle_id=job.cycle_id,
                source_window_key=source_window_key,
                status="PENDING",
                requested_by=user.user_id,
                actor_snapshot=auth_store.user_snapshot(user.user_id),
                reason=reason,
                request_id=request_id,
                payload_hash=payload_hash,
                approval_marker=approval_marker,
                risk_acknowledgement=True,
                audit_event_id=audit_log.log_id,
                created_at=audit_log.created_at,
            )
            self.rerun_requests[rerun.rerun_request_id] = rerun
            job.status = "OVERWRITE_REQUESTED"
            self._remember_request(
                user.user_id,
                request_id,
                "overwrite_rerun",
                rerun.rerun_request_id,
            )
            return self._rerun_response(rerun, audit_log, idempotent_replay=False)

    def request_evidence_export(
        self,
        *,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        with self._command_lock:
            self._require_export(user, auth_store)
            self._assert_hq_scope(user, auth_store)
            source_ids = list(payload.get("sourceIds") or [])
            self._validated_source_ids(source_ids)
            statuses = self._validated_status_list(payload.get("status"))
            time_range = self._validated_time_range(payload.get("timeRange"))
            export_format = str(payload.get("format") or "JSON").upper()
            if export_format not in EXPORT_FORMATS:
                raise self._validation_error("format", export_format, sorted(EXPORT_FORMATS))
            redaction_policy = str(payload.get("redactionPolicy") or "STRICT").upper()
            if redaction_policy not in REDACTION_POLICIES:
                raise self._validation_error(
                    "redactionPolicy",
                    redaction_policy,
                    sorted(REDACTION_POLICIES),
                    code="SNAPSHOT_REDACTION_REQUIRED",
                )
            request_id = payload.get("requestId")
            filter_snapshot = {
                "sourceIds": source_ids,
                "status": statuses,
                "timeRange": time_range,
                "sandboxOnly": True,
            }
            payload_hash = self._payload_hash(
                {
                    "filterSnapshot": filter_snapshot,
                    "format": export_format,
                    "redactionPolicy": redaction_policy,
                },
            )
            replay = self._command_replay(
                actor_id=user.user_id,
                request_id=request_id,
                command="evidence_export",
                payload_hash=payload_hash,
            )
            if replay:
                artifact = self.export_artifacts[replay]
                audit_event = next(
                    item
                    for item in self.export_audit_events.values()
                    if item.export_id == artifact.export_id
                )
                return self._export_response(artifact, audit_event, idempotent_replay=True)

            export_id = f"DSEXPORT-{len(self.export_artifacts) + 1:04d}"
            created_at = relative_datetime_iso()
            artifact = ExportArtifactRecord(
                export_id=export_id,
                export_type="DATA_SYNC_SANDBOX_EVIDENCE",
                format=export_format,
                filter_snapshot=filter_snapshot,
                status="REQUESTED",
                requested_by=user.user_id,
                request_id=request_id,
                redaction_policy=redaction_policy,
                evidence_label=SANDBOX_EVIDENCE_LABEL,
                created_at=created_at,
                checksum=self._payload_hash(
                    {"exportId": export_id, "filterSnapshot": filter_snapshot},
                )[:16],
            )
            audit_event = ExportAuditEventRecord(
                export_audit_event_id=f"DSEXPORT-AUDIT-{len(self.export_audit_events) + 1:04d}",
                export_id=export_id,
                requested_by=user.user_id,
                actor_snapshot=auth_store.user_snapshot(user.user_id),
                filter_snapshot=filter_snapshot,
                redaction_policy=redaction_policy,
                access_metadata={
                    "downloadUrlIssued": False,
                    "formalArtifact": False,
                    "signedArtifact": False,
                    "payloadRedacted": True,
                    "payloadHash": payload_hash,
                },
                created_at=created_at,
            )
            self.export_artifacts[artifact.export_id] = artifact
            self.export_audit_events[audit_event.export_audit_event_id] = audit_event
            self._remember_request(user.user_id, request_id, "evidence_export", artifact.export_id)
            return self._export_response(artifact, audit_event, idempotent_replay=False)

    def _seed_default_records(self) -> None:
        now = relative_datetime_iso()
        owner = {
            "orgId": "WLZQ-HQ-COMPLIANCE",
            "orgName": "Compliance Management Department",
            "source": "sandbox_fixture",
        }
        seeded_sources = [
            ExternalDataSourceRecord(
                source_id="EDS-HR-SANDBOX",
                source_code="HR_SYS",
                source_name="HR system sandbox stub",
                owner_dept_snapshot=owner,
                connector_type="SANDBOX_STUB",
                health_status="ONLINE",
                last_heartbeat_at=now,
            ),
            ExternalDataSourceRecord(
                source_id="EDS-TRADE-SANDBOX",
                source_code="TRADE_CORE",
                source_name="Core trading sandbox stub",
                owner_dept_snapshot=owner,
                connector_type="SANDBOX_STUB",
                health_status="DEGRADED",
                last_heartbeat_at=now,
            ),
            ExternalDataSourceRecord(
                source_id="EDS-CRM-SANDBOX",
                source_code="CRM_SYS",
                source_name="CRM sandbox stub",
                owner_dept_snapshot=owner,
                connector_type="SANDBOX_STUB",
                health_status="ONLINE",
                last_heartbeat_at=now,
            ),
        ]
        self.sources = {source.source_id: source for source in seeded_sources}
        self.bindings = {
            f"EDBIND-{index:03d}": ExternalDataConnectorBindingRecord(
                binding_id=f"EDBIND-{index:03d}",
                source_id=source.source_id,
                binding_type="SANDBOX_STUB",
                endpoint_alias=f"sandbox://{source.source_code.lower()}/readiness",
                config_snapshot={
                    "credentialRef": None,
                    "credentialPolicy": "NO_REAL_CREDENTIALS_IN_P2",
                    "externalNetworkCall": False,
                },
                created_at=now,
            )
            for index, source in enumerate(seeded_sources, start=1)
        }
        self.jobs = {
            "DSJOB-HR-TRAINING-001": DataSyncJobRecord(
                job_id="DSJOB-HR-TRAINING-001",
                source_id="EDS-HR-SANDBOX",
                source_code="HR_SYS",
                indicator_id="AIND-SEED-001",
                indicator_name="Branch compliance material timeliness sandbox sample",
                cycle_id=None,
                status="SUCCESS",
                records=1250,
                error_code=None,
                error_message=None,
                started_at=now,
                finished_at=now,
                has_snapshot=True,
            ),
            "DSJOB-TRADE-AML-001": DataSyncJobRecord(
                job_id="DSJOB-TRADE-AML-001",
                source_id="EDS-TRADE-SANDBOX",
                source_code="TRADE_CORE",
                indicator_id="AIND-SEED-001",
                indicator_name="AML large transaction sandbox sample",
                cycle_id=None,
                status="FAILED",
                records=0,
                error_code="SANDBOX_TIMEOUT",
                error_message=(
                    "Sandbox connector heartbeat timeout; no production endpoint was called"
                ),
                started_at=now,
                finished_at=now,
                has_snapshot=False,
            ),
            "DSJOB-CRM-COMPLAINT-001": DataSyncJobRecord(
                job_id="DSJOB-CRM-COMPLAINT-001",
                source_id="EDS-CRM-SANDBOX",
                source_code="CRM_SYS",
                indicator_id="AIND-SEED-001",
                indicator_name="Customer complaint closure sandbox sample",
                cycle_id=None,
                status="SUCCESS",
                records=84,
                error_code=None,
                error_message=None,
                started_at=now,
                finished_at=now,
                has_snapshot=True,
            ),
        }
        self.snapshots = {
            "DSSNAP-HR-TRAINING-001": DataSyncSnapshotRecord(
                snapshot_id="DSSNAP-HR-TRAINING-001",
                job_id="DSJOB-HR-TRAINING-001",
                payload_hash=self._payload_hash(
                    {"jobId": "DSJOB-HR-TRAINING-001", "records": 1250},
                ),
                record_count=1250,
                redaction_policy="STRICT",
                captured_at=now,
                sample_rows=[
                    {"employeeRef": "EMP-***-001", "trainingHours": 12, "completion": "Y"},
                    {"employeeRef": "EMP-***-002", "trainingHours": 8, "completion": "Y"},
                ],
                omitted_fields=["employeeName", "nationalId", "phone", "rawPayload"],
            ),
            "DSSNAP-CRM-COMPLAINT-001": DataSyncSnapshotRecord(
                snapshot_id="DSSNAP-CRM-COMPLAINT-001",
                job_id="DSJOB-CRM-COMPLAINT-001",
                payload_hash=self._payload_hash(
                    {"jobId": "DSJOB-CRM-COMPLAINT-001", "records": 84},
                ),
                record_count=84,
                redaction_policy="STRICT",
                captured_at=now,
                sample_rows=[
                    {"caseRef": "CASE-***-041", "closedWithinSla": True, "riskTag": "LOW"},
                    {"caseRef": "CASE-***-052", "closedWithinSla": False, "riskTag": "MEDIUM"},
                ],
                omitted_fields=["customerName", "customerId", "contactNo", "rawPayload"],
            ),
        }
        self.alerts = {
            "DSALERT-TRADE-AML-001": DataSyncAlertRecord(
                alert_id="DSALERT-TRADE-AML-001",
                job_id="DSJOB-TRADE-AML-001",
                source_id="EDS-TRADE-SANDBOX",
                status="OPEN",
                severity="HIGH",
                message=(
                    "Sandbox TRADE_CORE sample job failed; production connector is not called in P2"
                ),
                created_at=now,
            ),
        }
        for job in self.jobs.values():
            self._append_log(
                job_id=job.job_id,
                source_id=job.source_id,
                event_type=f"DATA_SYNC_{job.status}",
                message="Seeded sandbox data sync job state",
                actor_user_id=None,
                metadata={"sandboxOnly": True, "seedFixture": True},
            )

    def _source_view(self, source: ExternalDataSourceRecord) -> dict[str, Any]:
        jobs = [job for job in self.jobs.values() if job.source_id == source.source_id]
        successful = [job for job in jobs if job.status == "SUCCESS"]
        failed = [job for job in jobs if job.status == "FAILED"]
        return {
            "sourceId": source.source_id,
            "sourceCode": source.source_code,
            "sourceName": source.source_name,
            "ownerDeptSnapshot": deepcopy(source.owner_dept_snapshot),
            "connectorType": source.connector_type,
            "healthStatus": source.health_status,
            "lastHeartbeatAt": source.last_heartbeat_at,
            "lastSuccessfulJobId": successful[-1].job_id if successful else None,
            "lastFailureJobId": failed[-1].job_id if failed else None,
            "sandboxOnly": source.sandbox_only,
            "nonProductionLabel": "sandbox readiness source",
        }

    def _job_view(self, job: DataSyncJobRecord) -> dict[str, Any]:
        open_alert_count = sum(
            1
            for alert in self.alerts.values()
            if alert.job_id == job.job_id and alert.status == "OPEN"
        )
        return {
            "jobId": job.job_id,
            "sourceId": job.source_id,
            "sourceCode": job.source_code,
            "indicatorId": job.indicator_id,
            "indicatorName": job.indicator_name,
            "cycleId": job.cycle_id,
            "status": job.status,
            "records": job.records,
            "errorCode": job.error_code,
            "errorMessage": job.error_message,
            "startedAt": job.started_at,
            "finishedAt": job.finished_at,
            "hasSnapshot": job.has_snapshot,
            "openAlertCount": open_alert_count,
            "alertIds": [
                alert.alert_id for alert in self.alerts.values() if alert.job_id == job.job_id
            ],
            "sandboxOnly": job.sandbox_only,
            "nonProductionLabel": "sandbox data sync job",
        }

    def _snapshot_view(self, snapshot: DataSyncSnapshotRecord) -> dict[str, Any]:
        return {
            "snapshotId": snapshot.snapshot_id,
            "jobId": snapshot.job_id,
            "payloadHash": snapshot.payload_hash,
            "recordCount": snapshot.record_count,
            "redactionPolicy": snapshot.redaction_policy,
            "capturedAt": snapshot.captured_at,
            "sampleRows": deepcopy(snapshot.sample_rows),
            "omittedFields": list(snapshot.omitted_fields),
            "fileId": snapshot.file_id,
            "sandboxOnly": snapshot.sandbox_only,
            "evidenceLabel": "SANDBOX_REDACTED_SAMPLE_SNAPSHOT",
            "nonProductionLabel": "redacted sandbox sample, not a formal compliance artifact",
        }

    @staticmethod
    def _command_response(
        log: DataSyncLogRecord,
        job: DataSyncJobRecord,
        *,
        idempotent_replay: bool,
    ) -> dict[str, Any]:
        return {
            "operationId": log.log_id,
            "jobId": job.job_id,
            "newStatus": log.metadata.get("newStatus", job.status),
            "auditEventId": log.log_id,
            "idempotentReplay": idempotent_replay,
            "sandboxOnly": True,
            "evidenceLabel": "SANDBOX_OPERATION_AUDIT_EVENT",
        }

    @staticmethod
    def _alert_response(
        log: DataSyncLogRecord,
        alert: DataSyncAlertRecord,
        job: DataSyncJobRecord,
        *,
        idempotent_replay: bool,
    ) -> dict[str, Any]:
        return {
            "operationId": log.log_id,
            "alertId": alert.alert_id,
            "jobId": job.job_id,
            "newStatus": alert.status,
            "auditEventId": log.log_id,
            "idempotentReplay": idempotent_replay,
            "jobEvidenceRetained": True,
            "sandboxOnly": True,
            "evidenceLabel": "SANDBOX_OPERATION_AUDIT_EVENT",
        }

    @staticmethod
    def _rerun_response(
        rerun: DataSyncRerunRequestRecord,
        audit_log: DataSyncLogRecord,
        *,
        idempotent_replay: bool,
    ) -> dict[str, Any]:
        return {
            "operationId": rerun.rerun_request_id,
            "rerunRequestId": rerun.rerun_request_id,
            "jobId": rerun.job_id,
            "newStatus": "OVERWRITE_REQUESTED",
            "rerunStatus": rerun.status,
            "auditEventId": audit_log.log_id,
            "idempotentReplay": idempotent_replay,
            "sandboxOnly": True,
            "evidenceLabel": "SANDBOX_HIGH_RISK_OPERATION_AUDIT_EVENT",
            "cancellationDeferred": True,
        }

    @staticmethod
    def _export_response(
        artifact: ExportArtifactRecord,
        audit_event: ExportAuditEventRecord,
        *,
        idempotent_replay: bool,
    ) -> dict[str, Any]:
        return {
            "operationId": artifact.export_id,
            "exportId": artifact.export_id,
            "exportType": artifact.export_type,
            "format": artifact.format,
            "filterSnapshot": deepcopy(artifact.filter_snapshot),
            "status": artifact.status,
            "fileId": artifact.file_id,
            "downloadUrl": artifact.download_url,
            "expiresAt": artifact.expires_at,
            "checksum": artifact.checksum,
            "redactionPolicy": artifact.redaction_policy,
            "auditEventId": audit_event.export_audit_event_id,
            "idempotentReplay": idempotent_replay,
            "sandboxOnly": artifact.sandbox_only,
            "evidenceLabel": artifact.evidence_label,
            "formalArtifact": artifact.formal_artifact,
            "signedArtifact": artifact.signed_artifact,
            "nonProductionLabel": (
                "sandbox evidence metadata only, not a signed compliance artifact"
            ),
        }

    def _append_log(
        self,
        *,
        job_id: str | None,
        source_id: str | None,
        event_type: str,
        message: str,
        actor_user_id: str | None,
        metadata: dict[str, Any],
    ) -> DataSyncLogRecord:
        log = DataSyncLogRecord(
            log_id=f"DSLOG-{len(self.logs) + 1:04d}",
            job_id=job_id,
            source_id=source_id,
            event_type=event_type,
            message=message,
            actor_user_id=actor_user_id,
            created_at=relative_datetime_iso(),
            command_type=metadata.get("commandType"),
            request_id=metadata.get("requestId"),
            payload_hash=metadata.get("payloadHash"),
            metadata=metadata,
        )
        self.logs[log.log_id] = log
        return log

    def _get_job(self, job_id: str) -> DataSyncJobRecord:
        job = self.jobs.get(job_id)
        if not job:
            raise NotFoundError("Data sync job not found")
        return job

    def _get_alert(self, alert_id: str) -> DataSyncAlertRecord:
        alert = self.alerts.get(alert_id)
        if not alert:
            raise NotFoundError("Data sync alert not found")
        return alert

    def _validated_time_range(self, raw: str | None) -> str:
        value = raw or "7days"
        if value not in TIME_RANGES:
            raise self._validation_error("timeRange", value, sorted(TIME_RANGES))
        return value

    def _validated_source_code(self, raw: str | None) -> str | None:
        if not raw or raw == "all":
            return None
        known_codes = {source.source_code for source in self.sources.values()}
        if raw not in known_codes:
            raise self._validation_error("source", raw, sorted(known_codes))
        return raw

    def _validated_source_ids(self, source_ids: list[str]) -> None:
        known_ids = set(self.sources)
        missing = [source_id for source_id in source_ids if source_id not in known_ids]
        if missing:
            raise self._validation_error("sourceIds", ",".join(missing), sorted(known_ids))

    def _validated_status(self, raw: str | None) -> str | None:
        if not raw or raw == "all":
            return None
        if raw not in JOB_STATUSES:
            raise self._validation_error("status", raw, sorted(JOB_STATUSES))
        return raw

    def _validated_status_list(self, raw: Any) -> list[str]:
        if raw is None or raw == "":
            return []
        values = [raw] if isinstance(raw, str) else list(raw)
        for value in values:
            if value not in JOB_STATUSES:
                raise self._validation_error("status", str(value), sorted(JOB_STATUSES))
        return values

    @staticmethod
    def _validated_reason(raw: str | None, message: str) -> str:
        reason = (raw or "").strip()
        if not reason:
            raise AppError(
                code="VALIDATION_ERROR",
                message=message,
                status_code=422,
                details={"reason": "required"},
            )
        return reason

    @staticmethod
    def _validation_error(
        field: str,
        value: str,
        allowed: list[str],
        *,
        code: str = "INVALID_DATA_SYNC_FILTER",
    ) -> AppError:
        return AppError(
            code=code,
            message=f"Invalid {field}",
            status_code=422,
            details={"field": field, "value": value, "allowed": allowed},
        )

    def _command_replay(
        self,
        *,
        actor_id: str,
        request_id: str | None,
        command: str,
        payload_hash: str,
    ) -> str | None:
        if not request_id:
            return None
        indexed = self._request_index.get((command, actor_id, request_id))
        if not indexed:
            return None
        record_payload_hash = self._indexed_payload_hash(command, indexed)
        if record_payload_hash != payload_hash:
            raise AppError(
                code="IDEMPOTENCY_KEY_CONFLICT",
                message="requestId was already used with a different data cockpit payload",
                status_code=409,
                details={
                    "requestId": request_id,
                    "existingOperationId": indexed,
                    "existingPayloadHash": record_payload_hash,
                    "incomingPayloadHash": payload_hash,
                },
            )
        return indexed

    def _indexed_payload_hash(self, command: str, indexed: str) -> str | None:
        if command in {"retry", "ignore_alert"}:
            return self.logs[indexed].payload_hash or self.logs[indexed].metadata.get("payloadHash")
        if command == "overwrite_rerun":
            return self.rerun_requests[indexed].payload_hash
        if command == "evidence_export":
            artifact = self.export_artifacts[indexed]
            audit = next(
                event
                for event in self.export_audit_events.values()
                if event.export_id == artifact.export_id
            )
            return audit.access_metadata.get("payloadHash")
        return None

    def _remember_request(
        self,
        actor_id: str,
        request_id: str | None,
        command: str,
        operation_id: str,
    ) -> None:
        if request_id:
            self._request_index[(command, actor_id, request_id)] = operation_id

    def _rebuild_request_index(self) -> None:
        self._request_index = {}
        for log in self.logs.values():
            request_id = log.request_id or log.metadata.get("requestId")
            actor_id = log.actor_user_id
            if not request_id or not actor_id:
                continue
            command_type = log.command_type or log.metadata.get("commandType")
            if command_type == "retry" or log.event_type == "DATA_SYNC_RETRY_REQUESTED":
                self._remember_request(actor_id, request_id, "retry", log.log_id)
            elif command_type == "ignore_alert" or log.event_type in {
                "DATA_SYNC_ALERT_IGNORED",
                "DATA_SYNC_ALERT_IGNORE_NOOP",
            }:
                self._remember_request(actor_id, request_id, "ignore_alert", log.log_id)
        for rerun in self.rerun_requests.values():
            self._remember_request(
                rerun.requested_by,
                rerun.request_id,
                "overwrite_rerun",
                rerun.rerun_request_id,
            )
        for artifact in self.export_artifacts.values():
            self._remember_request(
                artifact.requested_by,
                artifact.request_id,
                "evidence_export",
                artifact.export_id,
            )

    @staticmethod
    def _source_window_key(job: DataSyncJobRecord) -> str:
        return "|".join(
            [
                job.source_id,
                job.indicator_id or "NO_INDICATOR",
                job.cycle_id or "NO_CYCLE",
            ],
        )

    @staticmethod
    def _payload_hash(payload: dict[str, Any]) -> str:
        encoded = json.dumps(payload, sort_keys=True, ensure_ascii=True, separators=(",", ":"))
        return hashlib.sha256(encoded.encode("utf-8")).hexdigest()

    @staticmethod
    def _filter_by_time_range(
        jobs: list[DataSyncJobRecord],
        time_range: str,
    ) -> list[DataSyncJobRecord]:
        if time_range == "all":
            return jobs
        days = 7 if time_range == "7days" else 30
        cutoff = datetime.now(UTC) - timedelta(days=days)
        filtered: list[DataSyncJobRecord] = []
        for job in jobs:
            try:
                started_at = datetime.fromisoformat(job.started_at.replace("Z", "+00:00"))
            except ValueError:
                filtered.append(job)
                continue
            if started_at.tzinfo is None:
                started_at = started_at.replace(tzinfo=UTC)
            if started_at >= cutoff:
                filtered.append(job)
        return filtered

    @staticmethod
    def _require_read(user: AuthUserRecord, auth_store: SeedAuthStore) -> None:
        auth_store.require_permission(user, READ_PERMISSION)

    @staticmethod
    def _require_operate(user: AuthUserRecord, auth_store: SeedAuthStore) -> None:
        auth_store.require_permission(user, OPERATE_PERMISSION)

    @staticmethod
    def _require_export(user: AuthUserRecord, auth_store: SeedAuthStore) -> None:
        auth_store.require_permission(user, EXPORT_PERMISSION)

    @staticmethod
    def _assert_hq_scope(user: AuthUserRecord, auth_store: SeedAuthStore) -> None:
        if auth_store.primary_data_scope_for_roles(user.role_ids) != "all":
            raise AppError(
                code="FORBIDDEN",
                message="Data cockpit is limited to HQ all-scope sandbox users",
                status_code=403,
                details={"orgId": user.org_id},
            )


data_cockpit_store = SeedDataCockpitStore()
