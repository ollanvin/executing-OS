from __future__ import annotations

import json
import logging
import os
import sys
import tempfile
import time
import traceback
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

from executor import run_task
from models import ResultSpec, TaskSpec

_LOG = logging.getLogger("local_agent")


def _setup_logging(log_path: Path) -> None:
    _LOG.setLevel(logging.DEBUG)
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(message)s")
    fh = logging.FileHandler(log_path, encoding="utf-8")
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(fmt)
    sh = logging.StreamHandler(sys.stderr)
    sh.setLevel(logging.INFO)
    sh.setFormatter(fmt)
    _LOG.handlers.clear()
    _LOG.addHandler(fh)
    _LOG.addHandler(sh)


def _load_config(config_path: Path) -> dict[str, Any]:
    with open(config_path, encoding="utf-8-sig") as f:
        return json.load(f)


def _ensure_layout(config: dict[str, Any]) -> None:
    for key in ("rootDir", "tasksDir", "artifactsDir", "scriptsDir"):
        os.makedirs(config[key], exist_ok=True)

    tasks_json = Path(config["tasksDir"]) / "tasks.json"
    if not tasks_json.is_file():
        tasks_json.write_text("[]", encoding="utf-8")


def _load_tasks_raw(path: Path) -> list[dict[str, Any]]:
    with open(path, encoding="utf-8-sig") as f:
        raw = f.read().strip()
    if not raw:
        return []
    data = json.loads(raw)
    if not isinstance(data, list):
        raise ValueError("tasks.json must contain a JSON array")
    return data


def _save_tasks_atomic(path: Path, tasks: list[dict[str, Any]]) -> None:
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


def _tasks_to_specs(raw: list[dict[str, Any]]) -> list[TaskSpec]:
    return [TaskSpec.from_dict(t) for t in raw]


def _specs_to_dicts(specs: list[TaskSpec]) -> list[dict[str, Any]]:
    return [s.to_dict() for s in specs]


def _status_counts(specs: list[TaskSpec]) -> dict[str, int]:
    keys = ("PENDING", "RUN_PENDING", "RUNNING", "RUN_DONE", "FAILED")
    counts: dict[str, int] = {k: 0 for k in keys}
    other = 0
    for s in specs:
        if s.status in counts:
            counts[s.status] += 1
        else:
            other += 1
    if other:
        counts["OTHER"] = other
    return counts


def _log_tasks_load_error(path_abs: str, kind: str, exc: BaseException) -> None:
    _LOG.error("tasks.json %s failed (file=%s): %s", kind, path_abs, exc)
    _LOG.error("%s", traceback.format_exc())


STALE_RUNNING_AFTER = timedelta(minutes=10)

STALE_RUNNING_ERROR_SUMMARY = (
    "stale RUNNING detected at agent startup (previous run exceeded 10 minutes)"
)


def _parse_run_started_utc(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        ts = s
        if ts.endswith("Z"):
            ts = ts[:-1] + "+00:00"
        dt = datetime.fromisoformat(ts)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except ValueError:
        return None


def _running_is_stale(task: TaskSpec, now: datetime) -> bool:
    if task.status != "RUNNING":
        return False
    parsed = _parse_run_started_utc(task.runStartedAt)
    if parsed is None:
        return True
    return (now - parsed) >= STALE_RUNNING_AFTER


def _mark_stale_running_failed(specs: list[TaskSpec]) -> bool:
    now = datetime.now(timezone.utc)
    changed = False
    for s in specs:
        if not _running_is_stale(s, now):
            continue
        rid = s.id
        rstart = s.runStartedAt
        s.status = "FAILED"
        s.errorSummary = STALE_RUNNING_ERROR_SUMMARY
        s.runStartedAt = None
        changed = True
        _LOG.warning(
            "[stale] RUNNING task marked FAILED (id=%r, runStartedAt was %r)",
            rid,
            rstart,
        )
    return changed


def _selection_info(specs: list[TaskSpec]) -> tuple[Optional[str], str]:
    running = [s for s in specs if s.status == "RUNNING"]
    if running:
        return (None, "blocked_by_running")
    pending_indices = [i for i, s in enumerate(specs) if s.status == "RUN_PENDING"]
    if not pending_indices:
        return (None, "no_run_pending")
    i = pending_indices[0]
    pend_count = len(pending_indices)
    return (
        specs[i].id,
        f"picked_first_run_pending_index={i}, run_pending_count={pend_count}",
    )


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    config_path = root / "config.json"
    config = _load_config(config_path)
    _ensure_layout(config)

    tasks_path = (Path(config["tasksDir"]) / "tasks.json").resolve()
    log_path = Path(config["rootDir"]) / "local-agent.log"
    _setup_logging(log_path)

    poll = int(config.get("pollIntervalSec", 3))

    _LOG.info(
        "Local agent started. tasks.json (absolute)=%s | log file=%s | poll=%ss | Ctrl+C to stop.",
        str(tasks_path),
        str(log_path.resolve()),
        poll,
    )

    try:
        raw0 = _load_tasks_raw(tasks_path)
        specs0 = _tasks_to_specs(raw0)
        if _mark_stale_running_failed(specs0):
            _save_tasks_atomic(tasks_path, _specs_to_dicts(specs0))
            _LOG.warning(
                "[stale] startup sweep: stale RUNNING task(s) set to FAILED (tasks.json updated)",
            )
    except Exception as exc:
        _LOG.error("[stale] startup sweep failed: %s", exc)
        _LOG.error("%s", traceback.format_exc())

    while True:
        try:
            try:
                raw = _load_tasks_raw(tasks_path)
            except OSError as exc:
                _log_tasks_load_error(str(tasks_path), "read", exc)
                time.sleep(poll)
                continue
            except json.JSONDecodeError as exc:
                _log_tasks_load_error(str(tasks_path), "JSON parse", exc)
                time.sleep(poll)
                continue
            except ValueError as exc:
                _log_tasks_load_error(str(tasks_path), "validate", exc)
                time.sleep(poll)
                continue

            try:
                specs = _tasks_to_specs(raw)
            except Exception as exc:
                _log_tasks_load_error(str(tasks_path), "TaskSpec parse", exc)
                time.sleep(poll)
                continue

            if _mark_stale_running_failed(specs):
                _save_tasks_atomic(tasks_path, _specs_to_dicts(specs))
                try:
                    raw = _load_tasks_raw(tasks_path)
                    specs = _tasks_to_specs(raw)
                except Exception as exc:
                    _log_tasks_load_error(str(tasks_path), "reload after stale fix", exc)
                    time.sleep(poll)
                    continue

            counts = _status_counts(specs)
            other_part = ""
            if "OTHER" in counts:
                other_part = f" OTHER={counts['OTHER']}"
            _LOG.info(
                "[poll] tasks_file=%s total=%d PENDING=%d RUN_PENDING=%d RUNNING=%d RUN_DONE=%d FAILED=%d%s",
                str(tasks_path),
                len(specs),
                counts["PENDING"],
                counts["RUN_PENDING"],
                counts["RUNNING"],
                counts["RUN_DONE"],
                counts["FAILED"],
                other_part,
            )

            running = [s for s in specs if s.status == "RUNNING"]
            if running:
                ids = ", ".join(t.id for t in running)
                _LOG.info("[poll] RUNNING task id(s): %s", ids)

            sel_id, sel_reason = _selection_info(specs)
            sel_id_log = "null" if sel_id is None else sel_id
            _LOG.info(
                "[poll] selected_task_id=%s selection_reason=%s",
                sel_id_log,
                sel_reason,
            )

            if running:
                time.sleep(poll)
                continue

            pending_idx = None
            for i, s in enumerate(specs):
                if s.status == "RUN_PENDING":
                    pending_idx = i
                    break

            if pending_idx is None:
                time.sleep(poll)
                continue

            task = specs[pending_idx]
            _LOG.info("[run] starting task id=%r", task.id)
            task.status = "RUNNING"
            task.runStartedAt = datetime.now(timezone.utc).strftime(
                "%Y-%m-%dT%H:%M:%SZ"
            )
            raw = _specs_to_dicts(specs)
            _save_tasks_atomic(tasks_path, raw)

            try:
                result = run_task(task, config)
            except Exception as exc:
                now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                result = ResultSpec(
                    taskId=task.id,
                    status="FAIL",
                    startedAt=now,
                    finishedAt=now,
                    artifactsDir=str(Path(config["artifactsDir"])),
                    errorSummary=f"run_task raised: {exc}",
                    steps=[],
                    buildPromptPath=None,
                )
                _LOG.error("[run] run_task exception: %r", exc)
                _LOG.error("%s", traceback.format_exc())

            try:
                raw = _load_tasks_raw(tasks_path)
                specs = _tasks_to_specs(raw)
            except Exception as exc:
                _log_tasks_load_error(str(tasks_path), "reload after run", exc)
                time.sleep(poll)
                continue

            for i, s in enumerate(specs):
                if s.id == task.id:
                    if result.status == "PASS":
                        s.status = "RUN_DONE"
                        s.errorSummary = None
                        s.buildPromptPath = None
                    else:
                        s.status = "FAILED"
                        s.errorSummary = result.errorSummary
                        s.buildPromptPath = result.buildPromptPath
                    s.runStartedAt = None
                    break
            _save_tasks_atomic(tasks_path, _specs_to_dicts(specs))
            _LOG.info("[run] finished id=%r result=%s", task.id, result.status)
        except Exception as exc:
            _LOG.error("[error] main loop: %r", exc)
            _LOG.error("%s", traceback.format_exc())
            time.sleep(poll)


if __name__ == "__main__":
    main()
