<!--
Title: ISO 3166-1 alpha-2 table operations for Executor OS
Status: active
Created: 2026-04-18
Updated: 2026-04-18
Related Files: ../../data/iso3166_alpha2.json, ../../agent/executor_country.py, ../local-executor-os.md, STRATEGY-COUNTRY-PROFILES.md
-->

# ISO 3166-1 alpha-2 table operations

## Purpose

The file `data/iso3166_alpha2.json` is the **ordered allowlist** of ISO 3166-1 alpha-2 codes used after the G20 prefix in `G20_THEN_ISO` mode (`executor_country.build_g20_then_iso_country_list`).

## Origin and generation criteria

- **Structure**: JSON array of uppercase two-letter strings, sorted **A→Z** (lexicographic).
- **Baseline**: Derived from the ISO 3166-1 alpha-2 **official country code list** (maintenance target: align with ISO updates; this repo snapshot is a point-in-time export).
- **Internal policy**: Codes not assigned to independent states in our product scope may still appear in the file for tooling compatibility; **executor behavior** for disputed or special regions follows **legal/product** guidance, not this file alone.

## Disputed / special codes

- **Supranational entities** (e.g. **European Union**): no ISO 3166-1 alpha-2 **country** code. `G20_THEN_ISO` **must not** synthesize `EU` unless product defines a synthetic code and full pipeline support (see `executor_country.build_g20_then_iso_country_list` docstring).
- **User-defined extensions**: Any non-ISO synthetic code requires an ADR and explicit handling in `resolve_country_codes_for_invocation` and profile layout.

## Update cadence and ownership

| Aspect | Guidance |
|--------|----------|
| **Cadence** | Review at least **annually**, or when ISO publishes changes affecting our shipped markets. |
| **Owner (role)** | **Platform / release engineering** (or delegate) — verifies diff against ISO source, runs smoke `G20_THEN_ISO` batch. |
| **Verification** | Diff `data/iso3166_alpha2.json`; re-run `payloads/g20_batch_webstub_5.json` (dry-run) and confirm first five codes remain `US,CN,JP,DE,GB`. |

## Related

- `docs/local-executor-os.md` — G20 vs ISO ordering.
- `docs/strategy/STRATEGY-COUNTRY-PROFILES.md` — profile coverage per code.
