# Neo equivalence run results — M1 (WebStub US / Fooapp KR / G20 batch)

**Date (UTC):** 2026-04-19  
**Repo:** `https://github.com/ollanvin/executing-OS.git` (`main` @ `executor-os-factory-m1`)  
**Criteria:** [`NEO-EQUIVALENCE-PLAN-WEBSTUB-KR-G20.md`](NEO-EQUIVALENCE-PLAN-WEBSTUB-KR-G20.md)

## Environment disclaimer

| Label | What was used |
|-------|----------------|
| **Cursor** | Long-lived worktree `C:\Users\user\Dev\ollanvin\executing-OS` (tracked `main`, same tree as GitHub M1). *Note:* Path `local-agent` was not present on this host; this worktree substitutes the prior Cursor-validated tree. |
| **Neo** | **Fresh clone:** `git clone https://github.com/ollanvin/executing-OS.git` → `C:\Users\user\Dev\ollanvin\_neo_equiv_executing-OS`, `main`, `git status` clean, `git describe` → `executor-os-factory-m1`. Same Windows host — simulates Neo’s “clean checkout” procedure; a **real Neo VM/CI** should repeat the same commands and compare again. |

**Common runtime:** `LOCAL_EXECUTOR_DRY_RUN=0`; Android payloads used `ANDROID_HOME=C:\Users\user\AppData\Local\Android\Sdk`. Fooapp expects sibling Gradle repo `..\myphonecheck` relative to clone root (`projects/Fooapp/config.json`).

---

## Summary table (logical fields only)

| payload | env | status | validation | gate | countries_run | notes |
|---------|-----|--------|------------|------|---------------|--------|
| `payloads/web_stub_us.json` | Cursor | SUCCEEDED | PASS | APPROVED | US | Run dir `runs/WebStub/5d73077f-…` |
| `payloads/web_stub_us.json` | Neo | SUCCEEDED | PASS | APPROVED | US | Run dir `runs/WebStub/ba8c6ddd-…` |
| `payloads/fooapp_sample_kr.json` | Cursor | SUCCEEDED | PASS | APPROVED | KR | Run dir `runs/Fooapp/b77d6de3-…` |
| `payloads/fooapp_sample_kr.json` | Neo | SUCCEEDED | PASS | APPROVED | KR | Run dir `runs/Fooapp/3d7ec2d3-…` |
| `payloads/g20_batch_webstub_5.json` (×5 jobs) | Cursor | SUCCEEDED | PASS | APPROVED | US, CN, JP, DE, GB | Queue `runs/eq_cursor_g20.db`, workers=2; per-country `task_result_report.json` all SUCCEEDED / PASS / APPROVED |
| `payloads/g20_batch_webstub_5.json` (×5 jobs) | Neo | SUCCEEDED | PASS | APPROVED | US, CN, JP, DE, GB | Queue `runs/eq_neo_g20.db`, workers=2; same per-country outcomes |

**Batch detail:** Country set matches `G20_THEN_ISO` + `country_limit: 5`. Job completion order may vary (parallel workers); each country’s **status / validation / gate** matched across Cursor vs Neo clone.

**Artifacts:** Both trees appended **KPI refresh** to `runs/daily_global_report.md` (timestamps/paths differ; ignored per plan).

---

## [NEO-EQUIVALENCE-M1-DECISION]

```text
[NEO-EQUIVALENCE-M1-DECISION]
- web_stub_us: EQUIVALENT — status, validation, gate, countries_run match (Cursor worktree vs fresh clone).
- fooapp_sample_kr: EQUIVALENT — same logical outcome; ANDROID_HOME + sibling myphonecheck layout identical.
- g20_batch_webstub_5: EQUIVALENT — five WebStub jobs all SUCCEEDED / PASS / APPROVED for US,CN,JP,DE,GB on both sides.
- conclusion:
  "On this host, a fresh GitHub clone reproduces Cursor worktree logical results for all three M1 scenarios. For formal sign-off, run the same commands on the target Neo VM/CI and confirm the same four fields; if they match, Executor OS Neo migration M1 is complete for that environment."
[/NEO-EQUIVALENCE-M1-DECISION]
```

---

## Follow-up for real Neo

1. On Neo: clone → `git status` clean → run the three command blocks from [`NEO-EQUIVALENCE-PLAN-WEBSTUB-KR-G20.md`](NEO-EQUIVALENCE-PLAN-WEBSTUB-KR-G20.md).  
2. Paste filled `[NEO-RUN-RESULT]` blocks below this line (optional).

```text
[NEO-RUN-RESULT]
payload: (Neo VM)
status:
validation:
gate:
countries_run:
notes:
[/NEO-RUN-RESULT]
```
