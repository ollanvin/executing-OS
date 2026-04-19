"""Shared time / display helpers."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone


def utc_iso_to_kst_display(utc_iso: str) -> str:
    """Best-effort KST display for executor reports (no external deps)."""
    if not utc_iso or utc_iso == "":
        return ""
    try:
        raw = utc_iso.replace("Z", "+00:00")
        dt = datetime.fromisoformat(raw)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        kst = timezone(timedelta(hours=9))
        return dt.astimezone(kst).strftime("%Y-%m-%d %H:%M:%S KST")
    except ValueError:
        return utc_iso
