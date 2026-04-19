"""
Local file-backed job queue for Executor OS (SQLite WAL).

No external MQ — state lives in ``runs/executor_queue.db`` + run directories.
See docs/adr/ADR-002-WORKER-POOL-QUEUE.md.
"""

from __future__ import annotations

import sqlite3
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


def _utc_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def connect_queue_db(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path), timeout=60.0, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=60000")
    return conn


def init_queue_schema(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS jobs (
            job_id TEXT PRIMARY KEY,
            batch_id TEXT,
            project_id TEXT NOT NULL,
            country_code TEXT NOT NULL,
            platform TEXT NOT NULL,
            payload_path TEXT NOT NULL,
            status TEXT NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0,
            max_attempts INTEGER NOT NULL DEFAULT 3,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            worker_id TEXT,
            run_id TEXT,
            run_root TEXT,
            error TEXT,
            next_retry_at TEXT
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, created_at)")
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_jobs_retry ON jobs(status, next_retry_at, created_at)"
    )


@dataclass
class Job:
    job_id: str
    batch_id: str
    project_id: str
    country_code: str
    platform: str
    payload_path: str
    status: str
    attempts: int
    max_attempts: int
    created_at: str
    updated_at: str
    worker_id: str | None
    run_id: str | None
    run_root: str | None
    error: str | None
    next_retry_at: str | None


def _row_to_job(row: sqlite3.Row) -> Job:
    return Job(
        job_id=row["job_id"],
        batch_id=row["batch_id"] or "",
        project_id=row["project_id"],
        country_code=row["country_code"],
        platform=row["platform"],
        payload_path=row["payload_path"],
        status=row["status"],
        attempts=int(row["attempts"]),
        max_attempts=int(row["max_attempts"]),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        worker_id=row["worker_id"],
        run_id=row["run_id"],
        run_root=row["run_root"],
        error=row["error"],
        next_retry_at=row["next_retry_at"],
    )


def enqueue_job(
    conn: sqlite3.Connection,
    *,
    project_id: str,
    country_code: str,
    platform: str,
    payload_path: str,
    batch_id: str = "",
    max_attempts: int = 3,
    job_id: str | None = None,
) -> str:
    jid = job_id or str(uuid.uuid4())
    now = _utc_iso()
    conn.execute(
        """
        INSERT INTO jobs (
            job_id, batch_id, project_id, country_code, platform, payload_path,
            status, attempts, max_attempts, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'queued', 0, ?, ?, ?)
        """,
        (jid, batch_id or None, project_id, country_code, platform, payload_path, max_attempts, now, now),
    )
    return jid


def fetch_next_job(conn: sqlite3.Connection, worker_id: str) -> Job | None:
    """Atomically claim the next runnable job."""
    now = _utc_iso()
    conn.execute("BEGIN IMMEDIATE")
    try:
        row = conn.execute(
            """
            SELECT * FROM jobs
            WHERE status IN ('queued', 'retry_scheduled')
              AND (next_retry_at IS NULL OR next_retry_at <= ?)
            ORDER BY created_at ASC
            LIMIT 1
            """,
            (now,),
        ).fetchone()
        if row is None:
            conn.execute("COMMIT")
            return None
        jid = row["job_id"]
        conn.execute(
            """
            UPDATE jobs
            SET status = 'running', worker_id = ?, updated_at = ?
            WHERE job_id = ?
            """,
            (worker_id, now, jid),
        )
        conn.execute("COMMIT")
        r2 = conn.execute("SELECT * FROM jobs WHERE job_id = ?", (jid,)).fetchone()
        return _row_to_job(r2) if r2 else None
    except Exception:
        conn.execute("ROLLBACK")
        raise


def mark_job_done(
    conn: sqlite3.Connection,
    job_id: str,
    *,
    run_id: str,
    run_root: str,
) -> None:
    now = _utc_iso()
    conn.execute(
        """
        UPDATE jobs
        SET status = 'success', run_id = ?, run_root = ?, error = NULL,
            updated_at = ?, worker_id = NULL, next_retry_at = NULL
        WHERE job_id = ?
        """,
        (run_id, run_root, now, job_id),
    )


def mark_job_failed(
    conn: sqlite3.Connection,
    job_id: str,
    error: str,
    *,
    backoff_schedule_sec: tuple[int, ...] = (60, 300, 900),
) -> None:
    """Increment attempts; schedule retry with geometric backoff or mark failed."""
    now = _utc_iso()
    row = conn.execute("SELECT attempts, max_attempts FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
    if row is None:
        return
    attempts = int(row["attempts"]) + 1
    max_a = int(row["max_attempts"])
    err_short = (error or "")[:2000]
    if attempts < max_a:
        idx = min(attempts - 1, len(backoff_schedule_sec) - 1)
        delay = backoff_schedule_sec[idx]
        nxt = (datetime.now(timezone.utc) + timedelta(seconds=delay)).strftime("%Y-%m-%dT%H:%M:%SZ")
        conn.execute(
            """
            UPDATE jobs
            SET status = 'retry_scheduled', attempts = ?, error = ?,
                updated_at = ?, worker_id = NULL, next_retry_at = ?
            WHERE job_id = ?
            """,
            (attempts, err_short, now, nxt, job_id),
        )
    else:
        conn.execute(
            """
            UPDATE jobs
            SET status = 'failed', attempts = ?, error = ?,
                updated_at = ?, worker_id = NULL, next_retry_at = NULL
            WHERE job_id = ?
            """,
            (attempts, err_short, now, job_id),
        )


def reset_stale_running(
    conn: sqlite3.Connection,
    *,
    older_than_sec: int = 7200,
    requeue_as: str = "queued",
) -> int:
    """Optional recovery: requeue jobs stuck in running (process crash)."""
    # Minimal v1: no automatic sweep; placeholder for operators
    return 0


def open_queue(db_path: Path, init: bool = True) -> sqlite3.Connection:
    c = connect_queue_db(db_path)
    if init:
        init_queue_schema(c)
    return c
