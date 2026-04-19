<!--
Title: Country profile coverage and minimum fields (G20-first)
Status: active
Created: 2026-04-18
Updated: 2026-04-18
Related Files: ../../profiles/*.json, ../../agent/executor_country.py, ../local-executor-os.md, STRATEGY-ISO-DATA-MANAGEMENT.md
-->

# Country profile coverage (G20-first)

## Minimum required fields (target)

Each `profiles/{alpha2}.json` used in production gates should eventually include:

| Field / block | Purpose |
|---------------|---------|
| `id`, `country_code` | Stable identity for `gate_report.country_profile_id` |
| `locale_default` | Recommended UI language (policy hint; device may win unless `policy_overrides`) |
| `locale`, `timezone`, `currency` | Regional defaults for reporting and optional overrides |
| `search_providers` | `primary`, `secondary`, `others[]` — search ecosystem for validation hooks |
| `legal` | Compliance regime flags (e.g. GDPR, APPI, PIPA) |
| `feature_flags` | Country-scoped product toggles |
| `policy_overrides` | `force_*` flags for regulated locale/timezone/format runs |

Optional but recommended: `store`, `age_limit`, `payment_methods`, `phone_number_format_baseline`.

## G20 alpha-2 coverage matrix

| Code | Profile file | locale_default | search_providers | legal | feature_flags | Status |
|------|----------------|----------------|------------------|-------|---------------|--------|
| US | us.json | yes | yes | yes | yes | **Complete** |
| CN | cn.json | yes | yes | yes | yes | **Complete** |
| JP | jp.json | yes | yes | yes | yes | **Complete** |
| DE | de.json | yes | yes | yes | yes | **Complete** (minimum+) |
| GB | gb.json | yes | yes | yes | yes | **Complete** (minimum+) |
| FR | — | — | — | — | — | **Missing** |
| IT | — | — | — | — | — | **Missing** |
| CA | — | — | — | — | — | **Missing** |
| KR | kr.json | yes | yes | yes | yes | **Complete** |
| RU | — | — | — | — | — | **Missing** |
| AU | — | — | — | — | — | **Missing** |
| BR | — | — | — | — | — | **Missing** |
| MX | — | — | — | — | — | **Missing** |
| IN | — | — | — | — | — | **Missing** |
| ID | — | — | — | — | — | **Missing** |
| SA | — | — | — | — | — | **Missing** |
| TR | — | — | — | — | — | **Missing** |
| AR | — | — | — | — | — | **Missing** |
| ZA | — | — | — | — | — | **Missing** |

## Priority backlog

1. **Tier A** (current WebStub / factory smoke targets): KR, US, JP, DE, GB, CN — **done** for minimum fields.
2. **Tier B** (remaining G20): FR, IT, CA, RU, AU, BR, MX, IN, ID, SA, TR, AR, ZA — create profiles in ISO/G20 order as sprints allow.
3. **Tier C** (non-G20 ISO): fill when a product SKU requires the market.

## Non-goals (this document)

- Legal interpretation of regimes — only **field presence** and **executor wiring** are tracked here.
