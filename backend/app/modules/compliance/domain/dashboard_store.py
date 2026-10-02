from __future__ import annotations

from statistics import mean
from typing import Any

from app.modules.compliance.core.errors import ForbiddenError, NotFoundError
from app.modules.compliance.domain.auth_store import AuthUserRecord, SeedAuthStore
from app.modules.compliance.domain.cycle_store import cycle_store
from app.modules.compliance.domain.rectification_store import (
    ComplianceIssueRecord,
    RectificationRecordData,
    rectification_store,
)
from app.modules.compliance.domain.result_store import ResultRecord, result_store
from app.modules.compliance.domain.seed_time import relative_datetime_iso, seed_base_date

CONFIRMED_STATUSES = {"CONFIRMED", "AUTO_CONFIRMED", "FINALIZED"}
OPEN_ISSUE_STATUSES = {
    "DISCOVERED",
    "PENDING_RECTIFICATION",
    "RECTIFYING",
    "PENDING_VERIFICATION",
    "VERIFICATION_REJECTED",
    "OVERDUE",
}
OPEN_RECTIFICATION_STATUSES = {
    "DISCOVERED",
    "PENDING_RECTIFICATION",
    "RECTIFYING",
    "PENDING_VERIFICATION",
    "VERIFICATION_REJECTED",
    "OVERDUE",
}


class DashboardReadModelStore:
    def assessment_overview(
        self,
        *,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        auth_store.require_permission(user, "PERM-P1-ASSESSMENT-DASHBOARD-HQ")
        results = self._visible_results(user=user, auth_store=auth_store, include_generated=False)
        latest_by_org = self._latest_result_by_org(results)
        rankings = self._rankings(latest_by_org.values(), auth_store)
        return {
            "readModel": "AssessmentResultAggregateReadModel",
            "generatedAtRef": relative_datetime_iso(),
            "summary": {
                "resultCount": len(results),
                "branchCount": len(latest_by_org),
                "averageScore": self._average_score(latest_by_org.values()),
                "confirmedResultCount": len(
                    [
                        result
                        for result in results
                        if self._effective_confirmation_status(result) in CONFIRMED_STATUSES
                    ],
                ),
                "autoConfirmedResultCount": len(
                    [
                        result
                        for result in results
                        if self._effective_confirmation_status(result) == "AUTO_CONFIRMED"
                    ],
                ),
                "openAppealCount": self._open_score_appeal_count(results),
            },
            "gradeDistribution": self._grade_distribution(latest_by_org.values()),
            "scoreBands": self._score_bands(latest_by_org.values()),
            "branchRankings": rankings,
            "drilldowns": {
                "self": "/compliance/hq/assessment/dashboard",
                "resultList": "/compliance/hq/assessment/dashboard",
            },
        }

    def governance_dashboard(
        self,
        *,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        auth_store.require_permission(user, "PERM-P1-DASHBOARD-HQ")
        results = self._visible_results(user=user, auth_store=auth_store, include_generated=False)
        latest_by_org = self._latest_result_by_org(results)
        issues = self._visible_issues(user=user, auth_store=auth_store)
        rectifications = self._visible_rectifications(user=user, auth_store=auth_store)
        return {
            "readModel": "GovernanceDashboardReadModel",
            "generatedAtRef": relative_datetime_iso(),
            "assessment": {
                "resultCount": len(results),
                "branchCount": len(latest_by_org),
                "averageScore": self._average_score(latest_by_org.values()),
                "confirmedResultCount": len(
                    [
                        result
                        for result in results
                        if self._effective_confirmation_status(result) in CONFIRMED_STATUSES
                    ],
                ),
            },
            "issues": {
                "total": len(issues),
                "open": len([issue for issue in issues if issue.status in OPEN_ISSUE_STATUSES]),
                "highRisk": len(
                    [
                        issue
                        for issue in issues
                        if issue.risk_level in {"HIGH", "CRITICAL"}
                        and issue.status in OPEN_ISSUE_STATUSES
                    ],
                ),
            },
            "rectifications": {
                "total": len(rectifications),
                "open": len(
                    [item for item in rectifications if item.status in OPEN_RECTIFICATION_STATUSES],
                ),
                "completionRate": self._completion_rate(rectifications),
            },
            "branchRiskMatrix": self._branch_risk_matrix(
                results=latest_by_org,
                issues=issues,
                rectifications=rectifications,
                auth_store=auth_store,
            ),
            "drilldowns": {
                "dashboard": "/compliance/hq/dashboard",
                "issueHub": "/compliance/hq/issues",
                "assessmentDashboard": "/compliance/hq/assessment/dashboard",
            },
        }

    def branch_portrait(
        self,
        *,
        org_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        self._require_branch_portrait(org_id=org_id, user=user, auth_store=auth_store)
        results = [
            result
            for result in self._visible_results(
                user=user,
                auth_store=auth_store,
                include_generated=False,
            )
            if result.target_org_id == org_id
        ]
        results.sort(key=self._result_recency_key)
        latest = results[-1] if results else None
        hq_view = self._is_hq_dashboard_user(user, auth_store)
        visible_issues = [
            issue
            for issue in self._visible_issues(user=user, auth_store=auth_store)
            if issue.responsible_org_id == org_id
        ]
        visible_rectifications = [
            item
            for item in self._visible_rectifications(user=user, auth_store=auth_store)
            if item.responsible_org_id == org_id
        ]
        rankings = self._rankings(
            self._latest_result_by_org(
                self._visible_results(
                    user=user,
                    auth_store=auth_store,
                    include_generated=False,
                ),
            ).values(),
            auth_store,
        )
        rank = next((item["rank"] for item in rankings if item["orgId"] == org_id), None)
        return {
            "readModel": "BranchPortraitReadModel",
            "generatedAtRef": relative_datetime_iso(),
            "org": auth_store.org_snapshot(org_id),
            "latestResult": self._result_card(latest, auth_store) if latest else None,
            "rank": rank,
            "totalBranches": len(rankings),
            "scoreTrend": [self._score_trend_point(result) for result in results],
            "dimensions": self._dimension_scores(latest) if latest else [],
            "issues": self._issue_summary(visible_issues),
            "rectifications": {
                "total": len(visible_rectifications),
                "open": len(
                    [
                        item
                        for item in visible_rectifications
                        if item.status in OPEN_RECTIFICATION_STATUSES
                    ],
                ),
                "completionRate": self._completion_rate(visible_rectifications),
            },
            "riskTags": self._risk_tags(latest, visible_issues, visible_rectifications),
            "chronicRisks": [
                self._issue_drilldown(issue, hq_view=hq_view)
                for issue in visible_issues
                if issue.status in OPEN_ISSUE_STATUSES
            ],
            "smartActions": [] if hq_view else self._branch_actions(org_id),
            "drilldowns": self._branch_portrait_drilldowns(org_id, hq_view=hq_view),
        }

    def _visible_results(
        self,
        *,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        include_generated: bool,
    ) -> list[ResultRecord]:
        return [
            result
            for result in result_store.results.values()
            if result_store._can_access_result(result, user, auth_store)
            and (include_generated or result.status != "GENERATED")
        ]

    @staticmethod
    def _visible_issues(
        *,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> list[ComplianceIssueRecord]:
        return rectification_store._visible_issues(user, auth_store)

    @staticmethod
    def _visible_rectifications(
        *,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> list[RectificationRecordData]:
        return rectification_store._visible_rectifications(user, auth_store)

    @staticmethod
    def _latest_result_by_org(results: list[ResultRecord]) -> dict[str, ResultRecord]:
        latest: dict[str, ResultRecord] = {}
        for result in sorted(results, key=DashboardReadModelStore._result_recency_key):
            latest[result.target_org_id] = result
        return latest

    @staticmethod
    def _result_recency_key(result: ResultRecord) -> tuple[str, str, str, str]:
        cycle = cycle_store.cycles.get(result.cycle_id)
        if cycle is None:
            return ("", "", result.cycle_id, result.result_id)
        return (cycle.period_end, cycle.period_start, result.cycle_id, result.result_id)

    def _rankings(
        self,
        results: Any,
        auth_store: SeedAuthStore,
    ) -> list[dict[str, Any]]:
        ordered = sorted(results, key=lambda result: (-result.total_score, result.target_org_id))
        return [
            {
                "rank": index,
                **self._result_card(result, auth_store),
                "publicPath": (
                    "/compliance/hq/assessment/dashboard"
                    f"?cycleId={result.cycle_id}&orgId={result.target_org_id}"
                ),
            }
            for index, result in enumerate(ordered, start=1)
        ]

    @staticmethod
    def _result_card(result: ResultRecord, auth_store: SeedAuthStore) -> dict[str, Any]:
        return {
            "resultId": result.result_id,
            "cycleId": result.cycle_id,
            "orgId": result.target_org_id,
            "orgSnapshot": auth_store.org_snapshot(result.target_org_id),
            "status": result.status,
            "confirmationStatus": DashboardReadModelStore._effective_confirmation_status(result),
            "totalScore": result.total_score,
            "gradeCode": result.grade_code,
            "confirmationDeadline": result.confirmation_deadline,
        }

    @staticmethod
    def _score_trend_point(result: ResultRecord) -> dict[str, Any]:
        return {
            "cycleId": result.cycle_id,
            "score": result.total_score,
            "gradeCode": result.grade_code,
            "confirmationStatus": DashboardReadModelStore._effective_confirmation_status(result),
        }

    @staticmethod
    def _effective_confirmation_status(result: ResultRecord) -> str:
        if (
            result.status == "PUBLISHED"
            and result.confirmation_status == "PENDING_CONFIRMATION"
            and not result_store._open_appeals(result)
            and result.confirmation_deadline < seed_base_date().isoformat()
        ):
            return "AUTO_CONFIRMED"
        return result.confirmation_status

    @staticmethod
    def _average_score(results: Any) -> float | None:
        scores = [float(result.total_score) for result in results]
        if not scores:
            return None
        return round(mean(scores), 4)

    @staticmethod
    def _grade_distribution(results: Any) -> list[dict[str, Any]]:
        counts: dict[str, int] = {}
        for result in results:
            key = result.grade_code or "UNRATED"
            counts[key] = counts.get(key, 0) + 1
        return [{"gradeCode": key, "count": counts[key]} for key in sorted(counts)]

    @staticmethod
    def _score_bands(results: Any) -> list[dict[str, Any]]:
        bands = {
            "90_PLUS": 0,
            "75_TO_89": 0,
            "60_TO_74": 0,
            "BELOW_60": 0,
        }
        for result in results:
            if result.total_score >= 90:
                bands["90_PLUS"] += 1
            elif result.total_score >= 75:
                bands["75_TO_89"] += 1
            elif result.total_score >= 60:
                bands["60_TO_74"] += 1
            else:
                bands["BELOW_60"] += 1
        return [{"band": key, "count": value} for key, value in bands.items()]

    @staticmethod
    def _open_score_appeal_count(results: list[ResultRecord]) -> int:
        return sum(
            1
            for result in results
            for appeal in result.appeals.values()
            if appeal.status in {"SUBMITTED", "UNDER_REVIEW"}
        )

    @staticmethod
    def _completion_rate(rectifications: list[RectificationRecordData]) -> float | None:
        if not rectifications:
            return None
        closed = len(
            [item for item in rectifications if item.status in {"CLOSED", "ARCHIVED"}],
        )
        return round(closed / len(rectifications), 4)

    def _branch_risk_matrix(
        self,
        *,
        results: dict[str, ResultRecord],
        issues: list[ComplianceIssueRecord],
        rectifications: list[RectificationRecordData],
        auth_store: SeedAuthStore,
    ) -> list[dict[str, Any]]:
        org_ids = set(results)
        org_ids.update(issue.responsible_org_id for issue in issues)
        return [
            {
                "orgId": org_id,
                "orgSnapshot": auth_store.org_snapshot(org_id),
                "totalScore": results[org_id].total_score if org_id in results else None,
                "openIssues": len(
                    [
                        issue
                        for issue in issues
                        if issue.responsible_org_id == org_id
                        and issue.status in OPEN_ISSUE_STATUSES
                    ],
                ),
                "highRiskIssues": len(
                    [
                        issue
                        for issue in issues
                        if issue.responsible_org_id == org_id
                        and issue.status in OPEN_ISSUE_STATUSES
                        and issue.risk_level in {"HIGH", "CRITICAL"}
                    ],
                ),
                "rectificationRate": self._completion_rate(
                    [item for item in rectifications if item.responsible_org_id == org_id],
                ),
                "riskLevel": self._derived_risk_level(
                    results.get(org_id),
                    [
                        issue
                        for issue in issues
                        if issue.responsible_org_id == org_id
                        and issue.status in OPEN_ISSUE_STATUSES
                    ],
                ),
                "publicPath": f"/compliance/hq/branches/profile?orgId={org_id}",
            }
            for org_id in sorted(org_ids)
        ]

    @staticmethod
    def _derived_risk_level(
        result: ResultRecord | None,
        open_issues: list[ComplianceIssueRecord],
    ) -> str:
        if any(issue.risk_level in {"HIGH", "CRITICAL"} for issue in open_issues):
            return "HIGH"
        if result is not None and result.total_score < 75:
            return "MEDIUM"
        if open_issues:
            return "LOW"
        return "NORMAL"

    @staticmethod
    def _dimension_scores(result: ResultRecord) -> list[dict[str, Any]]:
        return [
            {
                "dimensionId": item.indicator_id,
                "dimensionName": item.indicator_id,
                "fullScore": item.original_score,
                "actualScore": item.final_score,
                "deduction": round(item.original_score - item.final_score, 4),
                "resultItemId": item.result_item_id,
            }
            for item in result.items.values()
        ]

    @staticmethod
    def _issue_summary(issues: list[ComplianceIssueRecord]) -> dict[str, Any]:
        open_issues = [issue for issue in issues if issue.status in OPEN_ISSUE_STATUSES]
        return {
            "total": len(issues),
            "open": len(open_issues),
            "highRisk": len(
                [issue for issue in open_issues if issue.risk_level in {"HIGH", "CRITICAL"}],
            ),
        }

    def _risk_tags(
        self,
        latest: ResultRecord | None,
        issues: list[ComplianceIssueRecord],
        rectifications: list[RectificationRecordData],
    ) -> list[str]:
        tags: list[str] = []
        if latest and latest.total_score < 75:
            tags.append("LOW_ASSESSMENT_SCORE")
        if self._issue_summary(issues)["highRisk"] > 0:
            tags.append("HIGH_RISK_ISSUE_OPEN")
        if [
            item
            for item in rectifications
            if item.status in OPEN_RECTIFICATION_STATUSES
            and item.due_date < seed_base_date().isoformat()
        ]:
            tags.append("OVERDUE_RECTIFICATION")
        if not tags:
            tags.append("STABLE")
        return tags

    @staticmethod
    def _issue_drilldown(issue: ComplianceIssueRecord, *, hq_view: bool) -> dict[str, Any]:
        public_path = f"/compliance/hq/issues/{issue.issue_id}"
        if not hq_view:
            rectification = next(
                (
                    item
                    for item in rectification_store.rectifications.values()
                    if item.source_issue_id == issue.issue_id
                ),
                None,
            )
            public_path = (
                f"/compliance/branch/issues/rectifications/{rectification.rectification_id}"
                if rectification
                else "/compliance/branch/issues/rectifications"
            )
        return {
            "issueId": issue.issue_id,
            "title": issue.title,
            "riskLevel": issue.risk_level,
            "status": issue.status,
            "publicPath": public_path,
        }

    @staticmethod
    def _branch_portrait_drilldowns(org_id: str, *, hq_view: bool) -> dict[str, str]:
        if hq_view:
            return {"hqPortrait": f"/compliance/hq/branches/profile?orgId={org_id}"}
        return {
            "branchDashboard": "/compliance/branch/dashboard",
            "rectificationList": "/compliance/branch/issues/rectifications",
        }

    @staticmethod
    def _branch_actions(org_id: str) -> list[dict[str, Any]]:
        actions: list[dict[str, Any]] = []
        for cycle in cycle_store.cycles.values():
            for task in cycle.reporting_tasks.values():
                if task.target_org_id == org_id and task.status in {
                    "NOT_STARTED",
                    "IN_PROGRESS",
                    "RETURNED",
                    "RECALLED",
                }:
                    actions.append(
                        {
                            "actionId": f"CONTINUE-{task.reporting_task_id}",
                            "type": "NAVIGATE",
                            "label": "continue_assessment_reporting",
                            "publicPath": (
                                "/compliance/branch/assessment/reporting"
                                f"?reportingTaskId={task.reporting_task_id}"
                            ),
                        },
                    )
        return actions

    @staticmethod
    def _require_branch_portrait(
        *,
        org_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> None:
        if org_id not in auth_store.orgs:
            raise NotFoundError("Organization not found")
        auth_store.require_permission(user, "PERM-P1-DASHBOARD-BRANCH-PORTRAIT")
        if auth_store.has_permission(user, "PERM-P1-DASHBOARD-HQ") or auth_store.has_permission(
            user,
            "PERM-P1-ASSESSMENT-DASHBOARD-HQ",
        ):
            return
        if not auth_store.org_in_scope(user, org_id):
            raise ForbiddenError()

    @staticmethod
    def _is_hq_dashboard_user(user: AuthUserRecord, auth_store: SeedAuthStore) -> bool:
        return auth_store.has_permission(user, "PERM-P1-DASHBOARD-HQ") or auth_store.has_permission(
            user,
            "PERM-P1-ASSESSMENT-DASHBOARD-HQ",
        )


dashboard_store = DashboardReadModelStore()
