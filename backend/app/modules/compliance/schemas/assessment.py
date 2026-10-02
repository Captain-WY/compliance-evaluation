from typing import Any

from pydantic import BaseModel, Field


class IndicatorVariableRequest(BaseModel):
    variable_code: str = Field(alias="variableCode", min_length=1)
    variable_name: str = Field(alias="variableName", min_length=1)
    value_type: str = Field(default="NUMBER", alias="valueType")
    required: bool = True

    model_config = {"populate_by_name": True}


class ScoringRuleBandRequest(BaseModel):
    min_value: float | None = Field(default=None, alias="minValue")
    max_value: float | None = Field(default=None, alias="maxValue")
    score: float

    model_config = {"populate_by_name": True}


class QualitativeRubricItemRequest(BaseModel):
    item_code: str = Field(alias="itemCode", min_length=1)
    item_label: str = Field(alias="itemLabel", min_length=1)
    score: float

    model_config = {"populate_by_name": True}


class ScoringRuleRequest(BaseModel):
    rule_type: str = Field(alias="ruleType", min_length=1)
    effect: str = "DIRECT_SCORE"
    expression: str | None = None
    bands: list[ScoringRuleBandRequest] = Field(default_factory=list)
    rubrics: list[QualitativeRubricItemRequest] = Field(default_factory=list)
    require_continuous_bands: bool = Field(default=False, alias="requireContinuousBands")
    sample_values: dict[str, float] = Field(default_factory=dict, alias="sampleValues")

    model_config = {"populate_by_name": True}


class EvidenceTemplateRequest(BaseModel):
    template_name: str = Field(alias="templateName", min_length=1)
    required: bool = True
    accepted_file_tags: list[str] = Field(default_factory=list, alias="acceptedFileTags")
    description: str = ""

    model_config = {"populate_by_name": True}


class AssessmentIndicatorDraftCreateRequest(BaseModel):
    indicator_code: str | None = Field(default=None, alias="indicatorCode")
    indicator_name: str = Field(alias="indicatorName", min_length=1)
    category_id: str = Field(alias="categoryId", min_length=1)
    business_line: str = Field(default="财富管理", alias="businessLine")
    data_type: str = Field(default="QUANTITATIVE", alias="dataType")
    value_type: str = Field(default="NUMBER", alias="valueType")
    input_mode: str = Field(default="MANUAL", alias="inputMode")
    data_source_mode: str = Field(default="MANUAL", alias="dataSourceMode")
    description: str = ""
    weight_default: float = Field(default=0, alias="weightDefault", ge=0)
    max_score: float = Field(default=100, alias="maxScore", gt=0)
    variables: list[IndicatorVariableRequest] = Field(default_factory=list)
    scoring_rule: ScoringRuleRequest | None = Field(default=None, alias="scoringRule")
    evidence_templates: list[EvidenceTemplateRequest] = Field(
        default_factory=list,
        alias="evidenceTemplates",
    )

    model_config = {"populate_by_name": True}


class AssessmentIndicatorDraftUpdateRequest(BaseModel):
    indicator_name: str | None = Field(default=None, alias="indicatorName", min_length=1)
    category_id: str | None = Field(default=None, alias="categoryId")
    business_line: str | None = Field(default=None, alias="businessLine")
    data_type: str | None = Field(default=None, alias="dataType")
    value_type: str | None = Field(default=None, alias="valueType")
    input_mode: str | None = Field(default=None, alias="inputMode")
    data_source_mode: str | None = Field(default=None, alias="dataSourceMode")
    description: str | None = None
    weight_default: float | None = Field(default=None, alias="weightDefault", ge=0)
    max_score: float | None = Field(default=None, alias="maxScore", gt=0)
    variables: list[IndicatorVariableRequest] | None = None
    scoring_rule: ScoringRuleRequest | None = Field(default=None, alias="scoringRule")
    evidence_templates: list[EvidenceTemplateRequest] | None = Field(
        default=None,
        alias="evidenceTemplates",
    )

    model_config = {"populate_by_name": True}


class ScoringValidationRequest(BaseModel):
    scoring_rule: ScoringRuleRequest | None = Field(default=None, alias="scoringRule")
    sample_values: dict[str, float] = Field(default_factory=dict, alias="sampleValues")

    model_config = {"populate_by_name": True}


class ArchiveReasonRequest(BaseModel):
    reason: str = Field(min_length=1)
    request_id: str | None = Field(default=None, alias="requestId")
    idempotency_key: str | None = Field(default=None, alias="idempotencyKey")
    optimistic_version: int | None = Field(default=None, alias="optimisticVersion")

    model_config = {"populate_by_name": True}


class AssessmentSchemeCommandRequest(BaseModel):
    request_id: str | None = Field(default=None, alias="requestId")
    idempotency_key: str = Field(alias="idempotencyKey", min_length=1)
    optimistic_version: int = Field(alias="optimisticVersion", ge=1)

    model_config = {"populate_by_name": True}


class AssessmentSchemeArchiveRequest(AssessmentSchemeCommandRequest):
    reason: str = Field(min_length=1)

    model_config = {"populate_by_name": True}


class AssessmentSchemeItemRequest(BaseModel):
    indicator_id: str = Field(alias="indicatorId", min_length=1)
    version_id: str = Field(alias="versionId", min_length=1)
    weight: float = Field(gt=0)
    score_cap: float | None = Field(default=None, alias="scoreCap", gt=0)

    model_config = {"populate_by_name": True}


class AssessmentGradeThresholdRequest(BaseModel):
    grade_code: str = Field(alias="gradeCode", min_length=1)
    grade_label: str = Field(alias="gradeLabel", min_length=1)
    min_score: float = Field(alias="minScore", ge=0)
    max_score: float | None = Field(default=None, alias="maxScore", gt=0)

    model_config = {"populate_by_name": True}


class AssessmentVolumeAdjustmentFactorRequest(BaseModel):
    factor_code: str | None = Field(default=None, alias="factorCode", min_length=1)
    factor_name: str | None = Field(default=None, alias="factorName", min_length=1)
    metric: str | None = Field(default=None, min_length=1)
    operator: str | None = Field(default=None, min_length=1)
    value: float | None = None
    description: str = ""
    multiplier: float = Field(default=1, gt=0)
    enabled: bool = True

    model_config = {"populate_by_name": True}


class AssessmentTargetGroupMemberRequest(BaseModel):
    org_id: str = Field(alias="orgId", min_length=1)

    model_config = {"populate_by_name": True}


class AssessmentTargetGroupRequest(BaseModel):
    group_name: str = Field(alias="groupName", min_length=1)
    scope_mode: str = Field(alias="scopeMode", min_length=1)
    description: str = ""
    members: list[AssessmentTargetGroupMemberRequest] = Field(default_factory=list)

    model_config = {"populate_by_name": True}


class AssessmentWorkflowRouteOverrideNodeOrderRequest(BaseModel):
    chain_id: str = Field(alias="chainId", min_length=1)
    node_ids: list[str] = Field(default_factory=list, alias="nodeIds")

    model_config = {"populate_by_name": True}


class AssessmentWorkflowRouteOverrideFinalNodeRequest(BaseModel):
    chain_id: str | None = Field(default=None, alias="chainId")
    node_id: str = Field(alias="nodeId", min_length=1)
    note: str | None = None

    model_config = {"populate_by_name": True}


class AssessmentWorkflowRouteOverrideRequest(BaseModel):
    enabled: bool = True
    disabled_node_ids: list[str] = Field(default_factory=list, alias="disabledNodeIds")
    chain_node_orders: list[AssessmentWorkflowRouteOverrideNodeOrderRequest] = Field(
        default_factory=list,
        alias="chainNodeOrders",
    )
    final_nodes: list[AssessmentWorkflowRouteOverrideFinalNodeRequest] = Field(
        default_factory=list,
        alias="finalNodes",
    )
    note: str | None = None

    model_config = {"populate_by_name": True}


class AssessmentWorkflowBindingRequest(BaseModel):
    route_template_id: str = Field(alias="routeTemplateId", min_length=1)
    route_template_version_id: str | None = Field(default=None, alias="routeTemplateVersionId")
    route_override: AssessmentWorkflowRouteOverrideRequest | None = Field(
        default=None,
        alias="routeOverride",
    )
    note: str | None = None

    model_config = {"populate_by_name": True}


class AssessmentSchemePeriodicRuleRequest(BaseModel):
    frequency: str = Field(min_length=1)
    working_day_offset: int = Field(alias="workingDayOffset", ge=1, le=23)
    fire_time: str = Field(alias="fireTime", min_length=4)
    timezone: str = "Asia/Shanghai"
    calendar_code: str = Field(default="WEEKDAY_ONLY", alias="calendarCode")
    valid_from: str | None = Field(default=None, alias="validFrom")
    valid_until: str | None = Field(default=None, alias="validUntil")

    model_config = {"populate_by_name": True}


class AssessmentSchemeScheduleBindingRequest(BaseModel):
    dispatch_mode: str | None = Field(default=None, alias="dispatchMode")
    periodic_rule: AssessmentSchemePeriodicRuleRequest | None = Field(
        default=None,
        alias="periodicRule",
    )
    manual_dispatch_policy: dict[str, Any] | None = Field(
        default=None,
        alias="manualDispatchPolicy",
    )
    last_run_at: str | None = Field(default=None, alias="lastRunAt")

    model_config = {"populate_by_name": True}


class AssessmentSchemeDraftBaseRequest(BaseModel):
    scheme_code: str | None = Field(default=None, alias="schemeCode")
    scheme_name: str = Field(alias="schemeName", min_length=1)
    year: int = Field(ge=2000, le=2100)
    frequency: str = Field(min_length=1)
    description: str = ""
    total_weight: float = Field(default=100, alias="totalWeight", gt=0)
    items: list[AssessmentSchemeItemRequest] = Field(default_factory=list)
    grade_thresholds: list[AssessmentGradeThresholdRequest] = Field(
        default_factory=list,
        alias="gradeThresholds",
    )
    volume_adjustment_factors: list[AssessmentVolumeAdjustmentFactorRequest] = Field(
        default_factory=list,
        alias="volumeAdjustmentFactors",
    )
    target_groups: list[AssessmentTargetGroupRequest] = Field(
        default_factory=list,
        alias="targetGroups",
    )
    workflow_binding: AssessmentWorkflowBindingRequest | None = Field(
        default=None,
        alias="workflowBinding",
    )
    schedule_binding: AssessmentSchemeScheduleBindingRequest | None = Field(
        default=None,
        alias="scheduleBinding",
    )

    model_config = {"populate_by_name": True}


class AssessmentSchemeDraftCreatePreflightRequest(AssessmentSchemeDraftBaseRequest):
    model_config = {"populate_by_name": True}


class AssessmentSchemeDraftCreateRequest(AssessmentSchemeDraftBaseRequest):
    request_id: str | None = Field(default=None, alias="requestId")
    idempotency_key: str = Field(alias="idempotencyKey", min_length=1)

    model_config = {"populate_by_name": True}


class AssessmentSchemeDraftPatchFields(BaseModel):
    scheme_name: str | None = Field(default=None, alias="schemeName", min_length=1)
    year: int | None = Field(default=None, ge=2000, le=2100)
    frequency: str | None = None
    description: str | None = None
    total_weight: float | None = Field(default=None, alias="totalWeight", gt=0)
    items: list[AssessmentSchemeItemRequest] | None = None
    grade_thresholds: list[AssessmentGradeThresholdRequest] | None = Field(
        default=None,
        alias="gradeThresholds",
    )
    volume_adjustment_factors: list[AssessmentVolumeAdjustmentFactorRequest] | None = Field(
        default=None,
        alias="volumeAdjustmentFactors",
    )
    target_groups: list[AssessmentTargetGroupRequest] | None = Field(
        default=None,
        alias="targetGroups",
    )
    workflow_binding: AssessmentWorkflowBindingRequest | None = Field(
        default=None,
        alias="workflowBinding",
    )
    schedule_binding: AssessmentSchemeScheduleBindingRequest | None = Field(
        default=None,
        alias="scheduleBinding",
    )

    model_config = {"populate_by_name": True}


class AssessmentSchemeDraftValidateRequest(AssessmentSchemeDraftPatchFields):
    optimistic_version: int = Field(alias="optimisticVersion", ge=1)

    model_config = {"populate_by_name": True}


class AssessmentSchemeDraftUpdateRequest(AssessmentSchemeDraftPatchFields):
    request_id: str | None = Field(default=None, alias="requestId")
    idempotency_key: str = Field(alias="idempotencyKey", min_length=1)
    optimistic_version: int = Field(alias="optimisticVersion", ge=1)

    model_config = {"populate_by_name": True}


class AssessmentSchemeCopyRequest(AssessmentSchemeCommandRequest):
    scheme_code: str | None = Field(default=None, alias="schemeCode")
    scheme_name: str | None = Field(default=None, alias="schemeName", min_length=1)

    model_config = {"populate_by_name": True}


class AssessmentCycleCreateRequest(BaseModel):
    cycle_code: str | None = Field(default=None, alias="cycleCode")
    cycle_name: str = Field(alias="cycleName", min_length=1)
    scheme_id: str = Field(alias="schemeId", min_length=1)
    year: int = Field(ge=2000, le=2100)
    period_start: str = Field(alias="periodStart", min_length=1)
    period_end: str = Field(alias="periodEnd", min_length=1)
    target_org_ids: list[str] = Field(default_factory=list, alias="targetOrgIds")
    dispatch_mode: str = Field(default="MANUAL", alias="dispatchMode")

    model_config = {"populate_by_name": True}


class AssessmentCycleDispatchRequest(BaseModel):
    target_org_ids: list[str] | None = Field(default=None, alias="targetOrgIds")
    due_date: str | None = Field(default=None, alias="dueDate")
    message: str = ""

    model_config = {"populate_by_name": True}


class AssessmentCycleReminderRequest(BaseModel):
    target_org_ids: list[str] | None = Field(default=None, alias="targetOrgIds")
    message: str = Field(min_length=1)

    model_config = {"populate_by_name": True}


class AssessmentScheduleDraftSaveRequest(BaseModel):
    frequency: str = Field(min_length=1)
    working_day_offset: int = Field(alias="workingDayOffset", ge=1, le=23)
    fire_time: str = Field(alias="fireTime", min_length=4)
    timezone: str = "Asia/Shanghai"
    calendar_code: str = Field(default="WEEKDAY_ONLY", alias="calendarCode")
    valid_from: str | None = Field(default=None, alias="validFrom")
    valid_until: str | None = Field(default=None, alias="validUntil")

    model_config = {"populate_by_name": True}


class ScheduleExecutionRetryRequest(BaseModel):
    reason: str = Field(default="Retry failed schedule execution")
    request_id: str | None = Field(default=None, alias="requestId")
    idempotency_key: str | None = Field(default=None, alias="idempotencyKey")

    model_config = {"populate_by_name": True}


class AssessmentScheduleDispatchNowRequest(BaseModel):
    idempotency_key: str | None = Field(default=None, alias="idempotencyKey")

    model_config = {"populate_by_name": True}


class AssessmentSimulationRunRequest(BaseModel):
    scheme_id: str = Field(alias="schemeId", min_length=1)
    scheme_version_id: str | None = Field(default=None, alias="schemeVersionId")
    reference_period: str = Field(alias="referencePeriod", min_length=1, max_length=40)
    target_org_ids: list[str] | None = Field(default=None, alias="targetOrgIds")
    imputation_policy: str = Field(default="exclude", alias="imputationPolicy")
    scheme_draft_snapshot: dict[str, Any] | None = Field(
        default=None,
        alias="schemeDraftSnapshot",
    )
    request_id: str | None = Field(default=None, alias="requestId")

    model_config = {"populate_by_name": True}


class RetryDataSyncRequest(BaseModel):
    reason: str = Field(min_length=1)
    request_id: str | None = Field(default=None, alias="requestId")

    model_config = {"populate_by_name": True}


class IgnoreDataSyncAlertRequest(BaseModel):
    reason: str = Field(min_length=1)
    request_id: str | None = Field(default=None, alias="requestId")

    model_config = {"populate_by_name": True}


class OverwriteRerunRequest(BaseModel):
    reason: str = Field(min_length=1)
    risk_acknowledgement: bool = Field(alias="riskAcknowledgement")
    approval_marker: str | None = Field(default=None, alias="approvalMarker")
    request_id: str | None = Field(default=None, alias="requestId")

    model_config = {"populate_by_name": True}


class DataSyncEvidenceExportRequest(BaseModel):
    source_ids: list[str] = Field(default_factory=list, alias="sourceIds")
    status: list[str] = Field(default_factory=list)
    time_range: str = Field(default="7days", alias="timeRange")
    format: str = "JSON"
    redaction_policy: str = Field(default="STRICT", alias="redactionPolicy")
    request_id: str | None = Field(default=None, alias="requestId")

    model_config = {"populate_by_name": True}


class AssessmentResponseItemUpdateRequest(BaseModel):
    response_item_id: str | None = Field(default=None, alias="responseItemId")
    indicator_id: str | None = Field(default=None, alias="indicatorId")
    value: Any | None = None
    comment: str | None = None
    file_ids: list[str] | None = Field(default=None, alias="fileIds")

    model_config = {"populate_by_name": True}


class AssessmentReportingSaveRequest(BaseModel):
    items: list[AssessmentResponseItemUpdateRequest] = Field(default_factory=list)

    model_config = {"populate_by_name": True}


class AssessmentLedgerImportRequest(BaseModel):
    ledger_entry_id: str = Field(alias="ledgerEntryId", min_length=1)
    response_item_ids: list[str] = Field(default_factory=list, alias="responseItemIds")
    indicator_ids: list[str] = Field(default_factory=list, alias="indicatorIds")
    include_attachments: bool = Field(default=True, alias="includeAttachments")
    comment: str | None = None

    model_config = {"populate_by_name": True}


class DailyLedgerCreateRequest(BaseModel):
    title: str = Field(min_length=1)
    occurred_date: str = Field(alias="occurredDate", min_length=1)
    category: str = "GENERAL"
    description: str = ""
    status: str = "AVAILABLE"
    file_ids: list[str] = Field(default_factory=list, alias="fileIds")

    model_config = {"populate_by_name": True}


class DailyLedgerUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1)
    occurred_date: str | None = Field(default=None, alias="occurredDate", min_length=1)
    category: str | None = None
    description: str | None = None
    status: str | None = None
    file_ids: list[str] | None = Field(default=None, alias="fileIds")

    model_config = {"populate_by_name": True}


class AssessmentReviewItemPatchRequest(BaseModel):
    review_item_id: str | None = Field(default=None, alias="reviewItemId")
    response_item_id: str | None = Field(default=None, alias="responseItemId")
    comment: str | None = None
    preliminary_score: float | None = Field(default=None, alias="preliminaryScore", ge=0)
    status: str | None = None
    reviewed: bool | None = None

    model_config = {"populate_by_name": True}


class AssessmentScoreAdjustmentRequest(BaseModel):
    review_item_id: str | None = Field(default=None, alias="reviewItemId")
    response_item_id: str | None = Field(default=None, alias="responseItemId")
    adjustment_type: str = Field(default="MANUAL", alias="adjustmentType")
    score_delta: float = Field(alias="scoreDelta")
    reason: str = Field(min_length=1)

    model_config = {"populate_by_name": True}


class AssessmentAIInsightSnapshotRequest(BaseModel):
    provider: str = "manual"
    model: str = "none"
    summary: str = ""
    payload: dict[str, Any] = Field(default_factory=dict)

    model_config = {"populate_by_name": True}


class AssessmentReviewSaveRequest(BaseModel):
    items: list[AssessmentReviewItemPatchRequest] = Field(default_factory=list)
    score_adjustments: list[AssessmentScoreAdjustmentRequest] = Field(
        default_factory=list,
        alias="scoreAdjustments",
    )
    ai_insight_snapshot: AssessmentAIInsightSnapshotRequest | None = Field(
        default=None,
        alias="aiInsightSnapshot",
    )

    model_config = {"populate_by_name": True}


class AssessmentReviewDecisionRequest(BaseModel):
    decision: str = Field(min_length=1)
    decision_reason: str | None = Field(default=None, alias="decisionReason")

    model_config = {"populate_by_name": True}


class AssessmentResultConfirmRequest(BaseModel):
    comment: str = ""

    model_config = {"populate_by_name": True}


class ScoreAppealItemRequest(BaseModel):
    result_item_id: str = Field(alias="resultItemId", min_length=1)
    requested_score: float | None = Field(default=None, alias="requestedScore", ge=0)
    reason: str = Field(min_length=1)

    model_config = {"populate_by_name": True}


class ScoreAppealSubmitRequest(BaseModel):
    reason: str = Field(min_length=1)
    items: list[ScoreAppealItemRequest] = Field(min_length=1)
    file_ids: list[str] = Field(default_factory=list, alias="fileIds")

    model_config = {"populate_by_name": True}


class ScoreAppealItemDecisionRequest(BaseModel):
    score_appeal_item_id: str = Field(alias="scoreAppealItemId", min_length=1)
    adopted_score: float | None = Field(default=None, alias="adoptedScore", ge=0)

    model_config = {"populate_by_name": True}


class ScoreAppealDecisionRequest(BaseModel):
    decision: str = Field(min_length=1)
    decision_reason: str = Field(alias="decisionReason", min_length=1)
    items: list[ScoreAppealItemDecisionRequest] = Field(default_factory=list)

    model_config = {"populate_by_name": True}


def dump_model(payload: BaseModel) -> dict[str, Any]:
    return payload.model_dump(by_alias=True, exclude_none=True)
