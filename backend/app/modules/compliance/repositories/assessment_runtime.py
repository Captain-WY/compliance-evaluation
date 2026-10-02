from __future__ import annotations

from collections.abc import Iterable
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.compliance.domain.cycle_store import (
    AssessmentCycleRecord,
    CycleTargetRecord,
    DispatchEventRecord,
    ReportingTaskRecord,
    cycle_store,
)
from app.modules.compliance.domain.indicator_store import (
    EvidenceTemplateRecord,
    IndicatorRecord,
    IndicatorVariableRecord,
    IndicatorVersionRecord,
    ScoringRuleRecord,
    indicator_store,
)
from app.modules.compliance.domain.reporting_store import (
    ResponseEvidenceRecord,
    ResponseItemRecord,
    reporting_store,
)
from app.modules.compliance.domain.result_store import (
    RecordArchiveRecord,
    ResultConfirmationRecord,
    ResultItemRecord,
    ResultRecord,
    ScoreAppealAttachmentRecord,
    ScoreAppealItemRecord,
    ScoreAppealRecord,
    result_store,
)
from app.modules.compliance.domain.review_store import (
    AIInsightSnapshotRecord,
    ReviewDecisionRecord,
    ReviewItemRecord,
    ReviewTaskRecord,
    ScoreAdjustmentRecord,
    review_store,
)
from app.modules.compliance.domain.scheme_store import (
    AssessmentSchemeRecord,
    GradeThresholdRecord,
    SchemeCommandRecord,
    SchemeItemRecord,
    TargetGroupMemberRecord,
    TargetGroupRecord,
    VolumeAdjustmentFactorRecord,
    scheme_store,
)
from app.modules.compliance.domain.task_store import UnifiedTaskActionTargetRecord, UnifiedTaskRecord, task_store
from app.modules.compliance.models import (
    AssessmentAIInsightSnapshotModel,
    AssessmentCycleModel,
    AssessmentCycleTargetModel,
    AssessmentDispatchEventModel,
    AssessmentEvidenceTemplateModel,
    AssessmentGradeThresholdModel,
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
    AssessmentSchemeCommandKeyModel,
    AssessmentSchemeItemModel,
    AssessmentSchemeModel,
    AssessmentScoreAdjustmentModel,
    AssessmentScoreAppealAttachmentModel,
    AssessmentScoreAppealItemModel,
    AssessmentScoreAppealModel,
    AssessmentTargetGroupMemberModel,
    AssessmentTargetGroupModel,
    AssessmentVolumeAdjustmentFactorModel,
    IndicatorVariableModel,
    IndicatorVersionModel,
    QualitativeRubricItemModel,
    ScoringRuleBandModel,
    ScoringRuleModel,
    UnifiedTaskModel,
)
from app.modules.compliance.repositories.task_runtime import task_runtime_repository


class AssessmentRuntimeRepository:
    """Bridge the existing P1 domain stores to the SQLAlchemy runtime schema.

    P1-02 through P1-04 originally kept the rich validation/state logic in small
    synchronous stores. This repository deliberately preserves those rules while
    making the database the restart boundary in runtime mode.
    """

    async def hydrate_indicator_store(self, session: AsyncSession) -> None:
        rows = await self._indicator_rows(session)
        if not rows["indicators"]:
            return
        indicator_store.indicators = self.indicator_records_from_rows(**rows)

    async def hydrate_scheme_store(self, session: AsyncSession) -> None:
        await self.hydrate_indicator_store(session)
        rows = await self._scheme_rows(session)
        if not rows["schemes"]:
            return
        scheme_store.schemes = self.scheme_records_from_rows(**rows)
        scheme_store.command_keys = self.scheme_command_records_from_rows(rows["command_keys"])

    async def hydrate_cycle_store(self, session: AsyncSession) -> None:
        await self.hydrate_scheme_store(session)
        rows = await self._cycle_rows(session)
        if not rows["cycles"]:
            return
        cycle_store.cycles = self.cycle_records_from_rows(**rows)
        reporting_store.response_items = self.response_records_from_rows(
            response_items=rows["response_items"],
            response_evidence=rows["response_evidence"],
        )
        review_store.review_tasks = self.review_records_from_rows(
            review_tasks=rows["review_tasks"],
            review_items=rows["review_items"],
            score_adjustments=rows["score_adjustments"],
            review_decisions=rows["review_decisions"],
            ai_insight_snapshots=rows["ai_insight_snapshots"],
        )
        result_store.results = self.result_records_from_rows(
            results=rows["results"],
            result_items=rows["result_items"],
            result_confirmations=rows["result_confirmations"],
            score_appeals=rows["score_appeals"],
            score_appeal_items=rows["score_appeal_items"],
            score_appeal_attachments=rows["score_appeal_attachments"],
            record_archives=rows["record_archives"],
        )
        self._hydrate_assessment_tasks(rows["tasks"])

    async def save_indicator(self, session: AsyncSession, indicator_id: str) -> None:
        indicator = indicator_store.indicators[indicator_id]
        await self._delete_indicator_children(session, indicator)
        for row in self.indicator_model_rows(indicator):
            await session.merge(row)
        await session.flush()

    async def save_scheme(self, session: AsyncSession, scheme_id: str) -> None:
        scheme = scheme_store.schemes[scheme_id]
        await self._delete_scheme_children(session, scheme_id)
        for row in self.scheme_model_rows(scheme):
            await session.merge(row)
        await session.flush()

    async def delete_scheme(self, session: AsyncSession, scheme_id: str) -> None:
        await self._delete_scheme_children(session, scheme_id)
        await session.execute(
            delete(AssessmentSchemeModel).where(AssessmentSchemeModel.scheme_id == scheme_id),
        )
        await session.flush()

    async def save_scheme_command_keys(self, session: AsyncSession) -> None:
        for row in self.scheme_command_model_rows(scheme_store.command_keys.values()):
            await session.merge(row)
        await session.flush()

    async def save_cycle(self, session: AsyncSession, cycle_id: str) -> None:
        cycle = cycle_store.cycles[cycle_id]
        await self._delete_cycle_result_children(session, cycle)
        await self._delete_cycle_review_children(session, cycle)
        await self._delete_stale_cycle_review_rows(session, cycle)
        await self._delete_cycle_response_evidence(session, cycle)
        cycle_rows = self.cycle_model_rows(cycle)
        reporting_rows = [
            row for row in cycle_rows if isinstance(row, AssessmentReportingTaskModel)
        ]
        for row in cycle_rows:
            if isinstance(row, AssessmentReportingTaskModel):
                continue
            await session.merge(row)
        for row in self.unified_task_model_rows(cycle):
            await session.merge(row)
        for row in reporting_rows:
            await session.merge(row)
        for row in self.response_model_rows(cycle):
            await session.merge(row)
        for row in self.review_task_model_rows(cycle):
            await session.merge(row)
        for row in self.result_model_rows(cycle):
            await session.merge(row)
        await session.flush()

    async def _indicator_rows(self, session: AsyncSession) -> dict[str, list[Any]]:
        return {
            "indicators": list(
                (
                    await session.scalars(
                        select(AssessmentIndicatorModel).where(
                            AssessmentIndicatorModel.is_deleted.is_(False),
                        ),
                    )
                ).all(),
            ),
            "versions": list(
                (
                    await session.scalars(
                        select(IndicatorVersionModel).where(
                            IndicatorVersionModel.is_deleted.is_(False),
                        ),
                    )
                ).all(),
            ),
            "variables": list(
                (
                    await session.scalars(
                        select(IndicatorVariableModel).where(
                            IndicatorVariableModel.is_deleted.is_(False),
                        ),
                    )
                ).all(),
            ),
            "rules": list(
                (
                    await session.scalars(
                        select(ScoringRuleModel).where(ScoringRuleModel.is_deleted.is_(False)),
                    )
                ).all(),
            ),
            "bands": list(
                (
                    await session.scalars(
                        select(ScoringRuleBandModel).where(
                            ScoringRuleBandModel.is_deleted.is_(False),
                        ),
                    )
                ).all(),
            ),
            "rubrics": list(
                (
                    await session.scalars(
                        select(QualitativeRubricItemModel).where(
                            QualitativeRubricItemModel.is_deleted.is_(False),
                        ),
                    )
                ).all(),
            ),
            "templates": list(
                (
                    await session.scalars(
                        select(AssessmentEvidenceTemplateModel).where(
                            AssessmentEvidenceTemplateModel.is_deleted.is_(False),
                        ),
                    )
                ).all(),
            ),
        }

    async def _scheme_rows(self, session: AsyncSession) -> dict[str, list[Any]]:
        return {
            "schemes": list(
                (
                    await session.scalars(
                        select(AssessmentSchemeModel).where(
                            AssessmentSchemeModel.is_deleted.is_(False),
                        ),
                    )
                ).all(),
            ),
            "items": list(
                (
                    await session.scalars(
                        select(AssessmentSchemeItemModel).where(
                            AssessmentSchemeItemModel.is_deleted.is_(False),
                        ),
                    )
                ).all(),
            ),
            "thresholds": list(
                (
                    await session.scalars(
                        select(AssessmentGradeThresholdModel).where(
                            AssessmentGradeThresholdModel.is_deleted.is_(False),
                        ),
                    )
                ).all(),
            ),
            "factors": list(
                (
                    await session.scalars(
                        select(AssessmentVolumeAdjustmentFactorModel).where(
                            AssessmentVolumeAdjustmentFactorModel.is_deleted.is_(False),
                        ),
                    )
                ).all(),
            ),
            "groups": list(
                (
                    await session.scalars(
                        select(AssessmentTargetGroupModel).where(
                            AssessmentTargetGroupModel.is_deleted.is_(False),
                        ),
                    )
                ).all(),
            ),
            "members": list(
                (
                    await session.scalars(
                        select(AssessmentTargetGroupMemberModel).where(
                            AssessmentTargetGroupMemberModel.is_deleted.is_(False),
                        ),
                    )
                ).all(),
            ),
            "command_keys": list(
                (
                    await session.scalars(
                        select(AssessmentSchemeCommandKeyModel).where(
                            AssessmentSchemeCommandKeyModel.is_deleted.is_(False),
                        ),
                    )
                ).all(),
            ),
        }

    async def _cycle_rows(self, session: AsyncSession) -> dict[str, list[Any]]:
        return {
            "cycles": list(
                (
                    await session.scalars(
                        select(AssessmentCycleModel).where(
                            AssessmentCycleModel.is_deleted.is_(False),
                        ),
                    )
                ).all(),
            ),
            "targets": list(
                (
                    await session.scalars(
                        select(AssessmentCycleTargetModel).where(
                            AssessmentCycleTargetModel.is_deleted.is_(False),
                        ),
                    )
                ).all(),
            ),
            "events": list(
                (
                    await session.scalars(
                        select(AssessmentDispatchEventModel).where(
                            AssessmentDispatchEventModel.is_deleted.is_(False),
                        ),
                    )
                ).all(),
            ),
            "reporting_tasks": list(
                (
                    await session.scalars(
                        select(AssessmentReportingTaskModel).where(
                            AssessmentReportingTaskModel.is_deleted.is_(False),
                        ),
                    )
                ).all(),
            ),
            "response_items": list(
                (
                    await session.scalars(
                        select(AssessmentResponseItemModel).where(
                            AssessmentResponseItemModel.is_deleted.is_(False),
                        ),
                    )
                ).all(),
            ),
            "response_evidence": list(
                (
                    await session.scalars(
                        select(AssessmentResponseEvidenceModel).where(
                            AssessmentResponseEvidenceModel.is_deleted.is_(False),
                        ),
                    )
                ).all(),
            ),
            "review_tasks": list(
                (
                    await session.scalars(
                        select(AssessmentReviewTaskModel).where(
                            AssessmentReviewTaskModel.is_deleted.is_(False),
                        ),
                    )
                ).all(),
            ),
            "review_items": list(
                (
                    await session.scalars(
                        select(AssessmentReviewItemModel).where(
                            AssessmentReviewItemModel.is_deleted.is_(False),
                        ),
                    )
                ).all(),
            ),
            "score_adjustments": list(
                (
                    await session.scalars(
                        select(AssessmentScoreAdjustmentModel).where(
                            AssessmentScoreAdjustmentModel.is_deleted.is_(False),
                        ),
                    )
                ).all(),
            ),
            "review_decisions": list(
                (
                    await session.scalars(
                        select(AssessmentReviewDecisionModel).where(
                            AssessmentReviewDecisionModel.is_deleted.is_(False),
                        ),
                    )
                ).all(),
            ),
            "ai_insight_snapshots": list(
                (
                    await session.scalars(
                        select(AssessmentAIInsightSnapshotModel).where(
                            AssessmentAIInsightSnapshotModel.is_deleted.is_(False),
                        ),
                    )
                ).all(),
            ),
            "results": list(
                (
                    await session.scalars(
                        select(AssessmentResultModel).where(
                            AssessmentResultModel.is_deleted.is_(False),
                        ),
                    )
                ).all(),
            ),
            "result_items": list(
                (
                    await session.scalars(
                        select(AssessmentResultItemModel).where(
                            AssessmentResultItemModel.is_deleted.is_(False),
                        ),
                    )
                ).all(),
            ),
            "result_confirmations": list(
                (
                    await session.scalars(
                        select(AssessmentResultConfirmationModel).where(
                            AssessmentResultConfirmationModel.is_deleted.is_(False),
                        ),
                    )
                ).all(),
            ),
            "score_appeals": list(
                (
                    await session.scalars(
                        select(AssessmentScoreAppealModel).where(
                            AssessmentScoreAppealModel.is_deleted.is_(False),
                        ),
                    )
                ).all(),
            ),
            "score_appeal_items": list(
                (
                    await session.scalars(
                        select(AssessmentScoreAppealItemModel).where(
                            AssessmentScoreAppealItemModel.is_deleted.is_(False),
                        ),
                    )
                ).all(),
            ),
            "score_appeal_attachments": list(
                (
                    await session.scalars(
                        select(AssessmentScoreAppealAttachmentModel).where(
                            AssessmentScoreAppealAttachmentModel.is_deleted.is_(False),
                        ),
                    )
                ).all(),
            ),
            "record_archives": list(
                (
                    await session.scalars(
                        select(AssessmentRecordArchiveModel).where(
                            AssessmentRecordArchiveModel.is_deleted.is_(False),
                        ),
                    )
                ).all(),
            ),
            "tasks": list(
                (
                    await session.scalars(
                        select(UnifiedTaskModel).where(
                            UnifiedTaskModel.is_deleted.is_(False),
                            UnifiedTaskModel.category == "ASSESSMENT",
                        ),
                    )
                ).all(),
            ),
        }

    def indicator_records_from_rows(
        self,
        *,
        indicators: Iterable[AssessmentIndicatorModel],
        versions: Iterable[IndicatorVersionModel],
        variables: Iterable[IndicatorVariableModel],
        rules: Iterable[ScoringRuleModel],
        bands: Iterable[ScoringRuleBandModel],
        rubrics: Iterable[QualitativeRubricItemModel],
        templates: Iterable[AssessmentEvidenceTemplateModel],
    ) -> dict[str, IndicatorRecord]:
        variables_by_version = _group_by(variables, "version_id")
        rules_by_version = {row.version_id: row for row in rules}
        bands_by_rule = _group_by(bands, "scoring_rule_id")
        rubrics_by_rule = _group_by(rubrics, "scoring_rule_id")
        templates_by_version = _group_by(templates, "version_id")
        versions_by_indicator = _group_by(versions, "indicator_id")
        records: dict[str, IndicatorRecord] = {}
        for row in indicators:
            record = IndicatorRecord(
                indicator_id=row.indicator_id,
                indicator_code=row.indicator_code,
                indicator_name=row.indicator_name,
                category_id=row.category_id,
                business_line=row.business_line,
                data_type=row.data_type,
                value_type=row.value_type,
                input_mode=row.input_mode,
                data_source_mode=row.data_source_mode,
                description=row.description,
                created_by_ref=row.created_by or "SYSTEM-SEED",
                created_at=_iso(row.created_at),
                active_version_id=row.active_version_id,
                versions={},
            )
            for version_row in sorted(
                versions_by_indicator.get(row.indicator_id, []),
                key=lambda item: item.version_no,
            ):
                rule_row = rules_by_version.get(version_row.version_id)
                scoring_rule = None
                if rule_row is not None:
                    scoring_rule = ScoringRuleRecord(
                        scoring_rule_id=rule_row.scoring_rule_id,
                        rule_type=rule_row.rule_type,
                        effect=rule_row.effect,
                        expression=rule_row.expression,
                        bands=[
                            {
                                "minValue": _float_or_none(band.min_value),
                                "maxValue": _float_or_none(band.max_value),
                                "score": _float(band.score),
                            }
                            for band in sorted(
                                bands_by_rule.get(rule_row.scoring_rule_id, []),
                                key=lambda item: item.sort_order,
                            )
                        ],
                        rubrics=[
                            {
                                "itemCode": rubric.item_code,
                                "itemLabel": rubric.item_label,
                                "score": _float(rubric.score),
                            }
                            for rubric in sorted(
                                rubrics_by_rule.get(rule_row.scoring_rule_id, []),
                                key=lambda item: item.sort_order,
                            )
                        ],
                        require_continuous_bands=rule_row.require_continuous_bands,
                        validation_status=rule_row.validation_status,
                        validation_errors=rule_row.validation_errors,
                    )
                version = IndicatorVersionRecord(
                    version_id=version_row.version_id,
                    indicator_id=version_row.indicator_id,
                    version_no=version_row.version_no,
                    status=version_row.status,
                    weight_default=_float(version_row.weight_default),
                    max_score=_float(version_row.max_score),
                    variables=[
                        IndicatorVariableRecord(
                            variable_id=item.variable_id,
                            variable_code=item.variable_code,
                            variable_name=item.variable_name,
                            value_type=item.value_type,
                            required=item.required,
                        )
                        for item in sorted(
                            variables_by_version.get(version_row.version_id, []),
                            key=lambda item: item.variable_id,
                        )
                    ],
                    scoring_rule=scoring_rule,
                    evidence_templates=[
                        EvidenceTemplateRecord(
                            evidence_template_id=item.evidence_template_id,
                            template_name=item.template_name,
                            required=item.required,
                            accepted_file_tags=list(item.accepted_file_tags),
                            description=item.description,
                        )
                        for item in sorted(
                            templates_by_version.get(version_row.version_id, []),
                            key=lambda item: item.evidence_template_id,
                        )
                    ],
                    scoring_validation_status=version_row.scoring_validation_status,
                    validation_errors=version_row.validation_errors,
                    published_by_ref=version_row.published_by_ref,
                    published_at_ref=_iso_or_none(version_row.published_at_ref),
                    archived_reason=version_row.archived_reason,
                    core_snapshot=version_row.core_snapshot,
                )
                record.versions[version.version_id] = version
            records[record.indicator_id] = record
        return records

    def response_records_from_rows(
        self,
        *,
        response_items: Iterable[AssessmentResponseItemModel],
        response_evidence: Iterable[AssessmentResponseEvidenceModel],
    ) -> dict[str, ResponseItemRecord]:
        evidence_by_item = _group_by(response_evidence, "response_item_id")
        return {
            row.response_item_id: ResponseItemRecord(
                response_item_id=row.response_item_id,
                reporting_task_id=row.reporting_task_id,
                indicator_id=row.indicator_id,
                version_id=row.version_id,
                indicator_snapshot=self._indicator_snapshot_for_response(row),
                required_evidence=row.required_evidence,
                response_value=row.response_value,
                comment=row.comment,
                validation_status=row.validation_status,
                source_ledger_entry_id=row.source_ledger_entry_id,
                evidence={
                    item.file_id: ResponseEvidenceRecord(
                        response_evidence_id=item.response_evidence_id,
                        response_item_id=item.response_item_id,
                        reporting_task_id=item.reporting_task_id,
                        file_id=item.file_id,
                        bound_by_ref=item.bound_by_ref,
                        bound_at_ref=_iso(item.bound_at_ref),
                    )
                    for item in sorted(
                        evidence_by_item.get(row.response_item_id, []),
                        key=lambda item: item.response_evidence_id,
                    )
                },
            )
            for row in sorted(response_items, key=lambda item: item.response_item_id)
        }

    def review_records_from_rows(
        self,
        *,
        review_tasks: Iterable[AssessmentReviewTaskModel],
        review_items: Iterable[AssessmentReviewItemModel],
        score_adjustments: Iterable[AssessmentScoreAdjustmentModel],
        review_decisions: Iterable[AssessmentReviewDecisionModel],
        ai_insight_snapshots: Iterable[AssessmentAIInsightSnapshotModel],
    ) -> dict[str, ReviewTaskRecord]:
        items_by_task = _group_by(review_items, "review_task_id")
        adjustments_by_task = _group_by(score_adjustments, "review_task_id")
        decisions_by_task = _group_by(review_decisions, "review_task_id")
        snapshots_by_task = _group_by(ai_insight_snapshots, "review_task_id")
        records: dict[str, ReviewTaskRecord] = {}
        for row in sorted(review_tasks, key=lambda item: item.review_task_id):
            record = ReviewTaskRecord(
                review_task_id=row.review_task_id,
                cycle_id=row.cycle_id,
                cycle_target_id=row.cycle_target_id,
                reporting_task_id=row.reporting_task_id,
                assignee_user_id=row.assignee_user_id,
                unified_task_id=row.unified_task_id,
                status=row.status,
                started_at_ref=_iso_or_none(row.started_at_ref),
                completed_at_ref=_iso_or_none(row.completed_at_ref),
            )
            record.items = {
                item.review_item_id: ReviewItemRecord(
                    review_item_id=item.review_item_id,
                    review_task_id=item.review_task_id,
                    response_item_id=item.response_item_id,
                    indicator_id=item.indicator_id,
                    version_id=item.version_id,
                    preliminary_score=_float_or_none(item.preliminary_score),
                    final_score=_float_or_none(item.final_score),
                    comment=item.comment,
                    status=item.status,
                )
                for item in sorted(
                    items_by_task.get(row.review_task_id, []),
                    key=lambda item: item.review_item_id,
                )
            }
            record.adjustments = {
                item.adjustment_id: ScoreAdjustmentRecord(
                    adjustment_id=item.adjustment_id,
                    review_task_id=item.review_task_id,
                    review_item_id=item.review_item_id,
                    adjustment_type=item.adjustment_type,
                    score_delta=_float(item.score_delta),
                    reason=item.reason,
                    created_by_ref=item.created_by_ref,
                    created_at_ref=_iso(item.created_at_ref),
                )
                for item in sorted(
                    adjustments_by_task.get(row.review_task_id, []),
                    key=lambda item: item.adjustment_id,
                )
            }
            record.decisions = [
                ReviewDecisionRecord(
                    decision_id=item.decision_id,
                    review_task_id=item.review_task_id,
                    decision=item.decision,
                    decision_reason=item.decision_reason,
                    decided_by_ref=item.decided_by_ref,
                    decided_at_ref=_iso(item.decided_at_ref),
                )
                for item in sorted(
                    decisions_by_task.get(row.review_task_id, []),
                    key=lambda item: item.decision_id,
                )
            ]
            record.ai_insight_snapshots = [
                AIInsightSnapshotRecord(
                    insight_snapshot_id=item.insight_snapshot_id,
                    review_task_id=item.review_task_id,
                    provider=item.provider,
                    model=item.model,
                    summary=item.summary,
                    payload=item.payload,
                    created_by_ref=item.created_by_ref,
                    created_at_ref=_iso(item.created_at_ref),
                )
                for item in sorted(
                    snapshots_by_task.get(row.review_task_id, []),
                    key=lambda item: item.insight_snapshot_id,
                )
            ]
            records[record.review_task_id] = record
        return records

    def result_records_from_rows(
        self,
        *,
        results: Iterable[AssessmentResultModel],
        result_items: Iterable[AssessmentResultItemModel],
        result_confirmations: Iterable[AssessmentResultConfirmationModel],
        score_appeals: Iterable[AssessmentScoreAppealModel],
        score_appeal_items: Iterable[AssessmentScoreAppealItemModel],
        score_appeal_attachments: Iterable[AssessmentScoreAppealAttachmentModel],
        record_archives: Iterable[AssessmentRecordArchiveModel],
    ) -> dict[str, ResultRecord]:
        items_by_result = _group_by(result_items, "result_id")
        confirmations_by_result = _group_by(result_confirmations, "result_id")
        appeals_by_result = _group_by(score_appeals, "result_id")
        appeal_items_by_appeal = _group_by(score_appeal_items, "score_appeal_id")
        attachments_by_appeal = _group_by(score_appeal_attachments, "score_appeal_id")
        archives_by_result = _group_by(record_archives, "result_id")
        records: dict[str, ResultRecord] = {}
        for row in sorted(results, key=lambda item: item.result_id):
            record = ResultRecord(
                result_id=row.result_id,
                cycle_id=row.cycle_id,
                cycle_target_id=row.cycle_target_id,
                target_org_id=row.target_org_id,
                review_task_id=row.review_task_id,
                status=row.status,
                confirmation_status=row.confirmation_status,
                total_score=_float(row.total_score),
                grade_code=row.grade_code,
                confirmation_deadline=_iso(row.confirmation_deadline),
                generated_by_ref=row.generated_by_ref,
                generated_at_ref=_iso(row.generated_at_ref),
                published_by_ref=row.published_by_ref,
                published_at_ref=_iso_or_none(row.published_at_ref),
                finalized_by_ref=row.finalized_by_ref,
                finalized_at_ref=_iso_or_none(row.finalized_at_ref),
            )
            record.items = {
                item.result_item_id: ResultItemRecord(
                    result_item_id=item.result_item_id,
                    result_id=item.result_id,
                    review_item_id=item.review_item_id,
                    indicator_id=item.indicator_id,
                    version_id=item.version_id,
                    original_score=_float(item.original_score),
                    final_score=_float(item.final_score),
                    appeal_status=item.appeal_status,
                )
                for item in sorted(
                    items_by_result.get(row.result_id, []),
                    key=lambda item: item.result_item_id,
                )
            }
            record.confirmations = [
                ResultConfirmationRecord(
                    confirmation_id=item.confirmation_id,
                    result_id=item.result_id,
                    decision=item.decision,
                    comment=item.comment,
                    confirmed_by_ref=item.confirmed_by_ref,
                    confirmed_at_ref=_iso(item.confirmed_at_ref),
                )
                for item in sorted(
                    confirmations_by_result.get(row.result_id, []),
                    key=lambda item: item.confirmation_id,
                )
            ]
            record.appeals = {
                appeal.score_appeal_id: ScoreAppealRecord(
                    score_appeal_id=appeal.score_appeal_id,
                    result_id=appeal.result_id,
                    target_org_id=appeal.target_org_id,
                    status=appeal.status,
                    reason=appeal.reason,
                    submitted_by_ref=appeal.submitted_by_ref,
                    submitted_at_ref=_iso(appeal.submitted_at_ref),
                    decided_by_ref=appeal.decided_by_ref,
                    decided_at_ref=_iso_or_none(appeal.decided_at_ref),
                    decision=appeal.decision,
                    decision_reason=appeal.decision_reason,
                    items={
                        item.score_appeal_item_id: ScoreAppealItemRecord(
                            score_appeal_item_id=item.score_appeal_item_id,
                            score_appeal_id=item.score_appeal_id,
                            result_item_id=item.result_item_id,
                            requested_score=_float_or_none(item.requested_score),
                            adopted_score=_float_or_none(item.adopted_score),
                            reason=item.reason,
                        )
                        for item in sorted(
                            appeal_items_by_appeal.get(appeal.score_appeal_id, []),
                            key=lambda item: item.score_appeal_item_id,
                        )
                    },
                    attachments={
                        item.file_id: ScoreAppealAttachmentRecord(
                            score_appeal_attachment_id=item.score_appeal_attachment_id,
                            score_appeal_id=item.score_appeal_id,
                            file_id=item.file_id,
                            bound_by_ref=item.bound_by_ref,
                            bound_at_ref=_iso(item.bound_at_ref),
                        )
                        for item in sorted(
                            attachments_by_appeal.get(appeal.score_appeal_id, []),
                            key=lambda item: item.score_appeal_attachment_id,
                        )
                    },
                )
                for appeal in sorted(
                    appeals_by_result.get(row.result_id, []),
                    key=lambda item: item.score_appeal_id,
                )
            }
            record.archives = [
                RecordArchiveRecord(
                    archive_id=item.archive_id,
                    result_id=item.result_id,
                    archive_type=item.archive_type,
                    snapshot=item.snapshot,
                    archived_by_ref=item.archived_by_ref,
                    archived_at_ref=_iso(item.archived_at_ref),
                )
                for item in sorted(
                    archives_by_result.get(row.result_id, []),
                    key=lambda item: item.archive_id,
                )
            ]
            records[record.result_id] = record
        return records

    @staticmethod
    def _indicator_snapshot_for_response(row: AssessmentResponseItemModel) -> dict[str, Any]:
        for cycle in cycle_store.cycles.values():
            if row.reporting_task_id not in cycle.reporting_tasks:
                continue
            for item in cycle.scheme_snapshot.get("items", []):
                if (
                    item.get("indicatorId") == row.indicator_id
                    and item.get("versionId") == row.version_id
                ):
                    return dict(item.get("indicatorSnapshot") or {})
        return {}

    def scheme_records_from_rows(
        self,
        *,
        schemes: Iterable[AssessmentSchemeModel],
        items: Iterable[AssessmentSchemeItemModel],
        thresholds: Iterable[AssessmentGradeThresholdModel],
        factors: Iterable[AssessmentVolumeAdjustmentFactorModel],
        groups: Iterable[AssessmentTargetGroupModel],
        members: Iterable[AssessmentTargetGroupMemberModel],
        command_keys: Iterable[AssessmentSchemeCommandKeyModel] = (),
    ) -> dict[str, AssessmentSchemeRecord]:
        items_by_scheme = _group_by(items, "scheme_id")
        thresholds_by_scheme = _group_by(thresholds, "scheme_id")
        factors_by_scheme = _group_by(factors, "scheme_id")
        groups_by_scheme = _group_by(groups, "scheme_id")
        members_by_group = _group_by(members, "target_group_id")
        records: dict[str, AssessmentSchemeRecord] = {}
        for row in schemes:
            record = AssessmentSchemeRecord(
                scheme_id=row.scheme_id,
                scheme_code=row.scheme_code,
                scheme_name=row.scheme_name,
                year=row.year,
                frequency=row.frequency,
                status=row.status,
                description=row.description,
                total_weight=_float(row.total_weight),
                created_by_ref=row.created_by_ref,
                created_at=_iso(row.created_at),
                items=[
                    SchemeItemRecord(
                        scheme_item_id=item.scheme_item_id,
                        indicator_id=item.indicator_id,
                        version_id=item.version_id,
                        weight=_float(item.weight),
                        score_cap=_float_or_none(item.score_cap),
                        sort_order=item.sort_order,
                        indicator_snapshot=item.indicator_snapshot,
                    )
                    for item in sorted(
                        items_by_scheme.get(row.scheme_id, []),
                        key=lambda item: item.sort_order,
                    )
                ],
                grade_thresholds=[
                    GradeThresholdRecord(
                        threshold_id=item.threshold_id,
                        grade_code=item.grade_code,
                        grade_label=item.grade_label,
                        min_score=_float(item.min_score),
                        max_score=_float_or_none(item.max_score),
                        sort_order=item.sort_order,
                    )
                    for item in sorted(
                        thresholds_by_scheme.get(row.scheme_id, []),
                        key=lambda item: item.sort_order,
                    )
                ],
                volume_adjustment_factors=[
                    VolumeAdjustmentFactorRecord(
                        factor_id=item.factor_id,
                        factor_code=item.factor_code,
                        factor_name=item.factor_name,
                        metric=item.metric,
                        operator=item.operator,
                        value=_float_or_none(item.value),
                        description=item.description,
                        multiplier=_float(item.multiplier),
                        enabled=item.enabled,
                        sort_order=item.sort_order,
                    )
                    for item in sorted(
                        factors_by_scheme.get(row.scheme_id, []),
                        key=lambda item: item.sort_order,
                    )
                ],
                target_groups=[],
                published_by_ref=row.published_by_ref,
                published_at_ref=_iso_or_none(row.published_at_ref),
                archived_reason=row.archived_reason,
                has_been_published=row.has_been_published,
                scheme_snapshot=row.scheme_snapshot,
                optimistic_version=row.optimistic_version,
                source_scheme_id=row.source_scheme_id,
                source_scheme_code=row.source_scheme_code,
                source_trace=row.source_trace,
                workflow_binding=row.workflow_binding,
                schedule_binding=row.schedule_binding,
                command_audit=row.command_audit,
            )
            record.target_groups = [
                TargetGroupRecord(
                    target_group_id=group.target_group_id,
                    group_name=group.group_name,
                    scope_mode=group.scope_mode,
                    description=group.description,
                    sort_order=group.sort_order,
                    members=[
                        TargetGroupMemberRecord(
                            member_id=member.member_id,
                            org_id=member.org_id,
                            org_snapshot=member.org_snapshot,
                            sort_order=member.sort_order,
                        )
                        for member in sorted(
                            members_by_group.get(group.target_group_id, []),
                            key=lambda item: item.sort_order,
                        )
                    ],
                )
                for group in sorted(
                    groups_by_scheme.get(row.scheme_id, []),
                    key=lambda item: item.sort_order,
                )
            ]
            records[record.scheme_id] = record
        return records

    @staticmethod
    def scheme_command_records_from_rows(
        rows: Iterable[AssessmentSchemeCommandKeyModel],
    ) -> dict[tuple[str, str, str, str], SchemeCommandRecord]:
        records: dict[tuple[str, str, str, str], SchemeCommandRecord] = {}
        for row in rows:
            record = SchemeCommandRecord(
                command_key_id=row.command_key_id,
                scheme_scope_id=row.scheme_scope_id,
                command_type=row.command_type,
                actor_user_id=row.actor_user_id,
                idempotency_key=row.idempotency_key,
                payload_hash=row.payload_hash,
                result_ref=row.result_ref,
                result_snapshot=row.result_snapshot,
                created_at=_iso(row.command_created_at),
            )
            records[
                (
                    record.scheme_scope_id,
                    record.command_type,
                    record.actor_user_id,
                    record.idempotency_key,
                )
            ] = record
        return records

    def cycle_records_from_rows(
        self,
        *,
        cycles: Iterable[AssessmentCycleModel],
        targets: Iterable[AssessmentCycleTargetModel],
        events: Iterable[AssessmentDispatchEventModel],
        reporting_tasks: Iterable[AssessmentReportingTaskModel],
        response_items: Iterable[AssessmentResponseItemModel],
        response_evidence: Iterable[AssessmentResponseEvidenceModel],
        review_tasks: Iterable[AssessmentReviewTaskModel],
        review_items: Iterable[AssessmentReviewItemModel],
        score_adjustments: Iterable[AssessmentScoreAdjustmentModel],
        review_decisions: Iterable[AssessmentReviewDecisionModel],
        ai_insight_snapshots: Iterable[AssessmentAIInsightSnapshotModel],
        results: Iterable[AssessmentResultModel],
        result_items: Iterable[AssessmentResultItemModel],
        result_confirmations: Iterable[AssessmentResultConfirmationModel],
        score_appeals: Iterable[AssessmentScoreAppealModel],
        score_appeal_items: Iterable[AssessmentScoreAppealItemModel],
        score_appeal_attachments: Iterable[AssessmentScoreAppealAttachmentModel],
        record_archives: Iterable[AssessmentRecordArchiveModel],
        tasks: Iterable[UnifiedTaskModel],
    ) -> dict[str, AssessmentCycleRecord]:
        del response_items
        del response_evidence
        del review_tasks
        del review_items
        del score_adjustments
        del review_decisions
        del ai_insight_snapshots
        del results
        del result_items
        del result_confirmations
        del score_appeals
        del score_appeal_items
        del score_appeal_attachments
        del record_archives
        del tasks
        targets_by_cycle = _group_by(targets, "cycle_id")
        events_by_cycle = _group_by(events, "cycle_id")
        reporting_by_cycle = _group_by(reporting_tasks, "cycle_id")
        records: dict[str, AssessmentCycleRecord] = {}
        for row in cycles:
            record = AssessmentCycleRecord(
                cycle_id=row.cycle_id,
                cycle_code=row.cycle_code,
                cycle_name=row.cycle_name,
                scheme_id=row.scheme_id,
                scheme_snapshot=row.scheme_snapshot,
                year=row.year,
                period_start=_iso(row.period_start),
                period_end=_iso(row.period_end),
                status=row.status,
                dispatch_mode=row.dispatch_mode,
                selected_target_org_ids=list(row.selected_target_org_ids),
                created_by_ref=row.created_by_ref,
                created_at=_iso(row.created_at),
                dispatched_by_ref=row.dispatched_by_ref,
                dispatched_at_ref=_iso_or_none(row.dispatched_at_ref),
                closed_at_ref=_iso_or_none(row.closed_at_ref),
                archived_reason=row.archived_reason,
                targets={
                    item.cycle_target_id: CycleTargetRecord(
                        cycle_target_id=item.cycle_target_id,
                        cycle_id=item.cycle_id,
                        org_id=item.org_id,
                        org_snapshot=item.org_snapshot,
                        target_status=item.target_status,
                        reporting_task_id=item.reporting_task_id,
                        review_task_id=item.review_task_id,
                        review_status=item.review_status,
                        result_id=item.result_id,
                    )
                    for item in sorted(
                        targets_by_cycle.get(row.cycle_id, []),
                        key=lambda item: item.cycle_target_id,
                    )
                },
                reporting_tasks={
                    item.reporting_task_id: ReportingTaskRecord(
                        reporting_task_id=item.reporting_task_id,
                        cycle_id=item.cycle_id,
                        cycle_target_id=item.cycle_target_id,
                        target_org_id=item.target_org_id,
                        unified_task_id=item.unified_task_id,
                        status=item.status,
                        due_date=_iso(item.due_date),
                    )
                    for item in sorted(
                        reporting_by_cycle.get(row.cycle_id, []),
                        key=lambda item: item.reporting_task_id,
                    )
                },
                dispatch_events=[
                    DispatchEventRecord(
                        dispatch_event_id=item.dispatch_event_id,
                        cycle_id=item.cycle_id,
                        event_type=item.event_type,
                        target_org_ids=list(item.target_org_ids),
                        message=item.message,
                        created_by_ref=item.created_by_ref,
                        event_created_at=_iso(item.event_created_at),
                    )
                    for item in sorted(
                        events_by_cycle.get(row.cycle_id, []),
                        key=lambda item: item.dispatch_event_id,
                    )
                ],
            )
            records[record.cycle_id] = record
        return records

    def indicator_model_rows(self, indicator: IndicatorRecord) -> list[Any]:
        rows: list[Any] = [
            AssessmentIndicatorModel(
                **_audit(indicator.created_by_ref),
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
                active_version_id=indicator.active_version_id,
            ),
        ]
        for version in indicator.versions.values():
            rows.append(
                IndicatorVersionModel(
                    **_audit(indicator.created_by_ref),
                    version_id=version.version_id,
                    indicator_id=indicator.indicator_id,
                    version_no=version.version_no,
                    status=version.status,
                    weight_default=version.weight_default,
                    max_score=version.max_score,
                    scoring_validation_status=version.scoring_validation_status,
                    validation_errors=version.validation_errors,
                    published_by_ref=version.published_by_ref,
                    published_at_ref=_parse_datetime_or_none(version.published_at_ref),
                    archived_reason=version.archived_reason,
                    core_snapshot=version.core_snapshot,
                ),
            )
            rows.extend(
                IndicatorVariableModel(
                    **_audit(indicator.created_by_ref),
                    variable_id=item.variable_id,
                    version_id=version.version_id,
                    variable_code=item.variable_code,
                    variable_name=item.variable_name,
                    value_type=item.value_type,
                    required=item.required,
                )
                for item in version.variables
            )
            if version.scoring_rule:
                rule = version.scoring_rule
                rows.append(
                    ScoringRuleModel(
                        **_audit(indicator.created_by_ref),
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
                rows.extend(
                    ScoringRuleBandModel(
                        **_audit(indicator.created_by_ref),
                        band_id=f"{rule.scoring_rule_id}-BAND-{index:03d}",
                        scoring_rule_id=rule.scoring_rule_id,
                        min_value=item.get("minValue"),
                        max_value=item.get("maxValue"),
                        score=item["score"],
                        sort_order=index,
                    )
                    for index, item in enumerate(rule.bands, start=1)
                )
                rows.extend(
                    QualitativeRubricItemModel(
                        **_audit(indicator.created_by_ref),
                        rubric_item_id=f"{rule.scoring_rule_id}-RUBRIC-{index:03d}",
                        scoring_rule_id=rule.scoring_rule_id,
                        item_code=item["itemCode"],
                        item_label=item["itemLabel"],
                        score=item["score"],
                        sort_order=index,
                    )
                    for index, item in enumerate(rule.rubrics, start=1)
                )
            rows.extend(
                AssessmentEvidenceTemplateModel(
                    **_audit(indicator.created_by_ref),
                    evidence_template_id=item.evidence_template_id,
                    version_id=version.version_id,
                    template_name=item.template_name,
                    required=item.required,
                    accepted_file_tags=item.accepted_file_tags,
                    description=item.description,
                )
                for item in version.evidence_templates
            )
        return rows

    def scheme_model_rows(self, scheme: AssessmentSchemeRecord) -> list[Any]:
        rows: list[Any] = [
            AssessmentSchemeModel(
                **_audit(scheme.created_by_ref),
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
                published_at_ref=_parse_datetime_or_none(scheme.published_at_ref),
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
        ]
        rows.extend(
            AssessmentSchemeItemModel(
                **_audit(scheme.created_by_ref),
                scheme_item_id=item.scheme_item_id,
                scheme_id=scheme.scheme_id,
                indicator_id=item.indicator_id,
                version_id=item.version_id,
                weight=item.weight,
                score_cap=item.score_cap,
                sort_order=item.sort_order,
                indicator_snapshot=item.indicator_snapshot,
            )
            for item in scheme.items
        )
        rows.extend(
            AssessmentGradeThresholdModel(
                **_audit(scheme.created_by_ref),
                threshold_id=item.threshold_id,
                scheme_id=scheme.scheme_id,
                grade_code=item.grade_code,
                grade_label=item.grade_label,
                min_score=item.min_score,
                max_score=item.max_score,
                sort_order=item.sort_order,
            )
            for item in scheme.grade_thresholds
        )
        rows.extend(
            AssessmentVolumeAdjustmentFactorModel(
                **_audit(scheme.created_by_ref),
                factor_id=item.factor_id,
                scheme_id=scheme.scheme_id,
                factor_code=item.factor_code,
                factor_name=item.factor_name,
                metric=item.metric,
                operator=item.operator,
                value=item.value,
                description=item.description,
                multiplier=item.multiplier,
                enabled=item.enabled,
                sort_order=item.sort_order,
            )
            for item in scheme.volume_adjustment_factors
        )
        for group in scheme.target_groups:
            rows.append(
                AssessmentTargetGroupModel(
                    **_audit(scheme.created_by_ref),
                    target_group_id=group.target_group_id,
                    scheme_id=scheme.scheme_id,
                    group_name=group.group_name,
                    scope_mode=group.scope_mode,
                    description=group.description,
                    sort_order=group.sort_order,
                ),
            )
            rows.extend(
                AssessmentTargetGroupMemberModel(
                    **_audit(scheme.created_by_ref),
                    member_id=member.member_id,
                    target_group_id=group.target_group_id,
                    org_id=member.org_id,
                    org_snapshot=member.org_snapshot,
                    sort_order=member.sort_order,
                )
                for member in group.members
            )
        return rows

    @staticmethod
    def scheme_command_model_rows(
        records: Iterable[SchemeCommandRecord],
    ) -> list[AssessmentSchemeCommandKeyModel]:
        return [
            AssessmentSchemeCommandKeyModel(
                **_audit(record.actor_user_id),
                command_key_id=record.command_key_id,
                scheme_scope_id=record.scheme_scope_id,
                command_type=record.command_type,
                actor_user_id=record.actor_user_id,
                idempotency_key=record.idempotency_key,
                payload_hash=record.payload_hash,
                result_ref=record.result_ref,
                result_snapshot=record.result_snapshot,
                command_created_at=_parse_datetime(record.created_at),
            )
            for record in records
        ]

    def cycle_model_rows(self, cycle: AssessmentCycleRecord) -> list[Any]:
        rows: list[Any] = [
            AssessmentCycleModel(
                **_audit(cycle.created_by_ref),
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
                dispatched_at_ref=_parse_datetime_or_none(cycle.dispatched_at_ref),
                closed_at_ref=_parse_datetime_or_none(cycle.closed_at_ref),
                archived_reason=cycle.archived_reason,
            ),
        ]
        rows.extend(
            AssessmentCycleTargetModel(
                **_audit(cycle.created_by_ref),
                cycle_target_id=item.cycle_target_id,
                cycle_id=cycle.cycle_id,
                org_id=item.org_id,
                org_snapshot=item.org_snapshot,
                target_status=item.target_status,
                reporting_task_id=item.reporting_task_id,
                review_task_id=item.review_task_id,
                review_status=item.review_status,
                result_id=item.result_id,
            )
            for item in cycle.targets.values()
        )
        rows.extend(
            AssessmentDispatchEventModel(
                **_audit(item.created_by_ref),
                dispatch_event_id=item.dispatch_event_id,
                cycle_id=cycle.cycle_id,
                event_type=item.event_type,
                target_org_ids=item.target_org_ids,
                message=item.message,
                created_by_ref=item.created_by_ref,
                event_created_at=_parse_datetime(item.event_created_at),
            )
            for item in cycle.dispatch_events
        )
        rows.extend(
            AssessmentReportingTaskModel(
                **_audit(cycle.created_by_ref),
                reporting_task_id=item.reporting_task_id,
                cycle_id=cycle.cycle_id,
                cycle_target_id=item.cycle_target_id,
                target_org_id=item.target_org_id,
                unified_task_id=item.unified_task_id,
                status=item.status,
                due_date=_parse_datetime(item.due_date),
            )
            for item in cycle.reporting_tasks.values()
        )
        return rows

    def unified_task_model_rows(self, cycle: AssessmentCycleRecord) -> list[UnifiedTaskModel]:
        rows: list[UnifiedTaskModel] = []
        task_ids = {
            task.unified_task_id
            for task in cycle.reporting_tasks.values()
            if task.unified_task_id in task_store.tasks
        }
        task_ids.update(
            task.unified_task_id
            for task in review_store.review_tasks.values()
            if task.cycle_id == cycle.cycle_id and task.unified_task_id in task_store.tasks
        )
        for task_id in task_ids:
            task = task_store.tasks[task_id]
            rows.append(task_runtime_repository.record_to_model(task))
        return rows

    def response_model_rows(self, cycle: AssessmentCycleRecord) -> list[Any]:
        reporting_task_ids = set(cycle.reporting_tasks)
        rows: list[Any] = []
        response_items = [
            item
            for item in reporting_store.response_items.values()
            if item.reporting_task_id in reporting_task_ids
        ]
        rows.extend(
            AssessmentResponseItemModel(
                **_audit(),
                response_item_id=item.response_item_id,
                reporting_task_id=item.reporting_task_id,
                indicator_id=item.indicator_id,
                version_id=item.version_id,
                response_value=item.response_value,
                comment=item.comment,
                validation_status=item.validation_status,
                source_ledger_entry_id=item.source_ledger_entry_id,
                required_evidence=item.required_evidence,
            )
            for item in response_items
        )
        for item in response_items:
            rows.extend(
                AssessmentResponseEvidenceModel(
                    **_audit(evidence.bound_by_ref),
                    response_evidence_id=evidence.response_evidence_id,
                    response_item_id=evidence.response_item_id,
                    reporting_task_id=evidence.reporting_task_id,
                    file_id=evidence.file_id,
                    bound_by_ref=evidence.bound_by_ref,
                    bound_at_ref=_parse_datetime(evidence.bound_at_ref),
                )
                for evidence in item.evidence.values()
            )
        return rows

    def review_task_model_rows(self, cycle: AssessmentCycleRecord) -> list[Any]:
        rows: list[Any] = []
        review_tasks = [
            task for task in review_store.review_tasks.values() if task.cycle_id == cycle.cycle_id
        ]
        rows.extend(
            AssessmentReviewTaskModel(
                **_audit(),
                review_task_id=task.review_task_id,
                cycle_id=task.cycle_id,
                cycle_target_id=task.cycle_target_id,
                reporting_task_id=task.reporting_task_id,
                assignee_user_id=task.assignee_user_id,
                unified_task_id=task.unified_task_id,
                status=task.status,
                started_at_ref=_parse_datetime_or_none(task.started_at_ref),
                completed_at_ref=_parse_datetime_or_none(task.completed_at_ref),
            )
            for task in review_tasks
        )
        for task in review_tasks:
            rows.extend(
                AssessmentReviewItemModel(
                    **_audit(),
                    review_item_id=item.review_item_id,
                    review_task_id=item.review_task_id,
                    response_item_id=item.response_item_id,
                    indicator_id=item.indicator_id,
                    version_id=item.version_id,
                    preliminary_score=item.preliminary_score,
                    final_score=item.final_score,
                    comment=item.comment,
                    status=item.status,
                )
                for item in task.items.values()
            )
            rows.extend(
                AssessmentScoreAdjustmentModel(
                    **_audit(item.created_by_ref),
                    adjustment_id=item.adjustment_id,
                    review_task_id=item.review_task_id,
                    review_item_id=item.review_item_id,
                    adjustment_type=item.adjustment_type,
                    score_delta=item.score_delta,
                    reason=item.reason,
                    created_by_ref=item.created_by_ref,
                    created_at_ref=_parse_datetime(item.created_at_ref),
                )
                for item in task.adjustments.values()
            )
            rows.extend(
                AssessmentReviewDecisionModel(
                    **_audit(item.decided_by_ref),
                    decision_id=item.decision_id,
                    review_task_id=item.review_task_id,
                    decision=item.decision,
                    decision_reason=item.decision_reason,
                    decided_by_ref=item.decided_by_ref,
                    decided_at_ref=_parse_datetime(item.decided_at_ref),
                )
                for item in task.decisions
            )
            rows.extend(
                AssessmentAIInsightSnapshotModel(
                    **_audit(item.created_by_ref),
                    insight_snapshot_id=item.insight_snapshot_id,
                    review_task_id=item.review_task_id,
                    provider=item.provider,
                    model=item.model,
                    summary=item.summary,
                    payload=item.payload,
                    created_by_ref=item.created_by_ref,
                    created_at_ref=_parse_datetime(item.created_at_ref),
                )
                for item in task.ai_insight_snapshots
            )
        return rows

    def result_model_rows(self, cycle: AssessmentCycleRecord) -> list[Any]:
        rows: list[Any] = []
        results = [
            result for result in result_store.results.values() if result.cycle_id == cycle.cycle_id
        ]
        rows.extend(
            AssessmentResultModel(
                **_audit(result.generated_by_ref),
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
                published_at_ref=_parse_datetime_or_none(result.published_at_ref),
                finalized_by_ref=result.finalized_by_ref,
                finalized_at_ref=_parse_datetime_or_none(result.finalized_at_ref),
            )
            for result in results
        )
        for result in results:
            rows.extend(
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
                )
                for item in result.items.values()
            )
            rows.extend(
                AssessmentResultConfirmationModel(
                    **_audit(item.confirmed_by_ref),
                    confirmation_id=item.confirmation_id,
                    result_id=item.result_id,
                    decision=item.decision,
                    comment=item.comment,
                    confirmed_by_ref=item.confirmed_by_ref,
                    confirmed_at_ref=_parse_datetime(item.confirmed_at_ref),
                )
                for item in result.confirmations
            )
            rows.extend(
                AssessmentScoreAppealModel(
                    **_audit(item.decided_by_ref or item.submitted_by_ref),
                    score_appeal_id=item.score_appeal_id,
                    result_id=item.result_id,
                    target_org_id=item.target_org_id,
                    status=item.status,
                    reason=item.reason,
                    submitted_by_ref=item.submitted_by_ref,
                    submitted_at_ref=_parse_datetime(item.submitted_at_ref),
                    decided_by_ref=item.decided_by_ref,
                    decided_at_ref=_parse_datetime_or_none(item.decided_at_ref),
                    decision=item.decision,
                    decision_reason=item.decision_reason,
                )
                for item in result.appeals.values()
            )
            for appeal in result.appeals.values():
                rows.extend(
                    AssessmentScoreAppealItemModel(
                        **_audit(),
                        score_appeal_item_id=item.score_appeal_item_id,
                        score_appeal_id=item.score_appeal_id,
                        result_item_id=item.result_item_id,
                        requested_score=item.requested_score,
                        adopted_score=item.adopted_score,
                        reason=item.reason,
                    )
                    for item in appeal.items.values()
                )
                rows.extend(
                    AssessmentScoreAppealAttachmentModel(
                        **_audit(item.bound_by_ref),
                        score_appeal_attachment_id=item.score_appeal_attachment_id,
                        score_appeal_id=item.score_appeal_id,
                        file_id=item.file_id,
                        bound_by_ref=item.bound_by_ref,
                        bound_at_ref=_parse_datetime(item.bound_at_ref),
                    )
                    for item in appeal.attachments.values()
                )
            rows.extend(
                AssessmentRecordArchiveModel(
                    **_audit(item.archived_by_ref),
                    archive_id=item.archive_id,
                    result_id=item.result_id,
                    archive_type=item.archive_type,
                    snapshot=item.snapshot,
                    archived_by_ref=item.archived_by_ref,
                    archived_at_ref=_parse_datetime(item.archived_at_ref),
                )
                for item in result.archives
            )
        return rows

    async def _delete_cycle_response_evidence(
        self,
        session: AsyncSession,
        cycle: AssessmentCycleRecord,
    ) -> None:
        reporting_task_ids = list(cycle.reporting_tasks)
        if not reporting_task_ids:
            return
        await session.execute(
            delete(AssessmentResponseEvidenceModel).where(
                AssessmentResponseEvidenceModel.reporting_task_id.in_(reporting_task_ids),
            ),
        )
        await session.flush()

    async def _delete_cycle_result_children(
        self,
        session: AsyncSession,
        cycle: AssessmentCycleRecord,
    ) -> None:
        result_ids = list(
            (
                await session.scalars(
                    select(AssessmentResultModel.result_id).where(
                        AssessmentResultModel.cycle_id == cycle.cycle_id,
                    ),
                )
            ).all(),
        )
        if not result_ids:
            return
        appeal_ids = list(
            (
                await session.scalars(
                    select(AssessmentScoreAppealModel.score_appeal_id).where(
                        AssessmentScoreAppealModel.result_id.in_(result_ids),
                    ),
                )
            ).all(),
        )
        if appeal_ids:
            await session.execute(
                delete(AssessmentScoreAppealAttachmentModel).where(
                    AssessmentScoreAppealAttachmentModel.score_appeal_id.in_(appeal_ids),
                ),
            )
            await session.execute(
                delete(AssessmentScoreAppealItemModel).where(
                    AssessmentScoreAppealItemModel.score_appeal_id.in_(appeal_ids),
                ),
            )
            await session.execute(
                delete(AssessmentScoreAppealModel).where(
                    AssessmentScoreAppealModel.score_appeal_id.in_(appeal_ids),
                ),
            )
        await session.execute(
            delete(AssessmentRecordArchiveModel).where(
                AssessmentRecordArchiveModel.result_id.in_(result_ids),
            ),
        )
        await session.execute(
            delete(AssessmentResultConfirmationModel).where(
                AssessmentResultConfirmationModel.result_id.in_(result_ids),
            ),
        )
        await session.execute(
            delete(AssessmentResultItemModel).where(
                AssessmentResultItemModel.result_id.in_(result_ids),
            ),
        )
        await session.execute(
            delete(AssessmentResultModel).where(AssessmentResultModel.result_id.in_(result_ids)),
        )
        await session.flush()

    async def _delete_cycle_review_children(
        self,
        session: AsyncSession,
        cycle: AssessmentCycleRecord,
    ) -> None:
        review_task_ids = list(
            (
                await session.scalars(
                    select(AssessmentReviewTaskModel.review_task_id).where(
                        AssessmentReviewTaskModel.cycle_id == cycle.cycle_id,
                    ),
                )
            ).all(),
        )
        if not review_task_ids:
            return
        await session.execute(
            delete(AssessmentAIInsightSnapshotModel).where(
                AssessmentAIInsightSnapshotModel.review_task_id.in_(review_task_ids),
            ),
        )
        await session.execute(
            delete(AssessmentReviewDecisionModel).where(
                AssessmentReviewDecisionModel.review_task_id.in_(review_task_ids),
            ),
        )
        await session.execute(
            delete(AssessmentScoreAdjustmentModel).where(
                AssessmentScoreAdjustmentModel.review_task_id.in_(review_task_ids),
            ),
        )
        await session.execute(
            delete(AssessmentReviewItemModel).where(
                AssessmentReviewItemModel.review_task_id.in_(review_task_ids),
            ),
        )
        await session.flush()

    async def _delete_stale_cycle_review_rows(
        self,
        session: AsyncSession,
        cycle: AssessmentCycleRecord,
    ) -> None:
        existing_rows = (
            await session.execute(
                select(
                    AssessmentReviewTaskModel.review_task_id,
                    AssessmentReviewTaskModel.unified_task_id,
                ).where(AssessmentReviewTaskModel.cycle_id == cycle.cycle_id),
            )
        ).all()
        if not existing_rows:
            return

        current_review_task_ids = {
            task.review_task_id
            for task in review_store.review_tasks.values()
            if task.cycle_id == cycle.cycle_id
        }
        current_unified_task_ids = {
            task.unified_task_id
            for task in review_store.review_tasks.values()
            if task.cycle_id == cycle.cycle_id
        }
        stale_review_task_ids = [
            row.review_task_id
            for row in existing_rows
            if row.review_task_id not in current_review_task_ids
        ]
        stale_unified_task_ids = [
            row.unified_task_id
            for row in existing_rows
            if row.unified_task_id not in current_unified_task_ids
        ]
        if stale_review_task_ids:
            await session.execute(
                delete(AssessmentReviewTaskModel).where(
                    AssessmentReviewTaskModel.review_task_id.in_(stale_review_task_ids),
                ),
            )
        if stale_unified_task_ids:
            await session.execute(
                delete(UnifiedTaskModel).where(
                    UnifiedTaskModel.task_id.in_(stale_unified_task_ids)
                ),
            )
        await session.flush()

    async def _delete_indicator_children(
        self,
        session: AsyncSession,
        indicator: IndicatorRecord,
    ) -> None:
        version_ids = list(indicator.versions)
        if not version_ids:
            return
        rule_ids = [
            version.scoring_rule.scoring_rule_id
            for version in indicator.versions.values()
            if version.scoring_rule
        ]
        if rule_ids:
            await session.execute(
                delete(ScoringRuleBandModel).where(
                    ScoringRuleBandModel.scoring_rule_id.in_(rule_ids),
                ),
            )
            await session.execute(
                delete(QualitativeRubricItemModel).where(
                    QualitativeRubricItemModel.scoring_rule_id.in_(rule_ids),
                ),
            )
        await session.execute(
            delete(IndicatorVariableModel).where(
                IndicatorVariableModel.version_id.in_(version_ids)
            ),
        )
        await session.execute(
            delete(AssessmentEvidenceTemplateModel).where(
                AssessmentEvidenceTemplateModel.version_id.in_(version_ids),
            ),
        )
        await session.execute(
            delete(ScoringRuleModel).where(ScoringRuleModel.version_id.in_(version_ids)),
        )

    async def _delete_scheme_children(self, session: AsyncSession, scheme_id: str) -> None:
        groups = list(
            (
                await session.scalars(
                    select(AssessmentTargetGroupModel).where(
                        AssessmentTargetGroupModel.scheme_id == scheme_id,
                    ),
                )
            ).all(),
        )
        group_ids = [group.target_group_id for group in groups]
        if group_ids:
            await session.execute(
                delete(AssessmentTargetGroupMemberModel).where(
                    AssessmentTargetGroupMemberModel.target_group_id.in_(group_ids),
                ),
            )
        await session.execute(
            delete(AssessmentTargetGroupModel).where(
                AssessmentTargetGroupModel.scheme_id == scheme_id,
            ),
        )
        await session.execute(
            delete(AssessmentVolumeAdjustmentFactorModel).where(
                AssessmentVolumeAdjustmentFactorModel.scheme_id == scheme_id,
            ),
        )
        await session.execute(
            delete(AssessmentGradeThresholdModel).where(
                AssessmentGradeThresholdModel.scheme_id == scheme_id,
            ),
        )
        await session.execute(
            delete(AssessmentSchemeItemModel).where(
                AssessmentSchemeItemModel.scheme_id == scheme_id,
            ),
        )

    def _hydrate_assessment_tasks(self, task_rows: Iterable[UnifiedTaskModel]) -> None:
        for row in task_rows:
            target = row.action_target
            task_store.tasks[row.task_id] = UnifiedTaskRecord(
                task_id=row.task_id,
                category=row.category,
                action_type=row.action_type,
                title=row.title,
                description=row.description,
                priority=row.priority,
                due_date=_iso(row.due_date) if row.due_date else "",
                status=row.status,
                source_id=row.source_id,
                scope=row.scope,
                scoped_org_id=row.scoped_org_id,
                assigned_user_id=row.assigned_user_id,
                reviewer_role_ids=list(row.reviewer_role_ids),
                project_id=row.project_id,
                created_at=_iso(row.task_created_at),
                action_target=UnifiedTaskActionTargetRecord(
                    kind=target.get("kind", "route"),
                    menu_id=target.get("menuId", ""),
                    app_path=target.get("appPath", ""),
                    public_path=target.get("publicPath", ""),
                    params=dict(target.get("params") or {}),
                    action=target.get("action", ""),
                    supported=target.get("supported", True),
                ),
            )


def _group_by(rows: Iterable[Any], attr: str) -> dict[str, list[Any]]:
    grouped: dict[str, list[Any]] = {}
    for row in rows:
        grouped.setdefault(getattr(row, attr), []).append(row)
    return grouped


def _audit(actor: str | None = None) -> dict[str, Any]:
    now = datetime.now(tz=UTC)
    return {
        "created_by": actor or "SYSTEM-RUNTIME",
        "updated_by": actor or "SYSTEM-RUNTIME",
        "created_at": now,
        "updated_at": now,
        "is_deleted": False,
        "deleted_at": None,
        "deleted_by": None,
    }


def _float(value: Any) -> float:
    if isinstance(value, Decimal):
        return float(value)
    return float(value)


def _float_or_none(value: Any) -> float | None:
    if value is None:
        return None
    return _float(value)


def _iso(value: date | datetime) -> str:
    if isinstance(value, datetime):
        return value.isoformat()
    return value.isoformat()


def _iso_or_none(value: datetime | None) -> str | None:
    if value is None:
        return None
    return _iso(value)


def _parse_datetime(raw: str | datetime | date) -> datetime:
    if isinstance(raw, datetime):
        return raw if raw.tzinfo else raw.replace(tzinfo=UTC)
    if isinstance(raw, date):
        return datetime(raw.year, raw.month, raw.day, tzinfo=UTC)
    parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def _parse_datetime_or_none(raw: str | datetime | None) -> datetime | None:
    if raw is None:
        return None
    return _parse_datetime(raw)


def _parse_date_or_none(raw: str | date | None) -> date | None:
    if raw is None or raw == "":
        return None
    if isinstance(raw, date):
        return raw
    return date.fromisoformat(raw.split("T", 1)[0])


def _parse_date(raw: str | date) -> date:
    parsed = _parse_date_or_none(raw)
    if parsed is None:
        raise ValueError("date value is required")
    return parsed


assessment_runtime_repository = AssessmentRuntimeRepository()
