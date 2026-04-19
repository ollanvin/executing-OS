# Sync report — executing-OS aligned from local-agent (2026-04-19)

## Method

- **Source:** `C:\Users\user\Dev\ollanvin\local-agent`
- **Target:** `C:\Users\user\Dev\ollanvin\executing-OS` (existing `main` remote: `https://github.com/ollanvin/executing-OS.git`)
- **Mechanism:** `robocopy` with excludes, then **manual removal** of legacy NeO-only paths and **restoration** of optional Windows helper scripts.

## Included (from local-agent)

- `agent/` — full Executor OS module set (`executor_country`, `executor_device`, queue/worker/init-project, local_executor, validator, gatekeeper, …)
- `data/`, `docs/` (incl. `strategy/`, `adr/`, `projects/`, `reports/`), `fixtures/`, `payloads/`, `profiles/`, `projects/`
- `executor.py`, `local_pipeline.py`

## Excluded from copy

- `runs/` (generated)
- `__pycache__/`, `node_modules/`, `.venv` / `venv`
- `.env`, `.env.local` (filename excludes in robocopy)

## Removed from pre-sync executing-OS (legacy)

- `agent/` NeO-era files: `bot_server.py`, `build_prompt_generator.py`, `cli.py`, `executor.py`, `main.py`, `models.py`, `os_copilot_runner.py`, `_t.log`
- Directories: `ui/`, `tasks/`, `artifacts/`, `assets/`
- Root: `config.json` (NeO), `.env.txt`, `local-agent.log`, old `README.md`

## Preserved / re-added

- `scripts/*.ps1` (Gradle/ADB/logcat/git snapshot helpers) from pre-sync backup — optional; not required for core pipeline.

## `.gitignore` (canonical)

Ignores: `.env*`, `*.log`, `runs/`, `__pycache__/`, `node_modules/`, `artifacts/`, IDE dirs.

## Git

- **Primary M1 tree commit:** `84d99b2` — *Align executing-OS repo with local-agent Executor OS (factory M1)* (bulk file add/remove).
- **Follow-ups:** documentation-only commits on `main` through tag publication.
- **Tag:** `executor-os-factory-m1` (annotated). Use `git show executor-os-factory-m1` for the exact snapshot commit after clone.

## Canonical repo going forward

**`ollanvin/executing-OS` on `main`** is the **Executor OS factory M1 canonical source** for Neo and automation. Local `local-agent` folders should be refreshed from this repo when drifting.

## Related

- [`ADR-003`](../adr/ADR-003-LEGACY-NEO-AGENT-REMOVED.md)
- [`FORENSICS-EXECUTOR-OS-SOURCE-2026-04-19.md`](../forensics/FORENSICS-EXECUTOR-OS-SOURCE-2026-04-19.md)
