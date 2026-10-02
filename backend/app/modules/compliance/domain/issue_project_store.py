from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from typing import Any

from app.modules.compliance.core.errors import AppError, NotFoundError
from app.modules.compliance.domain.auth_store import AuthUserRecord, SeedAuthStore
from app.modules.compliance.domain.dictionaries import validate_code
from app.modules.compliance.domain.inspection_plan_store import inspection_plan_store
from app.modules.compliance.domain.notification_store import notification_store
from app.modules.compliance.domain.rectification_store import rectification_store
from app.modules.compliance.domain.seed_time import seed_base_date

PROJECT_STATUSES = {"IN_PROGRESS", "CLOSED", "AT_RISK"}
BRANCH_PROGRESS_STATUSES = {"DONE", "RISK", "IN_PROGRESS"}
TERMINAL_STATUSES = {"CLOSED", "ARCHIVED"}
DELIVERY_MODE_IN_APP = "IN_APP_NOTIFICATION"


@dataclass(frozen=True)
class IssueProjectFactRecord:
    issue_id: str
    issue_code: str
    title: str
    source_type: str
    source_id: str
    source_project: str
    business_line: str
    responsible_org_id: str
    responsible_dept: str
    risk_level: str
    issue_status: str
    discovery_date: str
    sla_deadline: str
    rectification_id: str | None = None
    rectification_status: str | None = None
    rectification_due_date: str | None = None
    fixture_source: str = "p0_rectification_store"


@dataclass
class IssueProjectReminderEventRecord:
    reminder_event_id: str
    project_id: str
    project_title_snapshot: str
    target_org_ids: list[str]
    target_org_snapshots: list[dict[str, Any]]
    reason: str
    delivery_mode: str
    status: str
    request_id: str | None
    idempotency_key: str
    created_by: str
    created_by_snapshot: dict[str, Any]
    created_at: str
    sent_at: str | None = None
    notification_ids: list[str] = field(default_factory=list)
    result_summary: dict[str, Any] = field(default_factory=dict)


class SeedIssueProjectStore:
    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self.reminder_events: dict[str, IssueProjectReminderEventRecord] = {}
        self._idempotency_index: dict[str, str] = {}

    def hydrate_reminder_events(
        self,
        records: list[IssueProjectReminderEventRecord],
    ) -> None:
        self.reminder_events = {record.reminder_event_id: record for record in records}
        self._idempotency_index = {
            record.idempotency_key: record.reminder_event_id for record in records
        }

    def project_tracker_page(
        self,
        *,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        keyword: str | None = None,
        year: int | None = None,
        status: str | None = None,
        lead_dept_id: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        auth_store.require_permission(user, "PERM-P2-ISSUE-PROJECT-TRACKER-READ")
        validate_code(status, category="issue_project_status", field="status")
        facts = self._visible_facts(user=user, auth_store=auth_store)
        projects = [
            self._project_rollup(project_id, rows, auth_store)
            for project_id, rows in self._group_by_project(facts).items()
        ]
        filtered = [
            project
            for project in projects
            if (status is None or project["status"] == status)
            and (lead_dept_id is None or project["leadDeptSnapshot"].get("orgId") == lead_dept_id)
            and self._matches_project_year(project, year)
            and self._matches_project_keyword(project, keyword)
        ]
        filtered.sort(key=lambda item: (item["dateRange"]["startDate"], item["projectId"]))
        start = (page - 1) * page_size
        end = start + page_size
        return {
            "items": filtered[start:end],
            "page": page,
            "pageSize": page_size,
            "total": len(filtered),
            "summary": {
                "totalProjects": len(filtered),
                "atRiskProjects": sum(1 for item in filtered if item["status"] == "AT_RISK"),
            },
        }

    def project_branch_page(
        self,
        *,
        project_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        org_id: str | None = None,
        status: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        auth_store.require_permission(user, "PERM-P2-ISSUE-PROJECT-TRACKER-READ")
        validate_code(status, category="issue_project_branch_status", field="status")
        facts = [
            fact
            for fact in self._visible_facts(user=user, auth_store=auth_store)
            if fact.source_id == project_id
        ]
        if not facts:
            raise NotFoundError("Issue project not found")
        rows = list(self._branch_rollups(project_id, facts, auth_store))
        filtered = [
            row
            for row in rows
            if (org_id is None or row["orgId"] == org_id)
            and (status is None or row["status"] == status)
        ]
        filtered.sort(key=lambda item: (item["status"], item["orgId"]))
        start = (page - 1) * page_size
        end = start + page_size
        return {
            "items": filtered[start:end],
            "page": page,
            "pageSize": page_size,
            "total": len(filtered),
        }

    def send_overdue_reminders(
        self,
        *,
        project_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        target_org_ids: list[str],
        reason: str | None = None,
        request_id: str | None = None,
        delivery_mode: str = DELIVERY_MODE_IN_APP,
    ) -> dict[str, Any]:
        auth_store.require_permission(user, "PERM-P2-ISSUE-PROJECT-TRACKER-REMIND")
        if delivery_mode != DELIVERY_MODE_IN_APP:
            raise AppError(
                code="UNSUPPORTED_DELIVERY_MODE",
                message="Only in-app notification reminders are supported in this slice",
                status_code=422,
            )
        distinct_target_org_ids = sorted({item for item in target_org_ids if item})
        if not distinct_target_org_ids:
            raise AppError(
                code="MISSING_TARGET_ORGS",
                message="targetOrgIds is required",
                status_code=422,
            )

        facts = [
            fact
            for fact in self._visible_facts(user=user, auth_store=auth_store)
            if fact.source_id == project_id
        ]
        if not facts:
            raise NotFoundError("Issue project not found")
        overdue_org_ids = {
            fact.responsible_org_id
            for fact in facts
            if self._is_overdue_open(fact)
        }
        invalid_org_ids = [
            org_id
            for org_id in distinct_target_org_ids
            if org_id not in overdue_org_ids
        ]
        if invalid_org_ids:
            raise AppError(
                code="REMINDER_TARGET_HAS_NO_OVERDUE_ISSUES",
                message="Reminder target org has no overdue open issue in this project",
                status_code=409,
                details={"targetOrgIds": invalid_org_ids},
            )

        resolved_reason = (reason or "项目逾期整改提醒").strip() or "项目逾期整改提醒"
        idempotency_key = self._idempotency_key(
            actor_id=user.user_id,
            project_id=project_id,
            target_org_ids=distinct_target_org_ids,
            reason=resolved_reason,
            delivery_mode=delivery_mode,
            request_id=request_id,
        )
        duplicate_event_id = self._idempotency_index.get(idempotency_key)
        if duplicate_event_id:
            return self.reminder_event_view(
                self.reminder_events[duplicate_event_id],
                duplicate=True,
            )

        event_id = f"IPRE-SEED-{len(self.reminder_events) + 1:04d}"
        now = self._utc_now_iso()
        project_title = facts[0].source_project
        notification_ids: list[str] = []
        failure_count = 0
        for index, org_id in enumerate(distinct_target_org_ids, start=1):
            recipient_user_ids = self._branch_recipient_user_ids(org_id, auth_store)
            if not recipient_user_ids:
                failure_count += 1
                continue
            notification_id = f"NOTIF-P2-ISSUE-REM-{len(self.reminder_events) + 1:04d}-{index:02d}"
            notification_store.create_in_app_notification(
                notification_id=notification_id,
                recipient_user_ids=recipient_user_ids,
                auth_store=auth_store,
                source_module="ISSUE",
                type="ISSUE",
                severity="WARNING",
                title="整改逾期提醒",
                content=f"{project_title} 存在逾期未整改问题，请尽快处理。",
                created_by=user.user_id,
                source_entity_type="IssueProject",
                source_entity_id=project_id,
                action_target={
                    "type": "ROUTE",
                    "path": "/compliance/branch/issues",
                    "params": {"projectId": project_id, "orgId": org_id},
                },
                created_at=now,
            )
            notification_ids.append(notification_id)

        event = IssueProjectReminderEventRecord(
            reminder_event_id=event_id,
            project_id=project_id,
            project_title_snapshot=project_title,
            target_org_ids=distinct_target_org_ids,
            target_org_snapshots=[
                auth_store.org_snapshot(org_id) for org_id in distinct_target_org_ids
            ],
            reason=resolved_reason,
            delivery_mode=delivery_mode,
            status="SENT" if notification_ids and failure_count == 0 else "FAILED",
            request_id=request_id,
            idempotency_key=idempotency_key,
            created_by=user.user_id,
            created_by_snapshot=auth_store.user_snapshot(user.user_id),
            created_at=now,
            sent_at=now if notification_ids else None,
            notification_ids=notification_ids,
            result_summary={
                "targetOrgCount": len(distinct_target_org_ids),
                "notificationCount": len(notification_ids),
                "suppressedDuplicateCount": 0,
                "failureCount": failure_count,
            },
        )
        self.reminder_events[event_id] = event
        self._idempotency_index[idempotency_key] = event_id
        return self.reminder_event_view(event, duplicate=False)

    def analytics(
        self,
        *,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        period: str | None = None,
        business_line: str | None = None,
        org_id: str | None = None,
        risk_level: str | None = None,
        project_id: str | None = None,
    ) -> dict[str, Any]:
        auth_store.require_permission(user, "PERM-P2-ISSUE-ANALYTICS-READ")
        canonical_period = self._validate_period(period)
        validate_code(business_line, category="business_line", field="businessLine")
        validate_code(risk_level, category="risk_level", field="riskLevel")
        facts = [
            fact
            for fact in self._visible_facts(user=user, auth_store=auth_store)
            if self._matches_period(fact, canonical_period)
            and (business_line is None or fact.business_line == business_line)
            and (org_id is None or fact.responsible_org_id == org_id)
            and (risk_level is None or fact.risk_level == risk_level)
            and (project_id is None or fact.source_id == project_id)
        ]
        total = len(facts)
        completed = sum(1 for fact in facts if self._is_terminal(fact))
        overdue = sum(1 for fact in facts if self._is_overdue_open(fact))
        closure_rate = self._rate(completed, total)
        avg_fix_days = self._average_fix_days(facts)
        filters = {
            "period": canonical_period,
            "businessLine": business_line,
            "orgId": org_id,
            "riskLevel": risk_level,
            "projectId": project_id,
        }
        return {
            "filterHash": hashlib.sha256(
                json.dumps(filters, sort_keys=True, ensure_ascii=False).encode("utf-8"),
            ).hexdigest()[:16],
            "period": canonical_period,
            "kpis": {
                "totalIssues": {"value": total, "trend": "+0%", "isPositive": False},
                "overdue": {"value": overdue, "trend": "+0%", "isPositive": overdue == 0},
                "closureRate": {
                    "value": closure_rate,
                    "displayValue": f"{closure_rate}%",
                    "trend": "+0%",
                    "isPositive": True,
                },
                "avgFixDays": {
                    "value": avg_fix_days,
                    "trend": "+0",
                    "isPositive": True,
                },
            },
            "trendSeries": self._trend_series(facts),
            "riskDistribution": self._risk_distribution(facts),
            "branchRanking": self._branch_ranking(facts, auth_store),
            "computedAt": self._utc_now_iso(),
            "exportAllowed": auth_store.has_permission(
                user,
                "PERM-P2-ISSUE-ANALYTICS-EXPORT",
            ),
        }

    def reminder_event_view(
        self,
        record: IssueProjectReminderEventRecord,
        *,
        duplicate: bool = False,
    ) -> dict[str, Any]:
        result_summary = dict(record.result_summary)
        if duplicate:
            result_summary["suppressedDuplicateCount"] = max(
                1,
                int(result_summary.get("suppressedDuplicateCount", 0)),
            )
        return {
            "reminderEventId": record.reminder_event_id,
            "projectId": record.project_id,
            "projectTitleSnapshot": record.project_title_snapshot,
            "targetOrgIds": record.target_org_ids,
            "targetOrgSnapshots": record.target_org_snapshots,
            "reason": record.reason,
            "deliveryMode": record.delivery_mode,
            "status": record.status,
            "requestId": record.request_id,
            "idempotencyKey": record.idempotency_key,
            "createdBy": record.created_by,
            "createdBySnapshot": record.created_by_snapshot,
            "createdAt": record.created_at,
            "sentAt": record.sent_at,
            "notificationIds": record.notification_ids,
            "resultSummary": result_summary,
            "duplicate": duplicate,
        }

    def _visible_facts(
        self,
        *,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> list[IssueProjectFactRecord]:
        if not (
            auth_store.has_permission(user, "PERM-P2-ISSUE-PROJECT-TRACKER-READ")
            or auth_store.has_permission(user, "PERM-P2-ISSUE-PROJECT-TRACKER-REMIND")
            or auth_store.has_permission(user, "PERM-P2-ISSUE-ANALYTICS-READ")
        ):
            return []
        facts = self._issue_facts()
        if self._can_read_all_issue_projects(user):
            return facts
        assigned_project_ids = self._assigned_project_ids(user)
        return [fact for fact in facts if fact.source_id in assigned_project_ids]

    @staticmethod
    def _can_read_all_issue_projects(user: AuthUserRecord) -> bool:
        return bool(
            {"ROLE_COMPLIANCE_MANAGER", "ROLE_COMPLIANCE_DIRECTOR"}.intersection(user.role_ids),
        )

    @staticmethod
    def _assigned_project_ids(user: AuthUserRecord) -> set[str]:
        assigned_project_ids: set[str] = set()
        for plan in inspection_plan_store.plans.values():
            if (
                plan.leader_user_id == user.user_id
                or user.user_id in plan.team_member_user_ids
            ):
                assigned_project_ids.add(plan.inspection_plan_id)
        return assigned_project_ids

    def _issue_facts(self) -> list[IssueProjectFactRecord]:
        facts: list[IssueProjectFactRecord] = []
        rectification_by_issue_id = {
            item.source_issue_id: item for item in rectification_store.rectifications.values()
        }
        for issue in rectification_store.issues.values():
            rectification = rectification_by_issue_id.get(issue.issue_id)
            facts.append(
                IssueProjectFactRecord(
                    issue_id=issue.issue_id,
                    issue_code=issue.issue_code,
                    title=issue.title,
                    source_type=issue.source_type,
                    source_id=issue.source_id,
                    source_project=issue.source_project,
                    business_line=issue.business_line,
                    responsible_org_id=issue.responsible_org_id,
                    responsible_dept=issue.responsible_dept,
                    risk_level=issue.risk_level,
                    issue_status=issue.status,
                    discovery_date=issue.discovery_date,
                    sla_deadline=issue.sla_deadline,
                    rectification_id=rectification.rectification_id if rectification else None,
                    rectification_status=rectification.status if rectification else None,
                    rectification_due_date=rectification.due_date if rectification else None,
                ),
            )
        return facts

    def _project_rollup(
        self,
        project_id: str,
        rows: list[IssueProjectFactRecord],
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        total = len(rows)
        completed = sum(1 for row in rows if self._is_terminal(row))
        overdue = sum(1 for row in rows if self._is_overdue_open(row))
        in_progress = total - completed - overdue
        start_date = min(row.discovery_date for row in rows)
        end_date = max(self._due_date(row).isoformat() for row in rows)
        return {
            "projectId": project_id,
            "id": project_id,
            "projectTitle": rows[0].source_project,
            "title": rows[0].source_project,
            "sourceType": rows[0].source_type,
            "dateRange": {"startDate": start_date, "endDate": end_date},
            "dateRangeLabel": f"{start_date} ~ {end_date}",
            "leadDeptSnapshot": self._lead_dept_snapshot(rows, auth_store),
            "leadDept": self._lead_dept_snapshot(rows, auth_store).get("orgName", ""),
            "metrics": {
                "totalIssues": total,
                "completed": completed,
                "inProgress": max(in_progress, 0),
                "overdue": overdue,
                "completionRate": self._rate(completed, total),
            },
            "status": self._project_status(total=total, completed=completed, overdue=overdue),
            "overdueTargetOrgIds": sorted(
                {row.responsible_org_id for row in rows if self._is_overdue_open(row)},
            ),
        }

    def _branch_rollups(
        self,
        project_id: str,
        rows: list[IssueProjectFactRecord],
        auth_store: SeedAuthStore,
    ) -> list[dict[str, Any]]:
        grouped: dict[str, list[IssueProjectFactRecord]] = {}
        for row in rows:
            grouped.setdefault(row.responsible_org_id, []).append(row)
        result = []
        for org_id, org_rows in grouped.items():
            total = len(org_rows)
            completed = sum(1 for row in org_rows if self._is_terminal(row))
            overdue = sum(1 for row in org_rows if self._is_overdue_open(row))
            status = "DONE" if completed == total else "RISK" if overdue else "IN_PROGRESS"
            result.append(
                {
                    "projectId": project_id,
                    "orgId": org_id,
                    "id": org_id,
                    "orgSnapshot": auth_store.org_snapshot(org_id),
                    "name": auth_store.org_snapshot(org_id).get("orgName", org_id),
                    "total": total,
                    "completed": completed,
                    "overdue": overdue,
                    "status": status,
                    "drilldownFilters": {
                        "projectId": project_id,
                        "responsibleOrgId": org_id,
                    },
                },
            )
        return result

    @staticmethod
    def _group_by_project(
        facts: list[IssueProjectFactRecord],
    ) -> dict[str, list[IssueProjectFactRecord]]:
        grouped: dict[str, list[IssueProjectFactRecord]] = {}
        for fact in facts:
            grouped.setdefault(fact.source_id, []).append(fact)
        return grouped

    def _lead_dept_snapshot(
        self,
        rows: list[IssueProjectFactRecord],
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        first = rows[0]
        if first.source_type == "INSPECTION":
            plan = inspection_plan_store.plans.get(first.source_id)
            if plan and plan.leader_user_id in auth_store.users:
                leader = auth_store.users[plan.leader_user_id]
                snapshot = auth_store.org_snapshot(leader.org_id)
                return {**snapshot, "source": "source_plan_leader_org"}
        responsible_org_id = sorted({row.responsible_org_id for row in rows})[0]
        snapshot = auth_store.org_snapshot(responsible_org_id)
        return {**snapshot, "source": "responsible_org"}

    @staticmethod
    def _project_status(*, total: int, completed: int, overdue: int) -> str:
        if total > 0 and completed == total:
            return "CLOSED"
        if overdue > 0:
            return "AT_RISK"
        return "IN_PROGRESS"

    @staticmethod
    def _matches_project_keyword(project: dict[str, Any], keyword: str | None) -> bool:
        if not keyword:
            return True
        normalized = keyword.lower()
        return normalized in " ".join(
            [
                project["projectId"],
                project["projectTitle"],
                project["leadDeptSnapshot"].get("orgName", ""),
            ],
        ).lower()

    @staticmethod
    def _matches_project_year(project: dict[str, Any], year: int | None) -> bool:
        if year is None:
            return True
        return project["dateRange"]["startDate"].startswith(str(year))

    def _is_terminal(self, fact: IssueProjectFactRecord) -> bool:
        return (fact.rectification_status or fact.issue_status) in TERMINAL_STATUSES

    def _is_overdue_open(self, fact: IssueProjectFactRecord) -> bool:
        return not self._is_terminal(fact) and self._due_date(fact) < seed_base_date()

    @staticmethod
    def _due_date(fact: IssueProjectFactRecord) -> date:
        raw = fact.rectification_due_date or fact.sla_deadline
        return date.fromisoformat(raw)

    @staticmethod
    def _rate(numerator: int, denominator: int) -> int:
        if denominator <= 0:
            return 0
        return round(numerator * 100 / denominator)

    def _average_fix_days(self, facts: list[IssueProjectFactRecord]) -> float:
        spans = [
            (self._due_date(fact) - date.fromisoformat(fact.discovery_date)).days
            for fact in facts
            if self._is_terminal(fact)
        ]
        if not spans:
            return 0
        return round(sum(spans) / len(spans), 1)

    @staticmethod
    def _validate_period(period: str | None) -> str:
        if period is None or period == "ALL":
            return f"{seed_base_date().year}-ALL"
        year, _, bucket = period.partition("-")
        if not (year.isdigit() and bucket in {"ALL", "Q1", "Q2", "Q3", "Q4"}):
            raise AppError(
                code="VALIDATION_ERROR",
                message="Unsupported analytics period",
                status_code=422,
                details={"field": "period", "value": period},
            )
        return period

    @staticmethod
    def _matches_period(fact: IssueProjectFactRecord, period: str) -> bool:
        year, _, bucket = period.partition("-")
        discovery = date.fromisoformat(fact.discovery_date)
        if discovery.year != int(year):
            return False
        if bucket == "ALL":
            return True
        quarter_months = {
            "Q1": {1, 2, 3},
            "Q2": {4, 5, 6},
            "Q3": {7, 8, 9},
            "Q4": {10, 11, 12},
        }
        return discovery.month in quarter_months[bucket]

    def _trend_series(self, facts: list[IssueProjectFactRecord]) -> list[dict[str, Any]]:
        buckets: dict[str, dict[str, int]] = {}
        for fact in facts:
            month_key = date.fromisoformat(fact.discovery_date).strftime("%Y-%m")
            bucket = buckets.setdefault(month_key, {"found": 0, "closed": 0})
            bucket["found"] += 1
            if self._is_terminal(fact):
                bucket["closed"] += 1
        return [
            {"month": month, "found": counts["found"], "closed": counts["closed"]}
            for month, counts in sorted(buckets.items())
        ]

    @staticmethod
    def _risk_distribution(facts: list[IssueProjectFactRecord]) -> list[dict[str, Any]]:
        labels = {"HIGH": "高风险", "MEDIUM": "中风险", "LOW": "低风险"}
        return [
            {"name": labels.get(risk, risk), "riskLevel": risk, "value": count}
            for risk, count in sorted(
                {
                    risk: sum(1 for fact in facts if fact.risk_level == risk)
                    for risk in {fact.risk_level for fact in facts}
                }.items(),
            )
        ]

    def _branch_ranking(
        self,
        facts: list[IssueProjectFactRecord],
        auth_store: SeedAuthStore,
    ) -> list[dict[str, Any]]:
        grouped: dict[str, list[IssueProjectFactRecord]] = {}
        for fact in facts:
            grouped.setdefault(fact.responsible_org_id, []).append(fact)
        rows = []
        for org_id, org_facts in grouped.items():
            total = len(org_facts)
            completed = sum(1 for fact in org_facts if self._is_terminal(fact))
            overdue = sum(1 for fact in org_facts if self._is_overdue_open(fact))
            snapshot = auth_store.org_snapshot(org_id)
            rows.append(
                {
                    "orgId": org_id,
                    "orgSnapshot": snapshot,
                    "branch": snapshot.get("orgName", org_id),
                    "overdue": overdue,
                    "completed": completed,
                    "total": total,
                },
            )
        rows.sort(key=lambda item: (-item["overdue"], item["orgId"]))
        return rows

    @staticmethod
    def _branch_recipient_user_ids(org_id: str, auth_store: SeedAuthStore) -> list[str]:
        return [
            user.user_id
            for user in auth_store.users.values()
            if user.active
            and user.org_id == org_id
            and any(role_id.startswith("ROLE_BRANCH") for role_id in user.role_ids)
        ]

    @staticmethod
    def _idempotency_key(
        *,
        actor_id: str,
        project_id: str,
        target_org_ids: list[str],
        reason: str,
        delivery_mode: str,
        request_id: str | None,
    ) -> str:
        if request_id:
            return f"request:{request_id}"
        bucket = datetime.now(UTC).date().isoformat()
        return "fallback:" + "|".join(
            [
                actor_id,
                project_id,
                ",".join(sorted(target_org_ids)),
                reason,
                delivery_mode,
                bucket,
            ],
        )

    @staticmethod
    def _utc_now_iso() -> str:
        return datetime.now(UTC).isoformat().replace("+00:00", "Z")


issue_project_store = SeedIssueProjectStore()
