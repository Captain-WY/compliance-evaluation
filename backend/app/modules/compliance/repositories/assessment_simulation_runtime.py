from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.compliance.domain.assessment_simulation_store import (
    AssessmentSimulationRunRecord,
    assessment_simulation_store,
)
from app.modules.compliance.models import AssessmentSimulationRunModel


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.isoformat().replace("+00:00", "Z")


def _dt(value: str | None) -> datetime | None:
    if not value:
        return None
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed


def _now() -> datetime:
    return datetime.now(UTC)


class AssessmentSimulationRuntimeRepository:
    """Persist P2 simulation snapshots without touching official assessment tables."""

    async def hydrate_simulation_store(self, session: AsyncSession) -> None:
        rows = list(
            (
                await session.scalars(
                    select(AssessmentSimulationRunModel).where(
                        AssessmentSimulationRunModel.is_deleted.is_(False),
                    ),
                )
            ).all(),
        )
        if not rows:
            return
        assessment_simulation_store.hydrate(
            runs={row.simulation_id: self.record_from_model(row) for row in rows},
        )

    async def save_run(self, session: AsyncSession, simulation_id: str) -> None:
        run = assessment_simulation_store.runs[simulation_id]
        await session.merge(self.model_from_record(run))
        await session.flush()

    @staticmethod
    def record_from_model(row: AssessmentSimulationRunModel) -> AssessmentSimulationRunRecord:
        return AssessmentSimulationRunRecord(
            simulation_id=row.simulation_id,
            scheme_id=row.scheme_id,
            scheme_version_id=row.scheme_version_id,
            reference_period=row.reference_period,
            status=row.status,
            requested_by=row.requested_by,
            request_id=row.request_id,
            actor_snapshot=dict(row.actor_snapshot),
            org_context_snapshot=dict(row.org_context_snapshot),
            input_snapshot=dict(row.input_snapshot),
            input_snapshot_hash=row.input_snapshot_hash,
            imputation_policy=row.imputation_policy,
            preflight_findings=list(row.preflight_findings),
            result_summary=dict(row.result_summary),
            org_results=list(row.org_results),
            imputation_notes=list(row.imputation_notes),
            created_at=_iso(row.simulation_created_at) or "",
            started_at=_iso(row.started_at),
            finished_at=_iso(row.finished_at),
            audit_events=list(row.audit_events),
            error=dict(row.error) if row.error else None,
        )

    @staticmethod
    def model_from_record(record: AssessmentSimulationRunRecord) -> AssessmentSimulationRunModel:
        now = _now()
        return AssessmentSimulationRunModel(
            created_by=record.requested_by,
            updated_by=record.requested_by,
            created_at=now,
            updated_at=now,
            is_deleted=False,
            simulation_id=record.simulation_id,
            scheme_id=record.scheme_id,
            scheme_version_id=record.scheme_version_id,
            reference_period=record.reference_period,
            status=record.status,
            requested_by=record.requested_by,
            request_id=record.request_id,
            actor_snapshot=dict(record.actor_snapshot),
            org_context_snapshot=dict(record.org_context_snapshot),
            input_snapshot=dict(record.input_snapshot),
            input_snapshot_hash=record.input_snapshot_hash,
            imputation_policy=record.imputation_policy,
            preflight_findings=list(record.preflight_findings),
            result_summary=dict(record.result_summary),
            org_results=list(record.org_results),
            imputation_notes=list(record.imputation_notes),
            simulation_created_at=_dt(record.created_at) or now,
            started_at=_dt(record.started_at),
            finished_at=_dt(record.finished_at),
            audit_events=list(record.audit_events),
            error=dict(record.error) if record.error else None,
        )


assessment_simulation_runtime_repository = AssessmentSimulationRuntimeRepository()
