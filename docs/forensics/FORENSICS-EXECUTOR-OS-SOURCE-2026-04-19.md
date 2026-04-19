# Executor OS source snapshot — local-agent (reference 2026-04-19)

**Role:** Pre-sync record of `C:\Users\user\Dev\ollanvin\local-agent` as the **Executor OS canonical working tree** before aligning `ollanvin/executing-OS`.

**Excluded from counts:** `runs/`, `__pycache__/`, `.git/` (local-agent had no `.git` in this workspace).

## Top-level layout

| Name | Kind |
|------|------|
| `agent/` | Python modules (executor_*, local_*, contracts, task_ops) |
| `data/` | `iso3166_alpha2.json` + README |
| `docs/` | `local-executor-os.md`, `strategy/`, `adr/`, `projects/`, `reports/` |
| `fixtures/` | `web_stub/`, `fooapp/`, `ios_stub/`, `myphonecheck/` |
| `payloads/` | JSON payloads (WebStub, G20 batch, Android/iOS/MyPhoneCheck samples) |
| `profiles/` | `cn.json`, `de.json`, `gb.json`, `jp.json`, `kr.json`, `us.json` |
| `projects/` | Per-app `config.json` (WebStub, Fooapp, AndroidPaparazziDemo, IosStubFrontEnd, MyPhoneCheck) |
| `executor.py` | CLI: enqueue-batch, worker, init-project |
| `local_pipeline.py` | Single-run / batch KPI entry |

## Approximate file counts (reference machine)

- `agent/`: 18 Python modules (+ `__init__.py`)
- `docs/`: strategy 4, adr 3 (+ reports/projects fragments at sync time)
- `payloads/`: 7 JSON files
- `profiles/`: 6 JSON files
- `projects/`: 5 `config.json`
- `fixtures/`: web stub (`package.json`, `scripts/*.js`, `dist/`), iOS stub strings, README stubs

## Note

After **M1 alignment**, the **Git repository `executing-OS`** is the published canonical tree; developers may keep a private `local-agent` mirror for Cursor, but **Neo/CI should clone `executing-OS` only**.
