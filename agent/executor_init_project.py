"""
Scaffold a new app for Executor OS onboarding.

See docs/strategy/STRATEGY-PROJECT-SCAFFOLDING.md.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

TemplateName = Literal["webstub", "native", "backend"]


def normalize_app_slug(name: str) -> str:
    s = name.strip().replace(" ", "-")
    s = re.sub(r"[^a-zA-Z0-9_-]", "", s)
    return s or "app"


def _project_id_from_slug(slug: str) -> str:
    parts = [p for p in re.split(r"[-_]+", slug) if p]
    if not parts:
        return slug.upper()
    return "".join(p[:1].upper() + p[1:].lower() for p in parts)


def init_project(
    local_agent_root: Path,
    app_name: str,
    *,
    template: TemplateName = "native",
    author: str = "platform-team",
    dry_run: bool = False,
) -> list[Path]:
    slug = normalize_app_slug(app_name)
    project_id = _project_id_from_slug(slug)
    created: list[Path] = []
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    projects_dir = local_agent_root / "projects" / project_id
    fixtures_dir = local_agent_root / "fixtures" / slug
    payloads_dir = local_agent_root / "payloads"
    docs_dir = local_agent_root / "docs" / "projects"

    if template == "webstub":
        cfg = {
            "project_id": project_id,
            "platform": "web",
            "prefer_local_path": f"fixtures/{slug}/web",
            "default_branch": "main",
            "default_build_profile": "debug",
            "default_test_profile": "default",
            "default_country_code": "KR",
            "country_selection_mode": "G20_THEN_ISO",
            "country_batch": False,
            "web_build_commands": [["npm", "install"], ["npm", "run", "build"]],
            "web_test_commands": [["npm", "run", "test"]],
            "screenshot": {"enabled": False, "paparazzi_enabled": False},
            "quality_gate": {
                "build_success_required": True,
                "test_pass_required": True,
                "paparazzi_verify_required": False,
            },
        }
    elif template == "backend":
        cfg = {
            "project_id": project_id,
            "platform": "web",
            "prefer_local_path": f"fixtures/{slug}/service",
            "default_branch": "main",
            "default_build_profile": "debug",
            "default_test_profile": "default",
            "default_country_code": "KR",
            "web_build_commands": [["python", "-m", "compileall", "."]],
            "web_test_commands": [],
            "screenshot": {"enabled": False},
            "quality_gate": {"build_success_required": True, "test_pass_required": False},
        }
    else:
        cfg = {
            "project_id": project_id,
            "platform": "android",
            "prefer_local_path": f"../{slug}",
            "gradle_wrapper_relative": "gradlew.bat",
            "default_branch": "main",
            "default_build_profile": "debug",
            "default_test_profile": "none",
            "default_country_code": "KR",
            "country_selection_mode": "G20_THEN_ISO",
            "country_batch": False,
            "build": {"debug": {"tasks": ["assembleDebug"]}},
            "test": {"none": {"skip": True}},
            "apk_glob": ["**/outputs/apk/**/*.apk"],
            "screenshot": {
                "enabled": False,
                "paparazzi_enabled": False,
                "runtime_capture_enabled": False,
            },
            "quality_gate": {
                "build_success_required": True,
                "test_pass_required": False,
                "paparazzi_verify_required": False,
            },
        }

    sample_payload = {
        "project_id": project_id,
        "country_code": "KR",
        "country_batch": False,
    }

    project_md = f"""# {project_id} — Executor notes

- **Author / role**: {author}
- **Created (UTC)**: {now}
- **Purpose**: Factory onboarding stub (`template={template}`)
- **Strategy**: [Project scaffolding](../../strategy/STRATEGY-PROJECT-SCAFFOLDING.md) · [Executor OS](../local-executor-os.md)
- **Local path**: adjust `prefer_local_path` in `projects/{project_id}/config.json` to your repo root.
"""

    fixture_readme = f"""# Fixtures: {slug}

Place app-specific stub assets here (web bundle, API contract samples, etc.).

Template `{template}` expects under this directory:

"""

    if template == "webstub":
        fixture_readme += "- `web/package.json` + build scripts (see WebStub fixture pattern)\n"
    elif template == "backend":
        fixture_readme += "- `service/` Python or Node service root\n"
    else:
        fixture_readme += "- Android project root symlinked or cloned at `prefer_local_path`\n"

    files: list[tuple[Path, str]] = [
        (projects_dir / "config.json", json.dumps(cfg, ensure_ascii=False, indent=2) + "\n"),
        (payloads_dir / f"{slug}_sample_kr.json", json.dumps(sample_payload, ensure_ascii=False, indent=2) + "\n"),
        (fixtures_dir / "README.md", fixture_readme),
        (docs_dir / f"{slug}.md", project_md),
    ]

    if dry_run:
        return [p for p, _ in files]

    for path, content in files:
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists():
            continue
        path.write_text(content, encoding="utf-8")
        created.append(path)

    return created
