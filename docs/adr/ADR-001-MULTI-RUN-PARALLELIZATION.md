<!--
Title: ADR-001 — Multi-country executor runs: parallel execution
Status: superseded (implementation: ADR-002)
Created: 2026-04-18
Updated: 2026-04-18
Related Files: ADR-002-WORKER-POOL-QUEUE.md, ../../local_pipeline.py, ../../executor.py
-->

# ADR-001: Multi-country pipeline parallelization

> **Note:** Local file-backed queue + worker pool is specified in **ADR-002**. This ADR remains as historical design rationale.

## Context

`local_pipeline.py` resolves `country_batch` + `G20_THEN_ISO` into an ordered country list and invokes `run_local_executor` **sequentially** for each code. This matches current Windows-first reliability goals (single Gradle daemon, shared `adb`, predictable logs).

## Decision (current)

- **Status quo**: sequential execution only; **no** worker pool in this ADR’s implementation window.

## Target state (future sprint)

- **Queue interface**: `Iterable[ExecutorPayload]` → `ExecutionJob` objects with `run_id`, `country_code`, `project_id`.
- **Worker pool**: bounded concurrency (default 1–2 on dev laptops; CI may use N=4 with resource locks).
- **Shared resources**: Gradle/Android locks per `source_root`; npm locks per web root; global `runs/` layout unchanged.
- **Reporting**: `daily_global_report.md` aggregated from job results; optional `runs/batch_{batch_id}.json` manifest.

## Trade-offs

| Sequential (now) | Parallel (target) |
|------------------|-------------------|
| Simple failure isolation | Needs deadlock avoidance (Gradle, file locks) |
| Low peak CPU/IO | Faster wall-clock for large `country_limit` |
| One `countries_run` print per process | Requires batch coordinator summary |

## Constraints

- **Android**: avoid concurrent `gradlew` on same `prefer_local_path` without file locks.
- **Evidence**: each run keeps its own `runs/{project_id}/{run_id}/` tree; parallel runs must not share `run_id`.

## Implementation checklist (future)

1. Introduce `ExecutorBatchCoordinator` protocol (submit / wait / collect).
2. Add `payload.max_parallel_runs: int` (default 1) and env `LOCAL_EXECUTOR_MAX_PARALLEL`.
3. Unit-test ordering: G20 prefix unchanged regardless of completion order.
4. Stress-test `daily_global_report` append with file lock or atomic write.
5. Document capacity planning in `STRATEGY-ISO-DATA-MANAGEMENT.md` if batch sizes grow.

## Out of scope

- Distributed execution across machines (Kubernetes, etc.) — separate ADR.
