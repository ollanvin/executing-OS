"""
Country / region profiles for global App Factory runs.

Profiles: local-agent/profiles/{code}.json → payload.country_profile.

**Merge policy (device vs preset)** — see docs/local-executor-os.md:
- **Device / initial_scan wins** for: UI language, region, timezone, phone/date/time/number formats,
  SIM/network-derived country & currency (execution truth on the handset).
- **country_profile (policy layer) wins** for: search_providers, legal, feature_flags, store/age/payment
  strategy, and currency rules for *pricing/compliance* unless only device hints are needed.
- **Overrides**: country_profile.policy_overrides.force_* may replace device values when regulations
  require a fixed locale/timezone/format for validation runs.

G20 execution order: fixed member ISO list first (EU has no alpha-2; members are covered by states),
then all other ISO 3166-1 alpha-2 codes in ascending order.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

# G20 members as ISO 3166-1 alpha-2 (EU institution has no alpha-2; state members listed separately).
# Order: typical summit listing — US, CN, JP, European majors, CA, KR, RU, AU, BR, MX, IN, ID, SA, TR, AR, ZA.
G20_MEMBER_ISO_CODES_ORDERED: tuple[str, ...] = (
    "US",
    "CN",
    "JP",
    "DE",
    "GB",
    "FR",
    "IT",
    "CA",
    "KR",
    "RU",
    "AU",
    "BR",
    "MX",
    "IN",
    "ID",
    "SA",
    "TR",
    "AR",
    "ZA",
)


def _deep_merge(base: dict[str, Any], overlay: dict[str, Any]) -> dict[str, Any]:
    out = copy.deepcopy(base)
    for k, v in overlay.items():
        if k in out and isinstance(out[k], dict) and isinstance(v, dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = copy.deepcopy(v)
    return out


def load_iso_alpha2_table(local_agent_root: Path) -> list[str]:
    """ISO 3166-1 alpha-2 codes from data/iso3166_alpha2.json (sorted file order)."""
    path = local_agent_root / "data" / "iso3166_alpha2.json"
    if not path.is_file():
        return sorted(set(G20_MEMBER_ISO_CODES_ORDERED))
    with open(path, encoding="utf-8-sig") as fh:
        data = json.load(fh)
    if not isinstance(data, list):
        raise ValueError("iso3166_alpha2.json must be a JSON array of strings")
    return [str(x).strip().upper() for x in data if str(x).strip()]


def build_g20_then_iso_country_list(local_agent_root: Path) -> list[str]:
    """
    1) G20 members (dedup, table order), intersecting known ISO table.
    2) Remaining ISO codes in alpha-2 ascending order.

    **G20 vs EU (supranational entities)**:
    The European Union is a G20 participant as an *institution* but has no ISO 3166-1 alpha-2
    country code. This executor therefore **does not** insert a synthetic ``EU`` (or similar) row
    into the ordered list. Policy and compliance for EU markets are represented by **member-state**
    alpha-2 codes already in ``G20_MEMBER_ISO_CODES_ORDERED`` (e.g. DE, FR, IT) and by
    ``profiles/*.json`` per member. Do not add ``EU`` to ``G20_MEMBER_ISO_CODES_ORDERED`` unless
    product/legal defines a dedicated synthetic code and pipeline support.
    """
    iso_set = set(load_iso_alpha2_table(local_agent_root))
    g20_seen: set[str] = set()
    first: list[str] = []
    for code in G20_MEMBER_ISO_CODES_ORDERED:
        if code in iso_set and code not in g20_seen:
            first.append(code)
            g20_seen.add(code)
    rest = sorted(c for c in iso_set if c not in g20_seen)
    return first + rest


def resolve_country_codes_for_invocation(
    payload: dict[str, Any],
    proj_cfg: dict[str, Any],
    local_agent_root: Path,
) -> list[str]:
    """
    Single run: one explicit country_code (payload or project default).
    Batch: country_batch true → country_selection_mode (default G20_THEN_ISO) + optional country_limit.
    """
    batch = bool(payload.get("country_batch") or proj_cfg.get("country_batch"))
    if not batch:
        cc = str(
            payload.get("country_code") or proj_cfg.get("default_country_code") or "US"
        ).strip().upper()
        return [cc]

    mode = str(
        payload.get("country_selection_mode")
        or proj_cfg.get("country_selection_mode")
        or "G20_THEN_ISO"
    ).upper()
    if mode != "G20_THEN_ISO":
        raise ValueError(f"unsupported country_selection_mode: {mode}")

    full = build_g20_then_iso_country_list(local_agent_root)
    lim = payload.get("country_limit")
    if lim is None:
        lim = proj_cfg.get("country_limit")
    if lim is not None and str(lim).strip() != "":
        n = max(0, int(lim))
        full = full[:n]
    return full


def load_merged_country_profile(
    proj_cfg: dict[str, Any],
    payload: dict[str, Any],
    *,
    local_agent_root: Path,
) -> dict[str, Any]:
    code = str(
        payload.get("country_code") or proj_cfg.get("default_country_code") or "US"
    ).strip().upper()
    path = local_agent_root / "profiles" / f"{code.lower()}.json"
    base: dict[str, Any] = {
        "id": code,
        "country_code": code,
        "profile_file": str(path.resolve()) if path.is_file() else "",
    }
    if path.is_file():
        with open(path, encoding="utf-8-sig") as fh:
            loaded = json.load(fh)
        if isinstance(loaded, dict):
            base = _deep_merge(base, loaded)
    inline = payload.get("country_profile")
    if isinstance(inline, dict):
        base = _deep_merge(base, inline)
    if not str(base.get("id") or "").strip():
        base["id"] = str(base.get("country_code") or code)
    base["country_code"] = str(base.get("country_code") or code).strip().upper()
    base["id"] = str(base.get("id") or base["country_code"]).strip().upper()
    return base


def search_provider_targets_for_validation(country_profile: dict[str, Any]) -> list[str]:
    """
    Hook for search/browser tests: prefer primary + google (secondary) when secondary is google,
    else primary + secondary + others.
    """
    sp = country_profile.get("search_providers")
    if not isinstance(sp, dict):
        return ["google"]
    primary = str(sp.get("primary") or "").strip().lower()
    secondary = str(sp.get("secondary") or "").strip().lower()
    others = sp.get("others") if isinstance(sp.get("others"), list) else []
    out: list[str] = []
    for x in (primary, secondary, *(str(o).lower() for o in others)):
        if x and x not in out:
            out.append(x)
    if secondary == "google" and "google" in out and out[0] != "google":
        # keep primary first, ensure google second for cross-checks
        if "google" in out:
            out.remove("google")
        idx = 1 if len(out) >= 1 else 0
        out.insert(min(idx, len(out)), "google")
    return out or ["google"]


def build_merged_runtime_execution_profile(
    device_context: dict[str, Any],
    country_profile: dict[str, Any],
) -> dict[str, Any]:
    """
    Merge device initial_scan (execution truth) with country policy preset.

    Device-first: locale, formats, network telemetry.
    Policy-first: search_providers, legal, feature_flags, store, age_limit, payment_methods.
    policy_overrides.force_*: country may replace device fields when required for compliance runs.
    """
    po = country_profile.get("policy_overrides") if isinstance(country_profile.get("policy_overrides"), dict) else {}
    force_locale = bool(po.get("force_locale"))
    force_timezone = bool(po.get("force_timezone"))
    force_phone_fmt = bool(po.get("force_phone_number_format"))
    force_date_fmt = bool(po.get("force_date_format"))
    force_number_fmt = bool(po.get("force_number_format"))

    dev_os = device_context.get("os") if isinstance(device_context.get("os"), dict) else {}
    dev_loc = device_context.get("locale") if isinstance(device_context.get("locale"), dict) else {}
    dev_net = device_context.get("network") if isinstance(device_context.get("network"), dict) else {}
    dev_fmt = device_context.get("formats") if isinstance(device_context.get("formats"), dict) else {}
    dev_app = device_context.get("app") if isinstance(device_context.get("app"), dict) else {}

    rec_ui = country_profile.get("locale_default") or country_profile.get("locale")

    sys_lang = dev_loc.get("system_language")
    if force_locale:
        sys_lang = country_profile.get("locale_default") or sys_lang
    if not sys_lang and rec_ui:
        ru = str(rec_ui)
        sys_lang = ru.split("-")[0] if "-" in ru else ru

    tz_dev = dev_loc.get("timezone")
    if force_timezone:
        tz_use = country_profile.get("timezone") or tz_dev
    else:
        tz_use = tz_dev or country_profile.get("timezone")

    merged_locale = {
        "system_language": sys_lang,
        "region": dev_loc.get("region"),
        "timezone": tz_use,
        "recommended_ui_locale": rec_ui,
    }

    ph = dev_fmt.get("phone_number_format")
    if force_phone_fmt:
        ph = country_profile.get("phone_number_format_baseline") or ph
    ph = ph or country_profile.get("phone_number_format_baseline")

    df = dev_fmt.get("date_format")
    if force_date_fmt:
        df = country_profile.get("date_format") or df
    df = df or country_profile.get("date_format")

    nf = dev_fmt.get("number_format")
    if force_number_fmt:
        nf = country_profile.get("number_format") or nf
    nf = nf or country_profile.get("number_format")

    merged_formats = {
        "phone_number_format": ph,
        "date_format": df,
        "time_format": dev_fmt.get("time_format"),
        "number_format": nf,
    }

    merged_network = {
        "sim_country": dev_net.get("sim_country"),
        "network_country": dev_net.get("network_country"),
        "currency_from_sim": dev_net.get("currency_from_sim"),
        "inferred_currency": device_context.get("inferred_currency") or dev_net.get("currency_from_sim"),
    }

    policy_search = country_profile.get("search_providers") if isinstance(country_profile.get("search_providers"), dict) else {}
    policy_legal = country_profile.get("legal") if isinstance(country_profile.get("legal"), dict) else {}
    policy_flags = country_profile.get("feature_flags") if isinstance(country_profile.get("feature_flags"), dict) else {}

    return {
        "schema_version": "runtime_profile_v1",
        "merge_policy": "device_context + policy overrides",
        "runtime_profile_policy": "device_context + policy overrides",
        "device_priority_fields": [
            "locale.system_language",
            "locale.region",
            "locale.timezone",
            "formats.phone_number_format",
            "formats.date_format",
            "formats.time_format",
            "formats.number_format",
            "network.sim_country",
            "network.network_country",
        ],
        "policy_priority_fields": [
            "search_providers",
            "legal",
            "feature_flags",
            "store",
            "age_limit",
            "payment_methods",
        ],
        "policy_overrides_applied": {
            "force_locale": force_locale,
            "force_timezone": force_timezone,
            "force_phone_number_format": force_phone_fmt,
            "force_date_format": force_date_fmt,
            "force_number_format": force_number_fmt,
        },
        "os": dev_os,
        "locale": merged_locale,
        "formats": merged_formats,
        "network": merged_network,
        "app": dev_app,
        "search_providers": policy_search,
        "legal": policy_legal,
        "feature_flags": policy_flags,
        "store": country_profile.get("store"),
        "age_limit": country_profile.get("age_limit"),
        "payment_methods": country_profile.get("payment_methods"),
        "search_validation_targets": search_provider_targets_for_validation(country_profile),
        "country_profile_id": country_profile.get("id") or country_profile.get("country_code"),
    }


def country_process_env_from_runtime_execution(merged_runtime: dict[str, Any]) -> dict[str, str]:
    """Build subprocess env from merged runtime (after device scan)."""
    out: dict[str, str] = {}
    loc = merged_runtime.get("locale") if isinstance(merged_runtime.get("locale"), dict) else {}
    lang = str(loc.get("system_language") or "").strip()
    region = str(loc.get("region") or "").strip()
    tz = str(loc.get("timezone") or "").strip()
    if lang:
        out["EXECUTOR_LOCALE"] = f"{lang}-{region}" if region else lang
        if region:
            out["JAVA_TOOL_OPTIONS"] = (
                f"-Duser.language={lang} -Duser.region={region} -Duser.country={region}"
            )
        else:
            out["JAVA_TOOL_OPTIONS"] = f"-Duser.language={lang}"
    if tz:
        out["TZ"] = tz
        out["EXECUTOR_TZ"] = tz
    cur = str(merged_runtime.get("network", {}).get("inferred_currency") or "").strip()
    if not cur:
        cur = str(merged_runtime.get("network", {}).get("currency_from_sim") or "").strip()
    if cur:
        out["EXECUTOR_CURRENCY"] = cur
    return out


def country_process_env(profile: dict[str, Any]) -> dict[str, str]:
    """Legacy: JVM env from country_profile only (before device merge). Prefer country_process_env_from_runtime_execution."""
    out: dict[str, str] = {}
    loc = str(profile.get("locale") or "").strip()
    if loc:
        out["EXECUTOR_LOCALE"] = loc
        if "-" in loc:
            lang, region = loc.split("-", 1)
            out["JAVA_TOOL_OPTIONS"] = (
                f"-Duser.language={lang} -Duser.region={region} -Duser.country={region}"
            )
        else:
            out["JAVA_TOOL_OPTIONS"] = f"-Duser.language={loc}"
    tz = str(profile.get("timezone") or "").strip()
    if tz:
        out["TZ"] = tz
        out["EXECUTOR_TZ"] = tz
    cur = str(profile.get("currency") or "").strip()
    if cur:
        out["EXECUTOR_CURRENCY"] = cur
    return out
