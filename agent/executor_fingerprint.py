"""
Environment fingerprint — snapshot host toolchain for Executor OS evidence.

Linked from task_result / validation / gate reports.
"""

from __future__ import annotations

import json
import os
import platform
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def collect_environment_snapshot() -> dict[str, Any]:
    def which(name: str) -> str | None:
        p = shutil.which(name)
        return str(Path(p).resolve()) if p else None

    return {
        "schema_version": "environment_snapshot_v1",
        "captured_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "python": {
            "executable": sys.executable,
            "version": sys.version.split()[0],
        },
        "os": {
            "system": platform.system(),
            "release": platform.release(),
            "machine": platform.machine(),
            "node": platform.node(),
        },
        "tools": {
            "git": which("git"),
            "java": which("java"),
            "gradle": which("gradle"),
            "adb": which("adb"),
            "node": which("node"),
            "npm": which("npm"),
        },
        "env_hints": {
            "ANDROID_HOME": os.environ.get("ANDROID_HOME", ""),
            "JAVA_HOME": os.environ.get("JAVA_HOME", ""),
            "LOCAL_EXECUTOR_DRY_RUN": os.environ.get("LOCAL_EXECUTOR_DRY_RUN", ""),
        },
    }


def write_environment_snapshot(run_root: Path) -> Path:
    reports = run_root / "reports"
    reports.mkdir(parents=True, exist_ok=True)
    path = reports / "environment_snapshot.json"
    path.write_text(
        json.dumps(collect_environment_snapshot(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return path
