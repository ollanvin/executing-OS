<!--
Title: Project scaffolding (init-project) for Executor OS
Status: active
Created: 2026-04-18
Updated: 2026-04-18
Related Files: ../../agent/executor_init_project.py, ../../executor.py, ../local-executor-os.md, STRATEGY-COUNTRY-PROFILES.md
-->

# Strategy: Project scaffolding

## Context

New apps enter the factory frequently. Onboarding must be **repeatable**: `project_id`, sample payload, fixture placeholder, and human-readable notes without hand-copy errors.

## Decision

1. **CLI**: `python executor.py init-project <app_name> [--template webstub|native|backend] [--author …]`.
2. **Normalization**: Directory slug = alphanumeric + `-`/`_`; `project_id` = CamelCase tokens from slug (editable).
3. **Artifacts created** (skip if path already exists — no overwrite):
   - `projects/{project_id}/config.json`
   - `payloads/{slug}_sample_kr.json` — minimal KR single-country run
   - `fixtures/{slug}/README.md` — structure hints
   - `docs/projects/{slug}.md` — owner, date, links to strategy docs
4. **Templates**:
   - **webstub**: `platform: web`, npm build/test stubs, `prefer_local_path: fixtures/{slug}/web`
   - **native**: `platform: android`, Gradle-oriented defaults, `prefer_local_path: ../{slug}` (adjust to real repo)
   - **backend**: `platform: web`, compileall smoke; extend for pytest/maven in follow-ups

## Consequences

- Authors **must** fix `prefer_local_path` to the real monorepo root before CI integration.
- Fixture directories are intentionally empty except README — app teams own content.

## Checklist after init

1. Point `prefer_local_path` at the cloned repo.
2. Add `country_profile` / `screenshot` blocks mirroring a reference app (e.g. MyPhoneCheck).
3. Run `python local_pipeline.py payloads/{slug}_sample_kr.json` (or dry-run).
4. Register profile coverage in `STRATEGY-COUNTRY-PROFILES.md`.
