<!--
Title: ADR-002 — Worker pool and local job queue
Status: active
Created: 2026-04-18
Updated: 2026-04-18
Related Files: ../../agent/executor_queue.py, ../../agent/executor_worker.py, ../../executor.py, ../../local_pipeline.py, ADR-001-MULTI-RUN-PARALLELIZATION.md
-->

# ADR-002: Worker pool and local job queue

## Context

- **Previous**: `local_pipeline.py` invoked `run_local_executor` sequentially per country; ADR-001 documented parallel desires without implementation.
- **Need**: Big-tech-style factory throughput on a single Windows host: many independent runs (country × project × platform) without an external message broker.

## Decision

1. **Queue store**: SQLite (`runs/executor_queue.db`, WAL mode) with a `jobs` table — no Redis/RabbitMQ for v1.
2. **Job model**: `job_id`, `batch_id`, `project_id`, `country_code`, `platform`, `payload_path`, `status`, `attempts`, `max_attempts`, timestamps, optional `run_root`, `error`, `next_retry_at`.
3. **Claiming**: `fetch_next_job` uses `BEGIN IMMEDIATE` + row lock pattern so exactly one worker owns a job.
4. **Execution**: Workers load JSON from `payload_path`, set `country_code`, call `run_local_executor`; **no DB connection held** during Gradle/npm.
5. **Retries**: On failure, `mark_job_failed` increments `attempts` and sets `retry_scheduled` with geometric backoff (60s / 300s / 900s) recorded in `next_retry_at`; terminal `failed` when `max_attempts` exhausted.
6. **CLI**: `python executor.py enqueue-batch --payload …` and `python executor.py worker --count N`; `local_pipeline.py --queue-workers N` wraps enqueue + pool.
7. **Stateless principle**: A run is fully determined by **payload JSON**, **repo/checkout state**, **job/run metadata** (`run_dir/`, queue rows). No hidden global mutable executor state; see **Consequences** for known module-level constants.

## Consequences

- **Positive**: True parallel runs (I/O bound stages) up to worker count; clear audit trail in SQLite + existing `task_result_report.json`.
- **Negative**: SQLite write contention under extreme parallelism; cap workers (~4–8) on one machine for Android builds sharing one tree.
- **Operational**: Operators may delete or archive `executor_queue.db`; jobs are not replicated.

### Global state audit (TODO / acceptable)

| Item | Risk | Mitigation |
|------|------|------------|
| `local_executor.ROOT` | Path constant | OK — not per-run mutable |
| `ctx._process_env_extra` | Per-context | OK |
| Env vars `LOCAL_EXECUTOR_*`, `EXECUTOR_DEVICE_*` | Host-wide | Documented; runs should not depend on undeclared env |
| Gradle daemon / npm cache | External | ADR: one worker per `source_root` for heavy builds (future constraint) |

## Related

- `docs/strategy/STRATEGY-METRICS-AND-QA.md` — KPI hooks after each `finalize_production`.
- `docs/strategy/STRATEGY-PROJECT-SCAFFOLDING.md` — onboarding new `project_id` rows consumed by jobs.
