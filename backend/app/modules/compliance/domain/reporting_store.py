from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.modules.compliance.core.errors import AppError, ForbiddenError, NotFoundError
from app.modules.compliance.domain.auth_store import AuthUserRecord, SeedAuthStore
from app.modules.compliance.domain.cycle_store import (
    AssessmentCycleRecord,
    ReportingTaskRecord,
    cycle_store,
)
from app.modules.compliance.domain.dictionaries import assessment_transition_for, validate_codes
from app.modules.compliance.domain.evidence_store import evidence_store
from app.modules.compliance.domain.seed_time import relative_datetime_iso
from app.modules.compliance.domain.task_store import task_store


@dataclass
class ResponseEvidenceRecord:
    response_evidence_id: str
    response_item_id: str
    reporting_task_id: str
    file_id: str
    bound_by_ref: str
    bound_at_ref: str


@dataclass
class ResponseItemRecord:
    response_item_id: str
    reporting_task_id: str
    indicator_id: str
    version_id: str
    indicator_snapshot: dict[str, Any]
    required_evidence: bool
    response_value: Any | None = None
    comment: str = ""
    validation_status: str = "UNVALIDATED"
    source_ledger_entry_id: str | None = None
    evidence: dict[str, ResponseEvidenceRecord] = field(default_factory=dict)


@dataclass
class DailyLedgerAttachmentRecord:
    ledger_attachment_id: str
    ledger_entry_id: str
    file_id: str
    bound_by_ref: str
    bound_at_ref: str


@dataclass
class DailyLedgerEntryRecord:
    ledger_entry_id: str
    org_id: str
    title: str
    occurred_date: str
    category: str
    description: str
    status: str
    created_by_ref: str
    created_at: str
    updated_by_ref: str | None = None
    updated_at_ref: str | None = None
    deleted_by_ref: str | None = None
    deleted_at_ref: str | None = None
    attachments: dict[str, DailyLedgerAttachmentRecord] = field(default_factory=dict)
    audit_events: list[dict[str, Any]] = field(default_factory=list)


class SeedReportingStore:
    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self.response_items: dict[str, ResponseItemRecord] = {}
        self.ledger_entries: dict[str, DailyLedgerEntryRecord] = {}

    def reporting_page(
        self,
        *,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        status: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        self._require_reporting(user, auth_store)
        validate_codes((status, "assessment_reporting_status", "status"))
        tasks = [
            task
            for _, task in self._reporting_task_records()
            if self._can_access_reporting_task(task, user, auth_store)
            and (status is None or task.status == status)
        ]
        tasks.sort(key=lambda item: (item.due_date, item.reporting_task_id))
        start = (page - 1) * page_size
        end = start + page_size
        return {
            "items": [self._reporting_summary(task) for task in tasks[start:end]],
            "page": page,
            "pageSize": page_size,
            "total": len(tasks),
        }

    def reporting_detail(
        self,
        *,
        reporting_task_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        self._require_reporting(user, auth_store)
        cycle, task = self._get_reporting_task(reporting_task_id)
        self._ensure_reporting_scope(task, user, auth_store)
        self._ensure_response_items(cycle, task)
        return self._reporting_detail(cycle, task, auth_store)

    def save_draft(
        self,
        *,
        reporting_task_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        cycle, task = self._get_reporting_task_for_write(reporting_task_id, user, auth_store)
        self._ensure_transition(task.status, "save_reporting_draft")
        self._apply_response_payload(task, user, auth_store, payload)
        self._set_reporting_status(cycle, task, "IN_PROGRESS")
        return self._reporting_detail(cycle, task, auth_store)

    def submit(
        self,
        *,
        reporting_task_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        cycle, task = self._get_reporting_task_for_write(reporting_task_id, user, auth_store)
        self._ensure_transition(task.status, "submit_reporting")
        self._apply_response_payload(task, user, auth_store, payload)
        validation_errors = self._validate_submit(task)
        if validation_errors:
            raise AppError(
                code="VALIDATION_ERROR",
                message="Reporting submission is incomplete",
                status_code=422,
                details={"errors": validation_errors},
            )
        self._set_reporting_status(cycle, task, "SUBMITTED")
        self._set_unified_task_status(task, "DONE")
        return self._reporting_detail(cycle, task, auth_store)

    def recall(
        self,
        *,
        reporting_task_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        cycle, task = self._get_reporting_task_for_write(reporting_task_id, user, auth_store)
        self._ensure_transition(task.status, "recall_reporting_before_review")
        if self._review_started(cycle, task):
            raise AppError(
                code="INVALID_STATE",
                message="Reporting cannot be recalled after review starts",
                status_code=409,
                details={"reportingTaskId": reporting_task_id, "status": task.status},
            )
        self._set_reporting_status(cycle, task, "RECALLED")
        self._set_unified_task_status(task, "PENDING")
        return self._reporting_detail(cycle, task, auth_store)

    def import_ledger(
        self,
        *,
        reporting_task_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        cycle, task = self._get_reporting_task_for_write(reporting_task_id, user, auth_store)
        self._ensure_transition(task.status, "import_ledger_entry_to_reporting")
        self._ensure_response_items(cycle, task)
        ledger = self._get_ledger_for_user(payload["ledgerEntryId"], user, auth_store)
        if ledger.status != "AVAILABLE":
            raise AppError(
                code="INVALID_STATE",
                message="Only AVAILABLE ledger entries can be imported",
                status_code=409,
                details={"ledgerEntryId": ledger.ledger_entry_id, "status": ledger.status},
            )
        items = self._resolve_response_items(task, payload)
        if not items:
            raise AppError(
                code="VALIDATION_ERROR",
                message="Import requires response item references",
                status_code=422,
            )
        for item in items:
            item.response_value = {
                "source": "DAILY_LEDGER",
                "ledgerEntryId": ledger.ledger_entry_id,
                "title": ledger.title,
                "description": ledger.description,
                "occurredDate": ledger.occurred_date,
            }
            item.comment = payload.get("comment", item.comment)
            item.source_ledger_entry_id = ledger.ledger_entry_id
            item.validation_status = "UNVALIDATED"
            if payload.get("includeAttachments", True):
                self._bind_response_files(
                    item,
                    [attachment.file_id for attachment in ledger.attachments.values()],
                    user,
                    auth_store,
                )
        ledger.status = "USED_IN_REPORTING"
        ledger.audit_events.append(self._audit_event("IMPORTED_TO_REPORTING", user.user_id))
        self._set_reporting_status(cycle, task, "IN_PROGRESS")
        return self._reporting_detail(cycle, task, auth_store)

    def ledger_page(
        self,
        *,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        status: str | None = None,
        include_deleted: bool = False,
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        self._require_ledger(user, auth_store)
        validate_codes((status, "daily_ledger_status", "status"))
        records = [
            ledger
            for ledger in self.ledger_entries.values()
            if self._can_access_org(user, auth_store, ledger.org_id)
            and (include_deleted or ledger.status != "DELETED")
            and (status is None or ledger.status == status)
        ]
        records.sort(key=lambda item: (item.occurred_date, item.ledger_entry_id), reverse=True)
        start = (page - 1) * page_size
        end = start + page_size
        return {
            "items": [self._ledger_view(item, auth_store) for item in records[start:end]],
            "page": page,
            "pageSize": page_size,
            "total": len(records),
        }

    def create_ledger(
        self,
        *,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        self._require_ledger(user, auth_store)
        file_ids = list(dict.fromkeys(payload.get("fileIds") or []))
        self._require_scoped_files(file_ids, user, auth_store)
        ledger_id = f"LEDGER-{len(self.ledger_entries) + 1:04d}"
        ledger = DailyLedgerEntryRecord(
            ledger_entry_id=ledger_id,
            org_id=user.org_id,
            title=payload["title"],
            occurred_date=payload["occurredDate"],
            category=payload.get("category", "GENERAL"),
            description=payload.get("description", ""),
            status=payload.get("status", "AVAILABLE"),
            created_by_ref=user.user_id,
            created_at=relative_datetime_iso(),
            audit_events=[self._audit_event("CREATED", user.user_id)],
        )
        self._validate_user_mutable_ledger_status(ledger.status)
        self._replace_ledger_attachments(ledger, file_ids, user)
        self.ledger_entries[ledger_id] = ledger
        return self._ledger_view(ledger, auth_store)

    def update_ledger(
        self,
        *,
        ledger_entry_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        self._require_ledger(user, auth_store)
        ledger = self._get_ledger_for_user(ledger_entry_id, user, auth_store)
        if ledger.status == "DELETED":
            raise AppError(
                code="INVALID_STATE",
                message="Deleted ledger entry cannot be updated",
                status_code=409,
            )
        file_ids = payload.get("fileIds")
        if file_ids is not None:
            scoped_file_ids = list(dict.fromkeys(file_ids))
            self._require_scoped_files(scoped_file_ids, user, auth_store)
            self._replace_ledger_attachments(ledger, scoped_file_ids, user)
        if "status" in payload:
            self._validate_user_mutable_ledger_status(payload["status"])
        for field_name, attr_name in (
            ("title", "title"),
            ("occurredDate", "occurred_date"),
            ("category", "category"),
            ("description", "description"),
            ("status", "status"),
        ):
            if field_name in payload:
                setattr(ledger, attr_name, payload[field_name])
        self._validate_user_mutable_ledger_status(ledger.status)
        ledger.updated_by_ref = user.user_id
        ledger.updated_at_ref = relative_datetime_iso()
        ledger.audit_events.append(self._audit_event("UPDATED", user.user_id))
        return self._ledger_view(ledger, auth_store)

    def soft_delete_ledger(
        self,
        *,
        ledger_entry_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        self._require_ledger(user, auth_store)
        ledger = self._get_ledger_for_user(ledger_entry_id, user, auth_store)
        if ledger.status == "DELETED":
            return self._ledger_view(ledger, auth_store)
        ledger.status = "DELETED"
        ledger.deleted_by_ref = user.user_id
        ledger.deleted_at_ref = relative_datetime_iso()
        ledger.audit_events.append(self._audit_event("SOFT_DELETED", user.user_id))
        return self._ledger_view(ledger, auth_store)

    def _apply_response_payload(
        self,
        task: ReportingTaskRecord,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        payload: dict[str, Any],
    ) -> None:
        cycle, _ = self._get_reporting_task(task.reporting_task_id)
        self._ensure_response_items(cycle, task)
        items_payload = payload.get("items") or []
        for item_payload in items_payload:
            item = self._resolve_response_item(task, item_payload)
            if "value" in item_payload:
                item.response_value = item_payload["value"]
            if "comment" in item_payload:
                item.comment = item_payload["comment"]
            if "fileIds" in item_payload:
                self._bind_response_files(item, item_payload.get("fileIds") or [], user, auth_store)
            item.validation_status = "UNVALIDATED"

    def _bind_response_files(
        self,
        item: ResponseItemRecord,
        file_ids: list[str],
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> None:
        scoped_file_ids = list(dict.fromkeys(file_ids))
        self._require_scoped_files(scoped_file_ids, user, auth_store)
        item.evidence = {
            file_id: ResponseEvidenceRecord(
                response_evidence_id=f"{item.response_item_id}-EVD-{index:03d}",
                response_item_id=item.response_item_id,
                reporting_task_id=item.reporting_task_id,
                file_id=file_id,
                bound_by_ref=user.user_id,
                bound_at_ref=relative_datetime_iso(),
            )
            for index, file_id in enumerate(scoped_file_ids, start=1)
        }

    def _validate_submit(self, task: ReportingTaskRecord) -> list[dict[str, Any]]:
        errors: list[dict[str, Any]] = []
        for item in self._items_for_task(task.reporting_task_id):
            if item.response_value in (None, "", []):
                item.validation_status = "INVALID"
                errors.append(
                    {
                        "responseItemId": item.response_item_id,
                        "code": "required_value_missing",
                    },
                )
                continue
            if item.required_evidence and not item.evidence:
                item.validation_status = "MISSING_REQUIRED_EVIDENCE"
                errors.append(
                    {
                        "responseItemId": item.response_item_id,
                        "code": "required_evidence_missing",
                    },
                )
                continue
            item.validation_status = "VALID"
        return errors

    def _ensure_response_items(
        self,
        cycle: AssessmentCycleRecord,
        task: ReportingTaskRecord,
    ) -> None:
        if self._items_for_task(task.reporting_task_id):
            return
        for index, scheme_item in enumerate(cycle.scheme_snapshot.get("items", []), start=1):
            indicator_snapshot = scheme_item.get("indicatorSnapshot", {})
            evidence_templates = indicator_snapshot.get("evidenceTemplates", [])
            item = ResponseItemRecord(
                response_item_id=f"{task.reporting_task_id}-ITEM-{index:03d}",
                reporting_task_id=task.reporting_task_id,
                indicator_id=scheme_item["indicatorId"],
                version_id=scheme_item["versionId"],
                indicator_snapshot=indicator_snapshot,
                required_evidence=not evidence_templates
                or any(template.get("required", True) for template in evidence_templates),
            )
            self.response_items[item.response_item_id] = item

    def _resolve_response_item(
        self,
        task: ReportingTaskRecord,
        payload: dict[str, Any],
    ) -> ResponseItemRecord:
        item_id = payload.get("responseItemId")
        indicator_id = payload.get("indicatorId")
        for item in self._items_for_task(task.reporting_task_id):
            if item_id and item.response_item_id == item_id:
                return item
            if indicator_id and item.indicator_id == indicator_id:
                return item
        raise AppError(
            code="VALIDATION_ERROR",
            message="Response item not found for reporting task",
            status_code=422,
            details={"responseItemId": item_id, "indicatorId": indicator_id},
        )

    def _resolve_response_items(
        self,
        task: ReportingTaskRecord,
        payload: dict[str, Any],
    ) -> list[ResponseItemRecord]:
        refs = payload.get("responseItemIds") or []
        indicator_ids = payload.get("indicatorIds") or []
        if not refs and not indicator_ids:
            raise AppError(
                code="VALIDATION_ERROR",
                message="Import requires response item references",
                status_code=422,
            )
        items = []
        matched_refs: set[str] = set()
        matched_indicator_ids: set[str] = set()
        for item in self._items_for_task(task.reporting_task_id):
            if item.response_item_id in refs:
                matched_refs.add(item.response_item_id)
                items.append(item)
            elif item.indicator_id in indicator_ids:
                matched_indicator_ids.add(item.indicator_id)
                items.append(item)
        missing_refs = [item_id for item_id in refs if item_id not in matched_refs]
        missing_indicator_ids = [
            indicator_id
            for indicator_id in indicator_ids
            if indicator_id not in matched_indicator_ids
        ]
        if missing_refs or missing_indicator_ids:
            raise AppError(
                code="VALIDATION_ERROR",
                message="Import target response item not found",
                status_code=422,
                details={
                    "responseItemIds": missing_refs,
                    "indicatorIds": missing_indicator_ids,
                },
            )
        return items

    def _items_for_task(self, reporting_task_id: str) -> list[ResponseItemRecord]:
        items = [
            item
            for item in self.response_items.values()
            if item.reporting_task_id == reporting_task_id
        ]
        items.sort(key=lambda item: item.response_item_id)
        return items

    def _get_reporting_task_for_write(
        self,
        reporting_task_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> tuple[AssessmentCycleRecord, ReportingTaskRecord]:
        self._require_reporting(user, auth_store)
        cycle, task = self._get_reporting_task(reporting_task_id)
        self._ensure_reporting_scope(task, user, auth_store)
        return cycle, task

    @staticmethod
    def _reporting_task_records() -> list[tuple[AssessmentCycleRecord, ReportingTaskRecord]]:
        records: list[tuple[AssessmentCycleRecord, ReportingTaskRecord]] = []
        for cycle in cycle_store.cycles.values():
            for task in cycle.reporting_tasks.values():
                records.append((cycle, task))
        return records

    def _get_reporting_task(
        self,
        reporting_task_id: str,
    ) -> tuple[AssessmentCycleRecord, ReportingTaskRecord]:
        for cycle, task in self._reporting_task_records():
            if task.reporting_task_id == reporting_task_id:
                return cycle, task
        raise NotFoundError("Assessment reporting task not found")

    def _set_reporting_status(
        self,
        cycle: AssessmentCycleRecord,
        task: ReportingTaskRecord,
        status: str,
    ) -> None:
        validate_codes((status, "assessment_reporting_status", "status"))
        task.status = status
        target = cycle.targets.get(task.cycle_target_id)
        if target:
            if status in {"IN_PROGRESS", "RECALLED", "RETURNED"}:
                target.target_status = "REPORTING"
            elif status == "SUBMITTED":
                target.target_status = "SUBMITTED"
            elif status == "ACCEPTED":
                target.target_status = "UNDER_REVIEW"
        cycle_store._recompute_rollup(cycle)

    @staticmethod
    def _set_unified_task_status(task: ReportingTaskRecord, status: str) -> None:
        unified_task = task_store.tasks.get(task.unified_task_id)
        if unified_task:
            unified_task.status = status

    @staticmethod
    def _review_started(cycle: AssessmentCycleRecord, task: ReportingTaskRecord) -> bool:
        target = cycle.targets.get(task.cycle_target_id)
        if not target:
            return False
        return target.review_status in {"IN_REVIEW", "APPROVED", "RETURNED_TO_BRANCH", "CLOSED"}

    def _get_ledger_for_user(
        self,
        ledger_entry_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> DailyLedgerEntryRecord:
        ledger = self.ledger_entries.get(ledger_entry_id)
        if not ledger:
            raise NotFoundError("Daily ledger entry not found")
        if not self._can_access_org(user, auth_store, ledger.org_id):
            raise ForbiddenError()
        return ledger

    @staticmethod
    def _validate_user_mutable_ledger_status(status: str) -> None:
        validate_codes((status, "daily_ledger_status", "status"))
        if status not in {"DRAFT", "AVAILABLE"}:
            raise AppError(
                code="VALIDATION_ERROR",
                message="Ledger status can only be changed by its lifecycle action",
                status_code=422,
                details={"status": status},
            )

    @staticmethod
    def _replace_ledger_attachments(
        ledger: DailyLedgerEntryRecord,
        file_ids: list[str],
        user: AuthUserRecord,
    ) -> None:
        ledger.attachments = {
            file_id: DailyLedgerAttachmentRecord(
                ledger_attachment_id=f"{ledger.ledger_entry_id}-ATT-{index:03d}",
                ledger_entry_id=ledger.ledger_entry_id,
                file_id=file_id,
                bound_by_ref=user.user_id,
                bound_at_ref=relative_datetime_iso(),
            )
            for index, file_id in enumerate(file_ids, start=1)
        }

    @staticmethod
    def _require_scoped_files(
        file_ids: list[str],
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> None:
        missing_file_ids = [
            file_id for file_id in file_ids if file_id not in evidence_store.file_assets
        ]
        if missing_file_ids:
            raise AppError(
                code="FILE_ASSET_NOT_FOUND",
                message="File asset not found",
                status_code=404,
                details={"fileIds": missing_file_ids},
            )
        cross_scope_file_ids = [
            file_id
            for file_id in file_ids
            if not auth_store.org_in_scope(
                user,
                auth_store.users[evidence_store.file_assets[file_id].uploaded_by].org_id,
            )
        ]
        if cross_scope_file_ids:
            raise AppError(
                code="FILE_ASSET_NOT_FOUND",
                message="File asset not found",
                status_code=404,
                details={"fileIds": cross_scope_file_ids},
            )

    def _reporting_summary(self, task: ReportingTaskRecord) -> dict[str, Any]:
        return {
            "reportingTaskId": task.reporting_task_id,
            "cycleId": task.cycle_id,
            "cycleTargetId": task.cycle_target_id,
            "targetOrgId": task.target_org_id,
            "unifiedTaskId": task.unified_task_id,
            "status": task.status,
            "dueDate": task.due_date,
            "responseItemCount": len(self._items_for_task(task.reporting_task_id)),
        }

    def _reporting_detail(
        self,
        cycle: AssessmentCycleRecord,
        task: ReportingTaskRecord,
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        return {
            **self._reporting_summary(task),
            "schemeSnapshot": self._branch_scheme_snapshot(cycle, task),
            "targetOrgSnapshot": auth_store.org_snapshot(task.target_org_id),
            "items": [
                self._response_item_view(item, auth_store)
                for item in self._items_for_task(task.reporting_task_id)
            ],
        }

    def _response_item_view(
        self,
        item: ResponseItemRecord,
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        return {
            "responseItemId": item.response_item_id,
            "reportingTaskId": item.reporting_task_id,
            "indicatorId": item.indicator_id,
            "versionId": item.version_id,
            "indicatorSnapshot": item.indicator_snapshot,
            "requiredEvidence": item.required_evidence,
            "value": item.response_value,
            "comment": item.comment,
            "validationStatus": item.validation_status,
            "sourceLedgerEntryId": item.source_ledger_entry_id,
            "evidence": [
                {
                    "responseEvidenceId": evidence.response_evidence_id,
                    "fileId": evidence.file_id,
                    "file": evidence_store.file_view(evidence_store.file_assets[evidence.file_id]),
                    "boundByRef": evidence.bound_by_ref,
                    "boundAtRef": evidence.bound_at_ref,
                }
                for evidence in item.evidence.values()
                if evidence.file_id in evidence_store.file_assets
            ],
        }

    def _ledger_view(
        self,
        ledger: DailyLedgerEntryRecord,
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        return {
            "ledgerEntryId": ledger.ledger_entry_id,
            "orgId": ledger.org_id,
            "orgSnapshot": auth_store.org_snapshot(ledger.org_id),
            "title": ledger.title,
            "occurredDate": ledger.occurred_date,
            "category": ledger.category,
            "description": ledger.description,
            "status": ledger.status,
            "createdByRef": ledger.created_by_ref,
            "createdAt": ledger.created_at,
            "updatedByRef": ledger.updated_by_ref,
            "updatedAtRef": ledger.updated_at_ref,
            "deletedByRef": ledger.deleted_by_ref,
            "deletedAtRef": ledger.deleted_at_ref,
            "attachments": [
                {
                    "ledgerAttachmentId": attachment.ledger_attachment_id,
                    "fileId": attachment.file_id,
                    "file": evidence_store.file_view(
                        evidence_store.file_assets[attachment.file_id],
                    ),
                    "boundByRef": attachment.bound_by_ref,
                    "boundAtRef": attachment.bound_at_ref,
                }
                for attachment in ledger.attachments.values()
                if attachment.file_id in evidence_store.file_assets
            ],
            "auditEvents": ledger.audit_events,
        }

    @staticmethod
    def _branch_scheme_snapshot(
        cycle: AssessmentCycleRecord,
        task: ReportingTaskRecord,
    ) -> dict[str, Any]:
        snapshot = dict(cycle.scheme_snapshot)
        filtered_groups = []
        for group in snapshot.get("targetGroups", []):
            filtered_group = dict(group)
            filtered_group["members"] = [
                member
                for member in group.get("members", [])
                if member.get("orgId") == task.target_org_id
            ]
            filtered_groups.append(filtered_group)
        snapshot["targetGroups"] = filtered_groups
        return snapshot

    @staticmethod
    def _audit_event(event_type: str, user_id: str) -> dict[str, str]:
        return {
            "eventType": event_type,
            "createdByRef": user_id,
            "createdAtRef": relative_datetime_iso(),
        }

    @staticmethod
    def _can_access_org(
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        org_id: str,
    ) -> bool:
        return auth_store.org_in_scope(user, org_id)

    def _can_access_reporting_task(
        self,
        task: ReportingTaskRecord,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> bool:
        return self._can_access_org(user, auth_store, task.target_org_id)

    def _ensure_reporting_scope(
        self,
        task: ReportingTaskRecord,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> None:
        if not self._can_access_reporting_task(task, user, auth_store):
            raise ForbiddenError()

    @staticmethod
    def _ensure_transition(status: str, action: str) -> None:
        transition = assessment_transition_for(
            machine="assessmentReporting",
            state=status,
            action=action,
        )
        if transition is None:
            raise AppError(
                code="INVALID_STATE",
                message="Invalid assessment reporting state transition",
                status_code=409,
                details={"status": status, "action": action},
            )

    @staticmethod
    def _require_reporting(user: AuthUserRecord, auth_store: SeedAuthStore) -> None:
        auth_store.require_permission(user, "PERM-P1-ASSESSMENT-REPORT-BRANCH")

    @staticmethod
    def _require_ledger(user: AuthUserRecord, auth_store: SeedAuthStore) -> None:
        auth_store.require_permission(user, "PERM-P1-ASSESSMENT-DAILY-LEDGER-BRANCH")


reporting_store = SeedReportingStore()
