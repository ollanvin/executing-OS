"""
Run-level metrics for factory QA loop (JSONL append-only).

See docs/strategy/STRATEGY-METRICS-AND-QA.md.
"""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


def _utc_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def metrics_jsonl_path(local_agent_root: Path) -> Path:
    d = local_agent_root / "runs" / "metrics"
    d.mkdir(parents=True, exist_ok=True)
    return d / "run_events.jsonl"


def _parse_ts(ts: str) -> datetime | None:
    if not ts:
        return None
    try:
        raw = ts.replace("Z", "+00:00")
        return datetime.fromisoformat(raw)
    except ValueError:
        return None


def _duration_sec(started: str, finished: str) -> float | None:
    a, b = _parse_ts(started), _parse_ts(finished)
    if not a or not b:
        return None
    return max(0.0, (b - a).total_seconds())


def duration_sec(started: str, finished: str) -> float | None:
    """Public helper for batch tables / external callers."""
    return _duration_sec(started, finished)


def record_run_metrics(local_agent_root: Path, ctx: Any) -> None:
    """Call after finalize_production; ctx is PipelineContext."""
    report = ctx.report
    payload = ctx.payload
    fa = report.get("failure_analyses") or []
    last_fc = (fa[-1].get("failure_class") if fa else None) or ""

    dur = _duration_sec(report.get("started_at_utc") or "", report.get("finished_at_utc") or "")

    success_pipeline = report.get("status") == "SUCCEEDED"
    gate_ok = report.get("gate_verdict") == "APPROVED"
    rec = {
        "schema_version": "run_event_v1",
        "ts_utc": report.get("finished_at_utc") or report.get("started_at_utc") or _utc_iso(),
        "project_id": ctx.project_id,
        "country_code": str(payload.get("country_code") or ""),
        "platform": str(payload.get("platform") or ""),
        "run_id": ctx.run_id,
        "run_root": str(ctx.run_root.resolve()),
        "pipeline_status": report.get("status"),
        "gate_verdict": report.get("gate_verdict"),
        "validation_verdict": report.get("validation_verdict"),
        "success": bool(success_pipeline and gate_ok),
        "duration_sec": dur,
        "failure_class": last_fc,
        "job_id": (ctx.global_cfg or {}).get("job_id"),
        "batch_id": (ctx.global_cfg or {}).get("batch_id"),
    }
    path = metrics_jsonl_path(local_agent_root)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(rec, ensure_ascii=False) + "\n")


def load_recent_events(local_agent_root: Path, *, days: int = 7) -> list[dict[str, Any]]:
    path = metrics_jsonl_path(local_agent_root)
    if not path.is_file():
        return []
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    out: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                ev = json.loads(line)
            except json.JSONDecodeError:
                continue
            ts = _parse_ts(str(ev.get("ts_utc") or ""))
            if ts and ts >= cutoff:
                out.append(ev)
    return out


def aggregate_kpis(events: list[dict[str, Any]]) -> tuple[dict[tuple, dict], dict[tuple, str]]:
    """
    Returns:
      - stats keyed by (day, project_id, country_code, platform)
      - top failure_class per (project, country, platform) over window
    """
    # day = UTC date string
    stats: dict[tuple[str, str, str, str], dict[str, Any]] = defaultdict(
        lambda: {
            "total_runs": 0,
            "success_runs": 0,
            "failed_runs": 0,
            "duration_sum": 0.0,
            "duration_n": 0,
            "failure_classes": defaultdict(int),
        }
    )
    for ev in events:
        ts = _parse_ts(str(ev.get("ts_utc") or ""))
        day = ts.strftime("%Y-%m-%d") if ts else "unknown"
        key = (
            day,
            str(ev.get("project_id") or ""),
            str(ev.get("country_code") or ""),
            str(ev.get("platform") or ""),
        )
        st = stats[key]
        st["total_runs"] += 1
        if ev.get("success"):
            st["success_runs"] += 1
        else:
            st["failed_runs"] += 1
        d = ev.get("duration_sec")
        if isinstance(d, (int, float)):
            st["duration_sum"] += float(d)
            st["duration_n"] += 1
        fc = str(ev.get("failure_class") or "").strip()
        if fc:
            st["failure_classes"][fc] += 1

    top_fc: dict[tuple[str, str, str], str] = {}
    for (day, proj, cc, plat), st in stats.items():
        fcd = st["failure_classes"]
        if fcd:
            top = max(fcd.items(), key=lambda x: x[1])[0]
            top_fc[(proj, cc, plat)] = top

    return dict(stats), top_fc


def format_kpi_markdown_tables(
    local_agent_root: Path,
    *,
    days: int = 7,
) -> str:
    events = load_recent_events(local_agent_root, days=days)
    stats, top_fc = aggregate_kpis(events)
    lines = [
        "",
        f"### KPI summary (last {days} days, UTC)",
        "",
        "| day | project | country | platform | total | success | fail | success_rate | avg_duration_sec | top_failure_class |",
        "|-----|---------|---------|----------|-------|---------|------|--------------|------------------|-------------------|",
    ]
    for key in sorted(stats.keys()):
        day, proj, cc, plat = key
        st = stats[key]
        t, ok, bad = st["total_runs"], st["success_runs"], st["failed_runs"]
        rate = f"{100.0 * ok / t:.1f}%" if t else "n/a"
        n = st["duration_n"]
        avg = f"{st['duration_sum'] / n:.1f}" if n else "n/a"
        tfc = top_fc.get((proj, cc, plat), "")
        lines.append(
            f"| {day} | {proj} | {cc} | {plat} | {t} | {ok} | {bad} | {rate} | {avg} | {tfc} |"
        )

    # Attention: aggregate failures by (proj, cc, plat) over window
    attn: dict[tuple[str, str, str], dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for ev in events:
        if ev.get("success"):
            continue
        k = (
            str(ev.get("project_id") or ""),
            str(ev.get("country_code") or ""),
            str(ev.get("platform") or ""),
        )
        fc = str(ev.get("failure_class") or "UNKNOWN")
        attn[k][fc] += 1

    lines.extend(["", "### Attention: high-signal failure mixes (last 7 days)", ""])
    if not attn:
        lines.append("_No failed runs in window._")
    else:
        lines.append("| project | country | platform | top_failure_class | count |")
        lines.append("|---------|---------|----------|-------------------|-------|")
        for (proj, cc, plat), fcd in sorted(attn.items(), key=lambda x: -sum(x[1].values())):
            if not fcd:
                continue
            fc, cnt = max(fcd.items(), key=lambda x: x[1])
            if cnt < 1:
                continue
            lines.append(f"| {proj} | {cc} | {plat} | {fc} | {cnt} |")

    lines.append("")
    return "\n".join(lines)
