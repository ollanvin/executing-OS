# M2 — MyPhoneCheck KR smoke run (Cursor baseline)

**When:** 2026-04-19 (UTC run timestamps in `task_result_report.json`)  
**Repo:** `C:\Users\user\Dev\ollanvin\executing-OS`  
**Git:** Pipeline executed with tree **`a9ab40432da1c2fbff03e17e7be3b3d722c8246c`** (`main`). This report file was committed as **`df23704`** (docs-only follow-up).

## Spec scenarios executed

| Scenario | Run? | Notes |
|----------|------|--------|
| **A** — Happy path build smoke | Yes | Matches [`MYPHONECHECK-KR-SMOKE-SPEC.md`](../projects/MYPHONECHECK-KR-SMOKE-SPEC.md) §3 |
| **B** — Guard / tamper FAIL | No | Future; requires reproducible guard path + device |
| **C** — Extended UI | No | Out of M2 scope |

## Environment

```powershell
cd C:\Users\user\Dev\ollanvin\executing-OS
$env:LOCAL_EXECUTOR_DRY_RUN = "0"
$env:ANDROID_HOME = "C:\Users\user\AppData\Local\Android\Sdk"
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
```

- **App tree:** `projects/MyPhoneCheck/config.json` → `prefer_local_path` `../myphonecheck` (sibling repo on this machine).
- **Payload:** `payloads/myphonecheck_kr.json` (unchanged).

## Command

```text
python local_pipeline.py payloads\myphonecheck_kr.json
```

## Run directory

`runs/MyPhoneCheck/0ffeb37c-bdbb-4150-9558-1814cecda137/`

Key artefacts:

- `reports/device_context.json` — `scan_method: host_fallback` (no handset; Windows host baseline).
- `reports/runtime_profile.json`
- `reports/gate_report.json`
- `build/build.log` — Gradle `assembleDebug`

## Logcat (Guard / product tags)

**Device state:** `adb devices` showed **no attached device** at run time, so **no logcat** was captured.

When a device is available, use (from workorder — adjust app tag if package differs):

```bash
adb logcat -s MyPhoneCheck:* TamperChecker:* DecisionEngine:* CallIntercept:* PrivacyScanner:* SearchEnrichment:* BillingManager:* WorkManager:*
```

**Expected for Scenario A (this run):** N/A without install/runtime; Executor path is build + gate only. For Neo parity with device, re-run logcat during/after a manual install if runtime stages are enabled later.

## Spec vs actual (Scenario A)

| Field | Expected | Actual |
|-------|----------|--------|
| status | SUCCEEDED | SUCCEEDED |
| validation | PASS | PASS |
| gate | APPROVED | APPROVED |
| countries_run | KR | KR |
| failure_class | (none) | none (`failure_analyses` empty) |

**Conclusion:** Scenario A **OK** — matches spec.

---

## [M2-CURSOR-RUN-RESULT]

```text
[M2-CURSOR-RUN-RESULT]
payload: payloads/myphonecheck_kr.json
status: SUCCEEDED
validation: PASS
gate: APPROVED
failure_class: (none)
decision: (none — no decision_code in gate/task reports)
countries_run: KR
key_logs:
  - (no device — adb devices empty; logcat not captured)
  - Neo/device runs: use adb logcat -s MyPhoneCheck:* TamperChecker:* DecisionEngine:* CallIntercept:* PrivacyScanner:* SearchEnrichment:* BillingManager:* WorkManager:*
conclusion: 스펙 시나리오 A와 일치 (OK). 시나리오 B/C 및 logcat 검증은 기기 연결 후 후속 라운드.
[/M2-CURSOR-RUN-RESULT]
```
