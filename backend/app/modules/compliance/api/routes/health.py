from fastapi import APIRouter, Request
from sqlalchemy import text

from app.modules.compliance.core.config import get_settings
from app.modules.compliance.core.db import AsyncSessionFactory
from app.modules.compliance.core.responses import success_response

router = APIRouter(tags=["foundation"])


@router.get("/health", name="health")
async def health(request: Request) -> dict:
    return success_response({"status": "ok"}, request)


@router.get("/version", name="version")
async def version(request: Request) -> dict:
    settings = get_settings()
    return success_response(
        {
            "app": "compliance-evaluation",
            "env": settings.app_env,
            "gitSha": settings.app_git_sha,
            "buildTime": settings.app_build_time,
            "source": "deploy/sit/deploy.sh",
        },
        request,
    )


@router.get("/ready", name="readiness")
async def readiness(request: Request) -> dict:
    settings = get_settings()
    database_url_configured = bool(settings.database_url)
    postgresql_target = settings.database_url.startswith("postgresql")
    database_required = _database_runtime_required(settings)
    runtime_guard = _assessment_runtime_mode_guard(settings)
    database_ping = "skipped_memory_runtime"
    database_error = None
    if database_url_configured and database_required:
        try:
            database_ping = "ok" if await _ping_database() else "failed"
        except Exception as exc:  # noqa: BLE001 - readiness must not leak raw DB errors.
            database_ping = "failed"
            database_error = exc.__class__.__name__
    status = (
        "ready"
        if database_url_configured and (not database_required or database_ping == "ok")
        else "not_ready"
    )
    checks = {
        "databaseUrlConfigured": database_url_configured,
        "databasePingRequired": database_required,
        "databasePing": database_ping,
        "p0SmokeDatabaseTarget": (
            "postgresql-compatible" if postgresql_target else "fallback"
        ),
        "assessmentRuntimePersistence": settings.assessment_runtime_persistence,
        "assessmentRuntimePersistenceAllowed": runtime_guard["allowed"],
        "assessmentRuntimePersistenceMarker": runtime_guard["marker"],
        "runtimeModeWarnings": runtime_guard["warnings"],
    }
    if database_error:
        checks["databaseErrorType"] = database_error
    return success_response(
        {
            "status": status,
            "checks": checks,
        },
        request,
    )


def _database_runtime_required(settings) -> bool:
    return any(
        value == "database"
        for value in (
            settings.assessment_runtime_persistence,
            settings.notification_runtime_persistence,
            settings.workflow_runtime_persistence,
            settings.inspection_report_runtime_persistence,
        )
    )


def _assessment_runtime_mode_guard(settings) -> dict:
    mode = settings.assessment_runtime_persistence
    env = settings.app_env.lower()
    local_envs = {"local", "dev", "development", "test", "testing"}
    if mode == "database":
        return {
            "allowed": True,
            "marker": "database_runtime",
            "warnings": [],
        }
    if env in local_envs:
        return {
            "allowed": True,
            "marker": "local_dev_test_memory_allowed",
            "warnings": [],
        }
    return {
        "allowed": False,
        "marker": "non_local_memory_runtime_warning",
        "warnings": [
            (
                "assessment_runtime_persistence is not database outside "
                "local/dev/test; UnifiedTask runtime writes may remain process-local"
            ),
        ],
    }


async def _ping_database() -> bool:
    async with AsyncSessionFactory() as session:
        await session.execute(text("SELECT 1"))
    return True
