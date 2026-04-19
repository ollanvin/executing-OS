"""
Failure classification and escalation hints for Executor OS.

TRANSIENT failures may trigger recipes + retries; STRUCTURAL failures cap retries and
should escalate to humans (code_worker vs strategy).
"""

from __future__ import annotations

from typing import Any

FAILURE_TRANSIENT = frozenset(
    {"ENV_TRANSIENT", "BUILD_TRANSIENT", "NETWORK_TRANSIENT"}
)
FAILURE_STRUCTURAL = frozenset(
    {
        "BUILD_STRUCTURAL",
        "TEST_STRUCTURAL",
        "RUNTIME_STRUCTURAL",
        "VISUAL_STRUCTURAL",
    }
)


def _escalation_for_class(fc: str) -> tuple[bool, str | None, str]:
    """Returns (recommended, target, reason)."""
    if fc in FAILURE_TRANSIENT:
        return False, None, ""
    if fc == "TEST_STRUCTURAL":
        return True, "code_worker", "테스트 케이스 설계 미비 또는 단언 실패 — 코드/테스트 수정 필요"
    if fc == "VISUAL_STRUCTURAL":
        return True, "code_worker", "UI 스냅샷 불일치 또는 시각 회귀 — UI 구조 변경 필요"
    if fc == "RUNTIME_STRUCTURAL":
        return True, "code_worker", "디바이스/런타임 스모크 실패 — 앱 동작 또는 환경 고정 필요"
    if fc == "BUILD_STRUCTURAL":
        return True, "code_worker", "컴파일/빌드 구조 오류 — 소스 또는 Gradle 설정 수정 필요"
    return True, "strategy", "분류되지 않은 실패 — 원인 조사 및 전략 결정 필요"


def classify_failure(ctx: Any, stage: str) -> dict[str, Any]:
    """
    Heuristic classifier using failure_summary, report fragments, and stage name.
    """
    text = (getattr(ctx, "failure_summary", None) or "").lower()
    report = getattr(ctx, "report", {}) or {}
    pap = (report.get("screenshot") or {}).get("paparazzi") or {}

    if stage.upper() == "IOS_FRONTEND":
        fc = "TEST_STRUCTURAL"
        esc_rec, esc_tgt, esc_reason = _escalation_for_class(fc)
        return {
            "failure_class": fc,
            "escalation_recommended": esc_rec,
            "escalation_target": esc_tgt,
            "escalation_reason": esc_reason or "iOS Windows preflight: flows/resources invalid",
            "stage": stage,
        }

    fc = "BUILD_STRUCTURAL"
    if stage.upper() in ("ENV_CHECK", "SOURCE_PREPARE"):
        if any(x in text for x in ("timeout", "timed out", "124")):
            fc = "ENV_TRANSIENT"
        elif any(x in text for x in ("network", "could not resolve", "unreachable")):
            fc = "NETWORK_TRANSIENT"
        else:
            fc = "ENV_TRANSIENT"
    elif stage.upper() == "BUILD":
        if any(x in text for x in ("daemon", "locked", "could not resolve", "timed out")):
            fc = "BUILD_TRANSIENT"
        elif any(x in text for x in ("network", "connection reset")):
            fc = "NETWORK_TRANSIENT"
        else:
            fc = "BUILD_STRUCTURAL"
    elif stage.upper() == "TEST":
        if any(x in text for x in ("timeout", "timed out")):
            fc = "NETWORK_TRANSIENT"
        else:
            fc = "TEST_STRUCTURAL"
    elif stage.upper() == "SCREENSHOT":
        if pap.get("diff_found") or "paparazzi" in text or "screenshot" in text:
            fc = "VISUAL_STRUCTURAL"
        elif any(x in text for x in ("timeout", "timed out")):
            fc = "BUILD_TRANSIENT"
        else:
            fc = "VISUAL_STRUCTURAL"
    elif stage.upper() == "RUNTIME":
        if any(x in text for x in ("device", "adb", "offline", "unauthorized")):
            if "not found" not in text:
                fc = "NETWORK_TRANSIENT"
            else:
                fc = "RUNTIME_STRUCTURAL"
        else:
            fc = "RUNTIME_STRUCTURAL"

    esc_rec, esc_tgt, esc_reason = _escalation_for_class(fc)
    return {
        "failure_class": fc,
        "escalation_recommended": esc_rec,
        "escalation_target": esc_tgt,
        "escalation_reason": esc_reason,
        "stage": stage,
    }


def failure_from_log_snippet(log_text: str, stage: str) -> dict[str, Any] | None:
    """Optional helper for tests: classify from a log blob only."""
    if not log_text:
        return None

    class _Ctx:
        def __init__(self, summary: str) -> None:
            self.failure_summary = summary
            self.report: dict[str, Any] = {}

    return classify_failure(_Ctx(log_text[:2000]), stage)
