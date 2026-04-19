<!--
Title: Metrics, KPIs, and factory QA loop
Status: active
Created: 2026-04-18
Updated: 2026-04-18
Related Files: ../../agent/executor_metrics.py, ../../agent/executor_daily_report.py, ../../agent/local_executor.py, STRATEGY-COUNTRY-PROFILES.md, ../adr/ADR-002-WORKER-POOL-QUEUE.md
-->

# Strategy: Metrics and QA loop

## Context

Executor OS produces rich per-run artifacts (`task_result_report.json`, `gate_report_v2`). Factory operations need **aggregated** visibility: success rate, latency, and recurring `failure_class` patterns by market.

## Decision

1. **Event log**: Append-only JSONL at `runs/metrics/run_events.jsonl` (one line per finalized run).
2. **Hook**: `finalize_production` calls `record_run_metrics(ROOT, ctx)` (best-effort; failures logged, never fail the gate).
3. **Fields** (minimum): `ts_utc`, `project_id`, `country_code`, `platform`, `run_id`, `run_root`, `pipeline_status`, `gate_verdict`, `validation_verdict`, `success`, `duration_sec`, `failure_class`, optional `job_id` / `batch_id`.
4. **Daily report**: After multi-country batches, `append_kpi_section_only` appends a **KPI block** (last 7 days UTC) with:
   - Per **day / project / country / platform**: `total_runs`, success/fail counts, `success_rate`, `avg_duration_sec`, dominant `failure_class`.
   - **Attention** table: failed runs grouped by `(project, country, platform)` × top `failure_class`.
5. **Process loop**: Weekly review of **top 5 failure_class clusters** → actions: test case gaps, env docs, `country_profile` / recipe updates, ADR if architectural.

## Consequences

- Disk growth is linear in runs; rotate/archive JSONL per quarter if needed.
- KPI block is **Markdown-only summary**; source of truth remains JSONL + per-run JSON.

## Failure taxonomy

Map executor `failure_class` values (`ENV_TRANSIENT`, `TEST_STRUCTURAL`, …) into executive buckets in reviews:

| Bucket | Typical classes |
|--------|-----------------|
| Network | `NETWORK_TRANSIENT` |
| Environment | `ENV_TRANSIENT`, missing `ANDROID_HOME`, etc. |
| App / test | `TEST_STRUCTURAL`, `BUILD_STRUCTURAL` |
| Visual | `VISUAL_STRUCTURAL` |
| Unknown | empty or new classes |
