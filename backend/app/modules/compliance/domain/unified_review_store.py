from __future__ import annotations

import hashlib
import json
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from app.modules.compliance.core.errors import AppError, ForbiddenError, NotFoundError
from app.modules.compliance.domain.auth_store import AuthUserRecord, SeedAuthStore, auth_store
from app.modules.compliance.domain.cycle_store import cycle_store
from app.modules.compliance.domain.reporting_store import reporting_store
from app.modules.compliance.domain.review_store import ReviewTaskRecord, review_store
from app.modules.compliance.domain.seed_time import relative_datetime_iso, seed_base_date
from app.modules.compliance.domain.task_store import UnifiedTaskRecord, can_see_task, task_store
from app.modules.compliance.domain.workflow_evaluator import RouteChainEvaluator
from app.modules.compliance.domain.workflow_models import (
    RouteAssignment,
    WorkflowRouteChain,
    WorkflowTemplateVersionSnapshot,
)
from app.modules.compliance.domain.workflow_store import WorkflowTemplateVersionRecord, workflow_template_store

READ_PERMISSION = "PERM-P2-UNIFIED-REVIEW-WORKBENCH-READ"
DECIDE_PERMISSION = "PERM-P2-UNIFIED-REVIEW-WORKBENCH-DECIDE"
BATCH_PERMISSION = "PERM-P2-UNIFIED-REVIEW-WORKBENCH-BATCH-DECIDE"

SOURCE_TYPE_ASSESSMENT_REVIEW = "P1_ASSESSMENT_REVIEW_TASK"
QUICK_PHRASE_MODE = "embedded_metadata"


class UnifiedReviewTaskReadModel:
    """Explicit task read model for unified review task metadata and scope checks."""

    def __init__(self, tasks: list[UnifiedTaskRecord]) -> None:
        self._tasks = list({task.task_id: task for task in tasks}.values())
        self._by_id = {task.task_id: task for task in self._tasks}

    @classmethod
    def from_memory(cls) -> "UnifiedReviewTaskReadModel":
        return cls(task_store.all_task_records())

    def get_task(self, task_id: str) -> UnifiedTaskRecord | None:
        return self._by_id.get(task_id)

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

    def source_submitter_user_id(self, reporting_task_id: str) -> str | None:
        task = self.get_task(reporting_task_id)
        if task and task.assigned_user_id:
            return task.assigned_user_id
        for task in self._tasks:
            if task.source_id == reporting_task_id and task.assigned_user_id:
                return task.assigned_user_id
        return None


@dataclass
class UnifiedReviewTaskLinkRecord:
    review_task_id: str
    source_review_task_id: str
    source_type: str
    workflow_template_id: str
    workflow_template_version_id: str
    route_chain_id: str
    current_level: str
    current_node_id: str | None
    current_assignment_snapshot_id: str | None
    status: str
    version: int
    draft_comment: str
    source_submitter_user_id: str | None
    target_org_id: str
    business_line: str | None
    source_snapshot: dict[str, Any]
    created_at: str
    updated_at: str


@dataclass
class ReviewAssignmentSnapshotRecord:
    assignment_snapshot_id: str
    review_task_id: str
    level: str
    node_id: str | None
    workflow_template_version_id: str
    route_chain_id: str
    approvers: list[dict[str, Any]]
    created_at: str


@dataclass
class UnifiedReviewDecisionEventRecord:
    decision_event_id: str
    review_task_id: str
    decision: str
    actor_user_id: str
    actor_snapshot: dict[str, Any]
    from_status: str
    to_status: str
    from_level: str
    to_level: str | None
    from_node_id: str | None
    to_node_id: str | None
    comment: str
    reason: str
    workflow_template_version_id: str
    route_chain_id: str
    source_task_ref: dict[str, Any]
    idempotency_key: str
    request_id: str | None
    version_before: int
    version_after: int
    event_created_at: str


class SeedUnifiedReviewStore:
    """P2 unified L0/L1/L2/L3 assessment review workbench overlay."""

    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self.links: dict[str, UnifiedReviewTaskLinkRecord] = {}
        self.assignment_snapshots: dict[str, ReviewAssignmentSnapshotRecord] = {}
        self.decision_events: dict[str, UnifiedReviewDecisionEventRecord] = {}
        self._idempotency_index: dict[str, str] = {}

    def hydrate(
        self,
        *,
        links: dict[str, UnifiedReviewTaskLinkRecord],
        assignment_snapshots: dict[str, ReviewAssignmentSnapshotRecord],
        decision_events: dict[str, UnifiedReviewDecisionEventRecord],
    ) -> None:
        self.links = links
        self.assignment_snapshots = assignment_snapshots
        self.decision_events = decision_events
        self._idempotency_index = {
            event.idempotency_key: event.decision_event_id
            for event in decision_events.values()
        }

    def review_page(
        self,
        *,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        task_read_model: UnifiedReviewTaskReadModel | None = None,
        bucket: str | None = None,
        source_org_id: str | None = None,
        category: str | None = None,
        urgent_only: bool | None = None,
        keyword: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        task_read_model = task_read_model or UnifiedReviewTaskReadModel.from_memory()
        self.materialize_from_p1(auth_store, task_read_model=task_read_model)
        bucket_key = (bucket or "todo").lower()
        rows = [
            self.summary_view(link, auth_store, task_read_model=task_read_model)
            for link in self.links.values()
            if self._can_read(link, user, auth_store, task_read_model=task_read_model)
        ]
        filtered = [
            row
            for row in rows
            if self._bucket_matches(row, bucket_key, user)
            and (source_org_id is None or row["targetOrgId"] == source_org_id)
            and (category is None or row.get("category") == category)
            and (urgent_only is not True or row["isOverdue"])
            and self._keyword_matches(row, keyword)
        ]
        filtered.sort(key=lambda item: (item["status"], item["currentLevel"], item["reviewTaskId"]))
        start = (page - 1) * page_size
        end = start + page_size
        return {
            "items": filtered[start:end],
            "page": page,
            "pageSize": page_size,
            "total": len(filtered),
            "summary": {
                "todo": sum(1 for item in rows if self._bucket_matches(item, "todo", user)),
                "done": sum(1 for item in rows if self._bucket_matches(item, "done", user)),
                "cc": sum(1 for item in rows if self._bucket_matches(item, "cc", user)),
            },
        }

    def review_detail(
        self,
        *,
        review_task_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        task_read_model: UnifiedReviewTaskReadModel | None = None,
    ) -> dict[str, Any]:
        task_read_model = task_read_model or UnifiedReviewTaskReadModel.from_memory()
        self.materialize_from_p1(auth_store, task_read_model=task_read_model)
        link = self._get_link_for_read(
            review_task_id,
            user,
            auth_store,
            task_read_model=task_read_model,
        )
        source = self._get_source_review_task(link)
        return {
            **self.summary_view(link, auth_store, task_read_model=task_read_model),
            "sourceContext": self._source_context(source, auth_store),
            "routeSnapshot": self._route_snapshot(link),
            "currentAssignment": self.assignment_view(link.current_assignment_snapshot_id),
            "quickPhrases": self.quick_phrases(),
            "comments": self._comment_views(link, auth_store),
            "auditTrail": self._audit_trail(link, auth_store),
            "actionEligibility": self.action_eligibility(link, user, auth_store),
        }

    def save_review(
        self,
        *,
        review_task_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        comment: str | None,
        version: int | None,
        task_read_model: UnifiedReviewTaskReadModel | None = None,
    ) -> dict[str, Any]:
        task_read_model = task_read_model or UnifiedReviewTaskReadModel.from_memory()
        self.materialize_from_p1(auth_store, task_read_model=task_read_model)
        link = self._get_link_for_decide(
            review_task_id,
            user,
            auth_store,
            task_read_model=task_read_model,
        )
        self._ensure_mutable(link)
        self._ensure_version(link, version)
        link.draft_comment = (comment or "").strip()
        link.version += 1
        link.updated_at = relative_datetime_iso()
        return self.review_detail(
            review_task_id=review_task_id,
            user=user,
            auth_store=auth_store,
            task_read_model=task_read_model,
        )

    def decide(
        self,
        *,
        review_task_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        decision: str,
        reason: str | None,
        comment: str | None,
        version: int | None,
        request_id: str | None,
        idempotency_key: str | None,
        task_read_model: UnifiedReviewTaskReadModel | None = None,
    ) -> dict[str, Any]:
        task_read_model = task_read_model or UnifiedReviewTaskReadModel.from_memory()
        self.materialize_from_p1(auth_store, task_read_model=task_read_model)
        link = self._get_link_for_read(
            review_task_id,
            user,
            auth_store,
            task_read_model=task_read_model,
        )
        normalized_decision = self._normalize_decision(decision)
        resolved_reason = (reason or comment or link.draft_comment or "").strip()
        key = self._decision_idempotency_key(
            link=link,
            user=user,
            decision=normalized_decision,
            reason=resolved_reason,
            request_id=request_id,
            explicit_key=idempotency_key,
        )
        duplicate_event_id = self._idempotency_index.get(key)
        if duplicate_event_id:
            return {
                **self.review_detail(
                    review_task_id=review_task_id,
                    user=user,
                    auth_store=auth_store,
                    task_read_model=task_read_model,
                ),
                "duplicate": True,
                "duplicateEventId": duplicate_event_id,
            }
        if not self._has_decide_grant(user, auth_store):
            raise ForbiddenError()
        if not self._actor_matches_current_assignment(link, user):
            raise AppError(
                code="REVIEW_ASSIGNMENT_MISMATCH",
                message="Actor is not assigned to the current review level",
                status_code=403,
            )
        self._ensure_mutable(link)
        self._ensure_version(link, version)

        before = deepcopy(link)
        version_before = link.version
        route_result = RouteChainEvaluator(auth=auth_store).resolve_next_level(
            current_item={
                "currentLevel": link.current_level,
                "sourceSubmitterUserId": link.source_submitter_user_id,
            },
            decision=normalized_decision,
            actor=user,
        )
        to_level = route_result.to_level
        to_node_id = None
        if to_level:
            to_node_id = self._node_id_for_level(link, to_level)
            assignment = self._create_assignment_snapshot(
                link=link,
                level=to_level,
                node_id=to_node_id,
                auth_store=auth_store,
            )
            link.current_assignment_snapshot_id = assignment.assignment_snapshot_id
        link.current_level = to_level or link.current_level
        link.current_node_id = to_node_id or link.current_node_id
        link.status = route_result.status
        link.version += 1
        link.draft_comment = ""
        link.updated_at = relative_datetime_iso()

        if route_result.is_final and route_result.status == "APPROVED":
            self._finalize_source_approval(link, user, auth_store, resolved_reason)

        event = self._append_decision_event(
            before=before,
            after=link,
            decision=normalized_decision,
            actor=user,
            auth_store=auth_store,
            comment=comment or "",
            reason=resolved_reason,
            idempotency_key=key,
            request_id=request_id,
            version_before=version_before,
        )
        self._idempotency_index[key] = event.decision_event_id
        return {
            **self.review_detail(
                review_task_id=review_task_id,
                user=user,
                auth_store=auth_store,
                task_read_model=task_read_model,
            ),
            "duplicate": False,
            "decisionEventId": event.decision_event_id,
        }

    def batch_decide(
        self,
        *,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        items: list[dict[str, Any]],
        decision: str,
        reason: str | None,
        request_id: str | None,
        task_read_model: UnifiedReviewTaskReadModel | None = None,
    ) -> dict[str, Any]:
        task_read_model = task_read_model or UnifiedReviewTaskReadModel.from_memory()
        auth_store.require_permission(user, BATCH_PERMISSION)
        normalized_decision = self._normalize_decision(decision)
        if normalized_decision == "RETURN":
            raise AppError(
                code="INVALID_REVIEW_DECISION",
                message="Batch commands support approve or reject only",
                status_code=422,
            )
        results: list[dict[str, Any]] = []
        for index, item in enumerate(items, start=1):
            task_id = item.get("reviewTaskId") or item.get("id")
            try:
                detail = self.decide(
                    review_task_id=task_id,
                    user=user,
                    auth_store=auth_store,
                    decision=normalized_decision,
                    reason=reason,
                    comment=item.get("comment"),
                    version=item.get("version"),
                    request_id=f"{request_id}:{index}" if request_id else item.get("requestId"),
                    idempotency_key=item.get("idempotencyKey"),
                    task_read_model=task_read_model,
                )
                results.append(
                    {
                        "reviewTaskId": task_id,
                        "success": True,
                        "status": detail["status"],
                        "version": detail["version"],
                    },
                )
            except AppError as exc:
                results.append(
                    {
                        "reviewTaskId": task_id,
                        "success": False,
                        "errorCode": exc.code,
                        "message": exc.message,
                    },
                )
            except Exception as exc:  # pragma: no cover - defensive summary for batch API
                results.append(
                    {
                        "reviewTaskId": task_id,
                        "success": False,
                        "errorCode": "BATCH_ITEM_FAILED",
                        "message": str(exc),
                    },
                )
        success_count = sum(1 for item in results if item["success"])
        return {
            "items": results,
            "successCount": success_count,
            "failureCount": len(results) - success_count,
        }

    def materialize_from_p1(
        self,
        auth_store: SeedAuthStore,
        *,
        task_read_model: UnifiedReviewTaskReadModel | None = None,
    ) -> None:
        task_read_model = task_read_model or UnifiedReviewTaskReadModel.from_memory()
        review_store.materialize_from_reporting(auth_store)
        known_source_ids = set(review_store.review_tasks)
        for review_task_id in list(self.links):
            if self.links[review_task_id].source_review_task_id not in known_source_ids:
                self.links.pop(review_task_id, None)

        for source in review_store.review_tasks.values():
            if source.review_task_id in self.links:
                continue
            version = self._active_workflow_version()
            snapshot = self._version_snapshot(version)
            cycle, reporting_task = review_store._get_reporting_context(source)
            target_org_id = reporting_task.target_org_id
            business_line = self._business_line_for_org(target_org_id, auth_store)
            assignment = RouteChainEvaluator(auth=auth_store).resolve_initial_assignment(
                template_version=snapshot,
                target_org_id=target_org_id,
                business_line=business_line,
            )
            now = relative_datetime_iso()
            link = UnifiedReviewTaskLinkRecord(
                review_task_id=source.review_task_id,
                source_review_task_id=source.review_task_id,
                source_type=SOURCE_TYPE_ASSESSMENT_REVIEW,
                workflow_template_id=snapshot.template_id,
                workflow_template_version_id=snapshot.template_version_id,
                route_chain_id=assignment.route_chain_id,
                current_level=assignment.current_level,
                current_node_id=assignment.current_node_id,
                current_assignment_snapshot_id=None,
                status="PENDING",
                version=1,
                draft_comment="",
                source_submitter_user_id=self._source_submitter_user_id(
                    source,
                    task_read_model=task_read_model,
                ),
                target_org_id=target_org_id,
                business_line=business_line,
                source_snapshot={
                    "cycleId": cycle.cycle_id,
                    "cycleName": cycle.cycle_name,
                    "reportingTaskId": reporting_task.reporting_task_id,
                    "targetOrgSnapshot": auth_store.org_snapshot(target_org_id),
                },
                created_at=now,
                updated_at=now,
            )
            self.links[link.review_task_id] = link
            snapshot_record = self._assignment_snapshot_from_assignment(link, assignment, now)
            self.assignment_snapshots[snapshot_record.assignment_snapshot_id] = snapshot_record
            link.current_assignment_snapshot_id = snapshot_record.assignment_snapshot_id

    def summary_view(
        self,
        link: UnifiedReviewTaskLinkRecord,
        auth_store: SeedAuthStore,
        *,
        task_read_model: UnifiedReviewTaskReadModel | None = None,
    ) -> dict[str, Any]:
        task_read_model = task_read_model or UnifiedReviewTaskReadModel.from_memory()
        source = self._get_source_review_task(link)
        cycle, reporting_task = review_store._get_reporting_context(source)
        target_org = auth_store.org_snapshot(reporting_task.target_org_id)
        items = list(source.items.values())
        first_item = items[0] if items else None
        response_item = (
            reporting_store.response_items.get(first_item.response_item_id)
            if first_item is not None
            else None
        )
        indicator_snapshot = (
            dict(response_item.indicator_snapshot)
            if response_item is not None
            else {}
        )
        score = sum(
            float(item.final_score if item.final_score is not None else 0)
            for item in items
        )
        if score == 0 and response_item is not None:
            score = float(indicator_snapshot.get("maxScore") or 100)
        assignment = self.assignment_view(link.current_assignment_snapshot_id)
        source_task = task_read_model.get_task(source.unified_task_id)
        due_date = source_task.due_date if source_task else ""
        is_overdue = self._is_overdue(due_date)
        branch_name = target_org.get("orgName", reporting_task.target_org_id)
        return {
            "reviewTaskId": link.review_task_id,
            "id": link.review_task_id,
            "sourceReviewTaskId": link.source_review_task_id,
            "sourceType": link.source_type,
            "cycleId": source.cycle_id,
            "cycleTargetId": source.cycle_target_id,
            "reportingTaskId": source.reporting_task_id,
            "targetOrgId": reporting_task.target_org_id,
            "targetOrgSnapshot": target_org,
            "branch": branch_name,
            "title": f"{cycle.cycle_name} / {branch_name}",
            "indicator": indicator_snapshot.get("indicatorName") or "综合合规考核",
            "category": indicator_snapshot.get("categoryId") or link.business_line or "assessment",
            "value": self._display_value(response_item.response_value if response_item else None),
            "score": round(score, 4),
            "currentLevel": link.current_level,
            "currentLevelLabel": self._level_label(link.current_level),
            "levelCode": self._level_code(link.current_level),
            "currentNodeId": link.current_node_id,
            "currentNodeLabel": self._node_label(link),
            "status": link.status,
            "version": link.version,
            "workflowTemplateId": link.workflow_template_id,
            "workflowTemplateVersionId": link.workflow_template_version_id,
            "routeChainId": link.route_chain_id,
            "assignees": assignment.get("approvers", []) if assignment else [],
            "sla": self._sla_label(due_date),
            "isOverdue": is_overdue,
            "updatedAt": link.updated_at,
        }

    def assignment_view(self, assignment_snapshot_id: str | None) -> dict[str, Any] | None:
        if not assignment_snapshot_id:
            return None
        snapshot = self.assignment_snapshots.get(assignment_snapshot_id)
        if snapshot is None:
            return None
        return {
            "assignmentSnapshotId": snapshot.assignment_snapshot_id,
            "reviewTaskId": snapshot.review_task_id,
            "level": snapshot.level,
            "nodeId": snapshot.node_id,
            "workflowTemplateVersionId": snapshot.workflow_template_version_id,
            "routeChainId": snapshot.route_chain_id,
            "approvers": deepcopy(snapshot.approvers),
            "createdAt": snapshot.created_at,
        }

    @staticmethod
    def quick_phrases() -> list[dict[str, str]]:
        return [
            {
                "phraseId": "URQP-EMBED-001",
                "text": "核对无误，建议通过。",
                "decisionHint": "APPROVE",
                "source": QUICK_PHRASE_MODE,
            },
            {
                "phraseId": "URQP-EMBED-002",
                "text": "资料不完整，请补充后重新流转。",
                "decisionHint": "RETURN",
                "source": QUICK_PHRASE_MODE,
            },
            {
                "phraseId": "URQP-EMBED-003",
                "text": "计算口径需复核，请回退上一环节确认。",
                "decisionHint": "REJECT",
                "source": QUICK_PHRASE_MODE,
            },
        ]

    def action_eligibility(
        self,
        link: UnifiedReviewTaskLinkRecord,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> dict[str, bool]:
        assigned = self._actor_matches_current_assignment(link, user)
        can_decide = self._has_decide_grant(user, auth_store) and assigned and link.status not in {
            "APPROVED",
            "REJECTED",
        }
        return {
            "canSaveComment": can_decide,
            "canApprove": can_decide,
            "canReturn": can_decide,
            "canReject": can_decide,
            "canBatchDecide": auth_store.has_permission(user, BATCH_PERMISSION),
        }

    def _get_link_for_read(
        self,
        review_task_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        *,
        task_read_model: UnifiedReviewTaskReadModel | None = None,
    ) -> UnifiedReviewTaskLinkRecord:
        task_read_model = task_read_model or UnifiedReviewTaskReadModel.from_memory()
        link = self.links.get(review_task_id)
        if link is None:
            raise NotFoundError("Unified review task not found")
        if not self._can_read(link, user, auth_store, task_read_model=task_read_model):
            raise ForbiddenError()
        return link

    def _get_link_for_decide(
        self,
        review_task_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        *,
        task_read_model: UnifiedReviewTaskReadModel | None = None,
    ) -> UnifiedReviewTaskLinkRecord:
        task_read_model = task_read_model or UnifiedReviewTaskReadModel.from_memory()
        link = self._get_link_for_read(
            review_task_id,
            user,
            auth_store,
            task_read_model=task_read_model,
        )
        if not self._has_decide_grant(user, auth_store):
            raise ForbiddenError()
        if not self._actor_matches_current_assignment(link, user):
            raise AppError(
                code="REVIEW_ASSIGNMENT_MISMATCH",
                message="Actor is not assigned to the current review level",
                status_code=403,
            )
        return link

    def _can_read(
        self,
        link: UnifiedReviewTaskLinkRecord,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        *,
        task_read_model: UnifiedReviewTaskReadModel | None = None,
    ) -> bool:
        task_read_model = task_read_model or UnifiedReviewTaskReadModel.from_memory()
        if self._actor_matches_current_assignment(link, user):
            return True
        if self._is_source_or_decision_actor(link, user):
            return True
        if not auth_store.has_permission(user, READ_PERMISSION):
            return False
        source = self._get_source_review_task(link)
        return self._has_project_access(
            source,
            user,
            auth_store,
            task_read_model=task_read_model,
        )

    def _is_source_or_decision_actor(
        self,
        link: UnifiedReviewTaskLinkRecord,
        user: AuthUserRecord,
    ) -> bool:
        if link.source_submitter_user_id == user.user_id:
            return True
        return any(
            event.actor_user_id == user.user_id
            for event in self._events_for_task(link.review_task_id)
        )

    def _has_decide_grant(self, user: AuthUserRecord, auth_store: SeedAuthStore) -> bool:
        return auth_store.has_permission(user, DECIDE_PERMISSION) or any(
            role_id
            in {
                "ROLE_BRANCH_COMPLIANCE_OFFICER",
                "ROLE_BRANCH_MANAGER",
                "ROLE_BUSINESS_LINE_MANAGER",
            }
            for role_id in user.role_ids
        )

    def _has_project_access(
        self,
        source: ReviewTaskRecord,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        *,
        task_read_model: UnifiedReviewTaskReadModel | None = None,
    ) -> bool:
        task_read_model = task_read_model or UnifiedReviewTaskReadModel.from_memory()
        return task_read_model.has_visible_project_task(
            project_id=source.cycle_id,
            user=user,
            auth_store=auth_store,
        )

    def _actor_matches_current_assignment(
        self,
        link: UnifiedReviewTaskLinkRecord,
        user: AuthUserRecord,
    ) -> bool:
        assignment = self.assignment_view(link.current_assignment_snapshot_id)
        if not assignment:
            return False
        for approver in assignment["approvers"]:
            if approver.get("userId") == user.user_id:
                return True
            if approver.get("roleId") in user.role_ids:
                return True
        return False

    def _create_assignment_snapshot(
        self,
        *,
        link: UnifiedReviewTaskLinkRecord,
        level: str,
        node_id: str | None,
        auth_store: SeedAuthStore,
    ) -> ReviewAssignmentSnapshotRecord:
        snapshot = self._version_snapshot(self._version_record(link.workflow_template_version_id))
        chain = self._chain_from_snapshot(snapshot, link.route_chain_id)
        approvers = RouteChainEvaluator(auth=auth_store).resolve_approvers(
            chain=chain,
            level=level,
            target_org_id=link.target_org_id,
            business_line=link.business_line,
        )
        if not approvers:
            raise AppError(
                code="WORKFLOW_APPROVER_UNRESOLVED",
                message="Workflow approvers could not be resolved for the next level",
                status_code=409,
            )
        record = ReviewAssignmentSnapshotRecord(
            assignment_snapshot_id=f"URAS-{len(self.assignment_snapshots) + 1:04d}",
            review_task_id=link.review_task_id,
            level=level,
            node_id=node_id,
            workflow_template_version_id=link.workflow_template_version_id,
            route_chain_id=link.route_chain_id,
            approvers=[item.model_dump(by_alias=True) for item in approvers],
            created_at=relative_datetime_iso(),
        )
        self.assignment_snapshots[record.assignment_snapshot_id] = record
        return record

    def _assignment_snapshot_from_assignment(
        self,
        link: UnifiedReviewTaskLinkRecord,
        assignment: RouteAssignment,
        created_at: str,
    ) -> ReviewAssignmentSnapshotRecord:
        return ReviewAssignmentSnapshotRecord(
            assignment_snapshot_id=f"URAS-{len(self.assignment_snapshots) + 1:04d}",
            review_task_id=link.review_task_id,
            level=assignment.current_level,
            node_id=assignment.current_node_id,
            workflow_template_version_id=assignment.template_version_id,
            route_chain_id=assignment.route_chain_id,
            approvers=[item.model_dump(by_alias=True) for item in assignment.approvers],
            created_at=created_at,
        )

    def _append_decision_event(
        self,
        *,
        before: UnifiedReviewTaskLinkRecord,
        after: UnifiedReviewTaskLinkRecord,
        decision: str,
        actor: AuthUserRecord,
        auth_store: SeedAuthStore,
        comment: str,
        reason: str,
        idempotency_key: str,
        request_id: str | None,
        version_before: int,
    ) -> UnifiedReviewDecisionEventRecord:
        event = UnifiedReviewDecisionEventRecord(
            decision_event_id=f"URDE-{len(self.decision_events) + 1:04d}",
            review_task_id=after.review_task_id,
            decision=decision,
            actor_user_id=actor.user_id,
            actor_snapshot=auth_store.user_snapshot(actor.user_id),
            from_status=before.status,
            to_status=after.status,
            from_level=before.current_level,
            to_level=after.current_level,
            from_node_id=before.current_node_id,
            to_node_id=after.current_node_id,
            comment=comment,
            reason=reason,
            workflow_template_version_id=after.workflow_template_version_id,
            route_chain_id=after.route_chain_id,
            source_task_ref={
                "sourceType": after.source_type,
                "sourceReviewTaskId": after.source_review_task_id,
            },
            idempotency_key=idempotency_key,
            request_id=request_id,
            version_before=version_before,
            version_after=after.version,
            event_created_at=relative_datetime_iso(),
        )
        self.decision_events[event.decision_event_id] = event
        return event

    def _finalize_source_approval(
        self,
        link: UnifiedReviewTaskLinkRecord,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        reason: str,
    ) -> None:
        source = self._get_source_review_task(link)
        for item in source.items.values():
            if item.preliminary_score is None:
                item.preliminary_score = review_store._max_score_for_item(item)
            review_store._recompute_item_final_score(source, item)
            item.status = "COMPLETE"
        source.status = "APPROVED"
        source.completed_at_ref = relative_datetime_iso()
        review_store._append_decision(source, "APPROVE", reason, user)
        cycle, reporting_task = review_store._get_reporting_context(source)
        reporting_store._set_reporting_status(cycle, reporting_task, "ACCEPTED")
        target = cycle.targets[source.cycle_target_id]
        target.review_status = "APPROVED"
        target.target_status = "UNDER_REVIEW"
        review_store._set_review_unified_task_status(source, "DONE")
        cycle_store._recompute_rollup(cycle)
        del auth_store

    def _source_context(
        self,
        source: ReviewTaskRecord,
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        detail = review_store._review_detail(source, auth_store)
        return {
            "assessment": {
                "cycleId": source.cycle_id,
                "cycleTargetId": source.cycle_target_id,
                "reportingTaskId": source.reporting_task_id,
            },
            "reportingTask": detail["reportingTask"],
            "items": detail["items"],
            "sourceDecisions": detail["decisions"],
            "aiInsightSnapshots": detail["aiInsightSnapshots"],
        }

    def _route_snapshot(self, link: UnifiedReviewTaskLinkRecord) -> dict[str, Any]:
        version = self._version_record(link.workflow_template_version_id)
        snapshot = self._version_snapshot(version)
        chain = self._chain_from_snapshot(snapshot, link.route_chain_id)
        return {
            "templateVersionId": version.template_version_id,
            "templateId": version.template_id,
            "snapshotHash": version.snapshot_hash,
            "routeChainId": chain.chain_id,
            "levels": [
                {
                    "level": node.level,
                    "nodeId": node.node_id,
                    "label": node.label,
                    "isCurrent": node.level == link.current_level,
                }
                for node in sorted(chain.nodes, key=lambda item: item.sort_order)
            ],
        }

    def _comment_views(
        self,
        link: UnifiedReviewTaskLinkRecord,
        auth_store: SeedAuthStore,
    ) -> list[dict[str, Any]]:
        rows = []
        if link.draft_comment:
            rows.append(
                {
                    "commentId": f"{link.review_task_id}-DRAFT",
                    "type": "DRAFT",
                    "comment": link.draft_comment,
                    "createdAt": link.updated_at,
                },
            )
        for event in self._events_for_task(link.review_task_id):
            rows.append(
                {
                    "commentId": event.decision_event_id,
                    "type": "DECISION",
                    "decision": event.decision,
                    "comment": event.reason or event.comment,
                    "actorSnapshot": auth_store.user_snapshot(event.actor_user_id),
                    "createdAt": event.event_created_at,
                },
            )
        return rows

    def _audit_trail(
        self,
        link: UnifiedReviewTaskLinkRecord,
        auth_store: SeedAuthStore,
    ) -> list[dict[str, Any]]:
        source = self._get_source_review_task(link)
        origin = {
            "eventId": f"{link.review_task_id}-SOURCE",
            "level": "Origin",
            "decision": "SUBMITTED",
            "action": "提交填报",
            "opinion": "分支填报已提交，进入统一复核链。",
            "actorSnapshot": auth_store.user_snapshot(link.source_submitter_user_id)
            if link.source_submitter_user_id
            else None,
            "time": source.started_at_ref or link.created_at,
            "status": "submit",
        }
        events = [
            {
                "eventId": event.decision_event_id,
                "level": event.from_level,
                "fromLevel": event.from_level,
                "toLevel": event.to_level,
                "decision": event.decision,
                "action": self._decision_label(event.decision),
                "opinion": event.reason or event.comment,
                "actorSnapshot": auth_store.user_snapshot(event.actor_user_id),
                "time": event.event_created_at,
                "status": event.decision.lower(),
                "fromStatus": event.from_status,
                "toStatus": event.to_status,
                "workflowTemplateVersionId": event.workflow_template_version_id,
                "idempotencyKey": event.idempotency_key,
            }
            for event in self._events_for_task(link.review_task_id)
        ]
        return [origin, *events]

    def _events_for_task(self, review_task_id: str) -> list[UnifiedReviewDecisionEventRecord]:
        return sorted(
            [
                event
                for event in self.decision_events.values()
                if event.review_task_id == review_task_id
            ],
            key=lambda item: item.event_created_at,
        )

    def _get_source_review_task(self, link: UnifiedReviewTaskLinkRecord) -> ReviewTaskRecord:
        source = review_store.review_tasks.get(link.source_review_task_id)
        if source is None:
            raise NotFoundError("Source assessment review task not found")
        return source

    @staticmethod
    def _ensure_mutable(link: UnifiedReviewTaskLinkRecord) -> None:
        if link.status in {"APPROVED", "REJECTED"}:
            raise AppError(
                code="REVIEW_TASK_TERMINAL",
                message="Review task is already terminal",
                status_code=409,
            )

    @staticmethod
    def _ensure_version(link: UnifiedReviewTaskLinkRecord, version: int | None) -> None:
        if version is not None and version != link.version:
            raise AppError(
                code="STALE_REVIEW_TASK_VERSION",
                message="Review task version is stale",
                status_code=409,
                details={"expectedVersion": link.version, "actualVersion": version},
            )

    @staticmethod
    def _normalize_decision(decision: str) -> str:
        normalized = decision.strip().lower().replace("-", "_")
        if normalized in {"approve", "approved"}:
            return "APPROVE"
        if normalized in {"return", "return_for_rework", "request_change", "request_changes"}:
            return "RETURN"
        if normalized in {"reject", "reject_to_previous_level"}:
            return "REJECT"
        if normalized in {"submit", "escalate"}:
            raise AppError(
                code="REVIEW_ACTION_NOT_FROZEN",
                message="submit/escalate are not frozen P2 review actions",
                status_code=422,
                details={"decision": decision},
            )
        raise AppError(
            code="INVALID_REVIEW_DECISION",
            message="decision must be approve, return_for_rework, or reject_to_previous_level",
            status_code=422,
            details={"decision": decision},
        )

    @staticmethod
    def _bucket_matches(row: dict[str, Any], bucket: str, user: AuthUserRecord) -> bool:
        if bucket in {"all", "全部"}:
            return True
        if bucket in {"done", "completed"}:
            return row["status"] in {"APPROVED", "REJECTED"} or any(
                approver.get("userId") == user.user_id for approver in row.get("assignees", [])
            ) is False and row["status"] not in {"PENDING", "IN_REVIEW", "RETURNED"}
        if bucket in {"cc", "copied"}:
            return not any(
                approver.get("userId") == user.user_id
                or approver.get("roleId") in user.role_ids
                for approver in row.get("assignees", [])
            )
        return row["status"] in {"PENDING", "IN_REVIEW", "RETURNED"} and any(
            approver.get("userId") == user.user_id or approver.get("roleId") in user.role_ids
            for approver in row.get("assignees", [])
        )

    @staticmethod
    def _keyword_matches(row: dict[str, Any], keyword: str | None) -> bool:
        if not keyword:
            return True
        needle = keyword.lower()
        haystack = " ".join(
            str(row.get(key, ""))
            for key in ("reviewTaskId", "branch", "title", "indicator", "currentLevelLabel")
        ).lower()
        return needle in haystack

    @staticmethod
    def _display_value(value: Any) -> str:
        if value is None:
            return "未填报"
        if isinstance(value, dict):
            if "amount" in value:
                return str(value["amount"])
            return json.dumps(value, ensure_ascii=False)
        return str(value)

    @staticmethod
    def _is_overdue(due_date: str | None) -> bool:
        if not due_date:
            return False
        try:
            due = datetime.fromisoformat(str(due_date).replace("Z", "+00:00")).date()
            return due < seed_base_date()
        except ValueError:
            return False

    def _sla_label(self, due_date: str | None) -> str:
        if not due_date:
            return "无截止日期"
        try:
            due = datetime.fromisoformat(str(due_date).replace("Z", "+00:00")).date()
        except ValueError:
            return "截止日期无效"
        delta = (due - seed_base_date()).days
        if delta < 0:
            return f"逾期 {abs(delta)} 天"
        if delta == 0:
            return "今天到期"
        return f"还有 {delta} 天"

    @staticmethod
    def _level_label(level: str) -> str:
        return {
            "L0_SELF_CHECK": "L0 自检发起",
            "L1_BRANCH_REVIEW": "L1 分支复核",
            "L2_LINE_REVIEW": "L2 条线复核",
            "L3_HQ_FINAL": "L3 总部终审",
        }.get(level, level)

    @staticmethod
    def _level_code(level: str) -> str:
        return level.split("_", 1)[0] if "_" in level else level

    def _node_label(self, link: UnifiedReviewTaskLinkRecord) -> str:
        snapshot = self._version_snapshot(self._version_record(link.workflow_template_version_id))
        chain = self._chain_from_snapshot(snapshot, link.route_chain_id)
        node = next((item for item in chain.nodes if item.node_id == link.current_node_id), None)
        return node.label if node else self._level_label(link.current_level)

    @staticmethod
    def _decision_label(decision: str) -> str:
        return {
            "APPROVE": "通过并流转",
            "RETURN": "退回重做",
            "REJECT": "驳回上一环节",
        }.get(decision, decision)

    def _node_id_for_level(self, link: UnifiedReviewTaskLinkRecord, level: str) -> str:
        snapshot = self._version_snapshot(self._version_record(link.workflow_template_version_id))
        chain = self._chain_from_snapshot(snapshot, link.route_chain_id)
        nodes = sorted(
            [item for item in chain.nodes if item.level == level],
            key=lambda item: item.sort_order,
        )
        if not nodes:
            raise AppError(
                code="WORKFLOW_NODE_NOT_FOUND",
                message="Workflow route node could not be found for target level",
                status_code=409,
                details={"level": level},
            )
        return nodes[0].node_id

    def _active_workflow_version(self) -> WorkflowTemplateVersionRecord:
        templates = [
            item
            for item in workflow_template_store.templates.values()
            if item.domain == "assessment" and item.status == "ACTIVE" and item.current_version_id
        ]
        if not templates:
            raise AppError(
                code="WORKFLOW_TEMPLATE_VERSION_REQUIRED",
                message="An ACTIVE published assessment workflow template is required",
                status_code=409,
            )
        return self._version_record(templates[0].current_version_id or "")

    @staticmethod
    def _version_record(template_version_id: str) -> WorkflowTemplateVersionRecord:
        version = workflow_template_store.versions.get(template_version_id)
        if version is None:
            raise AppError(
                code="WORKFLOW_TEMPLATE_VERSION_NOT_FOUND",
                message="Workflow template version snapshot was not found",
                status_code=409,
                details={"templateVersionId": template_version_id},
            )
        return version

    @staticmethod
    def _version_snapshot(
        version: WorkflowTemplateVersionRecord,
    ) -> WorkflowTemplateVersionSnapshot:
        return WorkflowTemplateVersionSnapshot.model_validate(
            {
                "templateVersionId": version.template_version_id,
                "templateId": version.template_id,
                "versionNo": version.version_no,
                "status": version.status,
                "snapshot": version.snapshot_json,
                "snapshotHash": version.snapshot_hash,
                "targetScopeSnapshot": version.target_scope_snapshot,
                "publishedAt": version.published_at,
                "archivedAt": version.archived_at,
            },
        )

    @staticmethod
    def _chain_from_snapshot(
        snapshot: WorkflowTemplateVersionSnapshot,
        route_chain_id: str,
    ) -> WorkflowRouteChain:
        chain = next(
            (item for item in snapshot.snapshot.chains if item.chain_id == route_chain_id),
            None,
        )
        if chain is None:
            raise AppError(
                code="WORKFLOW_ROUTE_CHAIN_NOT_FOUND",
                message="Workflow route chain snapshot was not found",
                status_code=409,
                details={"routeChainId": route_chain_id},
            )
        return chain

    @staticmethod
    def _business_line_for_org(org_id: str, auth_store: SeedAuthStore) -> str | None:
        org = auth_store.orgs.get(org_id)
        if org and org.business_line_ids:
            return org.business_line_ids[0]
        return "BL-WEALTH"

    @staticmethod
    def _source_submitter_user_id(
        source: ReviewTaskRecord,
        *,
        task_read_model: UnifiedReviewTaskReadModel | None = None,
    ) -> str | None:
        task_read_model = task_read_model or UnifiedReviewTaskReadModel.from_memory()
        submitter_user_id = task_read_model.source_submitter_user_id(source.reporting_task_id)
        if submitter_user_id:
            return submitter_user_id
        return "USER-BRANCH-COMP-001" if "USER-BRANCH-COMP-001" in auth_store.users else None

    @staticmethod
    def _decision_idempotency_key(
        *,
        link: UnifiedReviewTaskLinkRecord,
        user: AuthUserRecord,
        decision: str,
        reason: str,
        request_id: str | None,
        explicit_key: str | None,
    ) -> str:
        if explicit_key:
            return f"explicit:{link.review_task_id}:{user.user_id}:{explicit_key}"
        if request_id:
            return f"request:{link.review_task_id}:{user.user_id}:{request_id}"
        payload = {
            "reviewTaskId": link.review_task_id,
            "actor": user.user_id,
            "decision": decision,
            "version": link.version,
            "reason": reason,
        }
        raw = json.dumps(payload, ensure_ascii=False, sort_keys=True)
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()


unified_review_store = SeedUnifiedReviewStore()
