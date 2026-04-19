"""
Evidence validator — checks artifacts + policy; emits validation_report (JSON + MD).

Required report sections:
- executor_summary, environment_snapshot_link, screenshot_summary,
  failure_classification, country_locale_info.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

FAIL_VERDICT = "FAIL"
PASS_VERDICT = "PASS"


def _report_paths(run_root: Path) -> dict[str, Path]:
    r = run_root / "reports"
    return {
        "task_json": r / "task_result_report.json",
        "task_md": r / "task_result_report.md",
        "env_snap": r / "environment_snapshot.json",
        "val_json": r / "validation_report.json",
    }


def _executor_summary_block(payload: dict[str, Any], rep: dict[str, Any]) -> dict[str, Any]:
    return {
        "project_id": rep.get("project_id") or payload.get("project_id"),
        "run_id": rep.get("run_id"),
        "pipeline_status": rep.get("status"),
        "platform": payload.get("platform"),
        "build_profile": payload.get("build_profile"),
        "test_profile": payload.get("test_profile"),
        "ios_build_profile": payload.get("ios_build_profile"),
        "ios_test_profile": payload.get("ios_test_profile"),
        "ios_runtime_profile": payload.get("ios_runtime_profile"),
        "retry_policy": payload.get("retry_policy"),
    }


def _country_locale_block(payload: dict[str, Any], report: dict[str, Any]) -> dict[str, Any]:
    cp = payload.get("country_profile") or {}
    sp = cp.get("search_providers") if isinstance(cp.get("search_providers"), dict) else {}
    m = report.get("runtime_execution_profile") or {}
    return {
        "country_profile_id": cp.get("id") or cp.get("country_code"),
        "country_code": cp.get("country_code") or payload.get("country_code"),
        "locale": cp.get("locale"),
        "locale_default": cp.get("locale_default"),
        "timezone": cp.get("timezone"),
        "currency": cp.get("currency"),
        "search_providers": sp,
        "search_primary": sp.get("primary"),
        "search_secondary": sp.get("secondary"),
        "search_validation_targets": m.get("search_validation_targets") or [],
        "feature_flags": cp.get("feature_flags"),
        "legal": cp.get("legal"),
    }


def _device_context_summary_block(report: dict[str, Any]) -> dict[str, Any]:
    dc = report.get("device_context") or {}
    os = dc.get("os") if isinstance(dc.get("os"), dict) else {}
    loc = dc.get("locale") if isinstance(dc.get("locale"), dict) else {}
    net = dc.get("network") if isinstance(dc.get("network"), dict) else {}
    return {
        "scan_method": dc.get("scan_method"),
        "os_name": os.get("name"),
        "os_version": os.get("version"),
        "device_model": os.get("device_model"),
        "resolution": os.get("resolution"),
        "dpi": os.get("dpi"),
        "system_language": loc.get("system_language"),
        "region": loc.get("region"),
        "timezone": loc.get("timezone"),
        "sim_country": net.get("sim_country"),
        "network_country": net.get("network_country"),
        "inferred_currency": dc.get("inferred_currency"),
        "fallbacks_applied": dc.get("fallbacks_applied"),
    }


def _runtime_merge_summary_block(report: dict[str, Any]) -> dict[str, Any]:
    m = report.get("runtime_execution_profile") or {}
    return {
        "merge_policy": m.get("merge_policy"),
        "runtime_profile_policy": m.get("runtime_profile_policy"),
        "device_priority_fields": m.get("device_priority_fields"),
        "policy_priority_fields": m.get("policy_priority_fields"),
        "policy_overrides_applied": m.get("policy_overrides_applied"),
        "merged_locale": m.get("locale"),
        "merged_formats": m.get("formats"),
        "merged_search_providers": m.get("search_providers"),
    }


def _screenshot_summary_block(rep: dict[str, Any]) -> dict[str, Any]:
    s = rep.get("screenshot") or {}
    pap = s.get("paparazzi") or {}
    rt = rep.get("runtime") or {}
    return {
        "screenshot_success": s.get("success"),
        "baseline_mode": s.get("mode"),
        "paparazzi_ran": pap.get("ran"),
        "paparazzi_task": pap.get("task"),
        "diff_found": pap.get("diff_found"),
        "paparazzi_report_path": pap.get("report_path"),
        "runtime_capture_enabled": s.get("runtime_capture_enabled"),
        "runtime_screenshot_count": len(rt.get("screenshots") or []),
    }


def _failure_classification_block(rep: dict[str, Any]) -> dict[str, Any]:
    analyses = rep.get("failure_analyses") or []
    last = analyses[-1] if analyses else {}
    return {
        "failure_analyses": analyses,
        "latest_failure_class": last.get("failure_class"),
        "escalation_recommended": last.get("escalation_recommended"),
        "escalation_target": last.get("escalation_target"),
        "escalation_reason": last.get("escalation_reason"),
    }


def validate_executor_run(
    run_root: Path,
    payload: dict[str, Any],
    report: dict[str, Any],
) -> dict[str, Any]:
    paths = _report_paths(run_root)
    issues: list[str] = []

    if not paths["task_json"].is_file():
        issues.append("missing task_result_report.json")
    if not paths["env_snap"].is_file():
        issues.append("missing environment_snapshot.json")

    qg = payload.get("quality_gate") or {}
    st = report.get("status")

    if qg.get("build_success_required") and not (report.get("build") or {}).get("success"):
        if st not in ("SOURCE_FAILED", "ENV_FAILED"):
            issues.append("build_success_required but build.success is false")

    if qg.get("test_pass_required") and not (report.get("test") or {}).get("success"):
        if st not in ("SOURCE_FAILED", "ENV_FAILED", "BUILD_FAILED"):
            issues.append("test_pass_required but test.success is false")

    shot = report.get("screenshot") or {}
    pap = shot.get("paparazzi") or {}
    if qg.get("paparazzi_verify_required") and payload.get("platform") == "android":
        scfg = payload.get("screenshot") or {}
        if scfg.get("paparazzi_enabled") and scfg.get("enabled", True):
            if not pap.get("ran"):
                issues.append("paparazzi_verify_required but Paparazzi did not run")
            if pap.get("diff_found") and qg.get("paparazzi_diff_fails_gate"):
                issues.append("paparazzi diff / failure heuristic detected")

    rmin = qg.get("runtime_capture_min_screenshots")
    if rmin is not None and (payload.get("screenshot") or {}).get("runtime_capture_enabled"):
        n = len((report.get("runtime") or {}).get("screenshots") or [])
        if n < int(rmin):
            issues.append(f"runtime_capture_min_screenshots not met ({n} < {rmin})")

    if st not in ("SOURCE_FAILED", "ENV_FAILED"):
        rdir = run_root / "reports"
        if not (rdir / "device_context.json").is_file():
            issues.append("missing reports/device_context.json")
        if not (rdir / "runtime_profile.json").is_file():
            issues.append("missing reports/runtime_profile.json")

    verdict = PASS_VERDICT if not issues else FAIL_VERDICT

    try:
        rel_env = str(paths["env_snap"].resolve().relative_to(run_root.resolve()))
    except ValueError:
        rel_env = "reports/environment_snapshot.json"
    rel_env = rel_env.replace("\\", "/")
    out: dict[str, Any] = {
        "schema_version": "validation_report_v1",
        "validation_verdict": verdict,
        "issues": issues,
        "executor_summary": _executor_summary_block(payload, report),
        "environment_snapshot_link": rel_env.replace("\\", "/"),
        "screenshot_summary": _screenshot_summary_block(report),
        "failure_classification": _failure_classification_block(report),
        "country_locale_info": _country_locale_block(payload, report),
        "device_context_summary": _device_context_summary_block(report),
        "runtime_merge_summary": _runtime_merge_summary_block(report),
    }
    paths["val_json"].parent.mkdir(parents=True, exist_ok=True)
    paths["val_json"].write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    _write_validation_md(out, paths["val_json"].with_name("validation_report.md"))
    return out


def _write_validation_md(data: dict[str, Any], path: Path) -> None:
    lines = [
        "# Validation report",
        "",
        f"- **verdict**: **{data.get('validation_verdict')}**",
        "",
        "## Executor summary",
        "",
        "```json",
        json.dumps(data.get("executor_summary"), ensure_ascii=False, indent=2),
        "```",
        "",
        "## Environment snapshot",
        "",
        f"- Linked file: `{data.get('environment_snapshot_link')}`",
        "",
        "## Screenshot summary (Paparazzi + runtime)",
        "",
        "```json",
        json.dumps(data.get("screenshot_summary"), ensure_ascii=False, indent=2),
        "```",
        "",
        "## Failure classification + escalation hint",
        "",
        "```json",
        json.dumps(data.get("failure_classification"), ensure_ascii=False, indent=2),
        "```",
        "",
        "## Country / locale / search",
        "",
        "```json",
        json.dumps(data.get("country_locale_info"), ensure_ascii=False, indent=2),
        "```",
        "",
        "## Device context (initial scan summary)",
        "",
        "```json",
        json.dumps(data.get("device_context_summary"), ensure_ascii=False, indent=2),
        "```",
        "",
        "## Runtime profile merge (device + policy)",
        "",
        "```json",
        json.dumps(data.get("runtime_merge_summary"), ensure_ascii=False, indent=2),
        "```",
        "",
        "## Issues",
        "",
    ]
    for i in data.get("issues") or []:
        lines.append(f"- {i}")
    path.write_text("\n".join(lines), encoding="utf-8")
