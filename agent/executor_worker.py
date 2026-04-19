"""
Worker pool consuming executor_queue (SQLite WAL).

Each worker claims a job with a short DB transaction, then runs the executor with no queue lock held.
See docs/adr/ADR-002-WORKER-POOL-QUEUE.md.
"""

from __future__ import annotations

import copy
import json
import threading
import time
import traceback
import uuid
from pathlib import Path
from typing import Any

from executor_queue import fetch_next_job, mark_job_done, mark_job_failed, open_queue


def _execute_job_payload(
    *,
    local_agent_root: Path,
    runs_dir: Path,
    job: Any,
    payload_path: Path,
) -> Any:
    raw = payload_path.read_text(encoding="utf-8-sig")
    payload = json.loads(raw)
    payload = copy.deepcopy(payload)
    payload["country_code"] = job.country_code
    payload["country_batch"] = False
    if job.platform and not payload.get("platform"):
        payload["platform"] = job.platform

    from local_executor import run_local_executor

    gcfg: dict[str, Any] = {
        "runs_dir": str(runs_dir),
        "job_id": job.job_id,
        "batch_id": job.batch_id,
    }
    return run_local_executor(payload, global_cfg=gcfg)


def _worker_loop(
    worker_tag: str,
    *,
    local_agent_root: Path,
    queue_db: Path,
    runs_dir: Path,
    stop_event: threading.Event,
) -> None:
    while not stop_event.is_set():
        conn = open_queue(queue_db)
        try:
            job = fetch_next_job(conn, worker_tag)
        finally:
            conn.close()

        if job is None:
            time.sleep(0.2)
            continue

        try:
            ctx = _execute_job_payload(
                local_agent_root=local_agent_root,
                runs_dir=runs_dir,
                job=job,
                payload_path=Path(job.payload_path),
            )
            ok = ctx.report.get("status") == "SUCCEEDED" and ctx.report.get("gate_verdict") == "APPROVED"
            conn2 = open_queue(queue_db)
            try:
                if ok:
                    mark_job_done(
                        conn2,
                        job.job_id,
                        run_id=ctx.run_id,
                        run_root=str(ctx.run_root.resolve()),
                    )
                else:
                    msg = (
                        ctx.report.get("failure_summary")
                        or f"pipeline status={ctx.report.get('status')} gate={ctx.report.get('gate_verdict')}"
                    )
                    mark_job_failed(conn2, job.job_id, msg)
            finally:
                conn2.close()
        except Exception as exc:
            conn2 = open_queue(queue_db)
            try:
                mark_job_failed(conn2, job.job_id, f"{exc}\n{traceback.format_exc()}")
            finally:
                conn2.close()


def run_worker_pool(
    *,
    local_agent_root: Path,
    queue_db: Path,
    worker_count: int,
    runs_dir: Path | None = None,
    poll_grace_sec: float = 3.0,
) -> None:
    """
    Start ``worker_count`` threads; exit when there are no queued/running/retry_scheduled jobs
    (stable for ``poll_grace_sec``) so retries can be picked up by idle workers.
    """
    rd = runs_dir or (local_agent_root / "runs")
    rd.mkdir(parents=True, exist_ok=True)
    n = max(1, int(worker_count))
    stop = threading.Event()
    threads: list[threading.Thread] = []
    for i in range(n):
        tag = f"w-{uuid.uuid4().hex[:6]}-{i}"
        t = threading.Thread(
            target=_worker_loop,
            args=(tag,),
            kwargs={
                "local_agent_root": local_agent_root,
                "queue_db": queue_db,
                "runs_dir": rd,
                "stop_event": stop,
            },
            daemon=True,
        )
        t.start()
        threads.append(t)

    stable = 0
    need = int(poll_grace_sec / 0.25)
    try:
        while stable < need:
            time.sleep(0.25)
            conn = open_queue(queue_db)
            try:
                pending = conn.execute(
                    """
                    SELECT COUNT(*) FROM jobs
                    WHERE status IN ('queued', 'retry_scheduled', 'running')
                    """
                ).fetchone()[0]
            finally:
                conn.close()
            if int(pending) == 0:
                stable += 1
            else:
                stable = 0
        stop.set()
        for t in threads:
            t.join(timeout=180)
    except KeyboardInterrupt:
        stop.set()
        for t in threads:
            t.join(timeout=30)


def enqueue_batch_jobs(
    *,
    local_agent_root: Path,
    queue_db: Path,
    payload_path: Path,
    batch_id: str | None = None,
) -> list[str]:
    """Expand payload (country_batch / G20_THEN_ISO) into queued jobs; returns job_ids."""
    from executor_country import resolve_country_codes_for_invocation
    from executor_queue import enqueue_job

    raw = payload_path.read_text(encoding="utf-8-sig")
    payload = json.loads(raw)
    project_id = str(payload.get("project_id") or "").strip()
    if not project_id:
        raise ValueError("payload.project_id required")

    from local_executor import load_executor_project_config

    proj_cfg = load_executor_project_config(project_id)
    codes = resolve_country_codes_for_invocation(payload, proj_cfg, local_agent_root)
    bid = batch_id or str(uuid.uuid4())
    abs_payload = str(payload_path.resolve())

    conn = open_queue(queue_db)
    try:
        jids: list[str] = []
        plat = str(payload.get("platform") or proj_cfg.get("platform") or "android")
        for cc in codes:
            jid = enqueue_job(
                conn,
                project_id=project_id,
                country_code=cc,
                platform=plat,
                payload_path=abs_payload,
                batch_id=bid,
                max_attempts=max(1, int(payload.get("job_max_attempts") or 3)),
            )
            jids.append(jid)
        return jids
    finally:
        conn.close()
