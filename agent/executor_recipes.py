"""Known-fix recipes after failures (evidence logged). TRANSIENT failures only."""

from __future__ import annotations

import logging
import shutil
from pathlib import Path
from typing import Any

_LOG = logging.getLogger("executor_recipes")


def apply_recipe(
    name: str,
    *,
    ctx: Any,
    log_dir: Path,
) -> tuple[bool, str]:
    try:
        from local_executor import _run_process as rp
    except ImportError:  # pragma: no cover
        from agent.local_executor import _run_process as rp

    idx = getattr(ctx, "_recipe_log_idx", 0) + 1
    ctx._recipe_log_idx = idx
    log_path = log_dir / f"recipe_{idx}_{name}.log"
    log_dir.mkdir(parents=True, exist_ok=True)
    src = ctx.source_root
    _LOG.info("recipe_apply name=%s run_id=%s", name, ctx.run_id)

    if name == "gradle_clean_rebuild":
        if not src:
            return False, "no source_root"
        gw_name = str(ctx.proj_cfg.get("gradle_wrapper_relative") or "gradlew.bat")
        gw = (src / gw_name).resolve()
        if not gw.is_file():
            return False, f"no gradlew at {gw}"
        to = int(ctx.payload.get("stage_timeouts", {}).get("build_sec", 3600))
        code, _, err = rp(
            [str(gw), "--no-daemon", "clean"],
            cwd=src,
            timeout_sec=to,
            log_path=log_path,
            ctx=ctx,
            cmd_label="recipe_gradle_clean",
        )
        if code != 0:
            return False, f"gradle clean failed: {(err or '')[:300]}"
        return True, "gradle clean ok"

    if name == "npm_ci":
        if not src:
            return False, "no source_root"
        code, _, err = rp(
            ["npm", "ci"],
            cwd=src,
            timeout_sec=600,
            log_path=log_path,
            ctx=ctx,
            cmd_label="recipe_npm_ci",
        )
        if code != 0:
            return False, f"npm ci failed: {(err or '')[:300]}"
        return True, "npm ci ok"

    if name == "adb_reconnect":
        adb = shutil.which("adb")
        if not adb:
            return False, "adb not found"
        for args in ([adb, "reconnect"], [adb, "kill-server"], [adb, "start-server"]):
            code, _, err = rp(
                list(args),
                cwd=None,
                timeout_sec=60,
                log_path=log_path,
                ctx=ctx,
                cmd_label=f"recipe_{args[1]}",
            )
            if code != 0 and args[1] not in ("kill-server",):
                return False, f"adb failed: {(err or '')[:200]}"
        return True, "adb reconnect ok"

    return False, f"unknown recipe: {name}"
