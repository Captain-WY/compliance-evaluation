from __future__ import annotations

from collections import defaultdict, deque
from typing import Any

from app.modules.compliance.core.errors import AppError
from app.modules.compliance.domain.auth_store import AuthUserRecord, SeedAuthStore, auth_store
from app.modules.compliance.domain.workflow_models import (
    WORKFLOW_LEVELS,
    ApproverSelector,
    NextRouteResult,
    ResolvedApprover,
    RouteAssignment,
    RouteCondition,
    WorkflowRouteChain,
    WorkflowTemplateAggregate,
    WorkflowTemplateVersionSnapshot,
    WorkflowValidationFinding,
    target_scope_key,
)


class RouteChainEvaluator:
    """Pure route-template evaluator for P2 assessment review/dispatch routing."""

    def __init__(
        self,
        *,
        auth: SeedAuthStore | None = None,
        active_templates: list[WorkflowTemplateAggregate] | None = None,
    ) -> None:
        self.auth = auth or auth_store
        self.active_templates = active_templates or []

    def validate_template(
        self,
        template: WorkflowTemplateAggregate,
    ) -> list[WorkflowValidationFinding]:
        findings: list[WorkflowValidationFinding] = []
        if template.domain != "assessment":
            self._add(
                findings,
                "ERROR",
                "INVALID_DOMAIN",
                "Only assessment workflow templates are allowed",
            )
        if template.schema_version != 1:
            self._add(
                findings,
                "ERROR",
                "UNSUPPORTED_SCHEMA_VERSION",
                "Only schemaVersion=1 is supported",
            )

        for chain in template.chains:
            findings.extend(self._validate_chain(chain))

        findings.extend(self._validate_target_scope_uniqueness(template))
        return self._renumber(findings)

    def resolve_initial_assignment(
        self,
        template_version: WorkflowTemplateVersionSnapshot,
        target_org_id: str,
        business_line: str | None,
    ) -> RouteAssignment:
        chains = sorted(
            template_version.snapshot.chains,
            key=lambda item: item.target_scope.priority,
        )
        chain = next(
            (
                item
                for item in chains
                if self._scope_matches(item.target_scope, target_org_id, business_line)
            ),
            None,
        )
        if chain is None:
            raise AppError(
                code="WORKFLOW_ROUTE_NOT_FOUND",
                message="No workflow route chain matches the target scope",
                status_code=404,
            )
        node = self._first_node_for_level(chain, "L0_SELF_CHECK")
        approvers = self.resolve_approvers(
            chain=chain,
            level="L0_SELF_CHECK",
            target_org_id=target_org_id,
            business_line=business_line,
        )
        if not approvers:
            raise AppError(
                code="WORKFLOW_APPROVER_UNRESOLVED",
                message="Initial workflow approvers could not be resolved",
                status_code=409,
            )
        return RouteAssignment(
            templateVersionId=template_version.template_version_id,
            routeChainId=chain.chain_id,
            currentLevel="L0_SELF_CHECK",
            currentNodeId=node.node_id,
            approvers=approvers,
        )

    def resolve_next_level(
        self,
        current_item: dict[str, Any],
        decision: str,
        actor: AuthUserRecord | dict[str, Any],
    ) -> NextRouteResult:
        level = current_item.get("currentLevel")
        if level not in WORKFLOW_LEVELS:
            raise AppError(
                code="INVALID_WORKFLOW_LEVEL",
                message="currentLevel must use frozen L0/L1/L2/L3 semantics",
                status_code=422,
            )
        normalized_decision = decision.upper()
        current_index = WORKFLOW_LEVELS.index(level)
        actor_id = actor.user_id if isinstance(actor, AuthUserRecord) else actor.get("userId")
        source_submitter_id = current_item.get("sourceSubmitterUserId")
        if (
            actor_id
            and source_submitter_id
            and actor_id == source_submitter_id
            and level != "L0_SELF_CHECK"
        ):
            raise AppError(
                code="WORKFLOW_SEGREGATION_OF_DUTIES",
                message="L0 submitter cannot approve later workflow levels",
                status_code=409,
            )

        if normalized_decision == "RETURN":
            return NextRouteResult(
                decision="RETURN",
                fromLevel=level,
                toLevel="L0_SELF_CHECK",
                toNodeId=None,
                isFinal=False,
                status="RETURNED",
            )
        if normalized_decision == "REJECT":
            if current_index == 0:
                return NextRouteResult(
                    decision="REJECT",
                    fromLevel=level,
                    toLevel=None,
                    toNodeId=None,
                    isFinal=True,
                    status="REJECTED",
                )
            return NextRouteResult(
                decision="REJECT",
                fromLevel=level,
                toLevel=WORKFLOW_LEVELS[current_index - 1],
                toNodeId=None,
                isFinal=False,
                status="PENDING",
            )
        if normalized_decision != "APPROVE":
            raise AppError(
                code="INVALID_WORKFLOW_DECISION",
                message="decision must be APPROVE, REJECT, or RETURN",
                status_code=422,
            )
        if current_index == len(WORKFLOW_LEVELS) - 1:
            return NextRouteResult(
                decision="APPROVE",
                fromLevel=level,
                toLevel=None,
                toNodeId=None,
                isFinal=True,
                status="APPROVED",
            )
        return NextRouteResult(
            decision="APPROVE",
            fromLevel=level,
            toLevel=WORKFLOW_LEVELS[current_index + 1],
            toNodeId=None,
            isFinal=False,
            status="PENDING",
        )

    def resolve_approvers(
        self,
        *,
        chain: WorkflowRouteChain,
        level: str,
        target_org_id: str | None,
        business_line: str | None,
    ) -> list[ResolvedApprover]:
        rows: list[ResolvedApprover] = []
        for node in sorted(
            [item for item in chain.nodes if item.level == level],
            key=lambda item: item.sort_order,
        ):
            rows.extend(
                self._resolve_selector(
                    node.approver_selector,
                    target_org_id=target_org_id or self._first_target_org(chain),
                    business_line=business_line or chain.target_scope.business_line,
                ),
            )
        deduped: dict[str, ResolvedApprover] = {}
        for row in rows:
            deduped.setdefault(row.user_id, row)
        return list(deduped.values())

    def _validate_chain(self, chain: WorkflowRouteChain) -> list[WorkflowValidationFinding]:
        findings: list[WorkflowValidationFinding] = []
        if chain.approval_policy != "ANY_ONE":
            self._add(
                findings,
                "ERROR",
                "UNSUPPORTED_APPROVAL_POLICY",
                "First P2 workflow templates support only ANY_ONE approval policy",
                chain_id=chain.chain_id,
            )

        nodes_by_id = {node.node_id: node for node in chain.nodes}
        if len(nodes_by_id) != len(chain.nodes):
            self._add(
                findings,
                "ERROR",
                "DUPLICATE_NODE_ID",
                "Node IDs must be unique",
                chain_id=chain.chain_id,
            )

        levels = {node.level for node in chain.nodes}
        for required_level in WORKFLOW_LEVELS:
            if required_level not in levels:
                self._add(
                    findings,
                    "ERROR",
                    "MISSING_REQUIRED_LEVEL",
                    f"Workflow chain must include {required_level}",
                    chain_id=chain.chain_id,
                )

        final_nodes = [node for node in chain.nodes if node.is_final]
        if len(final_nodes) != 1:
            self._add(
                findings,
                "ERROR",
                "INVALID_FINAL_NODE_COUNT",
                "Workflow chain must have exactly one final node",
                chain_id=chain.chain_id,
            )
        elif final_nodes[0].level != "L3_HQ_FINAL":
            self._add(
                findings,
                "ERROR",
                "FINAL_NODE_LEVEL_INVALID",
                "The final node must be at L3_HQ_FINAL",
                chain_id=chain.chain_id,
                node_id=final_nodes[0].node_id,
            )

        findings.extend(self._validate_edges(chain, nodes_by_id))
        findings.extend(self._validate_selectors(chain))
        findings.extend(self._validate_segregation_of_duties(chain))
        return findings

    def _validate_edges(
        self,
        chain: WorkflowRouteChain,
        nodes_by_id: dict[str, Any],
    ) -> list[WorkflowValidationFinding]:
        findings: list[WorkflowValidationFinding] = []
        adjacency: dict[str, list[str]] = defaultdict(list)
        indegree: dict[str, int] = {node_id: 0 for node_id in nodes_by_id}
        for edge in chain.edges:
            source = nodes_by_id.get(edge.from_node_id)
            target = nodes_by_id.get(edge.to_node_id)
            if source is None or target is None:
                self._add(
                    findings,
                    "ERROR",
                    "EDGE_NODE_NOT_FOUND",
                    "Workflow edge references a missing node",
                    chain_id=chain.chain_id,
                    edge_id=edge.edge_id,
                )
                continue
            source_index = WORKFLOW_LEVELS.index(source.level)
            target_index = WORKFLOW_LEVELS.index(target.level)
            if target_index - source_index != 1:
                self._add(
                    findings,
                    "ERROR",
                    "INVALID_LEVEL_JUMP",
                    "First P2 workflow edges must connect adjacent levels only",
                    chain_id=chain.chain_id,
                    edge_id=edge.edge_id,
                )
            if not self._is_typed_condition(edge.condition):
                self._add(
                    findings,
                    "ERROR",
                    "INVALID_ROUTE_CONDITION",
                    "Route conditions must use typed allow-listed objects, not raw strings",
                    chain_id=chain.chain_id,
                    edge_id=edge.edge_id,
                )
            adjacency[edge.from_node_id].append(edge.to_node_id)
            indegree[edge.to_node_id] = indegree.get(edge.to_node_id, 0) + 1

        start_nodes = [node.node_id for node in chain.nodes if node.level == "L0_SELF_CHECK"]
        reachable: set[str] = set()
        queue: deque[str] = deque(start_nodes)
        while queue:
            node_id = queue.popleft()
            if node_id in reachable:
                continue
            reachable.add(node_id)
            queue.extend(adjacency.get(node_id, []))
        for node in chain.nodes:
            if node.node_id not in reachable:
                self._add(
                    findings,
                    "ERROR",
                    "UNREACHABLE_NODE",
                    "Workflow node is not reachable from L0",
                    chain_id=chain.chain_id,
                    node_id=node.node_id,
                )

        if self._has_cycle(adjacency):
            self._add(
                findings,
                "ERROR",
                "WORKFLOW_CYCLE",
                "Workflow route template contains a forward cycle",
                chain_id=chain.chain_id,
            )
        if len(chain.nodes) > 1 and not chain.edges:
            self._add(
                findings,
                "ERROR",
                "DISCONNECTED_CHAIN",
                "Workflow chain must connect route nodes",
                chain_id=chain.chain_id,
            )
        return findings

    def _validate_selectors(self, chain: WorkflowRouteChain) -> list[WorkflowValidationFinding]:
        findings: list[WorkflowValidationFinding] = []
        target_org_id = self._first_target_org(chain)
        for node in chain.nodes:
            selector_findings = self._selector_shape_findings(chain, node)
            findings.extend(selector_findings)
            if selector_findings:
                continue
            approvers = self._resolve_selector(
                node.approver_selector,
                target_org_id=target_org_id,
                business_line=chain.target_scope.business_line,
            )
            if not approvers:
                self._add(
                    findings,
                    "ERROR",
                    "EMPTY_APPROVER_SET",
                    "Workflow approver selector resolves to an empty approver set",
                    chain_id=chain.chain_id,
                    node_id=node.node_id,
                )
        return findings

    def _selector_shape_findings(
        self,
        chain: WorkflowRouteChain,
        node: Any,
    ) -> list[WorkflowValidationFinding]:
        findings: list[WorkflowValidationFinding] = []
        selector = node.approver_selector
        if selector.selector_type == "USER" and not selector.user_id:
            self._add(
                findings,
                "ERROR",
                "INVALID_APPROVER_SELECTOR",
                "USER selector requires userId",
                chain_id=chain.chain_id,
                node_id=node.node_id,
            )
        if selector.selector_type in {"ROLE", "ORG_ROLE"} and not selector.role_code:
            self._add(
                findings,
                "ERROR",
                "INVALID_APPROVER_SELECTOR",
                "ROLE and ORG_ROLE selectors require roleCode",
                chain_id=chain.chain_id,
                node_id=node.node_id,
            )
        if selector.selector_type == "ORG_ROLE" and not selector.org_scope_rule:
            self._add(
                findings,
                "ERROR",
                "INVALID_APPROVER_SELECTOR",
                "ORG_ROLE selector requires orgScopeRule",
                chain_id=chain.chain_id,
                node_id=node.node_id,
            )
        return findings

    def _validate_segregation_of_duties(
        self,
        chain: WorkflowRouteChain,
    ) -> list[WorkflowValidationFinding]:
        findings: list[WorkflowValidationFinding] = []
        target_org_id = self._first_target_org(chain)
        l0_user_ids = {
            item.user_id
            for item in self.resolve_approvers(
                chain=chain,
                level="L0_SELF_CHECK",
                target_org_id=target_org_id,
                business_line=chain.target_scope.business_line,
            )
        }
        later_user_ids: set[str] = set()
        for level in WORKFLOW_LEVELS[1:]:
            later_user_ids.update(
                item.user_id
                for item in self.resolve_approvers(
                    chain=chain,
                    level=level,
                    target_org_id=target_org_id,
                    business_line=chain.target_scope.business_line,
                )
            )
        overlap = l0_user_ids.intersection(later_user_ids)
        if overlap:
            self._add(
                findings,
                "ERROR",
                "SEGREGATION_OF_DUTIES_VIOLATION",
                "L0 submitter selector overlaps with later approval levels",
                chain_id=chain.chain_id,
            )
        return findings

    def _validate_target_scope_uniqueness(
        self,
        template: WorkflowTemplateAggregate,
    ) -> list[WorkflowValidationFinding]:
        findings: list[WorkflowValidationFinding] = []
        current_keys = {target_scope_key(chain.target_scope) for chain in template.chains}
        if len(current_keys) != len(template.chains):
            self._add(
                findings,
                "ERROR",
                "DUPLICATE_TEMPLATE_TARGET_SCOPE",
                "Template chains have overlapping target scopes without deterministic priority",
            )
        for active in self.active_templates:
            if active.template_id == template.template_id or active.status != "ACTIVE":
                continue
            for chain in active.chains:
                if target_scope_key(chain.target_scope) in current_keys:
                    self._add(
                        findings,
                        "ERROR",
                        "ACTIVE_TEMPLATE_TARGET_SCOPE_AMBIGUITY",
                        "Another active workflow template already matches this target scope",
                    )
        return findings

    def _resolve_selector(
        self,
        selector: ApproverSelector,
        *,
        target_org_id: str | None,
        business_line: str | None,
    ) -> list[ResolvedApprover]:
        if selector.selector_type == "USER":
            user = self.auth.users.get(selector.user_id or "")
            if not user or not user.active:
                return []
            return [self._approver_view(user, selector.role_code or self._first_role(user))]

        role_id = self._role_id(selector.role_code)
        if not role_id:
            return []
        users = [
            user
            for user in self.auth.users.values()
            if user.active and role_id in user.role_ids and self._user_matches_scope(
                user,
                selector,
                target_org_id=target_org_id,
                business_line=business_line,
            )
        ]
        return [self._approver_view(user, role_id) for user in users]

    def _user_matches_scope(
        self,
        user: AuthUserRecord,
        selector: ApproverSelector,
        *,
        target_org_id: str | None,
        business_line: str | None,
    ) -> bool:
        if selector.selector_type == "ROLE":
            return True
        rule = selector.org_scope_rule or "HQ_GLOBAL"
        org = self.auth.orgs.get(user.org_id)
        if rule == "TARGET_ORG":
            return bool(target_org_id and user.org_id == target_org_id)
        if rule == "TARGET_PARENT_BRANCH":
            target = self.auth.orgs.get(target_org_id or "")
            return bool(target and user.org_id == (target.parent_org_id or target.org_id))
        if rule == "BUSINESS_LINE_HQ":
            resolved_line = selector.business_line or business_line
            return bool(
                org
                and org.org_level == "BUSINESS_LINE_HQ"
                and (not resolved_line or resolved_line in org.business_line_ids),
            )
        if rule == "HQ_GLOBAL":
            hq_levels = {"GROUP", "HQ_DEPARTMENT", "BUSINESS_LINE_HQ", "SUBSIDIARY"}
            return bool(org and org.org_level in hq_levels)
        return False

    def _role_id(self, role_code: str | None) -> str | None:
        if not role_code:
            return None
        if role_code in self.auth.roles:
            return role_code
        for role in self.auth.roles.values():
            if role.role_code == role_code:
                return role.role_id
        return None

    def _approver_view(self, user: AuthUserRecord, role_id: str) -> ResolvedApprover:
        return ResolvedApprover(
            userId=user.user_id,
            displayName=user.display_name,
            roleId=role_id,
            orgId=user.org_id,
        )

    @staticmethod
    def _first_role(user: AuthUserRecord) -> str:
        return user.role_ids[0] if user.role_ids else ""

    @staticmethod
    def _first_target_org(chain: WorkflowRouteChain) -> str | None:
        return chain.target_scope.target_org_ids[0] if chain.target_scope.target_org_ids else None

    @staticmethod
    def _scope_matches(scope: Any, target_org_id: str, business_line: str | None) -> bool:
        org_match = not scope.target_org_ids or target_org_id in scope.target_org_ids
        line_match = (
            not scope.business_line
            or not business_line
            or scope.business_line == business_line
        )
        return org_match and line_match

    @staticmethod
    def _first_node_for_level(chain: WorkflowRouteChain, level: str) -> Any:
        candidates = sorted(
            [node for node in chain.nodes if node.level == level],
            key=lambda item: item.sort_order,
        )
        if not candidates:
            raise AppError(
                code="WORKFLOW_LEVEL_NOT_CONFIGURED",
                message=f"Workflow level {level} is not configured",
                status_code=409,
            )
        return candidates[0]

    @staticmethod
    def _has_cycle(adjacency: dict[str, list[str]]) -> bool:
        visited: set[str] = set()
        visiting: set[str] = set()

        def visit(node_id: str) -> bool:
            if node_id in visiting:
                return True
            if node_id in visited:
                return False
            visiting.add(node_id)
            for child_id in adjacency.get(node_id, []):
                if visit(child_id):
                    return True
            visiting.remove(node_id)
            visited.add(node_id)
            return False

        return any(visit(node_id) for node_id in list(adjacency))

    @staticmethod
    def _is_typed_condition(condition: Any | None) -> bool:
        if condition is None:
            return True
        if isinstance(condition, str):
            return False
        if isinstance(condition, RouteCondition):
            return True
        if isinstance(condition, dict):
            try:
                RouteCondition.model_validate(condition)
            except Exception:
                return False
            return True
        return False

    @staticmethod
    def _add(
        findings: list[WorkflowValidationFinding],
        severity: str,
        code: str,
        message: str,
        *,
        chain_id: str | None = None,
        node_id: str | None = None,
        edge_id: str | None = None,
    ) -> None:
        findings.append(
            WorkflowValidationFinding(
                findingId="pending",
                severity=severity,
                code=code,
                message=message,
                chainId=chain_id,
                nodeId=node_id,
                edgeId=edge_id,
            ),
        )

    @staticmethod
    def _renumber(
        findings: list[WorkflowValidationFinding],
    ) -> list[WorkflowValidationFinding]:
        return [
            item.model_copy(update={"finding_id": f"WF-FIND-{index:03d}"})
            for index, item in enumerate(findings, start=1)
        ]
