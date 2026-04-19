from __future__ import annotations

from pathlib import Path

TAIL_LINE_COUNT = 200


def generate_build_fix_prompt(
    build_log_path: Path,
    project_name: str,
    task_id: str,
) -> str:
    """
    Read Gradle build log and build a prompt template for an LLM (Verifier/Worker).

    Uses only the last N lines of the log; includes Context and Your task sections.
    """
    if not build_log_path.is_file():
        return (
            f"Build log not found or empty for task {task_id} in project {project_name}. "
            "Please investigate manually."
        )

    try:
        raw = build_log_path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return (
            f"Build log not found or empty for task {task_id} in project {project_name}. "
            "Please investigate manually."
        )

    text = raw.strip()
    if not text:
        return (
            f"Build log not found or empty for task {task_id} in project {project_name}. "
            "Please investigate manually."
        )

    lines = text.splitlines()
    tail = lines[-TAIL_LINE_COUNT:] if len(lines) > TAIL_LINE_COUNT else lines
    tail_text = "\n".join(tail)

    return (
        "[Context]\n\n"
        f"Project: {project_name}\n\n"
        f"Task ID: {task_id}\n\n"
        "Build command: ./gradlew assembleDebug\n\n"
        "[Build Log Tail]\n\n"
        f"{tail_text}\n\n"
        "[Your task]\n\n"
        "Based on the build log tail above:\n"
        "- Summarize the root cause of the build failure in Korean in 1-2 sentences.\n"
        "- List candidate file(s) and line(s) that likely need changes.\n"
        "- Propose a fix direction that respects MyPhoneCheck hard rules "
        "(minimal permissions, no READ_CALL_LOG, single overlay path, etc.).\n"
    )
