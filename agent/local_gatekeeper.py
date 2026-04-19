"""
Quality gate — aggregates validator + business rules into gate_report (JSON + MD).

iOS: approves when Windows-side preflight + front-end evidence passes; native IPA build is Mac/CI.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def evaluate_gate(
    run_root: Path,
    payload: dict[str, Any],
    report: dict[str, Any],
    validation: dict[str, Any],
) -> dict[str, Any]:
    verdict = "APPROVED"
    reasons: list[str] = []

    if validation.get("validation_verdict") != "PASS":
        verdict = "REJECTED_HARD"
        reasons.append("validation_verdict != PASS")

    st = report.get("status")
    if st != "SUCCEEDED":
        verdict = "REJECTED_HARD"
        reasons.append(f"pipeline status {st}")

    qg = payload.get("quality_gate") or {}
    if qg.get("runtime_smoke_required"):
        if not (report.get("runtime") or {}).get("success"):
            verdict = "REJECTED_HARD"
            reasons.append("runtime_smoke_required but runtime failed")

    if payload.get("platform") == "ios":
        ios_ok = (report.get("ios_front_end") or {}).get("success")
        if ios_ok is False:
            verdict = "REJECTED_HARD"
            reasons.append("ios_front_end checks failed")

    rel_env = "reports/environment_snapshot.json"
    cli = validation.get("country_locale_info") or {}
    gate = {
        "schema_version": "gate_report_v2",
        "gate_verdict": verdict,
        "reasons": reasons,
        "executor_summary": validation.get("executor_summary"),
        "environment_snapshot_link": rel_env,
        "screenshot_summary": validation.get("screenshot_summary"),
        "failure_classification": validation.get("failure_classification"),
        "country_locale_info": validation.get("country_locale_info"),
        "country_profile_id": cli.get("country_profile_id"),
        "country_locale_timezone_currency_summary": {
            "locale": cli.get("locale"),
            "timezone": cli.get("timezone"),
            "currency": cli.get("currency"),
        },
        "search_providers_summary": {
            "primary": cli.get("search_primary"),
            "secondary": cli.get("search_secondary"),
            "targets": cli.get("search_validation_targets"),
        },
        "device_context_summary": validation.get("device_context_summary"),
        "runtime_merge_summary": validation.get("runtime_merge_summary"),
        "runtime_merge_explanation": (
            "Device initial_scan supplies locale/timezone/formats/SIM hints; "
            "country_profile supplies search_providers, legal, store, payment, feature_flags. "
            "policy_overrides.force_* replaces device fields when compliance requires."
        ),
    }
    if validation.get("failure_classification", {}).get("escalation_recommended"):
        gate["escalation_hint"] = {
            "target": validation["failure_classification"].get("escalation_target"),
            "reason": validation["failure_classification"].get("escalation_reason"),
        }

    rdir = run_root / "reports"
    rdir.mkdir(parents=True, exist_ok=True)
    gj = rdir / "gate_report.json"
    gj.write_text(json.dumps(gate, ensure_ascii=False, indent=2), encoding="utf-8")
    _write_gate_md(gate, rdir / "gate_report.md")
    return gate


def _write_gate_md(data: dict[str, Any], path: Path) -> None:
    lines = [
        "# Gate report",
        "",
        f"- **gate_verdict**: **{data.get('gate_verdict')}**",
        "",
        "## Executor summary",
        "",
        "```json",
        json.dumps(data.get("executor_summary"), ensure_ascii=False, indent=2),
        "```",
        "",
        "## Environment snapshot",
        "",
        f"- `{data.get('environment_snapshot_link')}`",
        "",
        "## Screenshot summary",
        "",
        "```json",
        json.dumps(data.get("screenshot_summary"), ensure_ascii=False, indent=2),
        "```",
        "",
        "## Failure classification + escalation",
        "",
        "```json",
        json.dumps(data.get("failure_classification"), ensure_ascii=False, indent=2),
        "```",
        "",
        "## Country / locale / profile id",
        "",
        f"- **country_profile_id**: `{data.get('country_profile_id')}`",
        "```json",
        json.dumps(data.get("country_locale_info"), ensure_ascii=False, indent=2),
        "```",
        "",
        "## Search providers",
        "",
        "```json",
        json.dumps(data.get("search_providers_summary"), ensure_ascii=False, indent=2),
        "```",
        "",
        "## Device context (summary)",
        "",
        "```json",
        json.dumps(data.get("device_context_summary"), ensure_ascii=False, indent=2),
        "```",
        "",
        "## Runtime merge (device vs policy)",
        "",
        f"- {data.get('runtime_merge_explanation') or ''}",
        "",
        "```json",
        json.dumps(data.get("runtime_merge_summary"), ensure_ascii=False, indent=2),
        "```",
        "",
        "## Reasons",
        "",
    ]
    for r in data.get("reasons") or []:
        lines.append(f"- {r}")
    if data.get("escalation_hint"):
        lines.extend(
            [
                "",
                "## Escalation hint",
                "",
                "```json",
                json.dumps(data["escalation_hint"], ensure_ascii=False, indent=2),
                "```",
            ]
        )
    path.write_text("\n".join(lines), encoding="utf-8")
