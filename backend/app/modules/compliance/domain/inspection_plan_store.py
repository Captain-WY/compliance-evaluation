from __future__ import annotations

import hashlib
import json
from copy import deepcopy
from dataclasses import dataclass, field
from datetime import date
from typing import Any

from app.modules.compliance.core.errors import AppError, ForbiddenError, NotFoundError
from app.modules.compliance.domain.auth_store import AuthUserRecord, SeedAuthStore
from app.modules.compliance.domain.dictionaries import (
    DICTIONARIES,
    INSPECTION_PHASE_PROGRESS,
    allowed_inspection_actions,
    inspection_transition_for,
    validate_code,
    validate_codes,
)
from app.modules.compliance.domain.file_policy import (
    ALLOWED_FILE_EXTENSIONS,
    ALLOWED_FILE_MIME_TYPES,
    DEFAULT_SCAN_STATUS,
    MAX_FILE_SIZE,
)
from app.modules.compliance.domain.notification_store import notification_store
from app.modules.compliance.domain.seed_time import relative_date_iso, relative_datetime_iso, seed_base_date
from app.modules.compliance.domain.task_store import UnifiedTaskActionTargetRecord, UnifiedTaskRecord, task_store

EDITABLE_STATUSES = {"DRAFT", "APPROVING"}
INSPECTION_TARGET_ORG_LEVELS = {"REGIONAL_BRANCH_COMPANY", "BRANCH_OFFICE", "BUSINESS_LINE_HQ"}
ENTER_REPORT_PREPARATION_ACTION = "enter_report_preparation"
ENTER_REPORT_PREPARATION_COMMAND = "inspection_plan.enter_report_preparation"
DEFAULT_INSPECTION_PLAN_TYPE = "SPECIAL_INSPECTION"
DEFAULT_INSPECTION_PLAN_FREQUENCY = "AD_HOC"
DEFAULT_INSPECTION_CONFIDENTIALITY_LEVEL = "NORMAL"
INSPECTION_CONFIDENTIALITY_LEVEL_CATEGORY = "inspection_confidentiality_level"
PLAN_ATTACHMENT_FILE_POLICY = {
    "allowedMimeTypes": list(ALLOWED_FILE_MIME_TYPES),
    "allowedExtensions": list(ALLOWED_FILE_EXTENSIONS),
    "maxFileSizeBytes": MAX_FILE_SIZE,
    "scanStatus": DEFAULT_SCAN_STATUS,
}
PLAN_ATTACHMENT_COMMON_RULES: dict[str, Any] = {
    "required": False,
    "bindingTargetType": "InspectionPlan",
    "businessStage": "PLAN_CREATE",
    "maintenance": "draft_or_approval_editable",
    **PLAN_ATTACHMENT_FILE_POLICY,
}
PLAN_ATTACHMENT_TYPES: dict[str, dict[str, Any]] = {
    "INSPECTION_NOTICE": {
        "key": "notice",
        "label": "检查通知书",
        **PLAN_ATTACHMENT_COMMON_RULES,
    },
    "ONSITE_INSPECTION_SCHEME": {
        "key": "scheme",
        "label": "现场检查方案",
        **PLAN_ATTACHMENT_COMMON_RULES,
    },
    "WORKING_PAPER_TEMPLATE": {
        "key": "workingPaperTemplate",
        "label": "底稿模板",
        **PLAN_ATTACHMENT_COMMON_RULES,
    },
    "OTHER": {
        "key": "other",
        "label": "其他",
        **PLAN_ATTACHMENT_COMMON_RULES,
    },
}


def _require_create_dictionary_code(payload: dict[str, Any], field: str) -> str:
    value = payload.get(field)
    if value is None:
        raise AppError(
            code="VALIDATION_ERROR",
            message=f"Inspection plan {field} is required",
            status_code=422,
            details={"field": field, "reason": "required"},
        )
    normalized = str(value).strip()
    if not normalized:
        raise AppError(
            code="VALIDATION_ERROR",
            message=f"Inspection plan {field} is required",
            status_code=422,
            details={"field": field, "reason": "required"},
        )
    return normalized


def _create_required_error(field: str) -> AppError:
    return AppError(
        code="VALIDATION_ERROR",
        message=f"Inspection plan {field} is required",
        status_code=422,
        details={"field": field, "reason": "required"},
    )


def _require_create_text(payload: dict[str, Any], field: str) -> str:
    value = payload.get(field)
    if value is None:
        raise _create_required_error(field)
    normalized = str(value).strip()
    if not normalized:
        raise _create_required_error(field)
    return normalized


def _require_create_text_list(payload: dict[str, Any], field: str) -> list[str]:
    value = payload.get(field)
    if value is None or not isinstance(value, list):
        raise _create_required_error(field)
    normalized = [str(item).strip() for item in value]
    if not normalized or any(not item for item in normalized):
        raise _create_required_error(field)
    return normalized


def _filter_codes(value: str | None) -> set[str]:
    if not value:
        return set()
    return {item.strip() for item in value.split(",") if item.strip()}


@dataclass
class InspectionPlanRecord:
    inspection_plan_id: str
    inspect_code: str
    title: str
    type: str
    frequency: str
    target_org_ids: list[str]
    target_dept_label: str
    leader_user_id: str
    team_member_user_ids: list[str]
    planned_start_date: str
    planned_end_date: str
    status: str
    phase: str
    phase_progress: int
    confidentiality_level: str | None = None
    target_personnel_ids: list[str] = field(default_factory=list)
    target_org_snapshots: list[dict[str, Any]] = field(default_factory=list)
    target_personnel_snapshots: list[dict[str, Any]] = field(default_factory=list)
    leader_snapshot: dict[str, Any] = field(default_factory=dict)
    team_member_snapshots: list[dict[str, Any]] = field(default_factory=list)
    files: list[dict[str, Any]] = field(default_factory=list)
    ekp_flow: dict[str, Any] = field(default_factory=dict)
    previous_status: str | None = None
    previous_phase: str | None = None
    created_by: str = "SYSTEM-SEED"
    created_by_snapshot: dict[str, Any] = field(default_factory=dict)
    created_at: str = field(default_factory=relative_datetime_iso)
    updated_by: str = "SYSTEM-SEED"
    updated_by_snapshot: dict[str, Any] = field(default_factory=dict)
    updated_at: str = field(default_factory=relative_datetime_iso)
    version: int = 1
    acknowledgements: list[InspectionPlanAcknowledgementRecord] = field(default_factory=list)


@dataclass
class IntegrationEventRecord:
    integration_event_id: str
    type: str
    target_type: str
    target_id: str
    payload: dict[str, Any]
    status: str
    created_by: str
    created_by_snapshot: dict[str, Any]
    created_at: str
    external_ref: str | None = None


@dataclass
class InspectionPlanTransitionCommandRecord:
    command_key_id: str
    inspection_plan_id: str
    action: str
    actor_user_id: str
    idempotency_key: str
    payload_hash: str
    result_snapshot: dict[str, Any]
    created_at: str


@dataclass
class InspectionPlanAcknowledgementRecord:
    acknowledgement_id: str
    inspection_plan_id: str
    target_org_id: str
    ack_status: str
    acknowledged_by: str
    acknowledged_at: str
    liaison_name: str | None = None
    liaison_phone: str | None = None
    liaison_title: str | None = None
    created_by_snapshot: dict[str, Any] = field(default_factory=dict)


class SeedInspectionPlanStore:
    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self.plans = self._build_plans()
        self.events: dict[str, IntegrationEventRecord] = {}
        self.transition_command_keys: dict[
            tuple[str, str, str, str],
            InspectionPlanTransitionCommandRecord,
        ] = {}
        self.acknowledgements: dict[str, InspectionPlanAcknowledgementRecord] = {}
        self._hydrate_plan_acknowledgements()

    def plan_page(
        self,
        *,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        year: int | None = None,
        type_: str | None = None,
        frequency: str | None = None,
        status: str | None = None,
        phase: str | None = None,
        keyword: str | None = None,
        target_org_id: str | None = None,
        target_dept: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        self._require_hq_inspection(user, auth_store)
        type_codes = _filter_codes(type_)
        frequency_codes = _filter_codes(frequency)
        validate_codes(
            (status, "inspection_status", "status"),
            (phase, "inspection_phase", "phase"),
        )
        for code in type_codes:
            validate_code(code, category="inspection_plan_type", field="type")
        for code in frequency_codes:
            validate_code(code, category="inspection_plan_frequency", field="frequency")
        visible = [
            plan
            for plan in self.plans.values()
            if (year is None or plan.planned_start_date.startswith(str(year)))
            and (not type_codes or plan.type in type_codes)
            and (not frequency_codes or plan.frequency in frequency_codes)
            and (status is None or plan.status == status)
            and (phase is None or plan.phase == phase)
            and (target_org_id is None or target_org_id in plan.target_org_ids)
            and (target_dept is None or target_dept in plan.target_dept_label)
            and self._matches_keyword(plan, keyword, auth_store)
        ]
        visible.sort(key=lambda item: (item.planned_start_date, item.inspect_code))
        start = (page - 1) * page_size
        end = start + page_size
        return {
            "items": [self.plan_view(plan, auth_store) for plan in visible[start:end]],
            "page": page,
            "pageSize": page_size,
            "total": len(visible),
        }

    def create_plan(
        self,
        *,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        self._require_hq_inspection(user, auth_store)
        inspect_code = payload.get("inspectCode") or self._next_inspect_code()
        if any(plan.inspect_code == inspect_code for plan in self.plans.values()):
            raise AppError(
                code="DUPLICATE_PLAN_CODE",
                message="Inspection plan code already exists",
                status_code=409,
            )
        target_org_ids, target_dept_label = self._resolve_targets(payload, auth_store)
        target_personnel_ids = self._resolve_personnel_targets(payload, auth_store)
        if not target_org_ids and not target_dept_label and not target_personnel_ids:
            raise AppError(
                code="MISSING_TARGET_ORG",
                message="Inspection plan target organization is required",
                status_code=422,
            )
        self._validate_date_range(
            payload.get("plannedStartDate"),
            payload.get("plannedEndDate"),
        )
        plan_type = _require_create_dictionary_code(payload, "type")
        frequency = _require_create_dictionary_code(payload, "frequency")
        confidentiality_level = str(
            payload.get(
                "confidentialityLevel",
                DEFAULT_INSPECTION_CONFIDENTIALITY_LEVEL,
            )
        ).strip() or DEFAULT_INSPECTION_CONFIDENTIALITY_LEVEL
        validate_codes(
            (plan_type, "inspection_plan_type", "type"),
            (frequency, "inspection_plan_frequency", "frequency"),
            (
                confidentiality_level,
                INSPECTION_CONFIDENTIALITY_LEVEL_CATEGORY,
                "confidentialityLevel",
            ),
        )
        plan_id = payload.get("inspectionPlanId") or f"INSP-PLAN-SEED-{len(self.plans) + 1:04d}"
        if plan_id in self.plans:
            raise AppError(
                code="DUPLICATE_PLAN_CODE",
                message="Inspection plan id already exists",
                status_code=409,
            )
        leader_user_id = _require_create_text(payload, "leaderUserId")
        team_member_user_ids = _require_create_text_list(payload, "teamMemberUserIds")
        plan = InspectionPlanRecord(
            inspection_plan_id=plan_id,
            inspect_code=inspect_code,
            title=payload["title"],
            type=plan_type,
            frequency=frequency,
            confidentiality_level=confidentiality_level,
            target_org_ids=target_org_ids,
            target_dept_label=target_dept_label,
            target_org_snapshots=[auth_store.org_snapshot(org_id) for org_id in target_org_ids],
            target_personnel_ids=target_personnel_ids,
            target_personnel_snapshots=[
                auth_store.user_snapshot(user_id) for user_id in target_personnel_ids
            ],
            leader_user_id=leader_user_id,
            leader_snapshot=auth_store.user_snapshot(leader_user_id),
            team_member_user_ids=team_member_user_ids,
            team_member_snapshots=[
                auth_store.user_snapshot(user_id) for user_id in team_member_user_ids
            ],
            planned_start_date=payload["plannedStartDate"],
            planned_end_date=payload["plannedEndDate"],
            status="DRAFT",
            phase="PLAN_DRAFT",
            phase_progress=0,
            files=self._normalize_plan_attachments(payload.get("files", []), user, auth_store),
            ekp_flow={"status": "not_started", "events": []},
            created_by=user.user_id,
            created_by_snapshot=auth_store.user_snapshot(user.user_id),
            updated_by=user.user_id,
            updated_by_snapshot=auth_store.user_snapshot(user.user_id),
        )
        self.plans[plan_id] = plan
        return self.plan_view(plan, auth_store)

    def update_plan(
        self,
        *,
        inspection_plan_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        self._require_hq_inspection(user, auth_store)
        plan = self._get_plan(inspection_plan_id)
        editable_phase = plan.phase in {"PLAN_DRAFT", "PLAN_SUBMITTED"}
        if plan.status not in EDITABLE_STATUSES or not editable_phase:
            raise AppError(
                code="PLAN_NOT_EDITABLE",
                message="Inspection plan is not editable",
                status_code=409,
            )
        start = payload.get("plannedStartDate", plan.planned_start_date)
        end = payload.get("plannedEndDate", plan.planned_end_date)
        self._validate_date_range(start, end)
        canonical_payload = dict(payload)
        if canonical_payload.get("type") is not None:
            canonical_payload["type"] = str(canonical_payload["type"]).strip()
        if canonical_payload.get("frequency") is not None:
            canonical_payload["frequency"] = str(canonical_payload["frequency"]).strip()
        if canonical_payload.get("confidentialityLevel") is not None:
            canonical_payload["confidentialityLevel"] = str(
                canonical_payload["confidentialityLevel"]
            ).strip()
        validate_codes(
            (canonical_payload.get("type"), "inspection_plan_type", "type"),
            (canonical_payload.get("frequency"), "inspection_plan_frequency", "frequency"),
            (
                canonical_payload.get("confidentialityLevel"),
                INSPECTION_CONFIDENTIALITY_LEVEL_CATEGORY,
                "confidentialityLevel",
            ),
        )
        if (
            "inspectCode" in canonical_payload
            and canonical_payload["inspectCode"] != plan.inspect_code
        ):
            if any(
                item.inspect_code == canonical_payload["inspectCode"]
                for item in self.plans.values()
            ):
                raise AppError(
                    code="DUPLICATE_PLAN_CODE",
                    message="Inspection plan code already exists",
                    status_code=409,
                )
            plan.inspect_code = canonical_payload["inspectCode"]
        if "targetOrgIds" in canonical_payload or "targetDept" in canonical_payload:
            target_org_ids, target_dept_label = self._resolve_targets(canonical_payload, auth_store)
            plan.target_org_ids = target_org_ids
            plan.target_dept_label = target_dept_label
            plan.target_org_snapshots = [
                auth_store.org_snapshot(org_id) for org_id in target_org_ids
            ]
        if "targetPersonnelIds" in canonical_payload:
            target_personnel_ids = self._resolve_personnel_targets(canonical_payload, auth_store)
            plan.target_personnel_ids = target_personnel_ids
            plan.target_personnel_snapshots = [
                auth_store.user_snapshot(user_id) for user_id in target_personnel_ids
            ]
        for source_key, attr in (
            ("title", "title"),
            ("type", "type"),
            ("frequency", "frequency"),
            ("confidentialityLevel", "confidentiality_level"),
            ("leaderUserId", "leader_user_id"),
            ("plannedStartDate", "planned_start_date"),
            ("plannedEndDate", "planned_end_date"),
        ):
            if source_key in canonical_payload:
                setattr(plan, attr, canonical_payload[source_key])
                if source_key == "leaderUserId":
                    plan.leader_snapshot = auth_store.user_snapshot(canonical_payload[source_key])
        if "teamMemberUserIds" in canonical_payload:
            plan.team_member_user_ids = list(canonical_payload["teamMemberUserIds"])
            plan.team_member_snapshots = [
                auth_store.user_snapshot(user_id) for user_id in plan.team_member_user_ids
            ]
        if "files" in canonical_payload:
            plan.files = self._normalize_plan_attachments(
                canonical_payload["files"],
                user,
                auth_store,
            )
        plan.updated_by = user.user_id
        plan.updated_by_snapshot = auth_store.user_snapshot(user.user_id)
        plan.updated_at = relative_datetime_iso()
        return self.plan_view(plan, auth_store)

    def transition_plan(
        self,
        *,
        inspection_plan_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        action: str,
        reason: str | None = None,
        comment: str | None = None,
        idempotency_key: str | None = None,
        optimistic_version: int | None = None,
        request_id: str | None = None,
    ) -> dict[str, Any]:
        self._require_hq_inspection(user, auth_store)
        plan = self._get_plan(inspection_plan_id)
        validate_code(action, category="inspection_transition_action", field="action")
        if action == ENTER_REPORT_PREPARATION_ACTION:
            return self._enter_report_preparation(
                plan=plan,
                user=user,
                auth_store=auth_store,
                comment=comment,
                idempotency_key=idempotency_key,
                optimistic_version=optimistic_version,
                request_id=request_id,
            )
        if action == "terminate" and not (reason or "").strip():
            raise AppError(
                code="TERMINATE_REASON_REQUIRED",
                message="Terminate reason is required",
                status_code=422,
            )
        if action == "submit_approval" and (
            not plan.target_org_ids
            or not plan.leader_user_id
            or not plan.planned_start_date
            or not plan.planned_end_date
        ):
            raise AppError(
                code="INVALID_TRANSITION",
                message="Inspection plan is not ready for approval submission",
                status_code=409,
            )
        transition = self._transition_for(plan, action)
        if transition is None:
            raise AppError(
                code="INVALID_TRANSITION",
                message="Lifecycle transition is not allowed",
                status_code=409,
            )
        before = {"status": plan.status, "phase": plan.phase}
        if action == "suspend":
            plan.previous_status = plan.status
            plan.previous_phase = plan.phase
        plan.status = transition["status"]
        plan.phase = transition["phase"]
        plan.phase_progress = transition["phaseProgress"]
        if action == "resume":
            plan.status = plan.previous_status or "IN_PROGRESS"
            plan.phase = plan.previous_phase or "EVIDENCE_COLLECTING"
            plan.phase_progress = self._progress_for_phase(plan.phase)
            plan.previous_status = None
            plan.previous_phase = None
        plan.version += 1
        plan.updated_by = user.user_id
        plan.updated_by_snapshot = auth_store.user_snapshot(user.user_id)
        plan.updated_at = relative_datetime_iso()
        self._record_event(plan, user, auth_store, action, before, reason, comment)
        side_effects: dict[str, list[str]] = {
            "createdTaskIds": [],
            "closedTaskIds": [],
            "notificationIds": [],
        }
        if action == "submit_approval":
            side_effects["createdTaskIds"] = self._create_approval_task(
                plan,
                user,
                auth_store,
            )
        elif action == "approve":
            created_task_ids = self._create_branch_notice_tasks(
                plan,
                user,
                auth_store,
            )
            side_effects["notificationIds"] = self._create_branch_notice_notifications(
                plan,
                user,
                auth_store,
            )
            for task_id in self._ensure_evidence_requirements(plan, user, auth_store):
                if task_id not in created_task_ids:
                    created_task_ids.append(task_id)
            side_effects["createdTaskIds"] = created_task_ids
        result = self.plan_view(plan, auth_store)
        result["sideEffects"] = side_effects
        return result

    def acknowledge_plan(
        self,
        *,
        inspection_plan_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        plan = self._get_plan(inspection_plan_id)
        if not self._can_read_plan(plan, user, auth_store):
            raise ForbiddenError()
        if not self._can_acknowledge_plan(plan, user, auth_store):
            raise ForbiddenError()
        acknowledgement_phases = {
            "PLAN_APPROVED",
            "PLAN_SUBMITTED",
            "EVIDENCE_COLLECTING",
            "REPORTING",
            "FACT_CONFIRMATION",
            "ADJUDICATION",
            "EXECUTION_IN_PROGRESS",
            "RECTIFICATION",
            "CLOSED",
        }
        if plan.phase not in acknowledgement_phases:
            raise AppError(
                code="INVALID_STATE",
                message="Inspection plan is not ready for acknowledgement",
                status_code=409,
                details={
                    "currentStatus": plan.status,
                    "currentPhase": plan.phase,
                },
            )
        target_org_id = self._resolve_ack_target_org(plan, user, auth_store)
        ack_id = f"ACK-{plan.inspection_plan_id}-{target_org_id}"
        now = relative_datetime_iso()
        ack = InspectionPlanAcknowledgementRecord(
            acknowledgement_id=ack_id,
            inspection_plan_id=plan.inspection_plan_id,
            target_org_id=target_org_id,
            ack_status="ACKNOWLEDGED",
            acknowledged_by=user.user_id,
            acknowledged_at=now,
            liaison_name=payload.get("liaisonName") or None,
            liaison_phone=payload.get("liaisonPhone") or None,
            liaison_title=payload.get("liaisonTitle") or None,
            created_by_snapshot=auth_store.user_snapshot(user.user_id),
        )
        self.acknowledgements[ack_id] = ack
        # Close the corresponding branch notice task
        closed_task_id = self._close_branch_notice_task(plan, target_org_id)
        result = self._acknowledgement_view(ack, auth_store)
        result["sideEffects"] = {
            "closedTaskIds": [closed_task_id] if closed_task_id else [],
        }
        return result

    def plan_detail(
        self,
        *,
        inspection_plan_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        plan = self._get_plan(inspection_plan_id)
        if not self._can_read_plan(plan, user, auth_store):
            raise ForbiddenError()
        return self.plan_view(plan, auth_store)

    def plan_view(self, plan: InspectionPlanRecord, auth_store: SeedAuthStore) -> dict[str, Any]:
        leader_snapshot = plan.leader_snapshot or auth_store.user_snapshot(plan.leader_user_id)
        target_org_snapshots = plan.target_org_snapshots or [
            auth_store.org_snapshot(org_id) for org_id in plan.target_org_ids
        ]
        team_member_snapshots = plan.team_member_snapshots or [
            auth_store.user_snapshot(user_id) for user_id in plan.team_member_user_ids
        ]
        team_members = [item.get("displayName", "") for item in team_member_snapshots]
        report_readiness = self._report_readiness_summary(plan, auth_store)
        return {
            "inspectionPlanId": plan.inspection_plan_id,
            "id": plan.inspection_plan_id,
            "inspectCode": plan.inspect_code,
            "title": plan.title,
            "type": plan.type,
            "frequency": plan.frequency,
            "confidentialityLevel": plan.confidentiality_level,
            "confidentialityLabel": self._confidentiality_label(plan.confidentiality_level),
            "targetOrgIds": plan.target_org_ids,
            "targetOrgSnapshots": target_org_snapshots,
            "targetPersonnelIds": plan.target_personnel_ids,
            "targetPersonnelSnapshots": plan.target_personnel_snapshots or [
                auth_store.user_snapshot(user_id) for user_id in plan.target_personnel_ids
            ],
            "targetDeptLabel": plan.target_dept_label,
            "targetDept": plan.target_dept_label,
            "leaderUserId": plan.leader_user_id,
            "leaderName": leader_snapshot.get("displayName", ""),
            "leader": leader_snapshot.get("displayName", ""),
            "leaderSnapshot": leader_snapshot,
            "teamMemberUserIds": plan.team_member_user_ids,
            "teamMemberNames": team_members,
            "teamMembers": team_members,
            "teamMemberSnapshots": team_member_snapshots,
            "plannedStartDate": plan.planned_start_date,
            "plannedEndDate": plan.planned_end_date,
            "status": plan.status,
            "phase": plan.phase,
            "currentPhase": plan.phase,
            "phaseProgress": plan.phase_progress,
            "files": self._plan_files_view(plan.files),
            "ekpFlow": self._build_ekp_flow_view(plan, auth_store),
            "publicPath": f"/compliance/hq/inspection/plans/{plan.inspection_plan_id}",
            "createdBy": plan.created_by,
            "createdBySnapshot": plan.created_by_snapshot
            or auth_store.user_snapshot(plan.created_by),
            "createdAt": plan.created_at,
            "updatedBy": plan.updated_by,
            "updatedBySnapshot": plan.updated_by_snapshot
            or auth_store.user_snapshot(plan.updated_by),
            "updatedAt": plan.updated_at,
            "version": plan.version,
            "optimisticVersion": plan.version,
            "allowedActions": allowed_inspection_actions(
                status=plan.status,
                phase=plan.phase,
                phase_progress=plan.phase_progress,
                previous_status=plan.previous_status,
                previous_phase=plan.previous_phase,
            ),
            "reportReadiness": report_readiness,
            "targetAcknowledgements": self._acknowledgements_view(plan, auth_store),
        }

    def _normalize_plan_attachments(
        self,
        raw_files: list[dict[str, Any]] | None,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> list[dict[str, Any]]:
        if not raw_files:
            return []
        if not isinstance(raw_files, list):
            raise AppError(
                code="INVALID_PLAN_ATTACHMENT",
                message="Inspection plan attachments must be a list",
                status_code=422,
            )

        seen_types: set[str] = set()
        requested_file_ids: list[str] = []
        requested: list[tuple[str, str]] = []
        for item in raw_files:
            attachment_type = str(item.get("attachmentType", "")).strip()
            file_id = str(item.get("fileId", "")).strip()
            if attachment_type not in PLAN_ATTACHMENT_TYPES:
                raise AppError(
                    code="INVALID_PLAN_ATTACHMENT_TYPE",
                    message="Inspection plan attachment type is not allowed",
                    status_code=422,
                    details={
                        "attachmentType": attachment_type,
                        "allowed": sorted(PLAN_ATTACHMENT_TYPES),
                    },
                )
            if attachment_type in seen_types:
                raise AppError(
                    code="DUPLICATE_PLAN_ATTACHMENT_TYPE",
                    message="Each inspection plan attachment type can be bound once",
                    status_code=422,
                    details={"attachmentType": attachment_type},
                )
            if not file_id:
                raise AppError(
                    code="INVALID_PLAN_ATTACHMENT_FILE",
                    message="Inspection plan attachment requires a fileId",
                    status_code=422,
                    details={"attachmentType": attachment_type},
                )
            seen_types.add(attachment_type)
            requested_file_ids.append(file_id)
            requested.append((attachment_type, file_id))

        from app.modules.compliance.domain.evidence_store import evidence_store

        assets = evidence_store.require_file_assets_for_user(
            file_ids=requested_file_ids,
            user=user,
            auth_store=auth_store,
        )
        assets_by_id = {asset.file_id: asset for asset in assets}
        borrowed_file_ids = [
            file_id
            for _, file_id in requested
            if assets_by_id[file_id].uploaded_by != user.user_id
        ]
        if borrowed_file_ids:
            raise AppError(
                code="FILE_ASSET_NOT_FOUND",
                message="File asset not found",
                status_code=404,
                details={"fileIds": borrowed_file_ids},
            )

        bound_at = relative_datetime_iso()
        return [
            {
                "attachmentType": attachment_type,
                "attachmentKey": PLAN_ATTACHMENT_TYPES[attachment_type]["key"],
                "attachmentLabel": PLAN_ATTACHMENT_TYPES[attachment_type]["label"],
                "required": PLAN_ATTACHMENT_TYPES[attachment_type]["required"],
                "bindingTargetType": PLAN_ATTACHMENT_TYPES[attachment_type][
                    "bindingTargetType"
                ],
                "businessStage": PLAN_ATTACHMENT_TYPES[attachment_type]["businessStage"],
                "maintenance": PLAN_ATTACHMENT_TYPES[attachment_type]["maintenance"],
                "allowedMimeTypes": PLAN_ATTACHMENT_TYPES[attachment_type][
                    "allowedMimeTypes"
                ],
                "allowedExtensions": PLAN_ATTACHMENT_TYPES[attachment_type][
                    "allowedExtensions"
                ],
                "maxFileSizeBytes": PLAN_ATTACHMENT_TYPES[attachment_type][
                    "maxFileSizeBytes"
                ],
                "fileId": assets_by_id[file_id].file_id,
                "fileName": assets_by_id[file_id].file_name,
                "contentType": assets_by_id[file_id].content_type,
                "fileSize": assets_by_id[file_id].file_size,
                "checksum": assets_by_id[file_id].checksum,
                "scanStatus": assets_by_id[file_id].scan_status,
                "uploadedBy": assets_by_id[file_id].uploaded_by,
                "uploadedAt": assets_by_id[file_id].uploaded_at,
                "boundBy": user.user_id,
                "boundAt": bound_at,
            }
            for attachment_type, file_id in requested
        ]

    @staticmethod
    def _plan_files_view(files: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [deepcopy(item) for item in files]

    @staticmethod
    def _confidentiality_label(value: str | None) -> str | None:
        if not value:
            return None
        entry = next(
            (
                item
                for item in DICTIONARIES[INSPECTION_CONFIDENTIALITY_LEVEL_CATEGORY]
                if item.code == value
            ),
            None,
        )
        return entry.label if entry else None

    def _transition_for(self, plan: InspectionPlanRecord, action: str) -> dict[str, Any] | None:
        return inspection_transition_for(
            status=plan.status,
            phase=plan.phase,
            action=action,
            phase_progress=plan.phase_progress,
            previous_status=plan.previous_status,
            previous_phase=plan.previous_phase,
        )

    def _enter_report_preparation(
        self,
        *,
        plan: InspectionPlanRecord,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        comment: str | None,
        idempotency_key: str | None,
        optimistic_version: int | None,
        request_id: str | None,
    ) -> dict[str, Any]:
        command_key = self._require_transition_idempotency_key(idempotency_key)
        payload_hash = self._transition_payload_hash(
            action=ENTER_REPORT_PREPARATION_ACTION,
            comment=comment,
            optimistic_version=optimistic_version,
        )
        replay = self._transition_command_replay(
            inspection_plan_id=plan.inspection_plan_id,
            action=ENTER_REPORT_PREPARATION_ACTION,
            actor_user_id=user.user_id,
            idempotency_key=command_key,
            payload_hash=payload_hash,
        )
        if replay:
            return self._idempotent_replay_result(replay.result_snapshot)

        if optimistic_version is not None and optimistic_version != plan.version:
            raise AppError(
                code="VERSION_CONFLICT",
                message="Inspection plan version has changed",
                status_code=409,
                details={
                    "field": "optimisticVersion",
                    "expectedVersion": plan.version,
                    "receivedVersion": optimistic_version,
                },
            )

        readiness = self._report_readiness_summary(plan, auth_store)
        self._assert_report_readiness_clean(readiness)
        before = {"status": plan.status, "phase": plan.phase, "version": plan.version}

        already_in_target = plan.status == "IN_PROGRESS" and plan.phase == "REPORTING"
        transition = None if already_in_target else self._transition_for(
            plan,
            ENTER_REPORT_PREPARATION_ACTION,
        )
        if transition is None and not already_in_target:
            raise AppError(
                code="INVALID_STATE",
                message="Inspection plan is not ready to enter report preparation",
                status_code=409,
                details={
                    "currentStatus": plan.status,
                    "currentPhase": plan.phase,
                    "allowedActions": allowed_inspection_actions(
                        status=plan.status,
                        phase=plan.phase,
                        phase_progress=plan.phase_progress,
                        previous_status=plan.previous_status,
                        previous_phase=plan.previous_phase,
                    ),
                },
            )

        internal_transition_id = (
            self._internal_report_transition_id(before["phase"])
            if not already_in_target
            else "TR-INSP-REPORTING-ALREADY-OPEN"
        )
        closed_task_ids: list[str] = []
        created_task_ids: list[str] = []
        notification_ids: list[str] = []
        audit_event_ids: list[str] = []
        integration_event_id: str | None = None

        if not already_in_target and transition is not None:
            plan.status = transition["status"]
            plan.phase = transition["phase"]
            plan.phase_progress = transition["phaseProgress"]
            plan.version += 1
            plan.updated_by = user.user_id
            plan.updated_by_snapshot = auth_store.user_snapshot(user.user_id)
            plan.updated_at = relative_datetime_iso()
            closed_task_ids = self._close_report_predecessor_tasks(plan)
            created_task_ids = self._ensure_report_preparation_task(plan, auth_store)
            notification_ids = self._ensure_report_preparation_notification(plan, auth_store)
            audit_event_ids = self._record_report_transition_audit(
                plan=plan,
                user=user,
                auth_store=auth_store,
                request_id=request_id,
                idempotency_key=command_key,
                payload_hash=payload_hash,
                internal_transition_id=internal_transition_id,
                before=before,
                closed_task_ids=closed_task_ids,
                created_task_ids=created_task_ids,
                notification_ids=notification_ids,
                readiness=readiness,
            )
            integration_event_id = self._record_event(
                plan,
                user,
                auth_store,
                ENTER_REPORT_PREPARATION_ACTION,
                {"status": str(before["status"]), "phase": str(before["phase"])},
                None,
                comment,
                details={
                    "requestId": request_id,
                    "idempotencyKey": command_key,
                    "payloadHash": payload_hash,
                    "internalTransitionId": internal_transition_id,
                    "readiness": readiness,
                    "closedTaskIds": closed_task_ids,
                    "createdTaskIds": created_task_ids,
                    "notificationIds": notification_ids,
                    "auditEventIds": audit_event_ids,
                },
            )

        result = self._report_preparation_result(
            plan=plan,
            user=user,
            auth_store=auth_store,
            action=ENTER_REPORT_PREPARATION_ACTION,
            internal_transition_id=internal_transition_id,
            before=before,
            readiness=readiness,
            side_effects={
                "closedTaskIds": closed_task_ids,
                "createdTaskIds": created_task_ids,
                "notificationIds": notification_ids,
                "auditEventIds": audit_event_ids,
                "integrationEventId": integration_event_id,
            },
            already_in_target_state=already_in_target,
        )
        self._remember_transition_command(
            inspection_plan_id=plan.inspection_plan_id,
            action=ENTER_REPORT_PREPARATION_ACTION,
            actor_user_id=user.user_id,
            idempotency_key=command_key,
            payload_hash=payload_hash,
            result_snapshot=result,
        )
        return result

    @staticmethod
    def _require_transition_idempotency_key(value: str | None) -> str:
        if value is None or not str(value).strip():
            raise AppError(
                code="IDEMPOTENCY_KEY_REQUIRED",
                message="idempotencyKey is required for public report transition",
                status_code=422,
                details={"field": "idempotencyKey"},
            )
        return str(value).strip()

    @staticmethod
    def _transition_payload_hash(
        *,
        action: str,
        comment: str | None,
        optimistic_version: int | None,
    ) -> str:
        payload = {
            "action": action,
            "comment": comment or "",
            "optimisticVersion": optimistic_version,
        }
        raw = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    def _transition_command_replay(
        self,
        *,
        inspection_plan_id: str,
        action: str,
        actor_user_id: str,
        idempotency_key: str,
        payload_hash: str,
    ) -> InspectionPlanTransitionCommandRecord | None:
        record = self.transition_command_keys.get(
            (inspection_plan_id, action, actor_user_id, idempotency_key)
        )
        if not record:
            return None
        if record.payload_hash != payload_hash:
            raise AppError(
                code="IDEMPOTENCY_KEY_CONFLICT",
                message="idempotencyKey was already used with a different plan transition payload",
                status_code=409,
                details={
                    "action": action,
                    "idempotencyKey": idempotency_key,
                    "existingPayloadHash": record.payload_hash,
                    "incomingPayloadHash": payload_hash,
                },
            )
        return record

    def _remember_transition_command(
        self,
        *,
        inspection_plan_id: str,
        action: str,
        actor_user_id: str,
        idempotency_key: str,
        payload_hash: str,
        result_snapshot: dict[str, Any],
    ) -> None:
        key = (inspection_plan_id, action, actor_user_id, idempotency_key)
        self.transition_command_keys[key] = InspectionPlanTransitionCommandRecord(
            command_key_id=f"IPTCK-{len(self.transition_command_keys) + 1:05d}",
            inspection_plan_id=inspection_plan_id,
            action=action,
            actor_user_id=actor_user_id,
            idempotency_key=idempotency_key,
            payload_hash=payload_hash,
            result_snapshot=deepcopy(result_snapshot),
            created_at=relative_datetime_iso(),
        )

    @staticmethod
    def _idempotent_replay_result(result: dict[str, Any]) -> dict[str, Any]:
        replay = deepcopy(result)
        replay["idempotentReplay"] = True
        replay.setdefault("transition", {})["idempotentReplay"] = True
        if isinstance(replay.get("workspace"), dict):
            replay["workspace"]["idempotentReplay"] = True
        return replay

    def _report_preparation_result(
        self,
        *,
        plan: InspectionPlanRecord,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        action: str,
        internal_transition_id: str,
        before: dict[str, Any],
        readiness: dict[str, Any],
        side_effects: dict[str, Any],
        already_in_target_state: bool,
    ) -> dict[str, Any]:
        from app.modules.compliance.domain.inspection_report_store import inspection_report_store

        plan_view = self.plan_view(plan, auth_store)
        workspace = inspection_report_store.workspace_view(
            plan=plan,
            user=user,
            auth_store=auth_store,
        )
        return {
            **plan_view,
            "transition": {
                "action": action,
                "internalTransitionId": internal_transition_id,
                "from": before,
                "to": {"status": plan.status, "phase": plan.phase, "version": plan.version},
                "readiness": readiness,
                "alreadyInTargetState": already_in_target_state,
                "idempotentReplay": False,
            },
            "workspace": workspace,
            "sideEffects": side_effects,
            "alreadyInTargetState": already_in_target_state,
            "idempotentReplay": False,
        }

    def _report_readiness_summary(
        self,
        plan: InspectionPlanRecord,
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        from app.modules.compliance.domain.inspection_report_store import inspection_report_store

        readiness = inspection_report_store._readiness(plan, auth_store)
        return {
            "score": readiness["score"],
            "factConfirmed": readiness["factConfirmed"],
            "appealsResolved": readiness["appealsResolved"],
            "blockers": list(readiness["blockers"]),
            "blockingCodes": sorted(readiness["blockingCodes"]),
        }

    @staticmethod
    def _assert_report_readiness_clean(readiness: dict[str, Any]) -> None:
        codes = set(readiness["blockingCodes"])
        if "APPEALS_NOT_DECIDED" in codes:
            raise AppError(
                code="APPEALS_NOT_DECIDED",
                message="Some appeals are still pending adjudication",
                status_code=409,
                details={"blockers": readiness["blockers"]},
            )
        if "REPORT_BLOCKED" in codes:
            raise AppError(
                code="REPORT_BLOCKED",
                message="Some target organizations still have pending fact confirmation",
                status_code=409,
                details={"blockers": readiness["blockers"]},
            )

    @staticmethod
    def _internal_report_transition_id(phase: str) -> str:
        if phase == "FACT_CONFIRMATION":
            return "TR-INSP-ALL-FACTS-CONFIRMED"
        if phase == "ADJUDICATION":
            return "TR-INSP-ADJUDICATION-DONE"
        return "TR-INSP-REPORTING-UNKNOWN"

    def _close_report_predecessor_tasks(self, plan: InspectionPlanRecord) -> list[str]:
        closed_task_ids: list[str] = []
        predecessor_actions = {
            "FACT_CONFIRMATION",
            "FACT_CONFIRMATION_REVIEW",
            "ADJUDICATION_DECISION",
            "ADJUDICATION_REVIEW",
        }
        for task in task_store.tasks.values():
            if task.status == "DONE":
                continue
            if (
                task.project_id != plan.inspection_plan_id
                and task.source_id != plan.inspection_plan_id
            ):
                continue
            target_action = task.action_target.action
            if target_action not in predecessor_actions:
                continue
            task.status = "DONE"
            closed_task_ids.append(task.task_id)
        return closed_task_ids

    def _ensure_report_preparation_task(
        self,
        plan: InspectionPlanRecord,
        auth_store: SeedAuthStore,
    ) -> list[str]:
        task_id = self._side_effect_id("TASK-HQ-REPORT-PREP", plan.inspection_plan_id)
        if task_id in task_store.tasks:
            return []
        target_path = f"/compliance/hq/inspection/plans/{plan.inspection_plan_id}?tab=report"
        task_store.upsert_task(
            UnifiedTaskRecord(
                task_id=task_id,
                category="INSPECTION",
                action_type="REVIEW",
                title=f"进入报告编制：{plan.title}",
                description="检查事实和申辩已满足报告编制前置条件，请准备检查报告。",
                priority="HIGH",
                due_date=relative_date_iso(7),
                status="PENDING",
                source_id=plan.inspection_plan_id,
                scope="hq",
                scoped_org_id="WLZQ-HQ-COMPLIANCE",
                reviewer_role_ids=[
                    "ROLE_COMPLIANCE_DIRECTOR",
                    "ROLE_COMPLIANCE_MANAGER",
                    "ROLE_INSPECTION_LEAD",
                ],
                project_id=plan.inspection_plan_id,
                created_at=relative_datetime_iso(hour=10, minute=10),
                action_target=UnifiedTaskActionTargetRecord(
                    kind="route",
                    menu_id="hq-plans",
                    app_path=f"/hq/inspection/plans/{plan.inspection_plan_id}?tab=report",
                    public_path=target_path,
                    params={"inspectionPlanId": plan.inspection_plan_id, "tab": "report"},
                    action="ENTER_REPORT_PREPARATION",
                ),
            )
        )
        auth_store.org_snapshot("WLZQ-HQ-COMPLIANCE")
        return [task_id]

    def _ensure_report_preparation_notification(
        self,
        plan: InspectionPlanRecord,
        auth_store: SeedAuthStore,
    ) -> list[str]:
        notification_id = self._side_effect_id("NOTIF-HQ-REPORT-PREP", plan.inspection_plan_id)
        if notification_id in notification_store.messages:
            return []
        recipients = [
            user_id
            for user_id in [plan.leader_user_id, *plan.team_member_user_ids]
            if user_id in auth_store.users
        ]
        if not recipients:
            return []
        notification_store.create_in_app_notification(
            notification_id=notification_id,
            recipient_user_ids=recipients,
            auth_store=auth_store,
            source_module="INSPECTION",
            type="INSPECTION",
            severity="INFO",
            title="检查计划已进入报告编制",
            content=f"{plan.title} 已进入报告编制阶段，请处理报告编制待办。",
            created_by="SYSTEM",
            source_entity_type="InspectionPlan",
            source_entity_id=plan.inspection_plan_id,
            action_target={
                "kind": "route",
                "menuId": "hq-plans",
                "appPath": f"/hq/inspection/plans/{plan.inspection_plan_id}?tab=report",
                "publicPath": (
                    f"/compliance/hq/inspection/plans/{plan.inspection_plan_id}?tab=report"
                ),
                "params": {"inspectionPlanId": plan.inspection_plan_id, "tab": "report"},
                "action": "ENTER_REPORT_PREPARATION",
            },
        )
        return [notification_id]

    def _record_report_transition_audit(
        self,
        *,
        plan: InspectionPlanRecord,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        request_id: str | None,
        idempotency_key: str,
        payload_hash: str,
        internal_transition_id: str,
        before: dict[str, Any],
        closed_task_ids: list[str],
        created_task_ids: list[str],
        notification_ids: list[str],
        readiness: dict[str, Any],
    ) -> list[str]:
        from app.modules.compliance.domain.inspection_report_store import inspection_report_store

        event = inspection_report_store._append_audit(
            inspection_plan_id=plan.inspection_plan_id,
            report_version_id=None,
            action="ENTER_REPORT_PREPARATION",
            user=user,
            auth_store=auth_store,
            request_id=request_id,
            idempotency_key=idempotency_key,
            payload_hash=payload_hash,
            from_status=f"{before['status']}/{before['phase']}",
            to_status=f"{plan.status}/{plan.phase}",
            details={
                "internalTransitionId": internal_transition_id,
                "readiness": readiness,
                "closedTaskIds": closed_task_ids,
                "createdTaskIds": created_task_ids,
                "notificationIds": notification_ids,
            },
        )
        return [event.report_audit_event_id]

    @staticmethod
    def _side_effect_id(prefix: str, source_id: str) -> str:
        suffix = source_id.replace("INSP-PLAN-", "").replace("_", "-")
        return f"{prefix}-{suffix}"

    def _record_event(
        self,
        plan: InspectionPlanRecord,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        action: str,
        before: dict[str, str],
        reason: str | None,
        comment: str | None,
        details: dict[str, Any] | None = None,
    ) -> str:
        event_id = f"EVT-INSP-PLAN-{len(self.events) + 1:04d}"
        event = IntegrationEventRecord(
            integration_event_id=event_id,
            type="INSPECTION_PLAN_TRANSITION",
            target_type="InspectionPlan",
            target_id=plan.inspection_plan_id,
            payload={
                "action": action,
                "before": before,
                "after": {"status": plan.status, "phase": plan.phase},
                "reason": reason,
                "comment": comment,
                "details": details or {},
            },
            status="RECORDED",
            created_by=user.user_id,
            created_by_snapshot=auth_store.user_snapshot(user.user_id),
            created_at=relative_datetime_iso(),
        )
        self.events[event_id] = event
        plan.ekp_flow = {
            "status": "recorded",
            "latestEventId": event_id,
            "events": [
                *plan.ekp_flow.get("events", []),
                {
                    "integrationEventId": event.integration_event_id,
                    "type": event.type,
                    "action": action,
                    "status": event.status,
                    "createdBy": user.user_id,
                    "createdBySnapshot": event.created_by_snapshot,
                    "createdAt": event.created_at,
                },
            ],
        }
        return event_id

    def _resolve_targets(
        self,
        payload: dict[str, Any],
        auth_store: SeedAuthStore,
    ) -> tuple[list[str], str]:
        raw_org_ids = payload.get("targetOrgIds") or []
        if isinstance(raw_org_ids, str):
            raw_org_ids = [raw_org_ids]
        target_org_ids = [org_id for org_id in raw_org_ids if org_id in auth_store.orgs]
        self._validate_target_org_levels(target_org_ids, auth_store)
        target_dept = (payload.get("targetDept") or payload.get("targetDeptLabel") or "").strip()
        if not target_org_ids and target_dept:
            exact = next(
                (
                    org
                    for org in auth_store.orgs.values()
                    if org.org_name == target_dept or org.org_id == target_dept
                ),
                None,
            )
            if exact:
                target_org_ids = [exact.org_id]
                self._validate_target_org_levels(target_org_ids, auth_store)
        labels = [
            auth_store.orgs[org_id].org_name
            for org_id in target_org_ids
            if org_id in auth_store.orgs
        ]
        return target_org_ids, "、".join(labels) if labels else target_dept

    @staticmethod
    def _resolve_personnel_targets(
        payload: dict[str, Any],
        auth_store: SeedAuthStore,
    ) -> list[str]:
        raw_ids = payload.get("targetPersonnelIds") or []
        if isinstance(raw_ids, str):
            raw_ids = [raw_ids]
        return [
            user_id for user_id in raw_ids
            if user_id in auth_store.personnel
        ]

    @staticmethod
    def _validate_target_org_levels(
        target_org_ids: list[str],
        auth_store: SeedAuthStore,
    ) -> None:
        invalid = [
            {
                "orgId": org_id,
                "orgLevel": auth_store.orgs[org_id].org_level,
            }
            for org_id in target_org_ids
            if auth_store.orgs[org_id].org_level not in INSPECTION_TARGET_ORG_LEVELS
        ]
        if invalid:
            raise AppError(
                code="INVALID_TARGET_ORG_LEVEL",
                message="Inspection target must be a branch company or branch office",
                status_code=422,
                details={"invalidTargets": invalid},
            )

    def _create_approval_task(
        self,
        plan: InspectionPlanRecord,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> list[str]:
        task_id = f"TASK-HQ-APPROVAL-{plan.inspection_plan_id}"
        task_store.upsert_task(
            UnifiedTaskRecord(
                task_id=task_id,
                category="INSPECTION",
                action_type="APPROVE",
                title=f"审批检查计划：{plan.title}",
                description=(
                    f"检查计划 {plan.inspect_code or plan.inspection_plan_id} "
                    "已提交审批，请尽快处理。"
                ),
                priority="HIGH",
                due_date=relative_date_iso(3),
                status="PENDING",
                source_id=plan.inspection_plan_id,
                scope="hq",
                scoped_org_id="WLZQ-HQ-COMPLIANCE",
                reviewer_role_ids=[
                    "ROLE_COMPLIANCE_DIRECTOR",
                    "ROLE_COMPLIANCE_MANAGER",
                ],
                project_id=plan.inspection_plan_id,
                created_at=relative_datetime_iso(),
                action_target=UnifiedTaskActionTargetRecord(
                    kind="route",
                    menu_id="hq-plans",
                    app_path=f"/hq/inspection/plans/{plan.inspection_plan_id}",
                    public_path=f"/compliance/hq/inspection/plans/{plan.inspection_plan_id}",
                    params={"inspectionPlanId": plan.inspection_plan_id},
                    action="INSPECTION_PLAN_OPEN",
                ),
            ),
        )
        return [task_id]

    def _create_branch_notice_tasks(
        self,
        plan: InspectionPlanRecord,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> list[str]:
        task_ids: list[str] = []
        for org_id in plan.target_org_ids:
            task_id = f"TASK-BR-NOTICE-{plan.inspection_plan_id}-{org_id}"
            task_ids.append(task_id)
            task_store.upsert_task(
                UnifiedTaskRecord(
                    task_id=task_id,
                    category="INSPECTION",
                    action_type="REVIEW",
                    title=f"检查通知：{plan.title}",
                    description=(
                        f"总部已批准检查计划 {plan.inspect_code or plan.inspection_plan_id}，"
                        "请查阅并确认接收。"
                    ),
                    priority="HIGH",
                    due_date=relative_date_iso(7),
                    status="PENDING",
                    source_id=plan.inspection_plan_id,
                    scope="branch",
                    scoped_org_id=org_id,
                    reviewer_role_ids=["ROLE_BRANCH_COMPLIANCE_OFFICER"],
                    project_id=plan.inspection_plan_id,
                    created_at=relative_datetime_iso(),
                    action_target=UnifiedTaskActionTargetRecord(
                        kind="route",
                        menu_id="branch-tasks",
                        app_path=f"/branch/inspection/plans/{plan.inspection_plan_id}",
                        public_path=f"/compliance/branch/inspection/plans/{plan.inspection_plan_id}",
                        params={"inspectionPlanId": plan.inspection_plan_id},
                        action="INSPECTION_NOTICE_ACKNOWLEDGEMENT",
                    ),
                ),
            )
        return task_ids

    def _create_branch_notice_notifications(
        self,
        plan: InspectionPlanRecord,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> list[str]:
        notification_id = f"NOTIF-BR-APPROVED-{plan.inspection_plan_id}"
        recipient_user_ids = [
            u.user_id
            for u in auth_store.users.values()
            if u.active and "ROLE_BRANCH_COMPLIANCE_OFFICER" in u.role_ids
            and any(auth_store.org_in_scope(u, org_id) for org_id in plan.target_org_ids)
        ]
        if not recipient_user_ids:
            return []
        notification_store.create_in_app_notification(
            notification_id=notification_id,
            recipient_user_ids=recipient_user_ids,
            auth_store=auth_store,
            source_module="INSPECTION",
            type="INSPECTION",
            severity="INFO",
            title=f"检查计划已批准：{plan.title}",
            content=(
                f"总部已批准检查计划 {plan.inspect_code or plan.inspection_plan_id}，"
                f"目标机构包括 {plan.target_dept_label or '、'.join(plan.target_org_ids)}。"
                "请登录系统查阅详情并确认接收。"
            ),
            source_entity_type="InspectionPlan",
            source_entity_id=plan.inspection_plan_id,
            action_target={
                "kind": "route",
                "menuId": "branch-tasks",
                "appPath": f"/branch/inspection/plans/{plan.inspection_plan_id}",
                "publicPath": f"/compliance/branch/inspection/plans/{plan.inspection_plan_id}",
                "params": {"inspectionPlanId": plan.inspection_plan_id},
                "action": "INSPECTION_NOTICE_ACKNOWLEDGEMENT",
            },
            created_by=user.user_id,
        )
        return [notification_id]

    def _ensure_evidence_requirements(
        self,
        plan: InspectionPlanRecord,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> list[str]:
        # 局部导入避免循环依赖（evidence_store 已导入 inspection_plan_store）
        from app.modules.compliance.domain.evidence_store import EvidenceRequirementRecord, evidence_store

        created_task_ids: list[str] = []
        for org_id in plan.target_org_ids:
            req_id = f"REQ-{plan.inspection_plan_id}-{org_id}"
            if req_id not in evidence_store.requirements:
                evidence_store.requirements[req_id] = EvidenceRequirementRecord(
                    requirement_id=req_id,
                    inspection_plan_id=plan.inspection_plan_id,
                    title=f"{plan.title} 材料报送",
                    description=f"请按要求提交 {plan.title} 相关非现场材料。",
                    required_tags=[],
                    due_date=plan.planned_end_date or relative_date_iso(30),
                    target_org_ids=[org_id],
                    target_org_snapshots=[],
                )
            task_id = f"TASK-BR-EVIDENCE-{plan.inspection_plan_id}-{org_id}"
            if task_id not in task_store.tasks:
                task_store.upsert_task(
                    UnifiedTaskRecord(
                        task_id=task_id,
                        category="INSPECTION",
                        action_type="SUBMIT",
                        title=f"提交检查材料：{plan.title}",
                        description="请按要求整理并上传非现场检查材料。",
                        priority="HIGH",
                        due_date=plan.planned_end_date or relative_date_iso(30),
                        status="PENDING",
                        source_id=req_id,
                        scope="branch",
                        scoped_org_id=org_id,
                        reviewer_role_ids=["ROLE_BRANCH_COMPLIANCE_OFFICER"],
                        project_id=plan.inspection_plan_id,
                        created_at=relative_datetime_iso(),
                        action_target=UnifiedTaskActionTargetRecord(
                            kind="route",
                            menu_id="branch-upload",
                            app_path=f"/branch/inspection/materials/{plan.inspection_plan_id}",
                            public_path=f"/compliance/branch/inspection/materials/{plan.inspection_plan_id}",
                            params={
                                "inspectionPlanId": plan.inspection_plan_id,
                                "requirementId": req_id,
                            },
                            action="EVIDENCE_UPLOAD",
                        ),
                    ),
                )
                created_task_ids.append(task_id)
        return created_task_ids

    def _can_read_plan(
        self,
        plan: InspectionPlanRecord,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> bool:
        if auth_store.has_permission(user, "PERM-SYSTEM-ADMIN") or auth_store.has_permission(
            user,
            "PERM-HQ-INSPECTION-MANAGE",
        ):
            return True
        return auth_store.has_permission(user, "PERM-BRANCH-INSPECTION-HANDLE") and (
            any(auth_store.org_in_scope(user, org_id) for org_id in plan.target_org_ids)
        )

    def _require_hq_inspection(self, user: AuthUserRecord, auth_store: SeedAuthStore) -> None:
        if not auth_store.has_permission(user, "PERM-HQ-INSPECTION-MANAGE"):
            raise ForbiddenError()

    def _get_plan(self, inspection_plan_id: str) -> InspectionPlanRecord:
        plan = self.plans.get(inspection_plan_id)
        if not plan:
            raise NotFoundError("Inspection plan not found")
        return plan

    def _can_acknowledge_plan(
        self,
        plan: InspectionPlanRecord,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> bool:
        if not auth_store.has_permission(user, "PERM-BRANCH-INSPECTION-HANDLE"):
            return False
        return any(auth_store.org_in_scope(user, org_id) for org_id in plan.target_org_ids)

    def _resolve_ack_target_org(
        self,
        plan: InspectionPlanRecord,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> str:
        for org_id in plan.target_org_ids:
            if auth_store.org_in_scope(user, org_id):
                return org_id
        raise ForbiddenError()

    def _close_branch_notice_task(
        self,
        plan: InspectionPlanRecord,
        target_org_id: str,
    ) -> str | None:
        task_id = f"TASK-BR-NOTICE-{plan.inspection_plan_id}-{target_org_id}"
        task = task_store.tasks.get(task_id)
        if task and task.status != "DONE":
            task.status = "DONE"
            return task_id
        return task_id if task else None

    def _acknowledgements_view(
        self,
        plan: InspectionPlanRecord,
        auth_store: SeedAuthStore,
    ) -> list[dict[str, Any]]:
        result = []
        for org_id in plan.target_org_ids:
            ack_id = f"ACK-{plan.inspection_plan_id}-{org_id}"
            ack = self.acknowledgements.get(ack_id)
            if ack:
                result.append(self._acknowledgement_view(ack, auth_store))
        return result

    def _build_ekp_flow_view(
        self,
        plan: InspectionPlanRecord,
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        # Approval status derived from plan lifecycle
        if plan.status == "DRAFT" and plan.phase == "PLAN_DRAFT":
            approval_status = "PENDING"
            approval_label = "待提交审批"
        elif plan.status == "APPROVING" and plan.phase == "PLAN_SUBMITTED":
            approval_status = "PENDING"
            approval_label = "审批中"
        elif plan.status in ("IN_PROGRESS", "COMPLETED", "SUSPENDED", "TERMINATED"):
            approval_status = "APPROVED"
            approval_label = "方案已通过 EKP 审批"
        else:
            approval_status = "PENDING"
            approval_label = "审批中"

        # Dispatch status derived from acknowledgements
        acks = self._acknowledgements_view(plan, auth_store)
        total = len(plan.target_org_ids)
        acked_count = len(acks)

        if total == 0:
            dispatch_status = "NOT_SENT"
            dispatch_label = "未下发"
            progress_text = "暂无目标机构"
            pending_count = 0
        elif acked_count == 0:
            dispatch_status = "SENT_PENDING_ACK"
            dispatch_label = "等待响应中"
            progress_text = "通知已下发，等待被检机构签收..."
            pending_count = total
        elif acked_count < total:
            dispatch_status = "PARTIALLY_ACKED"
            dispatch_label = "部分签收"
            progress_text = f"已签收 {acked_count}/{total} 家机构"
            pending_count = total - acked_count
        else:
            dispatch_status = "FULLY_ACKED"
            dispatch_label = "全部签收"
            progress_text = f"全部 {total} 家机构已签收"
            pending_count = 0

        return {
            **plan.ekp_flow,
            "approval": {
                "status": approval_status,
                "label": approval_label,
                "flowId": f"EKP-{plan.inspect_code}",
                "updatedAt": plan.updated_at,
            },
            "dispatch": {
                "status": dispatch_status,
                "label": dispatch_label,
                "progressText": progress_text,
                "pendingCount": pending_count,
                "totalCount": total,
                "updatedAt": plan.updated_at,
            },
        }

    @staticmethod
    def _acknowledgement_view(
        ack: InspectionPlanAcknowledgementRecord,
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        org = auth_store.org_snapshot(ack.target_org_id)
        return {
            "acknowledgementId": ack.acknowledgement_id,
            "inspectionPlanId": ack.inspection_plan_id,
            "targetOrgId": ack.target_org_id,
            "targetOrgName": org.get("orgName", ""),
            "ackStatus": ack.ack_status,
            "acknowledgedBy": ack.acknowledged_by,
            "acknowledgedAt": ack.acknowledged_at,
            "liaisonName": ack.liaison_name,
            "liaisonPhone": ack.liaison_phone,
            "liaisonTitle": ack.liaison_title,
            "createdBySnapshot": ack.created_by_snapshot,
        }

    def _hydrate_plan_acknowledgements(self) -> None:
        pass

    @staticmethod
    def _validate_date_range(start: str | None, end: str | None) -> None:
        if not start or not end:
            raise AppError(
                code="INVALID_DATE_RANGE",
                message="Planned start and end date are required",
                status_code=422,
            )
        try:
            start_date = date.fromisoformat(start)
            end_date = date.fromisoformat(end)
        except ValueError as exc:
            raise AppError(
                code="INVALID_DATE_RANGE",
                message="Planned dates must use ISO date format",
                status_code=422,
            ) from exc
        if start_date > end_date:
            raise AppError(
                code="INVALID_DATE_RANGE",
                message="Planned start date must be before planned end date",
                status_code=422,
            )

    @staticmethod
    def _matches_keyword(
        plan: InspectionPlanRecord,
        keyword: str | None,
        auth_store: SeedAuthStore,
    ) -> bool:
        if not keyword:
            return True
        normalized = keyword.lower()
        leader_snapshot = plan.leader_snapshot or auth_store.user_snapshot(plan.leader_user_id)
        leader_name = str(leader_snapshot.get("displayName", ""))
        return any(
            normalized in value.lower()
            for value in [plan.title, plan.inspect_code, leader_name]
            if value
        )

    @staticmethod
    def _progress_for_phase(phase: str) -> int:
        return INSPECTION_PHASE_PROGRESS.get(phase, 0)

    def _next_inspect_code(self) -> str:
        return f"WLZQ-INSP-{seed_base_date().year}-{len(self.plans) + 1:03d}"

    def _build_plans(self) -> dict[str, InspectionPlanRecord]:
        def history_plan(
            *,
            inspection_plan_id: str,
            inspect_code: str,
            title: str,
            type_: str,
            frequency: str,
            target_org_ids: list[str],
            target_dept_label: str,
            leader_user_id: str,
            team_member_user_ids: list[str],
            start_offset_days: int,
            end_offset_days: int,
            status: str,
            phase: str,
            ekp_status: str = "history_seed_sample",
            ekp_event_type: str = "SEED_HISTORY_SAMPLE",
            files: list[dict[str, Any]] | None = None,
        ) -> InspectionPlanRecord:
            events = (
                [
                    {
                        "type": ekp_event_type,
                        "status": "RECORDED",
                        "createdAt": relative_datetime_iso(),
                    },
                ]
                if ekp_event_type
                else []
            )
            return InspectionPlanRecord(
                inspection_plan_id=inspection_plan_id,
                inspect_code=inspect_code,
                title=title,
                type=type_,
                frequency=frequency,
                target_org_ids=target_org_ids,
                target_dept_label=target_dept_label,
                leader_user_id=leader_user_id,
                team_member_user_ids=team_member_user_ids,
                planned_start_date=relative_date_iso(start_offset_days),
                planned_end_date=relative_date_iso(end_offset_days),
                status=status,
                phase=phase,
                phase_progress=INSPECTION_PHASE_PROGRESS[phase],
                files=files or [],
                ekp_flow={"status": ekp_status, "events": events},
            )

        plans = [
            history_plan(
                inspection_plan_id="INSP-PLAN-WLZQ-2026-AML-001",
                inspect_code="WLZQ-INSP-2026-AML-001",
                title="万联证券反洗钱专项检查",
                type_=DEFAULT_INSPECTION_PLAN_TYPE,
                frequency=DEFAULT_INSPECTION_PLAN_FREQUENCY,
                target_org_ids=[
                    "WLZQ-RBC-GZ-NANSHA",
                    "WLZQ-RBC-SHENZHEN",
                    "WLZQ-RBC-HUNAN",
                    "WLZQ-RBC-SICHUAN",
                    "WLZQ-RBC-BEIJING",
                    "WLZQ-RBC-SHANGHAI",
                ],
                target_dept_label=(
                    "广州南沙分公司、深圳分公司、湖南分公司、四川分公司、"
                    "北京分公司、上海分公司"
                ),
                leader_user_id="USER-HQ-INSP-001",
                team_member_user_ids=["USER-HQ-COMP-001"],
                start_offset_days=11,
                end_offset_days=40,
                status="DRAFT",
                phase="PLAN_DRAFT",
                ekp_status="not_started",
                ekp_event_type="",
            ),
            history_plan(
                inspection_plan_id="INSP-PLAN-WLZQ-2026-AML-REPORT-READY-001",
                inspect_code="WLZQ-INSP-2026-AML-REPORT-READY-001",
                title="反洗钱专项检查报告编制准备项目",
                type_=DEFAULT_INSPECTION_PLAN_TYPE,
                frequency=DEFAULT_INSPECTION_PLAN_FREQUENCY,
                target_org_ids=[
                    "WLZQ-RBC-GZ-NANSHA",
                    "WLZQ-RBC-SHENZHEN",
                ],
                target_dept_label="广州南沙分公司、深圳分公司",
                leader_user_id="USER-HQ-INSP-001",
                team_member_user_ids=["USER-HQ-COMP-001"],
                start_offset_days=-15,
                end_offset_days=12,
                status="IN_PROGRESS",
                phase="REPORTING",
                ekp_status="report_preparation_ready_seed",
                ekp_event_type="SEED_REPORT_READY_SCENARIO",
            ),
            history_plan(
                inspection_plan_id="INSP-PLAN-WLZQ-2026-AML-PUBLIC-REPORTING-001",
                inspect_code="WLZQ-INSP-2026-AML-PUBLIC-REPORTING-001",
                title="反洗钱检查事实确认完成项目",
                type_=DEFAULT_INSPECTION_PLAN_TYPE,
                frequency=DEFAULT_INSPECTION_PLAN_FREQUENCY,
                target_org_ids=[
                    "WLZQ-RBC-GZ-NANSHA",
                    "WLZQ-RBC-SHENZHEN",
                ],
                target_dept_label="广州南沙分公司、深圳分公司",
                leader_user_id="USER-HQ-INSP-001",
                team_member_user_ids=["USER-HQ-COMP-001"],
                start_offset_days=-8,
                end_offset_days=21,
                status="IN_PROGRESS",
                phase="FACT_CONFIRMATION",
                ekp_status="report_transition_allowed_seed",
                ekp_event_type="SEED_PUBLIC_REPORTING_TRANSITION",
            ),
            history_plan(
                inspection_plan_id="INSP-PLAN-WLZQ-2026-AML-PUBLIC-REPORTING-BLOCKED-001",
                inspect_code="WLZQ-INSP-2026-AML-PUBLIC-REPORTING-BLOCKED-001",
                title="反洗钱检查申辩待裁决项目",
                type_=DEFAULT_INSPECTION_PLAN_TYPE,
                frequency=DEFAULT_INSPECTION_PLAN_FREQUENCY,
                target_org_ids=["WLZQ-RBC-GZ-NANSHA"],
                target_dept_label="广州南沙分公司",
                leader_user_id="USER-HQ-INSP-002",
                team_member_user_ids=["USER-HQ-COMP-001"],
                start_offset_days=-4,
                end_offset_days=24,
                status="IN_PROGRESS",
                phase="ADJUDICATION",
                ekp_status="report_transition_blocked_seed",
                ekp_event_type="SEED_PUBLIC_REPORTING_TRANSITION_BLOCKED",
            ),
            history_plan(
                inspection_plan_id="INSP-PLAN-WLZQ-2026-ROUTINE-YEARLY-001",
                inspect_code="WLZQ-INSP-2026-ROUTINE-YEARLY-001",
                title="年度分支机构例行合规检查",
                type_="ROUTINE_INSPECTION",
                frequency="YEARLY",
                target_org_ids=["WLZQ-RBC-HUNAN", "WLZQ-RBC-SICHUAN"],
                target_dept_label="湖南分公司、四川分公司",
                leader_user_id="USER-HQ-INSP-002",
                team_member_user_ids=["USER-HQ-COMP-001"],
                start_offset_days=18,
                end_offset_days=57,
                status="APPROVING",
                phase="PLAN_SUBMITTED",
            ),
            history_plan(
                inspection_plan_id="INSP-PLAN-WLZQ-2026-ROUTINE-QUARTERLY-001",
                inspect_code="WLZQ-INSP-2026-ROUTINE-QUARTERLY-001",
                title="季度网点内控例行检查",
                type_="ROUTINE_INSPECTION",
                frequency="QUARTERLY",
                target_org_ids=["WLZQ-RBC-GZ-BAIYUN", "WLZQ-RBC-GZ-HUANGPU"],
                target_dept_label="广州白云分公司、广州黄埔分公司",
                leader_user_id="USER-HQ-INSP-002",
                team_member_user_ids=["USER-HQ-COMP-001"],
                start_offset_days=3,
                end_offset_days=32,
                status="IN_PROGRESS",
                phase="EVIDENCE_COLLECTING",
            ),
            history_plan(
                inspection_plan_id="INSP-PLAN-WLZQ-2026-ROUTINE-HALF-YEARLY-CLOSED-001",
                inspect_code="WLZQ-INSP-2026-ROUTINE-HALF-YEARLY-CLOSED-001",
                title="半年度客户适当性例行检查",
                type_="ROUTINE_INSPECTION",
                frequency="HALF_YEARLY",
                target_org_ids=["WLZQ-RBC-SHANGHAI", "WLZQ-RBC-HANGZHOU"],
                target_dept_label="上海分公司、杭州分公司",
                leader_user_id="USER-HQ-INSP-001",
                team_member_user_ids=["USER-HQ-COMP-001"],
                start_offset_days=-70,
                end_offset_days=-42,
                status="COMPLETED",
                phase="CLOSED",
            ),
            history_plan(
                inspection_plan_id="INSP-PLAN-WLZQ-2026-DEPARTURE-ADHOC-001",
                inspect_code="WLZQ-INSP-2026-DEPARTURE-ADHOC-001",
                title="分公司负责人离任审计计划",
                type_="DEPARTURE_AUDIT",
                frequency="AD_HOC",
                target_org_ids=["WLZQ-RBC-FUJIAN"],
                target_dept_label="福建分公司",
                leader_user_id="USER-HQ-INSP-002",
                team_member_user_ids=["USER-HQ-ADJ-001"],
                start_offset_days=25,
                end_offset_days=50,
                status="DRAFT",
                phase="PLAN_DRAFT",
            ),
            history_plan(
                inspection_plan_id="INSP-PLAN-WLZQ-2026-DEPARTURE-YEARLY-001",
                inspect_code="WLZQ-INSP-2026-DEPARTURE-YEARLY-001",
                title="年度干部离任审计专项安排",
                type_="DEPARTURE_AUDIT",
                frequency="YEARLY",
                target_org_ids=["WLZQ-RBC-DONGGUAN", "WLZQ-RBC-HAINAN"],
                target_dept_label="东莞分公司、海南分公司",
                leader_user_id="USER-HQ-INSP-001",
                team_member_user_ids=["USER-HQ-ADJ-001"],
                start_offset_days=-2,
                end_offset_days=28,
                status="IN_PROGRESS",
                phase="EXECUTION_IN_PROGRESS",
            ),
            history_plan(
                inspection_plan_id="INSP-PLAN-WLZQ-2026-SPECIAL-QUARTERLY-SUSPENDED-001",
                inspect_code="WLZQ-INSP-2026-SPECIAL-QUARTERLY-SUSPENDED-001",
                title="季度信息技术合规专项检查",
                type_=DEFAULT_INSPECTION_PLAN_TYPE,
                frequency="QUARTERLY",
                target_org_ids=["WLZQ-RBC-BEIJING"],
                target_dept_label="北京分公司",
                leader_user_id="USER-HQ-INSP-002",
                team_member_user_ids=["USER-HQ-COMP-001"],
                start_offset_days=8,
                end_offset_days=36,
                status="SUSPENDED",
                phase="EVIDENCE_COLLECTING",
            ),
            history_plan(
                inspection_plan_id="INSP-PLAN-WLZQ-2026-DEPARTURE-HALF-YEARLY-CLOSED-001",
                inspect_code="WLZQ-INSP-2026-DEPARTURE-HALF-YEARLY-CLOSED-001",
                title="半年度离任审计归档项目",
                type_="DEPARTURE_AUDIT",
                frequency="HALF_YEARLY",
                target_org_ids=["WLZQ-RBC-YUNNAN", "WLZQ-RBC-LIAONING"],
                target_dept_label="云南分公司、辽宁分公司",
                leader_user_id="USER-HQ-INSP-001",
                team_member_user_ids=["USER-HQ-ADJ-001"],
                start_offset_days=-120,
                end_offset_days=-92,
                status="COMPLETED",
                phase="CLOSED",
            ),
            history_plan(
                inspection_plan_id="INSP-PLAN-WLZQ-2026-ROUTINE-ADHOC-RECTIFICATION-001",
                inspect_code="WLZQ-INSP-2026-ROUTINE-ADHOC-RECTIFICATION-001",
                title="临时营业网点整改跟踪检查",
                type_="ROUTINE_INSPECTION",
                frequency=DEFAULT_INSPECTION_PLAN_FREQUENCY,
                target_org_ids=["WLZQ-RBC-GZ-NANSHA"],
                target_dept_label="广州南沙分公司",
                leader_user_id="USER-HQ-INSP-002",
                team_member_user_ids=["USER-HQ-COMP-001"],
                start_offset_days=-20,
                end_offset_days=10,
                status="IN_PROGRESS",
                phase="RECTIFICATION",
            ),
            # PLAN_APPROVED seed fixture created by the SIT-ROUND-20260605-01 local
            # acceptance flow and reused by SIT-IMPL-01 for material-chain retest.
            history_plan(
                inspection_plan_id="INSP-PLAN-SEED-0015",
                inspect_code="WLZQ-INSP-2026-SEED-0015",
                title="SIT-IMPL-01 实施材料链路验证计划",
                type_="SPECIAL_INSPECTION",
                frequency="AD_HOC",
                target_org_ids=["WLZQ-RBC-GZ-NANSHA"],
                target_dept_label="广州南沙分公司",
                leader_user_id="USER-HQ-INSP-001",
                team_member_user_ids=["USER-HQ-COMP-001"],
                start_offset_days=5,
                end_offset_days=35,
                status="DRAFT",
                phase="PLAN_APPROVED",
                ekp_status="not_started",
                ekp_event_type="",
                files=[
                    {
                        "attachmentType": "INSPECTION_NOTICE",
                        "attachmentKey": "notice",
                        "attachmentLabel": "检查通知书",
                        "required": False,
                        "bindingTargetType": "InspectionPlan",
                        "businessStage": "PLAN_CREATE",
                        "maintenance": "draft_or_approval_editable",
                        "fileId": "FILE-SEED-0005",
                        "fileName": "file02-inspection-notice.pdf",
                        "contentType": "application/pdf",
                        "fileSize": 231019,
                        "scanStatus": "SCAN_DEFERRED",
                        "uploadedBy": "USER-HQ-COMP-001",
                        "uploadedAt": relative_datetime_iso(),
                        "boundBy": "USER-HQ-COMP-001",
                        "boundAt": relative_datetime_iso(),
                    },
                ],
            ),
            # PLAN_APPROVED seed fixture for UI-FOLLOWUP-01 closeout:
            # HQ read-only attachment display + branch acknowledgement readback.
            history_plan(
                inspection_plan_id="INSP-PLAN-UI-FOLLOWUP-01-APPROVED-001",
                inspect_code="WLZQ-INSP-2026-UI-FOLLOWUP-01-001",
                title="UI-FOLLOWUP-01 准备阶段附件 readback 验证",
                type_="SPECIAL_INSPECTION",
                frequency="AD_HOC",
                target_org_ids=["WLZQ-RBC-GZ-NANSHA"],
                target_dept_label="广州南沙分公司",
                leader_user_id="USER-HQ-INSP-001",
                team_member_user_ids=["USER-HQ-COMP-001"],
                start_offset_days=5,
                end_offset_days=35,
                status="DRAFT",
                phase="PLAN_APPROVED",
                files=[
                    {
                        "attachmentType": "INSPECTION_NOTICE",
                        "attachmentKey": "notice",
                        "attachmentLabel": "检查通知书",
                        "required": False,
                        "bindingTargetType": "InspectionPlan",
                        "businessStage": "PLAN_CREATE",
                        "maintenance": "draft_or_approval_editable",
                        "fileId": "FILE-SEED-0001",
                        "fileName": "inspection-notice-sample.txt",
                        "contentType": "text/plain",
                        "fileSize": 256,
                        "scanStatus": "SCAN_DEFERRED",
                        "uploadedBy": "USER-HQ-COMP-001",
                        "uploadedAt": relative_datetime_iso(),
                        "boundBy": "USER-HQ-COMP-001",
                        "boundAt": relative_datetime_iso(),
                    },
                    {
                        "attachmentType": "ONSITE_INSPECTION_SCHEME",
                        "attachmentKey": "scheme",
                        "attachmentLabel": "现场检查方案",
                        "required": False,
                        "bindingTargetType": "InspectionPlan",
                        "businessStage": "PLAN_CREATE",
                        "maintenance": "draft_or_approval_editable",
                        "fileId": "FILE-SEED-0002",
                        "fileName": "onsite-scheme-sample.txt",
                        "contentType": "text/plain",
                        "fileSize": 512,
                        "scanStatus": "SCAN_DEFERRED",
                        "uploadedBy": "USER-HQ-COMP-001",
                        "uploadedAt": relative_datetime_iso(),
                        "boundBy": "USER-HQ-COMP-001",
                        "boundAt": relative_datetime_iso(),
                    },
                    {
                        "attachmentType": "WORKING_PAPER_TEMPLATE",
                        "attachmentKey": "workingPaperTemplate",
                        "attachmentLabel": "底稿模板",
                        "required": False,
                        "bindingTargetType": "InspectionPlan",
                        "businessStage": "PLAN_CREATE",
                        "maintenance": "draft_or_approval_editable",
                        "fileId": "FILE-SEED-0003",
                        "fileName": "working-paper-template.txt",
                        "contentType": "text/plain",
                        "fileSize": 128,
                        "scanStatus": "SCAN_DEFERRED",
                        "uploadedBy": "USER-HQ-COMP-001",
                        "uploadedAt": relative_datetime_iso(),
                        "boundBy": "USER-HQ-COMP-001",
                        "boundAt": relative_datetime_iso(),
                    },
                    {
                        "attachmentType": "OTHER",
                        "attachmentKey": "other",
                        "attachmentLabel": "其他",
                        "required": False,
                        "bindingTargetType": "InspectionPlan",
                        "businessStage": "PLAN_CREATE",
                        "maintenance": "draft_or_approval_editable",
                        "fileId": "FILE-SEED-0004",
                        "fileName": "other-reference-note.txt",
                        "contentType": "text/plain",
                        "fileSize": 192,
                        "scanStatus": "SCAN_DEFERRED",
                        "uploadedBy": "USER-HQ-COMP-001",
                        "uploadedAt": relative_datetime_iso(),
                        "boundBy": "USER-HQ-COMP-001",
                        "boundAt": relative_datetime_iso(),
                    },
                ],
            ),
            # PLAN_APPROVED seed fixture for FILE-02:
            # HQ read-only MIME attachment display + branch acknowledgement readback.
            history_plan(
                inspection_plan_id="INSP-PLAN-FILE-02-APPROVED-001",
                inspect_code="WLZQ-INSP-2026-FILE-02-001",
                title="FILE-02 真实 MIME 准备阶段附件 readback 验证",
                type_="SPECIAL_INSPECTION",
                frequency="AD_HOC",
                target_org_ids=["WLZQ-RBC-GZ-NANSHA"],
                target_dept_label="广州南沙分公司",
                leader_user_id="USER-HQ-INSP-001",
                team_member_user_ids=["USER-HQ-COMP-001"],
                start_offset_days=5,
                end_offset_days=35,
                status="DRAFT",
                phase="PLAN_APPROVED",
                files=[
                    {
                        "attachmentType": "INSPECTION_NOTICE",
                        "attachmentKey": "notice",
                        "attachmentLabel": "检查通知书",
                        "required": False,
                        "bindingTargetType": "InspectionPlan",
                        "businessStage": "PLAN_CREATE",
                        "maintenance": "draft_or_approval_editable",
                        "fileId": "FILE-SEED-0005",
                        "fileName": "file02-inspection-notice.pdf",
                        "contentType": "application/pdf",
                        "fileSize": 231019,
                        "scanStatus": "SCAN_DEFERRED",
                        "uploadedBy": "USER-HQ-COMP-001",
                        "uploadedAt": relative_datetime_iso(),
                        "boundBy": "USER-HQ-COMP-001",
                        "boundAt": relative_datetime_iso(),
                    },
                    {
                        "attachmentType": "ONSITE_INSPECTION_SCHEME",
                        "attachmentKey": "scheme",
                        "attachmentLabel": "现场检查方案",
                        "required": False,
                        "bindingTargetType": "InspectionPlan",
                        "businessStage": "PLAN_CREATE",
                        "maintenance": "draft_or_approval_editable",
                        "fileId": "FILE-SEED-0006",
                        "fileName": "file02-onsite-scheme.docx",
                        "contentType": (
                            "application/vnd.openxmlformats-officedocument."
                            "wordprocessingml.document"
                        ),
                        "fileSize": 1629,
                        "scanStatus": "SCAN_DEFERRED",
                        "uploadedBy": "USER-HQ-COMP-001",
                        "uploadedAt": relative_datetime_iso(),
                        "boundBy": "USER-HQ-COMP-001",
                        "boundAt": relative_datetime_iso(),
                    },
                    {
                        "attachmentType": "WORKING_PAPER_TEMPLATE",
                        "attachmentKey": "workingPaperTemplate",
                        "attachmentLabel": "底稿模板",
                        "required": False,
                        "bindingTargetType": "InspectionPlan",
                        "businessStage": "PLAN_CREATE",
                        "maintenance": "draft_or_approval_editable",
                        "fileId": "FILE-SEED-0007",
                        "fileName": "file02-working-paper-template.xlsx",
                        "contentType": (
                            "application/vnd.openxmlformats-officedocument."
                            "spreadsheetml.sheet"
                        ),
                        "fileSize": 2259,
                        "scanStatus": "SCAN_DEFERRED",
                        "uploadedBy": "USER-HQ-COMP-001",
                        "uploadedAt": relative_datetime_iso(),
                        "boundBy": "USER-HQ-COMP-001",
                        "boundAt": relative_datetime_iso(),
                    },
                    {
                        "attachmentType": "OTHER",
                        "attachmentKey": "other",
                        "attachmentLabel": "其他",
                        "required": False,
                        "bindingTargetType": "InspectionPlan",
                        "businessStage": "PLAN_CREATE",
                        "maintenance": "draft_or_approval_editable",
                        "fileId": "FILE-SEED-0008",
                        "fileName": "file02-other-screenshot.png",
                        "contentType": "image/png",
                        "fileSize": 102075,
                        "scanStatus": "SCAN_DEFERRED",
                        "uploadedBy": "USER-HQ-COMP-001",
                        "uploadedAt": relative_datetime_iso(),
                        "boundBy": "USER-HQ-COMP-001",
                        "boundAt": relative_datetime_iso(),
                    },
                ],
            ),
        ]
        return {plan.inspection_plan_id: plan for plan in plans}


inspection_plan_store = SeedInspectionPlanStore()
