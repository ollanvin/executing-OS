"""
Device initial scan — structured device_context for Executor OS.

**Priority vs country_profile**: device_context is the source of truth for on-device locale,
timezone, formats, and SIM/network hints. country_profile adds policy (search, legal, store).
See executor_country.build_merged_runtime_execution_profile and docs/local-executor-os.md.

Collects host/adb evidence; dev/simulator uses EXECUTOR_DEVICE_* env overrides and fallbacks.
"""

from __future__ import annotations

import json
import os
import platform
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def _env(name: str, default: str = "") -> str:
    return (os.environ.get(name) or default).strip()


def _adb_props() -> dict[str, str]:
    adb = _env("ADB_PATH") or "adb"
    try:
        r = subprocess.run(
            [adb, "devices"],
            capture_output=True,
            text=True,
            timeout=15,
        )
        if r.returncode != 0 or "device" not in (r.stdout or ""):
            return {}
        lines = [ln for ln in (r.stdout or "").splitlines() if "\tdevice" in ln]
        if not lines:
            return {}
    except (OSError, subprocess.SubprocessError):
        return {}

    def gp(key: str) -> str:
        try:
            p = subprocess.run(
                [adb, "shell", "getprop", key],
                capture_output=True,
                text=True,
                timeout=15,
            )
            return (p.stdout or "").strip()
        except (OSError, subprocess.SubprocessError):
            return ""

    return {
        "ro.build.version.release": gp("ro.build.version.release"),
        "ro.product.model": gp("ro.product.model"),
        "ro.product.manufacturer": gp("ro.product.manufacturer"),
        "gsm.operator.iso-country": gp("gsm.operator.iso-country"),
        "gsm.sim.operator.iso-country": gp("gsm.sim.operator.iso-country"),
    }


def collect_device_context(*, app_version: str = "", build_number: str = "") -> dict[str, Any]:
    """
    Initial scan. Missing fields use fallbacks suitable for Windows executor / emulator.
    Override via env: EXECUTOR_DEVICE_* (see implementation).
    """
    props = _adb_props()
    used_adb = bool(props)

    os_name = _env("EXECUTOR_DEVICE_OS_NAME") or ("Android" if used_adb else platform.system())
    os_version = (
        _env("EXECUTOR_DEVICE_OS_VERSION")
        or props.get("ro.build.version.release")
        or platform.release()
    )
    device_model = (
        _env("EXECUTOR_DEVICE_MODEL")
        or props.get("ro.product.model")
        or platform.node()
        or "unknown_host"
    )

    w = int(_env("EXECUTOR_DEVICE_SCREEN_W", "0") or 0)
    h = int(_env("EXECUTOR_DEVICE_SCREEN_H", "0") or 0)
    dpi = int(_env("EXECUTOR_DEVICE_DPI", "0") or 0)
    if not w or not h:
        w, h = 1080, 1920
        dpi = dpi or 420

    sys_lang = _env("EXECUTOR_DEVICE_SYSTEM_LANGUAGE") or ("en" if not used_adb else "en")
    region = _env("EXECUTOR_DEVICE_REGION") or ("US" if not used_adb else "")
    tz = _env("EXECUTOR_DEVICE_TIMEZONE") or "UTC"

    sim_cc = (
        _env("EXECUTOR_DEVICE_SIM_COUNTRY")
        or props.get("gsm.sim.operator.iso-country")
        or props.get("gsm.operator.iso-country")
        or ""
    )
    sim_cc = sim_cc.strip().upper()[:2] if sim_cc else ""
    net_cc = (
        _env("EXECUTOR_DEVICE_NETWORK_COUNTRY")
        or props.get("gsm.operator.iso-country")
        or sim_cc
        or ""
    ).strip().upper()[:2]

    inferred_currency = _env("EXECUTOR_DEVICE_INFERRED_CURRENCY")
    if not inferred_currency and sim_cc:
        # minimal heuristic table
        m = {
            "KR": "KRW",
            "US": "USD",
            "JP": "JPY",
            "CN": "CNY",
            "GB": "GBP",
            "DE": "EUR",
        }
        inferred_currency = m.get(sim_cc, "")

    phone_fmt = _env("EXECUTOR_DEVICE_PHONE_FORMAT") or "+1 (555) 010-0000 E.164-capable baseline"
    date_fmt = _env("EXECUTOR_DEVICE_DATE_FORMAT") or "yyyy-MM-dd"
    time_fmt = _env("EXECUTOR_DEVICE_TIME_FORMAT") or "HH:mm:ss"
    num_fmt = _env("EXECUTOR_DEVICE_NUMBER_FORMAT") or "en_US"

    ctx: dict[str, Any] = {
        "schema_version": "device_context_v1",
        "source": "initial_scan",
        "captured_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "scan_method": "adb_getprop" if used_adb else "host_fallback",
        "os": {
            "name": os_name,
            "version": os_version,
            "device_model": device_model,
            "resolution": f"{w}x{h}",
            "dpi": dpi,
        },
        "locale": {
            "system_language": sys_lang,
            "region": region,
            "timezone": tz,
        },
        "network": {
            "sim_country": sim_cc or None,
            "network_country": net_cc or None,
            "currency_from_sim": inferred_currency or None,
        },
        "formats": {
            "phone_number_format": phone_fmt,
            "date_format": date_fmt,
            "time_format": time_fmt,
            "number_format": num_fmt,
        },
        "app": {
            "app_version": app_version or _env("EXECUTOR_APP_VERSION", "0.0.0-dev"),
            "build_number": build_number or _env("EXECUTOR_APP_BUILD", "0"),
        },
        "inferred_currency": inferred_currency or None,
        "fallbacks_applied": not used_adb,
    }
    return ctx


def write_device_context(run_root: Path, ctx: dict[str, Any]) -> Path:
    reports = run_root / "reports"
    reports.mkdir(parents=True, exist_ok=True)
    path = reports / "device_context.json"
    path.write_text(json.dumps(ctx, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def write_runtime_profile_json(run_root: Path, profile: dict[str, Any]) -> Path:
    reports = run_root / "reports"
    reports.mkdir(parents=True, exist_ok=True)
    path = reports / "runtime_profile.json"
    path.write_text(json.dumps(profile, ensure_ascii=False, indent=2), encoding="utf-8")
    return path
