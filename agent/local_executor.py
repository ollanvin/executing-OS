"""
Local Executor OS v1 — Windows-first pipeline engine.

Component map (see docs/local-executor-os.md):
- executor_schema: payload + policy merge (policy-as-code)
- executor_fingerprint: environment_snapshot.json
- executor_recipes: transient-only auto-remediation
- executor_screenshot: Paparazzi artifact + diff heuristics
- executor_failure: failure_class + escalation hints
- executor_country: profiles/*.json merge + subprocess locale env
- local_validator: evidence validation
- local_gatekeeper: quality gate + gate_report
- local_pipeline: CLI entry

Stages: SOURCE → ENV → (iOS front-end) → BUILD → TEST → SCREENSHOT → RUNTIME → REPORT → finalize.

iOS native build / IPA / TestFlight are explicitly out of scope on Windows; this executor only
proves “safe to hand off to Mac/CI” via preflight + resource/flow checks.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import shutil
import subprocess
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from contracts import WorkOrder
from executor_country import (
    build_merged_runtime_execution_profile,
    country_process_env,
    country_process_env_from_runtime_execution,
)
from executor_device import collect_device_context, write_device_context, write_runtime_profile_json
from executor_failure import FAILURE_STRUCTURAL, FAILURE_TRANSIENT, classify_failure
from executor_fingerprint import collect_environment_snapshot, write_environment_snapshot
from executor_recipes import apply_recipe
from executor_schema import validate_and_normalize_executor_payload
from executor_screenshot import collect_paparazzi_artifacts, detect_paparazzi_diff
from task_ops import utc_iso_to_kst_display

_LOG = logging.getLogger("local_executor")

ROOT = Path(__file__).resolve().parent.parent
PROJECTS_DIR = ROOT / "projects"

EventSink = Callable[[dict[str, Any]], None] | None


def load_executor_project_config(project_id: str) -> dict[str, Any]:
    path = PROJECTS_DIR / project_id / "config.json"
    if not path.is_file():
        raise FileNotFoundError(
            f"Executor project config missing: {path} (create projects/{project_id}/config.json)"
        )
    with open(path, encoding="utf-8-sig") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        raise ValueError("project config must be a JSON object")
    return data


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _dry_run() -> bool:
    return (os.environ.get("LOCAL_EXECUTOR_DRY_RUN") or "").strip().lower() in (
        "1",
        "true",
        "yes",
    )


def _attach_process_env(ctx: PipelineContext) -> None:
    prof = ctx.payload.get("country_profile") or {}
    extra = country_process_env(prof)
    jto = extra.pop("JAVA_TOOL_OPTIONS", None)
    if jto:
        prev = os.environ.get("JAVA_TOOL_OPTIONS", "").strip()
        extra["JAVA_TOOL_OPTIONS"] = f"{prev} {jto}".strip() if prev else jto
    ctx._process_env_extra = extra


def _normalize_subprocess_argv(args: list[str]) -> list[str]:
    """Windows: bare names like 'npm' resolve to an extensionless shim; CreateProcess cannot run it.

    Use PATH resolution (e.g. ``npm`` → ``npm.cmd``) so ``subprocess.run`` works the same as PowerShell.
    """
    if not args or os.name != "nt":
        return list(args)
    exe = args[0]
    if any(sep in exe for sep in (os.sep, "/")):
        return list(args)
    low = exe.lower()
    if low.endswith((".exe", ".cmd", ".bat", ".com", ".ps1")):
        return list(args)
    resolved = shutil.which(exe)
    if resolved:
        return [resolved, *args[1:]]
    return list(args)


def _run_process(
    args: list[str],
    *,
    cwd: Path | None,
    timeout_sec: int,
    log_path: Path | None = None,
    env: dict[str, str] | None = None,
    ctx: PipelineContext | None = None,
    cmd_label: str = "cmd",
) -> tuple[int, str, str]:
    args = _normalize_subprocess_argv([str(a) for a in args])
    _LOG.debug("run_process cwd=%s args=%s", cwd, args)
    if ctx is not None:
        ctx.cmd_seq += 1
        if log_path is None:
            safe = re.sub(r"[^\w\-.]+", "_", cmd_label)[:40]
            log_path = ctx.run_root / "logs" / f"cmd_{ctx.cmd_seq:04d}_{safe}.txt"
        ctx.exec_struct(
            "command_begin",
            label=cmd_label,
            argv=args[:20],
            cwd=str(cwd) if cwd else None,
            log_path=str(log_path) if log_path else None,
        )
    if _dry_run():
        msg = "[DRY_RUN] skipped: " + " ".join(args[:6]) + ("…" if len(args) > 6 else "")
        if log_path:
            log_path.parent.mkdir(parents=True, exist_ok=True)
            log_path.write_text(msg + "\n", encoding="utf-8")
        if ctx is not None:
            ctx.exec_struct("command_end", label=cmd_label, exit_code=0, dry_run=True)
        return 0, msg, ""

    log_path.parent.mkdir(parents=True, exist_ok=True) if log_path else None
    base_env = os.environ.copy()
    if ctx is not None:
        base_env.update(getattr(ctx, "_process_env_extra", None) or {})
    env_full = {**base_env, **(env or {})}
    try:
        proc = subprocess.run(
            args,
            cwd=str(cwd) if cwd else None,
            capture_output=True,
            text=True,
            timeout=timeout_sec,
            env=env_full,
            shell=False,
        )
    except subprocess.TimeoutExpired as exc:
        out = (exc.stdout or "") + "\n[timeout]\n" + (exc.stderr or "")
        if log_path:
            log_path.write_text(out, encoding="utf-8", errors="replace")
        if ctx is not None:
            ctx.exec_struct("command_end", label=cmd_label, exit_code=124, timeout=True)
        return 124, exc.stdout or "", (exc.stderr or "") + "\n[timeout]"
    out = (proc.stdout or "") + (proc.stderr or "")
    if log_path:
        log_path.write_text(
            f"exit={proc.returncode}\n--- stdout ---\n{proc.stdout or ''}\n--- stderr ---\n{proc.stderr or ''}",
            encoding="utf-8",
            errors="replace",
        )
    code, out, err = proc.returncode, proc.stdout or "", proc.stderr or ""
    if ctx is not None:
        ctx.exec_struct(
            "command_end",
            label=cmd_label,
            exit_code=code,
            log_path=str(log_path) if log_path else None,
        )
    return code, out, err


@dataclass
class PipelineContext:
    project_id: str
    run_id: str
    run_root: Path
    payload: dict[str, Any]
    proj_cfg: dict[str, Any]
    global_cfg: dict[str, Any]
    source_root: Path | None = None
    started_at_utc: str = field(default_factory=_utc_now_iso)
    finished_at_utc: str = ""
    pipeline_state: str = "SOURCE_PREPARING"
    report: dict[str, Any] = field(default_factory=dict)
    failure_summary: str = ""
    commit_hash: str | None = None
    event_sink: EventSink = None
    cmd_seq: int = 0
    stage_history: list[dict[str, Any]] = field(default_factory=list)
    _process_env_extra: dict[str, str] = field(default_factory=dict)

    def exec_struct(self, event_type: str, **data: Any) -> None:
        logf = self.run_root / "logs" / "structured_events.jsonl"
        logf.parent.mkdir(parents=True, exist_ok=True)
        rec = {"ts": _utc_now_iso(), "type": event_type, **data}
        with logf.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
        _LOG.info("exec_struct %s %s", event_type, data.get("label", data.get("stage", "")))

    def emit(self, short_text: str, **meta: Any) -> None:
        if not self.event_sink:
            return
        self.event_sink(
            {
                "event_type": "action_progress",
                "action_name": "executor_pipeline",
                "short_text": short_text,
                "meta": {"run_id": self.run_id, **meta},
            }
        )


def _ensure_report_skeleton(ctx: PipelineContext) -> None:
    ctx.report = {
        "schema_version": "local_executor_production_1",
        "project_id": ctx.project_id,
        "run_id": ctx.run_id,
        "status": "SOURCE_PREPARING",
        "started_at_utc": ctx.started_at_utc,
        "finished_at_utc": "",
        "started_at_kst": utc_iso_to_kst_display(ctx.started_at_utc),
        "finished_at_kst": "",
        "executor_summary": {},
        "country_profile": {},
        "failure_analyses": [],
        "build": {"success": False, "log_path": "", "artifacts": []},
        "test": {"success": False, "log_path": "", "failed_tests": []},
        "runtime": {"success": False, "log_path": "", "screenshots": [], "steps": []},
        "env": {"ok": False, "missing_tools": []},
        "git": {
            "repo_url": ctx.payload.get("repo_url", ""),
            "branch_or_tag": ctx.payload.get("branch_or_tag", ""),
            "commit_hash": None,
        },
        "failure_summary": "",
        "environment_snapshot": {},
        "environment_snapshot_path": "",
        "validation_verdict": None,
        "gate_verdict": None,
        "evidence_complete": False,
        "ios_front_end": {"success": True, "checks": []},
        "ios_strategy": {
            "note": "Native iOS build/deploy runs on Mac or external CI; Windows executor performs preflight only.",
            "payload_ios_build_profile": "",
            "payload_ios_test_profile": "",
            "payload_ios_runtime_profile": "",
        },
        "screenshot": {
            "success": False,
            "mode": "",
            "runtime_capture_enabled": True,
            "paparazzi": {
                "ran": False,
                "task": "",
                "log_path": "",
                "generated_files": [],
                "diff_found": False,
                "report_path": "",
            },
        },
        "retry_limits": {},
    }


def _save_state(ctx: PipelineContext) -> None:
    p = ctx.run_root / "pipeline_state.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    rp = ctx.payload.get("retry_policy") or {}
    p.write_text(
        json.dumps(
            {
                "pipeline_state": ctx.pipeline_state,
                "failure_summary": ctx.failure_summary,
                "run_id": ctx.run_id,
                "report_status": ctx.report.get("status"),
                "stage_history": ctx.stage_history[-40:],
                "validation_verdict": ctx.report.get("validation_verdict"),
                "gate_verdict": ctx.report.get("gate_verdict"),
                "retry_limits": {
                    "max_attempts_build": rp.get("max_attempts_build"),
                    "max_attempts_test": rp.get("max_attempts_test"),
                    "max_attempts_runtime": rp.get("max_attempts_runtime"),
                    "max_attempts_screenshot": rp.get("max_attempts_screenshot"),
                    "structural_max_attempts": rp.get("structural_max_attempts"),
                    "max_pipeline_attempts": rp.get("max_pipeline_attempts"),
                },
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


def _stage_begin(ctx: PipelineContext, name: str) -> None:
    ctx.stage_history.append({"stage": name, "phase": "begin", "ts": _utc_now_iso()})


def _stage_end(ctx: PipelineContext, name: str, ok: bool) -> None:
    ctx.stage_history.append(
        {"stage": name, "phase": "end", "ok": ok, "ts": _utc_now_iso()}
    )


def _stage_timeout_sec(ctx: PipelineContext, key: str, default: int) -> int:
    st = ctx.payload.get("stage_timeouts") or {}
    return int(st.get(key) or default)


def _record_failure_analysis(ctx: PipelineContext, stage: str) -> None:
    ctx.report.setdefault("failure_analyses", []).append(classify_failure(ctx, stage))


def stage_device_runtime_merge(ctx: PipelineContext) -> bool:
    """
    Initial device scan + merged runtime_profile (device truth + country policy).
    Writes reports/device_context.json and reports/runtime_profile.json.
    """
    _stage_begin(ctx, "DEVICE_RUNTIME_MERGE")
    cp = ctx.payload.get("country_profile") or {}
    profile_file = str(cp.get("profile_file") or "").strip()
    cc = str(cp.get("country_code") or ctx.payload.get("country_code") or "US").lower()
    if not profile_file:
        profile_file = str((ROOT / "profiles" / f"{cc}.json").resolve())

    dc = collect_device_context()
    p_dc = write_device_context(ctx.run_root, dc)
    merged = build_merged_runtime_execution_profile(dc, cp)
    p_rt = write_runtime_profile_json(ctx.run_root, merged)

    ctx.report["device_context"] = dc
    ctx.report["device_context_path"] = str(p_dc.resolve())
    ctx.report["runtime_execution_profile"] = merged
    ctx.report["runtime_profile_path"] = str(p_rt.resolve())
    ctx.report["device_context_source"] = "initial_scan"
    ctx.report["country_profile_source"] = profile_file
    ctx.report["runtime_profile_policy"] = "device_context + policy overrides"

    extra = country_process_env_from_runtime_execution(merged)
    jto = extra.pop("JAVA_TOOL_OPTIONS", None)
    base = dict(getattr(ctx, "_process_env_extra", None) or {})
    if jto:
        prev = str(base.get("JAVA_TOOL_OPTIONS", "") or os.environ.get("JAVA_TOOL_OPTIONS", "")).strip()
        extra["JAVA_TOOL_OPTIONS"] = f"{prev} {jto}".strip() if prev else jto
    ctx._process_env_extra = {**base, **extra}

    _save_state(ctx)
    _stage_end(ctx, "DEVICE_RUNTIME_MERGE", True)
    return True


def _sync_report_meta(ctx: PipelineContext) -> None:
    ctx.report["country_profile"] = ctx.payload.get("country_profile") or {}
    ctx.report["executor_summary"] = {
        "project_id": ctx.project_id,
        "run_id": ctx.run_id,
        "platform": ctx.payload.get("platform"),
        "country_code": ctx.payload.get("country_code"),
        "build_profile": ctx.payload.get("build_profile"),
        "test_profile": ctx.payload.get("test_profile"),
        "runtime_profile": ctx.payload.get("runtime_profile"),
        "ios_build_profile": ctx.payload.get("ios_build_profile"),
        "ios_test_profile": ctx.payload.get("ios_test_profile"),
        "ios_runtime_profile": ctx.payload.get("ios_runtime_profile"),
    }
    ctx.report["ios_strategy"].update(
        {
            "payload_ios_build_profile": ctx.payload.get("ios_build_profile"),
            "payload_ios_test_profile": ctx.payload.get("ios_test_profile"),
            "payload_ios_runtime_profile": ctx.payload.get("ios_runtime_profile"),
        }
    )
    rp = ctx.payload.get("retry_policy") or {}
    ctx.report["retry_limits"] = {
        "max_attempts_build": int(rp.get("max_attempts_build") or 2),
        "max_attempts_test": int(rp.get("max_attempts_test") or 2),
        "max_attempts_runtime": int(rp.get("max_attempts_runtime") or 2),
        "max_attempts_screenshot": int(rp.get("max_attempts_screenshot") or 1),
        "structural_max_attempts": int(rp.get("structural_max_attempts") or 1),
        "max_pipeline_attempts": int(rp.get("max_pipeline_attempts") or 1),
    }


def stage_source_prepare(ctx: PipelineContext) -> bool:
    _stage_begin(ctx, "SOURCE_PREPARE")
    ctx.pipeline_state = "SOURCE_PREPARING"
    ctx.report["status"] = "SOURCE_PREPARING"
    to = int((ctx.payload.get("stage_timeouts") or {}).get("source_sec", 900))
    pref = ctx.payload.get("prefer_local_path")
    if pref and str(pref).strip():
        p = Path(str(pref).strip())
        if not p.is_absolute():
            p = (ROOT / p).resolve()
        if not p.is_dir():
            ctx.failure_summary = f"prefer_local_path not found: {p}"
            ctx.pipeline_state = "SOURCE_FAILED"
            ctx.report["status"] = "SOURCE_FAILED"
            ctx.report["failure_summary"] = ctx.failure_summary
            _record_failure_analysis(ctx, "SOURCE_PREPARE")
            _save_state(ctx)
            _stage_end(ctx, "SOURCE_PREPARE", False)
            return False
        ctx.source_root = p
        _refresh_git_meta(ctx)
        ctx.emit(f"SOURCE: local {p}")
        _stage_end(ctx, "SOURCE_PREPARE", True)
        return True

    url = str(ctx.payload.get("repo_url") or "").strip()
    branch = str(ctx.payload.get("branch_or_tag") or "main").strip()
    dest = ctx.run_root / "git_src"
    if dest.is_dir():
        shutil.rmtree(dest, ignore_errors=True)
    code, _, err = _run_process(
        ["git", "clone", "--depth", "1", "-b", branch, url, str(dest)],
        cwd=ctx.run_root,
        timeout_sec=to,
        log_path=ctx.run_root / "source" / "git_clone.log",
        ctx=ctx,
        cmd_label="git_clone",
    )
    if code != 0:
        ctx.failure_summary = (err or "")[:500] or f"git clone failed ({code})"
        ctx.pipeline_state = "SOURCE_FAILED"
        ctx.report["status"] = "SOURCE_FAILED"
        ctx.report["failure_summary"] = ctx.failure_summary
        _record_failure_analysis(ctx, "SOURCE_PREPARE")
        _save_state(ctx)
        _stage_end(ctx, "SOURCE_PREPARE", False)
        return False
    ctx.source_root = dest
    _refresh_git_meta(ctx)
    _stage_end(ctx, "SOURCE_PREPARE", True)
    return True


def _refresh_git_meta(ctx: PipelineContext) -> None:
    if not ctx.source_root:
        return
    try:
        proc = subprocess.run(
            ["git", "-C", str(ctx.source_root), "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if proc.returncode == 0:
            h = (proc.stdout or "").strip()
            ctx.commit_hash = h
            ctx.report["git"]["commit_hash"] = h
    except (OSError, subprocess.SubprocessError):
        pass


def stage_env_check(ctx: PipelineContext) -> bool:
    _stage_begin(ctx, "ENV_CHECK")
    ctx.pipeline_state = "ENV_CHECKING"
    ctx.report["status"] = "ENV_CHECKING"
    platform = str(ctx.payload.get("platform") or "android")
    missing: list[str] = []
    if platform == "web":
        for name, exe in (("git", "git"), ("node", "node"), ("npm", "npm")):
            if not shutil.which(exe):
                missing.append(f"tool:{name}")
    elif platform == "ios":
        if not shutil.which("git"):
            missing.append("tool:git")
    else:
        for name, exe in (("git", "git"), ("java", "java")):
            if not shutil.which(exe):
                missing.append(f"tool:{name}")

    if platform == "android" and not os.environ.get("ANDROID_HOME"):
        missing.append("env:ANDROID_HOME (recommended for Android)")

    snap = collect_environment_snapshot()
    ctx.report["environment_snapshot"] = snap
    path = write_environment_snapshot(ctx.run_root)
    ctx.report["environment_snapshot_path"] = str(path.resolve())

    ctx.report["env"] = {"ok": len(missing) == 0, "missing_tools": missing}
    if missing:
        ctx.failure_summary = "환경 검증 실패: " + ", ".join(missing)
        ctx.pipeline_state = "ENV_FAILED"
        ctx.report["status"] = "ENV_FAILED"
        ctx.report["failure_summary"] = ctx.failure_summary
        _record_failure_analysis(ctx, "ENV_CHECK")
        _save_state(ctx)
        _stage_end(ctx, "ENV_CHECK", False)
        return False

    ctx.pipeline_state = "ENV_READY"
    _save_state(ctx)
    _stage_end(ctx, "ENV_CHECK", True)
    return True


def _gradle_script(ctx: PipelineContext) -> Path:
    assert ctx.source_root
    gw = str(ctx.proj_cfg.get("gradle_wrapper_relative") or "gradlew.bat")
    return (ctx.source_root / gw).resolve()


def stage_ios_front_end(ctx: PipelineContext) -> bool:
    """
    Windows-only iOS preflight: flow graph + optional string resources.
    Does not invoke xcodebuild; final IPA is produced on Mac/CI.
    """
    if str(ctx.payload.get("platform") or "") != "ios":
        return True
    _stage_begin(ctx, "IOS_FRONTEND")
    checks: list[dict[str, Any]] = []
    ok = True
    assert ctx.source_root
    flows_rel = ctx.proj_cfg.get("ios_flows_relative") or "flows.json"
    flows_path = (ctx.source_root / str(flows_rel)).resolve()
    if not flows_path.is_file():
        ctx.failure_summary = f"iOS flows file missing: {flows_path}"
        ok = False
        checks.append({"check": "flows_json", "ok": False, "path": str(flows_path)})
    else:
        try:
            data = json.loads(flows_path.read_text(encoding="utf-8"))
            nodes = data.get("nodes") if isinstance(data, dict) else None
            edges = data.get("edges") if isinstance(data, dict) else None
            if not isinstance(nodes, list) or not isinstance(edges, list):
                raise ValueError("nodes/edges must be lists")
            ids = {str(n.get("id")) for n in nodes if isinstance(n, dict)}
            for e in edges:
                if not isinstance(e, dict):
                    continue
                if e.get("from") not in ids or e.get("to") not in ids:
                    raise ValueError("edge references unknown node")
            checks.append({"check": "flows_json", "ok": True, "path": str(flows_path)})
        except (OSError, ValueError, json.JSONDecodeError) as exc:
            ok = False
            ctx.failure_summary = f"iOS flows invalid: {exc}"
            checks.append({"check": "flows_json", "ok": False, "error": str(exc)})

    for rel in ctx.proj_cfg.get("ios_required_string_files") or []:
        p = (ctx.source_root / str(rel)).resolve()
        if not p.is_file():
            ok = False
            checks.append({"check": "strings", "ok": False, "path": str(p)})
        else:
            checks.append({"check": "strings", "ok": True, "path": str(p)})

    ctx.report["ios_front_end"] = {"success": ok, "checks": checks}
    if not ok:
        ctx.pipeline_state = "BUILD_FAILED"
        ctx.report["status"] = "BUILD_FAILED"
        ctx.report["failure_summary"] = ctx.failure_summary or "iOS front-end validation failed"
        _record_failure_analysis(ctx, "IOS_FRONTEND")
        _save_state(ctx)
        _stage_end(ctx, "IOS_FRONTEND", False)
        return False
    _stage_end(ctx, "IOS_FRONTEND", True)
    return True


def stage_build(ctx: PipelineContext, attempt: int = 0) -> bool:
    _stage_begin(ctx, "BUILD")
    ctx.pipeline_state = "BUILDING"
    ctx.report["status"] = "BUILDING"
    _save_state(ctx)
    to = _stage_timeout_sec(ctx, "build_sec", int(ctx.proj_cfg.get("build_timeout_sec", 3600)))
    platform = str(ctx.payload.get("platform") or ctx.proj_cfg.get("platform") or "android")
    profile = str(
        ctx.payload.get("build_profile") or ctx.proj_cfg.get("default_build_profile") or "debug"
    )
    build_dir = ctx.run_root / "build"
    build_dir.mkdir(parents=True, exist_ok=True)
    log_path = build_dir / "build.log"

    if _dry_run():
        log_path.write_text("[DRY_RUN] build skipped\n", encoding="utf-8")
        ctx.report["build"] = {
            "success": True,
            "log_path": str(log_path.resolve()),
            "artifacts": [],
        }
        ctx.pipeline_state = "BUILD_DONE"
        _save_state(ctx)
        _stage_end(ctx, "BUILD", True)
        return True

    if platform == "ios":
        log_path.write_text(
            "[ios] Native xcodebuild not run on Windows. "
            "profiles: "
            f"{ctx.payload.get('ios_build_profile')} / "
            f"{ctx.payload.get('ios_test_profile')} / "
            f"{ctx.payload.get('ios_runtime_profile')}\n",
            encoding="utf-8",
        )
        ctx.report["build"] = {
            "success": True,
            "log_path": str(log_path.resolve()),
            "artifacts": [],
            "skipped_reason": "ios_native_deferred_to_mac_ci",
        }
        ctx.pipeline_state = "BUILD_DONE"
        _save_state(ctx)
        _stage_end(ctx, "BUILD", True)
        return True

    if platform == "web":
        assert ctx.source_root
        if ctx.proj_cfg.get("web_build_skip"):
            log_path.write_text(
                "[web] BUILD skipped (web_build_skip=true in project config).\n", encoding="utf-8"
            )
            ctx.report["build"] = {
                "success": True,
                "log_path": str(log_path.resolve()),
                "artifacts": [],
                "skipped_reason": "web_build_skip",
            }
            ctx.pipeline_state = "BUILD_DONE"
            _save_state(ctx)
            _stage_end(ctx, "BUILD", True)
            return True
        cmds = ctx.proj_cfg.get("web_build_commands") or [["npm", "ci"], ["npm", "run", "build"]]
        failed = False
        for idx, c in enumerate(cmds):
            if not isinstance(c, list):
                continue
            step_log = log_path if idx == len(cmds) - 1 else build_dir / f"web_build_{idx}.log"
            argv = [str(x) for x in c]
            print(f"DEBUG_BUILD_CMD: {argv}", flush=True)
            _LOG.info("DEBUG_BUILD_CMD: %s", argv)
            code, _, err = _run_process(
                argv,
                cwd=ctx.source_root,
                timeout_sec=to,
                log_path=step_log,
                ctx=ctx,
                cmd_label=f"web_build_{idx}",
            )
            if code != 0:
                failed = True
                ctx.failure_summary = (err or "")[:500] or "web build failed"
                if not log_path.is_file() and step_log.is_file():
                    shutil.copy2(step_log, log_path)
                break
        if failed:
            ctx.report["build"] = {"success": False, "log_path": str(log_path.resolve()), "artifacts": []}
            ctx.pipeline_state = "BUILD_FAILED"
            ctx.report["status"] = "BUILD_FAILED"
            ctx.report["failure_summary"] = ctx.failure_summary
            _save_state(ctx)
            _stage_end(ctx, "BUILD", False)
            return False
        ctx.report["build"] = {"success": True, "log_path": str(log_path.resolve()), "artifacts": []}
        ctx.pipeline_state = "BUILD_DONE"
        _save_state(ctx)
        _stage_end(ctx, "BUILD", True)
        return True

    assert ctx.source_root
    gradle = _gradle_script(ctx)
    if not gradle.is_file():
        ctx.failure_summary = f"Gradle wrapper not found: {gradle}"
        ctx.report["build"] = {"success": False, "log_path": str(log_path.resolve()), "artifacts": []}
        ctx.pipeline_state = "BUILD_FAILED"
        ctx.report["status"] = "BUILD_FAILED"
        ctx.report["failure_summary"] = ctx.failure_summary
        log_path.write_text(ctx.failure_summary, encoding="utf-8")
        _save_state(ctx)
        _stage_end(ctx, "BUILD", False)
        return False

    bcfg = (ctx.proj_cfg.get("build") or {}).get(profile) or (ctx.proj_cfg.get("build") or {}).get(
        "debug"
    )
    tasks = (bcfg or {}).get("tasks") or ["assembleDebug"]
    args = [str(gradle), "--no-daemon", *[str(t) for t in tasks]]
    code, _, err = _run_process(
        args,
        cwd=ctx.source_root,
        timeout_sec=to,
        log_path=log_path,
        ctx=ctx,
        cmd_label="gradle_build",
    )
    if code != 0:
        ctx.failure_summary = f"Gradle build failed (exit {code}); see build.log"
        ctx.report["build"] = {"success": False, "log_path": str(log_path.resolve()), "artifacts": []}
        ctx.pipeline_state = "BUILD_FAILED"
        ctx.report["status"] = "BUILD_FAILED"
        ctx.report["failure_summary"] = ctx.failure_summary
        _save_state(ctx)
        _stage_end(ctx, "BUILD", False)
        return False

    apks: list[str] = []
    globs = ctx.proj_cfg.get("apk_glob") or ["**/outputs/apk/**/*.apk"]
    for pattern in globs:
        for p in ctx.source_root.glob(str(pattern).lstrip("/")):
            if p.is_file():
                dest = ctx.run_root / "build" / "artifacts" / p.name
                dest.parent.mkdir(parents=True, exist_ok=True)
                try:
                    shutil.copy2(p, dest)
                    apks.append(str(dest.resolve()))
                except OSError:
                    apks.append(str(p.resolve()))
    ctx.report["build"] = {
        "success": True,
        "log_path": str(log_path.resolve()),
        "artifacts": sorted(set(apks)),
    }
    ctx.pipeline_state = "BUILD_DONE"
    _save_state(ctx)
    _stage_end(ctx, "BUILD", True)
    return True


def stage_test(ctx: PipelineContext, attempt: int = 0) -> bool:
    _stage_begin(ctx, "TEST")
    ctx.pipeline_state = "TESTING"
    ctx.report["status"] = "TESTING"
    _save_state(ctx)
    platform = str(ctx.payload.get("platform") or "android")
    to = _stage_timeout_sec(ctx, "test_sec", int(ctx.proj_cfg.get("test_timeout_sec", 3600)))
    test_dir = ctx.run_root / "test"
    test_dir.mkdir(parents=True, exist_ok=True)
    log_path = test_dir / "test.log"

    if _dry_run():
        log_path.write_text("[DRY_RUN] test skipped\n", encoding="utf-8")
        ctx.report["test"] = {"success": True, "log_path": str(log_path.resolve()), "failed_tests": []}
        ctx.pipeline_state = "TEST_DONE"
        _save_state(ctx)
        _stage_end(ctx, "TEST", True)
        return True

    if platform == "ios":
        log_path.write_text(
            "iOS XCTest / Simulator not run on Windows; shared logic tests should run in CI.\n",
            encoding="utf-8",
        )
        ctx.report["test"] = {"success": True, "log_path": str(log_path.resolve()), "failed_tests": []}
        ctx.pipeline_state = "TEST_DONE"
        _save_state(ctx)
        _stage_end(ctx, "TEST", True)
        return True

    if platform == "web":
        cmds = ctx.proj_cfg.get("web_test_commands") or []
        if not cmds:
            log_path.write_text("web tests skipped (no web_test_commands)\n", encoding="utf-8")
            ctx.report["test"] = {"success": True, "log_path": str(log_path.resolve()), "failed_tests": []}
            ctx.pipeline_state = "TEST_DONE"
            _save_state(ctx)
            _stage_end(ctx, "TEST", True)
            return True
        assert ctx.source_root
        failed = False
        for idx, c in enumerate(cmds):
            if not isinstance(c, list):
                continue
            code, _, err = _run_process(
                [str(x) for x in c],
                cwd=ctx.source_root,
                timeout_sec=to,
                log_path=test_dir / f"web_test_{idx}.log",
                ctx=ctx,
                cmd_label=f"web_test_{idx}",
            )
            if code != 0:
                failed = True
                ctx.failure_summary = (err or "")[:500] or "web test failed"
                break
        if failed:
            ctx.report["test"] = {"success": False, "log_path": str(log_path.resolve()), "failed_tests": ["web"]}
            ctx.pipeline_state = "TEST_FAILED"
            ctx.report["status"] = "TEST_FAILED"
            ctx.report["failure_summary"] = ctx.failure_summary
            _save_state(ctx)
            _stage_end(ctx, "TEST", False)
            return False
        log_path.write_text("web tests ok\n", encoding="utf-8")
        ctx.report["test"] = {"success": True, "log_path": str(log_path.resolve()), "failed_tests": []}
        ctx.pipeline_state = "TEST_DONE"
        _save_state(ctx)
        _stage_end(ctx, "TEST", True)
        return True

    tprof = str(
        ctx.payload.get("test_profile") or ctx.proj_cfg.get("default_test_profile") or "none"
    )
    tcfg = (ctx.proj_cfg.get("test") or {}).get(tprof) or {}
    if tcfg.get("skip") or tprof == "none":
        log_path.write_text("tests skipped (test_profile=none)\n", encoding="utf-8")
        ctx.report["test"] = {"success": True, "log_path": str(log_path.resolve()), "failed_tests": []}
        ctx.pipeline_state = "TEST_DONE"
        _save_state(ctx)
        _stage_end(ctx, "TEST", True)
        return True

    assert ctx.source_root
    gradle = _gradle_script(ctx)
    tasks = (tcfg or {}).get("tasks") or ["testDebugUnitTest"]
    args = [str(gradle), "--no-daemon", *[str(t) for t in tasks]]
    code, _, err = _run_process(
        args,
        cwd=ctx.source_root,
        timeout_sec=to,
        log_path=log_path,
        ctx=ctx,
        cmd_label="gradle_test",
    )
    if code != 0:
        ctx.failure_summary = f"Gradle test failed (exit {code}); see test.log"
        ctx.report["test"] = {"success": False, "log_path": str(log_path.resolve()), "failed_tests": ["gradle_test"]}
        ctx.pipeline_state = "TEST_FAILED"
        ctx.report["status"] = "TEST_FAILED"
        ctx.report["failure_summary"] = ctx.failure_summary
        _save_state(ctx)
        _stage_end(ctx, "TEST", False)
        return False
    ctx.report["test"] = {"success": True, "log_path": str(log_path.resolve()), "failed_tests": []}
    ctx.pipeline_state = "TEST_DONE"
    _save_state(ctx)
    _stage_end(ctx, "TEST", True)
    return True


def stage_screenshot(ctx: PipelineContext, attempt: int = 0) -> bool:
    _stage_begin(ctx, "SCREENSHOT")
    ctx.pipeline_state = "SCREENSHOT"
    ctx.report["status"] = "SCREENSHOT"
    _save_state(ctx)
    platform = str(ctx.payload.get("platform") or "android")
    scfg = ctx.payload.get("screenshot") or {}
    shot_root = ctx.run_root / "screenshots"
    pap_dir = shot_root / "paparazzi"
    pap_dir.mkdir(parents=True, exist_ok=True)
    log_path = pap_dir / "paparazzi_gradle.log"

    if platform != "android" or not scfg.get("enabled", True) or not scfg.get("paparazzi_enabled"):
        ctx.report["screenshot"]["success"] = True
        ctx.report["screenshot"]["mode"] = "skipped"
        ctx.report["screenshot"]["paparazzi"]["ran"] = False
        log_path.write_text("Paparazzi skipped (platform or config)\n", encoding="utf-8")
        ctx.report["screenshot"]["paparazzi"]["log_path"] = str(log_path.resolve())
        _save_state(ctx)
        _stage_end(ctx, "SCREENSHOT", True)
        return True

    if _dry_run():
        log_path.write_text("[DRY_RUN] paparazzi skipped\n", encoding="utf-8")
        ctx.report["screenshot"]["success"] = True
        ctx.report["screenshot"]["mode"] = "dry_run"
        ctx.report["screenshot"]["paparazzi"]["log_path"] = str(log_path.resolve())
        _save_state(ctx)
        _stage_end(ctx, "SCREENSHOT", True)
        return True

    assert ctx.source_root
    gradle = _gradle_script(ctx)
    module_dir = str(scfg.get("module_dir") or "app")
    mode = str(scfg.get("baseline_mode") or "verify").lower()
    task = (
        scfg.get("gradle_verify_task")
        if mode != "record"
        else scfg.get("gradle_record_task")
    ) or ("verifyPaparazziDebug" if mode != "record" else "recordPaparazziDebug")
    to = _stage_timeout_sec(ctx, "screenshot_sec", 3600)

    args = [str(gradle), "--no-daemon", str(task)]
    code, _, _ = _run_process(
        args,
        cwd=ctx.source_root,
        timeout_sec=to,
        log_path=log_path,
        ctx=ctx,
        cmd_label="paparazzi",
    )
    log_text = log_path.read_text(encoding="utf-8", errors="replace") if log_path.is_file() else ""
    diff_info = detect_paparazzi_diff(
        gradle_exit_code=code,
        source_root=ctx.source_root,
        module_dir=module_dir,
        log_text=log_text,
    )
    collected = collect_paparazzi_artifacts(ctx.source_root, ctx.run_root, module_dir=module_dir)
    if mode == "record":
        ctx.report["screenshot"]["success"] = code == 0
    else:
        ctx.report["screenshot"]["success"] = code == 0 and not diff_info.get("diff_found")
    ctx.report["screenshot"]["mode"] = mode
    ctx.report["screenshot"]["runtime_capture_enabled"] = bool(
        scfg.get("runtime_capture_enabled", True)
    )
    ctx.report["screenshot"]["paparazzi"] = {
        "ran": True,
        "task": task,
        "log_path": str(log_path.resolve()),
        "generated_files": collected.get("generated_files") or [],
        "diff_found": diff_info.get("diff_found"),
        "report_path": collected.get("report_path") or "",
        "diff_detail": diff_info,
    }
    if not ctx.report["screenshot"]["success"]:
        ctx.failure_summary = "Paparazzi verify/record failed or diff detected; see paparazzi_gradle.log"
        ctx.pipeline_state = "SCREENSHOT_FAILED"
        ctx.report["status"] = "SCREENSHOT_FAILED"
        ctx.report["failure_summary"] = ctx.failure_summary
        _save_state(ctx)
        _stage_end(ctx, "SCREENSHOT", False)
        return False
    _save_state(ctx)
    _stage_end(ctx, "SCREENSHOT", True)
    return True


def stage_runtime(ctx: PipelineContext, attempt: int = 0) -> bool:
    _stage_begin(ctx, "RUNTIME")
    ctx.pipeline_state = "RUNTIME"
    ctx.report["status"] = "RUNTIME"
    _save_state(ctx)
    platform = str(ctx.payload.get("platform") or "android")
    rdir = ctx.run_root / "runtime"
    rdir.mkdir(parents=True, exist_ok=True)
    log_path = rdir / "runtime.log"
    rt_cfg = ctx.payload.get("runtime_profile") or {}
    mode = str(rt_cfg.get("mode") or "optional").lower()
    scfg = ctx.payload.get("screenshot") or {}
    capture = bool(scfg.get("runtime_capture_enabled", True))

    if platform != "android":
        log_path.write_text("Runtime smoke skipped for non-Android platform.\n", encoding="utf-8")
        ctx.report["runtime"] = {
            "success": True,
            "log_path": str(log_path.resolve()),
            "screenshots": [],
            "steps": [],
        }
        _save_state(ctx)
        _stage_end(ctx, "RUNTIME", True)
        return True

    if mode == "optional" and not shutil.which("adb"):
        log_path.write_text("adb not found; runtime optional — skipped.\n", encoding="utf-8")
        ctx.report["runtime"] = {
            "success": True,
            "log_path": str(log_path.resolve()),
            "screenshots": [],
            "steps": ["adb_optional_skip"],
        }
        _save_state(ctx)
        _stage_end(ctx, "RUNTIME", True)
        return True

    adb = shutil.which("adb")
    if not adb:
        ctx.failure_summary = "adb required for runtime but not found"
        log_path.write_text(ctx.failure_summary + "\n", encoding="utf-8")
        ctx.report["runtime"] = {
            "success": False,
            "log_path": str(log_path.resolve()),
            "screenshots": [],
            "steps": [],
        }
        ctx.pipeline_state = "RUNTIME_FAILED"
        ctx.report["status"] = "RUNTIME_FAILED"
        ctx.report["failure_summary"] = ctx.failure_summary
        _save_state(ctx)
        _stage_end(ctx, "RUNTIME", False)
        return False

    code, _, err = _run_process(
        [adb, "devices"],
        cwd=None,
        timeout_sec=60,
        log_path=log_path,
        ctx=ctx,
        cmd_label="adb_devices",
    )
    if code != 0:
        ctx.failure_summary = (err or "")[:300] or "adb devices failed"
        ctx.report["runtime"] = {
            "success": False,
            "log_path": str(log_path.resolve()),
            "screenshots": [],
            "steps": [],
        }
        ctx.pipeline_state = "RUNTIME_FAILED"
        ctx.report["status"] = "RUNTIME_FAILED"
        ctx.report["failure_summary"] = ctx.failure_summary
        _save_state(ctx)
        _stage_end(ctx, "RUNTIME", False)
        return False

    shots: list[str] = []
    if capture:
        cap_dir = ctx.run_root / "screenshots" / "runtime"
        cap_dir.mkdir(parents=True, exist_ok=True)
        out_png = cap_dir / "device_0.png"
        c2, _, _ = _run_process(
            [adb, "exec-out", "screencap", "-p"],
            cwd=None,
            timeout_sec=120,
            log_path=rdir / "screencap.log",
            ctx=ctx,
            cmd_label="adb_screencap",
        )
        if c2 == 0:
            # stdout was captured to log in _run_process — need direct pipe for binary; simplified path:
            try:
                proc = subprocess.run(
                    [adb, "exec-out", "screencap", "-p"],
                    cwd=None,
                    capture_output=True,
                    timeout=120,
                    env={**os.environ, **getattr(ctx, "_process_env_extra", {})},
                )
                if proc.returncode == 0 and proc.stdout:
                    out_png.write_bytes(proc.stdout)
                    shots.append(str(out_png.resolve()))
            except (OSError, subprocess.SubprocessError):
                pass

    log_path.write_text(
        log_path.read_text(encoding="utf-8", errors="replace")
        if log_path.is_file()
        else "adb devices ok\n",
        encoding="utf-8",
    )
    ctx.report["runtime"] = {
        "success": True,
        "log_path": str(log_path.resolve()),
        "screenshots": shots,
        "steps": ["adb_devices", "optional_screencap"],
    }
    _save_state(ctx)
    _stage_end(ctx, "RUNTIME", True)
    return True


def _run_stage_with_retry(
    ctx: PipelineContext,
    label: str,
    policy_key: str,
    recipes: list[str],
    stage_fn: Callable[[PipelineContext, int], bool],
) -> bool:
    rp = ctx.payload.get("retry_policy") or {}
    max_a = int(rp.get(policy_key) or 2)
    structural_cap = int(rp.get("structural_max_attempts") or 1)
    for attempt in range(max_a):
        if stage_fn(ctx, attempt):
            return True
        analysis = classify_failure(ctx, label)
        ctx.report.setdefault("failure_analyses", []).append(analysis)
        fc = analysis["failure_class"]
        if fc in FAILURE_STRUCTURAL:
            if attempt + 1 >= structural_cap:
                return False
            continue
        if fc in FAILURE_TRANSIENT:
            logd = ctx.run_root / "recipes"
            for name in recipes:
                apply_recipe(name, ctx=ctx, log_dir=logd)
            continue
        return False
    return False


def _run_screenshot_with_retry(ctx: PipelineContext) -> bool:
    rp = ctx.payload.get("retry_policy") or {}
    max_a = int(rp.get("max_attempts_screenshot") or 1)
    structural_cap = int(rp.get("structural_max_attempts") or 1)
    for attempt in range(max_a):
        if stage_screenshot(ctx, attempt):
            return True
        analysis = classify_failure(ctx, "SCREENSHOT")
        ctx.report.setdefault("failure_analyses", []).append(analysis)
        fc = analysis["failure_class"]
        if fc in FAILURE_STRUCTURAL:
            if attempt + 1 >= structural_cap:
                return False
            continue
        if fc in FAILURE_TRANSIENT:
            apply_recipe("gradle_clean_rebuild", ctx=ctx, log_dir=ctx.run_root / "recipes")
            continue
        return False
    return False


def stage_artifacts_manifest(ctx: PipelineContext) -> None:
    _stage_begin(ctx, "ARTIFACTS_MANIFEST")
    art_dir = ctx.run_root / "artifacts"
    art_dir.mkdir(parents=True, exist_ok=True)
    files: list[dict[str, Any]] = []
    reports = ctx.run_root / "reports"

    def add_path(p: Path, kind: str, required: bool) -> None:
        if not p.is_file():
            if required:
                files.append({"path": str(p), "kind": kind, "missing": True, "required": required})
            return
        files.append(
            {
                "path": str(p.resolve()),
                "kind": kind,
                "sha256": hashlib.sha256(p.read_bytes()).hexdigest(),
                "size": p.stat().st_size,
                "required": required,
            }
        )

    for apk in ctx.report.get("build", {}).get("artifacts") or []:
        add_path(Path(str(apk)), "apk", False)

    add_path(reports / "task_result_report.json", "task_result_report", True)
    add_path(reports / "environment_snapshot.json", "environment_snapshot", True)

    manifest = {
        "schema_version": "artifacts_manifest_v1",
        "run_id": ctx.run_id,
        "project_id": ctx.project_id,
        "created_at_utc": _utc_now_iso(),
        "files": files,
    }
    (art_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    _stage_end(ctx, "ARTIFACTS_MANIFEST", True)


def _write_task_result_md(ctx: PipelineContext) -> None:
    reports = ctx.run_root / "reports"
    jpath = reports / "task_result_report.json"
    st = ctx.report["status"]
    cp = ctx.report.get("country_profile") or {}
    fa = ctx.report.get("failure_analyses") or []
    last = fa[-1] if fa else {}
    lines = [
        "# Local Executor OS — task result",
        "",
        "## Executor summary",
        "",
        f"- **project_id**: `{ctx.project_id}`",
        f"- **run_id**: `{ctx.run_id}`",
        f"- **platform**: `{ctx.payload.get('platform')}`",
        f"- **status**: **{st}**",
        f"- **validation_verdict**: `{ctx.report.get('validation_verdict')}`",
        f"- **gate_verdict**: `{ctx.report.get('gate_verdict')}`",
        f"- **evidence_complete**: **{ctx.report.get('evidence_complete')}**",
        f"- **started (UTC)**: {ctx.report['started_at_utc']}",
        f"- **finished (UTC)**: {ctx.report['finished_at_utc']}",
        "",
        "## Environment snapshot",
        "",
        f"- `{ctx.report.get('environment_snapshot_path') or 'reports/environment_snapshot.json'}`",
        "",
        "## Device context & runtime merge",
        "",
        f"- **device_context_source**: `{ctx.report.get('device_context_source')}`",
        f"- **country_profile_source**: `{ctx.report.get('country_profile_source')}`",
        f"- **runtime_profile_policy**: `{ctx.report.get('runtime_profile_policy')}`",
        f"- `device_context.json` / `runtime_profile.json` under reports/",
        "",
        "## Country / locale",
        "",
        f"- **country_code**: `{cp.get('country_code')}`",
        f"- **locale**: `{cp.get('locale')}`",
        f"- **timezone**: `{cp.get('timezone')}`",
        f"- **currency**: `{cp.get('currency')}`",
        "",
        "## Failure classification + escalation",
        "",
        f"- **latest failure_class**: `{last.get('failure_class')}`",
        f"- **escalation_recommended**: `{last.get('escalation_recommended')}`",
        f"- **escalation_target**: `{last.get('escalation_target')}`",
        f"- **escalation_reason**: {last.get('escalation_reason') or ''}",
        "",
        "## Build",
        f"- success: **{ctx.report['build'].get('success')}**",
        f"- log: `{ctx.report['build'].get('log_path')}`",
        "",
        "## Test",
        f"- success: **{ctx.report['test'].get('success')}**",
        f"- log: `{ctx.report['test'].get('log_path')}`",
        "",
        "## Screenshot / Paparazzi",
        f"- success: **{(ctx.report.get('screenshot') or {}).get('success')}**",
        f"- diff_found: **{(ctx.report.get('screenshot') or {}).get('paparazzi', {}).get('diff_found')}**",
        "",
        "## Runtime",
        f"- success: **{ctx.report['runtime'].get('success')}**",
        f"- adb screenshots: {len(ctx.report['runtime'].get('screenshots') or [])}",
        "",
    ]
    if ctx.report.get("failure_summary"):
        lines.extend(["## Failure summary", "", str(ctx.report["failure_summary"]), ""])
    lines.append(f"JSON: `{jpath}`")
    (reports / "task_result_report.md").write_text("\n".join(lines), encoding="utf-8")


def _write_task_result_json(ctx: PipelineContext) -> None:
    reports = ctx.run_root / "reports"
    reports.mkdir(parents=True, exist_ok=True)
    (reports / "task_result_report.json").write_text(
        json.dumps(ctx.report, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    _write_task_result_md(ctx)


def finalize_production(ctx: PipelineContext) -> None:
    from local_gatekeeper import evaluate_gate
    from local_validator import validate_executor_run

    val = validate_executor_run(ctx.run_root, ctx.payload, ctx.report)
    ctx.report["validation_verdict"] = val.get("validation_verdict")
    _write_task_result_json(ctx)
    _save_state(ctx)

    stage_artifacts_manifest(ctx)

    gate = evaluate_gate(ctx.run_root, ctx.payload, ctx.report, val)
    ctx.report["gate_verdict"] = gate.get("gate_verdict")
    ctx.report["evidence_complete"] = val.get("validation_verdict") == "PASS" and gate.get(
        "gate_verdict"
    ) == "APPROVED"
    _write_task_result_json(ctx)
    _save_state(ctx)
    stage_artifacts_manifest(ctx)

    try:
        from executor_metrics import record_run_metrics

        record_run_metrics(ROOT, ctx)
    except Exception:
        _LOG.warning("record_run_metrics failed", exc_info=True)


def stage_report(ctx: PipelineContext) -> None:
    _stage_begin(ctx, "REPORT")
    ctx.finished_at_utc = _utc_now_iso()
    ctx.report["finished_at_utc"] = ctx.finished_at_utc
    ctx.report["finished_at_kst"] = utc_iso_to_kst_display(ctx.finished_at_utc)
    if ctx.report["status"] not in (
        "SOURCE_FAILED",
        "ENV_FAILED",
        "BUILD_FAILED",
        "TEST_FAILED",
        "SCREENSHOT_FAILED",
        "RUNTIME_FAILED",
    ):
        ctx.report["status"] = "SUCCEEDED"
        ctx.report["failure_summary"] = ""
    ctx.pipeline_state = str(ctx.report["status"])
    _write_task_result_json(ctx)
    _save_state(ctx)
    _stage_end(ctx, "REPORT", True)


def run_local_executor(
    payload: dict[str, Any],
    *,
    global_cfg: dict[str, Any] | None = None,
    event_sink: EventSink = None,
) -> PipelineContext:
    """Run full pipeline for a normalized payload dict."""
    global_cfg = global_cfg or {}
    project_id = str(payload["project_id"]).strip()
    proj_cfg = load_executor_project_config(project_id)
    merged = validate_and_normalize_executor_payload(payload, proj_cfg, local_agent_root=ROOT)

    run_id = str(merged.get("run_id") or uuid.uuid4())
    run_root = Path(global_cfg.get("runs_dir") or (ROOT / "runs")) / project_id / run_id
    run_root.mkdir(parents=True, exist_ok=True)

    ctx = PipelineContext(
        project_id=project_id,
        run_id=run_id,
        run_root=run_root,
        payload=merged,
        proj_cfg=proj_cfg,
        global_cfg=global_cfg,
        event_sink=event_sink,
    )
    _ensure_report_skeleton(ctx)
    _attach_process_env(ctx)
    _sync_report_meta(ctx)
    merged["run_id"] = run_id
    ctx.payload["run_id"] = run_id

    recipes = list((merged.get("retry_policy") or {}).get("recipes_on_fail") or [])

    if not stage_source_prepare(ctx):
        stage_report(ctx)
        finalize_production(ctx)
        return ctx
    if not stage_env_check(ctx):
        stage_report(ctx)
        finalize_production(ctx)
        return ctx
    if not stage_device_runtime_merge(ctx):
        stage_report(ctx)
        finalize_production(ctx)
        return ctx
    if not stage_ios_front_end(ctx):
        stage_report(ctx)
        finalize_production(ctx)
        return ctx

    if not _run_stage_with_retry(ctx, "BUILD", "max_attempts_build", recipes, stage_build):
        stage_report(ctx)
        finalize_production(ctx)
        return ctx
    if not _run_stage_with_retry(ctx, "TEST", "max_attempts_test", recipes, stage_test):
        stage_report(ctx)
        finalize_production(ctx)
        return ctx
    if not _run_screenshot_with_retry(ctx):
        stage_report(ctx)
        finalize_production(ctx)
        return ctx
    if not _run_stage_with_retry(ctx, "RUNTIME", "max_attempts_runtime", recipes, stage_runtime):
        stage_report(ctx)
        finalize_production(ctx)
        return ctx

    stage_report(ctx)
    finalize_production(ctx)
    return ctx


def run_local_executor_from_workorder(wo: WorkOrder, global_cfg: dict[str, Any] | None = None) -> PipelineContext:
    """Placeholder: map WorkOrder → payload via metadata."""
    payload = dict(wo.metadata.get("executor_payload") or {})
    payload.setdefault("project_id", str(wo.metadata.get("project_id") or ""))
    return run_local_executor(payload, global_cfg=global_cfg)
