from __future__ import annotations

import argparse
import asyncio
import json

from app.modules.compliance.core.config import get_settings
from app.modules.compliance.services.scheduler_worker import process_scheduler_due_tick


async def _run_loop(*, interval_seconds: int) -> None:
    while True:
        result = await process_scheduler_due_tick()
        print(json.dumps(result, ensure_ascii=True, separators=(",", ":")), flush=True)
        await asyncio.sleep(interval_seconds)


def main() -> None:
    settings = get_settings()
    parser = argparse.ArgumentParser(description="Run the assessment scheduler worker.")
    parser.add_argument("--once", action="store_true", help="Run one due-processing tick.")
    parser.add_argument("--process-at", help="Optional ISO timestamp for deterministic tests.")
    parser.add_argument(
        "--interval-seconds",
        type=int,
        default=settings.scheduler_worker_interval_seconds,
        help="Loop interval for continuous worker mode.",
    )
    args = parser.parse_args()

    if args.once:
        result = asyncio.run(process_scheduler_due_tick(process_at=args.process_at))
        print(json.dumps(result, ensure_ascii=True, separators=(",", ":")))
        return

    asyncio.run(_run_loop(interval_seconds=max(30, args.interval_seconds)))


if __name__ == "__main__":
    main()
