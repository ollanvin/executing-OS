# ADR-003 — Legacy NeO “local agent” shell removed from executing-OS

## Status

Accepted (2026-04-19)

## Context

The `executing-OS` repository previously shipped a minimal NeO-oriented tree (`bot_server.py`, `ui/local-agent-bot.html`, `tasks/tasks.json`, root `config.json`, etc.) that was **not** the full Executor OS factory stack.

## Decision

As of the **executor-os-factory-m1** alignment:

- **Removed from the repo:** legacy NeO bot UI, `tasks/`, `assets/` branding-only trees, committed `artifacts/`, and obsolete `agent/*.py` modules (`bot_server.py`, `cli.py`, `main.py`, …) that duplicated or conflicted with Executor OS.
- **Preserved (optional):** `scripts/*.ps1` helpers for Gradle/ADB/logcat on Windows — useful for local debugging; they are **not** required for `local_pipeline.py` core stages.
- **Canonical code:** `agent/executor_*.py`, `agent/local_*.py`, `local_pipeline.py`, `executor.py`, `payloads/`, `projects/`, `profiles/`, `docs/strategy/`, `docs/adr/`.

## Consequences

- Clones must use **`python local_pipeline.py`** / **`python executor.py`** as documented in `docs/local-executor-os.md`.
- Historical NeO-only behaviour is **not** supported in this branch; recover from Git history prior to the M1 alignment commit if needed.
