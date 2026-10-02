from __future__ import annotations

import hashlib
import json
from copy import deepcopy
from dataclasses import dataclass, field
from typing import Any

from app.modules.compliance.core.errors import AppError, ForbiddenError, NotFoundError
from app.modules.compliance.domain.auth_store import AuthUserRecord, SeedAuthStore
from app.modules.compliance.domain.result_store import result_store
from app.modules.compliance.domain.scheme_store import AssessmentSchemeRecord, scheme_store
from app.modules.compliance.domain.seed_time import relative_datetime_iso

ALLOWED_IMPUTATION_POLICIES = {"exact", "missing", "exclude"}


@dataclass
class AssessmentSimulationRunRecord:
    simulation_id: str
    scheme_id: str
    scheme_version_id: str | None
    reference_period: str
    status: str
    requested_by: str
    request_id: str | None
    actor_snapshot: dict[str, Any]
    org_context_snapshot: dict[str, Any]
    input_snapshot: dict[str, Any]
    input_snapshot_hash: str
    imputation_policy: str
    preflight_findings: list[dict[str, Any]]
    result_summary: dict[str, Any]
    org_results: list[dict[str, Any]]
    imputation_notes: list[dict[str, Any]]
    created_at: str
    started_at: str | None = None
    finished_at: str | None = None
    audit_events: list[dict[str, Any]] = field(default_factory=list)
    error: dict[str, Any] | None = None


class SeedAssessmentSimulationStore:
    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self.runs: dict[str, AssessmentSimulationRunRecord] = {}
        self.request_id_index: dict[tuple[str, str], str] = {}

    def hydrate(self, *, runs: dict[str, AssessmentSimulationRunRecord]) -> None:
        self.runs = runs
        self.request_id_index = {
            (record.requested_by, record.request_id): record.simulation_id
            for record in runs.values()
            if record.request_id
        }

    def run_simulation(
        self,
        *,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        self._require_run(user, auth_store)
        self._assert_hq_scope(user, auth_store)
        request_id = payload.get("requestId")
        scheme = self._scheme_for_simulation(payload.get("schemeId"))
        scheme_version_id = self._validated_scheme_version(
            scheme,
            payload.get("schemeVersionId"),
        )
        reference_period = self._validated_reference_period(payload.get("referencePeriod"))
        imputation_policy = self._validated_imputation_policy(
            payload.get("imputationPolicy") or "exclude",
        )
        target_org_ids = self._target_org_ids(scheme, payload.get("targetOrgIds"))
        scheme_snapshot, snapshot_source = self._scheme_snapshot_for_simulation(
            scheme,
            payload.get("schemeDraftSnapshot"),
        )
        input_snapshot = {
            "schemeId": scheme.scheme_id,
            "schemeVersionId": scheme_version_id,
            "schemeName": scheme.scheme_name,
            "schemeStatus": scheme.status,
            "schemeSnapshotSource": snapshot_source,
            "referencePeriod": reference_period,
            "targetOrgIds": target_org_ids,
            "imputationPolicy": imputation_policy,
            "schemeSnapshot": scheme_snapshot,
            "simulationOnly": True,
        }
        input_snapshot_hash = self._snapshot_hash(input_snapshot)
        if request_id:
            indexed = self.request_id_index.get((user.user_id, request_id))
            if indexed and indexed in self.runs:
                existing = self.runs[indexed]
                if existing.input_snapshot_hash != input_snapshot_hash:
                    raise AppError(
                        code="IDEMPOTENCY_KEY_CONFLICT",
                        message="requestId was already used with a different simulation payload",
                        status_code=409,
                        details={
                            "requestId": request_id,
                            "existingSimulationId": existing.simulation_id,
                            "existingInputSnapshotHash": existing.input_snapshot_hash,
                            "incomingInputSnapshotHash": input_snapshot_hash,
                        },
                    )
                detail = self.detail(
                    simulation_id=indexed,
                    user=user,
                    auth_store=auth_store,
                )
                detail["idempotentReplay"] = True
                return detail

        simulation_id = self._next_simulation_id()
        created_at = relative_datetime_iso()
        run = AssessmentSimulationRunRecord(
            simulation_id=simulation_id,
            scheme_id=scheme.scheme_id,
            scheme_version_id=input_snapshot["schemeVersionId"],
            reference_period=reference_period,
            status="QUEUED",
            requested_by=user.user_id,
            request_id=request_id,
            actor_snapshot=auth_store.user_snapshot(user.user_id),
            org_context_snapshot=auth_store.org_snapshot(user.org_id),
            input_snapshot=input_snapshot,
            input_snapshot_hash=input_snapshot_hash,
            imputation_policy=imputation_policy,
            preflight_findings=[],
            result_summary={},
            org_results=[],
            imputation_notes=[],
            created_at=created_at,
            audit_events=[
                {
                    "eventType": "SIMULATION_QUEUED",
                    "actorUserId": user.user_id,
                    "createdAt": created_at,
                },
            ],
        )
        self.runs[simulation_id] = run
        if request_id:
            self.request_id_index[(user.user_id, request_id)] = simulation_id

        run.status = "RUNNING"
        run.started_at = relative_datetime_iso()
        run.audit_events.append(
            {
                "eventType": "SIMULATION_RUNNING",
                "actorUserId": user.user_id,
                "createdAt": run.started_at,
            },
        )
        try:
            self._execute_bounded_backtest(run, scheme, target_org_ids, auth_store)
            run.status = "SUCCEEDED"
            run.finished_at = relative_datetime_iso()
            run.audit_events.append(
                {
                    "eventType": "SIMULATION_SUCCEEDED",
                    "actorUserId": user.user_id,
                    "createdAt": run.finished_at,
                },
            )
        except AppError as exc:
            run.status = "FAILED"
            run.finished_at = relative_datetime_iso()
            run.error = {"code": exc.code, "message": exc.message, "details": exc.details}
            run.audit_events.append(
                {
                    "eventType": "SIMULATION_FAILED",
                    "actorUserId": user.user_id,
                    "errorCode": exc.code,
                    "createdAt": run.finished_at,
                },
            )
            raise
        return self._run_view(run)

    def detail(
        self,
        *,
        simulation_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        self._require_read(user, auth_store)
        self._assert_hq_scope(user, auth_store)
        run = self.runs.get(simulation_id)
        if not run:
            raise NotFoundError("Assessment simulation run not found")
        return self._run_view(run)

    def _execute_bounded_backtest(
        self,
        run: AssessmentSimulationRunRecord,
        scheme: AssessmentSchemeRecord,
        target_org_ids: list[str],
        auth_store: SeedAuthStore,
    ) -> None:
        findings = self._preflight_findings(scheme, target_org_ids, run.reference_period)
        org_results: list[dict[str, Any]] = []
        imputation_notes: list[dict[str, Any]] = []
        for org_id in target_org_ids:
            org_result, notes = self._simulate_org(
                scheme=scheme,
                org_id=org_id,
                reference_period=run.reference_period,
                imputation_policy=run.imputation_policy,
                auth_store=auth_store,
            )
            org_results.append(org_result)
            imputation_notes.extend(notes)
        run.preflight_findings = findings
        run.org_results = org_results
        run.imputation_notes = imputation_notes
        run.result_summary = self._summary(org_results, imputation_notes)

    def _simulate_org(
        self,
        *,
        scheme: AssessmentSchemeRecord,
        org_id: str,
        reference_period: str,
        imputation_policy: str,
        auth_store: SeedAuthStore,
    ) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        weighted_score = 0.0
        scored_weight = 0.0
        missing_items = 0
        notes: list[dict[str, Any]] = []
        for item in scheme.items:
            exact_score = self._historical_score(
                org_id=org_id,
                indicator_id=item.indicator_id,
                reference_period=reference_period,
            )
            if exact_score is None:
                missing_items += 1
                notes.append(
                    {
                        "sourceType": "historical_reporting",
                        "indicatorId": item.indicator_id,
                        "schemeItemId": item.scheme_item_id,
                        "orgId": org_id,
                        "referencePeriod": reference_period,
                        "policy": imputation_policy,
                        "reason": "No exact historical input was found for this item and period",
                        "effectOnScore": "excluded_from_denominator",
                        "scoreImpact": 0,
                    },
                )
                continue
            weighted_score += exact_score * item.weight
            scored_weight += item.weight
            notes.append(
                {
                    "sourceType": "historical_reporting",
                    "indicatorId": item.indicator_id,
                    "schemeItemId": item.scheme_item_id,
                    "orgId": org_id,
                    "referencePeriod": reference_period,
                    "policy": "exact",
                    "reason": "Exact historical input was available in the bounded store",
                    "effectOnScore": "included",
                    "scoreImpact": round(exact_score * item.weight / 100, 4),
                },
            )
        score = round(weighted_score / scored_weight, 2) if scored_weight else None
        official = self._official_score_for_org(org_id)
        return (
            {
                "orgId": org_id,
                "orgSnapshot": auth_store.org_snapshot(org_id),
                "score": score,
                "grade": self._grade_for_score(scheme, score),
                "coverage": {
                    "totalItems": len(scheme.items),
                    "scoredItems": len(scheme.items) - missing_items,
                    "missingItems": missing_items,
                    "coverageRatio": round(
                        (len(scheme.items) - missing_items) / max(len(scheme.items), 1),
                        4,
                    ),
                },
                "imputationSummary": {
                    "policy": imputation_policy,
                    "noteCount": len([note for note in notes if note["policy"] != "exact"]),
                    "silentZeroFill": False,
                },
                "historicalOfficialComparison": {
                    "officialScore": official,
                    "difference": round(score - official, 2)
                    if score is not None and official is not None
                    else None,
                    "readOnly": True,
                },
                "simulationOnly": True,
            },
            notes,
        )

    def _preflight_findings(
        self,
        scheme: AssessmentSchemeRecord,
        target_org_ids: list[str],
        reference_period: str,
    ) -> list[dict[str, Any]]:
        findings = [
            {
                "code": "SCHEME_DRAFT_READY"
                if scheme.status == "DRAFT"
                else "SCHEME_VERSION_READY",
                "severity": "INFO",
                "message": (
                    "Draft scheme snapshot is available for simulation"
                    if scheme.status == "DRAFT"
                    else "Active scheme snapshot is available for simulation"
                ),
                "affectedScope": {"schemeId": scheme.scheme_id, "status": scheme.status},
                "blocking": False,
            },
            {
                "code": "TARGET_SCOPE_READY",
                "severity": "INFO",
                "message": "Target scope is constrained to the scheme snapshot",
                "affectedScope": {"targetCount": len(target_org_ids)},
                "blocking": False,
            },
            {
                "code": "ROUTE_REVIEW_CONTEXT_READ_ONLY",
                "severity": "INFO",
                "message": "Workflow/review context is referenced as read-only preflight context",
                "affectedScope": {"schemeId": scheme.scheme_id},
                "blocking": False,
            },
        ]
        if not scheme.items or round(sum(item.weight for item in scheme.items), 4) <= 0:
            findings.append(
                {
                    "code": "WEIGHT_FORMULA_NOT_READY",
                    "severity": "ERROR",
                    "message": "Scheme items and positive weights are required",
                    "affectedScope": {"schemeId": scheme.scheme_id},
                    "blocking": True,
                },
            )
        if not any(
            self._historical_score(
                org_id=org_id,
                indicator_id=item.indicator_id,
                reference_period=reference_period,
            )
            is not None
            for org_id in target_org_ids
            for item in scheme.items
        ):
            findings.append(
                {
                    "code": "HISTORICAL_COVERAGE_MISSING",
                    "severity": "WARNING",
                    "message": (
                        "No exact historical inputs were found; "
                        "imputation notes explain exclusions"
                    ),
                    "affectedScope": {"referencePeriod": reference_period},
                    "blocking": False,
                },
            )
        return findings

    @staticmethod
    def _summary(
        org_results: list[dict[str, Any]],
        imputation_notes: list[dict[str, Any]],
    ) -> dict[str, Any]:
        scored = [item for item in org_results if item["score"] is not None]
        excluded = [item for item in org_results if item["score"] is None]
        scored_sorted = sorted(scored, key=lambda item: item["score"], reverse=True)
        grade_distribution: dict[str, int] = {}
        for item in org_results:
            grade_distribution[item["grade"]] = grade_distribution.get(item["grade"], 0) + 1
        return {
            "totalTargetCount": len(org_results),
            "scoredTargetCount": len(scored),
            "excludedTargetCount": len(excluded),
            "missingDataCount": len(
                [note for note in imputation_notes if note["policy"] != "exact"],
            ),
            "averageSimulatedScore": round(
                sum(item["score"] for item in scored) / len(scored),
                2,
            )
            if scored
            else None,
            "highestScore": scored_sorted[0]["score"] if scored_sorted else None,
            "lowestScore": scored_sorted[-1]["score"] if scored_sorted else None,
            "gradeDistribution": grade_distribution,
            "topSamples": scored_sorted[:3],
            "bottomSamples": list(reversed(scored_sorted[-3:])),
            "comparison": {
                "officialResultReference": "read_only_when_available",
                "mutatesOfficialResult": False,
            },
            "simulationOnly": True,
        }

    @staticmethod
    def _historical_score(
        *,
        org_id: str,
        indicator_id: str,
        reference_period: str,
    ) -> float | None:
        exact_periods = {"2025Q4", "2026Q1", "2026-H1"}
        if reference_period not in exact_periods:
            return None
        digest = hashlib.sha1(f"{org_id}:{indicator_id}:{reference_period}".encode()).hexdigest()
        return 72 + (int(digest[:4], 16) % 2400) / 100

    @staticmethod
    def _official_score_for_org(org_id: str) -> float | None:
        for result in result_store.results.values():
            if result.target_org_id == org_id:
                return result.total_score
        return None

    @staticmethod
    def _grade_for_score(scheme: AssessmentSchemeRecord, score: float | None) -> str:
        if score is None:
            return "EXCLUDED"
        for threshold in sorted(
            scheme.grade_thresholds,
            key=lambda item: item.min_score,
            reverse=True,
        ):
            if score >= threshold.min_score and (
                threshold.max_score is None or score < threshold.max_score
            ):
                return threshold.grade_code
        return "UNRATED"

    @staticmethod
    def _scheme_for_simulation(scheme_id: str | None) -> AssessmentSchemeRecord:
        if not scheme_id:
            raise AppError(
                code="VALIDATION_ERROR",
                message="schemeId is required",
                status_code=422,
                details={"field": "schemeId"},
            )
        scheme = scheme_store.schemes.get(scheme_id)
        if not scheme:
            raise AppError(
                code="VALIDATION_ERROR",
                message="Assessment scheme was not found",
                status_code=422,
                details={"schemeId": scheme_id},
            )
        if scheme.status not in {"ACTIVE", "DRAFT"}:
            raise AppError(
                code="VALIDATION_ERROR",
                message="Simulation requires an ACTIVE scheme snapshot or current DRAFT",
                status_code=422,
                details={"schemeId": scheme_id, "status": scheme.status},
            )
        return scheme

    @staticmethod
    def _validated_scheme_version(
        scheme: AssessmentSchemeRecord,
        scheme_version_id: str | None,
    ) -> str | None:
        if scheme.status == "DRAFT":
            draft_version = f"DRAFT-{scheme.optimistic_version}"
            if scheme_version_id and scheme_version_id != draft_version:
                raise AppError(
                    code="VALIDATION_ERROR",
                    message="schemeVersionId does not match the current draft version",
                    status_code=422,
                    details={
                        "schemeId": scheme.scheme_id,
                        "schemeVersionId": scheme_version_id,
                        "draftSchemeVersionId": draft_version,
                    },
                )
            return scheme_version_id or draft_version
        active_version = scheme.published_at_ref
        if scheme_version_id and scheme_version_id != active_version:
            raise AppError(
                code="VALIDATION_ERROR",
                message="schemeVersionId does not match the active scheme snapshot",
                status_code=422,
                details={
                    "schemeId": scheme.scheme_id,
                    "schemeVersionId": scheme_version_id,
                    "activeSchemeVersionId": active_version,
                },
            )
        return scheme_version_id or active_version

    @staticmethod
    def _scheme_snapshot_for_simulation(
        scheme: AssessmentSchemeRecord,
        draft_snapshot: dict[str, Any] | None,
    ) -> tuple[dict[str, Any], str]:
        if scheme.status == "DRAFT":
            if draft_snapshot:
                return deepcopy(draft_snapshot), "DRAFT_REQUEST_SNAPSHOT"
            return scheme_store.scheme_detail(scheme), "DRAFT_STORE_DETAIL"
        return (
            scheme.scheme_snapshot or scheme_store.active_scheme_snapshot(scheme.scheme_id),
            "ACTIVE_IMMUTABLE_SNAPSHOT",
        )

    @staticmethod
    def _validated_reference_period(value: str | None) -> str:
        if not value:
            raise AppError(
                code="VALIDATION_ERROR",
                message="referencePeriod is required",
                status_code=422,
                details={"field": "referencePeriod"},
            )
        if len(value) > 40 or any(part in value for part in ("..", "/", "\\")):
            raise AppError(
                code="VALIDATION_ERROR",
                message="referencePeriod is invalid",
                status_code=422,
                details={"referencePeriod": value},
            )
        return value

    @staticmethod
    def _validated_imputation_policy(value: str) -> str:
        if value not in ALLOWED_IMPUTATION_POLICIES:
            raise AppError(
                code="VALIDATION_ERROR",
                message="Unsupported imputation policy",
                status_code=422,
                details={
                    "imputationPolicy": value,
                    "allowed": sorted(ALLOWED_IMPUTATION_POLICIES),
                    "silentZeroFillAllowed": False,
                },
            )
        return value

    @staticmethod
    def _target_org_ids(
        scheme: AssessmentSchemeRecord,
        requested_target_org_ids: list[str] | None,
    ) -> list[str]:
        scheme_targets = {
            member.org_id
            for group in scheme.target_groups
            for member in group.members
        }
        if not scheme_targets:
            raise AppError(
                code="VALIDATION_ERROR",
                message="Scheme has no target scope",
                status_code=422,
                details={"schemeId": scheme.scheme_id},
            )
        target_org_ids = requested_target_org_ids or sorted(scheme_targets)
        outside = sorted(set(target_org_ids) - scheme_targets)
        if outside:
            raise AppError(
                code="VALIDATION_ERROR",
                message="Simulation target scope must stay inside the scheme snapshot",
                status_code=422,
                details={"outsideTargetOrgIds": outside},
            )
        return list(dict.fromkeys(target_org_ids))

    def _next_simulation_id(self) -> str:
        return f"ASIM-{len(self.runs) + 1:04d}"

    @staticmethod
    def _snapshot_hash(snapshot: dict[str, Any]) -> str:
        canonical = json.dumps(
            snapshot,
            default=str,
            ensure_ascii=True,
            separators=(",", ":"),
            sort_keys=True,
        )
        return hashlib.sha1(canonical.encode()).hexdigest()

    @staticmethod
    def _require_run(user: AuthUserRecord, auth_store: SeedAuthStore) -> None:
        auth_store.require_permission(user, "PERM-P2-ASSESSMENT-SIMULATION-RUN")

    @staticmethod
    def _require_read(user: AuthUserRecord, auth_store: SeedAuthStore) -> None:
        auth_store.require_permission(user, "PERM-P2-ASSESSMENT-SIMULATION-READ")

    @staticmethod
    def _assert_hq_scope(user: AuthUserRecord, auth_store: SeedAuthStore) -> None:
        if auth_store.primary_data_scope_for_roles(user.role_ids) != "all":
            raise ForbiddenError("HQ simulation APIs require all data scope")

    @staticmethod
    def _run_view(record: AssessmentSimulationRunRecord) -> dict[str, Any]:
        return {
            "simulationId": record.simulation_id,
            "schemeId": record.scheme_id,
            "schemeVersionId": record.scheme_version_id,
            "referencePeriod": record.reference_period,
            "status": record.status,
            "simulationOnly": True,
            "requestedBy": record.requested_by,
            "requestId": record.request_id,
            "actorSnapshot": deepcopy(record.actor_snapshot),
            "orgContextSnapshot": deepcopy(record.org_context_snapshot),
            "inputSnapshot": deepcopy(record.input_snapshot),
            "inputSnapshotHash": record.input_snapshot_hash,
            "imputationPolicy": record.imputation_policy,
            "preflightFindings": deepcopy(record.preflight_findings),
            "resultSummary": deepcopy(record.result_summary),
            "orgResults": deepcopy(record.org_results),
            "imputationNotes": deepcopy(record.imputation_notes),
            "auditMetadata": {
                "createdAt": record.created_at,
                "startedAt": record.started_at,
                "finishedAt": record.finished_at,
                "auditEvents": deepcopy(record.audit_events),
                "statusTransitions": [
                    event["eventType"] for event in record.audit_events
                ],
            },
            "error": deepcopy(record.error),
        }


assessment_simulation_store = SeedAssessmentSimulationStore()
