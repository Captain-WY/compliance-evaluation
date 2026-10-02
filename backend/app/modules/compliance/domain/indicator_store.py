from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, field
from typing import Any

from app.modules.compliance.core.errors import AppError, ForbiddenError, NotFoundError
from app.modules.compliance.domain.auth_store import AuthUserRecord, SeedAuthStore
from app.modules.compliance.domain.dictionaries import (
    assessment_transition_for,
    validate_codes,
    validate_p1_assessment_code,
)
from app.modules.compliance.domain.safe_scoring import validate_scoring_rule
from app.modules.compliance.domain.seed_time import relative_datetime_iso

INDICATOR_CATEGORY_META: dict[str, dict[str, str]] = {
    "AICAT-P1-FOUNDATION-GOVERNANCE": {
        "categoryCode": "GOVERNANCE",
        "categoryName": "治理与制度",
    },
    "AICAT-P1-FOUNDATION-OPERATIONS": {
        "categoryCode": "OPERATIONS",
        "categoryName": "经营与操作",
    },
    "AICAT-P1-FOUNDATION-BRANCH-COMPLIANCE": {
        "categoryCode": "BRANCH_COMPLIANCE",
        "categoryName": "分支合规",
    },
}


@dataclass
class IndicatorVariableRecord:
    variable_id: str
    variable_code: str
    variable_name: str
    value_type: str
    required: bool = True


@dataclass
class ScoringRuleRecord:
    scoring_rule_id: str
    rule_type: str
    effect: str
    expression: str | None = None
    bands: list[dict[str, Any]] = field(default_factory=list)
    rubrics: list[dict[str, Any]] = field(default_factory=list)
    require_continuous_bands: bool = False
    validation_status: str = "NOT_VALIDATED"
    validation_errors: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class EvidenceTemplateRecord:
    evidence_template_id: str
    template_name: str
    required: bool = True
    accepted_file_tags: list[str] = field(default_factory=list)
    description: str = ""


@dataclass
class IndicatorVersionRecord:
    version_id: str
    indicator_id: str
    version_no: int
    status: str
    weight_default: float
    max_score: float
    variables: list[IndicatorVariableRecord]
    scoring_rule: ScoringRuleRecord | None
    evidence_templates: list[EvidenceTemplateRecord]
    scoring_validation_status: str = "NOT_VALIDATED"
    validation_errors: list[dict[str, Any]] = field(default_factory=list)
    published_by_ref: str | None = None
    published_at_ref: str | None = None
    archived_reason: str | None = None
    core_snapshot: dict[str, Any] = field(default_factory=dict)


@dataclass
class IndicatorRecord:
    indicator_id: str
    indicator_code: str
    indicator_name: str
    category_id: str
    business_line: str
    data_type: str
    value_type: str
    input_mode: str
    data_source_mode: str
    description: str
    created_by_ref: str
    created_at: str
    active_version_id: str | None = None
    versions: dict[str, IndicatorVersionRecord] = field(default_factory=dict)


class SeedIndicatorStore:
    def __init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self.indicators = self._build_indicators()

    def indicator_page(
        self,
        *,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        keyword: str | None = None,
        category_id: str | None = None,
        business_line: str | None = None,
        status: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        self._require_read(user, auth_store)
        validate_p1_assessment_code(status, category="assessment_indicator_status", field="status")
        if business_line is not None:
            validate_codes((business_line, "business_line", "businessLine"))
        records = [
            indicator
            for indicator in self.indicators.values()
            if self._matches_filters(
                indicator,
                keyword=keyword,
                category_id=category_id,
                business_line=business_line,
                status=status,
            )
        ]
        records.sort(key=lambda item: item.indicator_code)
        start = (page - 1) * page_size
        end = start + page_size
        return {
            "items": [self.indicator_summary(record) for record in records[start:end]],
            "page": page,
            "pageSize": page_size,
            "total": len(records),
        }

    def create_indicator(
        self,
        *,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        self._require_manage(user, auth_store)
        self._validate_indicator_payload(payload)
        indicator_id = f"AIND-{len(self.indicators) + 1:04d}"
        indicator_code = (
            payload.get("indicatorCode")
            or f"WLZQ-AIND-{len(self.indicators) + 1:04d}"
        )
        if any(item.indicator_code == indicator_code for item in self.indicators.values()):
            raise AppError(
                code="DUPLICATE_INDICATOR_CODE",
                message="指标编码已存在",
                status_code=409,
            )
        normalized_name = payload["indicatorName"].strip().lower()
        if any(
            item.indicator_name.strip().lower() == normalized_name
            for item in self.indicators.values()
        ):
            raise AppError(
                code="DUPLICATE_INDICATOR_NAME",
                message="指标名称已存在",
                status_code=409,
            )
        version_id = f"{indicator_id}-V001"
        version = self._version_from_payload(
            indicator_id=indicator_id,
            version_id=version_id,
            version_no=1,
            payload=payload,
        )
        indicator = IndicatorRecord(
            indicator_id=indicator_id,
            indicator_code=indicator_code,
            indicator_name=payload["indicatorName"],
            category_id=payload["categoryId"],
            business_line=payload.get("businessLine", "财富管理"),
            data_type=payload.get("dataType", "QUANTITATIVE"),
            value_type=payload.get("valueType", "NUMBER"),
            input_mode=payload.get("inputMode", "MANUAL"),
            data_source_mode=payload.get("dataSourceMode", "MANUAL"),
            description=payload.get("description", ""),
            created_by_ref=user.user_id,
            created_at=relative_datetime_iso(),
            active_version_id=None,
            versions={version_id: version},
        )
        self.indicators[indicator_id] = indicator
        return self.indicator_detail(indicator, version)

    def update_draft(
        self,
        *,
        indicator_id: str,
        version_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        self._require_manage(user, auth_store)
        indicator, version = self._get_indicator_version(indicator_id, version_id)
        if version.status != "DRAFT":
            raise AppError(
                code="INVALID_STATE",
                message="Only DRAFT indicator versions can be updated",
                status_code=409,
            )
        merged = self._detail_payload(indicator, version)
        merged.update(payload)
        self._validate_indicator_payload(merged)
        if "indicatorName" in payload:
            normalized_name = payload["indicatorName"].strip().lower()
            if any(
                item.indicator_id != indicator_id
                and item.indicator_name.strip().lower() == normalized_name
                for item in self.indicators.values()
            ):
                raise AppError(
                    code="DUPLICATE_INDICATOR_NAME",
                    message="指标名称已存在",
                    status_code=409,
                )
        for field_name, attr_name in (
            ("indicatorName", "indicator_name"),
            ("categoryId", "category_id"),
            ("businessLine", "business_line"),
            ("dataType", "data_type"),
            ("valueType", "value_type"),
            ("inputMode", "input_mode"),
            ("dataSourceMode", "data_source_mode"),
            ("description", "description"),
        ):
            if field_name in payload:
                setattr(indicator, attr_name, payload[field_name])
        if any(
            field in payload
            for field in (
                "weightDefault",
                "maxScore",
                "variables",
                "scoringRule",
                "evidenceTemplates",
            )
        ):
            updated = self._version_from_payload(
                indicator_id=indicator.indicator_id,
                version_id=version.version_id,
                version_no=version.version_no,
                payload=merged,
            )
            indicator.versions[version_id] = updated
            version = updated
        return self.indicator_detail(indicator, version)

    def validate_scoring(
        self,
        *,
        indicator_id: str,
        version_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        self._require_manage(user, auth_store)
        indicator, version = self._get_indicator_version(indicator_id, version_id)
        scoring_rule = payload.get("scoringRule") or self._scoring_rule_view(version.scoring_rule)
        if not scoring_rule:
            raise AppError(
                code="VALIDATION_ERROR",
                message="评分规则校验未通过",
                status_code=422,
                details=[{"code": "unsupported_token", "message": "Scoring rule required"}],
            )
        else:
            sample_values = payload.get("sampleValues") or scoring_rule.get("sampleValues") or {}
            variable_types = {
                variable.variable_code: variable.value_type
                for variable in version.variables
            }
            validation = validate_scoring_rule(
                scoring_rule,
                {variable.variable_code for variable in version.variables},
                variable_types=variable_types,
                sample_values=sample_values,
            )
            if not validation.valid:
                if (
                    payload.get("scoringRule") is None
                    and version.scoring_rule
                    and version.status == "DRAFT"
                ):
                    version.scoring_rule.validation_status = "INVALID"
                    version.scoring_rule.validation_errors = validation.errors
                    version.scoring_validation_status = "INVALID"
                    version.validation_errors = validation.errors
                raise AppError(
                    code="VALIDATION_ERROR",
                    message="评分规则校验未通过",
                    status_code=422,
                    details=validation.errors,
                )
            result = {
                "valid": validation.valid,
                "status": "VALID",
                "errors": validation.errors,
                "sampleResult": validation.sample_result,
            }
            if (
                payload.get("scoringRule") is None
                and version.scoring_rule
                and version.status == "DRAFT"
            ):
                version.scoring_rule.validation_status = result["status"]
                version.scoring_rule.validation_errors = validation.errors
                version.scoring_validation_status = result["status"]
                version.validation_errors = validation.errors
        return {
            "indicatorId": indicator.indicator_id,
            "versionId": version.version_id,
            **result,
        }

    def publish_version(
        self,
        *,
        indicator_id: str,
        version_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        self._require_manage(user, auth_store)
        indicator, version = self._get_indicator_version(indicator_id, version_id)
        if version.status == "PUBLISHED":
            return self.indicator_detail(indicator, version)
        if version.status == "ARCHIVED":
            raise AppError(
                code="INVALID_STATE",
                message="Archived indicator versions cannot be published",
                status_code=409,
                details={"status": version.status, "action": "publish_indicator_version"},
            )
        self._ensure_transition(version.status, "publish_indicator_version")
        if not version.variables or not version.scoring_rule or not version.evidence_templates:
            raise AppError(
                code="VALIDATION_ERROR",
                message="发布前必须配置变量、评分规则和证据模板",
                status_code=422,
                details={"required": ["variables", "scoringRule", "evidenceTemplates"]},
            )
        validation = self.validate_scoring(
            indicator_id=indicator_id,
            version_id=version_id,
            user=user,
            auth_store=auth_store,
            payload={},
        )
        if not validation["valid"]:
            raise AppError(code="VALIDATION_ERROR", message="评分规则校验未通过", status_code=422)
        version.status = "PUBLISHED"
        version.published_by_ref = user.user_id
        version.published_at_ref = relative_datetime_iso()
        version.core_snapshot = self._core_snapshot(indicator, version)
        indicator.active_version_id = version.version_id
        return self.indicator_detail(indicator, version)

    def archive_version(
        self,
        *,
        indicator_id: str,
        version_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
        reason: str,
    ) -> dict[str, Any]:
        self._require_manage(user, auth_store)
        indicator, version = self._get_indicator_version(indicator_id, version_id)
        if version.status == "ARCHIVED":
            raise AppError(
                code="INVALID_STATE",
                message="Indicator version is already archived",
                status_code=409,
                details={"status": version.status, "action": "archive_indicator_version"},
            )
        self._ensure_transition(version.status, "archive_indicator_version")
        version.status = "ARCHIVED"
        version.archived_reason = reason
        if indicator.active_version_id == version.version_id:
            indicator.active_version_id = None
        return self.indicator_detail(indicator, version)

    def clone_version(
        self,
        *,
        indicator_id: str,
        version_id: str,
        user: AuthUserRecord,
        auth_store: SeedAuthStore,
    ) -> dict[str, Any]:
        self._require_manage(user, auth_store)
        indicator, source = self._get_indicator_version(indicator_id, version_id)
        version_no = max(item.version_no for item in indicator.versions.values()) + 1
        cloned = deepcopy(source)
        cloned.version_no = version_no
        cloned.version_id = f"{indicator.indicator_id}-V{version_no:03d}"
        cloned.status = "DRAFT"
        cloned.scoring_validation_status = "NOT_VALIDATED"
        cloned.validation_errors = []
        cloned.published_by_ref = None
        cloned.published_at_ref = None
        cloned.archived_reason = None
        cloned.core_snapshot = {}
        if cloned.scoring_rule:
            cloned.scoring_rule.scoring_rule_id = f"{cloned.version_id}-RULE"
            cloned.scoring_rule.validation_status = "NOT_VALIDATED"
            cloned.scoring_rule.validation_errors = []
        for index, variable in enumerate(cloned.variables, start=1):
            variable.variable_id = f"{cloned.version_id}-VAR-{index:03d}"
        for index, template in enumerate(cloned.evidence_templates, start=1):
            template.evidence_template_id = f"{cloned.version_id}-EVID-{index:03d}"
        indicator.versions[cloned.version_id] = cloned
        return self.indicator_detail(indicator, cloned)

    def _scheme_link_count(self, indicator_id: str) -> int | None:
        # Local import to avoid circular dependency with scheme_store.
        # During module initialization scheme_store may be partially loaded;
        # in that case fall back to None and compute on real API calls later.
        try:
            from app.modules.compliance.domain.scheme_store import scheme_store
        except ImportError:
            return None

        linked_schemes = {
            scheme.scheme_id
            for scheme in scheme_store.schemes.values()
            for item in scheme.items
            if item.indicator_id == indicator_id
        }
        return len(linked_schemes) if linked_schemes else None

    def indicator_summary(self, indicator: IndicatorRecord) -> dict[str, Any]:
        latest = max(indicator.versions.values(), key=lambda item: item.version_no)
        active = (
            indicator.versions.get(indicator.active_version_id)
            if indicator.active_version_id
            else None
        )
        display = active or latest
        category_meta = INDICATOR_CATEGORY_META.get(
            indicator.category_id,
            {"categoryCode": indicator.category_id, "categoryName": indicator.category_id},
        )
        return {
            "indicatorId": indicator.indicator_id,
            "indicatorCode": indicator.indicator_code,
            "indicatorName": indicator.indicator_name,
            "categoryId": indicator.category_id,
            **category_meta,
            "businessLine": indicator.business_line,
            "dataType": indicator.data_type,
            "valueType": indicator.value_type,
            "inputMode": indicator.input_mode,
            "dataSourceMode": indicator.data_source_mode,
            "activeVersionId": indicator.active_version_id,
            "latestVersionId": latest.version_id,
            "latestVersionNo": latest.version_no,
            "status": display.status,
            "latestStatus": latest.status,
            "scoringValidationStatus": display.scoring_validation_status,
            "schemeLinkCount": self._scheme_link_count(indicator.indicator_id),
            "displayVersion": self.version_view(display),
            "latestVersion": self.version_view(latest),
            "versions": [
                self.version_view(item)
                for item in sorted(
                    indicator.versions.values(),
                    key=lambda version: version.version_no,
                    reverse=True,
                )
            ],
        }

    def indicator_detail(
        self,
        indicator: IndicatorRecord,
        version: IndicatorVersionRecord,
    ) -> dict[str, Any]:
        return {
            **self.indicator_summary(indicator),
            "description": indicator.description,
            "createdByRef": indicator.created_by_ref,
            "createdAt": indicator.created_at,
            "version": self.version_view(version),
            "versions": [self.version_view(item) for item in indicator.versions.values()],
        }

    def version_view(self, version: IndicatorVersionRecord) -> dict[str, Any]:
        return {
            "versionId": version.version_id,
            "indicatorId": version.indicator_id,
            "versionNo": version.version_no,
            "status": version.status,
            "weightDefault": version.weight_default,
            "maxScore": version.max_score,
            "scoringValidationStatus": version.scoring_validation_status,
            "validationErrors": version.validation_errors,
            "publishedByRef": version.published_by_ref,
            "publishedAtRef": version.published_at_ref,
            "archivedReason": version.archived_reason,
            "coreSnapshot": version.core_snapshot,
            "variables": [self._variable_view(item) for item in version.variables],
            "scoringRule": self._scoring_rule_view(version.scoring_rule),
            "evidenceTemplates": [
                self._evidence_template_view(item)
                for item in version.evidence_templates
            ],
        }

    def published_version_snapshot(self, indicator_id: str, version_id: str) -> dict[str, Any]:
        indicator, version = self._get_indicator_version(indicator_id, version_id)
        if version.status != "PUBLISHED":
            raise AppError(
                code="VALIDATION_ERROR",
                message="Scheme items must reference published indicator versions",
                status_code=422,
                details={
                    "indicatorId": indicator_id,
                    "versionId": version_id,
                    "status": version.status,
                },
            )
        return {
            **self.indicator_summary(indicator),
            "version": self.version_view(version),
            "coreSnapshot": version.core_snapshot,
        }

    def _version_from_payload(
        self,
        *,
        indicator_id: str,
        version_id: str,
        version_no: int,
        payload: dict[str, Any],
    ) -> IndicatorVersionRecord:
        variables = [
            IndicatorVariableRecord(
                variable_id=f"{version_id}-VAR-{index:03d}",
                variable_code=item["variableCode"],
                variable_name=item["variableName"],
                value_type=item.get("valueType", "NUMBER"),
                required=item.get("required", True),
            )
            for index, item in enumerate(payload.get("variables") or [], start=1)
        ]
        scoring_rule_payload = payload.get("scoringRule")
        scoring_rule = (
            ScoringRuleRecord(
                scoring_rule_id=f"{version_id}-RULE",
                rule_type=scoring_rule_payload["ruleType"],
                effect=scoring_rule_payload.get("effect", "DIRECT_SCORE"),
                expression=scoring_rule_payload.get("expression"),
                bands=list(scoring_rule_payload.get("bands") or []),
                rubrics=list(scoring_rule_payload.get("rubrics") or []),
                require_continuous_bands=scoring_rule_payload.get("requireContinuousBands", False),
            )
            if scoring_rule_payload
            else None
        )
        evidence_templates = [
            EvidenceTemplateRecord(
                evidence_template_id=f"{version_id}-EVID-{index:03d}",
                template_name=item["templateName"],
                required=item.get("required", True),
                accepted_file_tags=list(item.get("acceptedFileTags") or []),
                description=item.get("description", ""),
            )
            for index, item in enumerate(payload.get("evidenceTemplates") or [], start=1)
        ]
        return IndicatorVersionRecord(
            version_id=version_id,
            indicator_id=indicator_id,
            version_no=version_no,
            status="DRAFT",
            weight_default=payload.get("weightDefault", 0),
            max_score=payload.get("maxScore", 100),
            variables=variables,
            scoring_rule=scoring_rule,
            evidence_templates=evidence_templates,
        )

    def _validate_indicator_payload(self, payload: dict[str, Any]) -> None:
        category_id = payload.get("categoryId")
        if category_id is not None and category_id not in INDICATOR_CATEGORY_META:
            raise AppError(
                code="VALIDATION_ERROR",
                message="categoryId must be a known indicator foundation category",
                status_code=422,
                details={
                    "field": "categoryId",
                    "received": category_id,
                    "allowedValues": list(INDICATOR_CATEGORY_META.keys()),
                },
            )
        validate_codes(
            (payload.get("businessLine"), "business_line", "businessLine"),
            (payload.get("dataType"), "indicator_data_type", "dataType"),
            (payload.get("valueType"), "indicator_value_type", "valueType"),
            (payload.get("inputMode"), "indicator_input_mode", "inputMode"),
            (payload.get("dataSourceMode"), "indicator_data_source_mode", "dataSourceMode"),
        )
        for variable in payload.get("variables") or []:
            validate_codes(
                (variable.get("valueType"), "indicator_value_type", "variables.valueType"),
            )
        scoring_rule = payload.get("scoringRule")
        if scoring_rule:
            validate_codes(
                (scoring_rule.get("ruleType"), "scoring_rule_type", "scoringRule.ruleType"),
                (scoring_rule.get("effect"), "scoring_effect", "scoringRule.effect"),
            )

    def _detail_payload(
        self,
        indicator: IndicatorRecord,
        version: IndicatorVersionRecord,
    ) -> dict[str, Any]:
        return {
            "indicatorName": indicator.indicator_name,
            "categoryId": indicator.category_id,
            "businessLine": indicator.business_line,
            "dataType": indicator.data_type,
            "valueType": indicator.value_type,
            "inputMode": indicator.input_mode,
            "dataSourceMode": indicator.data_source_mode,
            "description": indicator.description,
            "weightDefault": version.weight_default,
            "maxScore": version.max_score,
            "variables": [self._variable_view(item) for item in version.variables],
            "scoringRule": self._scoring_rule_view(version.scoring_rule),
            "evidenceTemplates": [
                self._evidence_template_view(item)
                for item in version.evidence_templates
            ],
        }

    def _get_indicator_version(
        self,
        indicator_id: str,
        version_id: str,
    ) -> tuple[IndicatorRecord, IndicatorVersionRecord]:
        indicator = self.indicators.get(indicator_id)
        if not indicator:
            raise NotFoundError("Indicator not found")
        version = indicator.versions.get(version_id)
        if not version:
            raise NotFoundError("Indicator version not found")
        return indicator, version

    def _ensure_transition(self, status: str, action: str) -> None:
        transition = assessment_transition_for(
            machine="indicatorVersion",
            state=status,
            action=action,
        )
        if transition is None:
            raise AppError(
                code="INVALID_TRANSITION",
                message="Invalid indicator version transition",
                status_code=409,
                details={"status": status, "action": action},
            )

    @staticmethod
    def _matches_filters(
        indicator: IndicatorRecord,
        *,
        keyword: str | None,
        category_id: str | None,
        business_line: str | None,
        status: str | None,
    ) -> bool:
        if category_id is not None and indicator.category_id != category_id:
            return False
        if business_line is not None and indicator.business_line != business_line:
            return False
        if status is not None and all(
            version.status != status for version in indicator.versions.values()
        ):
            return False
        if keyword:
            normalized = keyword.lower()
            return (
                normalized in indicator.indicator_name.lower()
                or normalized in indicator.indicator_code.lower()
            )
        return True

    @staticmethod
    def _variable_view(variable: IndicatorVariableRecord) -> dict[str, Any]:
        return {
            "variableId": variable.variable_id,
            "variableCode": variable.variable_code,
            "variableName": variable.variable_name,
            "valueType": variable.value_type,
            "required": variable.required,
        }

    @staticmethod
    def _scoring_rule_view(scoring_rule: ScoringRuleRecord | None) -> dict[str, Any] | None:
        if scoring_rule is None:
            return None
        return {
            "scoringRuleId": scoring_rule.scoring_rule_id,
            "ruleType": scoring_rule.rule_type,
            "effect": scoring_rule.effect,
            "expression": scoring_rule.expression,
            "bands": list(scoring_rule.bands),
            "rubrics": list(scoring_rule.rubrics),
            "requireContinuousBands": scoring_rule.require_continuous_bands,
            "validationStatus": scoring_rule.validation_status,
            "validationErrors": scoring_rule.validation_errors,
        }

    @staticmethod
    def _evidence_template_view(template: EvidenceTemplateRecord) -> dict[str, Any]:
        return {
            "evidenceTemplateId": template.evidence_template_id,
            "templateName": template.template_name,
            "required": template.required,
            "acceptedFileTags": template.accepted_file_tags,
            "description": template.description,
        }

    def _core_snapshot(
        self,
        indicator: IndicatorRecord,
        version: IndicatorVersionRecord,
    ) -> dict[str, Any]:
        return {
            "indicatorCode": indicator.indicator_code,
            "indicatorName": indicator.indicator_name,
            "categoryId": indicator.category_id,
            "businessLine": indicator.business_line,
            "dataType": indicator.data_type,
            "valueType": indicator.value_type,
            "inputMode": indicator.input_mode,
            "dataSourceMode": indicator.data_source_mode,
            "weightDefault": version.weight_default,
            "maxScore": version.max_score,
            "variables": [self._variable_view(item) for item in version.variables],
            "scoringRule": self._scoring_rule_view(version.scoring_rule),
            "evidenceTemplates": [
                self._evidence_template_view(item)
                for item in version.evidence_templates
            ],
        }

    @staticmethod
    def _require_read(user: AuthUserRecord, auth_store: SeedAuthStore) -> None:
        if auth_store.has_permission(
            user,
            "PERM-P1-ASSESSMENT-INDICATOR-READ",
        ) or auth_store.has_permission(
            user,
            "PERM-P1-ASSESSMENT-INDICATOR-MANAGE",
        ):
            return
        raise ForbiddenError()

    @staticmethod
    def _require_manage(user: AuthUserRecord, auth_store: SeedAuthStore) -> None:
        auth_store.require_permission(user, "PERM-P1-ASSESSMENT-INDICATOR-MANAGE")

    def _build_indicators(self) -> dict[str, IndicatorRecord]:
        seed_specs: list[dict[str, Any]] = [
            {
                "indicatorId": "AIND-SEED-001",
                "indicatorCode": "WLZQ-AIND-SEED-001",
                "indicatorName": "分支合规资料及时率",
                "categoryId": "AICAT-P1-FOUNDATION-BRANCH-COMPLIANCE",
                "businessLine": "财富管理",
                "dataType": "QUANTITATIVE",
                "valueType": "NUMBER",
                "inputMode": "MANUAL",
                "dataSourceMode": "FILE_EVIDENCE",
                "description": "P1 downstream scheme fixture indicator.",
                "weightDefault": 10,
                "maxScore": 100,
                "variables": [
                    {
                        "variableCode": "submitted_on_time",
                        "variableName": "按时提交次数",
                        "valueType": "NUMBER",
                    },
                    {
                        "variableCode": "required_total",
                        "variableName": "应提交次数",
                        "valueType": "NUMBER",
                    },
                ],
                "scoringRule": {
                    "ruleType": "FORMULA",
                    "effect": "DIRECT_SCORE",
                    "expression": "round(submitted_on_time / required_total * 100, 2)",
                },
                "evidenceTemplates": [
                    {
                        "templateName": "合规资料提交凭证",
                        "required": True,
                        "acceptedFileTags": ["系统截图", "业务凭证"],
                    },
                ],
            },
            {
                "indicatorId": "AIND-SEED-002",
                "indicatorCode": "WLZQ-AIND-SEED-002",
                "indicatorName": "合规培训覆盖率",
                "categoryId": "AICAT-P1-FOUNDATION-GOVERNANCE",
                "businessLine": "财富管理",
                "dataType": "QUANTITATIVE",
                "valueType": "NUMBER",
                "inputMode": "MANUAL",
                "dataSourceMode": "FILE_EVIDENCE",
                "description": "年度合规培训覆盖情况，采用区间评分规则样本。",
                "weightDefault": 5,
                "maxScore": 100,
                "variables": [
                    {
                        "variableCode": "training_count",
                        "variableName": "实际培训次数",
                        "valueType": "NUMBER",
                    },
                    {
                        "variableCode": "required_count",
                        "variableName": "应培训次数",
                        "valueType": "NUMBER",
                    },
                ],
                "scoringRule": {
                    "ruleType": "INTERVAL",
                    "effect": "DIRECT_SCORE",
                    "requireContinuousBands": True,
                    "bands": [
                        {"minValue": 12, "maxValue": None, "score": 100},
                        {"minValue": 8, "maxValue": 12, "score": 80},
                        {"minValue": 4, "maxValue": 8, "score": 60},
                        {"minValue": 0, "maxValue": 4, "score": 40},
                    ],
                },
                "evidenceTemplates": [
                    {
                        "templateName": "培训签到表",
                        "required": False,
                        "acceptedFileTags": ["制度文件", "会议纪要"],
                    },
                ],
            },
            {
                "indicatorId": "AIND-SEED-003",
                "indicatorCode": "WLZQ-AIND-SEED-003",
                "indicatorName": "反洗钱可疑交易监测质量",
                "categoryId": "AICAT-P1-FOUNDATION-OPERATIONS",
                "businessLine": "投资银行",
                "dataType": "QUANTITATIVE",
                "valueType": "NUMBER",
                "inputMode": "MANUAL",
                "dataSourceMode": "FILE_EVIDENCE",
                "description": (
                    "反洗钱可疑交易监测质量评估，采用定性评分规则样本，"
                    "被多个考核方案引用。"
                ),
                "weightDefault": 10,
                "maxScore": 100,
                "variables": [
                    {
                        "variableCode": "alert_count",
                        "variableName": "预警数量",
                        "valueType": "NUMBER",
                    },
                    {
                        "variableCode": "processed_count",
                        "variableName": "已处理数量",
                        "valueType": "NUMBER",
                    },
                ],
                "scoringRule": {
                    "ruleType": "QUALITATIVE_RUBRIC",
                    "effect": "DIRECT_SCORE",
                    "rubrics": [
                        {"itemCode": "EXCELLENT", "itemLabel": "优秀", "score": 100},
                        {"itemCode": "GOOD", "itemLabel": "良好", "score": 80},
                        {"itemCode": "FAIR", "itemLabel": "合格", "score": 60},
                        {"itemCode": "POOR", "itemLabel": "待改进", "score": 40},
                    ],
                },
                "evidenceTemplates": [
                    {
                        "templateName": "反洗钱监测报告",
                        "required": True,
                        "acceptedFileTags": ["业务凭证", "系统截图"],
                    },
                ],
            },
            {
                "indicatorId": "AIND-SEED-004",
                "indicatorCode": "WLZQ-AIND-SEED-004",
                "indicatorName": "客户投诉结案及时率",
                "categoryId": "AICAT-P1-FOUNDATION-BRANCH-COMPLIANCE",
                "businessLine": "财富管理",
                "dataType": "QUANTITATIVE",
                "valueType": "NUMBER",
                "inputMode": "MANUAL",
                "dataSourceMode": "FILE_EVIDENCE",
                "description": "客户投诉结案及时率，采用通过/未通过评分规则样本。",
                "weightDefault": 10,
                "maxScore": 100,
                "variables": [
                    {
                        "variableCode": "resolved_count",
                        "variableName": "已结案数",
                        "valueType": "NUMBER",
                    },
                    {
                        "variableCode": "total_count",
                        "variableName": "投诉总数",
                        "valueType": "NUMBER",
                    },
                ],
                "scoringRule": {
                    "ruleType": "PASS_FAIL",
                    "effect": "DIRECT_SCORE",
                    "expression": "resolved_count / total_count >= 0.95",
                },
                "evidenceTemplates": [
                    {
                        "templateName": "投诉处理记录",
                        "required": False,
                        "acceptedFileTags": ["业务凭证"],
                    },
                ],
            },
        ]

        indicators: dict[str, IndicatorRecord] = {}
        for spec in seed_specs:
            indicator_id = spec["indicatorId"]
            version_id = f"{indicator_id}-V001"
            payload = {
                "indicatorCode": spec["indicatorCode"],
                "indicatorName": spec["indicatorName"],
                "categoryId": spec["categoryId"],
                "businessLine": spec["businessLine"],
                "dataType": spec["dataType"],
                "valueType": spec["valueType"],
                "inputMode": spec["inputMode"],
                "dataSourceMode": spec["dataSourceMode"],
                "description": spec["description"],
                "weightDefault": spec["weightDefault"],
                "maxScore": spec["maxScore"],
                "variables": spec["variables"],
                "scoringRule": spec["scoringRule"],
                "evidenceTemplates": spec["evidenceTemplates"],
            }
            version = self._version_from_payload(
                indicator_id=indicator_id,
                version_id=version_id,
                version_no=1,
                payload=payload,
            )
            version.status = "PUBLISHED"
            version.scoring_validation_status = "VALID"
            version.published_by_ref = "SYSTEM-SEED"
            version.published_at_ref = relative_datetime_iso()
            if version.scoring_rule:
                version.scoring_rule.validation_status = "VALID"
            indicator = IndicatorRecord(
                indicator_id=indicator_id,
                indicator_code=payload["indicatorCode"],
                indicator_name=payload["indicatorName"],
                category_id=payload["categoryId"],
                business_line=payload["businessLine"],
                data_type=payload["dataType"],
                value_type=payload["valueType"],
                input_mode=payload["inputMode"],
                data_source_mode=payload["dataSourceMode"],
                description=payload["description"],
                created_by_ref="SYSTEM-SEED",
                created_at=relative_datetime_iso(),
                active_version_id=version_id,
                versions={version_id: version},
            )
            version.core_snapshot = self._core_snapshot(indicator, version)
            indicators[indicator_id] = indicator
        return indicators


indicator_store = SeedIndicatorStore()
