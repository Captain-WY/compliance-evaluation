from __future__ import annotations

import hashlib
import json
from copy import deepcopy
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta
from typing import Any

from app.modules.compliance.core.errors import AppError, ForbiddenError, NotFoundError
from app.modules.compliance.domain.auth_store import AuthUserRecord, SeedAuthStore
from app.modules.compliance.domain.dictionaries import assessment_transition_for, validate_codes
from app.modules.compliance.domain.indicator_store import indicator_store
from app.modules.compliance.domain.seed_time import relative_datetime_iso
from app.modules.compliance.domain.workflow_evaluator import RouteChainEvaluator
from app.modules.compliance.domain.workflow_models import WORKFLOW_LEVELS, WorkflowTemplateAggregate, snapshot_hash
from app.modules.compliance.domain.workflow_store import workflow_template_store


@dataclass
class SchemeItemRecord:
    scheme_item_id: str
    indicator_id: str
    version_id: str
    weight: float
    score_cap: float | None = None
    sort_order: int = 0
    indicator_snapshot: dict[str, Any] = field(default_factory=dict)


@dataclass
class GradeThresholdRecord:
    threshold_id: str
    grade_code: str
    grade_label: str
    min_score: float
    max_score: float | None
    sort_order: int = 0


@dataclass
class VolumeAdjustmentFactorRecord:
    factor_id: str
    factor_code: str
    factor_name: str
    metric: str | None = None
    operator: str | None = None
    value: float | None = None
    description: str = ""
    multiplier: float = 1
    enabled: bool = True
    sort_order: int = 0


@dataclass
class TargetGroupMemberRecord:
    member_id: str
    org_id: str
    org_snapshot: dict[str, Any]
    sort_order: int = 0


@dataclass
class TargetGroupRecord:
    target_group_id: str
    group_name: str
    scope_mode: str
    members: list[TargetGroupMemberRecord]
    description: str = ""
    sort_order: int = 0


@dataclass
class AssessmentSchemeRecord:
    scheme_id: str
    scheme_code: str
    scheme_name: str
    year: int
    frequency: str
    status: str
    description: str
    total_weight: float
    created_by_ref: str
    created_at: str
    items: list[SchemeItemRecord]
    grade_thresholds: list[GradeThresholdRecord]
    volume_adjustment_factors: list[VolumeAdjustmentFactorRecord]
    target_groups: list[TargetGroupRecord]
    published_by_ref: str | None = None
    published_at_ref: str | None = None
    archived_reason: str | None = None
    has_been_published: bool = False
    scheme_snapshot: dict[str, Any] = field(default_factory=dict)
    optimistic_version: int = 1
    source_scheme_id: str | None = None
    source_scheme_code: str | None = None
    source_trace: dict[str, Any] = field(default_factory=dict)
    workflow_binding: dict[str, Any] = field(default_factory=dict)
    schedule_binding: dict[str, Any] = field(default_factory=dict)
    command_audit: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class SchemeCommandRecord:
    command_key_id: str
    scheme_scope_id: str
    command_type: str
    actor_user_id: str
    idempotency_key: str
    payload_hash: str
    result_ref: str
    result_snapshot: dict[str, Any]
    created_at: str


class SeedSchemeStore:
    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self.schemes = self._build_schemes()
        self.command_keys: dict[tuple[str, str, str, str], SchemeCommandRecord] = {}

    def scheme_page(
        self,
        *,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        keyword: str | None = None,
        year: int | None = None,
        status: str | None = None,
        frequency: str | None = None,
        business_line: str | None = None,
        target_scope_mode: str | None = None,
        updated_from: str | None = None,
        updated_to: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        self._require_read(user, auth_store)
        validate_codes(
            (status, "assessment_scheme_status", "status"),
            (frequency, "assessment_frequency", "frequency"),
        )
        updated_from_dt = self._parse_filter_datetime(updated_from, field="updatedFrom")
        updated_to_dt = self._parse_filter_datetime(
            updated_to,
            field="updatedTo",
            end_of_day=True,
        )
        records = [
            scheme
            for scheme in self.schemes.values()
            if self._matches_filters(
                scheme,
                keyword=keyword,
                year=year,
                status=status,
                frequency=frequency,
                business_line=business_line,
                target_scope_mode=target_scope_mode,
                updated_from=updated_from_dt,
                updated_to=updated_to_dt,
            )
        ]
        records.sort(
            key=lambda item: (self._scheme_updated_at(item), item.scheme_code),
            reverse=True,
        )
        start = (page - 1) * page_size
        end = start + page_size
        return {
            "items": [
                self.scheme_summary(record, auth_store=auth_store)
                for record in records[start:end]
            ],
            "page": page,
            "pageSize": page_size,
            "total": len(records),
        }

    def create_scheme(
        self,
        *,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        self._require_manage(user, auth_store)
        self._require_idempotency_key(payload.get("idempotencyKey"), command_type="create_draft")
        business_payload = self._business_payload(payload)
        payload_hash = self._payload_hash("create_draft", business_payload)
        replay = self._command_replay(
            scheme_scope_id="SCHEME_COLLECTION",
            command_type="create_draft",
            actor_user_id=user.user_id,
            idempotency_key=payload.get("idempotencyKey"),
            payload_hash=payload_hash,
        )
        if replay:
            return self._replay_result(replay)
        self._validate_payload(business_payload, auth_store)
        business_payload = self._materialize_target_groups_payload(business_payload, auth_store)
        scheme_id = self._next_scheme_id()
        scheme_code = business_payload.get("schemeCode") or self._next_scheme_code()
        if any(item.scheme_code == scheme_code for item in self.schemes.values()):
            raise AppError(
                code="DUPLICATE_SCHEME_CODE",
                message="方案编码已存在",
                status_code=409,
            )
        business_payload = self._materialize_workflow_binding_payload(
            business_payload,
            user=user,
            auth_store=auth_store,
        )
        business_payload = self._materialize_schedule_binding_payload(
            business_payload,
            user=user,
        )
        scheme = self._scheme_from_payload(
            scheme_id=scheme_id,
            scheme_code=scheme_code,
            payload=business_payload,
            user_id=user.user_id,
        )
        self._apply_org_snapshots(scheme, auth_store)
        self._append_scheme_audit(
            scheme,
            action="create_draft",
            user=user,
            auth_store=auth_store,
            payload_hash=payload_hash,
            idempotency_key=payload.get("idempotencyKey"),
            request_id=payload.get("requestId"),
            from_status=None,
            to_status=scheme.status,
        )
        self.schemes[scheme_id] = scheme
        result = self.scheme_detail(scheme, auth_store=auth_store)
        self._remember_command(
            scheme_scope_id="SCHEME_COLLECTION",
            command_type="create_draft",
            actor_user_id=user.user_id,
            idempotency_key=payload.get("idempotencyKey"),
            payload_hash=payload_hash,
            result_ref=scheme_id,
            result_snapshot=result,
        )
        return result

    def update_draft(
        self,
        *,
        scheme_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        self._require_manage(user, auth_store)
        self._require_idempotency_key(payload.get("idempotencyKey"), command_type="update_draft")
        business_payload = self._business_payload(payload)
        payload_hash = self._payload_hash("update_draft", business_payload)
        replay = self._command_replay(
            scheme_scope_id=scheme_id,
            command_type="update_draft",
            actor_user_id=user.user_id,
            idempotency_key=payload.get("idempotencyKey"),
            payload_hash=payload_hash,
        )
        if replay:
            return self._replay_result(replay)
        scheme = self._get_scheme(scheme_id)
        if scheme.status != "DRAFT":
            raise AppError(
                code="INVALID_STATE",
                message="Only DRAFT schemes can be updated",
                status_code=409,
            )
        self._ensure_optimistic_version(
            scheme,
            payload.get("optimisticVersion"),
            command_type="update_draft",
        )
        merged = self._detail_payload(scheme)
        merged.update(business_payload)
        self._validate_payload(merged, auth_store)
        merged = self._materialize_target_groups_payload(merged, auth_store)
        merged = self._materialize_workflow_binding_payload(
            merged,
            user=user,
            auth_store=auth_store,
        )
        merged = self._materialize_schedule_binding_payload(
            merged,
            user=user,
        )
        updated = self._scheme_from_payload(
            scheme_id=scheme.scheme_id,
            scheme_code=scheme.scheme_code,
            payload=merged,
            user_id=scheme.created_by_ref,
        )
        self._apply_org_snapshots(updated, auth_store)
        updated.created_at = scheme.created_at
        updated.has_been_published = scheme.has_been_published
        updated.optimistic_version = scheme.optimistic_version + 1
        updated.source_scheme_id = scheme.source_scheme_id
        updated.source_scheme_code = scheme.source_scheme_code
        updated.source_trace = deepcopy(scheme.source_trace)
        updated.command_audit = deepcopy(scheme.command_audit)
        self._append_scheme_audit(
            updated,
            action="update_draft",
            user=user,
            auth_store=auth_store,
            payload_hash=payload_hash,
            idempotency_key=payload.get("idempotencyKey"),
            request_id=payload.get("requestId"),
            from_status=scheme.status,
            to_status=updated.status,
        )
        self.schemes[scheme_id] = updated
        result = self.scheme_detail(updated, auth_store=auth_store)
        self._remember_command(
            scheme_scope_id=scheme_id,
            command_type="update_draft",
            actor_user_id=user.user_id,
            idempotency_key=payload.get("idempotencyKey"),
            payload_hash=payload_hash,
            result_ref=scheme_id,
            result_snapshot=result,
        )
        return result

    def publish_scheme(
        self,
        *,
        scheme_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        self._require_manage(user, auth_store)
        self._require_idempotency_key(
            (payload or {}).get("idempotencyKey"),
            command_type="publish",
        )
        command_payload = self._business_payload(payload or {})
        payload_hash = self._payload_hash("publish", command_payload)
        replay = self._command_replay(
            scheme_scope_id=scheme_id,
            command_type="publish",
            actor_user_id=user.user_id,
            idempotency_key=(payload or {}).get("idempotencyKey"),
            payload_hash=payload_hash,
        )
        if replay:
            return self._replay_result(replay)
        scheme = self._get_scheme(scheme_id)
        self._ensure_transition(scheme.status, "publish_scheme")
        self._ensure_optimistic_version(
            scheme,
            (payload or {}).get("optimisticVersion"),
            command_type="publish",
        )
        readiness = self._publish_readiness_for_payload(
            self._detail_payload(scheme),
            auth_store,
        )
        if not readiness["mandatoryReady"]:
            raise AppError(
                code="VALIDATION_ERROR",
                message="Scheme publish readiness gate failed",
                status_code=422,
                details=self._publish_readiness_findings(readiness),
            )
        self._refresh_indicator_snapshots(scheme)
        self._apply_org_snapshots(scheme, auth_store)
        from_status = scheme.status
        snapshot = self._scheme_snapshot(scheme)
        snapshot["readiness"] = deepcopy(readiness)
        snapshot["sourceTrace"] = deepcopy(scheme.source_trace) or None
        snapshot["snapshotHash"] = self._snapshot_hash(snapshot)
        scheme.scheme_snapshot = snapshot
        scheme.status = "ACTIVE"
        scheme.has_been_published = True
        scheme.published_by_ref = user.user_id
        scheme.published_at_ref = relative_datetime_iso()
        scheme.optimistic_version += 1
        self._append_scheme_audit(
            scheme,
            action="publish",
            user=user,
            auth_store=auth_store,
            payload_hash=payload_hash,
            idempotency_key=(payload or {}).get("idempotencyKey"),
            request_id=(payload or {}).get("requestId"),
            from_status=from_status,
            to_status=scheme.status,
            details={
                "readiness": deepcopy(readiness),
                "snapshotHash": scheme.scheme_snapshot.get("snapshotHash"),
                "sourceTrace": deepcopy(scheme.source_trace) or None,
            },
        )
        result = self.scheme_detail(scheme, auth_store=auth_store)
        self._remember_command(
            scheme_scope_id=scheme_id,
            command_type="publish",
            actor_user_id=user.user_id,
            idempotency_key=(payload or {}).get("idempotencyKey"),
            payload_hash=payload_hash,
            result_ref=scheme_id,
            result_snapshot=result,
        )
        return result

    def copy_scheme(
        self,
        *,
        scheme_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        self._require_manage(user, auth_store)
        self._require_idempotency_key(
            (payload or {}).get("idempotencyKey"),
            command_type="copy_to_draft",
        )
        command_payload = self._business_payload(payload or {})
        payload_hash = self._payload_hash("copy_to_draft", command_payload)
        replay = self._command_replay(
            scheme_scope_id=scheme_id,
            command_type="copy_to_draft",
            actor_user_id=user.user_id,
            idempotency_key=(payload or {}).get("idempotencyKey"),
            payload_hash=payload_hash,
        )
        if replay:
            return self._replay_result(replay)
        source = self._get_scheme(scheme_id)
        if source.status == "ARCHIVED":
            raise AppError(
                code="INVALID_STATE",
                message="ARCHIVED schemes cannot be copied to draft by default",
                status_code=409,
                details={"schemeId": scheme_id, "status": source.status},
            )
        self._ensure_optimistic_version(
            source,
            (payload or {}).get("optimisticVersion"),
            command_type="copy_to_draft",
        )
        copied = deepcopy(source)
        copied.scheme_id = self._next_scheme_id()
        copied.scheme_code = command_payload.get("schemeCode") or self._next_copy_code(source)
        if any(item.scheme_code == copied.scheme_code for item in self.schemes.values()):
            raise AppError(
                code="DUPLICATE_SCHEME_CODE",
                message="方案编码已存在",
                status_code=409,
            )
        copied.scheme_name = command_payload.get("schemeName") or f"{source.scheme_name} 副本"
        copied.status = "DRAFT"
        copied.created_by_ref = user.user_id
        copied.created_at = relative_datetime_iso()
        copied.published_by_ref = None
        copied.published_at_ref = None
        copied.archived_reason = None
        copied.has_been_published = False
        copied.scheme_snapshot = {}
        copied.optimistic_version = 1
        copied.source_scheme_id = source.scheme_id
        copied.source_scheme_code = source.scheme_code
        copied.source_trace = {
            "sourceSchemeId": source.scheme_id,
            "sourceSchemeCode": source.scheme_code,
            "sourceSchemeName": source.scheme_name,
            "sourceStatus": source.status,
            "sourceOptimisticVersion": source.optimistic_version,
            "copiedByRef": user.user_id,
            "copiedAt": relative_datetime_iso(),
            "sourceSnapshot": source.scheme_snapshot or self._scheme_snapshot(source),
        }
        copied.command_audit = []
        self._rekey_children(copied)
        self._append_scheme_audit(
            copied,
            action="copy_to_draft",
            user=user,
            auth_store=auth_store,
            payload_hash=payload_hash,
            idempotency_key=(payload or {}).get("idempotencyKey"),
            request_id=(payload or {}).get("requestId"),
            from_status=source.status,
            to_status=copied.status,
            details={"sourceSchemeId": source.scheme_id, "sourceSchemeCode": source.scheme_code},
        )
        self.schemes[copied.scheme_id] = copied
        result = self.scheme_detail(copied)
        self._remember_command(
            scheme_scope_id=scheme_id,
            command_type="copy_to_draft",
            actor_user_id=user.user_id,
            idempotency_key=(payload or {}).get("idempotencyKey"),
            payload_hash=payload_hash,
            result_ref=copied.scheme_id,
            result_snapshot=result,
        )
        return result

    def delete_draft(
        self,
        *,
        scheme_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        self._require_manage(user, auth_store)
        self._require_idempotency_key(
            (payload or {}).get("idempotencyKey"),
            command_type="delete_draft",
        )
        command_payload = self._business_payload(payload or {})
        payload_hash = self._payload_hash("delete_draft", command_payload)
        replay = self._command_replay(
            scheme_scope_id=scheme_id,
            command_type="delete_draft",
            actor_user_id=user.user_id,
            idempotency_key=(payload or {}).get("idempotencyKey"),
            payload_hash=payload_hash,
        )
        if replay:
            return self._replay_result(replay)
        scheme = self._get_scheme(scheme_id)
        if scheme.status != "DRAFT" or scheme.has_been_published:
            raise AppError(
                code="INVALID_STATE",
                message="Only never-published DRAFT schemes can be deleted",
                status_code=409,
            )
        self._ensure_optimistic_version(
            scheme,
            (payload or {}).get("optimisticVersion"),
            command_type="delete_draft",
        )
        del self.schemes[scheme_id]
        result = {"deleted": True, "schemeId": scheme_id}
        self._remember_command(
            scheme_scope_id=scheme_id,
            command_type="delete_draft",
            actor_user_id=user.user_id,
            idempotency_key=(payload or {}).get("idempotencyKey"),
            payload_hash=payload_hash,
            result_ref=scheme_id,
            result_snapshot=result,
        )
        return result

    def archive_scheme(
        self,
        *,
        scheme_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        reason: str,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        self._require_manage(user, auth_store)
        self._require_idempotency_key(
            (payload or {}).get("idempotencyKey"),
            command_type="archive",
        )
        command_payload = self._business_payload({**(payload or {}), "reason": reason})
        payload_hash = self._payload_hash("archive", command_payload)
        replay = self._command_replay(
            scheme_scope_id=scheme_id,
            command_type="archive",
            actor_user_id=user.user_id,
            idempotency_key=(payload or {}).get("idempotencyKey"),
            payload_hash=payload_hash,
        )
        if replay:
            return self._replay_result(replay)
        scheme = self._get_scheme(scheme_id)
        self._ensure_transition(scheme.status, "archive_scheme")
        self._ensure_optimistic_version(
            scheme,
            (payload or {}).get("optimisticVersion"),
            command_type="archive",
        )
        from_status = scheme.status
        scheme.status = "ARCHIVED"
        scheme.archived_reason = reason
        scheme.optimistic_version += 1
        self._append_scheme_audit(
            scheme,
            action="archive",
            user=user,
            auth_store=auth_store,
            payload_hash=payload_hash,
            idempotency_key=(payload or {}).get("idempotencyKey"),
            request_id=(payload or {}).get("requestId"),
            from_status=from_status,
            to_status=scheme.status,
            details={"reason": reason},
        )
        result = self.scheme_detail(scheme)
        self._remember_command(
            scheme_scope_id=scheme_id,
            command_type="archive",
            actor_user_id=user.user_id,
            idempotency_key=(payload or {}).get("idempotencyKey"),
            payload_hash=payload_hash,
            result_ref=scheme_id,
            result_snapshot=result,
        )
        return result

    def get_scheme_detail(
        self,
        *,
        scheme_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        self._require_read(user, auth_store)
        return self.scheme_detail(self._get_scheme(scheme_id), auth_store=auth_store)

    def validate_scheme_payload(
        self,
        *,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        payload: dict[str, Any],
        scheme_id: str | None = None,
    ) -> dict[str, Any]:
        self._require_manage(user, auth_store)
        business_payload = self._business_payload(payload)
        if scheme_id:
            scheme = self._get_scheme(scheme_id)
            if scheme.status != "DRAFT":
                raise AppError(
                    code="INVALID_STATE",
                    message="Only DRAFT schemes can be validated for editing",
                    status_code=409,
                    details={"schemeId": scheme_id, "status": scheme.status},
                )
            self._ensure_optimistic_version(
                scheme,
                payload.get("optimisticVersion"),
                command_type="validate_draft",
            )
            merged = self._detail_payload(scheme)
            merged.update(business_payload)
            business_payload = merged
        business_payload = self._materialize_workflow_binding_payload(
            business_payload,
            user=user,
            auth_store=auth_store,
        )
        readiness = self._publish_readiness_for_payload(business_payload, auth_store)
        return {
            "valid": readiness["mandatoryReady"],
            "findings": self._publish_readiness_findings(readiness),
            "schemeId": scheme_id,
            "readiness": readiness,
            "baseScoring": readiness["baseScoring"],
            "targetScope": readiness["targetScope"],
            "workflowRoute": readiness["workflowRoute"],
            "schedulingDispatch": readiness["schedulingDispatch"],
            "simulation": readiness["simulation"],
        }

    def scheme_summary(
        self,
        scheme: AssessmentSchemeRecord,
        auth_store: SeedAuthStore | None = None,
    ) -> dict[str, Any]:
        target_scope_summary = self._target_scope_summary(scheme.target_groups)
        readiness = self._scheme_readiness(scheme, auth_store)
        updated_at = self._scheme_updated_at(scheme)
        return {
            "schemeId": scheme.scheme_id,
            "schemeCode": scheme.scheme_code,
            "schemeName": scheme.scheme_name,
            "year": scheme.year,
            "frequency": scheme.frequency,
            "status": scheme.status,
            "businessLineSummary": self._business_line_summary(scheme),
            "totalWeight": scheme.total_weight,
            "itemCount": len(scheme.items),
            "targetGroupCount": len(scheme.target_groups),
            "targetCount": target_scope_summary["targetCount"],
            "targetScopeLabel": target_scope_summary["targetScopeLabel"],
            "targetRuleLabel": target_scope_summary["targetRuleLabel"],
            "scopeSnapshot": target_scope_summary["scopeSnapshot"],
            "targetResolutionFindings": target_scope_summary["resolutionFindings"],
            "targetGroups": [
                self._target_group_view(item, include_snapshot=False)
                for item in scheme.target_groups
            ],
            "publishedAtRef": scheme.published_at_ref,
            "updatedAt": updated_at,
            "optimisticVersion": scheme.optimistic_version,
            "sourceTrace": scheme.source_trace or None,
            "sourceTraceSummary": self._source_trace_summary(scheme),
            "workflowBinding": deepcopy(scheme.workflow_binding) or None,
            "workflowSummary": self._workflow_summary(scheme.workflow_binding),
            "scheduleBinding": deepcopy(scheme.schedule_binding) or None,
            "scheduleSummary": self._schedule_summary(scheme.schedule_binding),
            "nextRunAt": (scheme.schedule_binding or {}).get("nextRunAt"),
            "lastRunAt": (scheme.schedule_binding or {}).get("lastRunAt"),
            "readinessSummary": self._readiness_summary(readiness),
            "publishSummary": self._publish_summary(scheme, readiness),
            "commandAuditSummary": self._command_audit_summary(scheme),
            "commandAvailability": self._command_availability(scheme),
        }

    def scheme_detail(
        self,
        scheme: AssessmentSchemeRecord,
        auth_store: SeedAuthStore | None = None,
    ) -> dict[str, Any]:
        return {
            **self.scheme_summary(scheme, auth_store=auth_store),
            "description": scheme.description,
            "createdByRef": scheme.created_by_ref,
            "createdAt": scheme.created_at,
            "publishedByRef": scheme.published_by_ref,
            "archivedReason": scheme.archived_reason,
            "hasBeenPublished": scheme.has_been_published,
            "schemeSnapshot": scheme.scheme_snapshot,
            "sourceSchemeId": scheme.source_scheme_id,
            "sourceSchemeCode": scheme.source_scheme_code,
            "commandAudit": scheme.command_audit,
            "items": [self._item_view(item) for item in scheme.items],
            "gradeThresholds": [
                self._threshold_view(item) for item in scheme.grade_thresholds
            ],
            "volumeAdjustmentFactors": [
                self._factor_view(item) for item in scheme.volume_adjustment_factors
            ],
            "targetGroups": [self._target_group_view(item) for item in scheme.target_groups],
            "readiness": self._scheme_readiness(scheme, auth_store),
        }

    def active_scheme_snapshot(self, scheme_id: str) -> dict[str, Any]:
        scheme = self._get_scheme(scheme_id)
        if scheme.status != "ACTIVE":
            raise AppError(
                code="VALIDATION_ERROR",
                message="Cycle can be created only from ACTIVE scheme",
                status_code=422,
                details={"schemeId": scheme_id, "status": scheme.status},
            )
        if not scheme.scheme_snapshot:
            scheme.scheme_snapshot = self._scheme_snapshot(scheme)
        return self.scheme_detail(scheme)

    def _scheme_from_payload(
        self,
        *,
        scheme_id: str,
        scheme_code: str,
        payload: dict[str, Any],
        user_id: str,
    ) -> AssessmentSchemeRecord:
        items = [
            SchemeItemRecord(
                scheme_item_id=f"{scheme_id}-ITEM-{index:03d}",
                indicator_id=item["indicatorId"],
                version_id=item["versionId"],
                weight=float(item["weight"]),
                score_cap=item.get("scoreCap"),
                sort_order=index,
                indicator_snapshot=indicator_store.published_version_snapshot(
                    item["indicatorId"],
                    item["versionId"],
                ),
            )
            for index, item in enumerate(payload.get("items") or [], start=1)
        ]
        thresholds = [
            GradeThresholdRecord(
                threshold_id=f"{scheme_id}-GRADE-{index:03d}",
                grade_code=item["gradeCode"],
                grade_label=item["gradeLabel"],
                min_score=float(item["minScore"]),
                max_score=item.get("maxScore"),
                sort_order=index,
            )
            for index, item in enumerate(payload.get("gradeThresholds") or [], start=1)
        ]
        factors = [
            VolumeAdjustmentFactorRecord(
                factor_id=f"{scheme_id}-FACTOR-{index:03d}",
                factor_code=item.get("factorCode") or f"FACTOR-{index:03d}",
                factor_name=item.get("factorName") or item.get("metric") or f"调整因子 {index}",
                metric=item.get("metric"),
                operator=item.get("operator"),
                value=None if item.get("value") is None else float(item["value"]),
                description=item.get("description", ""),
                multiplier=float(item.get("multiplier", 1)),
                enabled=item.get("enabled", True),
                sort_order=index,
            )
            for index, item in enumerate(
                payload.get("volumeAdjustmentFactors") or [],
                start=1,
            )
        ]
        groups = [
            TargetGroupRecord(
                target_group_id=f"{scheme_id}-TG-{index:03d}",
                group_name=item["groupName"],
                scope_mode=item["scopeMode"],
                description=item.get("description", ""),
                sort_order=index,
                members=[
                    TargetGroupMemberRecord(
                        member_id=f"{scheme_id}-TG-{index:03d}-MEM-{member_index:03d}",
                        org_id=member["orgId"],
                        org_snapshot={},
                        sort_order=member_index,
                    )
                    for member_index, member in enumerate(item.get("members") or [], start=1)
                ],
            )
            for index, item in enumerate(payload.get("targetGroups") or [], start=1)
        ]
        return AssessmentSchemeRecord(
            scheme_id=scheme_id,
            scheme_code=scheme_code,
            scheme_name=payload["schemeName"],
            year=payload["year"],
            frequency=payload["frequency"],
            status="DRAFT",
            description=payload.get("description", ""),
            total_weight=float(payload.get("totalWeight", 100)),
            created_by_ref=user_id,
            created_at=relative_datetime_iso(),
            items=items,
            grade_thresholds=thresholds,
            volume_adjustment_factors=factors,
            target_groups=groups,
            workflow_binding=deepcopy(payload.get("workflowBinding") or {}),
            schedule_binding=deepcopy(payload.get("scheduleBinding") or {}),
        )

    @staticmethod
    def _business_payload(payload: dict[str, Any]) -> dict[str, Any]:
        return {
            key: value
            for key, value in payload.items()
            if key not in {"idempotencyKey", "requestId", "optimisticVersion"}
        }

    @staticmethod
    def _payload_hash(command_type: str, payload: dict[str, Any]) -> str:
        canonical = json.dumps(
            {"commandType": command_type, "payload": payload},
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            default=str,
        )
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    @staticmethod
    def _snapshot_hash(snapshot: dict[str, Any]) -> str:
        canonical = json.dumps(
            snapshot,
            ensure_ascii=True,
            sort_keys=True,
            separators=(",", ":"),
            default=str,
        )
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    def _command_replay(
        self,
        *,
        scheme_scope_id: str,
        command_type: str,
        actor_user_id: str,
        idempotency_key: Any,
        payload_hash: str,
    ) -> SchemeCommandRecord | None:
        if not idempotency_key:
            return None
        key = (scheme_scope_id, command_type, actor_user_id, str(idempotency_key))
        record = self.command_keys.get(key)
        if not record:
            return None
        if record.payload_hash != payload_hash:
            raise AppError(
                code="IDEMPOTENCY_KEY_CONFLICT",
                message="idempotencyKey was already used with a different scheme command payload",
                status_code=409,
                details={
                    "schemeScopeId": scheme_scope_id,
                    "commandType": command_type,
                    "idempotencyKey": str(idempotency_key),
                    "existingPayloadHash": record.payload_hash,
                    "incomingPayloadHash": payload_hash,
                },
            )
        return record

    def _remember_command(
        self,
        *,
        scheme_scope_id: str,
        command_type: str,
        actor_user_id: str,
        idempotency_key: Any,
        payload_hash: str,
        result_ref: str,
        result_snapshot: dict[str, Any],
    ) -> None:
        if not idempotency_key:
            return
        key = (scheme_scope_id, command_type, actor_user_id, str(idempotency_key))
        self.command_keys[key] = SchemeCommandRecord(
            command_key_id=f"ASCK-{len(self.command_keys) + 1:05d}",
            scheme_scope_id=scheme_scope_id,
            command_type=command_type,
            actor_user_id=actor_user_id,
            idempotency_key=str(idempotency_key),
            payload_hash=payload_hash,
            result_ref=result_ref,
            result_snapshot=deepcopy(result_snapshot),
            created_at=relative_datetime_iso(),
        )

    @staticmethod
    def _replay_result(record: SchemeCommandRecord) -> dict[str, Any]:
        result = deepcopy(record.result_snapshot)
        result["idempotentReplay"] = True
        return result

    @staticmethod
    def _require_idempotency_key(idempotency_key: Any, *, command_type: str) -> None:
        if idempotency_key is None or not str(idempotency_key).strip():
            raise AppError(
                code="COMMAND_METADATA_REQUIRED",
                message="idempotencyKey is required for scheme command",
                status_code=422,
                details={"commandType": command_type, "field": "idempotencyKey"},
            )

    @staticmethod
    def _ensure_optimistic_version(
        scheme: AssessmentSchemeRecord,
        optimistic_version: Any,
        *,
        command_type: str,
    ) -> None:
        if optimistic_version is None:
            raise AppError(
                code="COMMAND_METADATA_REQUIRED",
                message="optimisticVersion is required for scheme command",
                status_code=422,
                details={
                    "schemeId": scheme.scheme_id,
                    "commandType": command_type,
                    "field": "optimisticVersion",
                },
            )
        try:
            incoming_version = int(optimistic_version)
        except (TypeError, ValueError) as exc:
            raise AppError(
                code="COMMAND_METADATA_INVALID",
                message="optimisticVersion must be an integer",
                status_code=422,
                details={
                    "schemeId": scheme.scheme_id,
                    "commandType": command_type,
                    "field": "optimisticVersion",
                    "incomingOptimisticVersion": optimistic_version,
                },
            ) from exc
        if incoming_version != scheme.optimistic_version:
            raise AppError(
                code="VERSION_CONFLICT",
                message="optimisticVersion does not match current scheme version",
                status_code=409,
                details={
                    "schemeId": scheme.scheme_id,
                    "commandType": command_type,
                    "expectedOptimisticVersion": scheme.optimistic_version,
                    "incomingOptimisticVersion": incoming_version,
                },
            )

    def _append_scheme_audit(
        self,
        scheme: AssessmentSchemeRecord,
        *,
        action: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        payload_hash: str,
        idempotency_key: Any,
        request_id: Any,
        from_status: str | None,
        to_status: str | None,
        details: dict[str, Any] | None = None,
    ) -> None:
        scheme.command_audit.append(
            {
                "eventId": f"ASCA-{len(scheme.command_audit) + 1:05d}",
                "schemeId": scheme.scheme_id,
                "action": action,
                "actorUserId": user.user_id,
                "actorOrgId": user.org_id,
                "actorSnapshot": auth_store.user_snapshot(user.user_id),
                "occurredAt": relative_datetime_iso(),
                "requestId": request_id,
                "idempotencyKey": idempotency_key,
                "payloadHash": payload_hash,
                "fromStatus": from_status,
                "toStatus": to_status,
                "optimisticVersion": scheme.optimistic_version,
                "details": details or {},
            },
        )

    def _command_availability(self, scheme: AssessmentSchemeRecord) -> dict[str, dict[str, Any]]:
        is_draft = scheme.status == "DRAFT"
        is_active = scheme.status == "ACTIVE"
        is_archived = scheme.status == "ARCHIVED"
        return {
            "view": {"enabled": True, "reason": None},
            "edit": {
                "enabled": is_draft,
                "reason": None if is_draft else "ACTIVE_OR_ARCHIVED_DIRECT_EDIT_FORBIDDEN",
            },
            "validate": {
                "enabled": is_draft,
                "reason": None if is_draft else "ONLY_DRAFT_CAN_VALIDATE_FOR_EDIT",
            },
            "publish": {
                "enabled": is_draft,
                "reason": None if is_draft else "ONLY_DRAFT_CAN_PUBLISH",
            },
            "copy": {
                "enabled": not is_archived,
                "reason": None if not is_archived else "ARCHIVED_COPY_DEFERRED",
            },
            "delete": {
                "enabled": is_draft and not scheme.has_been_published,
                "reason": None
                if is_draft and not scheme.has_been_published
                else "ONLY_NEVER_PUBLISHED_DRAFT_CAN_DELETE",
            },
            "archive": {
                "enabled": is_draft,
                "reason": None
                if is_draft
                else "ACTIVE_ARCHIVE_DEFERRED" if is_active else "ARCHIVED_ALREADY_FINAL",
            },
        }

    def _next_scheme_id(self) -> str:
        index = len(self.schemes) + 1
        while f"ASCH-{index:04d}" in self.schemes:
            index += 1
        return f"ASCH-{index:04d}"

    def _next_scheme_code(self) -> str:
        index = len(self.schemes) + 1
        existing = {item.scheme_code for item in self.schemes.values()}
        while f"WLZQ-ASCH-{index:04d}" in existing:
            index += 1
        return f"WLZQ-ASCH-{index:04d}"

    def _next_copy_code(self, source: AssessmentSchemeRecord) -> str:
        index = len(self.schemes) + 1
        existing = {item.scheme_code for item in self.schemes.values()}
        while f"{source.scheme_code}-COPY-{index:02d}" in existing:
            index += 1
        return f"{source.scheme_code}-COPY-{index:02d}"

    def _validate_payload(self, payload: dict[str, Any], auth_store: SeedAuthStore) -> None:
        errors = self._payload_validation_findings(payload, auth_store)
        if errors:
            raise AppError(
                code="VALIDATION_ERROR",
                message="方案校验未通过",
                status_code=422,
                details=errors,
            )

    def _payload_validation_findings(
        self,
        payload: dict[str, Any],
        auth_store: SeedAuthStore,
    ) -> list[dict[str, Any]]:
        errors = self._base_scoring_errors(payload)
        groups = payload.get("targetGroups") or []
        if not groups:
            errors.append(
                {
                    "code": "target_groups_required",
                    "field": "targetGroups",
                    "message": "Target groups required",
                },
            )
        errors.extend(self._target_group_errors(groups, auth_store))
        return _dedupe_errors(errors)

    def _base_scoring_errors(self, payload: dict[str, Any]) -> list[dict[str, Any]]:
        errors: list[dict[str, Any]] = []
        try:
            validate_codes(
                (payload.get("frequency"), "assessment_frequency", "frequency"),
            )
        except AppError as exc:
            errors.extend(self._error_details_as_findings(exc))
        items = payload.get("items") or []
        thresholds = payload.get("gradeThresholds") or []
        factors = payload.get("volumeAdjustmentFactors") or []
        if not items:
            errors.append(
                {
                    "code": "scheme_items_required",
                    "field": "items",
                    "message": "Scheme items required",
                },
            )
        if not thresholds:
            errors.append(
                {
                    "code": "grade_thresholds_required",
                    "field": "gradeThresholds",
                    "message": "Grade thresholds required",
                },
            )
        total_weight = float(payload.get("totalWeight", 100))
        item_weight = sum(float(item.get("weight", 0)) for item in items)
        if abs(item_weight - total_weight) > 0.0001:
            errors.append(
                {
                    "code": "weight_total_mismatch",
                    "field": "items",
                    "message": "Scheme item weights must equal totalWeight",
                },
            )
        seen_items: set[tuple[str, str]] = set()
        for item in items:
            key = (str(item.get("indicatorId")), str(item.get("versionId")))
            if key in seen_items:
                errors.append(
                    {
                        "code": "duplicate_scheme_item",
                        "field": "items",
                        "message": "Scheme item indicator/version pairs must be unique",
                    },
                )
            seen_items.add(key)
        errors.extend(self._threshold_errors(thresholds))
        errors.extend(self._factor_errors(factors))
        return _dedupe_errors(errors)

    @staticmethod
    def _error_details_as_findings(exc: AppError) -> list[dict[str, Any]]:
        if isinstance(exc.details, list):
            return deepcopy(exc.details)
        if isinstance(exc.details, dict):
            return [
                {
                    "code": exc.code,
                    "field": exc.details.get("field"),
                    "message": exc.message,
                    **deepcopy(exc.details),
                },
            ]
        return [{"code": exc.code, "field": None, "message": exc.message}]

    def _base_scoring_readiness(self, payload: dict[str, Any]) -> dict[str, Any]:
        findings = self._base_scoring_errors(payload)
        items = payload.get("items") or []
        thresholds = payload.get("gradeThresholds") or []
        item_weight = sum(float(item.get("weight", 0)) for item in items)
        total_weight = float(payload.get("totalWeight", 100))
        ready = not findings
        return {
            "ready": ready,
            "mandatory": True,
            "status": "READY" if ready else "BLOCKED",
            "itemCount": len(items),
            "thresholdCount": len(thresholds),
            "itemWeight": round(item_weight, 4),
            "totalWeight": total_weight,
            "weightReady": abs(item_weight - total_weight) <= 0.0001 and bool(items),
            "thresholdReady": bool(thresholds)
            and not [
                finding
                for finding in findings
                if str(finding.get("field") or "").startswith("gradeThresholds")
            ],
            "label": "基础与计分规则",
            "findings": findings,
        }

    def _publish_readiness_for_payload(
        self,
        payload: dict[str, Any],
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        target_scope_readiness = self._target_scope_readiness(
            payload.get("targetGroups") or [],
            auth_store,
        )
        schedule_binding, schedule_findings = self._normalize_schedule_binding(
            payload.get("scheduleBinding"),
        )
        sections = {
            "baseScoring": self._base_scoring_readiness(payload),
            "targetScope": target_scope_readiness,
            "workflowRoute": self._workflow_route_readiness(
                payload.get("workflowBinding") or {},
            ),
            "schedulingDispatch": self._schedule_dispatch_readiness(
                schedule_binding,
                extra_findings=schedule_findings if not schedule_binding else None,
            ),
            "simulation": self._simulation_readiness(),
        }
        sections["mandatoryReady"] = all(
            sections[key]["ready"]
            for key in ("baseScoring", "targetScope", "workflowRoute", "schedulingDispatch")
        )
        sections["mandatorySections"] = [
            "baseScoring",
            "targetScope",
            "workflowRoute",
            "schedulingDispatch",
        ]
        sections["optionalSections"] = ["simulation"]
        return sections

    def _scheme_readiness(
        self,
        scheme: AssessmentSchemeRecord,
        auth_store: SeedAuthStore | None,
    ) -> dict[str, Any]:
        payload = self._detail_payload(scheme)
        if auth_store is not None:
            return self._publish_readiness_for_payload(payload, auth_store)
        target_scope = self._target_scope_summary(scheme.target_groups)
        sections = {
            "baseScoring": self._base_scoring_readiness(payload),
            "targetScope": {
                "ready": target_scope["targetCount"] > 0,
                "mandatory": True,
                "status": "READY" if target_scope["targetCount"] > 0 else "BLOCKED",
                "targetCount": target_scope["targetCount"],
                "label": target_scope["targetScopeLabel"],
                "scopeSnapshot": target_scope["scopeSnapshot"],
                "findings": target_scope["resolutionFindings"],
            },
            "workflowRoute": self._workflow_route_readiness(scheme.workflow_binding),
            "schedulingDispatch": self._schedule_dispatch_readiness(scheme.schedule_binding),
            "simulation": self._simulation_readiness(),
        }
        sections["mandatoryReady"] = all(
            sections[key]["ready"]
            for key in ("baseScoring", "targetScope", "workflowRoute", "schedulingDispatch")
        )
        sections["mandatorySections"] = [
            "baseScoring",
            "targetScope",
            "workflowRoute",
            "schedulingDispatch",
        ]
        sections["optionalSections"] = ["simulation"]
        return sections

    @staticmethod
    def _simulation_readiness() -> dict[str, Any]:
        return {
            "ready": None,
            "mandatory": False,
            "status": "OPTIONAL_NOT_RUN",
            "label": "仿真运行可选",
            "simulationOnlyRequired": True,
            "blocksPublish": False,
            "findings": [
                {
                    "code": "simulation_optional",
                    "field": "simulation",
                    "message": (
                        "Simulation can be skipped and does not block publish when mandatory "
                        "readiness passes"
                    ),
                },
            ],
        }

    @staticmethod
    def _publish_readiness_findings(readiness: dict[str, Any]) -> list[dict[str, Any]]:
        findings: list[dict[str, Any]] = []
        for section in ("baseScoring", "targetScope", "workflowRoute", "schedulingDispatch"):
            section_readiness = readiness.get(section) or {}
            for finding in section_readiness.get("findings") or []:
                findings.append({"section": section, **deepcopy(finding)})
        return findings

    @staticmethod
    def _threshold_errors(thresholds: list[dict[str, Any]]) -> list[dict[str, Any]]:
        normalized = sorted(
            (
                {
                    "min": float(item["minScore"]),
                    "max": None if item.get("maxScore") is None else float(item["maxScore"]),
                }
                for item in thresholds
            ),
            key=lambda item: item["min"],
        )
        errors: list[dict[str, Any]] = []
        previous_max: float | None = None
        seen_upper_unbounded = False
        if normalized and normalized[0]["min"] != 0:
            errors.append(
                {
                    "code": "grade_threshold_gap",
                    "field": "gradeThresholds",
                    "message": "Grade thresholds must start at 0",
                },
            )
        for threshold in normalized:
            min_score = threshold["min"]
            max_score = threshold["max"]
            if seen_upper_unbounded:
                errors.append(
                    {
                        "code": "grade_threshold_overlap",
                        "field": "gradeThresholds",
                        "message": "Upper-unbounded grade must be final",
                    },
                )
            if max_score is not None and min_score >= max_score:
                errors.append(
                    {
                        "code": "grade_threshold_overlap",
                        "field": "gradeThresholds",
                        "message": "Grade min must be < max",
                    },
                )
            if previous_max is not None and min_score < previous_max:
                errors.append(
                    {
                        "code": "grade_threshold_overlap",
                        "field": "gradeThresholds",
                        "message": "Grade thresholds overlap",
                    },
                )
            if previous_max is not None and min_score > previous_max:
                errors.append(
                    {
                        "code": "grade_threshold_gap",
                        "field": "gradeThresholds",
                        "message": "Grade thresholds have a gap",
                    },
                )
            if max_score is None:
                seen_upper_unbounded = True
            previous_max = max_score
        if normalized and not seen_upper_unbounded:
            errors.append(
                {
                    "code": "grade_threshold_gap",
                    "field": "gradeThresholds",
                    "message": "Grade thresholds must include a terminal upper-unbounded band",
                },
            )
        return _dedupe_errors(errors)

    @staticmethod
    def _factor_errors(factors: list[dict[str, Any]]) -> list[dict[str, Any]]:
        errors: list[dict[str, Any]] = []
        allowed_operators = {">", ">=", "<", "<=", "=", "=="}
        for index, factor in enumerate(factors):
            field_prefix = f"volumeAdjustmentFactors.{index}"
            multiplier = float(factor.get("multiplier", 1))
            if multiplier <= 0 or multiplier > 10:
                errors.append(
                    {
                        "code": "volume_factor_multiplier_invalid",
                        "field": f"{field_prefix}.multiplier",
                        "message": "Volume adjustment multiplier must be > 0 and <= 10",
                    },
                )
            uses_structured_rule = (
                factor.get("metric") is not None
                or factor.get("operator") is not None
                or factor.get("value") is not None
            )
            if not factor.get("enabled", True) and not uses_structured_rule:
                continue
            if not uses_structured_rule:
                continue
            if not str(factor.get("metric") or "").strip():
                errors.append(
                    {
                        "code": "volume_factor_metric_required",
                        "field": f"{field_prefix}.metric",
                        "message": "Volume adjustment metric is required",
                    },
                )
            operator = str(factor.get("operator") or "")
            if operator not in allowed_operators:
                errors.append(
                    {
                        "code": "volume_factor_operator_invalid",
                        "field": f"{field_prefix}.operator",
                        "message": "Volume adjustment operator is invalid",
                    },
                )
            if factor.get("value") is None:
                errors.append(
                    {
                        "code": "volume_factor_value_required",
                        "field": f"{field_prefix}.value",
                        "message": "Volume adjustment value is required",
                    },
                )
        return _dedupe_errors(errors)

    def _target_group_errors(
        self,
        groups: list[dict[str, Any]],
        auth_store: SeedAuthStore,
    ) -> list[dict[str, Any]]:
        errors: list[dict[str, Any]] = []
        for group in groups:
            validate_codes(
                (
                    group.get("scopeMode"),
                    "assessment_target_scope_mode",
                    "targetGroups.scopeMode",
                ),
            )
            scope_mode = group.get("scopeMode")
            if scope_mode not in {"MANUAL_SELECTION", "ALL_BRANCHES"}:
                errors.append(
                    {
                        "code": "target_scope_mode_deferred",
                        "field": "targetGroups.scopeMode",
                        "message": (
                            "Only MANUAL_SELECTION and ALL_BRANCHES target groups are active "
                            "in SIT-ASCH-03; BUSINESS_LINE_FILTER, ORG_LEVEL_FILTER and "
                            "person-level targets are deferred"
                        ),
                    },
                )
            members = group.get("members") or []
            if scope_mode == "ALL_BRANCHES":
                resolved = self._resolve_target_group(group, auth_store)
                if not resolved["targetIds"]:
                    errors.append(
                        {
                            "code": "target_scope_resolved_empty",
                            "field": "targetGroups.scopeMode",
                            "message": "ALL_BRANCHES did not resolve any active branch offices",
                        },
                    )
                continue
            if not members:
                errors.append(
                    {
                        "code": "target_group_members_required",
                        "field": "targetGroups.members",
                        "message": "Members required",
                    },
                )
            for member in members:
                org_id = member.get("orgId")
                if org_id not in auth_store.orgs:
                    errors.append(
                        {
                            "code": "target_group_org_not_found",
                            "field": "targetGroups.members.orgId",
                            "message": f"Unknown org {org_id}",
                        },
                    )
        return _dedupe_errors(errors)

    def _materialize_target_groups_payload(
        self,
        payload: dict[str, Any],
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        materialized = deepcopy(payload)
        next_groups: list[dict[str, Any]] = []
        for group in materialized.get("targetGroups") or []:
            if group.get("scopeMode") == "ALL_BRANCHES":
                resolved = self._resolve_target_group(group, auth_store)
                group["members"] = [{"orgId": org_id} for org_id in resolved["targetIds"]]
            next_groups.append(group)
        materialized["targetGroups"] = next_groups
        return materialized

    def _target_scope_readiness(
        self,
        groups: list[dict[str, Any]],
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        findings = self._target_group_errors(groups, auth_store)
        snapshots: list[dict[str, Any]] = []
        target_ids: list[str] = []
        resolution_findings: list[dict[str, Any]] = []
        for group in groups:
            resolved = self._resolve_target_group(group, auth_store)
            target_ids.extend(resolved["targetIds"])
            resolution_findings.extend(resolved["findings"])
            snapshots.append(
                {
                    "scopeMode": group.get("scopeMode"),
                    "label": resolved["label"],
                    "targetCount": len(resolved["targetIds"]),
                    "targetIds": resolved["targetIds"],
                    "deferred": resolved["deferred"],
                    "disabledReason": resolved["disabledReason"],
                },
            )
        unique_target_ids = sorted(set(target_ids))
        all_findings = findings + resolution_findings
        return {
            "ready": not all_findings and bool(unique_target_ids),
            "targetCount": len(unique_target_ids),
            "label": self._target_scope_label_from_snapshot(snapshots),
            "scopeSnapshot": snapshots,
            "findings": all_findings,
            "supportedModes": ["MANUAL_SELECTION", "ALL_BRANCHES"],
            "deferredModes": [
                {
                    "scopeMode": "BUSINESS_LINE_FILTER",
                    "reason": (
                        "Current scheme target model has no accepted business-line "
                        "resolver contract."
                    ),
                },
                {
                    "scopeMode": "ORG_LEVEL_FILTER",
                    "reason": "Current scheme target model has no persisted org-level filter rule.",
                },
                {
                    "scopeMode": "PERSON_LEVEL",
                    "reason": (
                        "Person-level assessment targets require a separate contract "
                        "decision."
                    ),
                },
            ],
        }

    def _materialize_workflow_binding_payload(
        self,
        payload: dict[str, Any],
        *,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        materialized = deepcopy(payload)
        binding = materialized.get("workflowBinding")
        if not binding:
            materialized["workflowBinding"] = {}
            return materialized
        route_template_id = binding.get("routeTemplateId") or binding.get("templateId")
        if not route_template_id:
            raise AppError(
                code="VALIDATION_ERROR",
                message="workflowBinding.routeTemplateId is required",
                status_code=422,
                details=[
                    {
                        "code": "workflow_route_template_required",
                        "field": "workflowBinding.routeTemplateId",
                        "message": "Workflow route template is required",
                    },
                ],
            )
        route_template_version_id = (
            binding.get("routeTemplateVersionId")
            or binding.get("templateVersionId")
            or binding.get("currentVersionId")
        )
        template_version_id = (
            str(route_template_version_id)
            if route_template_version_id
            else None
        )
        template_record, version_record = workflow_template_store.published_version_binding(
            template_id=str(route_template_id),
            template_version_id=template_version_id,
            user=user,
            auth=auth_store,
        )
        template = WorkflowTemplateAggregate.model_validate(version_record.snapshot_json)
        route_override = self._normalize_workflow_route_override(binding.get("routeOverride"))
        effective_template = (
            self._apply_workflow_route_override(template, route_override)
            if route_override
            else template
        )
        validation_findings = RouteChainEvaluator(
            auth=auth_store,
            active_templates=[],
        ).validate_template(effective_template)
        validation_summary = workflow_template_store.validation_summary(validation_findings)
        route_summary = self._workflow_route_summary(effective_template, auth_store)
        effective_snapshot = effective_template.model_dump(by_alias=True)
        materialized["workflowBinding"] = {
            "bindingMode": (
                "TEMPLATE_VERSION_WITH_SCHEME_OVERRIDE"
                if route_override
                else "TEMPLATE_VERSION_SNAPSHOT"
            ),
            "routeTemplateId": template_record.template_id,
            "routeTemplateVersionId": version_record.template_version_id,
            "templateName": template_record.name,
            "templateStatus": template_record.status,
            "snapshotHash": version_record.snapshot_hash,
            "effectiveSnapshotHash": snapshot_hash(effective_template),
            "schemaVersion": template.schema_version,
            "boundAt": relative_datetime_iso(),
            "boundByRef": user.user_id,
            "overrideEnabled": bool(route_override),
            "routeOverride": route_override,
            "validationSummary": validation_summary,
            "routeSummary": route_summary,
            "routeSnapshot": deepcopy(version_record.snapshot_json),
            "effectiveRouteSnapshot": effective_snapshot,
            "targetScopeSnapshot": deepcopy(version_record.target_scope_snapshot),
            "resolutionFindings": route_summary["findings"],
        }
        return materialized

    @staticmethod
    def _normalize_workflow_route_override(
        override: dict[str, Any] | None,
    ) -> dict[str, Any] | None:
        if not override:
            return None
        if override.get("enabled") is False:
            return None
        disabled_node_ids = [
            str(node_id)
            for node_id in override.get("disabledNodeIds") or []
            if str(node_id).strip()
        ]
        chain_node_orders = []
        for item in override.get("chainNodeOrders") or []:
            chain_id = str(item.get("chainId") or "").strip()
            node_ids = [
                str(node_id)
                for node_id in item.get("nodeIds") or []
                if str(node_id).strip()
            ]
            if chain_id and node_ids:
                chain_node_orders.append({"chainId": chain_id, "nodeIds": node_ids})
        final_nodes = []
        for item in override.get("finalNodes") or []:
            node_id = str(item.get("nodeId") or "").strip()
            if not node_id:
                continue
            final_nodes.append(
                {
                    "chainId": str(item.get("chainId") or "").strip() or None,
                    "nodeId": node_id,
                    "note": str(item.get("note") or "").strip() or None,
                },
            )
        normalized = {
            "enabled": True,
            "disabledNodeIds": sorted(set(disabled_node_ids)),
            "chainNodeOrders": chain_node_orders,
            "finalNodes": final_nodes,
            "note": str(override.get("note") or "").strip() or None,
        }
        if (
            not normalized["disabledNodeIds"]
            and not normalized["chainNodeOrders"]
            and not normalized["finalNodes"]
            and not normalized["note"]
        ):
            return None
        return normalized

    def _apply_workflow_route_override(
        self,
        template: WorkflowTemplateAggregate,
        override: dict[str, Any],
    ) -> WorkflowTemplateAggregate:
        payload = template.model_dump(by_alias=True)
        disabled_node_ids = set(override.get("disabledNodeIds") or [])
        orders_by_chain = {
            str(item.get("chainId")): list(item.get("nodeIds") or [])
            for item in override.get("chainNodeOrders") or []
        }
        final_nodes_by_chain: dict[str, str] = {}
        for item in override.get("finalNodes") or []:
            chain_id = str(item.get("chainId") or "") or "*"
            final_nodes_by_chain[chain_id] = str(item.get("nodeId"))
        for chain in payload.get("chains") or []:
            chain_id = str(chain.get("chainId"))
            original_nodes = list(chain.get("nodes") or [])
            nodes = [
                node
                for node in original_nodes
                if str(node.get("nodeId")) not in disabled_node_ids
            ]
            requested_order = orders_by_chain.get(chain_id) or []
            if requested_order:
                order_index = {node_id: index for index, node_id in enumerate(requested_order)}
                nodes.sort(
                    key=lambda node: (
                        order_index.get(str(node.get("nodeId")), len(order_index)),
                        int(node.get("sortOrder") or 0),
                    ),
                )
                for index, node in enumerate(nodes, start=1):
                    node["sortOrder"] = index * 10
            selected_final_node_id = final_nodes_by_chain.get(chain_id) or final_nodes_by_chain.get("*")
            if selected_final_node_id:
                for node in nodes:
                    node["isFinal"] = str(node.get("nodeId")) == selected_final_node_id
            chain["nodes"] = nodes
            if len(nodes) != len(original_nodes):
                chain["edges"] = self._workflow_edges_for_nodes(chain_id, nodes)
        return WorkflowTemplateAggregate.model_validate(payload)

    @staticmethod
    def _workflow_edges_for_nodes(
        chain_id: str,
        nodes: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        nodes_by_level: dict[str, list[dict[str, Any]]] = {
            level: sorted(
                [node for node in nodes if node.get("level") == level],
                key=lambda item: int(item.get("sortOrder") or 0),
            )
            for level in WORKFLOW_LEVELS
        }
        edges: list[dict[str, Any]] = []
        for level_index, level in enumerate(WORKFLOW_LEVELS[:-1]):
            current_nodes = nodes_by_level.get(level) or []
            next_nodes = nodes_by_level.get(WORKFLOW_LEVELS[level_index + 1]) or []
            if not current_nodes or not next_nodes:
                continue
            for source in current_nodes:
                for target in next_nodes:
                    edges.append(
                        {
                            "edgeId": (
                                f"{chain_id}-{source.get('nodeId')}-{target.get('nodeId')}"
                            )[:120],
                            "fromNodeId": source.get("nodeId"),
                            "toNodeId": target.get("nodeId"),
                            "condition": {"conditionType": "ALWAYS"},
                        },
                    )
        return edges

    def _workflow_route_readiness(self, binding: dict[str, Any] | None) -> dict[str, Any]:
        if not binding:
            return {
                "ready": False,
                "mandatory": True,
                "status": "MISSING",
                "label": "未绑定审批路由",
                "routeTemplateId": None,
                "routeTemplateVersionId": None,
                "findings": [
                    {
                        "code": "workflow_route_required",
                        "field": "workflowBinding.routeTemplateId",
                        "message": (
                            "Workflow route binding is mandatory before publish readiness "
                            "can pass"
                        ),
                    },
                ],
            }
        validation_summary = binding.get("validationSummary") or {}
        findings = deepcopy(binding.get("resolutionFindings") or [])
        if int(validation_summary.get("errorCount") or 0) > 0:
            findings.append(
                {
                    "code": "workflow_route_template_invalid",
                    "field": "workflowBinding.routeTemplateVersionId",
                    "message": "Bound workflow route template has validation errors",
                },
            )
        ready = not findings and bool(binding.get("routeTemplateVersionId"))
        return {
            "ready": ready,
            "mandatory": True,
            "status": "READY" if ready else "BLOCKED",
            "label": binding.get("templateName") or binding.get("routeTemplateId") or "审批路由",
            "routeTemplateId": binding.get("routeTemplateId"),
            "routeTemplateVersionId": binding.get("routeTemplateVersionId"),
            "snapshotHash": binding.get("snapshotHash"),
            "effectiveSnapshotHash": binding.get("effectiveSnapshotHash"),
            "overrideEnabled": bool(binding.get("overrideEnabled")),
            "bindingMode": binding.get("bindingMode"),
            "validationSummary": validation_summary,
            "routeSummary": deepcopy(binding.get("routeSummary") or {}),
            "findings": findings,
        }

    def _materialize_schedule_binding_payload(
        self,
        payload: dict[str, Any],
        *,
        user: AuthUserRecord,
    ) -> dict[str, Any]:
        materialized = deepcopy(payload)
        binding, findings = self._normalize_schedule_binding(
            materialized.get("scheduleBinding"),
            user=user,
        )
        if findings:
            raise AppError(
                code="VALIDATION_ERROR",
                message="Invalid scheme schedule binding",
                status_code=422,
                details=findings,
            )
        materialized["scheduleBinding"] = binding
        return materialized

    def _normalize_schedule_binding(
        self,
        binding: dict[str, Any] | None,
        *,
        user: AuthUserRecord | None = None,
    ) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        if not binding:
            return {}, []
        findings: list[dict[str, Any]] = []
        raw_mode = binding.get("dispatchMode")
        dispatch_mode = self._canonical_dispatch_mode(raw_mode)
        if not dispatch_mode:
            findings.append(
                {
                    "code": "dispatch_mode_required",
                    "field": "scheduleBinding.dispatchMode",
                    "message": (
                        "Dispatch strategy must be selected before publish readiness can pass"
                    ),
                },
            )
            return {}, findings

        periodic_rule: dict[str, Any] | None = None
        manual_policy: dict[str, Any] | None = None
        next_run_at: str | None = None
        activation_state = "CONFIGURED_NOT_ACTIVATED"
        if dispatch_mode == "SCHEDULED":
            periodic_rule, rule_findings = self._normalize_periodic_rule(
                binding.get("periodicRule"),
            )
            findings.extend(rule_findings)
            if periodic_rule and not rule_findings:
                next_run_at = self._predict_schedule_next_run(periodic_rule)
        elif dispatch_mode == "MANUAL":
            manual_policy = {
                "boundary": "MANUAL_DISPATCH_AFTER_PUBLISH",
                "requiresSeparateCycleDispatch": True,
                "createsNoCycleOnSave": True,
                **deepcopy(binding.get("manualDispatchPolicy") or {}),
            }
            activation_state = "MANUAL_AFTER_PUBLISH"
        else:
            findings.append(
                {
                    "code": "dispatch_mode_unsupported",
                    "field": "scheduleBinding.dispatchMode",
                    "message": f"Unsupported dispatch mode: {dispatch_mode}",
                },
            )

        summary = self._schedule_summary_from_parts(
            dispatch_mode=dispatch_mode,
            periodic_rule=periodic_rule,
            manual_policy=manual_policy,
            next_run_at=next_run_at,
            last_run_at=binding.get("lastRunAt"),
            findings=findings,
        )
        normalized = {
            "bindingMode": "SCHEME_SCHEDULE_CONFIG",
            "dispatchMode": dispatch_mode,
            "periodicRule": periodic_rule,
            "manualDispatchPolicy": manual_policy,
            "activationState": activation_state,
            "readinessStatus": "READY" if not findings else "BLOCKED",
            "nextRunAt": next_run_at,
            "lastRunAt": binding.get("lastRunAt"),
            "summary": summary,
            "findings": deepcopy(findings),
            "configuredAt": binding.get("configuredAt") or relative_datetime_iso(),
            "configuredByRef": binding.get("configuredByRef") or (user.user_id if user else None),
            "runtimeBoundary": {
                "saveConfigCreatesCycle": False,
                "activationCreatesCycle": False,
                "dispatchOwnedBy": "P2_ASSESSMENT_SCHEDULER_OR_P1_MANUAL_CYCLE_COMMAND",
            },
        }
        return normalized, findings

    @staticmethod
    def _canonical_dispatch_mode(raw_mode: Any) -> str | None:
        if raw_mode is None or not str(raw_mode).strip():
            return None
        mode = str(raw_mode).strip().upper()
        if mode in {"PERIODIC", "AUTO", "AUTOMATIC"}:
            return "SCHEDULED"
        if mode in {"SCHEDULED", "MANUAL"}:
            return mode
        return mode

    def _normalize_periodic_rule(
        self,
        rule: dict[str, Any] | None,
    ) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
        findings: list[dict[str, Any]] = []
        if not rule:
            return None, [
                {
                    "code": "periodic_rule_required",
                    "field": "scheduleBinding.periodicRule",
                    "message": "Periodic rule is required for scheduled dispatch",
                },
            ]
        frequency = str(rule.get("frequency") or "").strip().upper()
        if frequency not in {"MONTHLY", "QUARTERLY", "HALF_YEARLY", "YEARLY"}:
            findings.append(
                {
                    "code": "periodic_frequency_invalid",
                    "field": "scheduleBinding.periodicRule.frequency",
                    "message": (
                        "Periodic dispatch frequency must be MONTHLY, QUARTERLY, "
                        "HALF_YEARLY or YEARLY"
                    ),
                },
            )
        try:
            working_day_offset = int(rule.get("workingDayOffset"))
        except (TypeError, ValueError):
            working_day_offset = 0
        if working_day_offset < 1 or working_day_offset > 23:
            findings.append(
                {
                    "code": "periodic_working_day_offset_invalid",
                    "field": "scheduleBinding.periodicRule.workingDayOffset",
                    "message": "Working day offset must be between 1 and 23",
                },
            )
        fire_time = str(rule.get("fireTime") or "").strip()
        if not self._valid_fire_time(fire_time):
            findings.append(
                {
                    "code": "periodic_fire_time_invalid",
                    "field": "scheduleBinding.periodicRule.fireTime",
                    "message": "Fire time must use HH:MM 24-hour format",
                },
            )
        calendar_code = str(rule.get("calendarCode") or "WEEKDAY_ONLY").strip().upper()
        if calendar_code != "WEEKDAY_ONLY":
            findings.append(
                {
                    "code": "calendar_policy_unsupported",
                    "field": "scheduleBinding.periodicRule.calendarCode",
                    "message": "Only WEEKDAY_ONLY calendar policy is supported in this slice",
                },
            )
        normalized = {
            "frequency": frequency,
            "workingDayOffset": working_day_offset,
            "fireTime": fire_time,
            "timezone": str(rule.get("timezone") or "Asia/Shanghai"),
            "calendarCode": calendar_code,
            "validFrom": rule.get("validFrom"),
            "validUntil": rule.get("validUntil"),
        }
        return normalized, findings

    @staticmethod
    def _valid_fire_time(value: str) -> bool:
        try:
            hour_raw, minute_raw = value.split(":", 1)
            hour = int(hour_raw)
            minute = int(minute_raw)
        except (TypeError, ValueError):
            return False
        return 0 <= hour <= 23 and 0 <= minute <= 59

    def _schedule_dispatch_readiness(
        self,
        binding: dict[str, Any] | None,
        *,
        extra_findings: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        findings = deepcopy(extra_findings or [])
        if not binding:
            findings.append(
                {
                    "code": "dispatch_strategy_required",
                    "field": "scheduleBinding.dispatchMode",
                    "message": (
                        "Schedule/dispatch strategy is mandatory before publish readiness "
                        "can pass"
                    ),
                },
            )
            return {
                "ready": False,
                "mandatory": True,
                "status": "MISSING",
                "dispatchMode": None,
                "activationState": None,
                "label": "未选择下发策略",
                "nextRunAt": None,
                "lastRunAt": None,
                "summary": None,
                "findings": findings,
            }
        findings.extend(deepcopy(binding.get("findings") or []))
        ready = not findings and binding.get("dispatchMode") in {"SCHEDULED", "MANUAL"}
        return {
            "ready": ready,
            "mandatory": True,
            "status": "READY" if ready else "BLOCKED",
            "dispatchMode": binding.get("dispatchMode"),
            "activationState": binding.get("activationState"),
            "label": (binding.get("summary") or {}).get("label") or "下发与调度策略",
            "nextRunAt": binding.get("nextRunAt"),
            "lastRunAt": binding.get("lastRunAt"),
            "summary": deepcopy(binding.get("summary") or {}),
            "findings": findings,
        }

    def _schedule_summary(self, binding: dict[str, Any] | None) -> dict[str, Any] | None:
        if not binding:
            return None
        return deepcopy(binding.get("summary")) or self._schedule_summary_from_parts(
            dispatch_mode=binding.get("dispatchMode"),
            periodic_rule=binding.get("periodicRule"),
            manual_policy=binding.get("manualDispatchPolicy"),
            next_run_at=binding.get("nextRunAt"),
            last_run_at=binding.get("lastRunAt"),
            findings=binding.get("findings") or [],
        )

    @staticmethod
    def _schedule_summary_from_parts(
        *,
        dispatch_mode: str | None,
        periodic_rule: dict[str, Any] | None,
        manual_policy: dict[str, Any] | None,
        next_run_at: str | None,
        last_run_at: str | None,
        findings: list[dict[str, Any]],
    ) -> dict[str, Any]:
        if dispatch_mode == "SCHEDULED":
            rule_label = ""
            if periodic_rule:
                rule_label = (
                    f"{periodic_rule.get('frequency')} · 第 "
                    f"{periodic_rule.get('workingDayOffset')} 个工作日 "
                    f"{periodic_rule.get('fireTime')}"
                )
            return {
                "label": "周期性下发",
                "dispatchMode": "SCHEDULED",
                "modeLabel": "周期性下发",
                "ruleLabel": rule_label,
                "nextRunAt": next_run_at,
                "lastRunAt": last_run_at,
                "ready": not findings,
                "findingsCount": len(findings),
            }
        if dispatch_mode == "MANUAL":
            return {
                "label": "手动/一次性下发",
                "dispatchMode": "MANUAL",
                "modeLabel": "手动/一次性下发",
                "ruleLabel": (manual_policy or {}).get(
                    "boundary",
                    "MANUAL_DISPATCH_AFTER_PUBLISH",
                ),
                "nextRunAt": None,
                "lastRunAt": last_run_at,
                "ready": not findings,
                "findingsCount": len(findings),
            }
        return {
            "label": "未选择下发策略",
            "dispatchMode": dispatch_mode,
            "modeLabel": "未选择",
            "ruleLabel": "",
            "nextRunAt": next_run_at,
            "lastRunAt": last_run_at,
            "ready": False,
            "findingsCount": len(findings),
        }

    def _predict_schedule_next_run(self, rule: dict[str, Any]) -> str:
        base = date.today() + timedelta(days=1)
        period_start = self._next_schedule_period_start(base, rule["frequency"])
        fire_date = self._nth_weekday(period_start, int(rule["workingDayOffset"]))
        hour, minute = [int(part) for part in str(rule["fireTime"]).split(":", 1)]
        return datetime.combine(fire_date, time(hour, minute, tzinfo=UTC)).isoformat().replace(
            "+00:00",
            "Z",
        )

    @staticmethod
    def _next_schedule_period_start(base: date, frequency: str) -> date:
        month = base.month
        year = base.year
        if frequency == "MONTHLY":
            month += 1
        elif frequency == "QUARTERLY":
            month = ((month - 1) // 3 + 1) * 3 + 1
        elif frequency == "HALF_YEARLY":
            month = 7 if month <= 6 else 13
        elif frequency == "YEARLY":
            year += 1
            month = 1
        else:
            month += 1
        while month > 12:
            month -= 12
            year += 1
        return date(year, month, 1)

    @staticmethod
    def _nth_weekday(period_start: date, offset: int) -> date:
        current = period_start
        count = 0
        while True:
            if current.weekday() < 5:
                count += 1
                if count == offset:
                    return current
            current += timedelta(days=1)

    def _workflow_summary(self, binding: dict[str, Any] | None) -> dict[str, Any] | None:
        if not binding:
            return None
        summary = deepcopy(binding.get("routeSummary") or {})
        return {
            "routeTemplateId": binding.get("routeTemplateId"),
            "routeTemplateVersionId": binding.get("routeTemplateVersionId"),
            "templateName": binding.get("templateName"),
            "snapshotHash": binding.get("snapshotHash"),
            "effectiveSnapshotHash": binding.get("effectiveSnapshotHash"),
            "overrideEnabled": bool(binding.get("overrideEnabled")),
            "bindingMode": binding.get("bindingMode"),
            **summary,
        }

    @staticmethod
    def _business_line_summary(scheme: AssessmentSchemeRecord) -> dict[str, Any]:
        lines = sorted(
            {
                str(item.indicator_snapshot.get("businessLine"))
                for item in scheme.items
                if item.indicator_snapshot.get("businessLine")
            },
        )
        return {
            "businessLines": lines,
            "primaryBusinessLine": lines[0] if lines else None,
            "label": "、".join(lines) if lines else None,
        }

    @staticmethod
    def _source_trace_summary(scheme: AssessmentSchemeRecord) -> dict[str, Any] | None:
        if not scheme.source_trace:
            return None
        return {
            "sourceSchemeId": scheme.source_scheme_id
            or scheme.source_trace.get("sourceSchemeId"),
            "sourceSchemeCode": scheme.source_scheme_code
            or scheme.source_trace.get("sourceSchemeCode"),
            "sourceOptimisticVersion": scheme.source_trace.get("sourceOptimisticVersion"),
            "copiedAt": scheme.source_trace.get("copiedAt"),
            "copiedBy": scheme.source_trace.get("copiedBy"),
        }

    @staticmethod
    def _readiness_summary(readiness: dict[str, Any]) -> dict[str, Any]:
        sections: list[dict[str, Any]] = []
        for key in readiness.get("mandatorySections", []):
            section = readiness.get(key) or {}
            findings = section.get("findings") or []
            sections.append(
                {
                    "section": key,
                    "label": section.get("label") or key,
                    "ready": section.get("ready") is True,
                    "status": section.get("status"),
                    "findingsCount": len(findings),
                    "firstFinding": findings[0] if findings else None,
                },
            )
        blocked = [section for section in sections if not section["ready"]]
        return {
            "mandatoryReady": readiness.get("mandatoryReady") is True,
            "readyCount": len(sections) - len(blocked),
            "mandatoryCount": len(sections),
            "blockedSections": blocked,
            "sections": sections,
            "optionalSections": readiness.get("optionalSections", []),
        }

    @staticmethod
    def _publish_summary(
        scheme: AssessmentSchemeRecord,
        readiness: dict[str, Any],
    ) -> dict[str, Any]:
        snapshot = scheme.scheme_snapshot or {}
        snapshot_hash = snapshot.get("snapshotHash")
        simulation = (snapshot.get("readiness") or readiness).get("simulation") or {}
        return {
            "status": scheme.status,
            "publishedAtRef": scheme.published_at_ref,
            "publishedByRef": scheme.published_by_ref,
            "snapshotHash": snapshot_hash,
            "mandatoryReady": (
                snapshot.get("readiness") or readiness
            ).get("mandatoryReady") is True,
            "simulationStatus": simulation.get("status"),
            "simulationMandatory": simulation.get("mandatory") is True,
            "simulationBlocksPublish": simulation.get("blocksPublish") is True,
        }

    @staticmethod
    def _command_audit_summary(scheme: AssessmentSchemeRecord) -> dict[str, Any]:
        last_event = scheme.command_audit[-1] if scheme.command_audit else None
        return {
            "eventCount": len(scheme.command_audit),
            "lastAction": last_event.get("action") if last_event else None,
            "lastOccurredAt": last_event.get("occurredAt") if last_event else None,
            "lastActorUserId": last_event.get("actorUserId") if last_event else None,
        }

    @staticmethod
    def _scheme_updated_at(scheme: AssessmentSchemeRecord) -> str:
        if scheme.command_audit:
            occurred_at = scheme.command_audit[-1].get("occurredAt")
            if occurred_at:
                return str(occurred_at)
        return scheme.published_at_ref or scheme.created_at

    @staticmethod
    def _parse_filter_datetime(
        value: str | None,
        *,
        field: str,
        end_of_day: bool = False,
    ) -> datetime | None:
        if not value:
            return None
        normalized = value.strip()
        if not normalized:
            return None
        if len(normalized) == 10:
            normalized = f"{normalized}T{'23:59:59' if end_of_day else '00:00:00'}"
        normalized = normalized.replace("Z", "+00:00")
        try:
            parsed = datetime.fromisoformat(normalized)
        except ValueError as exc:
            raise AppError(
                code="VALIDATION_ERROR",
                message="Invalid assessment scheme datetime filter",
                status_code=422,
                details={"field": field, "value": value},
            ) from exc
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=UTC)
        return parsed.astimezone(UTC)

    @staticmethod
    def _parse_record_datetime(value: str | None) -> datetime | None:
        if not value:
            return None
        normalized = value.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=UTC)
        return parsed.astimezone(UTC)

    def _workflow_route_summary(
        self,
        template: WorkflowTemplateAggregate,
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        evaluator = RouteChainEvaluator(auth=auth_store)
        findings: list[dict[str, Any]] = []
        chains: list[dict[str, Any]] = []
        for chain in template.chains:
            level_summaries: list[dict[str, Any]] = []
            for level in WORKFLOW_LEVELS:
                nodes = sorted(
                    [node for node in chain.nodes if node.level == level],
                    key=lambda item: item.sort_order,
                )
                approvers = evaluator.resolve_approvers(
                    chain=chain,
                    level=level,
                    target_org_id=chain.target_scope.target_org_ids[0]
                    if chain.target_scope.target_org_ids
                    else None,
                    business_line=chain.target_scope.business_line,
                )
                if nodes and not approvers:
                    findings.append(
                        {
                            "code": "workflow_route_approver_unresolved",
                            "field": "workflowBinding.routeSummary",
                            "message": f"No approver resolved for {chain.chain_id}/{level}",
                            "chainId": chain.chain_id,
                            "level": level,
                        },
                    )
                level_summaries.append(
                    {
                        "level": level,
                        "nodeCount": len(nodes),
                        "nodes": [
                            {
                                "nodeId": node.node_id,
                                "label": node.label,
                                "nodeType": node.node_type,
                                "isFinal": node.is_final,
                                "approverSelector": node.approver_selector.model_dump(
                                    by_alias=True,
                                ),
                            }
                            for node in nodes
                        ],
                        "approverCount": len(approvers),
                        "approvers": [
                            approver.model_dump(by_alias=True)
                            for approver in approvers[:5]
                        ],
                    },
                )
            chains.append(
                {
                    "chainId": chain.chain_id,
                    "chainName": chain.name,
                    "approvalPolicy": chain.approval_policy,
                    "targetScope": chain.target_scope.model_dump(by_alias=True),
                    "nodeCount": len(chain.nodes),
                    "edgeCount": len(chain.edges),
                    "levels": level_summaries,
                },
            )
        return {
            "chainCount": len(template.chains),
            "nodeCount": sum(len(chain.nodes) for chain in template.chains),
            "edgeCount": sum(len(chain.edges) for chain in template.chains),
            "chains": chains,
            "findings": findings,
        }

    def _resolve_target_group(
        self,
        group: dict[str, Any],
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        scope_mode = group.get("scopeMode")
        if scope_mode == "ALL_BRANCHES":
            branch_ids = self._active_branch_office_ids(auth_store)
            return {
                "targetIds": branch_ids,
                "label": f"全部营业部（{len(branch_ids)} 家）",
                "findings": [],
                "deferred": False,
                "disabledReason": None,
            }
        if scope_mode == "MANUAL_SELECTION":
            target_ids = [
                str(member.get("orgId"))
                for member in group.get("members") or []
                if member.get("orgId")
            ]
            snapshots = [auth_store.org_snapshot(org_id) for org_id in target_ids]
            missing = [
                org_id
                for org_id, snapshot in zip(target_ids, snapshots, strict=False)
                if not snapshot.get("active")
            ]
            return {
                "targetIds": target_ids,
                "label": f"手工选择（{len(set(target_ids))} 家）",
                "findings": [
                    {
                        "code": "target_group_org_not_found",
                        "field": "targetGroups.members.orgId",
                        "message": f"Unknown org {org_id}",
                    }
                    for org_id in missing
                ],
                "deferred": False,
                "disabledReason": None,
            }
        return {
            "targetIds": [],
            "label": f"{scope_mode or 'UNKNOWN'}（暂缓）",
            "findings": [
                {
                    "code": "target_scope_mode_deferred",
                    "field": "targetGroups.scopeMode",
                    "message": f"{scope_mode or 'UNKNOWN'} target scope is deferred",
                },
            ],
            "deferred": True,
            "disabledReason": "Target scope mode is deferred in SIT-ASCH-03.",
        }

    @staticmethod
    def _active_branch_office_ids(auth_store: SeedAuthStore) -> list[str]:
        return [
            org.org_id
            for org in sorted(auth_store.orgs.values(), key=lambda item: item.org_id)
            if org.active and org.org_level == "BRANCH_OFFICE"
        ]

    @staticmethod
    def _target_scope_summary(groups: list[TargetGroupRecord]) -> dict[str, Any]:
        target_ids: list[str] = []
        snapshots: list[dict[str, Any]] = []
        findings: list[dict[str, Any]] = []
        for group in groups:
            group_target_ids = [member.org_id for member in group.members]
            target_ids.extend(group_target_ids)
            label = (
                f"全部营业部（{len(group_target_ids)} 家）"
                if group.scope_mode == "ALL_BRANCHES"
                else f"{group.group_name}（{len(group_target_ids)} 家）"
            )
            snapshots.append(
                {
                    "targetGroupId": group.target_group_id,
                    "groupName": group.group_name,
                    "scopeMode": group.scope_mode,
                    "label": label,
                    "targetCount": len(set(group_target_ids)),
                    "targetIds": group_target_ids,
                    "sampleTargets": [
                        member.org_snapshot
                        for member in group.members[:5]
                    ],
                },
            )
            if group.scope_mode not in {"MANUAL_SELECTION", "ALL_BRANCHES"}:
                findings.append(
                    {
                        "code": "target_scope_mode_deferred",
                        "field": "targetGroups.scopeMode",
                        "message": f"{group.scope_mode} target scope is deferred",
                    },
                )
        unique_target_ids = sorted(set(target_ids))
        return {
            "targetCount": len(unique_target_ids),
            "targetScopeLabel": SeedSchemeStore._target_scope_label_from_snapshot(snapshots),
            "targetRuleLabel": SeedSchemeStore._target_rule_label(groups),
            "scopeSnapshot": snapshots,
            "resolutionFindings": findings,
        }

    @staticmethod
    def _target_scope_label_from_snapshot(snapshots: list[dict[str, Any]]) -> str:
        if not snapshots:
            return "未配置考核对象"
        if len(snapshots) == 1:
            return str(snapshots[0].get("label") or snapshots[0].get("scopeMode") or "-")
        count = sum(int(item.get("targetCount") or 0) for item in snapshots)
        return f"{len(snapshots)} 个范围 / {count} 个对象"

    @staticmethod
    def _target_rule_label(groups: list[TargetGroupRecord]) -> str:
        modes = {group.scope_mode for group in groups}
        if not modes:
            return "未配置"
        if modes == {"ALL_BRANCHES"}:
            return "动态范围：全部营业部"
        if modes == {"MANUAL_SELECTION"}:
            return "手工选择"
        return "混合范围：" + "、".join(sorted(modes))

    def _detail_payload(self, scheme: AssessmentSchemeRecord) -> dict[str, Any]:
        return {
            "schemeName": scheme.scheme_name,
            "year": scheme.year,
            "frequency": scheme.frequency,
            "description": scheme.description,
            "totalWeight": scheme.total_weight,
            "items": [self._item_view(item, include_snapshot=False) for item in scheme.items],
            "gradeThresholds": [
                self._threshold_view(item) for item in scheme.grade_thresholds
            ],
            "volumeAdjustmentFactors": [
                self._factor_view(item) for item in scheme.volume_adjustment_factors
            ],
            "targetGroups": [
                self._target_group_view(item, include_snapshot=False)
                for item in scheme.target_groups
            ],
            "workflowBinding": deepcopy(scheme.workflow_binding) or None,
            "scheduleBinding": deepcopy(scheme.schedule_binding) or None,
        }

    def _scheme_snapshot(self, scheme: AssessmentSchemeRecord) -> dict[str, Any]:
        return {
            "schemeId": scheme.scheme_id,
            "schemeCode": scheme.scheme_code,
            "schemeName": scheme.scheme_name,
            "year": scheme.year,
            "frequency": scheme.frequency,
            "totalWeight": scheme.total_weight,
            "items": [self._item_view(item) for item in scheme.items],
            "gradeThresholds": [
                self._threshold_view(item) for item in scheme.grade_thresholds
            ],
            "volumeAdjustmentFactors": [
                self._factor_view(item) for item in scheme.volume_adjustment_factors
            ],
            "targetGroups": [self._target_group_view(item) for item in scheme.target_groups],
            "targetScope": self._target_scope_summary(scheme.target_groups),
            "workflowBinding": deepcopy(scheme.workflow_binding) or None,
            "workflowSummary": self._workflow_summary(scheme.workflow_binding),
            "scheduleBinding": deepcopy(scheme.schedule_binding) or None,
            "scheduleSummary": self._schedule_summary(scheme.schedule_binding),
            "nextRunAt": (scheme.schedule_binding or {}).get("nextRunAt"),
            "lastRunAt": (scheme.schedule_binding or {}).get("lastRunAt"),
        }

    def _rekey_children(self, scheme: AssessmentSchemeRecord) -> None:
        for index, item in enumerate(scheme.items, start=1):
            item.scheme_item_id = f"{scheme.scheme_id}-ITEM-{index:03d}"
            item.sort_order = index
        for index, threshold in enumerate(scheme.grade_thresholds, start=1):
            threshold.threshold_id = f"{scheme.scheme_id}-GRADE-{index:03d}"
            threshold.sort_order = index
        for index, factor in enumerate(scheme.volume_adjustment_factors, start=1):
            factor.factor_id = f"{scheme.scheme_id}-FACTOR-{index:03d}"
            factor.sort_order = index
        for group_index, group in enumerate(scheme.target_groups, start=1):
            group.target_group_id = f"{scheme.scheme_id}-TG-{group_index:03d}"
            group.sort_order = group_index
            for member_index, member in enumerate(group.members, start=1):
                member.member_id = (
                    f"{scheme.scheme_id}-TG-{group_index:03d}-MEM-{member_index:03d}"
                )
                member.sort_order = member_index

    @staticmethod
    def _refresh_indicator_snapshots(scheme: AssessmentSchemeRecord) -> None:
        for item in scheme.items:
            item.indicator_snapshot = indicator_store.published_version_snapshot(
                item.indicator_id,
                item.version_id,
            )

    @staticmethod
    def _apply_org_snapshots(
        scheme: AssessmentSchemeRecord,
        auth_store: SeedAuthStore,
    ) -> None:
        for group in scheme.target_groups:
            for member in group.members:
                member.org_snapshot = auth_store.org_snapshot(member.org_id)

    def _get_scheme(self, scheme_id: str) -> AssessmentSchemeRecord:
        scheme = self.schemes.get(scheme_id)
        if not scheme:
            raise NotFoundError("Assessment scheme not found")
        return scheme

    def _ensure_transition(self, status: str, action: str) -> None:
        transition = assessment_transition_for(
            machine="assessmentScheme",
            state=status,
            action=action,
        )
        if transition is None:
            raise AppError(
                code="INVALID_TRANSITION",
                message="Invalid assessment scheme transition",
                status_code=409,
                details={"status": status, "action": action},
            )

    @staticmethod
    def _matches_filters(
        scheme: AssessmentSchemeRecord,
        *,
        keyword: str | None,
        year: int | None,
        status: str | None,
        frequency: str | None,
        business_line: str | None,
        target_scope_mode: str | None,
        updated_from: datetime | None,
        updated_to: datetime | None,
    ) -> bool:
        if year is not None and scheme.year != year:
            return False
        if status is not None and scheme.status != status:
            return False
        if frequency is not None and scheme.frequency != frequency:
            return False
        if business_line:
            normalized_line = business_line.lower()
            scheme_lines = {
                str(item.indicator_snapshot.get("businessLine", "")).lower()
                for item in scheme.items
            }
            if normalized_line not in scheme_lines:
                return False
        if target_scope_mode:
            if target_scope_mode not in {group.scope_mode for group in scheme.target_groups}:
                return False
        updated_at = SeedSchemeStore._parse_record_datetime(
            SeedSchemeStore._scheme_updated_at(scheme),
        )
        if updated_from is not None and (updated_at is None or updated_at < updated_from):
            return False
        if updated_to is not None and (updated_at is None or updated_at > updated_to):
            return False
        if keyword:
            normalized = keyword.lower()
            return (
                normalized in scheme.scheme_name.lower()
                or normalized in scheme.scheme_code.lower()
                or any(
                    normalized in str(item.indicator_snapshot.get("indicatorName", "")).lower()
                    or normalized in str(item.indicator_snapshot.get("indicatorCode", "")).lower()
                    for item in scheme.items
                )
            )
        return True

    @staticmethod
    def _item_view(item: SchemeItemRecord, *, include_snapshot: bool = True) -> dict[str, Any]:
        payload = {
            "schemeItemId": item.scheme_item_id,
            "indicatorId": item.indicator_id,
            "versionId": item.version_id,
            "weight": item.weight,
            "scoreCap": item.score_cap,
            "sortOrder": item.sort_order,
        }
        if include_snapshot:
            payload["indicatorSnapshot"] = item.indicator_snapshot
        return payload

    @staticmethod
    def _threshold_view(threshold: GradeThresholdRecord) -> dict[str, Any]:
        return {
            "thresholdId": threshold.threshold_id,
            "gradeCode": threshold.grade_code,
            "gradeLabel": threshold.grade_label,
            "minScore": threshold.min_score,
            "maxScore": threshold.max_score,
            "sortOrder": threshold.sort_order,
        }

    @staticmethod
    def _factor_view(factor: VolumeAdjustmentFactorRecord) -> dict[str, Any]:
        return {
            "factorId": factor.factor_id,
            "factorCode": factor.factor_code,
            "factorName": factor.factor_name,
            "metric": factor.metric,
            "operator": factor.operator,
            "value": factor.value,
            "description": factor.description,
            "multiplier": factor.multiplier,
            "enabled": factor.enabled,
            "sortOrder": factor.sort_order,
        }

    @staticmethod
    def _target_group_view(
        group: TargetGroupRecord,
        *,
        include_snapshot: bool = True,
    ) -> dict[str, Any]:
        return {
            "targetGroupId": group.target_group_id,
            "groupName": group.group_name,
            "scopeMode": group.scope_mode,
            "description": group.description,
            "sortOrder": group.sort_order,
            "members": [
                {
                    "memberId": member.member_id,
                    "orgId": member.org_id,
                    "orgSnapshot": member.org_snapshot if include_snapshot else {},
                    "sortOrder": member.sort_order,
                }
                for member in group.members
            ],
        }

    @staticmethod
    def _require_read(user: AuthUserRecord, auth_store: SeedAuthStore) -> None:
        if auth_store.has_permission(
            user,
            "PERM-P1-ASSESSMENT-SCHEME-READ",
        ) or auth_store.has_permission(
            user,
            "PERM-P1-ASSESSMENT-SCHEME-MANAGE",
        ):
            return
        raise ForbiddenError()

    @staticmethod
    def _require_manage(user: AuthUserRecord, auth_store: SeedAuthStore) -> None:
        auth_store.require_permission(user, "PERM-P1-ASSESSMENT-SCHEME-MANAGE")

    def _build_schemes(self) -> dict[str, AssessmentSchemeRecord]:
        seed_specs: list[dict[str, Any]] = [
            {
                "schemeId": "ASCH-SEED-2026",
                "schemeCode": "WLZQ-ASCH-SEED-2026",
                "schemeName": "2026 年分支合规考核方案",
                "year": 2026,
                "frequency": "YEARLY",
                "status": "ACTIVE",
                "description": "P1 downstream cycle fixture scheme.",
                "totalWeight": 100,
                "items": [
                    {
                        "indicatorId": "AIND-SEED-001",
                        "versionId": "AIND-SEED-001-V001",
                        "weight": 100,
                        "scoreCap": 100,
                    },
                ],
                "gradeThresholds": [
                    {"gradeCode": "A", "gradeLabel": "优秀", "minScore": 90, "maxScore": None},
                    {"gradeCode": "B", "gradeLabel": "良好", "minScore": 75, "maxScore": 90},
                    {"gradeCode": "C", "gradeLabel": "合格", "minScore": 60, "maxScore": 75},
                    {"gradeCode": "D", "gradeLabel": "待改进", "minScore": 0, "maxScore": 60},
                ],
                "volumeAdjustmentFactors": [
                    {
                        "factorCode": "DEFAULT",
                        "factorName": "默认业务量系数",
                        "description": "No adjustment in first P1 scheme fixture.",
                        "multiplier": 1,
                    },
                ],
                "targetGroups": [
                    {
                        "groupName": "广州南沙营业部考核对象",
                        "scopeMode": "MANUAL_SELECTION",
                        "members": [{"orgId": "WLZQ-RBC-GZ-NANSHA"}],
                    },
                ],
            },
            {
                "schemeId": "ASCH-SEED-2026-Q2",
                "schemeCode": "WLZQ-ASCH-SEED-2026-Q2",
                "schemeName": "2026年Q2反洗钱专项考核",
                "year": 2026,
                "frequency": "QUARTERLY",
                "status": "ACTIVE",
                "description": (
                    "P1 seed scheme for AML special assessment, "
                    "references AIND-SEED-003."
                ),
                "totalWeight": 100,
                "items": [
                    {
                        "indicatorId": "AIND-SEED-003",
                        "versionId": "AIND-SEED-003-V001",
                        "weight": 100,
                        "scoreCap": 100,
                    },
                ],
                "gradeThresholds": [
                    {"gradeCode": "A", "gradeLabel": "优秀", "minScore": 90, "maxScore": None},
                    {"gradeCode": "B", "gradeLabel": "良好", "minScore": 75, "maxScore": 90},
                    {"gradeCode": "C", "gradeLabel": "合格", "minScore": 60, "maxScore": 75},
                    {"gradeCode": "D", "gradeLabel": "待改进", "minScore": 0, "maxScore": 60},
                ],
                "volumeAdjustmentFactors": [
                    {
                        "factorCode": "DEFAULT",
                        "factorName": "默认业务量系数",
                        "description": "No adjustment in seed fixture.",
                        "multiplier": 1,
                    },
                ],
                "targetGroups": [
                    {
                        "groupName": "全部营业部反洗钱专项对象",
                        "scopeMode": "ALL_BRANCHES",
                        "members": [],
                    },
                ],
            },
            {
                "schemeId": "ASCH-SEED-2026-SPEC",
                "schemeCode": "WLZQ-ASCH-SEED-2026-SPEC",
                "schemeName": "2026年专项员工行为考核",
                "year": 2026,
                "frequency": "AD_HOC",
                "status": "DRAFT",
                "description": (
                    "P1 seed scheme for employee behavior special assessment, "
                    "references AIND-SEED-003."
                ),
                "totalWeight": 100,
                "items": [
                    {
                        "indicatorId": "AIND-SEED-003",
                        "versionId": "AIND-SEED-003-V001",
                        "weight": 100,
                        "scoreCap": 100,
                    },
                ],
                "gradeThresholds": [
                    {"gradeCode": "A", "gradeLabel": "优秀", "minScore": 90, "maxScore": None},
                    {"gradeCode": "B", "gradeLabel": "良好", "minScore": 75, "maxScore": 90},
                    {"gradeCode": "C", "gradeLabel": "合格", "minScore": 60, "maxScore": 75},
                    {"gradeCode": "D", "gradeLabel": "待改进", "minScore": 0, "maxScore": 60},
                ],
                "volumeAdjustmentFactors": [
                    {
                        "factorCode": "DEFAULT",
                        "factorName": "默认业务量系数",
                        "description": "No adjustment in seed fixture.",
                        "multiplier": 1,
                    },
                ],
                "targetGroups": [
                    {
                        "groupName": "员工行为专项考核对象",
                        "scopeMode": "MANUAL_SELECTION",
                        "members": [{"orgId": "WLZQ-RBC-GZ-NANSHA"}],
                    },
                ],
            },
            {
                "schemeId": "ASCH-SEED-2026-MONTHLY",
                "schemeCode": "WLZQ-ASCH-SEED-2026-MONTHLY",
                "schemeName": "2026年月度网点运营合规考核",
                "year": 2026,
                "frequency": "MONTHLY",
                "status": "ACTIVE",
                "description": (
                    "SIT-ASCH-03 seed scheme for monthly multi-indicator target scope display."
                ),
                "totalWeight": 100,
                "items": [
                    {
                        "indicatorId": "AIND-SEED-002",
                        "versionId": "AIND-SEED-002-V001",
                        "weight": 45,
                        "scoreCap": 100,
                    },
                    {
                        "indicatorId": "AIND-SEED-004",
                        "versionId": "AIND-SEED-004-V001",
                        "weight": 55,
                        "scoreCap": 100,
                    },
                ],
                "gradeThresholds": [
                    {"gradeCode": "A", "gradeLabel": "优秀", "minScore": 90, "maxScore": None},
                    {"gradeCode": "B", "gradeLabel": "良好", "minScore": 75, "maxScore": 90},
                    {"gradeCode": "C", "gradeLabel": "合格", "minScore": 60, "maxScore": 75},
                    {"gradeCode": "D", "gradeLabel": "待改进", "minScore": 0, "maxScore": 60},
                ],
                "volumeAdjustmentFactors": [
                    {
                        "factorCode": "BRANCH-SCALE",
                        "factorName": "营业部规模系数",
                        "metric": "activeCustomerCount",
                        "operator": ">=",
                        "value": 1000,
                        "description": "Monthly SIT seed factor with structured rule.",
                        "multiplier": 1.05,
                    },
                ],
                "targetGroups": [
                    {
                        "groupName": "广州重点营业部手工对象",
                        "scopeMode": "MANUAL_SELECTION",
                        "members": [
                            {"orgId": "WLZQ-RBC-GZ-NANSHA"},
                            {"orgId": "WLZQ-USR-RBC-GZ-LIWAN"},
                        ],
                    },
                ],
            },
            {
                "schemeId": "ASCH-SEED-2025-ARCHIVED",
                "schemeCode": "WLZQ-ASCH-SEED-2025-ARCHIVED",
                "schemeName": "2025年已归档分支合规考核方案",
                "year": 2025,
                "frequency": "YEARLY",
                "status": "ARCHIVED",
                "description": "SIT-ASCH-03 archived read-only seed scheme.",
                "totalWeight": 100,
                "items": [
                    {
                        "indicatorId": "AIND-SEED-001",
                        "versionId": "AIND-SEED-001-V001",
                        "weight": 60,
                        "scoreCap": 100,
                    },
                    {
                        "indicatorId": "AIND-SEED-003",
                        "versionId": "AIND-SEED-003-V001",
                        "weight": 40,
                        "scoreCap": 100,
                    },
                ],
                "gradeThresholds": [
                    {"gradeCode": "A", "gradeLabel": "优秀", "minScore": 90, "maxScore": None},
                    {"gradeCode": "B", "gradeLabel": "良好", "minScore": 75, "maxScore": 90},
                    {"gradeCode": "C", "gradeLabel": "合格", "minScore": 60, "maxScore": 75},
                    {"gradeCode": "D", "gradeLabel": "待改进", "minScore": 0, "maxScore": 60},
                ],
                "volumeAdjustmentFactors": [
                    {
                        "factorCode": "DEFAULT",
                        "factorName": "默认业务量系数",
                        "description": "Archived yearly SIT seed fixture.",
                        "multiplier": 1,
                    },
                ],
                "targetGroups": [
                    {
                        "groupName": "归档年度全部营业部对象",
                        "scopeMode": "ALL_BRANCHES",
                        "members": [],
                    },
                ],
            },
        ]

        from app.modules.compliance.domain.auth_store import auth_store

        schemes: dict[str, AssessmentSchemeRecord] = {}
        for spec in seed_specs:
            payload = {
                "schemeName": spec["schemeName"],
                "year": spec["year"],
                "frequency": spec["frequency"],
                "description": spec["description"],
                "totalWeight": spec["totalWeight"],
                "items": spec["items"],
                "gradeThresholds": spec["gradeThresholds"],
                "volumeAdjustmentFactors": spec["volumeAdjustmentFactors"],
                "targetGroups": spec["targetGroups"],
            }
            payload = self._materialize_target_groups_payload(payload, auth_store)
            scheme = self._scheme_from_payload(
                scheme_id=spec["schemeId"],
                scheme_code=spec["schemeCode"],
                payload=payload,
                user_id="SYSTEM-SEED",
            )
            scheme.status = spec.get("status", "ACTIVE")
            scheme.has_been_published = scheme.status in {"ACTIVE", "ARCHIVED"}
            scheme.published_by_ref = "SYSTEM-SEED" if scheme.has_been_published else None
            scheme.published_at_ref = relative_datetime_iso() if scheme.has_been_published else None
            scheme.archived_reason = (
                "SIT-ASCH-03 seed archived read-only fixture"
                if scheme.status == "ARCHIVED"
                else None
            )
            self._apply_org_snapshots(scheme, auth_store)
            scheme.scheme_snapshot = self._scheme_snapshot(scheme)
            schemes[scheme.scheme_id] = scheme
        return schemes


def _dedupe_errors(errors: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    deduped: list[dict[str, Any]] = []
    for error in errors:
        key = str(error.get("code", ""))
        if key in seen:
            continue
        seen.add(key)
        deduped.append(error)
    return deduped


scheme_store = SeedSchemeStore()
