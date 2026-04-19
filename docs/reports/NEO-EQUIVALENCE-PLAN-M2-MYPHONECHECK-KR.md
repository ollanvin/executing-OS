# Neo equivalence plan — M2 MyPhoneCheck KR

**Companion:** [`NEO-EQUIVALENCE-PLAN-WEBSTUB-KR-G20.md`](NEO-EQUIVALENCE-PLAN-WEBSTUB-KR-G20.md) (M1 Web/Android/G20)  
**Cursor evidence:** [`M2-MYPHONECHECK-KR-SMOKE-RUN-CURSOR.md`](M2-MYPHONECHECK-KR-SMOKE-RUN-CURSOR.md)  
**Spec:** [`MYPHONECHECK-KR-SMOKE-SPEC.md`](../projects/MYPHONECHECK-KR-SMOKE-SPEC.md)

## 1. Repository & layout

1. `git clone https://github.com/ollanvin/executing-OS.git`
2. `cd executing-OS` && `git checkout main` (use **`a9ab404`** or later — e.g. **`a18c9fb`** includes M2 Cursor report + Neo M2 plan).
3. Place **MyPhoneCheck Android repo** as sibling: `../myphonecheck` relative to clone root (same as `projects/MyPhoneCheck/config.json`).

## 2. Environment

| Variable | Required |
|----------|----------|
| `LOCAL_EXECUTOR_DRY_RUN` | `0` |
| `ANDROID_HOME` | Android SDK path |
| `JAVA_HOME` | JDK compatible with the project (optional if Gradle finds JBR) |

## 3. Neo command (Scenario A)

```powershell
cd <executing-OS-clone>
$env:LOCAL_EXECUTOR_DRY_RUN = "0"
$env:ANDROID_HOME = "<Sdk>"
python local_pipeline.py payloads\myphonecheck_kr.json
```

No config override required for baseline Scenario A.

## 4. Equivalence vs Cursor

Match **logical** fields only (ignore paths, UUIDs, timestamps):

| Field | Compare |
|-------|---------|
| `status` | e.g. `SUCCEEDED` |
| `validation` | `PASS` / `FAIL` |
| `gate_verdict` | e.g. `APPROVED` |
| `failure_class` | Same class if failed; expect **none** for Scenario A |
| `decision` / `decision_code` | If present in reports, must match |
| `countries_run` | `KR` |

Optional **with device:** same logcat **tag filters** and high-signal lines (Guard, TamperChecker, DecisionEngine, …) as documented in Cursor M2 report.

## 5. Logcat (optional parity)

When a device is attached and app is exercised:

```text
adb logcat -s MyPhoneCheck:* TamperChecker:* DecisionEngine:* CallIntercept:* PrivacyScanner:* SearchEnrichment:* BillingManager:* WorkManager:*
```

Record a short summary in `[NEO-RUN-RESULT]` or a dedicated `NEO-EQUIVALENCE-RUN-RESULTS-M2-MYPC.md` row.

## 6. Result template

```text
[NEO-RUN-RESULT]
payload: payloads/myphonecheck_kr.json
status:
validation:
gate:
failure_class:
decision:
countries_run:
key_logs:
notes:
[/NEO-RUN-RESULT]
```
