from __future__ import annotations

import hashlib
import json
from typing import Any, Literal

from pydantic import BaseModel, Field

WORKFLOW_LEVELS: tuple[str, ...] = (
    "L0_SELF_CHECK",
    "L1_BRANCH_REVIEW",
    "L2_LINE_REVIEW",
    "L3_HQ_FINAL",
)

WorkflowLevel = Literal[
    "L0_SELF_CHECK",
    "L1_BRANCH_REVIEW",
    "L2_LINE_REVIEW",
    "L3_HQ_FINAL",
]
WorkflowNodeType = Literal["ROLE", "USER", "ORG_ROLE", "FINAL_APPROVER"]
WorkflowSelectorType = Literal["ROLE", "USER", "ORG_ROLE"]
WorkflowScopeMode = Literal["by_business_line", "by_org", "by_region"]
WorkflowTemplateStatus = Literal["DRAFT", "ACTIVE", "ARCHIVED"]
WorkflowVersionStatus = Literal["PUBLISHED", "ARCHIVED"]
WorkflowApprovalPolicy = Literal["ANY_ONE", "ALL_OF", "SEQUENTIAL", "QUORUM"]
WorkflowOrgScopeRule = Literal[
    "TARGET_ORG",
    "TARGET_PARENT_BRANCH",
    "BUSINESS_LINE_HQ",
    "HQ_GLOBAL",
]
WorkflowFindingSeverity = Literal["ERROR", "WARNING", "INFO"]


class CamelModel(BaseModel):
    model_config = {"populate_by_name": True}


class WorkflowTargetScope(CamelModel):
    scope_mode: WorkflowScopeMode = Field(alias="scopeMode")
    target_org_ids: list[str] = Field(default_factory=list, alias="targetOrgIds")
    business_line: str | None = Field(default=None, alias="businessLine")
    region_code: str | None = Field(default=None, alias="regionCode")
    priority: int = 100


class RouteCondition(CamelModel):
    condition_type: Literal["ALWAYS", "BUSINESS_LINE_IS", "ORG_LEVEL_IS", "RISK_LEVEL_AT_LEAST"] = (
        Field(default="ALWAYS", alias="conditionType")
    )
    value: str | None = None


class ApproverSelector(CamelModel):
    selector_type: WorkflowSelectorType = Field(alias="selectorType")
    role_code: str | None = Field(default=None, alias="roleCode")
    user_id: str | None = Field(default=None, alias="userId")
    org_scope_rule: WorkflowOrgScopeRule | None = Field(default=None, alias="orgScopeRule")
    business_line: str | None = Field(default=None, alias="businessLine")


class WorkflowNode(CamelModel):
    node_id: str = Field(alias="nodeId")
    level: WorkflowLevel
    node_type: WorkflowNodeType = Field(alias="nodeType")
    approver_selector: ApproverSelector = Field(alias="approverSelector")
    sort_order: int = Field(alias="sortOrder")
    is_final: bool = Field(default=False, alias="isFinal")
    label: str


class WorkflowEdge(CamelModel):
    edge_id: str = Field(alias="edgeId")
    from_node_id: str = Field(alias="fromNodeId")
    to_node_id: str = Field(alias="toNodeId")
    condition: Any | None = None


class WorkflowRouteChain(CamelModel):
    chain_id: str = Field(alias="chainId")
    name: str
    target_scope: WorkflowTargetScope = Field(alias="targetScope")
    approval_policy: WorkflowApprovalPolicy = Field(default="ANY_ONE", alias="approvalPolicy")
    nodes: list[WorkflowNode]
    edges: list[WorkflowEdge]


class WorkflowTemplateAggregate(CamelModel):
    template_id: str = Field(alias="templateId")
    name: str
    domain: Literal["assessment"] = "assessment"
    scope_mode: WorkflowScopeMode = Field(alias="scopeMode")
    status: WorkflowTemplateStatus
    schema_version: int = Field(default=1, alias="schemaVersion")
    chains: list[WorkflowRouteChain]
    created_by: str = Field(alias="createdBy")
    updated_by: str = Field(alias="updatedBy")


class WorkflowValidationFinding(CamelModel):
    finding_id: str = Field(alias="findingId")
    severity: WorkflowFindingSeverity
    code: str
    message: str
    chain_id: str | None = Field(default=None, alias="chainId")
    node_id: str | None = Field(default=None, alias="nodeId")
    edge_id: str | None = Field(default=None, alias="edgeId")


class ResolvedApprover(CamelModel):
    user_id: str = Field(alias="userId")
    display_name: str = Field(alias="displayName")
    role_id: str = Field(alias="roleId")
    org_id: str = Field(alias="orgId")


class RouteAssignment(CamelModel):
    template_version_id: str = Field(alias="templateVersionId")
    route_chain_id: str = Field(alias="routeChainId")
    current_level: WorkflowLevel = Field(alias="currentLevel")
    current_node_id: str = Field(alias="currentNodeId")
    approvers: list[ResolvedApprover]


class NextRouteResult(CamelModel):
    decision: Literal["APPROVE", "REJECT", "RETURN"]
    from_level: WorkflowLevel = Field(alias="fromLevel")
    to_level: WorkflowLevel | None = Field(default=None, alias="toLevel")
    to_node_id: str | None = Field(default=None, alias="toNodeId")
    is_final: bool = Field(default=False, alias="isFinal")
    status: Literal["PENDING", "APPROVED", "REJECTED", "RETURNED"]


class WorkflowTemplateVersionSnapshot(CamelModel):
    template_version_id: str = Field(alias="templateVersionId")
    template_id: str = Field(alias="templateId")
    version_no: int = Field(alias="versionNo")
    status: WorkflowVersionStatus
    snapshot: WorkflowTemplateAggregate
    snapshot_hash: str = Field(alias="snapshotHash")
    target_scope_snapshot: list[dict[str, Any]] = Field(alias="targetScopeSnapshot")
    published_at: str | None = Field(default=None, alias="publishedAt")
    archived_at: str | None = Field(default=None, alias="archivedAt")


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def snapshot_hash(snapshot: WorkflowTemplateAggregate | dict[str, Any]) -> str:
    raw = (
        snapshot.model_dump(by_alias=True)
        if isinstance(snapshot, WorkflowTemplateAggregate)
        else snapshot
    )
    return hashlib.sha256(canonical_json(raw).encode("utf-8")).hexdigest()


def target_scope_key(scope: WorkflowTargetScope) -> tuple[Any, ...]:
    return (
        scope.scope_mode,
        tuple(sorted(scope.target_org_ids)),
        scope.business_line or "",
        scope.region_code or "",
        scope.priority,
    )
