"""
Executor payload schema — policy-as-code merge layer.

Merges operator JSON with projects/{id}/config.json, country_profile, and iOS profile hints.
"""

from __future__ import annotations

import copy
from pathlib import Path
from typing import Any

from executor_country import load_merged_country_profile

REQUIRED_TOP_LEVEL = ("project_id",)


def _deep_merge(base: dict[str, Any], overlay: dict[str, Any]) -> dict[str, Any]:
    out = copy.deepcopy(base)
    for k, v in overlay.items():
        if k in out and isinstance(out[k], dict) and isinstance(v, dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = copy.deepcopy(v)
    return out


def _default_runtime_profile() -> dict[str, Any]:
    return {
        "mode": "optional",
        "min_screenshots": 2,
        "require_install": False,
        "require_foreground_check": False,
    }


def _default_artifact_policy() -> dict[str, Any]:
    return {
        "collect_apk": True,
        "hash_algorithms": ["sha256"],
        "required_artifact_globs": [],
    }


def _default_quality_gate() -> dict[str, Any]:
    return {
        "build_success_required": True,
        "test_pass_required": True,
        "test_max_failures": 0,
        "runtime_smoke_required": False,
        "min_screenshots": 0,
        "require_manifest_hashes": True,
        "paparazzi_verify_required": True,
        "paparazzi_diff_fails_gate": True,
        "runtime_capture_min_screenshots": None,
    }


def _default_retry_policy() -> dict[str, Any]:
    return {
        "max_attempts_build": 2,
        "max_attempts_test": 2,
        "max_attempts_runtime": 2,
        "max_attempts_screenshot": 1,
        "structural_max_attempts": 1,
        "max_pipeline_attempts": 1,
        "recipes_on_fail": ["gradle_clean_rebuild", "adb_reconnect"],
    }


def _default_stage_timeouts() -> dict[str, Any]:
    return {
        "source_sec": 900,
        "env_sec": 300,
        "build_sec": 3600,
        "test_sec": 3600,
        "runtime_sec": 600,
        "screenshot_sec": 3600,
    }


def _default_ios_profiles() -> dict[str, Any]:
    return {
        "ios_build_profile": "export_preflight",
        "ios_test_profile": "shared_logic_only",
        "ios_runtime_profile": "ci_device_farm",
    }


def validate_and_normalize_executor_payload(
    raw: dict[str, Any],
    proj_cfg: dict[str, Any],
    *,
    local_agent_root: Path | None = None,
) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise ValueError("payload must be a JSON object")

    for k in REQUIRED_TOP_LEVEL:
        if k not in raw or not str(raw.get(k) or "").strip():
            raise ValueError(f"payload.{k} is required")

    proj_shot = proj_cfg.get("screenshot")
    if not isinstance(proj_shot, dict):
        proj_shot = {}

    root = local_agent_root or Path(__file__).resolve().parent.parent

    merged = _deep_merge(
        {
            "repo_url": proj_cfg.get("repo_url"),
            "prefer_local_path": proj_cfg.get("prefer_local_path")
            or proj_cfg.get("use_local_repo_path"),
            "branch_or_tag": proj_cfg.get("default_branch", "main"),
            "platform": proj_cfg.get("platform", "android"),
            "build_profile": proj_cfg.get("default_build_profile", "debug"),
            "test_profile": proj_cfg.get("default_test_profile", "none"),
            "runtime_profile": _default_runtime_profile(),
            "artifact_policy": _default_artifact_policy(),
            "quality_gate": _default_quality_gate(),
            "retry_policy": _default_retry_policy(),
            "stage_timeouts": _default_stage_timeouts(),
            "screenshot": proj_shot,
            "country_selection_mode": proj_cfg.get("country_selection_mode", "G20_THEN_ISO"),
            "country_limit": proj_cfg.get("country_limit"),
            "country_batch": proj_cfg.get("country_batch", False),
            **_default_ios_profiles(),
        },
        raw,
    )

    repo_url = merged.get("repo_url")
    pref = merged.get("prefer_local_path")
    if not (repo_url and str(repo_url).strip()) and not (pref and str(pref).strip()):
        raise ValueError(
            "schema: need repo_url or prefer_local_path in payload or project config"
        )

    for key in (
        "branch_or_tag",
        "platform",
        "build_profile",
        "test_profile",
    ):
        if not str(merged.get(key) or "").strip():
            raise ValueError(f"schema: {key} must be non-empty after merge")

    plat = str(merged.get("platform") or "").lower()
    if plat not in ("android", "web", "ios"):
        raise ValueError("schema: platform must be android|web|ios")

    for blk, default_fn in (
        ("runtime_profile", _default_runtime_profile),
        ("artifact_policy", _default_artifact_policy),
        ("quality_gate", _default_quality_gate),
        ("retry_policy", _default_retry_policy),
        ("stage_timeouts", _default_stage_timeouts),
        ("screenshot", lambda: {}),
    ):
        if not isinstance(merged.get(blk), dict):
            merged[blk] = default_fn()
        else:
            merged[blk] = _deep_merge(default_fn(), merged[blk])

    mode = str(merged["runtime_profile"].get("mode") or "optional").lower()
    if mode not in ("optional", "required"):
        raise ValueError("runtime_profile.mode must be optional|required")

    merged["project_id"] = str(merged["project_id"]).strip()
    merged["country_profile"] = load_merged_country_profile(proj_cfg, merged, local_agent_root=root)

    # Convenience: expose country_code at top level for reports
    merged["country_code"] = str(merged["country_profile"].get("country_code") or "US")

    return merged
