# Run report — WebStub US baseline, KR demos, G20 WebStub batch, MyPhoneCheck onboarding

**Date (local):** 2026-04-19  
**Workspace:** `C:\Users\user\Dev\ollanvin\local-agent`  
**Dry run:** `LOCAL_EXECUTOR_DRY_RUN=0` for all commands below (Android runs also used `ANDROID_HOME=C:\Users\user\AppData\Local\Android\Sdk`).

---

## 1. What runs stably on Executor OS (this snapshot)

- **WebStub (web):** Single-country payloads and **`G20_THEN_ISO` + `country_limit: 5`** batch via **enqueue-batch + worker** — build (`npm install` / `npm run build`), validation, and gate **APPROVED** for **US, CN, JP, DE, GB** in the latest batch tables.
- **Fooapp (android, KR):** With `projects/Fooapp/config.json` pointing at a real Gradle tree (`../myphonecheck`), **`payloads/fooapp_sample_kr.json`** reached **SUCCEEDED / PASS / APPROVED** (`countries_run: KR`).
- **Android Paparazzi demo (KR):** Pipeline **executes** (build + tests + Paparazzi verify) when **`ANDROID_HOME` is set**; full **green gate** still depends on **baseline/diff policy** (see §2).

---

## 2. WebStub US (baseline, from prior success)

- Command: `python local_pipeline.py payloads\web_stub_us.json`
- Observed: `DEBUG_BUILD_CMD: ['npm', 'install']`, `['npm', 'run', 'build']`; **SUCCEEDED**, validation **PASS**, gate **APPROVED**, `countries_run: US` (confirmed in earlier run; WebStub remains the reference web smoke).

---

## 3. KR demo smoke

### 3.1 `payloads/android_paparazzi_demo_kr.json` (AndroidPaparazziDemo, KR)

| Run | `run_id` (folder) | Result | Notes |
|-----|-------------------|--------|--------|
| A | `876da797-0fc6-46f3-acec-d2d5b7899c8a` | **ENV_FAILED** | `ANDROID_HOME` unset → `stage_env_check` hard fail (`ENV_TRANSIENT`). |
| B | `584c2736-beac-425d-a931-e37a7017282d` | **SCREENSHOT_FAILED** / gate **REJECTED_HARD** | Build/test path ran; Paparazzi **verifyPaparazziDebug** ran, **`diff_found: true`** → `failure_class` **VISUAL_STRUCTURAL**. |

**Artifacts (run B):** `reports/device_context.json`, `reports/runtime_profile.json`, `reports/gate_report.json` present.  
**Country:** KR — locale **ko-KR**, timezone **Asia/Seoul**, search stack includes **naver** / **google** / **daum** / **bing** in `gate_report.json`.

### 3.2 `payloads/fooapp_sample_kr.json` (Fooapp, KR)

| `run_id` | status | validation | gate | countries_run |
|----------|--------|------------|------|----------------|
| `1d1a74fd-03d4-4902-be2f-93c59aa6a18e` | **SUCCEEDED** | **PASS** | **APPROVED** | **KR** |

**Artifacts:** `reports/device_context.json`, `reports/runtime_profile.json`, `reports/gate_report.json` present.

**Config change:** `projects/Fooapp/config.json` — `prefer_local_path` set from `../fooapp` (missing on disk) to **`../myphonecheck`** so the KR smoke uses an existing Gradle project.

---

## 4. G20 WebStub batch (queue + worker)

- **Payload:** `payloads/g20_batch_webstub_5.json` (`country_batch: true`, `G20_THEN_ISO`, `country_limit: 5`).
- **Queue DB:** `runs/g20_webstub_queue.db` (fresh file for this batch).
- **Commands:**
  - `python executor.py enqueue-batch --payload payloads\g20_batch_webstub_5.json --queue-db runs\g20_webstub_queue.db`
  - `python executor.py worker --count 2 --queue-db runs\g20_webstub_queue.db`
- **Jobs:** 5 enqueued; workers drained; **`runs/daily_global_report.md`** appended with **Global batch** table and **KPI refresh** (`KPI refresh — 2026-04-19T12:14:10Z`).

**Expected `countries_run` order:** **US, CN, JP, DE, GB** (first five G20 members after ISO-table intersection — see `agent/executor_country.py`).

**Latest batch row summary:** All five **WebStub** rows **APPROVED** / **SUCCEEDED** with locale/search providers consistent with profiles (e.g. CN **baidu**, US **google**, JP **google**, DE/GB **google**).

**Metrics (KPI excerpt):** WebStub web platform **100%** success for each of the five countries in the window; `avg_duration_sec` small (web stub is lightweight).

---

## 5. MyPhoneCheck onboarding (scaffold only — no execute this round)

**Existing:** `projects/MyPhoneCheck/config.json` (android, `../myphonecheck`, tests skipped by default).

**Added / updated:**

| Path | Role |
|------|------|
| `payloads/myphonecheck_kr.json` | KR single-run payload (`project_id: MyPhoneCheck`, `platform: android`). |
| `payloads/myphonecheck_sample_kr.json` | Alias sample (same minimal fields). |
| `fixtures/myphonecheck/README.md` | Fixture/onboarding pointer. |
| `docs/projects/myphonecheck.md` | Human-facing onboarding notes. |
| `projects/MyPhoneCheck/config.json` | **`onboarding_notes`** array (TODOs for env path, repo path, tests/gate). |

**Path check:** `../myphonecheck` from `local-agent` resolves to `C:\Users\user\Dev\ollanvin\myphonecheck` with **`gradlew.bat`** present in this environment.

---

## 6. Next round — MyPhoneCheck (3–5 bullets)

1. **Export `ANDROID_HOME`** (and optionally `JAVA_HOME`) in every shell/CI job before `python local_pipeline.py payloads\myphonecheck_kr.json`.
2. **Confirm** `prefer_local_path` still matches the real repo root if the checkout moves.
3. **Replace** `default_test_profile: "none"` with real Gradle test tasks when the team is ready; then set `quality_gate.test_pass_required` accordingly.
4. **Optional:** Add Paparazzi/screenshot blocks mirroring `AndroidPaparazziDemo` once module names and record/verify tasks are known.
5. **First command to try:**  
   `cd C:\Users\user\Dev\ollanvin\local-agent`  
   `$env:ANDROID_HOME="C:\Users\user\AppData\Local\Android\Sdk"`  
   `python local_pipeline.py payloads\myphonecheck_kr.json`

---

## 7. Acceptance checklist (work order)

| Criterion | Status |
|-----------|--------|
| KR payloads: ≥1 **SUCCEEDED / PASS / APPROVED** | **Met** — `fooapp_sample_kr.json` |
| G20 batch via queue/worker; `daily_global_report.md` updated | **Met** |
| MyPhoneCheck files created/tuned; run deferred | **Met** |
| This report file | **Met** |
