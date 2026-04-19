from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from models import TaskSpec

ROOT = Path(__file__).resolve().parent.parent


def load_config() -> dict[str, Any]:
    path = ROOT / "config.json"
    with open(path, encoding="utf-8-sig") as f:
        return json.load(f)


def tasks_path(config: dict[str, Any]) -> Path:
    return (Path(config["tasksDir"]) / "tasks.json").resolve()


def load_tasks_raw(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        return []
    with open(path, encoding="utf-8-sig") as f:
        raw = f.read().strip()
    if not raw:
        return []
    data = json.loads(raw)
    if not isinstance(data, list):
        raise ValueError("tasks.json must contain a JSON array")
    return data


def save_tasks_atomic(path: Path, tasks: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(
        dir=str(path.parent),
        prefix=".tasks_",
        suffix=".tmp.json",
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(tasks, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def parse_created_at(s: str) -> datetime:
    ts = s
    if ts.endswith("Z"):
        ts = ts[:-1] + "+00:00"
    dt = datetime.fromisoformat(ts)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def preset_myphonecheck_build_test(
    config: dict[str, Any], now: datetime, created_by: str
) -> TaskSpec:
    repo = config.get("projects", {}).get("MyPhoneCheck")
    if not repo:
        raise ValueError("config.json: projects.MyPhoneCheck is missing")

    ts = now.strftime("%Y-%m-%dT%H-%M-%S")
    return TaskSpec(
        id=f"{ts}_myphonecheck_build_test",
        project="MyPhoneCheck",
        type="android_build_install_test",
        repoPath=str(repo),
        deviceId="emulator-5554",
        phoneNumber="01099998888",
        steps=[
            "git_snapshot",
            "gradle_build",
            "adb_install",
            "adb_call_simulation",
            "logcat_capture",
        ],
        status="RUN_PENDING",
        createdAt=now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        createdBy=created_by,
    )


PRESETS: dict[str, Callable[[dict[str, Any], datetime, str], TaskSpec]] = {
    "myphonecheck_build_test": preset_myphonecheck_build_test,
}


def enqueue_preset(preset_name: str, created_by: str = "cli") -> TaskSpec:
    if preset_name not in PRESETS:
        raise ValueError(
            f"Unknown preset: {preset_name!r}. Known: {', '.join(sorted(PRESETS))}"
        )
    config = load_config()
    path = tasks_path(config)
    now = datetime.now(timezone.utc)
    task = PRESETS[preset_name](config, now, created_by)
    raw = load_tasks_raw(path)
    raw.append(task.to_dict())
    save_tasks_atomic(path, raw)
    return task


def list_tasks(limit: int = 10) -> list[dict[str, Any]]:
    config = load_config()
    path = tasks_path(config)
    raw = load_tasks_raw(path)
    specs = [TaskSpec.from_dict(t) for t in raw]
    specs.sort(key=lambda s: parse_created_at(s.createdAt), reverse=True)
    n = max(1, int(limit))
    out: list[dict[str, Any]] = []
    for s in specs[:n]:
        out.append(
            {
                "id": s.id,
                "status": s.status,
                "createdAt": s.createdAt,
                "project": s.project,
            }
        )
    return out


def get_last_build_prompt() -> dict[str, Any]:
    config = load_config()
    path = tasks_path(config)
    raw = load_tasks_raw(path)
    candidates: list[TaskSpec] = []
    for t in raw:
        s = TaskSpec.from_dict(t)
        if s.status != "FAILED":
            continue
        if not s.buildPromptPath:
            continue
        candidates.append(s)

    if not candidates:
        return {"ok": False, "error": "No FAILED task with buildPromptPath found."}

    candidates.sort(key=lambda x: parse_created_at(x.createdAt), reverse=True)
    pick = candidates[0]
    p = Path(pick.buildPromptPath or "")
    if not p.is_file():
        return {
            "ok": False,
            "error": f"buildPromptPath missing on disk: {pick.buildPromptPath!r}",
            "taskId": pick.id,
        }

    text = p.read_text(encoding="utf-8", errors="replace")
    return {
        "ok": True,
        "taskId": pick.id,
        "path": str(p.resolve()),
        "content": text,
    }


def retry_last_failed(created_by: str = "bot") -> TaskSpec:
    config = load_config()
    path = tasks_path(config)
    raw = load_tasks_raw(path)
    failed: list[TaskSpec] = []
    for t in raw:
        s = TaskSpec.from_dict(t)
        if s.status == "FAILED":
            failed.append(s)
    if not failed:
        raise ValueError("No FAILED task to retry.")

    failed.sort(key=lambda x: parse_created_at(x.createdAt), reverse=True)
    src = failed[0]
    now = datetime.now(timezone.utc)
    ts = now.strftime("%Y-%m-%dT%H-%M-%S")
    suffix = src.id.split("_", 1)[-1] if "_" in src.id else "task"
    new_id = f"{ts}_retry_{suffix}"
    new_task = TaskSpec(
        id=new_id,
        project=src.project,
        type=src.type,
        repoPath=src.repoPath,
        deviceId=src.deviceId,
        phoneNumber=src.phoneNumber,
        steps=list(src.steps),
        status="RUN_PENDING",
        createdAt=now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        createdBy=created_by,
        errorSummary=None,
        runStartedAt=None,
        buildPromptPath=None,
    )
    raw.append(new_task.to_dict())
    save_tasks_atomic(path, raw)
    return new_task
