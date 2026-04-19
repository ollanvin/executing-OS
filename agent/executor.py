from __future__ import annotations

import json
import logging
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from build_prompt_generator import generate_build_fix_prompt
from models import ResultSpec, StepResult, TaskSpec

_LOG = logging.getLogger("local_agent")

STEP_SCRIPTS: dict[str, str] = {
    "git_snapshot": "git_snapshot.ps1",
    "gradle_build": "run_gradle_build.ps1",
    "adb_install": "run_adb_install.ps1",
    "adb_call_simulation": "run_adb_call.ps1",
    "logcat_capture": "capture_logcat.ps1",
}


def _artifact_folder_name(task: TaskSpec, started_at: datetime) -> str:
    ts = started_at.strftime("%Y%m%d-%H%M%S")
    if "_" in task.id:
        suffix = task.id.split("_", 1)[1]
    else:
        suffix = task.id.replace(":", "-")
    return f"{ts}_{suffix}"


def _script_cli_args(step: str, task: TaskSpec, out_dir: Path) -> list[str]:
    if step == "git_snapshot":
        return [
            "-RepoPath",
            task.repoPath,
            "-OutDir",
            str(out_dir),
        ]
    if step == "gradle_build":
        return [
            "-RepoPath",
            task.repoPath,
            "-OutDir",
            str(out_dir),
        ]
    if step == "adb_install":
        return [
            "-RepoPath",
            task.repoPath,
            "-DeviceId",
            task.deviceId,
            "-OutDir",
            str(out_dir),
        ]
    if step == "adb_call_simulation":
        return [
            "-DeviceId",
            task.deviceId,
            "-PhoneNumber",
            task.phoneNumber,
            "-OutDir",
            str(out_dir),
        ]
    if step == "logcat_capture":
        return [
            "-DeviceId",
            task.deviceId,
            "-OutDir",
            str(out_dir),
        ]
    raise ValueError(f"Unknown step: {step}")


def run_task(task: TaskSpec, config: dict[str, Any]) -> ResultSpec:
    scripts_dir = Path(config["scriptsDir"])
    artifacts_root = Path(config["artifactsDir"])
    started = datetime.now(timezone.utc)
    folder = _artifact_folder_name(task, started)
    out_dir = artifacts_root / folder
    artifacts_abs = str(out_dir.resolve())
    _LOG.info(
        "[executor] run_task enter task_id=%s steps=%s artifacts_dir=%s",
        task.id,
        repr(task.steps),
        artifacts_abs,
    )
    out_dir.mkdir(parents=True, exist_ok=True)

    step_results: list[StepResult] = []
    error_summary: Optional[str] = None
    final_status = "PASS"
    build_prompt_path: Optional[str] = None

    for step in task.steps:
        script_name = STEP_SCRIPTS.get(step)
        if not script_name:
            code = 1
            step_results.append(StepResult(name=step, exitCode=code))
            final_status = "FAIL"
            error_summary = f"Unknown step: {step} (exitCode={code})"
            break

        script_path = scripts_dir / script_name
        if not script_path.is_file():
            code = 1
            step_results.append(StepResult(name=step, exitCode=code))
            final_status = "FAIL"
            error_summary = f"Script not found: {script_path} (exitCode={code})"
            break

        log_path = out_dir / f"{step}.log"
        args = [
            "powershell",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(script_path),
            *_script_cli_args(step, task, out_dir),
        ]
        proc = subprocess.run(
            args,
            capture_output=True,
            text=True,
        )
        combined = ""
        if proc.stdout:
            combined += proc.stdout
        if proc.stderr:
            if combined and not combined.endswith("\n"):
                combined += "\n"
            combined += proc.stderr
        log_path.write_text(combined, encoding="utf-8")

        code = proc.returncode
        step_results.append(StepResult(name=step, exitCode=code))
        if code != 0:
            final_status = "FAIL"
            if step == "gradle_build":
                build_log_path = out_dir / "build.log"
                prompt_text = generate_build_fix_prompt(
                    build_log_path,
                    task.project,
                    task.id,
                )
                prompt_file = out_dir / "build_fix_prompt.txt"
                prompt_file.write_text(prompt_text, encoding="utf-8")
                build_prompt_path = str(prompt_file.resolve())
                error_summary = (
                    "gradle build failed, see build.log and build_fix_prompt.txt for details"
                )
            else:
                error_summary = f"{step} failed (exitCode={code})"
            break

    finished = datetime.now(timezone.utc)
    result = ResultSpec(
        taskId=task.id,
        status=final_status,
        startedAt=started.strftime("%Y-%m-%dT%H:%M:%SZ"),
        finishedAt=finished.strftime("%Y-%m-%dT%H:%M:%SZ"),
        artifactsDir=str(out_dir.resolve()),
        errorSummary=error_summary,
        steps=step_results,
        buildPromptPath=build_prompt_path,
    )

    result_path = out_dir / "result.json"
    result_path.write_text(
        json.dumps(result.to_dict(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    return result
