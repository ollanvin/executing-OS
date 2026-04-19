"""Shared daily-style global report for multi-country executor batches + KPI loop."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def append_daily_global_report(local_agent_root: Path, entries: list[dict[str, Any]]) -> Path:
    """
    Append a markdown table to runs/daily_global_report.md for handoff to other teams.
    """
    path = local_agent_root / "runs" / "daily_global_report.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    lines = [
        "",
        f"## Global batch — {ts}",
        "",
        "| project_id | country | platform | gate | status | duration_sec | search_primary | locale | failure_class |",
        "|------------|---------|----------|------|--------|--------------|----------------|--------|---------------|",
    ]
    for e in entries:
        lines.append(
            "| {project_id} | {country} | {plat} | {gate} | {status} | {dur} | {sp} | {loc} | {fc} |".format(
                project_id=e.get("project_id", ""),
                country=e.get("country_code", ""),
                plat=e.get("platform", ""),
                gate=e.get("gate_verdict", ""),
                status=e.get("status", ""),
                dur=e.get("duration_sec", ""),
                sp=e.get("search_primary", ""),
                loc=e.get("locale", ""),
                fc=e.get("failure_class", ""),
            )
        )
    with path.open("a", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")
    return path


def append_kpi_section_only(local_agent_root: Path, *, days: int = 7) -> Path:
    """Append only the KPI / failure-pattern block (no batch table)."""
    path = local_agent_root / "runs" / "daily_global_report.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    from executor_metrics import format_kpi_markdown_tables

    with path.open("a", encoding="utf-8") as fh:
        fh.write(
            "\n## KPI refresh — "
            + datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            + "\n"
        )
        fh.write(format_kpi_markdown_tables(local_agent_root, days=days))
    return path
