from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.modules.compliance.core.errors import AppError, ForbiddenError, NotFoundError
from app.modules.compliance.domain.auth_store import AuthUserRecord, SeedAuthStore
from app.modules.compliance.domain.cycle_store import AssessmentCycleRecord, cycle_store
from app.modules.compliance.domain.dictionaries import assessment_transition_for, validate_code
from app.modules.compliance.domain.evidence_store import evidence_store
from app.modules.compliance.domain.review_store import ReviewTaskRecord, review_store
from app.modules.compliance.domain.seed_time import relative_date_iso, relative_datetime_iso, seed_base_date


@dataclass
class ResultItemRecord:
    result_item_id: str
    result_id: str
    review_item_id: str
    indicator_id: str
    version_id: str
    original_score: float
    final_score: float
    appeal_status: str | None = None


@dataclass
class ResultConfirmationRecord:
    confirmation_id: str
    result_id: str
    decision: str
    comment: str
    confirmed_by_ref: str
    confirmed_at_ref: str


@dataclass
class ScoreAppealItemRecord:
    score_appeal_item_id: str
    score_appeal_id: str
    result_item_id: str
    requested_score: float | None
    adopted_score: float | None
    reason: str


@dataclass
class ScoreAppealAttachmentRecord:
    score_appeal_attachment_id: str
    score_appeal_id: str
    file_id: str
    bound_by_ref: str
    bound_at_ref: str


@dataclass
class ScoreAppealRecord:
    score_appeal_id: str
    result_id: str
    target_org_id: str
    status: str
    reason: str
    submitted_by_ref: str
    submitted_at_ref: str
    decided_by_ref: str | None = None
    decided_at_ref: str | None = None
    decision: str | None = None
    decision_reason: str | None = None
    items: dict[str, ScoreAppealItemRecord] = field(default_factory=dict)
    attachments: dict[str, ScoreAppealAttachmentRecord] = field(default_factory=dict)


@dataclass
class RecordArchiveRecord:
    archive_id: str
    result_id: str
    archive_type: str
    snapshot: dict[str, Any]
    archived_by_ref: str
    archived_at_ref: str


@dataclass
class ResultRecord:
    result_id: str
    cycle_id: str
    cycle_target_id: str
    target_org_id: str
    review_task_id: str
    status: str
    confirmation_status: str
    total_score: float
    grade_code: str | None
    confirmation_deadline: str
    generated_by_ref: str
    generated_at_ref: str
    published_by_ref: str | None = None
    published_at_ref: str | None = None
    finalized_by_ref: str | None = None
    finalized_at_ref: str | None = None
    items: dict[str, ResultItemRecord] = field(default_factory=dict)
    confirmations: list[ResultConfirmationRecord] = field(default_factory=list)
    appeals: dict[str, ScoreAppealRecord] = field(default_factory=dict)
    archives: list[RecordArchiveRecord] = field(default_factory=list)


class SeedResultStore:
    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self.results: dict[str, ResultRecord] = {}

    def generate_results(
        self,
        *,
        cycle_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        self._require_result_hq(user, auth_store)
        cycle = cycle_store._get_cycle(cycle_id)
        review_store.materialize_from_reporting(auth_store)
        approved_reviews = [
            task
            for task in review_store.review_tasks.values()
            if task.cycle_id == cycle_id and task.status == "APPROVED"
        ]
        if not approved_reviews or len(approved_reviews) != len(cycle.targets):
            raise AppError(
                code="INVALID_STATE",
                message="Result generation requires all required reviews approved",
                status_code=409,
                details={"cycleId": cycle_id},
            )
        for review_task in approved_reviews:
            if self._result_for_target(review_task.cycle_target_id) is None:
                self._create_result(cycle, review_task, user)
        return self._cycle_result_payload(cycle, auth_store)

    def publish_results(
        self,
        *,
        cycle_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        self._require_result_hq(user, auth_store)
        cycle = cycle_store._get_cycle(cycle_id)
        if not [item for item in self.results.values() if item.cycle_id == cycle_id]:
            self.generate_results(cycle_id=cycle_id, user=user, auth_store=auth_store)
        for result in [item for item in self.results.values() if item.cycle_id == cycle_id]:
            if result.status == "GENERATED":
                result.status = "PUBLISHED"
                result.confirmation_status = "PENDING_CONFIRMATION"
                result.published_by_ref = user.user_id
                result.published_at_ref = relative_datetime_iso()
                target = cycle.targets[result.cycle_target_id]
                target.result_id = result.result_id
                target.target_status = "RESULT_PENDING_CONFIRMATION"
        cycle_store._recompute_rollup(cycle)
        return self._cycle_result_payload(cycle, auth_store)

    def result_page(
        self,
        *,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        status: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        self._require_result_read(user, auth_store)
        if status is not None:
            validate_code(status, category="assessment_result_status", field="status")
        self.apply_auto_confirm(auth_store)
        records = [
            result
            for result in self.results.values()
            if self._can_access_result(result, user, auth_store)
            and (status is None or result.status == status)
        ]
        records.sort(key=lambda item: (item.cycle_id, item.result_id))
        start = (page - 1) * page_size
        end = start + page_size
        return {
            "items": [self._result_summary(item, auth_store) for item in records[start:end]],
            "page": page,
            "pageSize": page_size,
            "total": len(records),
        }

    def result_detail(
        self,
        *,
        result_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        self._require_result_read(user, auth_store)
        self.apply_auto_confirm(auth_store)
        result = self._get_result_for_user(result_id, user, auth_store)
        return self._result_detail(result, auth_store)

    def confirm_result(
        self,
        *,
        result_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        self._require_result_branch(user, auth_store)
        result = self._get_result_for_user(result_id, user, auth_store)
        self._require_published(result)
        self._ensure_confirmation_transition(
            result.confirmation_status, "confirm_assessment_result"
        )
        result.confirmation_status = "CONFIRMED"
        result.confirmations.append(
            ResultConfirmationRecord(
                confirmation_id=f"{result.result_id}-CONF-{len(result.confirmations) + 1:03d}",
                result_id=result.result_id,
                decision="CONFIRM",
                comment=payload.get("comment", ""),
                confirmed_by_ref=user.user_id,
                confirmed_at_ref=relative_datetime_iso(),
            ),
        )
        cycle = cycle_store._get_cycle(result.cycle_id)
        cycle.targets[result.cycle_target_id].target_status = "CONFIRMED"
        cycle_store._recompute_rollup(cycle)
        return self._result_detail(result, auth_store)

    def submit_appeal(
        self,
        *,
        result_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        self._require_score_appeal_branch(user, auth_store)
        result = self._get_result_for_user(result_id, user, auth_store)
        self._require_published(result)
        self._ensure_confirmation_transition(result.confirmation_status, "submit_score_appeal")
        if not payload.get("items"):
            raise AppError(
                code="VALIDATION_ERROR",
                message="Score appeal requires appeal items",
                status_code=422,
            )
        self._require_scoped_files(payload.get("fileIds") or [], user, auth_store)
        appeal_id = f"{result.result_id}-APPEAL-{len(result.appeals) + 1:03d}"
        appeal = ScoreAppealRecord(
            score_appeal_id=appeal_id,
            result_id=result.result_id,
            target_org_id=result.target_org_id,
            status="SUBMITTED",
            reason=payload["reason"],
            submitted_by_ref=user.user_id,
            submitted_at_ref=relative_datetime_iso(),
        )
        for index, item_payload in enumerate(payload["items"], start=1):
            result_item = self._resolve_result_item(result, item_payload)
            self._validate_appealable_item(result_item, item_payload)
            appeal_item = ScoreAppealItemRecord(
                score_appeal_item_id=f"{appeal_id}-ITEM-{index:03d}",
                score_appeal_id=appeal_id,
                result_item_id=result_item.result_item_id,
                requested_score=float(item_payload["requestedScore"]),
                adopted_score=None,
                reason=item_payload["reason"],
            )
            appeal.items[appeal_item.score_appeal_item_id] = appeal_item
            result_item.appeal_status = "SUBMITTED"
        for index, file_id in enumerate(list(dict.fromkeys(payload.get("fileIds") or [])), start=1):
            appeal.attachments[file_id] = ScoreAppealAttachmentRecord(
                score_appeal_attachment_id=f"{appeal_id}-ATT-{index:03d}",
                score_appeal_id=appeal_id,
                file_id=file_id,
                bound_by_ref=user.user_id,
                bound_at_ref=relative_datetime_iso(),
            )
        result.appeals[appeal_id] = appeal
        result.confirmation_status = "APPEALED"
        cycle = cycle_store._get_cycle(result.cycle_id)
        cycle.targets[result.cycle_target_id].target_status = "APPEALED"
        cycle_store._recompute_rollup(cycle)
        return self._appeal_view(appeal, auth_store)

    def decide_appeal(
        self,
        *,
        score_appeal_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        self._require_score_appeal_hq(user, auth_store)
        appeal, result = self._get_appeal(score_appeal_id)
        if appeal.status not in {"SUBMITTED", "UNDER_REVIEW"}:
            raise AppError(code="INVALID_STATE", message="Appeal already decided", status_code=409)
        decision = payload["decision"]
        validate_code(decision, category="assessment_score_appeal_decision", field="decision")
        if not (payload.get("decisionReason") or "").strip():
            raise AppError(
                code="VALIDATION_ERROR",
                message="decisionReason is required",
                status_code=422,
            )
        if decision in {"ADOPTED", "PARTIALLY_ADOPTED"}:
            self._apply_appeal_scores(result, appeal, payload)
        appeal.status = "UNDER_REVIEW"
        appeal.status = "REJECTED" if decision == "REJECTED" else "ADOPTED"
        appeal.decision = decision
        appeal.decision_reason = payload["decisionReason"].strip()
        appeal.decided_by_ref = user.user_id
        appeal.decided_at_ref = relative_datetime_iso()
        result.confirmation_status = "PENDING_CONFIRMATION"
        for item in appeal.items.values():
            result.items[item.result_item_id].appeal_status = appeal.status
        self._recompute_total(result)
        cycle = cycle_store._get_cycle(result.cycle_id)
        cycle.targets[result.cycle_target_id].target_status = "RESULT_PENDING_CONFIRMATION"
        cycle_store._recompute_rollup(cycle)
        return self._appeal_view(appeal, auth_store)

    def finalize_result(
        self,
        *,
        result_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        self._require_result_hq(user, auth_store)
        result = self._get_result(result_id)
        self._apply_auto_confirm_for_result(result)
        if self._open_appeals(result):
            raise AppError(
                code="INVALID_STATE",
                message="Result cannot finalize while score appeal is open",
                status_code=409,
            )
        self._ensure_confirmation_transition(
            result.confirmation_status, "finalize_assessment_result"
        )
        result.status = "FINALIZED"
        result.confirmation_status = "FINALIZED"
        result.finalized_by_ref = user.user_id
        result.finalized_at_ref = relative_datetime_iso()
        archive = RecordArchiveRecord(
            archive_id=f"{result.result_id}-ARCHIVE-001",
            result_id=result.result_id,
            archive_type="FINAL_RESULT",
            snapshot=self._result_detail(result, auth_store, include_archives=False),
            archived_by_ref=user.user_id,
            archived_at_ref=relative_datetime_iso(),
        )
        result.archives.append(archive)
        cycle = cycle_store._get_cycle(result.cycle_id)
        cycle.targets[result.cycle_target_id].target_status = "CLOSED"
        cycle_store._recompute_rollup(cycle)
        return self._result_detail(result, auth_store)

    def apply_auto_confirm(self, auth_store: SeedAuthStore) -> None:
        for result in self.results.values():
            self._apply_auto_confirm_for_result(result)
            if result.confirmation_status == "AUTO_CONFIRMED":
                cycle = cycle_store._get_cycle(result.cycle_id)
                cycle.targets[result.cycle_target_id].target_status = "CONFIRMED"
                cycle_store._recompute_rollup(cycle)

    def _create_result(
        self,
        cycle: AssessmentCycleRecord,
        review_task: ReviewTaskRecord,
        user: AuthUserRecord,
    ) -> ResultRecord:
        result_id = f"{review_task.cycle_target_id}-RESULT"
        result = ResultRecord(
            result_id=result_id,
            cycle_id=cycle.cycle_id,
            cycle_target_id=review_task.cycle_target_id,
            target_org_id=cycle.targets[review_task.cycle_target_id].org_id,
            review_task_id=review_task.review_task_id,
            status="GENERATED",
            confirmation_status="PENDING_CONFIRMATION",
            total_score=0,
            grade_code=None,
            confirmation_deadline=relative_date_iso(7),
            generated_by_ref=user.user_id,
            generated_at_ref=relative_datetime_iso(),
        )
        for index, review_item in enumerate(review_task.items.values(), start=1):
            final_score = float(review_item.final_score or 0)
            original_score = float(
                review_item.preliminary_score
                if review_item.preliminary_score is not None
                else final_score,
            )
            result_item = ResultItemRecord(
                result_item_id=f"{result_id}-ITEM-{index:03d}",
                result_id=result_id,
                review_item_id=review_item.review_item_id,
                indicator_id=review_item.indicator_id,
                version_id=review_item.version_id,
                original_score=original_score,
                final_score=final_score,
            )
            result.items[result_item.result_item_id] = result_item
        self._recompute_total(result)
        self.results[result_id] = result
        cycle.targets[review_task.cycle_target_id].result_id = result_id
        return result

    def _apply_appeal_scores(
        self,
        result: ResultRecord,
        appeal: ScoreAppealRecord,
        payload: dict[str, Any],
    ) -> None:
        decision = payload["decision"]
        if decision == "PARTIALLY_ADOPTED" and not payload.get("items"):
            raise AppError(
                code="VALIDATION_ERROR",
                message="Partial adoption requires explicit item decisions",
                status_code=422,
            )
        adopted_by_item_id = {
            item.get("scoreAppealItemId"): item.get("adoptedScore")
            for item in payload.get("items", [])
            if item.get("scoreAppealItemId")
        }
        unknown_decision_items = set(adopted_by_item_id) - set(appeal.items)
        if unknown_decision_items:
            raise AppError(
                code="VALIDATION_ERROR",
                message="Appeal decision item not found",
                status_code=422,
                details={"scoreAppealItemIds": sorted(unknown_decision_items)},
            )
        for appeal_item in appeal.items.values():
            result_item = result.items[appeal_item.result_item_id]
            if appeal_item.score_appeal_item_id in adopted_by_item_id:
                adopted_score = adopted_by_item_id[appeal_item.score_appeal_item_id]
            elif decision == "ADOPTED":
                adopted_score = appeal_item.requested_score
            else:
                raise AppError(
                    code="VALIDATION_ERROR",
                    message="Partial adoption requires every appealed item to be decided",
                    status_code=422,
                    details={"scoreAppealItemId": appeal_item.score_appeal_item_id},
                )
            self._validate_adopted_score(result_item, adopted_score)
            appeal_item.adopted_score = float(adopted_score)
            result_item.final_score = float(adopted_score)

    def _apply_auto_confirm_for_result(self, result: ResultRecord) -> None:
        if result.status != "PUBLISHED" or result.confirmation_status != "PENDING_CONFIRMATION":
            return
        if self._open_appeals(result):
            return
        if result.confirmation_deadline < seed_base_date().isoformat():
            result.confirmation_status = "AUTO_CONFIRMED"

    def _recompute_total(self, result: ResultRecord) -> None:
        result.total_score = round(sum(item.final_score for item in result.items.values()), 4)
        result.grade_code = self._grade_for_score(result.total_score)

    @staticmethod
    def _grade_for_score(score: float) -> str:
        if score >= 90:
            return "A"
        if score >= 75:
            return "B"
        if score >= 60:
            return "C"
        return "D"

    def _cycle_result_payload(
        self,
        cycle: AssessmentCycleRecord,
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        return {
            "cycleId": cycle.cycle_id,
            "status": cycle.status,
            "results": [
                self._result_detail(result, auth_store)
                for result in self.results.values()
                if result.cycle_id == cycle.cycle_id
            ],
        }

    def _result_summary(self, result: ResultRecord, auth_store: SeedAuthStore) -> dict[str, Any]:
        return {
            "resultId": result.result_id,
            "cycleId": result.cycle_id,
            "cycleTargetId": result.cycle_target_id,
            "targetOrgId": result.target_org_id,
            "targetOrgSnapshot": auth_store.org_snapshot(result.target_org_id),
            "reviewTaskId": result.review_task_id,
            "status": result.status,
            "confirmationStatus": result.confirmation_status,
            "totalScore": result.total_score,
            "gradeCode": result.grade_code,
            "confirmationDeadline": result.confirmation_deadline,
        }

    def _result_detail(
        self,
        result: ResultRecord,
        auth_store: SeedAuthStore,
        *,
        include_archives: bool = True,
    ) -> dict[str, Any]:
        payload = {
            **self._result_summary(result, auth_store),
            "generatedByRef": result.generated_by_ref,
            "generatedAtRef": result.generated_at_ref,
            "publishedByRef": result.published_by_ref,
            "publishedAtRef": result.published_at_ref,
            "finalizedByRef": result.finalized_by_ref,
            "finalizedAtRef": result.finalized_at_ref,
            "items": [self._result_item_view(item) for item in result.items.values()],
            "confirmations": [self._confirmation_view(item) for item in result.confirmations],
            "appeals": [self._appeal_view(item, auth_store) for item in result.appeals.values()],
        }
        if include_archives:
            payload["archives"] = [self._archive_view(item) for item in result.archives]
        return payload

    @staticmethod
    def _result_item_view(item: ResultItemRecord) -> dict[str, Any]:
        return {
            "resultItemId": item.result_item_id,
            "resultId": item.result_id,
            "reviewItemId": item.review_item_id,
            "indicatorId": item.indicator_id,
            "versionId": item.version_id,
            "originalScore": item.original_score,
            "finalScore": item.final_score,
            "appealStatus": item.appeal_status,
        }

    @staticmethod
    def _confirmation_view(item: ResultConfirmationRecord) -> dict[str, Any]:
        return {
            "confirmationId": item.confirmation_id,
            "resultId": item.result_id,
            "decision": item.decision,
            "comment": item.comment,
            "confirmedByRef": item.confirmed_by_ref,
            "confirmedAtRef": item.confirmed_at_ref,
        }

    def _appeal_view(self, appeal: ScoreAppealRecord, auth_store: SeedAuthStore) -> dict[str, Any]:
        return {
            "scoreAppealId": appeal.score_appeal_id,
            "resultId": appeal.result_id,
            "targetOrgId": appeal.target_org_id,
            "targetOrgSnapshot": auth_store.org_snapshot(appeal.target_org_id),
            "status": appeal.status,
            "reason": appeal.reason,
            "submittedByRef": appeal.submitted_by_ref,
            "submittedAtRef": appeal.submitted_at_ref,
            "decidedByRef": appeal.decided_by_ref,
            "decidedAtRef": appeal.decided_at_ref,
            "decision": appeal.decision,
            "decisionReason": appeal.decision_reason,
            "items": [self._appeal_item_view(item) for item in appeal.items.values()],
            "attachments": [
                self._appeal_attachment_view(item) for item in appeal.attachments.values()
            ],
        }

    @staticmethod
    def _appeal_item_view(item: ScoreAppealItemRecord) -> dict[str, Any]:
        return {
            "scoreAppealItemId": item.score_appeal_item_id,
            "scoreAppealId": item.score_appeal_id,
            "resultItemId": item.result_item_id,
            "requestedScore": item.requested_score,
            "adoptedScore": item.adopted_score,
            "reason": item.reason,
        }

    @staticmethod
    def _appeal_attachment_view(item: ScoreAppealAttachmentRecord) -> dict[str, Any]:
        return {
            "scoreAppealAttachmentId": item.score_appeal_attachment_id,
            "scoreAppealId": item.score_appeal_id,
            "fileId": item.file_id,
            "file": evidence_store.file_view(evidence_store.file_assets[item.file_id]),
            "boundByRef": item.bound_by_ref,
            "boundAtRef": item.bound_at_ref,
        }

    @staticmethod
    def _archive_view(item: RecordArchiveRecord) -> dict[str, Any]:
        return {
            "archiveId": item.archive_id,
            "resultId": item.result_id,
            "archiveType": item.archive_type,
            "snapshot": item.snapshot,
            "archivedByRef": item.archived_by_ref,
            "archivedAtRef": item.archived_at_ref,
        }

    def _resolve_result_item(
        self,
        result: ResultRecord,
        payload: dict[str, Any],
    ) -> ResultItemRecord:
        result_item_id = payload.get("resultItemId")
        for item in result.items.values():
            if item.result_item_id == result_item_id:
                return item
        raise AppError(
            code="VALIDATION_ERROR",
            message="Result item not found",
            status_code=422,
            details={"resultItemId": result_item_id},
        )

    @staticmethod
    def _validate_appealable_item(
        result_item: ResultItemRecord,
        payload: dict[str, Any],
    ) -> None:
        requested_score = payload.get("requestedScore")
        if requested_score is None:
            raise AppError(
                code="VALIDATION_ERROR",
                message="Score appeal requires requestedScore",
                status_code=422,
            )
        if result_item.final_score >= result_item.original_score:
            raise AppError(
                code="INVALID_STATE",
                message="Only deducted result items can be appealed",
                status_code=409,
                details={"resultItemId": result_item.result_item_id},
            )
        requested = float(requested_score)
        if requested <= result_item.final_score or requested > result_item.original_score:
            raise AppError(
                code="VALIDATION_ERROR",
                message="requestedScore must be above current score and not exceed original score",
                status_code=422,
                details={
                    "resultItemId": result_item.result_item_id,
                    "finalScore": result_item.final_score,
                    "originalScore": result_item.original_score,
                },
            )

    @staticmethod
    def _validate_adopted_score(result_item: ResultItemRecord, raw_score: Any) -> None:
        if raw_score is None:
            raise AppError(
                code="VALIDATION_ERROR",
                message="adoptedScore is required for appeal decision item",
                status_code=422,
                details={"resultItemId": result_item.result_item_id},
            )
        adopted_score = float(raw_score)
        if adopted_score < result_item.final_score or adopted_score > result_item.original_score:
            raise AppError(
                code="VALIDATION_ERROR",
                message="adoptedScore must be between current score and original score",
                status_code=422,
                details={
                    "resultItemId": result_item.result_item_id,
                    "finalScore": result_item.final_score,
                    "originalScore": result_item.original_score,
                },
            )

    def _get_result_for_user(
        self,
        result_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> ResultRecord:
        result = self._get_result(result_id)
        if not self._can_access_result(result, user, auth_store):
            raise ForbiddenError()
        return result

    def _get_result(self, result_id: str) -> ResultRecord:
        result = self.results.get(result_id)
        if not result:
            raise NotFoundError("Assessment result not found")
        return result

    def _get_appeal(self, score_appeal_id: str) -> tuple[ScoreAppealRecord, ResultRecord]:
        for result in self.results.values():
            appeal = result.appeals.get(score_appeal_id)
            if appeal:
                return appeal, result
        raise NotFoundError("Assessment score appeal not found")

    def _result_for_target(self, cycle_target_id: str) -> ResultRecord | None:
        return next(
            (
                result
                for result in self.results.values()
                if result.cycle_target_id == cycle_target_id
            ),
            None,
        )

    @staticmethod
    def _open_appeals(result: ResultRecord) -> list[ScoreAppealRecord]:
        return [
            appeal
            for appeal in result.appeals.values()
            if appeal.status in {"SUBMITTED", "UNDER_REVIEW"}
        ]

    @staticmethod
    def _ensure_confirmation_transition(status: str, action: str) -> None:
        transition = assessment_transition_for(
            machine="assessmentResultConfirmation",
            state=status,
            action=action,
        )
        if transition is None:
            raise AppError(
                code="INVALID_STATE",
                message="Invalid assessment result confirmation transition",
                status_code=409,
                details={"status": status, "action": action},
            )

    @staticmethod
    def _require_published(result: ResultRecord) -> None:
        if result.status != "PUBLISHED":
            raise AppError(
                code="INVALID_STATE",
                message="Result action requires a published result",
                status_code=409,
                details={"resultId": result.result_id, "status": result.status},
            )

    @staticmethod
    def _can_access_result(
        result: ResultRecord,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> bool:
        if auth_store.has_permission(user, "PERM-P1-ASSESSMENT-RESULT-HQ"):
            return True
        if not any(role_id.startswith("ROLE_BRANCH") for role_id in user.role_ids):
            return auth_store.has_permission(user, "PERM-P1-ASSESSMENT-RESULT-READ")
        if result.status == "GENERATED":
            return False
        return auth_store.org_in_scope(user, result.target_org_id)

    @staticmethod
    def _require_scoped_files(
        file_ids: list[str],
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> None:
        missing = [file_id for file_id in file_ids if file_id not in evidence_store.file_assets]
        if missing:
            raise AppError(
                code="FILE_ASSET_NOT_FOUND",
                message="File asset not found",
                status_code=404,
                details={"fileIds": missing},
            )
        cross_scope = [
            file_id
            for file_id in file_ids
            if not auth_store.org_in_scope(
                user,
                auth_store.users[evidence_store.file_assets[file_id].uploaded_by].org_id,
            )
        ]
        if cross_scope:
            raise AppError(
                code="FILE_ASSET_NOT_FOUND",
                message="File asset not found",
                status_code=404,
                details={"fileIds": cross_scope},
            )

    @staticmethod
    def _require_result_hq(user: AuthUserRecord, auth_store: SeedAuthStore) -> None:
        auth_store.require_permission(user, "PERM-P1-ASSESSMENT-RESULT-HQ")

    @staticmethod
    def _require_result_read(user: AuthUserRecord, auth_store: SeedAuthStore) -> None:
        auth_store.require_permission(user, "PERM-P1-ASSESSMENT-RESULT-READ")

    @staticmethod
    def _require_result_branch(user: AuthUserRecord, auth_store: SeedAuthStore) -> None:
        auth_store.require_permission(user, "PERM-P1-ASSESSMENT-RESULT-BRANCH")

    @staticmethod
    def _require_score_appeal_branch(user: AuthUserRecord, auth_store: SeedAuthStore) -> None:
        auth_store.require_permission(user, "PERM-P1-ASSESSMENT-SCORE-APPEAL-BRANCH")

    @staticmethod
    def _require_score_appeal_hq(user: AuthUserRecord, auth_store: SeedAuthStore) -> None:
        auth_store.require_permission(user, "PERM-P1-ASSESSMENT-SCORE-APPEAL-HQ")


result_store = SeedResultStore()
