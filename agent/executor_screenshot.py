"""
Visual verification engine — Paparazzi artifact collection and diff heuristics.

Android-only; iOS native screenshots require Mac/CI (see docs/local-executor-os.md).
"""

from __future__ import annotations

import re
import shutil
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any


def collect_paparazzi_artifacts(
    source_root: Path,
    run_root: Path,
    *,
    module_dir: str = "app",
) -> dict[str, Any]:
    """Copy high-signal Paparazzi outputs into run_root/screenshots/paparazzi/."""
    out_dir = run_root / "screenshots" / "paparazzi"
    out_dir.mkdir(parents=True, exist_ok=True)
    mod = source_root / module_dir
    generated: list[str] = []

    candidates = [
        mod / "build" / "reports" / "paparazzi" / "debug",
        mod / "build" / "reports" / "paparazzi",
        source_root / module_dir / "build" / "outputs" / "paparazzi",
    ]
    report_html: Path | None = None
    for c in candidates:
        if c.is_dir():
            mirror = out_dir / "reports_mirror" / c.name
            try:
                if mirror.exists():
                    shutil.rmtree(mirror)
                shutil.copytree(c, mirror)
                for p in mirror.rglob("*"):
                    if p.is_file():
                        generated.append(str(p.resolve()))
                idx = mirror / "index.html"
                if idx.is_file():
                    report_html = idx
            except OSError:
                continue

    golden = mod / "src" / "test" / "resources"
    if golden.is_dir():
        gout = out_dir / "golden_snapshots"
        try:
            if gout.exists():
                shutil.rmtree(gout)
            shutil.copytree(golden, gout)
            for p in gout.rglob("*.png"):
                generated.append(str(p.resolve()))
        except OSError:
            pass

    return {
        "output_dir": str(out_dir.resolve()),
        "generated_files": sorted(set(generated)),
        "report_path": str(report_html.resolve()) if report_html else "",
    }


def _scan_xml_failures(test_results_dir: Path) -> tuple[int, bool]:
    """Count <failure> nodes under Gradle test-results XML."""
    failures = 0
    found = False
    if not test_results_dir.is_dir():
        return 0, False
    for xml_path in test_results_dir.rglob("*.xml"):
        found = True
        try:
            tree = ET.parse(xml_path)
            root = tree.getroot()
            for el in root.iter():
                tag = (el.tag or "").split("}")[-1]
                if tag.lower() == "failure":
                    failures += 1
        except (ET.ParseError, OSError):
            continue
    return failures, found


def detect_paparazzi_diff(
    *,
    gradle_exit_code: int,
    source_root: Path,
    module_dir: str,
    log_text: str,
) -> dict[str, Any]:
    """
    Combine Gradle exit code, JUnit XML, log keywords, and delta filenames.
    Paparazzi may not always fail Gradle on golden drift; heuristics err toward reporting.
    """
    log_lower = (log_text or "").lower()
    mod_path = source_root / module_dir
    test_results = mod_path / "build" / "test-results"
    xml_failures, xml_seen = _scan_xml_failures(test_results)

    delta_hint = bool(
        re.search(r"\bdelta\b|diff|snapshot mismatch|golden", log_lower)
        or re.search(r"verifypaparazzi|recordpaparazzi", log_lower)
    )

    diff_name = False
    for pattern in ("**/*delta*.png", "**/*diff*.png", "**/*failure*.png"):
        try:
            if any(mod_path.glob(pattern.replace("**/", ""))):
                diff_name = True
                break
        except OSError:
            pass
    try:
        for p in mod_path.rglob("*"):
            if not p.is_file():
                continue
            n = p.name.lower()
            if "delta" in n or (n.endswith(".png") and "diff" in n):
                diff_name = True
                break
    except OSError:
        pass

    diff_found = (
        gradle_exit_code != 0
        or xml_failures > 0
        or (delta_hint and gradle_exit_code == 0)
        or diff_name
    )

    return {
        "diff_found": diff_found,
        "gradle_exit_code": gradle_exit_code,
        "xml_failure_count": xml_failures,
        "xml_results_seen": xml_seen,
        "log_delta_hint": delta_hint,
        "delta_filename_hint": diff_name,
    }
