from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import delete, text, update
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.modules.compliance.core.config import get_settings
from app.modules.compliance.domain.assessment_simulation_store import assessment_simulation_store
from app.modules.compliance.domain.auth_store import auth_store
from app.modules.compliance.domain.cycle_store import cycle_store
from app.modules.compliance.domain.data_cockpit_store import data_cockpit_store
from app.modules.compliance.domain.evidence_store import evidence_store
from app.modules.compliance.domain.indicator_store import indicator_store
from app.modules.compliance.domain.inspection_plan_store import PLAN_ATTACHMENT_TYPES, inspection_plan_store
from app.modules.compliance.domain.inspection_report_store import inspection_report_store
from app.modules.compliance.domain.issue_project_store import issue_project_store
from app.modules.compliance.domain.issue_store import issue_store
from app.modules.compliance.domain.notification_store import notification_store
from app.modules.compliance.domain.rectification_store import rectification_store
from app.modules.compliance.domain.reporting_store import reporting_store
from app.modules.compliance.domain.result_store import result_store
from app.modules.compliance.domain.review_store import review_store
from app.modules.compliance.domain.scheme_store import scheme_store
from app.modules.compliance.domain.seed_time import relative_datetime_iso, seed_base_date
from app.modules.compliance.domain.task_store import task_store
from app.modules.compliance.domain.workflow_store import workflow_template_store
from app.modules.compliance.models import (
    AdjudicationDecisionModel,
    AssessmentAIInsightSnapshotModel,
    AssessmentCycleModel,
    AssessmentCycleTargetModel,
    AssessmentDispatchEventModel,
    AssessmentEvidenceTemplateModel,
    AssessmentFoundationFixtureModel,
    AssessmentGradeThresholdModel,
    AssessmentIndicatorCategoryModel,
    AssessmentIndicatorModel,
    AssessmentRecordArchiveModel,
    AssessmentReportingTaskModel,
    AssessmentResponseEvidenceModel,
    AssessmentResponseItemModel,
    AssessmentResultConfirmationModel,
    AssessmentResultItemModel,
    AssessmentResultModel,
    AssessmentReviewDecisionModel,
    AssessmentReviewItemModel,
    AssessmentReviewTaskModel,
    AssessmentSchemeItemModel,
    AssessmentSchemeModel,
    AssessmentScoreAdjustmentModel,
    AssessmentScoreAppealAttachmentModel,
    AssessmentScoreAppealItemModel,
    AssessmentScoreAppealModel,
    AssessmentSimulationRunModel,
    AssessmentTargetGroupMemberModel,
    AssessmentTargetGroupModel,
    AssessmentVolumeAdjustmentFactorModel,
    AuthUserModel,
    ComplianceIssueModel,
    DailyComplianceLedgerAttachmentModel,
    DailyComplianceLedgerEntryModel,
    DataSyncAlertModel,
    DataSyncJobModel,
    DataSyncLogModel,
    DataSyncRerunRequestModel,
    DataSyncSnapshotModel,
    EvidenceRequirementModel,
    EvidenceSubmissionModel,
    ExportArtifactModel,
    ExportAuditEventModel,
    ExternalDataConnectorBindingModel,
    ExternalDataSourceModel,
    FactConfirmationModel,
    FileAssetModel,
    IndicatorVariableModel,
    IndicatorVersionModel,
    InspectionIssueModel,
    InspectionPlanModel,
    InspectionReportAuditEventModel,
    InspectionReportCommandKeyModel,
    InspectionReportVersionModel,
    IntegrationEventModel,
    IssueAppealModel,
    IssueProjectReminderEventModel,
    IssueSupervisionEventModel,
    NotificationDeliveryEventModel,
    NotificationMessageModel,
    NotificationRecipientStateModel,
    OrgNodeModel,
    PersonnelModel,
    QualitativeRubricItemModel,
    RectificationFeedbackModel,
    RectificationRecordModel,
    RoleAssignmentModel,
    ScoringRuleBandModel,
    ScoringRuleModel,
    SysDictModel,
    SystemRoleModel,
    UnifiedTaskModel,
    WorkflowTemplateAuditEventModel,
    WorkflowTemplateModel,
    WorkflowTemplateVersionModel,
    WorkingPaperModel,
)
from app.modules.compliance.repositories.task_runtime import task_runtime_repository

SEED_CREATED_BY = "SYSTEM-SEED"


@dataclass(frozen=True)
class SeedTable:
    model: type[DeclarativeBase]
    rows: tuple[DeclarativeBase, ...]

    @property
    def table_name(self) -> str:
        return self.model.__table__.name


INSERT_MODEL_ORDER: tuple[type[DeclarativeBase], ...] = (
    OrgNodeModel,
    SystemRoleModel,
    AuthUserModel,
    PersonnelModel,
    RoleAssignmentModel,
    SysDictModel,
    AssessmentIndicatorCategoryModel,
    AssessmentIndicatorModel,
    IndicatorVersionModel,
    IndicatorVariableModel,
    ScoringRuleModel,
    ScoringRuleBandModel,
    QualitativeRubricItemModel,
    AssessmentEvidenceTemplateModel,
    AssessmentSchemeModel,
    AssessmentSchemeItemModel,
    AssessmentGradeThresholdModel,
    AssessmentVolumeAdjustmentFactorModel,
    AssessmentTargetGroupModel,
    AssessmentTargetGroupMemberModel,
    AssessmentSimulationRunModel,
    ExternalDataSourceModel,
    ExternalDataConnectorBindingModel,
    DataSyncJobModel,
    DataSyncSnapshotModel,
    DataSyncAlertModel,
    DataSyncLogModel,
    DataSyncRerunRequestModel,
    ExportArtifactModel,
    ExportAuditEventModel,
    AssessmentCycleModel,
    AssessmentCycleTargetModel,
    AssessmentDispatchEventModel,
    InspectionPlanModel,
    UnifiedTaskModel,
    AssessmentReportingTaskModel,
    FileAssetModel,
    InspectionReportVersionModel,
    InspectionReportAuditEventModel,
    InspectionReportCommandKeyModel,
    AssessmentResponseItemModel,
    AssessmentResponseEvidenceModel,
    AssessmentReviewTaskModel,
    AssessmentReviewItemModel,
    AssessmentScoreAdjustmentModel,
    AssessmentReviewDecisionModel,
    AssessmentAIInsightSnapshotModel,
    AssessmentResultModel,
    AssessmentResultItemModel,
    AssessmentResultConfirmationModel,
    AssessmentScoreAppealModel,
    AssessmentScoreAppealItemModel,
    AssessmentScoreAppealAttachmentModel,
    AssessmentRecordArchiveModel,
    DailyComplianceLedgerEntryModel,
    DailyComplianceLedgerAttachmentModel,
    EvidenceRequirementModel,
    EvidenceSubmissionModel,
    WorkingPaperModel,
    InspectionIssueModel,
    FactConfirmationModel,
    IssueAppealModel,
    AdjudicationDecisionModel,
    ComplianceIssueModel,
    IssueSupervisionEventModel,
    RectificationRecordModel,
    RectificationFeedbackModel,
    IssueProjectReminderEventModel,
    AssessmentFoundationFixtureModel,
    IntegrationEventModel,
    NotificationMessageModel,
    NotificationRecipientStateModel,
    NotificationDeliveryEventModel,
    WorkflowTemplateModel,
    WorkflowTemplateVersionModel,
    WorkflowTemplateAuditEventModel,
)

CLEAR_MODEL_ORDER: tuple[type[DeclarativeBase], ...] = tuple(reversed(INSERT_MODEL_ORDER))


def _plan_attachment_type_dict_rows() -> tuple[SysDictModel, ...]:
    specs = (
        ("DICT-INSPECTION-PLAN-ATTACHMENT-NOTICE", "INSPECTION_NOTICE", 10),
        ("DICT-INSPECTION-PLAN-ATTACHMENT-SCHEME", "ONSITE_INSPECTION_SCHEME", 20),
        ("DICT-INSPECTION-PLAN-ATTACHMENT-WORKING-PAPER", "WORKING_PAPER_TEMPLATE", 30),
        ("DICT-INSPECTION-PLAN-ATTACHMENT-OTHER", "OTHER", 40),
    )
    readback_fields = [
        "attachmentType",
        "attachmentKey",
        "attachmentLabel",
        "required",
        "bindingTargetType",
        "businessStage",
        "fileId",
        "fileName",
        "contentType",
        "fileSize",
        "scanStatus",
        "uploadedBy",
        "uploadedAt",
        "boundBy",
        "boundAt",
    ]
    rows: list[SysDictModel] = []
    for dict_id, code, sort_order in specs:
        config = PLAN_ATTACHMENT_TYPES[code]
        rows.append(
            SysDictModel(
                **_audit(),
                dict_id=dict_id,
                parent_id=None,
                dict_type="inspection_plan_attachment_type",
                dict_code=code,
                dict_label=config["label"],
                dict_label_en=None,
                sort_order=sort_order,
                is_active=True,
                is_system=True,
                edit_policy="SEEDED_LOCKED",
                description="SIT seeded inspection plan creation attachment type.",
                ui_meta={
                    "attachmentKey": config["key"],
                    "required": config["required"],
                    "bindingTargetType": config["bindingTargetType"],
                    "businessStage": config["businessStage"],
                    "maintenance": config["maintenance"],
                    "allowedMimeTypes": config["allowedMimeTypes"],
                    "allowedExtensions": config["allowedExtensions"],
                    "maxFileSizeBytes": config["maxFileSizeBytes"],
                    "scanStatus": config["scanStatus"],
                    "uploadRole": "scoped_file_uploader",
                    "bindingRole": "HqInspectionManageDep",
                    "readbackFields": readback_fields,
                },
                source="seed",
                version=1,
            )
        )
    return tuple(rows)


def build_s0_config_dictionary_rows() -> tuple[SysDictModel, ...]:
    return (
        SysDictModel(
            **_audit(),
            dict_id="DICT-INSPECTION-PLAN-TYPE-ROUTINE",
            parent_id=None,
            dict_type="inspection_plan_type",
            dict_code="ROUTINE_INSPECTION",
            dict_label="例行检查",
            dict_label_en=None,
            sort_order=10,
            is_active=True,
            is_system=True,
            edit_policy="SEEDED_LOCKED",
            description="SIT S0 seeded inspection plan type.",
            ui_meta={
                "badgeTone": "blue",
                "calendarColor": "#2563eb",
            },
            source="seed",
            version=1,
        ),
        SysDictModel(
            **_audit(),
            dict_id="DICT-INSPECTION-PLAN-TYPE-SPECIAL",
            parent_id=None,
            dict_type="inspection_plan_type",
            dict_code="SPECIAL_INSPECTION",
            dict_label="专项检查",
            dict_label_en=None,
            sort_order=20,
            is_active=True,
            is_system=True,
            edit_policy="SEEDED_LOCKED",
            description="SIT S0 seeded inspection plan type.",
            ui_meta={
                "badgeTone": "purple",
                "calendarColor": "#7c3aed",
            },
            source="seed",
            version=1,
        ),
        SysDictModel(
            **_audit(),
            dict_id="DICT-INSPECTION-PLAN-TYPE-DEPARTURE-AUDIT",
            parent_id=None,
            dict_type="inspection_plan_type",
            dict_code="DEPARTURE_AUDIT",
            dict_label="离任审计",
            dict_label_en=None,
            sort_order=30,
            is_active=True,
            is_system=True,
            edit_policy="SEEDED_LOCKED",
            description="SIT S0 seeded inspection plan type.",
            ui_meta={
                "badgeTone": "orange",
                "calendarColor": "#ea580c",
            },
            source="seed",
            version=1,
        ),
        SysDictModel(
            **_audit(),
            dict_id="DICT-INSPECTION-PLAN-FREQUENCY-ANNUAL",
            parent_id=None,
            dict_type="inspection_plan_frequency",
            dict_code="YEARLY",
            dict_label="年度",
            dict_label_en=None,
            sort_order=10,
            is_active=True,
            is_system=True,
            edit_policy="SEEDED_LOCKED",
            description="SIT S0 seeded inspection plan frequency.",
            ui_meta={},
            source="seed",
            version=1,
        ),
        SysDictModel(
            **_audit(),
            dict_id="DICT-INSPECTION-PLAN-FREQUENCY-SEMI-ANNUAL",
            parent_id=None,
            dict_type="inspection_plan_frequency",
            dict_code="HALF_YEARLY",
            dict_label="半年度",
            dict_label_en=None,
            sort_order=20,
            is_active=True,
            is_system=True,
            edit_policy="SEEDED_LOCKED",
            description="SIT S0 seeded inspection plan frequency.",
            ui_meta={},
            source="seed",
            version=1,
        ),
        SysDictModel(
            **_audit(),
            dict_id="DICT-INSPECTION-PLAN-FREQUENCY-QUARTERLY",
            parent_id=None,
            dict_type="inspection_plan_frequency",
            dict_code="QUARTERLY",
            dict_label="季度",
            dict_label_en=None,
            sort_order=30,
            is_active=True,
            is_system=True,
            edit_policy="SEEDED_LOCKED",
            description="SIT S0 seeded inspection plan frequency.",
            ui_meta={},
            source="seed",
            version=1,
        ),
        SysDictModel(
            **_audit(),
            dict_id="DICT-INSPECTION-PLAN-FREQUENCY-TEMPORARY",
            parent_id=None,
            dict_type="inspection_plan_frequency",
            dict_code="AD_HOC",
            dict_label="临时",
            dict_label_en=None,
            sort_order=40,
            is_active=True,
            is_system=True,
            edit_policy="SEEDED_LOCKED",
            description="SIT S0 seeded inspection plan frequency.",
            ui_meta={},
            source="seed",
            version=1,
        ),
        SysDictModel(
            **_audit(),
            dict_id="DICT-INSPECTION-CONFIDENTIALITY-NORMAL",
            parent_id=None,
            dict_type="inspection_confidentiality_level",
            dict_code="NORMAL",
            dict_label="普通",
            dict_label_en=None,
            sort_order=10,
            is_active=True,
            is_system=True,
            edit_policy="SEEDED_LOCKED",
            description="SIT seeded inspection plan confidentiality level.",
            ui_meta={"default": True},
            source="seed",
            version=1,
        ),
        SysDictModel(
            **_audit(),
            dict_id="DICT-INSPECTION-CONFIDENTIALITY-SECRET",
            parent_id=None,
            dict_type="inspection_confidentiality_level",
            dict_code="SECRET",
            dict_label="秘密",
            dict_label_en=None,
            sort_order=20,
            is_active=True,
            is_system=True,
            edit_policy="SEEDED_LOCKED",
            description="SIT seeded inspection plan confidentiality level.",
            ui_meta={},
            source="seed",
            version=1,
        ),
        SysDictModel(
            **_audit(),
            dict_id="DICT-INSPECTION-CONFIDENTIALITY-CONFIDENTIAL",
            parent_id=None,
            dict_type="inspection_confidentiality_level",
            dict_code="CONFIDENTIAL",
            dict_label="机密",
            dict_label_en=None,
            sort_order=30,
            is_active=True,
            is_system=True,
            edit_policy="SEEDED_LOCKED",
            description="SIT seeded inspection plan confidentiality level.",
            ui_meta={},
            source="seed",
            version=1,
        ),
        *_plan_attachment_type_dict_rows(),
    )


def build_runtime_seed_tables() -> tuple[SeedTable, ...]:
    reset_in_memory_seed_stores()

    # ── L2/L3 Discovery follow-up: pre-seed actionable states ──
    branch_compliance_user = auth_store.users.get("USER-BRANCH-COMP-001")
    hq_compliance_user = auth_store.users.get("USER-HQ-COMP-001")

    # ASCH-10A-F1: Pre-publish the default workflow template in database seed
    if hq_compliance_user:
        try:
            workflow_template_store.publish(
                template_id="WFT-ASSESS-DEFAULT",
                user=hq_compliance_user,
                auth=auth_store,
            )
        except Exception:
            pass

    # F2: Pre-submit an appeal so HQ adjudication queue is non-empty
    if branch_compliance_user:
        try:
            issue_store.submit_appeal(
                issue_id="ISSUE-WLZQ-AML-SEED-APPEAL-001",
                user=branch_compliance_user,
                auth_store=auth_store,
                reason="Seed appeal for L2/L3 discovery cross-role adjudication flow testing.",
                file_ids=[],
            )
        except Exception:
            pass  # Ignore if already appealed or deadline passed

    # F4/F5: Pre-create and dispatch a cycle so branch reporting tasks exist
    if hq_compliance_user:
        try:
            cycle_detail = cycle_store.create_cycle(
                user=hq_compliance_user,
                auth_store=auth_store,
                payload={
                    "schemeId": "ASCH-SEED-2026",
                    "cycleName": "2026年Q1分支机构综合合规考核（测试用）",
                    "year": 2026,
                    "periodStart": "2026-01-01",
                    "periodEnd": "2026-03-31",
                    "targetOrgIds": ["WLZQ-RBC-GZ-NANSHA"],
                },
            )
            cycle_store.dispatch_cycle(
                cycle_id=cycle_detail["cycleId"],
                user=hq_compliance_user,
                auth_store=auth_store,
                payload={},
            )
        except Exception:
            pass  # Ignore if scheme missing or dispatch failed

    rows_by_model: dict[type[DeclarativeBase], list[DeclarativeBase]] = {
        model: [] for model in INSERT_MODEL_ORDER
    }
    rows_by_model[SysDictModel].extend(build_s0_config_dictionary_rows())

    for org in auth_store.orgs.values():
        rows_by_model[OrgNodeModel].append(
            OrgNodeModel(
                **_audit(),
                org_id=org.org_id,
                org_name=org.org_name,
                org_level=org.org_level,
                parent_org_id=org.parent_org_id if org.parent_org_id in auth_store.orgs else None,
                region=org.region,
                city=org.city,
                business_line_ids=org.business_line_ids,
                data_origin=org.data_origin,
            ),
        )
    for role in auth_store.roles.values():
        rows_by_model[SystemRoleModel].append(
            SystemRoleModel(
                **_audit(),
                role_id=role.role_id,
                role_code=role.role_code,
                role_name=role.role_name,
                role_level=role.role_level,
                description=role.description,
            ),
        )
    for user in auth_store.users.values():
        rows_by_model[AuthUserModel].append(
            AuthUserModel(
                **_audit(),
                user_id=user.user_id,
                external_subject_id=f"seed::{user.user_id}",
                username=user.username,
                display_name=user.display_name,
                org_id=user.org_id,
                active=user.active,
                extra={"roleIds": user.role_ids, "demo": True},
            ),
        )
    for personnel in auth_store.personnel.values():
        rows_by_model[PersonnelModel].append(
            PersonnelModel(
                **_audit(),
                personnel_id=personnel.personnel_id,
                user_id=personnel.user_id,
                display_name=personnel.display_name,
                org_id=personnel.org_id,
                title=personnel.title,
                active=personnel.active,
                extra={},
            ),
        )
    for assignment in auth_store.role_assignments.values():
        rows_by_model[RoleAssignmentModel].append(
            RoleAssignmentModel(
                **_audit(),
                assignment_id=assignment.assignment_id,
                role_id=assignment.role_id,
                personnel_id=assignment.personnel_id,
                org_id=assignment.org_id,
                assigned_by=assignment.assigned_by,
                assigned_at=_parse_datetime(assignment.assigned_at),
                active=assignment.active,
            ),
        )

    rows_by_model[AssessmentIndicatorCategoryModel].extend(
        [
            AssessmentIndicatorCategoryModel(
                **_audit(),
                category_id="AICAT-P1-FOUNDATION-GOVERNANCE",
                category_code="GOVERNANCE",
                category_name="治理与制度",
                parent_category_id=None,
                description="P1 seed skeleton category for later indicator slices.",
                sort_order=10,
                active=True,
            ),
            AssessmentIndicatorCategoryModel(
                **_audit(),
                category_id="AICAT-P1-FOUNDATION-OPERATIONS",
                category_code="OPERATIONS",
                category_name="经营与操作",
                parent_category_id=None,
                description="P1 seed skeleton category for later indicator slices.",
                sort_order=20,
                active=True,
            ),
            AssessmentIndicatorCategoryModel(
                **_audit(),
                category_id="AICAT-P1-FOUNDATION-BRANCH-COMPLIANCE",
                category_code="BRANCH_COMPLIANCE",
                category_name="分支合规",
                parent_category_id=None,
                description="P1 seed skeleton category for later indicator slices.",
                sort_order=30,
                active=True,
            ),
        ],
    )

    for indicator in indicator_store.indicators.values():
        rows_by_model[AssessmentIndicatorModel].append(
            AssessmentIndicatorModel(
                **_audit(indicator.created_by_ref, indicator.created_by_ref),
                indicator_id=indicator.indicator_id,
                indicator_code=indicator.indicator_code,
                indicator_name=indicator.indicator_name,
                category_id=indicator.category_id,
                business_line=indicator.business_line,
                data_type=indicator.data_type,
                value_type=indicator.value_type,
                input_mode=indicator.input_mode,
                data_source_mode=indicator.data_source_mode,
                description=indicator.description,
                active_version_id=None,
            ),
        )
        for version in indicator.versions.values():
            rows_by_model[IndicatorVersionModel].append(
                IndicatorVersionModel(
                    **_audit(),
                    version_id=version.version_id,
                    indicator_id=indicator.indicator_id,
                    version_no=version.version_no,
                    status=version.status,
                    weight_default=version.weight_default,
                    max_score=version.max_score,
                    scoring_validation_status=version.scoring_validation_status,
                    validation_errors=version.validation_errors,
                    published_by_ref=version.published_by_ref,
                    published_at_ref=(
                        _parse_datetime(version.published_at_ref)
                        if version.published_at_ref
                        else None
                    ),
                    archived_reason=version.archived_reason,
                    core_snapshot=version.core_snapshot,
                ),
            )
            for variable in version.variables:
                rows_by_model[IndicatorVariableModel].append(
                    IndicatorVariableModel(
                        **_audit(),
                        variable_id=variable.variable_id,
                        version_id=version.version_id,
                        variable_code=variable.variable_code,
                        variable_name=variable.variable_name,
                        value_type=variable.value_type,
                        required=variable.required,
                    ),
                )
            if version.scoring_rule:
                rule = version.scoring_rule
                rows_by_model[ScoringRuleModel].append(
                    ScoringRuleModel(
                        **_audit(),
                        scoring_rule_id=rule.scoring_rule_id,
                        version_id=version.version_id,
                        rule_type=rule.rule_type,
                        effect=rule.effect,
                        expression=rule.expression,
                        require_continuous_bands=rule.require_continuous_bands,
                        validation_status=rule.validation_status,
                        validation_errors=rule.validation_errors,
                    ),
                )
                for index, band in enumerate(rule.bands, start=1):
                    rows_by_model[ScoringRuleBandModel].append(
                        ScoringRuleBandModel(
                            **_audit(),
                            band_id=f"{rule.scoring_rule_id}-BAND-{index:03d}",
                            scoring_rule_id=rule.scoring_rule_id,
                            min_value=band.get("minValue"),
                            max_value=band.get("maxValue"),
                            score=band["score"],
                            sort_order=index,
                        ),
                    )
                for index, rubric in enumerate(rule.rubrics, start=1):
                    rows_by_model[QualitativeRubricItemModel].append(
                        QualitativeRubricItemModel(
                            **_audit(),
                            rubric_item_id=f"{rule.scoring_rule_id}-RUBRIC-{index:03d}",
                            scoring_rule_id=rule.scoring_rule_id,
                            item_code=rubric["itemCode"],
                            item_label=rubric["itemLabel"],
                            score=rubric["score"],
                            sort_order=index,
                        ),
                    )
            for template in version.evidence_templates:
                rows_by_model[AssessmentEvidenceTemplateModel].append(
                    AssessmentEvidenceTemplateModel(
                        **_audit(),
                        evidence_template_id=template.evidence_template_id,
                        version_id=version.version_id,
                        template_name=template.template_name,
                        required=template.required,
                        accepted_file_tags=template.accepted_file_tags,
                        description=template.description,
                    ),
                )

    for scheme in scheme_store.schemes.values():
        rows_by_model[AssessmentSchemeModel].append(
            AssessmentSchemeModel(
                **_audit(scheme.created_by_ref, scheme.created_by_ref),
                scheme_id=scheme.scheme_id,
                scheme_code=scheme.scheme_code,
                scheme_name=scheme.scheme_name,
                year=scheme.year,
                frequency=scheme.frequency,
                status=scheme.status,
                description=scheme.description,
                total_weight=scheme.total_weight,
                created_by_ref=scheme.created_by_ref,
                published_by_ref=scheme.published_by_ref,
                published_at_ref=(
                    _parse_datetime(scheme.published_at_ref) if scheme.published_at_ref else None
                ),
                archived_reason=scheme.archived_reason,
                has_been_published=scheme.has_been_published,
                scheme_snapshot=scheme.scheme_snapshot,
                optimistic_version=scheme.optimistic_version,
                source_scheme_id=scheme.source_scheme_id,
                source_scheme_code=scheme.source_scheme_code,
                source_trace=scheme.source_trace,
                workflow_binding=scheme.workflow_binding,
                schedule_binding=scheme.schedule_binding,
                command_audit=scheme.command_audit,
            ),
        )
        for item in scheme.items:
            rows_by_model[AssessmentSchemeItemModel].append(
                AssessmentSchemeItemModel(
                    **_audit(),
                    scheme_item_id=item.scheme_item_id,
                    scheme_id=scheme.scheme_id,
                    indicator_id=item.indicator_id,
                    version_id=item.version_id,
                    weight=item.weight,
                    score_cap=item.score_cap,
                    sort_order=item.sort_order,
                    indicator_snapshot=item.indicator_snapshot,
                ),
            )
        for threshold in scheme.grade_thresholds:
            rows_by_model[AssessmentGradeThresholdModel].append(
                AssessmentGradeThresholdModel(
                    **_audit(),
                    threshold_id=threshold.threshold_id,
                    scheme_id=scheme.scheme_id,
                    grade_code=threshold.grade_code,
                    grade_label=threshold.grade_label,
                    min_score=threshold.min_score,
                    max_score=threshold.max_score,
                    sort_order=threshold.sort_order,
                ),
            )
        for factor in scheme.volume_adjustment_factors:
            rows_by_model[AssessmentVolumeAdjustmentFactorModel].append(
                AssessmentVolumeAdjustmentFactorModel(
                    **_audit(),
                    factor_id=factor.factor_id,
                    scheme_id=scheme.scheme_id,
                    factor_code=factor.factor_code,
                    factor_name=factor.factor_name,
                    description=factor.description,
                    multiplier=factor.multiplier,
                    enabled=factor.enabled,
                    sort_order=factor.sort_order,
                ),
            )
        for group in scheme.target_groups:
            rows_by_model[AssessmentTargetGroupModel].append(
                AssessmentTargetGroupModel(
                    **_audit(),
                    target_group_id=group.target_group_id,
                    scheme_id=scheme.scheme_id,
                    group_name=group.group_name,
                    scope_mode=group.scope_mode,
                    description=group.description,
                    sort_order=group.sort_order,
                ),
            )
            for member in group.members:
                rows_by_model[AssessmentTargetGroupMemberModel].append(
                    AssessmentTargetGroupMemberModel(
                        **_audit(),
                        member_id=member.member_id,
                        target_group_id=group.target_group_id,
                        org_id=member.org_id,
                        org_snapshot=member.org_snapshot,
                        sort_order=member.sort_order,
                    ),
                )

    for source in data_cockpit_store.sources.values():
        rows_by_model[ExternalDataSourceModel].append(
            ExternalDataSourceModel(
                **_audit(),
                source_id=source.source_id,
                source_code=source.source_code,
                source_name=source.source_name,
                owner_dept_snapshot=source.owner_dept_snapshot,
                connector_type=source.connector_type,
                health_status=source.health_status,
                last_heartbeat_at=(
                    _parse_datetime(source.last_heartbeat_at) if source.last_heartbeat_at else None
                ),
                sandbox_only=source.sandbox_only,
            ),
        )
    for binding in data_cockpit_store.bindings.values():
        rows_by_model[ExternalDataConnectorBindingModel].append(
            ExternalDataConnectorBindingModel(
                **_audit(),
                binding_id=binding.binding_id,
                source_id=binding.source_id,
                binding_type=binding.binding_type,
                endpoint_alias=binding.endpoint_alias,
                config_snapshot=binding.config_snapshot,
                binding_created_at=_parse_datetime(binding.created_at),
                sandbox_only=binding.sandbox_only,
            ),
        )
    for job in data_cockpit_store.jobs.values():
        rows_by_model[DataSyncJobModel].append(
            DataSyncJobModel(
                **_audit(),
                job_id=job.job_id,
                source_id=job.source_id,
                source_code=job.source_code,
                indicator_id=job.indicator_id,
                indicator_name=job.indicator_name,
                cycle_id=job.cycle_id,
                status=job.status,
                records=job.records,
                error_code=job.error_code,
                error_message=job.error_message,
                started_at=_parse_datetime(job.started_at),
                finished_at=_parse_datetime(job.finished_at) if job.finished_at else None,
                has_snapshot=job.has_snapshot,
                sandbox_only=job.sandbox_only,
            ),
        )
    for snapshot in data_cockpit_store.snapshots.values():
        rows_by_model[DataSyncSnapshotModel].append(
            DataSyncSnapshotModel(
                **_audit(),
                snapshot_id=snapshot.snapshot_id,
                job_id=snapshot.job_id,
                payload_hash=snapshot.payload_hash,
                record_count=snapshot.record_count,
                redaction_policy=snapshot.redaction_policy,
                captured_at=_parse_datetime(snapshot.captured_at),
                sample_rows=snapshot.sample_rows,
                omitted_fields=snapshot.omitted_fields,
                file_id=snapshot.file_id,
                sandbox_only=snapshot.sandbox_only,
            ),
        )
    for alert in data_cockpit_store.alerts.values():
        rows_by_model[DataSyncAlertModel].append(
            DataSyncAlertModel(
                **_audit(),
                alert_id=alert.alert_id,
                job_id=alert.job_id,
                source_id=alert.source_id,
                status=alert.status,
                severity=alert.severity,
                message=alert.message,
                alert_created_at=_parse_datetime(alert.created_at),
                ignored_by=alert.ignored_by,
                ignored_at=_parse_datetime(alert.ignored_at) if alert.ignored_at else None,
                resolved_at=_parse_datetime(alert.resolved_at) if alert.resolved_at else None,
                audit_events=alert.audit_events,
            ),
        )
    for log in data_cockpit_store.logs.values():
        rows_by_model[DataSyncLogModel].append(
            DataSyncLogModel(
                **_audit(
                    log.actor_user_id or SEED_CREATED_BY,
                    log.actor_user_id or SEED_CREATED_BY,
                ),
                log_id=log.log_id,
                job_id=log.job_id,
                source_id=log.source_id,
                event_type=log.event_type,
                message=log.message,
                actor_user_id=log.actor_user_id,
                event_created_at=_parse_datetime(log.created_at),
                command_type=log.command_type,
                request_id=log.request_id,
                payload_hash=log.payload_hash,
                log_metadata=log.metadata,
            ),
        )
    for rerun in data_cockpit_store.rerun_requests.values():
        rows_by_model[DataSyncRerunRequestModel].append(
            DataSyncRerunRequestModel(
                **_audit(rerun.requested_by, rerun.requested_by),
                rerun_request_id=rerun.rerun_request_id,
                job_id=rerun.job_id,
                source_id=rerun.source_id,
                indicator_id=rerun.indicator_id,
                cycle_id=rerun.cycle_id,
                source_window_key=rerun.source_window_key,
                status=rerun.status,
                requested_by=rerun.requested_by,
                actor_snapshot=rerun.actor_snapshot,
                reason=rerun.reason,
                request_id=rerun.request_id,
                payload_hash=rerun.payload_hash,
                approval_marker=rerun.approval_marker,
                risk_acknowledgement=rerun.risk_acknowledgement,
                audit_event_id=rerun.audit_event_id,
                request_created_at=_parse_datetime(rerun.created_at),
                sandbox_only=rerun.sandbox_only,
            ),
        )
    for artifact in data_cockpit_store.export_artifacts.values():
        rows_by_model[ExportArtifactModel].append(
            ExportArtifactModel(
                **_audit(artifact.requested_by, artifact.requested_by),
                export_id=artifact.export_id,
                export_type=artifact.export_type,
                format=artifact.format,
                filter_snapshot=artifact.filter_snapshot,
                status=artifact.status,
                requested_by=artifact.requested_by,
                request_id=artifact.request_id,
                redaction_policy=artifact.redaction_policy,
                evidence_label=artifact.evidence_label,
                export_created_at=_parse_datetime(artifact.created_at),
                file_id=artifact.file_id,
                download_url=artifact.download_url,
                expires_at=_parse_datetime(artifact.expires_at) if artifact.expires_at else None,
                checksum=artifact.checksum,
                sandbox_only=artifact.sandbox_only,
                formal_artifact=artifact.formal_artifact,
                signed_artifact=artifact.signed_artifact,
            ),
        )
    for event in data_cockpit_store.export_audit_events.values():
        rows_by_model[ExportAuditEventModel].append(
            ExportAuditEventModel(
                **_audit(event.requested_by, event.requested_by),
                export_audit_event_id=event.export_audit_event_id,
                export_id=event.export_id,
                requested_by=event.requested_by,
                actor_snapshot=event.actor_snapshot,
                filter_snapshot=event.filter_snapshot,
                redaction_policy=event.redaction_policy,
                access_metadata=event.access_metadata,
                event_created_at=_parse_datetime(event.created_at),
            ),
        )

    for cycle in cycle_store.cycles.values():
        rows_by_model[AssessmentCycleModel].append(
            AssessmentCycleModel(
                **_audit(cycle.created_by_ref, cycle.created_by_ref),
                cycle_id=cycle.cycle_id,
                cycle_code=cycle.cycle_code,
                cycle_name=cycle.cycle_name,
                scheme_id=cycle.scheme_id,
                scheme_snapshot=cycle.scheme_snapshot,
                year=cycle.year,
                period_start=_parse_datetime(cycle.period_start),
                period_end=_parse_datetime(cycle.period_end),
                status=cycle.status,
                dispatch_mode=cycle.dispatch_mode,
                selected_target_org_ids=cycle.selected_target_org_ids,
                created_by_ref=cycle.created_by_ref,
                dispatched_by_ref=cycle.dispatched_by_ref,
                dispatched_at_ref=(
                    _parse_datetime(cycle.dispatched_at_ref) if cycle.dispatched_at_ref else None
                ),
                closed_at_ref=(
                    _parse_datetime(cycle.closed_at_ref) if cycle.closed_at_ref else None
                ),
                archived_reason=cycle.archived_reason,
            ),
        )
        for target in cycle.targets.values():
            rows_by_model[AssessmentCycleTargetModel].append(
                AssessmentCycleTargetModel(
                    **_audit(),
                    cycle_target_id=target.cycle_target_id,
                    cycle_id=cycle.cycle_id,
                    org_id=target.org_id,
                    org_snapshot=target.org_snapshot,
                    target_status=target.target_status,
                    reporting_task_id=target.reporting_task_id,
                    review_task_id=target.review_task_id,
                    review_status=target.review_status,
                    result_id=target.result_id,
                ),
            )
        for event in cycle.dispatch_events:
            rows_by_model[AssessmentDispatchEventModel].append(
                AssessmentDispatchEventModel(
                    **_audit(),
                    dispatch_event_id=event.dispatch_event_id,
                    cycle_id=cycle.cycle_id,
                    event_type=event.event_type,
                    target_org_ids=event.target_org_ids,
                    message=event.message,
                    created_by_ref=event.created_by_ref,
                    event_created_at=_parse_datetime(event.event_created_at),
                ),
            )
        for reporting_task in cycle.reporting_tasks.values():
            rows_by_model[AssessmentReportingTaskModel].append(
                AssessmentReportingTaskModel(
                    **_audit(),
                    reporting_task_id=reporting_task.reporting_task_id,
                    cycle_id=cycle.cycle_id,
                    cycle_target_id=reporting_task.cycle_target_id,
                    target_org_id=reporting_task.target_org_id,
                    unified_task_id=reporting_task.unified_task_id,
                    status=reporting_task.status,
                    due_date=_parse_datetime(reporting_task.due_date),
                ),
            )

    for response_item in reporting_store.response_items.values():
        rows_by_model[AssessmentResponseItemModel].append(
            AssessmentResponseItemModel(
                **_audit(),
                response_item_id=response_item.response_item_id,
                reporting_task_id=response_item.reporting_task_id,
                indicator_id=response_item.indicator_id,
                version_id=response_item.version_id,
                response_value=response_item.response_value,
                comment=response_item.comment,
                validation_status=response_item.validation_status,
                source_ledger_entry_id=response_item.source_ledger_entry_id,
                required_evidence=response_item.required_evidence,
            ),
        )
        for evidence in response_item.evidence.values():
            rows_by_model[AssessmentResponseEvidenceModel].append(
                AssessmentResponseEvidenceModel(
                    **_audit(evidence.bound_by_ref, evidence.bound_by_ref),
                    response_evidence_id=evidence.response_evidence_id,
                    response_item_id=response_item.response_item_id,
                    reporting_task_id=response_item.reporting_task_id,
                    file_id=evidence.file_id,
                    bound_by_ref=evidence.bound_by_ref,
                    bound_at_ref=_parse_datetime(evidence.bound_at_ref),
                ),
            )

    for ledger in reporting_store.ledger_entries.values():
        rows_by_model[DailyComplianceLedgerEntryModel].append(
            DailyComplianceLedgerEntryModel(
                **_audit(ledger.created_by_ref, ledger.updated_by_ref or ledger.created_by_ref),
                ledger_entry_id=ledger.ledger_entry_id,
                org_id=ledger.org_id,
                title=ledger.title,
                occurred_date=_parse_date(ledger.occurred_date),
                category=ledger.category,
                description=ledger.description,
                status=ledger.status,
                created_by_ref=ledger.created_by_ref,
                updated_by_ref=ledger.updated_by_ref,
                deleted_by_ref=ledger.deleted_by_ref,
                deleted_at_ref=(
                    _parse_datetime(ledger.deleted_at_ref) if ledger.deleted_at_ref else None
                ),
                audit_events=ledger.audit_events,
            ),
        )
        for attachment in ledger.attachments.values():
            rows_by_model[DailyComplianceLedgerAttachmentModel].append(
                DailyComplianceLedgerAttachmentModel(
                    **_audit(attachment.bound_by_ref, attachment.bound_by_ref),
                    ledger_attachment_id=attachment.ledger_attachment_id,
                    ledger_entry_id=ledger.ledger_entry_id,
                    file_id=attachment.file_id,
                    bound_by_ref=attachment.bound_by_ref,
                    bound_at_ref=_parse_datetime(attachment.bound_at_ref),
                ),
            )

    review_store.materialize_from_reporting(auth_store)
    for review_task in review_store.review_tasks.values():
        rows_by_model[AssessmentReviewTaskModel].append(
            AssessmentReviewTaskModel(
                **_audit(),
                review_task_id=review_task.review_task_id,
                cycle_id=review_task.cycle_id,
                cycle_target_id=review_task.cycle_target_id,
                reporting_task_id=review_task.reporting_task_id,
                assignee_user_id=review_task.assignee_user_id,
                unified_task_id=review_task.unified_task_id,
                status=review_task.status,
                started_at_ref=(
                    _parse_datetime(review_task.started_at_ref)
                    if review_task.started_at_ref
                    else None
                ),
                completed_at_ref=(
                    _parse_datetime(review_task.completed_at_ref)
                    if review_task.completed_at_ref
                    else None
                ),
            ),
        )
        for item in review_task.items.values():
            rows_by_model[AssessmentReviewItemModel].append(
                AssessmentReviewItemModel(
                    **_audit(),
                    review_item_id=item.review_item_id,
                    review_task_id=review_task.review_task_id,
                    response_item_id=item.response_item_id,
                    indicator_id=item.indicator_id,
                    version_id=item.version_id,
                    preliminary_score=item.preliminary_score,
                    final_score=item.final_score,
                    comment=item.comment,
                    status=item.status,
                ),
            )
        for adjustment in review_task.adjustments.values():
            rows_by_model[AssessmentScoreAdjustmentModel].append(
                AssessmentScoreAdjustmentModel(
                    **_audit(adjustment.created_by_ref, adjustment.created_by_ref),
                    adjustment_id=adjustment.adjustment_id,
                    review_task_id=review_task.review_task_id,
                    review_item_id=adjustment.review_item_id,
                    adjustment_type=adjustment.adjustment_type,
                    score_delta=adjustment.score_delta,
                    reason=adjustment.reason,
                    created_by_ref=adjustment.created_by_ref,
                    created_at_ref=_parse_datetime(adjustment.created_at_ref),
                ),
            )
        for decision in review_task.decisions:
            rows_by_model[AssessmentReviewDecisionModel].append(
                AssessmentReviewDecisionModel(
                    **_audit(decision.decided_by_ref, decision.decided_by_ref),
                    decision_id=decision.decision_id,
                    review_task_id=review_task.review_task_id,
                    decision=decision.decision,
                    decision_reason=decision.decision_reason,
                    decided_by_ref=decision.decided_by_ref,
                    decided_at_ref=_parse_datetime(decision.decided_at_ref),
                ),
            )
        for snapshot in review_task.ai_insight_snapshots:
            rows_by_model[AssessmentAIInsightSnapshotModel].append(
                AssessmentAIInsightSnapshotModel(
                    **_audit(snapshot.created_by_ref, snapshot.created_by_ref),
                    insight_snapshot_id=snapshot.insight_snapshot_id,
                    review_task_id=review_task.review_task_id,
                    provider=snapshot.provider,
                    model=snapshot.model,
                    summary=snapshot.summary,
                    payload=snapshot.payload,
                    created_by_ref=snapshot.created_by_ref,
                    created_at_ref=_parse_datetime(snapshot.created_at_ref),
                ),
            )

    for result in result_store.results.values():
        rows_by_model[AssessmentResultModel].append(
            AssessmentResultModel(
                **_audit(
                    result.generated_by_ref,
                    result.finalized_by_ref or result.generated_by_ref,
                ),
                result_id=result.result_id,
                cycle_id=result.cycle_id,
                cycle_target_id=result.cycle_target_id,
                target_org_id=result.target_org_id,
                review_task_id=result.review_task_id,
                status=result.status,
                confirmation_status=result.confirmation_status,
                total_score=result.total_score,
                grade_code=result.grade_code,
                confirmation_deadline=_parse_date(result.confirmation_deadline),
                generated_by_ref=result.generated_by_ref,
                generated_at_ref=_parse_datetime(result.generated_at_ref),
                published_by_ref=result.published_by_ref,
                published_at_ref=(
                    _parse_datetime(result.published_at_ref) if result.published_at_ref else None
                ),
                finalized_by_ref=result.finalized_by_ref,
                finalized_at_ref=(
                    _parse_datetime(result.finalized_at_ref) if result.finalized_at_ref else None
                ),
            ),
        )
        for item in result.items.values():
            rows_by_model[AssessmentResultItemModel].append(
                AssessmentResultItemModel(
                    **_audit(),
                    result_item_id=item.result_item_id,
                    result_id=item.result_id,
                    review_item_id=item.review_item_id,
                    indicator_id=item.indicator_id,
                    version_id=item.version_id,
                    original_score=item.original_score,
                    final_score=item.final_score,
                    appeal_status=item.appeal_status,
                ),
            )
        for confirmation in result.confirmations:
            rows_by_model[AssessmentResultConfirmationModel].append(
                AssessmentResultConfirmationModel(
                    **_audit(confirmation.confirmed_by_ref, confirmation.confirmed_by_ref),
                    confirmation_id=confirmation.confirmation_id,
                    result_id=confirmation.result_id,
                    decision=confirmation.decision,
                    comment=confirmation.comment,
                    confirmed_by_ref=confirmation.confirmed_by_ref,
                    confirmed_at_ref=_parse_datetime(confirmation.confirmed_at_ref),
                ),
            )
        for appeal in result.appeals.values():
            rows_by_model[AssessmentScoreAppealModel].append(
                AssessmentScoreAppealModel(
                    **_audit(
                        appeal.submitted_by_ref,
                        appeal.decided_by_ref or appeal.submitted_by_ref,
                    ),
                    score_appeal_id=appeal.score_appeal_id,
                    result_id=appeal.result_id,
                    target_org_id=appeal.target_org_id,
                    status=appeal.status,
                    reason=appeal.reason,
                    submitted_by_ref=appeal.submitted_by_ref,
                    submitted_at_ref=_parse_datetime(appeal.submitted_at_ref),
                    decided_by_ref=appeal.decided_by_ref,
                    decided_at_ref=(
                        _parse_datetime(appeal.decided_at_ref) if appeal.decided_at_ref else None
                    ),
                    decision=appeal.decision,
                    decision_reason=appeal.decision_reason,
                ),
            )
            for item in appeal.items.values():
                rows_by_model[AssessmentScoreAppealItemModel].append(
                    AssessmentScoreAppealItemModel(
                        **_audit(),
                        score_appeal_item_id=item.score_appeal_item_id,
                        score_appeal_id=item.score_appeal_id,
                        result_item_id=item.result_item_id,
                        requested_score=item.requested_score,
                        adopted_score=item.adopted_score,
                        reason=item.reason,
                    ),
                )
            for attachment in appeal.attachments.values():
                rows_by_model[AssessmentScoreAppealAttachmentModel].append(
                    AssessmentScoreAppealAttachmentModel(
                        **_audit(attachment.bound_by_ref, attachment.bound_by_ref),
                        score_appeal_attachment_id=attachment.score_appeal_attachment_id,
                        score_appeal_id=attachment.score_appeal_id,
                        file_id=attachment.file_id,
                        bound_by_ref=attachment.bound_by_ref,
                        bound_at_ref=_parse_datetime(attachment.bound_at_ref),
                    ),
                )
        for archive in result.archives:
            rows_by_model[AssessmentRecordArchiveModel].append(
                AssessmentRecordArchiveModel(
                    **_audit(archive.archived_by_ref, archive.archived_by_ref),
                    archive_id=archive.archive_id,
                    result_id=archive.result_id,
                    archive_type=archive.archive_type,
                    snapshot=archive.snapshot,
                    archived_by_ref=archive.archived_by_ref,
                    archived_at_ref=_parse_datetime(archive.archived_at_ref),
                ),
            )

    for plan in inspection_plan_store.plans.values():
        rows_by_model[InspectionPlanModel].append(
            InspectionPlanModel(
                **_audit(plan.created_by, plan.updated_by),
                inspection_plan_id=plan.inspection_plan_id,
                inspect_code=plan.inspect_code,
                title=plan.title,
                type=plan.type,
                frequency=plan.frequency,
                confidentiality_level=plan.confidentiality_level,
                target_org_ids=plan.target_org_ids,
                target_dept_label=plan.target_dept_label,
                leader_user_id=plan.leader_user_id,
                team_member_user_ids=plan.team_member_user_ids,
                planned_start_date=_parse_date(plan.planned_start_date),
                planned_end_date=_parse_date(plan.planned_end_date),
                status=plan.status,
                phase=plan.phase,
                phase_progress=plan.phase_progress,
                files=plan.files,
                ekp_flow=plan.ekp_flow,
                previous_status=plan.previous_status,
                previous_phase=plan.previous_phase,
            ),
        )
    for task in task_store.tasks.values():
        rows_by_model[UnifiedTaskModel].append(
            task_runtime_repository.record_to_model(task, updated_by=SEED_CREATED_BY),
        )

    for template in workflow_template_store.templates.values():
        rows_by_model[WorkflowTemplateModel].append(
            WorkflowTemplateModel(
                **_audit(
                    created_by=template.created_by_ref,
                    updated_by=template.updated_by_ref,
                ),
                template_id=template.template_id,
                name=template.name,
                domain=template.domain,
                scope_mode=template.scope_mode,
                status=template.status,
                schema_version=template.schema_version,
                chains_json=template.chains_json,
                created_by_ref=template.created_by_ref,
                updated_by_ref=template.updated_by_ref,
                current_version_id=template.current_version_id,
                last_validation_summary=template.last_validation_summary,
            ),
        )

    for version in workflow_template_store.versions.values():
        rows_by_model[WorkflowTemplateVersionModel].append(
            WorkflowTemplateVersionModel(
                **_audit(
                    created_by=version.published_by_ref,
                    updated_by=version.published_by_ref,
                ),
                template_version_id=version.template_version_id,
                template_id=version.template_id,
                version_no=version.version_no,
                status=version.status,
                snapshot_json=version.snapshot_json,
                snapshot_hash=version.snapshot_hash,
                target_scope_snapshot=version.target_scope_snapshot,
                published_by_ref=version.published_by_ref,
                published_at=_parse_datetime(version.published_at),
                archived_at=_parse_datetime(version.archived_at) if version.archived_at else None,
            ),
        )

    for event in workflow_template_store.audit_events.values():
        rows_by_model[WorkflowTemplateAuditEventModel].append(
            WorkflowTemplateAuditEventModel(
                **_audit(
                    created_by=event.actor_user_id,
                    updated_by=event.actor_user_id,
                ),
                audit_event_id=event.audit_event_id,
                template_id=event.template_id,
                event_type=event.event_type,
                actor_user_id=event.actor_user_id,
                actor_snapshot=event.actor_snapshot,
                template_version_id=event.template_version_id,
                snapshot_hash=event.snapshot_hash,
                route_summary=event.route_summary,
                target_scope_snapshot=event.target_scope_snapshot,
                validation_summary=event.validation_summary,
                event_created_at=_parse_datetime(event.event_created_at),
            ),
        )

    for message in notification_store.messages.values():
        rows_by_model[NotificationMessageModel].append(
            NotificationMessageModel(
                **_audit(message.created_by, message.created_by),
                notification_id=message.notification_id,
                source_module=message.source_module,
                source_entity_type=message.source_entity_type,
                source_entity_id=message.source_entity_id,
                type=message.type,
                severity=message.severity,
                title=message.title,
                content=message.content,
                action_target=message.action_target,
                created_by_ref=message.created_by,
                notification_created_at=_parse_datetime(message.created_at),
                expires_at=_parse_datetime(message.expires_at) if message.expires_at else None,
                extra_metadata=message.metadata,
            ),
        )
    for state in notification_store.recipient_states.values():
        rows_by_model[NotificationRecipientStateModel].append(
            NotificationRecipientStateModel(
                **_audit(),
                recipient_state_id=state.recipient_state_id,
                notification_id=state.notification_id,
                recipient_user_id=state.recipient_user_id,
                recipient_org_id=state.recipient_org_id,
                read_state=state.read_state,
                read_at=_parse_datetime(state.read_at) if state.read_at else None,
                archived_at=_parse_datetime(state.archived_at) if state.archived_at else None,
                version=state.version,
            ),
        )
    for event in notification_store.delivery_events.values():
        rows_by_model[NotificationDeliveryEventModel].append(
            NotificationDeliveryEventModel(
                **_audit(),
                delivery_event_id=event.delivery_event_id,
                notification_id=event.notification_id,
                recipient_user_id=event.recipient_user_id,
                channel=event.channel,
                delivery_status=event.delivery_status,
                provider_message_id=event.provider_message_id,
                error_code=event.error_code,
                attempted_at=_parse_datetime(event.attempted_at),
                extra_metadata=event.metadata,
            ),
        )

    for requirement in evidence_store.requirements.values():
        rows_by_model[EvidenceRequirementModel].append(
            EvidenceRequirementModel(
                **_audit(),
                requirement_id=requirement.requirement_id,
                inspection_plan_id=requirement.inspection_plan_id,
                title=requirement.title,
                description=requirement.description,
                required_tags=requirement.required_tags,
                due_date=_parse_date(requirement.due_date),
                target_org_ids=requirement.target_org_ids,
            ),
        )
    for paper in evidence_store.working_papers.values():
        rows_by_model[WorkingPaperModel].append(
            WorkingPaperModel(
                **_audit(),
                working_paper_id=paper.working_paper_id,
                inspection_plan_id=paper.inspection_plan_id,
                paper_code=paper.paper_code,
                title=paper.title,
                category=paper.category,
                inspector_user_id=paper.inspector_user_id,
                guidelines=paper.guidelines,
                procedure=paper.procedure,
                result=paper.result,
                execution_record=paper.execution_record,
                file_ids=paper.file_ids,
                evidence_list=paper.evidence_list,
                converted_issue_id=paper.converted_issue_id,
                related_issue_id=paper.related_issue_id,
                update_time=_parse_datetime(
                    getattr(paper, "updated_at", getattr(paper, "update_time", None)),
                ),
                extra_metadata={
                    "seedScenario": "normal_in_progress",
                    "branchId": getattr(paper, "branch_id", None),
                    "targetOrgSnapshot": getattr(paper, "target_org_snapshot", {}),
                    "createdAt": getattr(paper, "created_at", None),
                    "updatedAt": getattr(paper, "updated_at", None),
                },
            ),
        )

    for issue in issue_store.issues.values():
        rows_by_model[InspectionIssueModel].append(
            InspectionIssueModel(
                **_audit(),
                issue_id=issue.issue_id,
                inspection_plan_id=issue.inspection_plan_id,
                branch_id=issue.branch_id,
                issue_code=issue.issue_code,
                title=issue.title,
                risk_level=issue.risk_level,
                status=issue.status,
                description=issue.description,
                basis_rule=issue.basis_rule,
                appeal_deadline=_parse_date(issue.appeal_deadline),
                validity=issue.validity,
            ),
        )

    for confirmation in issue_store.confirmations.values():
        rows_by_model[FactConfirmationModel].append(
            FactConfirmationModel(
                **_audit(),
                confirmation_id=confirmation.confirmation_id,
                issue_id=confirmation.issue_id,
                branch_id=confirmation.branch_id,
                decision=confirmation.decision,
                comment=confirmation.comment,
                confirmed_by_ref=confirmation.confirmed_by,
                confirmed_by_snapshot=confirmation.confirmed_by_snapshot,
                branch_snapshot=confirmation.branch_snapshot,
                confirmed_at_ref=_parse_datetime(confirmation.confirmed_at),
            ),
        )
    for appeal in issue_store.appeals.values():
        rows_by_model[IssueAppealModel].append(
            IssueAppealModel(
                **_audit(),
                appeal_id=appeal.appeal_id,
                issue_id=appeal.issue_id,
                branch_id=appeal.branch_id,
                branch_snapshot=appeal.branch_snapshot,
                reason=appeal.reason,
                file_ids=appeal.file_ids,
                status=appeal.status,
                submitted_by_ref=appeal.submitted_by,
                submitted_by_snapshot=appeal.submitted_by_snapshot,
                submitted_at_ref=_parse_datetime(appeal.submitted_at),
            ),
        )
    for decision in issue_store.decisions.values():
        rows_by_model[AdjudicationDecisionModel].append(
            AdjudicationDecisionModel(
                **_audit(),
                decision_id=decision.decision_id,
                appeal_id=decision.appeal_id,
                decision=decision.decision,
                decision_reason=decision.decision_reason,
                decided_by_ref=decision.decided_by,
                decided_by_snapshot=decision.decided_by_snapshot,
                decided_at_ref=_parse_datetime(decision.decided_at),
            ),
        )

    for issue in rectification_store.issues.values():
        rows_by_model[ComplianceIssueModel].append(
            ComplianceIssueModel(
                **_audit(),
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
                status=issue.status,
                discovery_date=_parse_date(issue.discovery_date),
                sla_deadline=_parse_date(issue.sla_deadline),
                description=issue.description,
                rectification_advice=issue.rectification_advice,
                basis_rule=issue.basis_rule,
            ),
        )
    for rectification in rectification_store.rectifications.values():
        rows_by_model[RectificationRecordModel].append(
            RectificationRecordModel(
                **_audit(),
                rectification_id=rectification.rectification_id,
                source_issue_id=rectification.source_issue_id,
                responsible_org_id=rectification.responsible_org_id,
                issue_description=rectification.issue_description,
                rectification_goal=rectification.rectification_goal,
                risk_level=rectification.risk_level,
                due_date=_parse_date(rectification.due_date),
                status=rectification.status,
                extension=rectification.extension,
                hq_reject_reason=rectification.hq_reject_reason,
            ),
        )

    rows_by_model[AssessmentFoundationFixtureModel].append(
        AssessmentFoundationFixtureModel(
            **_audit(),
            fixture_id="P1-FOUNDATION-FIXTURE-001",
            fixture_kind="ASSESSMENT_SHARED_FOUNDATION",
            org_id="WLZQ-RBC-GZ-NANSHA",
            user_id="USER-BRANCH-COMP-001",
            unified_task_id="TASK-HQ-ASSESSMENT-001",
            file_id=None,
            contract_ref="AC-P1-FOUNDATION-001",
            fixture_metadata={
                "reusesP0": ["OrgNode", "AuthUser", "UnifiedTask"],
                "fileAssetPolicy": (
                    "P1 evidence/appeal slices must bind existing /api/files fileIds."
                ),
                "deferredBusinessSlices": ["P1-02", "P1-03", "P1-04", "P1-05", "P1-06", "P1-07"],
            },
            fixture_created_at=_parse_datetime(relative_datetime_iso()),
        ),
    )

    return tuple(
        SeedTable(model=model, rows=tuple(rows_by_model[model])) for model in INSERT_MODEL_ORDER
    )


async def reset_and_seed(session: AsyncSession) -> dict[str, Any]:
    tables = build_runtime_seed_tables()
    await clear_seed_tables(session)
    for table in tables:
        session.add_all(table.rows)
        await session.flush()
    for indicator in indicator_store.indicators.values():
        if not indicator.active_version_id:
            continue
        await session.execute(
            update(AssessmentIndicatorModel)
            .where(AssessmentIndicatorModel.indicator_id == indicator.indicator_id)
            .values(active_version_id=indicator.active_version_id),
        )
    await session.flush()
    await session.commit()
    return seed_summary(tables)


async def clear_seed_tables(session: AsyncSession) -> None:
    bind = session.get_bind()
    dialect_name = bind.dialect.name
    if dialect_name == "postgresql":
        table_names = ", ".join(f'"{model.__table__.name}"' for model in INSERT_MODEL_ORDER)
        await session.execute(text(f"TRUNCATE TABLE {table_names} RESTART IDENTITY CASCADE"))
        return

    if dialect_name == "sqlite":
        await session.execute(text("PRAGMA foreign_keys=OFF"))

    for model in CLEAR_MODEL_ORDER:
        await session.execute(delete(model))

    if dialect_name == "sqlite":
        await session.execute(text("PRAGMA foreign_keys=ON"))


async def seed_database(database_url: str | None = None) -> dict[str, Any]:
    url = database_url or get_settings().database_url
    engine = create_async_engine(url, pool_pre_ping=True)
    try:
        async with AsyncSession(engine, expire_on_commit=False) as session:
            return await reset_and_seed(session)
    finally:
        await engine.dispose()


def seed_summary(tables: tuple[SeedTable, ...] | None = None) -> dict[str, Any]:
    resolved_tables = tables or build_runtime_seed_tables()
    row_counts = {table.table_name: len(table.rows) for table in resolved_tables}
    demo_accounts = [
        {"username": user.username, "userId": user.user_id, "orgId": user.org_id}
        for user in auth_store.users.values()
        if user.username != "disabled.user"
    ]
    return {
        "schemaVersion": 1,
        "seedBaseDate": seed_base_date().isoformat(),
        "generatedAt": relative_datetime_iso(),
        "tableRowCounts": row_counts,
        "totalRows": sum(row_counts.values()),
        "demoAccounts": sorted(demo_accounts, key=lambda item: item["username"]),
    }


def reset_in_memory_seed_stores() -> None:
    auth_store.reset()
    indicator_store.reset()
    scheme_store.reset()
    notification_store.reset()
    task_store.reset()
    cycle_store.reset()
    reporting_store.reset()
    result_store.reset()
    inspection_plan_store.reset()
    inspection_report_store.reset()
    evidence_store.reset()
    issue_store.reset()
    issue_project_store.reset()
    rectification_store.reset()
    workflow_template_store.reset()
    assessment_simulation_store.reset()
    data_cockpit_store.reset()


def _audit(
    created_by: str = SEED_CREATED_BY,
    updated_by: str = SEED_CREATED_BY,
) -> dict[str, Any]:
    now = _parse_datetime(relative_datetime_iso())
    return {
        "created_by": created_by,
        "updated_by": updated_by,
        "created_at": now,
        "updated_at": now,
        "is_deleted": False,
        "deleted_at": None,
        "deleted_by": None,
    }


def _parse_date(raw: str | date) -> date:
    if isinstance(raw, date):
        return raw
    return date.fromisoformat(raw)


def _parse_datetime(raw: str | datetime) -> datetime:
    if isinstance(raw, datetime):
        return raw
    if raw.endswith("Z"):
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    parsed = datetime.fromisoformat(raw)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed
