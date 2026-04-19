#!/usr/bin/env python3
"""Unified entry: sequential run, or queue + worker pool (see also `python executor.py`)."""

from __future__ import annotations

import argparse
import copy
import json
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent
_AGENT = _ROOT / "agent"
if str(_AGENT) not in sys.path:
    sys.path.insert(0, str(_AGENT))

from executor_country import resolve_country_codes_for_invocation  # noqa: E402
from executor_daily_report import append_daily_global_report, append_kpi_section_only  # noqa: E402
from local_executor import load_executor_project_config, run_local_executor  # noqa: E402


def main() -> None:
    p = argparse.ArgumentParser(description="Local Executor OS pipeline")
    p.add_argument("payload", nargs="?", type=Path, help="Payload JSON path")
    p.add_argument(
        "--enqueue-only",
        action="store_true",
        help="Only enqueue jobs to SQLite queue (no execution)",
    )
    p.add_argument(
        "--queue-db",
        type=Path,
        default=_ROOT / "runs" / "executor_queue.db",
    )
    p.add_argument(
        "--queue-workers",
        type=int,
        default=0,
        help="If >0: enqueue from payload then run worker pool with this many threads",
    )
    args = p.parse_args()

    if args.queue_workers > 0:
        if not args.payload:
            p.error("payload path required with --queue-workers")
        from executor_worker import enqueue_batch_jobs, run_worker_pool

        enqueue_batch_jobs(
            local_agent_root=_ROOT,
            queue_db=args.queue_db,
            payload_path=args.payload,
        )
        run_worker_pool(
            local_agent_root=_ROOT,
            queue_db=args.queue_db,
            worker_count=args.queue_workers,
            runs_dir=_ROOT / "runs",
        )
        append_kpi_section_only(_ROOT, days=7)
        print("queue batch finished; see runs/daily_global_report.md for KPI block")
        return

    if args.enqueue_only:
        if not args.payload:
            p.error("payload path required with --enqueue-only")
        from executor_worker import enqueue_batch_jobs

        jids = enqueue_batch_jobs(
            local_agent_root=_ROOT,
            queue_db=args.queue_db,
            payload_path=args.payload,
        )
        print("enqueued", len(jids), "jobs ->", args.queue_db)
        return

    if not args.payload:
        p.error("payload path required (or use executor.py subcommands)")
    raw = args.payload.read_text(encoding="utf-8-sig")
    payload = json.loads(raw)
    runs_dir = _ROOT / "runs"
    project_id = str(payload.get("project_id") or "").strip()
    if not project_id:
        print("payload.project_id required", file=sys.stderr)
        sys.exit(2)
    proj_cfg = load_executor_project_config(project_id)
    codes = resolve_country_codes_for_invocation(payload, proj_cfg, _ROOT)

    batch_rows: list[dict] = []
    last_ctx = None
    for cc in codes:
        pl = copy.deepcopy(payload)
        pl["country_code"] = cc
        pl["country_batch"] = False
        last_ctx = run_local_executor(pl, global_cfg={"runs_dir": str(runs_dir)})
        if len(codes) > 1:
            cp = last_ctx.payload.get("country_profile") or {}
            sp = cp.get("search_providers") if isinstance(cp.get("search_providers"), dict) else {}
            fa = last_ctx.report.get("failure_analyses") or []
            last_f = fa[-1] if fa else {}
            dur = ""
            try:
                from executor_metrics import duration_sec  # noqa: PLC0415

                d = duration_sec(
                    last_ctx.report.get("started_at_utc") or "",
                    last_ctx.report.get("finished_at_utc") or "",
                )
                if d is not None:
                    dur = f"{d:.1f}"
            except Exception:
                pass
            batch_rows.append(
                {
                    "project_id": last_ctx.project_id,
                    "country_code": cc,
                    "platform": last_ctx.payload.get("platform", ""),
                    "gate_verdict": last_ctx.report.get("gate_verdict"),
                    "status": last_ctx.report.get("status"),
                    "duration_sec": dur,
                    "search_primary": sp.get("primary", ""),
                    "locale": cp.get("locale", ""),
                    "failure_class": last_f.get("failure_class", ""),
                }
            )

    if len(codes) > 1 and batch_rows:
        append_daily_global_report(_ROOT, batch_rows)
        append_kpi_section_only(_ROOT, days=7)

    if last_ctx:
        print(last_ctx.run_root)
        print("status:", last_ctx.report.get("status"))
        print("validation:", last_ctx.report.get("validation_verdict"))
        print("gate:", last_ctx.report.get("gate_verdict"))
        print("countries_run:", ",".join(codes))


if __name__ == "__main__":
    main()
