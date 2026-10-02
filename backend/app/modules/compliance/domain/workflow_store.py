from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, field
from typing import Any

from pydantic import ValidationError

from app.modules.compliance.core.errors import AppError, ForbiddenError, NotFoundError
from app.modules.compliance.domain.auth_store import AuthUserRecord, SeedAuthStore
from app.modules.compliance.domain.seed_time import relative_datetime_iso
from app.modules.compliance.domain.workflow_evaluator import RouteChainEvaluator
from app.modules.compliance.domain.workflow_models import (
    WorkflowTemplateAggregate,
    WorkflowValidationFinding,
    snapshot_hash,
)


@dataclass
class WorkflowTemplateRecord:
    template_id: str
    name: str
    domain: str
    scope_mode: str
    status: str
    schema_version: int
    chains_json: list[dict[str, Any]]
    created_by_ref: str
    updated_by_ref: str
    created_at: str
    updated_at: str
    current_version_id: str | None = None
    last_validation_summary: dict[str, Any] = field(default_factory=dict)


@dataclass
class WorkflowTemplateVersionRecord:
    template_version_id: str
    template_id: str
    version_no: int
    status: str
    snapshot_json: dict[str, Any]
    snapshot_hash: str
    target_scope_snapshot: list[dict[str, Any]]
    published_by_ref: str
    published_at: str
    archived_at: str | None = None


@dataclass
class WorkflowTemplateAuditEventRecord:
    audit_event_id: str
    template_id: str
    event_type: str
    actor_user_id: str
    actor_snapshot: dict[str, Any]
    template_version_id: str | None
    snapshot_hash: str | None
    route_summary: dict[str, Any]
    target_scope_snapshot: list[dict[str, Any]]
    validation_summary: dict[str, Any]
    event_created_at: str


class SeedWorkflowTemplateStore:
    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        seed_template = self._seed_default_template()
        self.templates: dict[str, WorkflowTemplateRecord] = {
            seed_template.template_id: seed_template,
        }
        self.versions: dict[str, WorkflowTemplateVersionRecord] = {}
        self.audit_events: dict[str, WorkflowTemplateAuditEventRecord] = {}

    def hydrate(
        self,
        *,
        templates: dict[str, WorkflowTemplateRecord],
        versions: dict[str, WorkflowTemplateVersionRecord],
        audit_events: dict[str, WorkflowTemplateAuditEventRecord],
    ) -> None:
        self.templates = templates
        self.versions = versions
        self.audit_events = audit_events

    def template_page(
        self,
        *,
        user: AuthUserRecord,
        auth: SeedAuthStore,
    ) -> dict[str, Any]:
        self._require_read(user, auth)
        rows = [
            self.template_summary(record)
            for record in sorted(self.templates.values(), key=lambda item: item.template_id)
        ]
        return {"items": rows, "page": 1, "pageSize": len(rows), "total": len(rows)}

    def template_detail(
        self,
        *,
        template_id: str,
        user: AuthUserRecord,
        auth: SeedAuthStore,
    ) -> dict[str, Any]:
        self._require_read(user, auth)
        record = self._get(template_id)
        return self.template_detail_view(record)

    def save_draft(
        self,
        *,
        template_id: str,
        user: AuthUserRecord,
        auth: SeedAuthStore,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        self._require_manage(user, auth)
        record = self._get(template_id)
        if record.status != "DRAFT":
            raise AppError(
                code="WORKFLOW_TEMPLATE_NOT_DRAFT",
                message="Only DRAFT workflow templates can be edited",
                status_code=409,
            )
        merged = self._aggregate(record).model_dump(by_alias=True)
        for key in ("name", "scopeMode", "chains"):
            if key in payload:
                merged[key] = payload[key]
        merged["updatedBy"] = user.user_id
        try:
            candidate = WorkflowTemplateAggregate.model_validate(merged)
        except ValidationError as exc:
            raise AppError(
                code="WORKFLOW_TEMPLATE_INVALID_DRAFT",
                message="Workflow template draft payload is invalid",
                status_code=422,
                details=exc.errors(),
            ) from exc
        record.name = candidate.name
        record.scope_mode = candidate.scope_mode
        record.chains_json = [chain.model_dump(by_alias=True) for chain in candidate.chains]
        record.updated_by_ref = user.user_id
        record.updated_at = relative_datetime_iso()
        record.last_validation_summary = {}
        self._append_audit(
            event_type="DRAFT_SAVED",
            template=record,
            actor=user,
            auth=auth,
            template_version_id=None,
            snapshot_hash_value=None,
            validation_summary={},
        )
        return self.template_detail_view(record)

    def validate(
        self,
        *,
        template_id: str,
        user: AuthUserRecord,
        auth: SeedAuthStore,
    ) -> dict[str, Any]:
        self._require_manage(user, auth)
        record = self._get(template_id)
        template = self._aggregate(record)
        evaluator = RouteChainEvaluator(
            auth=auth,
            active_templates=self.active_template_aggregates(excluding_template_id=template_id),
        )
        findings = evaluator.validate_template(template)
        summary = self.validation_summary(findings)
        record.last_validation_summary = summary
        record.updated_by_ref = user.user_id
        record.updated_at = relative_datetime_iso()
        self._append_audit(
            event_type="VALIDATED",
            template=record,
            actor=user,
            auth=auth,
            template_version_id=record.current_version_id,
            snapshot_hash_value=snapshot_hash(template),
            validation_summary=summary,
        )
        return {
            "templateId": template_id,
            "status": record.status,
            "summary": summary,
            "findings": [item.model_dump(by_alias=True) for item in findings],
        }

    def publish(
        self,
        *,
        template_id: str,
        user: AuthUserRecord,
        auth: SeedAuthStore,
    ) -> dict[str, Any]:
        self._require_manage(user, auth)
        record = self._get(template_id)
        template = self._aggregate(record)
        current_hash = snapshot_hash(template)
        if record.status == "ACTIVE" and record.current_version_id:
            version = self.versions[record.current_version_id]
            duplicate = version.snapshot_hash == current_hash
            self._append_audit(
                event_type="PUBLISH_IDEMPOTENT",
                template=record,
                actor=user,
                auth=auth,
                template_version_id=version.template_version_id,
                snapshot_hash_value=version.snapshot_hash,
                validation_summary=record.last_validation_summary,
            )
            return {
                "template": self.template_detail_view(record),
                "version": self.version_view(version),
                "duplicate": duplicate,
            }
        if record.status != "DRAFT":
            raise AppError(
                code="WORKFLOW_TEMPLATE_INVALID_STATE",
                message="Only DRAFT workflow templates can be published",
                status_code=409,
            )

        evaluator = RouteChainEvaluator(
            auth=auth,
            active_templates=self.active_template_aggregates(excluding_template_id=template_id),
        )
        findings = evaluator.validate_template(template)
        summary = self.validation_summary(findings)
        record.last_validation_summary = summary
        if summary["errorCount"] > 0:
            raise AppError(
                code="WORKFLOW_TEMPLATE_VALIDATION_FAILED",
                message="Workflow template cannot be published with ERROR findings",
                status_code=409,
                details={
                    "summary": summary,
                    "findings": [item.model_dump(by_alias=True) for item in findings],
                },
            )

        published_template = template.model_copy(
            update={"status": "ACTIVE", "updated_by": user.user_id},
        )
        published_hash = snapshot_hash(published_template)
        version_no = self._next_version_no(template_id)
        version_id = f"{template_id}-V{version_no:03d}"
        now = relative_datetime_iso()
        version = WorkflowTemplateVersionRecord(
            template_version_id=version_id,
            template_id=template_id,
            version_no=version_no,
            status="PUBLISHED",
            snapshot_json=published_template.model_dump(by_alias=True),
            snapshot_hash=published_hash,
            target_scope_snapshot=self.target_scope_snapshot(published_template),
            published_by_ref=user.user_id,
            published_at=now,
        )
        self.versions[version_id] = version
        record.status = "ACTIVE"
        record.current_version_id = version_id
        record.updated_by_ref = user.user_id
        record.updated_at = now
        self._append_audit(
            event_type="PUBLISHED",
            template=record,
            actor=user,
            auth=auth,
            template_version_id=version_id,
            snapshot_hash_value=published_hash,
            validation_summary=summary,
        )
        return {
            "template": self.template_detail_view(record),
            "version": self.version_view(version),
            "duplicate": False,
        }

    def active_template_aggregates(
        self,
        *,
        excluding_template_id: str | None = None,
    ) -> list[WorkflowTemplateAggregate]:
        return [
            self._aggregate(record)
            for record in self.templates.values()
            if record.status == "ACTIVE" and record.template_id != excluding_template_id
        ]

    def template_summary(self, record: WorkflowTemplateRecord) -> dict[str, Any]:
        return {
            "templateId": record.template_id,
            "name": record.name,
            "domain": record.domain,
            "scopeMode": record.scope_mode,
            "status": record.status,
            "schemaVersion": record.schema_version,
            "chainCount": len(record.chains_json),
            "currentVersionId": record.current_version_id,
            "lastValidationSummary": record.last_validation_summary,
            "updatedAt": record.updated_at,
            "updatedBy": record.updated_by_ref,
        }

    def template_detail_view(self, record: WorkflowTemplateRecord) -> dict[str, Any]:
        version = self.versions.get(record.current_version_id or "")
        return {
            **self.template_summary(record),
            "template": self._aggregate(record).model_dump(by_alias=True),
            "chains": deepcopy(record.chains_json),
            "publishedVersion": self.version_view(version) if version else None,
            "auditSummary": {
                "eventCount": len(
                    [
                        event
                        for event in self.audit_events.values()
                        if event.template_id == record.template_id
                    ],
                ),
                "lastEventType": self._last_event_type(record.template_id),
            },
        }

    def version_view(self, version: WorkflowTemplateVersionRecord | None) -> dict[str, Any] | None:
        if version is None:
            return None
        return {
            "templateVersionId": version.template_version_id,
            "templateId": version.template_id,
            "versionNo": version.version_no,
            "status": version.status,
            "snapshotHash": version.snapshot_hash,
            "targetScopeSnapshot": deepcopy(version.target_scope_snapshot),
            "publishedAt": version.published_at,
            "archivedAt": version.archived_at,
        }

    def published_version_binding(
        self,
        *,
        template_id: str,
        template_version_id: str | None,
        user: AuthUserRecord,
        auth: SeedAuthStore,
    ) -> tuple[WorkflowTemplateRecord, WorkflowTemplateVersionRecord]:
        self._require_read(user, auth)
        record = self._get(template_id)
        if record.status != "ACTIVE" or not record.current_version_id:
            raise AppError(
                code="WORKFLOW_ROUTE_TEMPLATE_NOT_ACTIVE",
                message="Workflow route template must be ACTIVE before binding to a scheme",
                status_code=422,
                details={"routeTemplateId": template_id, "status": record.status},
            )
        resolved_version_id = template_version_id or record.current_version_id
        version = self.versions.get(resolved_version_id)
        if not version or version.template_id != template_id:
            raise AppError(
                code="WORKFLOW_ROUTE_VERSION_NOT_FOUND",
                message="Workflow route template version not found",
                status_code=422,
                details={
                    "routeTemplateId": template_id,
                    "routeTemplateVersionId": resolved_version_id,
                },
            )
        if version.status != "PUBLISHED":
            raise AppError(
                code="WORKFLOW_ROUTE_VERSION_NOT_PUBLISHED",
                message="Workflow route template version must be PUBLISHED",
                status_code=422,
                details={
                    "routeTemplateId": template_id,
                    "routeTemplateVersionId": resolved_version_id,
                    "status": version.status,
                },
            )
        return record, version

    @staticmethod
    def validation_summary(findings: list[WorkflowValidationFinding]) -> dict[str, Any]:
        return {
            "errorCount": sum(1 for item in findings if item.severity == "ERROR"),
            "warningCount": sum(1 for item in findings if item.severity == "WARNING"),
            "infoCount": sum(1 for item in findings if item.severity == "INFO"),
            "findingCodes": [item.code for item in findings],
        }

    @staticmethod
    def target_scope_snapshot(template: WorkflowTemplateAggregate) -> list[dict[str, Any]]:
        return [
            {
                "chainId": chain.chain_id,
                "chainName": chain.name,
                **chain.target_scope.model_dump(by_alias=True),
            }
            for chain in template.chains
        ]

    def _aggregate(self, record: WorkflowTemplateRecord) -> WorkflowTemplateAggregate:
        return WorkflowTemplateAggregate(
            templateId=record.template_id,
            name=record.name,
            domain=record.domain,
            scopeMode=record.scope_mode,
            status=record.status,
            schemaVersion=record.schema_version,
            chains=deepcopy(record.chains_json),
            createdBy=record.created_by_ref,
            updatedBy=record.updated_by_ref,
        )

    def _get(self, template_id: str) -> WorkflowTemplateRecord:
        record = self.templates.get(template_id)
        if not record:
            raise NotFoundError("Workflow template not found")
        return record

    def _next_version_no(self, template_id: str) -> int:
        existing = [
            version.version_no
            for version in self.versions.values()
            if version.template_id == template_id
        ]
        return max(existing, default=0) + 1

    def _append_audit(
        self,
        *,
        event_type: str,
        template: WorkflowTemplateRecord,
        actor: AuthUserRecord,
        auth: SeedAuthStore,
        template_version_id: str | None,
        snapshot_hash_value: str | None,
        validation_summary: dict[str, Any],
    ) -> None:
        audit_id = f"WFTA-{len(self.audit_events) + 1:05d}"
        aggregate = self._aggregate(template)
        self.audit_events[audit_id] = WorkflowTemplateAuditEventRecord(
            audit_event_id=audit_id,
            template_id=template.template_id,
            event_type=event_type,
            actor_user_id=actor.user_id,
            actor_snapshot=auth.user_snapshot(actor.user_id),
            template_version_id=template_version_id,
            snapshot_hash=snapshot_hash_value,
            route_summary={
                "chainCount": len(aggregate.chains),
                "nodeCount": sum(len(chain.nodes) for chain in aggregate.chains),
                "edgeCount": sum(len(chain.edges) for chain in aggregate.chains),
            },
            target_scope_snapshot=self.target_scope_snapshot(aggregate),
            validation_summary=deepcopy(validation_summary),
            event_created_at=relative_datetime_iso(),
        )

    def _last_event_type(self, template_id: str) -> str | None:
        rows = [event for event in self.audit_events.values() if event.template_id == template_id]
        if not rows:
            return None
        rows.sort(key=lambda item: item.event_created_at)
        return rows[-1].event_type

    @staticmethod
    def _require_read(user: AuthUserRecord, auth: SeedAuthStore) -> None:
        if auth.has_permission(user, "PERM-P2-WORKFLOW-TEMPLATE-READ"):
            return
        raise ForbiddenError()

    @staticmethod
    def _require_manage(user: AuthUserRecord, auth: SeedAuthStore) -> None:
        if auth.has_permission(user, "PERM-P2-WORKFLOW-TEMPLATE-MANAGE"):
            return
        raise ForbiddenError()

    @staticmethod
    def _seed_default_template() -> WorkflowTemplateRecord:
        now = relative_datetime_iso(hour=8, minute=25)
        return WorkflowTemplateRecord(
            template_id="WFT-ASSESS-DEFAULT",
            name="P2 assessment review route template",
            domain="assessment",
            scope_mode="by_business_line",
            status="DRAFT",
            schema_version=1,
            chains_json=valid_assessment_route_template_payload()["chains"],
            created_by_ref="SYSTEM-SEED",
            updated_by_ref="SYSTEM-SEED",
            created_at=now,
            updated_at=now,
        )


def valid_assessment_route_template_payload() -> dict[str, Any]:
    return {
        "templateId": "WFT-ASSESS-DEFAULT",
        "name": "P2 assessment review route template",
        "domain": "assessment",
        "scopeMode": "by_business_line",
        "status": "DRAFT",
        "schemaVersion": 1,
        "chains": [
            {
                "chainId": "WFC-WEALTH-GZ-NANSHA",
                "name": "Wealth branch assessment route",
                "targetScope": {
                    "scopeMode": "by_business_line",
                    "targetOrgIds": ["WLZQ-RBC-GZ-NANSHA"],
                    "businessLine": "BL-WEALTH",
                    "priority": 10,
                },
                "approvalPolicy": "ANY_ONE",
                "nodes": [
                    {
                        "nodeId": "WFN-L0-BR-COMPLIANCE",
                        "level": "L0_SELF_CHECK",
                        "nodeType": "ORG_ROLE",
                        "approverSelector": {
                            "selectorType": "ORG_ROLE",
                            "roleCode": "ROLE_BRANCH_COMPLIANCE_OFFICER",
                            "orgScopeRule": "TARGET_ORG",
                            "businessLine": "BL-WEALTH",
                        },
                        "sortOrder": 10,
                        "isFinal": False,
                        "label": "Branch compliance self-check",
                    },
                    {
                        "nodeId": "WFN-L1-BR-MANAGER",
                        "level": "L1_BRANCH_REVIEW",
                        "nodeType": "ORG_ROLE",
                        "approverSelector": {
                            "selectorType": "ORG_ROLE",
                            "roleCode": "ROLE_BRANCH_MANAGER",
                            "orgScopeRule": "TARGET_ORG",
                            "businessLine": "BL-WEALTH",
                        },
                        "sortOrder": 20,
                        "isFinal": False,
                        "label": "Branch manager review",
                    },
                    {
                        "nodeId": "WFN-L2-WEALTH-HQ",
                        "level": "L2_LINE_REVIEW",
                        "nodeType": "ORG_ROLE",
                        "approverSelector": {
                            "selectorType": "ORG_ROLE",
                            "roleCode": "ROLE_BUSINESS_LINE_MANAGER",
                            "orgScopeRule": "BUSINESS_LINE_HQ",
                            "businessLine": "BL-WEALTH",
                        },
                        "sortOrder": 30,
                        "isFinal": False,
                        "label": "Wealth business line review",
                    },
                    {
                        "nodeId": "WFN-L3-HQ-FINAL",
                        "level": "L3_HQ_FINAL",
                        "nodeType": "FINAL_APPROVER",
                        "approverSelector": {
                            "selectorType": "ROLE",
                            "roleCode": "ROLE_COMPLIANCE_DIRECTOR",
                            "orgScopeRule": "HQ_GLOBAL",
                        },
                        "sortOrder": 40,
                        "isFinal": True,
                        "label": "HQ compliance final approval",
                    },
                ],
                "edges": [
                    {
                        "edgeId": "WFE-L0-L1",
                        "fromNodeId": "WFN-L0-BR-COMPLIANCE",
                        "toNodeId": "WFN-L1-BR-MANAGER",
                        "condition": {"conditionType": "ALWAYS"},
                    },
                    {
                        "edgeId": "WFE-L1-L2",
                        "fromNodeId": "WFN-L1-BR-MANAGER",
                        "toNodeId": "WFN-L2-WEALTH-HQ",
                        "condition": {"conditionType": "ALWAYS"},
                    },
                    {
                        "edgeId": "WFE-L2-L3",
                        "fromNodeId": "WFN-L2-WEALTH-HQ",
                        "toNodeId": "WFN-L3-HQ-FINAL",
                        "condition": {"conditionType": "ALWAYS"},
                    },
                ],
            },
        ],
        "createdBy": "SYSTEM-SEED",
        "updatedBy": "SYSTEM-SEED",
    }


def invalid_template_fixture(finding_family: str) -> WorkflowTemplateAggregate:
    payload = deepcopy(valid_assessment_route_template_payload())
    payload["templateId"] = f"WFT-INVALID-{finding_family}"
    chain = payload["chains"][0]
    if finding_family == "missing_level":
        chain["nodes"] = [node for node in chain["nodes"] if node["level"] != "L2_LINE_REVIEW"]
        chain["edges"] = [edge for edge in chain["edges"] if edge["edgeId"] != "WFE-L1-L2"]
    elif finding_family == "empty_approver":
        chain["nodes"][2]["approverSelector"]["roleCode"] = "ROLE_DOES_NOT_EXIST"
    elif finding_family == "disconnected":
        chain["edges"] = []
    elif finding_family == "cycle":
        chain["edges"].append(
            {
                "edgeId": "WFE-L2-L1-CYCLE",
                "fromNodeId": "WFN-L2-WEALTH-HQ",
                "toNodeId": "WFN-L1-BR-MANAGER",
                "condition": {"conditionType": "ALWAYS"},
            },
        )
    elif finding_family == "invalid_condition":
        chain["edges"][0]["condition"] = "businessLine == 'wealth'"
    elif finding_family == "segregation_of_duties":
        chain["nodes"][1]["approverSelector"] = deepcopy(chain["nodes"][0]["approverSelector"])
    return WorkflowTemplateAggregate.model_validate(payload)


workflow_template_store = SeedWorkflowTemplateStore()
