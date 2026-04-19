#!/usr/bin/env python3
"""
Executor OS CLI: queue/worker batch, init-project.

Examples:
  python executor.py enqueue-batch --payload payloads/g20_batch_webstub_5.json
  python executor.py worker --count 3
  python executor.py init-project fooapp --template native

See docs/adr/ADR-002-WORKER-POOL-QUEUE.md · docs/strategy/STRATEGY-PROJECT-SCAFFOLDING.md
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent
_AGENT = _ROOT / "agent"
if str(_AGENT) not in sys.path:
    sys.path.insert(0, str(_AGENT))


def main() -> None:
    ap = argparse.ArgumentParser(prog="executor")
    sub = ap.add_subparsers(dest="cmd", required=True)

    enq = sub.add_parser("enqueue-batch", help="Expand payload into SQLite job queue")
    enq.add_argument("--payload", required=True, type=Path)
    enq.add_argument("--queue-db", type=Path, default=_ROOT / "runs" / "executor_queue.db")

    wr = sub.add_parser("worker", help="Run worker pool until queue drains")
    wr.add_argument("--count", type=int, default=2)
    wr.add_argument("--queue-db", type=Path, default=_ROOT / "runs" / "executor_queue.db")
    wr.add_argument("--poll-grace", type=float, default=3.0)

    ip = sub.add_parser("init-project", help="Scaffold projects/ + payloads/ + fixtures/ + docs")
    ip.add_argument("app_name")
    ip.add_argument("--template", choices=("webstub", "native", "backend"), default="native")
    ip.add_argument("--author", default="platform-team")

    args = ap.parse_args()

    if args.cmd == "enqueue-batch":
        from executor_worker import enqueue_batch_jobs

        jids = enqueue_batch_jobs(
            local_agent_root=_ROOT,
            queue_db=args.queue_db,
            payload_path=args.payload,
        )
        print("enqueued", len(jids), "jobs")
        for j in jids[:20]:
            print(" ", j)
        if len(jids) > 20:
            print(" ...")

    elif args.cmd == "worker":
        from executor_daily_report import append_kpi_section_only
        from executor_worker import run_worker_pool

        run_worker_pool(
            local_agent_root=_ROOT,
            queue_db=args.queue_db,
            worker_count=args.count,
            runs_dir=_ROOT / "runs",
            poll_grace_sec=args.poll_grace,
        )
        append_kpi_section_only(_ROOT, days=7)
        print("workers drained; KPI section appended to runs/daily_global_report.md")

    elif args.cmd == "init-project":
        from executor_init_project import init_project

        paths = init_project(
            _ROOT,
            args.app_name,
            template=args.template,
            author=args.author,
        )
        print("created", len(paths), "files:")
        for p in paths:
            print(" ", p)


if __name__ == "__main__":
    main()
