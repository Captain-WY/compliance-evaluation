from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, field
from typing import Any

from app.modules.compliance.core.errors import AppError, ForbiddenError, NotFoundError
from app.modules.compliance.domain.auth_store import AuthUserRecord, SeedAuthStore
from app.modules.compliance.domain.cycle_store import (
    AssessmentCycleRecord,
    ReportingTaskRecord,
    cycle_store,
)
from app.modules.compliance.domain.dictionaries import assessment_transition_for, validate_code
from app.modules.compliance.domain.reporting_store import ResponseItemRecord, reporting_store
from app.modules.compliance.domain.seed_time import relative_date_iso, relative_datetime_iso
from app.modules.compliance.domain.task_store import (
    UnifiedTaskActionTargetRecord,
    UnifiedTaskRecord,
    can_see_task,
    task_store,
)

DEFAULT_REVIEW_ASSIGNEE_USER_ID = "USER-HQ-COMP-001"


@dataclass
class ReviewItemRecord:
    review_item_id: str
    review_task_id: str
    response_item_id: str
    indicator_id: str
    version_id: str
    preliminary_score: float | None = None
    final_score: float | None = None
    comment: str = ""
    status: str = "PENDING"


@dataclass
class ScoreAdjustmentRecord:
    adjustment_id: str
    review_task_id: str
    review_item_id: str
    adjustment_type: str
    score_delta: float
    reason: str
    created_by_ref: str
    created_at_ref: str


@dataclass
class ReviewDecisionRecord:
    decision_id: str
    review_task_id: str
    decision: str
    decision_reason: str
    decided_by_ref: str
    decided_at_ref: str


@dataclass
class AIInsightSnapshotRecord:
    insight_snapshot_id: str
    review_task_id: str
    provider: str
    model: str
    summary: str
    payload: dict[str, Any]
    created_by_ref: str
    created_at_ref: str


@dataclass
class ReviewTaskRecord:
    review_task_id: str
    cycle_id: str
    cycle_target_id: str
    reporting_task_id: str
    assignee_user_id: str | None
    unified_task_id: str
    status: str = "PENDING"
    started_at_ref: str | None = None
    completed_at_ref: str | None = None
    items: dict[str, ReviewItemRecord] = field(default_factory=dict)
    adjustments: dict[str, ScoreAdjustmentRecord] = field(default_factory=dict)
    decisions: list[ReviewDecisionRecord] = field(default_factory=list)
    ai_insight_snapshots: list[AIInsightSnapshotRecord] = field(default_factory=list)


class ReviewTaskVisibilityReadModel:
    """Explicit task visibility read model for legacy assessment review routes."""

    def __init__(self, tasks: list[UnifiedTaskRecord]) -> None:
        self._tasks = list({task.task_id: task for task in tasks}.values())

    @classmethod
    def from_memory(cls) -> "ReviewTaskVisibilityReadModel":
        return cls(task_store.all_task_records())

    def has_visible_project_task(
        self,
        *,
        project_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        exclude_task_id: str | None = None,
    ) -> bool:
        return any(
            task.project_id == project_id
            and task.task_id != exclude_task_id
            and can_see_task(task, user, auth_store)
            for task in self._tasks
        )


class SeedReviewStore:
    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self.review_tasks: dict[str, ReviewTaskRecord] = {}

    def review_page(
        self,
        *,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        task_visibility: ReviewTaskVisibilityReadModel | None = None,
        status: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        self._require_review(user, auth_store)
        if status is not None:
            validate_code(status, category="assessment_review_status", field="status")
        self.materialize_from_reporting(auth_store)
        task_visibility = task_visibility or ReviewTaskVisibilityReadModel.from_memory()
        records = [
            task
            for task in self.review_tasks.values()
            if self._can_access_review_task(task, user, auth_store, task_visibility)
            and (status is None or task.status == status)
        ]
        records.sort(key=lambda item: (item.status, item.review_task_id))
        start = (page - 1) * page_size
        end = start + page_size
        return {
            "items": [self._review_summary(item, auth_store) for item in records[start:end]],
            "page": page,
            "pageSize": page_size,
            "total": len(records),
        }

    def review_detail(
        self,
        *,
        review_task_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        task_visibility: ReviewTaskVisibilityReadModel | None = None,
    ) -> dict[str, Any]:
        self._require_review(user, auth_store)
        self.materialize_from_reporting(auth_store)
        task_visibility = task_visibility or ReviewTaskVisibilityReadModel.from_memory()
        task = self._get_review_task_for_user(review_task_id, user, auth_store, task_visibility)
        return self._review_detail(task, auth_store)

    def start_review(
        self,
        *,
        review_task_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        task_visibility: ReviewTaskVisibilityReadModel | None = None,
    ) -> dict[str, Any]:
        self._require_review(user, auth_store)
        self.materialize_from_reporting(auth_store)
        task_visibility = task_visibility or ReviewTaskVisibilityReadModel.from_memory()
        task = self._get_review_task_for_user(review_task_id, user, auth_store, task_visibility)
        self._ensure_transition(task.status, "start_assessment_review")
        cycle, reporting_task = self._get_reporting_context(task)
        task.status = "IN_REVIEW"
        task.started_at_ref = relative_datetime_iso()
        target = cycle.targets[task.cycle_target_id]
        target.review_status = "IN_REVIEW"
        target.target_status = "UNDER_REVIEW"
        self._set_review_unified_task_status(task, "IN_PROGRESS")
        cycle_store._recompute_rollup(cycle)
        return self._review_detail(task, auth_store)

    def save_review(
        self,
        *,
        review_task_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        payload: dict[str, Any],
        task_visibility: ReviewTaskVisibilityReadModel | None = None,
    ) -> dict[str, Any]:
        self._require_review(user, auth_store)
        self.materialize_from_reporting(auth_store)
        task_visibility = task_visibility or ReviewTaskVisibilityReadModel.from_memory()
        task = self._get_review_task_for_user(review_task_id, user, auth_store, task_visibility)
        if task.status != "IN_REVIEW":
            raise AppError(
                code="INVALID_STATE",
                message="Review must be started before comments or adjustments can be saved",
                status_code=409,
                details={"reviewTaskId": review_task_id, "status": task.status},
            )
        draft_task = deepcopy(task)
        self._apply_item_patches(draft_task, payload.get("items") or [])
        self._apply_adjustments(draft_task, payload.get("scoreAdjustments") or [], user)
        if "aiInsightSnapshot" in payload:
            self._append_ai_insight(draft_task, payload["aiInsightSnapshot"], user)
        self._validate_adjustment_ranges(draft_task)
        task.items = draft_task.items
        task.adjustments = draft_task.adjustments
        task.ai_insight_snapshots = draft_task.ai_insight_snapshots
        return self._review_detail(task, auth_store)

    def decide(
        self,
        *,
        review_task_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        payload: dict[str, Any],
        task_visibility: ReviewTaskVisibilityReadModel | None = None,
    ) -> dict[str, Any]:
        self._require_review(user, auth_store)
        self.materialize_from_reporting(auth_store)
        task_visibility = task_visibility or ReviewTaskVisibilityReadModel.from_memory()
        task = self._get_review_task_for_user(review_task_id, user, auth_store, task_visibility)
        decision = payload["decision"]
        validate_code(decision, category="assessment_review_decision", field="decision")
        if decision not in {"APPROVE", "RETURN_TO_BRANCH"}:
            raise AppError(
                code="VALIDATION_ERROR",
                message="Review decision is not active in first P1",
                status_code=422,
                details={"decision": decision},
            )
        if decision == "RETURN_TO_BRANCH":
            reason = (payload.get("decisionReason") or "").strip()
            if not reason:
                raise AppError(
                    code="VALIDATION_ERROR",
                    message="decisionReason is required when returning reporting",
                    status_code=422,
                )
            return self._return_to_branch(task, user, auth_store, reason)
        return self._approve(task, user, auth_store, payload.get("decisionReason") or "")

    def materialize_from_reporting(self, auth_store: SeedAuthStore) -> None:
        for review_task in list(self.review_tasks.values()):
            cycle, reporting_task = self._get_reporting_context(review_task)
            if reporting_task.status == "SUBMITTED" or review_task.status != "PENDING":
                continue
            target = cycle.targets.get(review_task.cycle_target_id)
            if target:
                target.review_task_id = None
                target.review_status = None
            task_store.tasks.pop(review_task.unified_task_id, None)
            self.review_tasks.pop(review_task.review_task_id, None)
            cycle_store._recompute_rollup(cycle)

        for cycle in cycle_store.cycles.values():
            for reporting_task in cycle.reporting_tasks.values():
                if reporting_task.status != "SUBMITTED":
                    continue
                target = cycle.targets.get(reporting_task.cycle_target_id)
                if target is None:
                    continue
                review_task = self._task_for_reporting(reporting_task.reporting_task_id)
                if review_task is None:
                    review_task = self._create_review_task(cycle, reporting_task, auth_store)
                elif review_task.status == "RETURNED_TO_BRANCH":
                    self._reset_returned_review_for_resubmission(review_task, reporting_task)
                target.review_task_id = review_task.review_task_id
                target.review_status = review_task.status
                self._ensure_review_items(review_task, reporting_task)

    def _create_review_task(
        self,
        cycle: AssessmentCycleRecord,
        reporting_task: ReportingTaskRecord,
        auth_store: SeedAuthStore,
    ) -> ReviewTaskRecord:
        review_task_id = f"{reporting_task.reporting_task_id}-REVIEW"
        unified_task_id = f"TASK-ASSESS-REVIEW-{len(self.review_tasks) + 1:03d}"
        assignee_user_id = (
            DEFAULT_REVIEW_ASSIGNEE_USER_ID
            if DEFAULT_REVIEW_ASSIGNEE_USER_ID in auth_store.users
            else None
        )
        review_task = ReviewTaskRecord(
            review_task_id=review_task_id,
            cycle_id=cycle.cycle_id,
            cycle_target_id=reporting_task.cycle_target_id,
            reporting_task_id=reporting_task.reporting_task_id,
            assignee_user_id=assignee_user_id,
            unified_task_id=unified_task_id,
        )
        self.review_tasks[review_task_id] = review_task
        target = cycle.targets[reporting_task.cycle_target_id]
        target.review_task_id = review_task_id
        target.review_status = "PENDING"
        task_store.upsert_task(
            UnifiedTaskRecord(
                task_id=unified_task_id,
                category="ASSESSMENT",
                action_type="REVIEW",
                title=f"{cycle.cycle_name} 总部复核",
                description="HQ assessment review task generated from branch submission.",
                priority="HIGH",
                due_date=relative_date_iso(7),
                status="PENDING",
                source_id=review_task_id,
                scope="hq",
                scoped_org_id="WLZQ-HQ-COMPLIANCE",
                assigned_user_id=assignee_user_id,
                reviewer_role_ids=[],
                project_id=cycle.cycle_id,
                created_at=relative_datetime_iso(),
                action_target=UnifiedTaskActionTargetRecord(
                    kind="route",
                    menu_id="hq-review",
                    app_path="/hq/assessment/review",
                    public_path="/compliance/hq/assessment/review",
                    params={
                        "cycleId": cycle.cycle_id,
                        "cycleTargetId": reporting_task.cycle_target_id,
                        "reportingTaskId": reporting_task.reporting_task_id,
                        "reviewTaskId": review_task_id,
                        "targetOrgId": reporting_task.target_org_id,
                    },
                    action="ASSESSMENT_REVIEW_OPEN",
                ),
            ),
        )
        self._ensure_review_items(review_task, reporting_task)
        cycle_store._recompute_rollup(cycle)
        return review_task

    def _reset_returned_review_for_resubmission(
        self,
        review_task: ReviewTaskRecord,
        reporting_task: ReportingTaskRecord,
    ) -> None:
        review_task.status = "PENDING"
        review_task.started_at_ref = None
        review_task.completed_at_ref = None
        review_task.items = {}
        review_task.adjustments = {}
        review_task.ai_insight_snapshots = []
        self._set_review_unified_task_status(review_task, "PENDING")
        self._ensure_review_items(review_task, reporting_task)

    def _ensure_review_items(
        self,
        review_task: ReviewTaskRecord,
        reporting_task: ReportingTaskRecord,
    ) -> None:
        for index, response_item in enumerate(
            reporting_store._items_for_task(reporting_task.reporting_task_id),
            start=1,
        ):
            if any(
                item.response_item_id == response_item.response_item_id
                for item in review_task.items.values()
            ):
                continue
            review_item_id = f"{review_task.review_task_id}-ITEM-{index:03d}"
            review_task.items[review_item_id] = ReviewItemRecord(
                review_item_id=review_item_id,
                review_task_id=review_task.review_task_id,
                response_item_id=response_item.response_item_id,
                indicator_id=response_item.indicator_id,
                version_id=response_item.version_id,
            )

    def _apply_item_patches(
        self,
        review_task: ReviewTaskRecord,
        item_payloads: list[dict[str, Any]],
    ) -> None:
        for item_payload in item_payloads:
            item = self._resolve_review_item(review_task, item_payload)
            if "comment" in item_payload:
                item.comment = item_payload["comment"]
            if "preliminaryScore" in item_payload:
                item.preliminary_score = float(item_payload["preliminaryScore"])
            if "status" in item_payload:
                if item_payload["status"] not in {"PENDING", "COMPLETE"}:
                    raise AppError(
                        code="VALIDATION_ERROR",
                        message="Review item status is invalid",
                        status_code=422,
                        details={"status": item_payload["status"]},
                    )
                item.status = item_payload["status"]
            elif item_payload.get("reviewed") is True or item.preliminary_score is not None:
                item.status = "COMPLETE"
            self._recompute_item_final_score(review_task, item)

    def _apply_adjustments(
        self,
        review_task: ReviewTaskRecord,
        adjustment_payloads: list[dict[str, Any]],
        user: AuthUserRecord,
    ) -> None:
        touched_item_ids: set[str] = set()
        resolved: list[tuple[ReviewItemRecord, dict[str, Any]]] = []
        for adjustment_payload in adjustment_payloads:
            item = self._resolve_review_item(review_task, adjustment_payload)
            reason = adjustment_payload["reason"].strip()
            if not reason:
                raise AppError(
                    code="VALIDATION_ERROR",
                    message="Score adjustment reason is required",
                    status_code=422,
                )
            resolved.append((item, adjustment_payload))
            touched_item_ids.add(item.review_item_id)
        review_task.adjustments = {
            adjustment_id: adjustment
            for adjustment_id, adjustment in review_task.adjustments.items()
            if adjustment.review_item_id not in touched_item_ids
        }
        for item, adjustment_payload in resolved:
            index = (
                len(
                    [
                        adjustment
                        for adjustment in review_task.adjustments.values()
                        if adjustment.review_item_id == item.review_item_id
                    ],
                )
                + 1
            )
            adjustment_id = f"{item.review_item_id}-ADJ-{index:03d}"
            review_task.adjustments[adjustment_id] = ScoreAdjustmentRecord(
                adjustment_id=adjustment_id,
                review_task_id=review_task.review_task_id,
                review_item_id=item.review_item_id,
                adjustment_type=adjustment_payload.get("adjustmentType", "MANUAL"),
                score_delta=float(adjustment_payload["scoreDelta"]),
                reason=adjustment_payload["reason"].strip(),
                created_by_ref=user.user_id,
                created_at_ref=relative_datetime_iso(),
            )
            self._recompute_item_final_score(review_task, item)

    def _append_ai_insight(
        self,
        review_task: ReviewTaskRecord,
        payload: dict[str, Any],
        user: AuthUserRecord,
    ) -> None:
        snapshot = AIInsightSnapshotRecord(
            insight_snapshot_id=(
                f"{review_task.review_task_id}-AI-{len(review_task.ai_insight_snapshots) + 1:03d}"
            ),
            review_task_id=review_task.review_task_id,
            provider=payload.get("provider", "manual"),
            model=payload.get("model", "none"),
            summary=payload.get("summary", ""),
            payload=payload.get("payload", {}),
            created_by_ref=user.user_id,
            created_at_ref=relative_datetime_iso(),
        )
        review_task.ai_insight_snapshots.append(snapshot)

    def _approve(
        self,
        review_task: ReviewTaskRecord,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        reason: str,
    ) -> dict[str, Any]:
        self._ensure_transition(review_task.status, "approve_assessment_review")
        incomplete = [
            item.review_item_id
            for item in review_task.items.values()
            if item.status != "COMPLETE" or item.final_score is None
        ]
        if incomplete:
            raise AppError(
                code="VALIDATION_ERROR",
                message="All review items must be complete before approval",
                status_code=422,
                details={"reviewItemIds": incomplete},
            )
        self._validate_adjustment_ranges(review_task)
        cycle, reporting_task = self._get_reporting_context(review_task)
        reporting_store._ensure_transition(reporting_task.status, "approve_assessment_review")
        review_task.status = "APPROVED"
        review_task.completed_at_ref = relative_datetime_iso()
        self._append_decision(review_task, "APPROVE", reason, user)
        reporting_store._set_reporting_status(cycle, reporting_task, "ACCEPTED")
        target = cycle.targets[review_task.cycle_target_id]
        target.review_status = "APPROVED"
        target.target_status = "UNDER_REVIEW"
        self._set_review_unified_task_status(review_task, "DONE")
        cycle_store._recompute_rollup(cycle)
        return self._review_detail(review_task, auth_store)

    def _return_to_branch(
        self,
        review_task: ReviewTaskRecord,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        reason: str,
    ) -> dict[str, Any]:
        self._ensure_transition(review_task.status, "return_assessment_reporting")
        cycle, reporting_task = self._get_reporting_context(review_task)
        reporting_store._ensure_transition(reporting_task.status, "return_assessment_reporting")
        review_task.status = "RETURNED_TO_BRANCH"
        review_task.completed_at_ref = relative_datetime_iso()
        self._append_decision(review_task, "RETURN_TO_BRANCH", reason, user)
        reporting_store._set_reporting_status(cycle, reporting_task, "RETURNED")
        target = cycle.targets[review_task.cycle_target_id]
        target.review_status = "RETURNED_TO_BRANCH"
        target.target_status = "REPORTING"
        reporting_store._set_unified_task_status(reporting_task, "PENDING")
        self._set_review_unified_task_status(review_task, "DONE")
        cycle_store._recompute_rollup(cycle)
        return self._review_detail(review_task, auth_store)

    def _validate_adjustment_ranges(self, review_task: ReviewTaskRecord) -> None:
        errors: list[dict[str, Any]] = []
        for item in review_task.items.values():
            if item.preliminary_score is None:
                continue
            max_score = self._max_score_for_item(item)
            final_score = self._recompute_item_final_score(review_task, item)
            if final_score < 0 or final_score > max_score:
                errors.append(
                    {
                        "reviewItemId": item.review_item_id,
                        "finalScore": final_score,
                        "maxScore": max_score,
                    },
                )
        if errors:
            raise AppError(
                code="VALIDATION_ERROR",
                message="Score adjustment produces out-of-range final score",
                status_code=422,
                details={"items": errors},
            )

    def _recompute_item_final_score(
        self,
        review_task: ReviewTaskRecord,
        item: ReviewItemRecord,
    ) -> float | None:
        if item.preliminary_score is None:
            item.final_score = None
            return None
        delta = sum(
            adjustment.score_delta
            for adjustment in review_task.adjustments.values()
            if adjustment.review_item_id == item.review_item_id
        )
        item.final_score = round(float(item.preliminary_score) + delta, 4)
        return item.final_score

    def _append_decision(
        self,
        review_task: ReviewTaskRecord,
        decision: str,
        reason: str,
        user: AuthUserRecord,
    ) -> None:
        decision_id = f"{review_task.review_task_id}-DEC-{len(review_task.decisions) + 1:03d}"
        review_task.decisions.append(
            ReviewDecisionRecord(
                decision_id=decision_id,
                review_task_id=review_task.review_task_id,
                decision=decision,
                decision_reason=reason,
                decided_by_ref=user.user_id,
                decided_at_ref=relative_datetime_iso(),
            ),
        )

    def _get_review_task_for_user(
        self,
        review_task_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        task_visibility: ReviewTaskVisibilityReadModel,
    ) -> ReviewTaskRecord:
        task = self.review_tasks.get(review_task_id)
        if task is None:
            raise NotFoundError("Assessment review task not found")
        if not self._can_access_review_task(task, user, auth_store, task_visibility):
            raise ForbiddenError()
        return task

    def _task_for_reporting(self, reporting_task_id: str) -> ReviewTaskRecord | None:
        return next(
            (
                review_task
                for review_task in self.review_tasks.values()
                if review_task.reporting_task_id == reporting_task_id
            ),
            None,
        )

    @staticmethod
    def _get_reporting_context(
        review_task: ReviewTaskRecord,
    ) -> tuple[AssessmentCycleRecord, ReportingTaskRecord]:
        for cycle in cycle_store.cycles.values():
            reporting_task = cycle.reporting_tasks.get(review_task.reporting_task_id)
            if reporting_task is not None:
                return cycle, reporting_task
        raise NotFoundError("Assessment reporting task not found")

    def _resolve_review_item(
        self,
        review_task: ReviewTaskRecord,
        payload: dict[str, Any],
    ) -> ReviewItemRecord:
        review_item_id = payload.get("reviewItemId")
        response_item_id = payload.get("responseItemId")
        for item in review_task.items.values():
            if review_item_id and item.review_item_id == review_item_id:
                return item
            if response_item_id and item.response_item_id == response_item_id:
                return item
        raise AppError(
            code="VALIDATION_ERROR",
            message="Review item not found",
            status_code=422,
            details={"reviewItemId": review_item_id, "responseItemId": response_item_id},
        )

    def _max_score_for_item(self, review_item: ReviewItemRecord) -> float:
        response_item = self._response_item_for_review_item(review_item)
        return float(response_item.indicator_snapshot.get("maxScore", 100))

    @staticmethod
    def _response_item_for_review_item(review_item: ReviewItemRecord) -> ResponseItemRecord:
        item = reporting_store.response_items.get(review_item.response_item_id)
        if item is None:
            raise NotFoundError("Assessment response item not found")
        return item

    def _review_summary(
        self,
        review_task: ReviewTaskRecord,
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        cycle, reporting_task = self._get_reporting_context(review_task)
        target = cycle.targets[review_task.cycle_target_id]
        return {
            "reviewTaskId": review_task.review_task_id,
            "cycleId": review_task.cycle_id,
            "cycleTargetId": review_task.cycle_target_id,
            "reportingTaskId": review_task.reporting_task_id,
            "targetOrgId": reporting_task.target_org_id,
            "targetOrgSnapshot": auth_store.org_snapshot(reporting_task.target_org_id),
            "assigneeUserId": review_task.assignee_user_id,
            "assigneeSnapshot": (
                auth_store.user_snapshot(review_task.assignee_user_id)
                if review_task.assignee_user_id
                else None
            ),
            "unifiedTaskId": review_task.unified_task_id,
            "status": review_task.status,
            "targetStatus": target.target_status,
            "startedAtRef": review_task.started_at_ref,
            "completedAtRef": review_task.completed_at_ref,
            "itemCount": len(review_task.items),
            "completedItemCount": len(
                [item for item in review_task.items.values() if item.status == "COMPLETE"],
            ),
        }

    def _review_detail(
        self,
        review_task: ReviewTaskRecord,
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        cycle, reporting_task = self._get_reporting_context(review_task)
        return {
            **self._review_summary(review_task, auth_store),
            "schemeSnapshot": cycle.scheme_snapshot,
            "reportingTask": reporting_store._reporting_detail(cycle, reporting_task, auth_store),
            "items": [
                self._review_item_view(item, review_task, auth_store)
                for item in review_task.items.values()
            ],
            "decisions": [self._decision_view(item) for item in review_task.decisions],
            "aiInsightSnapshots": [
                self._ai_insight_view(item) for item in review_task.ai_insight_snapshots
            ],
        }

    def _review_item_view(
        self,
        item: ReviewItemRecord,
        review_task: ReviewTaskRecord,
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        response_item = self._response_item_for_review_item(item)
        return {
            "reviewItemId": item.review_item_id,
            "reviewTaskId": item.review_task_id,
            "responseItemId": item.response_item_id,
            "indicatorId": item.indicator_id,
            "versionId": item.version_id,
            "responseItem": reporting_store._response_item_view(response_item, auth_store),
            "preliminaryScore": item.preliminary_score,
            "finalScore": item.final_score,
            "maxScore": self._max_score_for_item(item),
            "comment": item.comment,
            "status": item.status,
            "scoreAdjustments": [
                self._adjustment_view(adjustment)
                for adjustment in review_task.adjustments.values()
                if adjustment.review_item_id == item.review_item_id
            ],
        }

    @staticmethod
    def _adjustment_view(adjustment: ScoreAdjustmentRecord) -> dict[str, Any]:
        return {
            "adjustmentId": adjustment.adjustment_id,
            "reviewTaskId": adjustment.review_task_id,
            "reviewItemId": adjustment.review_item_id,
            "adjustmentType": adjustment.adjustment_type,
            "scoreDelta": adjustment.score_delta,
            "reason": adjustment.reason,
            "createdByRef": adjustment.created_by_ref,
            "createdAtRef": adjustment.created_at_ref,
        }

    @staticmethod
    def _decision_view(decision: ReviewDecisionRecord) -> dict[str, Any]:
        return {
            "decisionId": decision.decision_id,
            "reviewTaskId": decision.review_task_id,
            "decision": decision.decision,
            "decisionReason": decision.decision_reason,
            "decidedByRef": decision.decided_by_ref,
            "decidedAtRef": decision.decided_at_ref,
        }

    @staticmethod
    def _ai_insight_view(snapshot: AIInsightSnapshotRecord) -> dict[str, Any]:
        return {
            "insightSnapshotId": snapshot.insight_snapshot_id,
            "reviewTaskId": snapshot.review_task_id,
            "provider": snapshot.provider,
            "model": snapshot.model,
            "summary": snapshot.summary,
            "payload": snapshot.payload,
            "createdByRef": snapshot.created_by_ref,
            "createdAtRef": snapshot.created_at_ref,
        }

    @staticmethod
    def _set_review_unified_task_status(review_task: ReviewTaskRecord, status: str) -> None:
        unified_task = task_store.tasks.get(review_task.unified_task_id)
        if unified_task:
            unified_task.status = status

    @staticmethod
    def _can_access_review_task(
        review_task: ReviewTaskRecord,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        task_visibility: ReviewTaskVisibilityReadModel,
    ) -> bool:
        if review_task.assignee_user_id == user.user_id:
            return True
        return task_visibility.has_visible_project_task(
            project_id=review_task.cycle_id,
            user=user,
            auth_store=auth_store,
            exclude_task_id=review_task.unified_task_id,
        )

    @staticmethod
    def _ensure_transition(status: str, action: str) -> None:
        transition = assessment_transition_for(
            machine="assessmentReview",
            state=status,
            action=action,
        )
        if transition is None:
            raise AppError(
                code="INVALID_STATE",
                message="Invalid assessment review state transition",
                status_code=409,
                details={"status": status, "action": action},
            )

    @staticmethod
    def _require_review(user: AuthUserRecord, auth_store: SeedAuthStore) -> None:
        auth_store.require_permission(user, "PERM-P1-ASSESSMENT-REVIEW-HQ")


review_store = SeedReviewStore()
