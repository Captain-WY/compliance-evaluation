from __future__ import annotations

import os
from datetime import UTC, date, datetime, time, timedelta
from functools import lru_cache

SEED_BASE_DATE_ENV = "P0_SEED_BASE_DATE"


@lru_cache
def seed_base_date() -> date:
    raw = os.getenv(SEED_BASE_DATE_ENV)
    if raw:
        return date.fromisoformat(raw)
    return datetime.now(UTC).date()


def relative_date(days: int = 0) -> date:
    return seed_base_date() + timedelta(days=days)


def relative_date_iso(days: int = 0) -> str:
    return relative_date(days).isoformat()


def relative_datetime(days: int = 0, *, hour: int = 9, minute: int = 0) -> datetime:
    return datetime.combine(relative_date(days), time(hour, minute, tzinfo=UTC))


def relative_datetime_iso(days: int = 0, *, hour: int = 9, minute: int = 0) -> str:
    return relative_datetime(days, hour=hour, minute=minute).isoformat().replace("+00:00", "Z")

