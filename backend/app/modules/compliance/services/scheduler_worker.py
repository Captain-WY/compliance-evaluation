from __future__ import annotations

from collections import Counter
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.compliance.core.config import get_settings
from app.modules.compliance.core.db import AsyncSessionFactory
from app.modules.compliance.core.errors import AppError
from app.modules.compliance.domain.auth_store import auth_store
from app.modules.compliance.domain.scheduler_store import assessment_scheduler_store
from app.modules.compliance.repositories.assessment_runtime import assessment_runtime_repository
from app.modules.compliance.repositories.scheduler_runtime import scheduler_runtime_repository


def _runtime_db_enabled() -> bool:
    return get_settings().assessment_runtime_persistence == "database"


def _worker_user():
    settings = get_settings()
    user = auth_store.users.get(settings.scheduler_worker_user_id)
    if user is None:
        raise AppError(
            code="SCHEDULER_WORKER_USER_NOT_FOUND",
            message="Configured scheduler worker user is not provisioned",
            status_code=500,
            details={"userId": settings.scheduler_worker_user_id},
        )
    return user


async def process_scheduler_due_tick(*, process_at: str | None = None) -> dict[str, Any]:
    if not _runtime_db_enabled():
        return _summarize_result(_process(process_at=process_at))

    async with AsyncSessionFactory() as session:
        await _hydrate_runtime(session)
        result = _process(process_at=process_at)
        for item in result["processed"]:
            execution = item.get("execution") or {}
            cycle_id = execution.get("createdCycleId")
            if cycle_id:
                await assessment_runtime_repository.save_cycle(session, cycle_id)
        await scheduler_runtime_repository.save_runtime_state(session)
        await session.commit()
        return _summarize_result(result)


async def _hydrate_runtime(session: AsyncSession) -> None:
    await assessment_runtime_repository.hydrate_cycle_store(session)
    await scheduler_runtime_repository.hydrate_scheduler_store(session)


def _process(*, process_at: str | None) -> dict[str, Any]:
    user = _worker_user()
    return assessment_scheduler_store.process_due_schedules(
        user=user,
        auth_store=auth_store,
        process_at=process_at,
    )


def _summarize_result(result: dict[str, Any]) -> dict[str, Any]:
    statuses = Counter(item.get("status", "UNKNOWN") for item in result["processed"])
    created_cycle_ids = [
        (item.get("execution") or {}).get("createdCycleId")
        for item in result["processed"]
        if (item.get("execution") or {}).get("createdCycleId")
    ]
    return {
        "status": "ok",
        "processedAt": result["processedAt"],
        "processedCount": len(result["processed"]),
        "statusCounts": dict(sorted(statuses.items())),
        "createdCycleIds": created_cycle_ids,
    }
