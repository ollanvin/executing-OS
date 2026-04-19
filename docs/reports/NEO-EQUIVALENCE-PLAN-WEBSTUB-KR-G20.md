# Neo equivalence plan — WebStub / KR Android / G20 WebStub batch

## 1. Neo runtime assumptions

| Topic | Assumption |
|-------|------------|
| **Repository** | `git clone https://github.com/ollanvin/executing-OS.git` |
| **Python** | 3.11+ (3.14 acceptable if dependencies install); same major as Cursor validation when possible |
| **Node / npm** | LTS Node; `npm` available — on Windows subprocess uses resolved `npm.cmd` (see `local_executor._normalize_subprocess_argv`) |
| **Android (Fooapp / MyPhoneCheck payloads)** | JDK + `ANDROID_HOME` pointing at Android SDK; `gradlew.bat` in the **sibling** app repo (see `projects/*/config.json` → `prefer_local_path`) |
| **Dry run** | `LOCAL_EXECUTOR_DRY_RUN=0` for parity with Cursor “real” runs |

**Layout:** Check out **executing-OS** and place app repos **next to it** as today (e.g. `…/workspace/myphonecheck`, `…/workspace/executing-OS`, with `prefer_local_path: "../myphonecheck"`).

## 2. Payloads to verify first

| Payload | Purpose |
|---------|---------|
| `payloads/web_stub_us.json` | Web pipeline, single country US |
| `payloads/fooapp_sample_kr.json` | Android KR smoke (expects real Gradle tree at `../myphonecheck` per `projects/Fooapp/config.json`) |
| `payloads/g20_batch_webstub_5.json` | G20 top-5 WebStub batch (`US, CN, JP, DE, GB`) via queue |

## 3. Commands (Neo)

```powershell
cd <executing-OS-clone>
$env:LOCAL_EXECUTOR_DRY_RUN = "0"
$env:ANDROID_HOME = "<SdkPath>"   # for Android payloads

python local_pipeline.py payloads\web_stub_us.json
python local_pipeline.py payloads\fooapp_sample_kr.json

python executor.py enqueue-batch --payload payloads\g20_batch_webstub_5.json --queue-db runs\neo_equiv_queue.db
python executor.py worker --count 2 --queue-db runs\neo_equiv_queue.db
```

Use a **fresh** `--queue-db` if you need an isolated batch (optional).

## 4. Equivalence criteria (Cursor vs Neo)

Compare **logical** outcomes only:

| Field | Must match |
|-------|------------|
| `status` | e.g. `SUCCEEDED` / same terminal failure |
| `validation` | `PASS` / `FAIL` |
| `gate_verdict` | e.g. `APPROVED`, `REJECTED_HARD`, … |
| `countries_run` | Same list/order for batch (e.g. `US,CN,JP,DE,GB`) |
| `failure_class` | Same class when failed (e.g. `ENV_TRANSIENT`, `VISUAL_STRUCTURAL`) |

**Ignore:** absolute paths, timestamps, run UUIDs, device serials, log line numbers.

**Interpretation:** If Neo matches on the above for all three scenarios, **Executor OS behaviour is equivalent** for M1 Web/Android smoke + G20 Web batch.

## 5. Neo result template

```text
[NEO-RUN-RESULT]
payload: payloads\web_stub_us.json
status: SUCCEEDED
validation: PASS
gate: APPROVED
countries_run: US
notes: (환경 차이, 로그 차이 등)
[/NEO-RUN-RESULT]
```

Repeat per payload / per batch.

## 6. Reference (Cursor baseline)

Cursor-local baseline is documented in `RUN-2026-04-19-WEBSTUB-KR-G20-MYPC-ONBOARDING.md` (same `docs/reports/`).
