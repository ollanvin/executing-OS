<!--
Title: Local Executor OS v1
Status: active
Created: 2026-04-10
Updated: 2026-04-18
Related Files: ../agent/local_executor.py, ../executor.py, ../agent/executor_queue.py, ../agent/executor_worker.py, ../agent/executor_metrics.py, strategy/STRATEGY-METRICS-AND-QA.md, strategy/STRATEGY-PROJECT-SCAFFOLDING.md, adr/ADR-002-WORKER-POOL-QUEUE.md
-->

# Local Executor OS v1 (Windows)

Single-machine orchestration for an **App Factory**-style loop: source → environment → build → test → screenshot (Paparazzi) → runtime evidence → validator → gatekeeper → artifacts manifest.

## Module map

| Module | Role |
|--------|------|
| `executor_schema.py` | **Policy-as-code**: merges payload, `projects/*/config.json`, defaults, `country_profile` from `profiles/{cc}.json`, iOS profile hints (`ios_*_profile`). |
| `executor_country.py` | G20→ISO country ordering, `country_profile` merge, `search_providers` hooks, **merged runtime_profile** (device + policy). |
| `executor_device.py` | **Initial device scan** → `reports/device_context.json` (host/adb + `EXECUTOR_DEVICE_*` overrides). |
| `executor_fingerprint.py` | **Environment snapshot** (`reports/environment_snapshot.json`) linked from all human reports. |
| `executor_queue.py` | SQLite job queue (`runs/executor_queue.db`) for parallel factory runs. |
| `executor_worker.py` | Worker pool; claims jobs, runs `run_local_executor`, retries with backoff. |
| `executor_metrics.py` | JSONL run events + KPI markdown for `daily_global_report.md`. |
| `executor_init_project.py` | Onboarding scaffold (used by `executor.py init-project`). |
| `executor_daily_report.py` | Batch tables + `append_kpi_section_only` for QA loop. |
| `executor_recipes.py` | **Transient-only** remediation (`gradle_clean_rebuild`, `adb_reconnect`, `npm_ci`). Invoked only when `failure_class` is in `ENV_TRANSIENT` / `BUILD_TRANSIENT` / `NETWORK_TRANSIENT`. |
| `executor_failure.py` | Assigns `failure_class` and escalation hints (`escalation_target`, `escalation_reason`). |
| `executor_screenshot.py` | Paparazzi artifact mirror + diff heuristics (Gradle exit, JUnit XML `<failure>`, log/delta hints). |
| `local_executor.py` | **Pipeline engine**: stages, retries, report skeleton, iOS Windows preflight, Android Paparazzi stage ordering (**BUILD → TEST → SCREENSHOT → RUNTIME**). |
| `local_validator.py` | Evidence + policy checks → `validation_report.json` / `.md`. |
| `local_gatekeeper.py` | Business gate → `gate_report.json` / `.md`. |
| `local_pipeline.py` | **CLI entry**: sequential runs; `--queue-workers N` / `--enqueue-only`. |
| `executor.py` | **Factory CLI**: `enqueue-batch`, `worker`, `init-project`. |

### Factory throughput (queue + workers)

- **Enqueue**: `python executor.py enqueue-batch --payload payloads/g20_batch_webstub_5.json`
- **Workers**: `python executor.py worker --count 3` (parallel consumers; see ADR-002)
- **One-shot**: `python local_pipeline.py payloads/...json --queue-workers 3`
- **Metrics**: each `finalize_production` appends `runs/metrics/run_events.jsonl`; KPI tables via `append_kpi_section_only`.

### Dependency graph (high level)

```
local_pipeline → local_executor
local_executor → schema, fingerprint, recipes, screenshot, country, failure
local_executor → validator ← gatekeeper (finalize_production)
```

## iOS strategy (no Mac on executor host)

- `platform: "ios"` skips **native** `xcodebuild`/IPA work on Windows.
- Payload fields: `ios_build_profile`, `ios_test_profile`, `ios_runtime_profile` describe what **Mac/CI** should run later; reports include `ios_strategy` explaining handoff.
- Windows-side stages: **`IOS_FRONTEND`** validates navigation/resource evidence (e.g. `flows.json`, required string files). Passing the gate means “safe to schedule on Mac/CI”, not “shipped to App Store”.

## Country execution order (G20 → ISO)

- Constant `G20_MEMBER_ISO_CODES_ORDERED` in `executor_country.py` (19 alpha-2 members; EU has no ISO alpha-2 code).
- Full table: `data/iso3166_alpha2.json`.
- `country_selection_mode`: **`G20_THEN_ISO`** (default) — G20 list first (deduped), then all other ISO codes **sorted A–Z**.
- `country_limit`: optional cap on how many countries to run in batch mode.
- `country_batch`: when **true**, `local_pipeline.py` runs one executor pass per selected country and appends **`runs/daily_global_report.md`**.
- Single-country runs: set `country_batch: false` (default) and `country_code` (or project default).

### G20 vs EU (policy)

The **European Union** participates in the G20 as an institution but has **no** ISO 3166-1 alpha-2 country code. This executor **does not** inject a synthetic `EU` row into `G20_THEN_ISO`. EU-related compliance is modeled via **member-state** profiles (e.g. `de.json`, `fr.json` when added) and product rules. See `executor_country.build_g20_then_iso_country_list` docstring and `docs/strategy/STRATEGY-ISO-DATA-MANAGEMENT.md`.

## Device scan vs country preset (no conceptual clash)

| Layer | Wins for | Source |
|-------|-----------|--------|
| **Device initial scan** | `locale.system_language`, `region`, `timezone`, phone/date/time/number formats, SIM/network country hints | `device_context.json` |
| **Country profile (policy)** | `search_providers`, `legal`, `feature_flags`, `store`, `age_limit`, `payment_methods`, recommended UI locale label | `profiles/*.json` |
| **Overrides** | When `policy_overrides.force_locale` / `force_timezone` / format forces are **true**, country preset may replace device fields for compliance runs | `country_profile.policy_overrides` |

Merged result: **`reports/runtime_profile.json`** (`build_merged_runtime_execution_profile`). Subprocess env after the merge uses **`country_process_env_from_runtime_execution`** so JVM locale tracks device-first values unless forced.

## Country profiles

- Files: `profiles/{cc}.json` with optional `id`, `locale_default`, `search_providers` (`primary` / `secondary` / `others`), `policy_overrides`, `store`, `age_limit`, `payment_methods`.
- Merged into `payload.country_profile` and copied to `task_result_report.country_profile`.
- Use `country_code` in payload or `default_country_code` in project config.

## Failure classes and retries

- **TRANSIENT** (`ENV_*`, `BUILD_TRANSIENT`, `NETWORK_TRANSIENT`): may run recipes and retry up to `retry_policy.max_attempts_*`.
- **STRUCTURAL** (`*_STRUCTURAL`): at most `structural_max_attempts` attempts per stage (default **1** = no pointless retries). Escalation fields populated in reports.
- **Screenshot** retries: `max_attempts_screenshot`; on transient failure only **`gradle_clean_rebuild`** is applied (per factory recipe policy).
- **Pipeline cap**: `max_pipeline_attempts` documented in `retry_limits` (outer loop is operator/CI responsibility for v1).

## Reports (fixed sections)

JSON reports include blocks for:

- Executor summary  
- Environment snapshot link  
- Screenshot summary (Paparazzi + runtime)  
- Failure classification + escalation hint  
- Country / locale info  

Markdown mirrors (`task_result_report.md`, `validation_report.md`, `gate_report.md`) are one-page oriented.

## Projects layout

- `projects/{ProjectId}/config.json` — executor project defaults (paths, Gradle tasks, screenshot block, quality gate).
- Sample payloads under `payloads/`.
