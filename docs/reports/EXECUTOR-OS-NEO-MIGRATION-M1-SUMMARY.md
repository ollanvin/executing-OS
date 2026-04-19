# Executor OS — Neo migration M1 summary (2026-04-19)

## 1. Repo alignment

- **`ollanvin/executing-OS`** was reset to match the **Executor OS** tree previously validated under Cursor `local-agent` (robocopy + legacy NeO removal + `.gitignore` + docs).
- **Tag:** `executor-os-factory-m1` — factory-first snapshot for Neo clones (annotated; **`git checkout executor-os-factory-m1`**). Pushed to `origin`.
- **Canonical source:** After M1, **GitHub `executing-OS` `main`** is the **Executor OS** canonical tree (not the ad-hoc `local-agent` folder).

## 2. Neo first tests

Run in order (see [`NEO-EQUIVALENCE-PLAN-WEBSTUB-KR-G20.md`](NEO-EQUIVALENCE-PLAN-WEBSTUB-KR-G20.md)):

1. `python local_pipeline.py payloads\web_stub_us.json`
2. `python local_pipeline.py payloads\fooapp_sample_kr.json` (requires sibling Android repo + `ANDROID_HOME`)
3. `python executor.py enqueue-batch --payload payloads\g20_batch_webstub_5.json` then `python executor.py worker --count 2`

## 3. MyPhoneCheck

- **Spec only this round:** [`MYPHONECHECK-KR-SMOKE-SPEC.md`](../projects/MYPHONECHECK-KR-SMOKE-SPEC.md)
- Payload `payloads/myphonecheck_kr.json` and `projects/MyPhoneCheck/config.json` are ready; **execution** is deferred to the next workorder.

## 4. Completion criterion (Neo vs Cursor)

> **When Neo produces the same logical results as Cursor** — `status`, `validation`, `gate_verdict`, `countries_run`, and `failure_class` (if any) — for the three baseline scenarios above, **Executor OS Neo migration M1 is complete.**

Path/timestamp differences do **not** invalidate parity.

**M1 equivalence evidence:** [`NEO-EQUIVALENCE-RUN-RESULTS-M1.md`](NEO-EQUIVALENCE-RUN-RESULTS-M1.md) (Cursor worktree vs fresh Git clone on the same host; repeat on Neo VM/CI for final sign-off).

## 4b. M2 — MyPhoneCheck KR dry-run (Cursor → Neo)

- **Cursor:** Run `python local_pipeline.py payloads\myphonecheck_kr.json` with `ANDROID_HOME` set and `../myphonecheck` resolving; capture `status`, `validation`, `gate`, `countries_run`, and archive `reports/*.json` + `build/build.log` per [`MYPHONECHECK-KR-SMOKE-SPEC.md`](../projects/MYPHONECHECK-KR-SMOKE-SPEC.md).
- **Neo:** Fresh `executing-OS` clone, identical layout and env; run the **same** payload; compare logical fields only (same table as M1).
- **Gate:** Extend [`NEO-EQUIVALENCE-RUN-RESULTS-M1.md`](NEO-EQUIVALENCE-RUN-RESULTS-M1.md) or add `NEO-EQUIVALENCE-RUN-RESULTS-M2-MYPC.md` with a MyPhoneCheck row.
- **Product readiness:** When Scenario A matches on both sides, treat MyPhoneCheck as **vision-verification ready** for factory handoff; Scenarios B/C remain backlog until guard/UI automation exists.

## 5. References

| Doc | Purpose |
|-----|---------|
| [`SYNC-2026-04-19-EXECUTING-OS-FROM-LOCAL-AGENT.md`](SYNC-2026-04-19-EXECUTING-OS-FROM-LOCAL-AGENT.md) | What was copied / removed |
| [`FORENSICS-EXECUTOR-OS-SOURCE-2026-04-19.md`](../forensics/FORENSICS-EXECUTOR-OS-SOURCE-2026-04-19.md) | local-agent snapshot reference |
| [`ADR-003`](../adr/ADR-003-LEGACY-NEO-AGENT-REMOVED.md) | Legacy NeO removal |
| [`NEO-EQUIVALENCE-RUN-RESULTS-M1.md`](NEO-EQUIVALENCE-RUN-RESULTS-M1.md) | M1 Cursor vs Neo-clone run matrix + decision block |
