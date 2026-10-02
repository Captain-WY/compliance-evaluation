from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.modules.compliance.core.db import Base
from app.modules.compliance.models.auth import AuditMixin


class AssessmentIndicatorCategoryModel(AuditMixin, Base):
    __tablename__ = "assessment_indicator_categories"

    category_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    category_code: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    category_name: Mapped[str] = mapped_column(String(200), nullable=False)
    parent_category_id: Mapped[str | None] = mapped_column(
        String(120),
        ForeignKey("assessment_indicator_categories.category_id"),
        nullable=True,
    )
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class AssessmentFoundationFixtureModel(AuditMixin, Base):
    __tablename__ = "assessment_foundation_fixtures"

    fixture_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    fixture_kind: Mapped[str] = mapped_column(String(80), nullable=False)
    org_id: Mapped[str] = mapped_column(String(80), nullable=False)
    user_id: Mapped[str] = mapped_column(
        String(80), nullable=False,
    )
    unified_task_id: Mapped[str | None] = mapped_column(
        String(80),
        ForeignKey("unified_tasks.task_id"),
        nullable=True,
    )
    file_id: Mapped[str | None] = mapped_column(
        String(120), nullable=True,
    )
    contract_ref: Mapped[str] = mapped_column(String(120), nullable=False)
    fixture_metadata: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    fixture_created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class AssessmentIndicatorModel(AuditMixin, Base):
    __tablename__ = "assessment_indicators"

    indicator_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    indicator_code: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    indicator_name: Mapped[str] = mapped_column(String(240), nullable=False)
    category_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("assessment_indicator_categories.category_id"),
        nullable=False,
    )
    business_line: Mapped[str] = mapped_column(String(80), nullable=False)
    data_type: Mapped[str] = mapped_column(String(40), nullable=False)
    value_type: Mapped[str] = mapped_column(String(40), nullable=False)
    input_mode: Mapped[str] = mapped_column(String(40), nullable=False)
    data_source_mode: Mapped[str] = mapped_column(String(40), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    active_version_id: Mapped[str | None] = mapped_column(String(120), nullable=True)


class IndicatorVersionModel(AuditMixin, Base):
    __tablename__ = "indicator_versions"

    version_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    indicator_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("assessment_indicators.indicator_id"),
        nullable=False,
    )
    version_no: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    weight_default: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False, default=0)
    max_score: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False, default=100)
    scoring_validation_status: Mapped[str] = mapped_column(
        String(40),
        nullable=False,
        default="NOT_VALIDATED",
    )
    validation_errors: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
    )
    published_by_ref: Mapped[str | None] = mapped_column(String(80), nullable=True)
    published_at_ref: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    archived_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    core_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)


class IndicatorVariableModel(AuditMixin, Base):
    __tablename__ = "indicator_variables"

    variable_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    version_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("indicator_versions.version_id"),
        nullable=False,
    )
    variable_code: Mapped[str] = mapped_column(String(80), nullable=False)
    variable_name: Mapped[str] = mapped_column(String(200), nullable=False)
    value_type: Mapped[str] = mapped_column(String(40), nullable=False)
    required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class ScoringRuleModel(AuditMixin, Base):
    __tablename__ = "scoring_rules"

    scoring_rule_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    version_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("indicator_versions.version_id"),
        nullable=False,
    )
    rule_type: Mapped[str] = mapped_column(String(40), nullable=False)
    effect: Mapped[str] = mapped_column(String(40), nullable=False)
    expression: Mapped[str | None] = mapped_column(Text, nullable=True)
    require_continuous_bands: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    validation_status: Mapped[str] = mapped_column(
        String(40),
        nullable=False,
        default="NOT_VALIDATED",
    )
    validation_errors: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
    )


class ScoringRuleBandModel(AuditMixin, Base):
    __tablename__ = "scoring_rule_bands"

    band_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    scoring_rule_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("scoring_rules.scoring_rule_id"),
        nullable=False,
    )
    min_value: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)
    max_value: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)
    score: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class QualitativeRubricItemModel(AuditMixin, Base):
    __tablename__ = "qualitative_rubric_items"

    rubric_item_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    scoring_rule_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("scoring_rules.scoring_rule_id"),
        nullable=False,
    )
    item_code: Mapped[str] = mapped_column(String(80), nullable=False)
    item_label: Mapped[str] = mapped_column(String(200), nullable=False)
    score: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class AssessmentEvidenceTemplateModel(AuditMixin, Base):
    __tablename__ = "assessment_evidence_templates"

    evidence_template_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    version_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("indicator_versions.version_id"),
        nullable=False,
    )
    template_name: Mapped[str] = mapped_column(String(240), nullable=False)
    required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    accepted_file_tags: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")


class AssessmentSchemeModel(AuditMixin, Base):
    __tablename__ = "assessment_schemes"

    scheme_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    scheme_code: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    scheme_name: Mapped[str] = mapped_column(String(240), nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    frequency: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    total_weight: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False, default=100)
    created_by_ref: Mapped[str] = mapped_column(String(80), nullable=False)
    published_by_ref: Mapped[str | None] = mapped_column(String(80), nullable=True)
    published_at_ref: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    archived_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    has_been_published: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    scheme_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    optimistic_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    source_scheme_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    source_scheme_code: Mapped[str | None] = mapped_column(String(120), nullable=True)
    source_trace: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    workflow_binding: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    schedule_binding: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    command_audit: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)


class AssessmentSchemeCommandKeyModel(AuditMixin, Base):
    __tablename__ = "assessment_scheme_command_keys"
    __table_args__ = (
        UniqueConstraint(
            "scheme_scope_id",
            "command_type",
            "actor_user_id",
            "idempotency_key",
            name="uq_assessment_scheme_command_keys_scope_actor_key",
        ),
        Index(
            "ix_assessment_scheme_command_keys_scope",
            "scheme_scope_id",
            "command_type",
        ),
    )

    command_key_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    scheme_scope_id: Mapped[str] = mapped_column(String(120), nullable=False)
    command_type: Mapped[str] = mapped_column(String(60), nullable=False)
    actor_user_id: Mapped[str] = mapped_column(String(80), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(512), nullable=False)
    payload_hash: Mapped[str] = mapped_column(String(80), nullable=False)
    result_ref: Mapped[str] = mapped_column(String(120), nullable=False)
    result_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    command_created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class AssessmentSchemeItemModel(AuditMixin, Base):
    __tablename__ = "assessment_scheme_items"

    scheme_item_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    scheme_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("assessment_schemes.scheme_id"),
        nullable=False,
    )
    indicator_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("assessment_indicators.indicator_id"),
        nullable=False,
    )
    version_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("indicator_versions.version_id"),
        nullable=False,
    )
    weight: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False)
    score_cap: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    indicator_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)


class AssessmentGradeThresholdModel(AuditMixin, Base):
    __tablename__ = "assessment_grade_thresholds"

    threshold_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    scheme_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("assessment_schemes.scheme_id"),
        nullable=False,
    )
    grade_code: Mapped[str] = mapped_column(String(80), nullable=False)
    grade_label: Mapped[str] = mapped_column(String(120), nullable=False)
    min_score: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False)
    max_score: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class AssessmentVolumeAdjustmentFactorModel(AuditMixin, Base):
    __tablename__ = "assessment_volume_adjustment_factors"

    factor_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    scheme_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("assessment_schemes.scheme_id"),
        nullable=False,
    )
    factor_code: Mapped[str] = mapped_column(String(80), nullable=False)
    factor_name: Mapped[str] = mapped_column(String(160), nullable=False)
    metric: Mapped[str | None] = mapped_column(String(160), nullable=True)
    operator: Mapped[str | None] = mapped_column(String(20), nullable=True)
    value: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    multiplier: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False, default=1)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class AssessmentTargetGroupModel(AuditMixin, Base):
    __tablename__ = "assessment_target_groups"

    target_group_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    scheme_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("assessment_schemes.scheme_id"),
        nullable=False,
    )
    group_name: Mapped[str] = mapped_column(String(160), nullable=False)
    scope_mode: Mapped[str] = mapped_column(String(40), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class AssessmentTargetGroupMemberModel(AuditMixin, Base):
    __tablename__ = "assessment_target_group_members"

    member_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    target_group_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("assessment_target_groups.target_group_id"),
        nullable=False,
    )
    org_id: Mapped[str] = mapped_column(String(80), nullable=False)
    org_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class AssessmentCycleModel(AuditMixin, Base):
    __tablename__ = "assessment_cycles"

    cycle_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    cycle_code: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    cycle_name: Mapped[str] = mapped_column(String(240), nullable=False)
    scheme_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("assessment_schemes.scheme_id"),
        nullable=False,
    )
    scheme_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    dispatch_mode: Mapped[str] = mapped_column(String(40), nullable=False, default="MANUAL")
    selected_target_org_ids: Mapped[list[str]] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
    )
    created_by_ref: Mapped[str] = mapped_column(String(80), nullable=False)
    dispatched_by_ref: Mapped[str | None] = mapped_column(String(80), nullable=True)
    dispatched_at_ref: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    closed_at_ref: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    archived_reason: Mapped[str | None] = mapped_column(Text, nullable=True)


class AssessmentScheduleModel(AuditMixin, Base):
    __tablename__ = "assessment_schedules"

    schedule_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    scheme_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("assessment_schemes.scheme_id"),
        nullable=False,
    )
    template_id: Mapped[str] = mapped_column(String(120), nullable=False)
    template_version_id: Mapped[str | None] = mapped_column(String(140), nullable=True)
    snapshot_hash: Mapped[str | None] = mapped_column(String(80), nullable=True)
    dispatch_mode: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    draft_rule_id: Mapped[str] = mapped_column(String(140), nullable=False)
    active_rule_id: Mapped[str | None] = mapped_column(String(140), nullable=True)
    target_org_ids: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    target_scope_snapshot: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
    )
    predicted_next_fire_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    last_execution_id: Mapped[str | None] = mapped_column(String(140), nullable=True)
    created_by_ref: Mapped[str] = mapped_column(String(80), nullable=False)
    updated_by_ref: Mapped[str] = mapped_column(String(80), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    audit_events: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
    )


class AssessmentScheduleRuleModel(AuditMixin, Base):
    __tablename__ = "assessment_schedule_rules"

    rule_id: Mapped[str] = mapped_column(String(140), primary_key=True)
    schedule_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("assessment_schedules.schedule_id"),
        nullable=False,
    )
    rule_status: Mapped[str] = mapped_column(String(40), nullable=False)
    frequency: Mapped[str] = mapped_column(String(40), nullable=False)
    working_day_offset: Mapped[int] = mapped_column(Integer, nullable=False)
    fire_time: Mapped[str] = mapped_column(String(20), nullable=False)
    timezone: Mapped[str] = mapped_column(String(80), nullable=False)
    calendar_code: Mapped[str] = mapped_column(String(80), nullable=False)
    valid_from: Mapped[str | None] = mapped_column(String(40), nullable=True)
    valid_until: Mapped[str | None] = mapped_column(String(40), nullable=True)
    rule_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)


class AssessmentScheduleExecutionModel(AuditMixin, Base):
    __tablename__ = "assessment_schedule_executions"

    execution_id: Mapped[str] = mapped_column(String(140), primary_key=True)
    schedule_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("assessment_schedules.schedule_id"),
        nullable=False,
    )
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    cycle_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    retry_of_execution_id: Mapped[str | None] = mapped_column(String(140), nullable=True)
    target_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_cycle_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    dispatch_event_ids: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    generated_task_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_code: Mapped[str | None] = mapped_column(String(120), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    guard_result: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    duplicate_prevention_key: Mapped[str] = mapped_column(String(512), nullable=False)
    rule_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    scheme_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    target_scope_snapshot: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
    )
    workflow_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)


class AssessmentScheduleRetryEventModel(AuditMixin, Base):
    __tablename__ = "assessment_schedule_retry_events"

    retry_event_id: Mapped[str] = mapped_column(String(140), primary_key=True)
    original_execution_id: Mapped[str] = mapped_column(
        String(140),
        ForeignKey("assessment_schedule_executions.execution_id"),
        nullable=False,
    )
    retry_execution_id: Mapped[str | None] = mapped_column(String(140), nullable=True)
    requested_by: Mapped[str] = mapped_column(String(80), nullable=False)
    actor_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    request_id: Mapped[str | None] = mapped_column(String(160), nullable=True)
    idempotency_key: Mapped[str] = mapped_column(String(512), nullable=False)
    event_created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    duplicate: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    failure_details: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)


class AssessmentSimulationRunModel(AuditMixin, Base):
    __tablename__ = "assessment_simulation_runs"

    simulation_id: Mapped[str] = mapped_column(String(140), primary_key=True)
    scheme_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("assessment_schemes.scheme_id"),
        nullable=False,
    )
    scheme_version_id: Mapped[str | None] = mapped_column(String(140), nullable=True)
    reference_period: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    requested_by: Mapped[str] = mapped_column(String(80), nullable=False)
    request_id: Mapped[str | None] = mapped_column(String(160), nullable=True)
    actor_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    org_context_snapshot: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
    )
    input_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    input_snapshot_hash: Mapped[str] = mapped_column(String(80), nullable=False)
    imputation_policy: Mapped[str] = mapped_column(String(40), nullable=False)
    preflight_findings: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
    )
    result_summary: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    org_results: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
    )
    imputation_notes: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
    )
    simulation_created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    audit_events: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
    )
    error: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)


class ExternalDataSourceModel(AuditMixin, Base):
    __tablename__ = "external_data_sources"

    source_id: Mapped[str] = mapped_column(String(140), primary_key=True)
    source_code: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    source_name: Mapped[str] = mapped_column(String(240), nullable=False)
    owner_dept_snapshot: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
    )
    connector_type: Mapped[str] = mapped_column(String(80), nullable=False)
    health_status: Mapped[str] = mapped_column(String(40), nullable=False)
    last_heartbeat_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    sandbox_only: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class ExternalDataConnectorBindingModel(AuditMixin, Base):
    __tablename__ = "external_data_connector_bindings"

    binding_id: Mapped[str] = mapped_column(String(140), primary_key=True)
    source_id: Mapped[str] = mapped_column(
        String(140),
        ForeignKey("external_data_sources.source_id"),
        nullable=False,
    )
    binding_type: Mapped[str] = mapped_column(String(80), nullable=False)
    endpoint_alias: Mapped[str] = mapped_column(String(240), nullable=False)
    config_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    binding_created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    sandbox_only: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class DataSyncJobModel(AuditMixin, Base):
    __tablename__ = "data_sync_jobs"

    job_id: Mapped[str] = mapped_column(String(140), primary_key=True)
    source_id: Mapped[str] = mapped_column(
        String(140),
        ForeignKey("external_data_sources.source_id"),
        nullable=False,
    )
    source_code: Mapped[str] = mapped_column(String(120), nullable=False)
    indicator_id: Mapped[str | None] = mapped_column(
        String(120),
        ForeignKey("assessment_indicators.indicator_id"),
        nullable=True,
    )
    indicator_name: Mapped[str] = mapped_column(String(240), nullable=False)
    cycle_id: Mapped[str | None] = mapped_column(
        String(120),
        ForeignKey("assessment_cycles.cycle_id"),
        nullable=True,
    )
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    records: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_code: Mapped[str | None] = mapped_column(String(120), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    has_snapshot: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sandbox_only: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class DataSyncLogModel(AuditMixin, Base):
    __tablename__ = "data_sync_logs"
    __table_args__ = (
        UniqueConstraint(
            "actor_user_id",
            "command_type",
            "request_id",
            name="uq_data_sync_logs_actor_command_request",
        ),
    )

    log_id: Mapped[str] = mapped_column(String(140), primary_key=True)
    job_id: Mapped[str | None] = mapped_column(
        String(140),
        ForeignKey("data_sync_jobs.job_id"),
        nullable=True,
    )
    source_id: Mapped[str | None] = mapped_column(
        String(140),
        ForeignKey("external_data_sources.source_id"),
        nullable=True,
    )
    event_type: Mapped[str] = mapped_column(String(120), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    actor_user_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    event_created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    command_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    request_id: Mapped[str | None] = mapped_column(String(160), nullable=True)
    payload_hash: Mapped[str | None] = mapped_column(String(80), nullable=True)
    log_metadata: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)


class DataSyncSnapshotModel(AuditMixin, Base):
    __tablename__ = "data_sync_snapshots"

    snapshot_id: Mapped[str] = mapped_column(String(140), primary_key=True)
    job_id: Mapped[str] = mapped_column(
        String(140),
        ForeignKey("data_sync_jobs.job_id"),
        nullable=False,
    )
    payload_hash: Mapped[str] = mapped_column(String(80), nullable=False)
    record_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    redaction_policy: Mapped[str] = mapped_column(String(80), nullable=False)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    sample_rows: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
    )
    omitted_fields: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    file_id: Mapped[str | None] = mapped_column(
        String(120), nullable=True,
    )
    sandbox_only: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class DataSyncAlertModel(AuditMixin, Base):
    __tablename__ = "data_sync_alerts"

    alert_id: Mapped[str] = mapped_column(String(140), primary_key=True)
    job_id: Mapped[str] = mapped_column(
        String(140),
        ForeignKey("data_sync_jobs.job_id"),
        nullable=False,
    )
    source_id: Mapped[str] = mapped_column(
        String(140),
        ForeignKey("external_data_sources.source_id"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    severity: Mapped[str] = mapped_column(String(40), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    alert_created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ignored_by: Mapped[str | None] = mapped_column(String(80), nullable=True)
    ignored_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    audit_events: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
    )


class DataSyncRerunRequestModel(AuditMixin, Base):
    __tablename__ = "data_sync_rerun_requests"
    __table_args__ = (
        UniqueConstraint(
            "requested_by",
            "request_id",
            name="uq_data_sync_rerun_requests_actor_request",
        ),
        Index(
            "uq_data_sync_rerun_requests_active_window",
            "source_window_key",
            unique=True,
            postgresql_where=text("status IN ('PENDING','RUNNING')"),
            sqlite_where=text("status IN ('PENDING','RUNNING')"),
        ),
    )

    rerun_request_id: Mapped[str] = mapped_column(String(140), primary_key=True)
    job_id: Mapped[str] = mapped_column(
        String(140),
        ForeignKey("data_sync_jobs.job_id"),
        nullable=False,
    )
    source_id: Mapped[str] = mapped_column(
        String(140),
        ForeignKey("external_data_sources.source_id"),
        nullable=False,
    )
    indicator_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    cycle_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    source_window_key: Mapped[str] = mapped_column(String(512), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    requested_by: Mapped[str] = mapped_column(String(80), nullable=False)
    actor_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    request_id: Mapped[str | None] = mapped_column(String(160), nullable=True)
    payload_hash: Mapped[str] = mapped_column(String(80), nullable=False)
    approval_marker: Mapped[str | None] = mapped_column(String(240), nullable=True)
    risk_acknowledgement: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    audit_event_id: Mapped[str] = mapped_column(String(140), nullable=False)
    request_created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    sandbox_only: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class ExportArtifactModel(AuditMixin, Base):
    __tablename__ = "export_artifacts"
    __table_args__ = (
        UniqueConstraint(
            "requested_by",
            "request_id",
            name="uq_export_artifacts_actor_request",
        ),
    )

    export_id: Mapped[str] = mapped_column(String(140), primary_key=True)
    export_type: Mapped[str] = mapped_column(String(120), nullable=False)
    format: Mapped[str] = mapped_column(String(40), nullable=False)
    filter_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    requested_by: Mapped[str] = mapped_column(String(80), nullable=False)
    request_id: Mapped[str | None] = mapped_column(String(160), nullable=True)
    redaction_policy: Mapped[str] = mapped_column(String(80), nullable=False)
    evidence_label: Mapped[str] = mapped_column(String(160), nullable=False)
    export_created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    file_id: Mapped[str | None] = mapped_column(
        String(120), nullable=True,
    )
    download_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    checksum: Mapped[str | None] = mapped_column(String(160), nullable=True)
    sandbox_only: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    formal_artifact: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    signed_artifact: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class ExportAuditEventModel(AuditMixin, Base):
    __tablename__ = "export_audit_events"

    export_audit_event_id: Mapped[str] = mapped_column(String(140), primary_key=True)
    export_id: Mapped[str] = mapped_column(
        String(140),
        ForeignKey("export_artifacts.export_id"),
        nullable=False,
    )
    requested_by: Mapped[str] = mapped_column(String(80), nullable=False)
    actor_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    filter_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    redaction_policy: Mapped[str] = mapped_column(String(80), nullable=False)
    access_metadata: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    event_created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class AssessmentCycleTargetModel(AuditMixin, Base):
    __tablename__ = "assessment_cycle_targets"

    cycle_target_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    cycle_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("assessment_cycles.cycle_id"),
        nullable=False,
    )
    org_id: Mapped[str] = mapped_column(String(80), nullable=False)
    org_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    target_status: Mapped[str] = mapped_column(String(40), nullable=False)
    reporting_task_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    review_task_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    review_status: Mapped[str | None] = mapped_column(String(40), nullable=True)
    result_id: Mapped[str | None] = mapped_column(String(120), nullable=True)


class AssessmentDispatchEventModel(AuditMixin, Base):
    __tablename__ = "assessment_dispatch_events"

    dispatch_event_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    cycle_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("assessment_cycles.cycle_id"),
        nullable=False,
    )
    event_type: Mapped[str] = mapped_column(String(80), nullable=False)
    target_org_ids: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    message: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_by_ref: Mapped[str] = mapped_column(String(80), nullable=False)
    event_created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class AssessmentReportingTaskModel(AuditMixin, Base):
    __tablename__ = "assessment_reporting_tasks"

    reporting_task_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    cycle_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("assessment_cycles.cycle_id"),
        nullable=False,
    )
    cycle_target_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("assessment_cycle_targets.cycle_target_id"),
        nullable=False,
    )
    target_org_id: Mapped[str] = mapped_column(
        String(80), nullable=False,
    )
    unified_task_id: Mapped[str] = mapped_column(
        String(80),
        ForeignKey("unified_tasks.task_id"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    due_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class AssessmentResponseItemModel(AuditMixin, Base):
    __tablename__ = "assessment_response_items"

    response_item_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    reporting_task_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("assessment_reporting_tasks.reporting_task_id"),
        nullable=False,
    )
    indicator_id: Mapped[str] = mapped_column(String(120), nullable=False)
    version_id: Mapped[str] = mapped_column(String(120), nullable=False)
    response_value: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    comment: Mapped[str] = mapped_column(Text, nullable=False, default="")
    validation_status: Mapped[str] = mapped_column(String(40), nullable=False)
    source_ledger_entry_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    required_evidence: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class AssessmentResponseEvidenceModel(AuditMixin, Base):
    __tablename__ = "assessment_response_evidence"

    response_evidence_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    response_item_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("assessment_response_items.response_item_id"),
        nullable=False,
    )
    reporting_task_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("assessment_reporting_tasks.reporting_task_id"),
        nullable=False,
    )
    file_id: Mapped[str] = mapped_column(
        String(120), nullable=False,
    )
    bound_by_ref: Mapped[str] = mapped_column(String(80), nullable=False)
    bound_at_ref: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class DailyComplianceLedgerEntryModel(AuditMixin, Base):
    __tablename__ = "daily_compliance_ledger_entries"

    ledger_entry_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    org_id: Mapped[str] = mapped_column(String(80), nullable=False)
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    occurred_date: Mapped[date] = mapped_column(Date, nullable=False)
    category: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    created_by_ref: Mapped[str] = mapped_column(String(80), nullable=False)
    updated_by_ref: Mapped[str | None] = mapped_column(String(80), nullable=True)
    deleted_by_ref: Mapped[str | None] = mapped_column(String(80), nullable=True)
    deleted_at_ref: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    audit_events: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)


class DailyComplianceLedgerAttachmentModel(AuditMixin, Base):
    __tablename__ = "daily_compliance_ledger_attachments"

    ledger_attachment_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    ledger_entry_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("daily_compliance_ledger_entries.ledger_entry_id"),
        nullable=False,
    )
    file_id: Mapped[str] = mapped_column(
        String(120), nullable=False,
    )
    bound_by_ref: Mapped[str] = mapped_column(String(80), nullable=False)
    bound_at_ref: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class AssessmentReviewTaskModel(AuditMixin, Base):
    __tablename__ = "assessment_review_tasks"

    review_task_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    cycle_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("assessment_cycles.cycle_id"),
        nullable=False,
    )
    cycle_target_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("assessment_cycle_targets.cycle_target_id"),
        nullable=False,
    )
    reporting_task_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("assessment_reporting_tasks.reporting_task_id"),
        nullable=False,
    )
    assignee_user_id: Mapped[str | None] = mapped_column(
        String(80), nullable=True,
    )
    unified_task_id: Mapped[str] = mapped_column(
        String(80),
        ForeignKey("unified_tasks.task_id"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    started_at_ref: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    completed_at_ref: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )


class AssessmentReviewItemModel(AuditMixin, Base):
    __tablename__ = "assessment_review_items"

    review_item_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    review_task_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("assessment_review_tasks.review_task_id"),
        nullable=False,
    )
    response_item_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("assessment_response_items.response_item_id"),
        nullable=False,
    )
    indicator_id: Mapped[str] = mapped_column(String(120), nullable=False)
    version_id: Mapped[str] = mapped_column(String(120), nullable=False)
    preliminary_score: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)
    final_score: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)
    comment: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[str] = mapped_column(String(40), nullable=False)


class AssessmentScoreAdjustmentModel(AuditMixin, Base):
    __tablename__ = "assessment_score_adjustments"

    adjustment_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    review_task_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("assessment_review_tasks.review_task_id"),
        nullable=False,
    )
    review_item_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("assessment_review_items.review_item_id"),
        nullable=False,
    )
    adjustment_type: Mapped[str] = mapped_column(String(80), nullable=False)
    score_delta: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    created_by_ref: Mapped[str] = mapped_column(String(80), nullable=False)
    created_at_ref: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class AssessmentReviewDecisionModel(AuditMixin, Base):
    __tablename__ = "assessment_review_decisions"

    decision_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    review_task_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("assessment_review_tasks.review_task_id"),
        nullable=False,
    )
    decision: Mapped[str] = mapped_column(String(40), nullable=False)
    decision_reason: Mapped[str] = mapped_column(Text, nullable=False, default="")
    decided_by_ref: Mapped[str] = mapped_column(String(80), nullable=False)
    decided_at_ref: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class AssessmentAIInsightSnapshotModel(AuditMixin, Base):
    __tablename__ = "assessment_ai_insight_snapshots"

    insight_snapshot_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    review_task_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("assessment_review_tasks.review_task_id"),
        nullable=False,
    )
    provider: Mapped[str] = mapped_column(String(80), nullable=False, default="manual")
    model: Mapped[str] = mapped_column(String(120), nullable=False, default="none")
    summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    created_by_ref: Mapped[str] = mapped_column(String(80), nullable=False)
    created_at_ref: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class AssessmentResultModel(AuditMixin, Base):
    __tablename__ = "assessment_results"

    result_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    cycle_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("assessment_cycles.cycle_id"),
        nullable=False,
    )
    cycle_target_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("assessment_cycle_targets.cycle_target_id"),
        nullable=False,
    )
    target_org_id: Mapped[str] = mapped_column(
        String(80), nullable=False,
    )
    review_task_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("assessment_review_tasks.review_task_id"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    confirmation_status: Mapped[str] = mapped_column(String(40), nullable=False)
    total_score: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False, default=0)
    grade_code: Mapped[str | None] = mapped_column(String(80), nullable=True)
    confirmation_deadline: Mapped[date] = mapped_column(Date, nullable=False)
    generated_by_ref: Mapped[str] = mapped_column(String(80), nullable=False)
    generated_at_ref: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    published_by_ref: Mapped[str | None] = mapped_column(String(80), nullable=True)
    published_at_ref: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    finalized_by_ref: Mapped[str | None] = mapped_column(String(80), nullable=True)
    finalized_at_ref: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )


class AssessmentResultItemModel(AuditMixin, Base):
    __tablename__ = "assessment_result_items"

    result_item_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    result_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("assessment_results.result_id"),
        nullable=False,
    )
    review_item_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("assessment_review_items.review_item_id"),
        nullable=False,
    )
    indicator_id: Mapped[str] = mapped_column(String(120), nullable=False)
    version_id: Mapped[str] = mapped_column(String(120), nullable=False)
    original_score: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False)
    final_score: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False)
    appeal_status: Mapped[str | None] = mapped_column(String(40), nullable=True)


class AssessmentResultConfirmationModel(AuditMixin, Base):
    __tablename__ = "assessment_result_confirmations"

    confirmation_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    result_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("assessment_results.result_id"),
        nullable=False,
    )
    decision: Mapped[str] = mapped_column(String(40), nullable=False)
    comment: Mapped[str] = mapped_column(Text, nullable=False, default="")
    confirmed_by_ref: Mapped[str] = mapped_column(String(80), nullable=False)
    confirmed_at_ref: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class AssessmentScoreAppealModel(AuditMixin, Base):
    __tablename__ = "assessment_score_appeals"

    score_appeal_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    result_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("assessment_results.result_id"),
        nullable=False,
    )
    target_org_id: Mapped[str] = mapped_column(
        String(80), nullable=False,
    )
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    submitted_by_ref: Mapped[str] = mapped_column(String(80), nullable=False)
    submitted_at_ref: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    decided_by_ref: Mapped[str | None] = mapped_column(String(80), nullable=True)
    decided_at_ref: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    decision: Mapped[str | None] = mapped_column(String(40), nullable=True)
    decision_reason: Mapped[str | None] = mapped_column(Text, nullable=True)


class AssessmentScoreAppealItemModel(AuditMixin, Base):
    __tablename__ = "assessment_score_appeal_items"

    score_appeal_item_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    score_appeal_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("assessment_score_appeals.score_appeal_id"),
        nullable=False,
    )
    result_item_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("assessment_result_items.result_item_id"),
        nullable=False,
    )
    requested_score: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)
    adopted_score: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)
    reason: Mapped[str] = mapped_column(Text, nullable=False)


class AssessmentScoreAppealAttachmentModel(AuditMixin, Base):
    __tablename__ = "assessment_score_appeal_attachments"

    score_appeal_attachment_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    score_appeal_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("assessment_score_appeals.score_appeal_id"),
        nullable=False,
    )
    file_id: Mapped[str] = mapped_column(
        String(120), nullable=False,
    )
    bound_by_ref: Mapped[str] = mapped_column(String(80), nullable=False)
    bound_at_ref: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class AssessmentRecordArchiveModel(AuditMixin, Base):
    __tablename__ = "assessment_record_archives"

    archive_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    result_id: Mapped[str] = mapped_column(
        String(120),
        ForeignKey("assessment_results.result_id"),
        nullable=False,
    )
    archive_type: Mapped[str] = mapped_column(String(80), nullable=False)
    snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    archived_by_ref: Mapped[str] = mapped_column(String(80), nullable=False)
    archived_at_ref: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
