# MyPhoneCheck — KR smoke & dry-run spec (Cursor / Neo shared)

**Status:** Scenario A executed on Cursor (M2) — see [`M2-MYPHONECHECK-KR-SMOKE-RUN-CURSOR.md`](../reports/M2-MYPHONECHECK-KR-SMOKE-RUN-CURSOR.md). Scenarios B/C still backlog.  
**Payload:** `payloads/myphonecheck_kr.json`  
**Project config:** `projects/MyPhoneCheck/config.json`

## 1. Scope

Validate that Executor OS can drive a **minimal Android factory path** for MyPhoneCheck: env → source resolution → **assembleDebug** (and optional checks), then validation/gate — **without** requiring full product UI automation in M1.

## 2. Preconditions

- `prefer_local_path` resolves to the real MyPhoneCheck Gradle root (default `../myphonecheck` from repo root).
- `ANDROID_HOME` set; JDK compatible with the project.
- `default_test_profile: "none"` initially; gate does not require tests until enabled.

## 3. Scenario A — “Happy path” build smoke

| Step | Description |
|------|-------------|
| A1 | Clean worktree; device optional (runtime smoke off). |
| A2 | Run `python local_pipeline.py payloads\myphonecheck_kr.json`. |
| A3 | Expect **Gradle assembleDebug** success in `build/build.log`. |

**Expected Executor outcomes (M1):**

| Field | Expected |
|-------|----------|
| `status` | `SUCCEEDED` |
| `validation` | `PASS` |
| `gate_verdict` | `APPROVED` |
| `countries_run` | `KR` |
| `failure_class` | *(empty / none)* |

## 4. Scenario B — Guard / tamper FAIL (future)

**Goal:** When product supports a reproducible guard failure (e.g. emulator root / signature mismatch), record:

- Expected `gate_verdict` (e.g. `REJECTED_HARD` or soft reject per policy)
- Expected `failure_class` from `gate_report.json` / `failure_analyses`
- **Logcat tags (8-tag set for triage):** `TamperChecker`, `DecisionEngine`, `AppGuard`, `BootFlow`, `HomeNav`, `NetworkProbe`, `StorageAudit`, `ExecBridge` — *adjust names to match actual MyPhoneCheck `Log` tags when known; this list is the cross-team placeholder until log taxonomy is frozen.*

For each tag, note **one** exemplar line pattern (e.g. `TamperChecker: verdict=FAIL reason=…`).

## 5. Scenario C — Extended UI journey (later)

- **C1:** Install + first launch → Home “4 cards” visible (may require `runtime_smoke_required` and instrumentation).
- **C2:** Not in M1 scope; enable when screenshot/runtime stages are configured for MyPhoneCheck.

## 6. Artefacts to archive per run

- `reports/gate_report.json`, `reports/validation_report.json`, `reports/environment_snapshot.json`
- `reports/device_context.json`, `reports/runtime_profile.json` (when generated)
- `build/build.log`

## 7. Next round workorder (execution)

1. Run Scenario A on Cursor; paste `[NEO-RUN-RESULT]` block into Neo equivalence doc.  
2. Repeat on Neo clone; diff logical fields only.  
3. If mismatch: compare `ANDROID_HOME`, Gradle path, and `prefer_local_path`.

## 8. Neo environment applicability

The spec is **environment-agnostic**: a Neo runner only needs the same **repo layout** (`executing-OS` clone + sibling app repo per `prefer_local_path`), **`ANDROID_HOME`**, and the **same payload path**. No Cursor-only steps. Optional guard/logcat scenarios (§4) apply unchanged once log tags are aligned with the real app.

See also [`myphonecheck.md`](myphonecheck.md).
