import type { OrchestratorResult } from "./orchestratorTypes.js";

const CORE_LABEL: Record<string, string> = {
  home: "홈",
  settings: "설정",
  timeline: "타임라인",
  call_check: "콜",
  sms_check: "문자",
  camera_check: "카메라",
  mic_check: "마이크",
  overlay: "오버레이",
};

/** OrchestratorResult → 대표용 한국어 요약 (번들 경로·캡처·reportGaps) */
export function buildOrchestratorSummaryKo(r: OrchestratorResult): string {
  const lines: string[] = [];
  const dur =
    new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime();
  lines.push(`[오케스트레이션] 목표: ${r.goalId}`);
  lines.push(`- 전체 소요: 약 ${Math.round(dur / 1000)}초`);
  lines.push(`- 단계: ${r.stepResults.map((s) => `${s.stepId}:${s.ok ? "OK" : "FAIL"}`).join(" → ")}`);

  if (r.bundlePath) {
    lines.push(`- 번들 경로: ${r.bundlePath}`);
  } else {
    lines.push(`- 번들 경로: (아직 없음 또는 워크플로 미완료)`);
  }

  const sc = r.screenCaptureSummary;
  const e2e = r.e2eVerification;
  if (sc || e2e?.screenCapture) {
    const cap = e2e?.screenCapture;
    const total = sc?.totalScreensCaptured ?? cap?.totalScreensCaptured;
    const distinct = sc?.distinctScreenIds ?? e2e?.distinctScreenIdsCaptured;
    lines.push(`- 캡처: 총 ${total ?? "?"}장, ScreenId 종류 약 ${distinct ?? "?"}개`);
    const per = sc?.perCategoryCounts ?? e2e?.perCategoryCounts ?? {};
    const core = ["home", "settings", "timeline", "call_check", "sms_check", "camera_check", "mic_check", "overlay"];
    const covered = core.filter((k) => (per[k] ?? 0) >= 1);
    const labels = covered.map((k) => CORE_LABEL[k] ?? k).join(", ");
    lines.push(
      `- 핵심 카테고리(온보딩·홈·설정·타임라인·콜·문자·카메라·마이크·오버레이 등): ${covered.length >= core.length ? "요약상 모두 1장 이상" : `일부만 충족 (${labels || "없음"})`}`,
    );
    const crop = cap?.emulatorWindowCropOk ?? false;
    lines.push(`- 에뮬레이터 창 크롭(host_window): ${crop ? "정상 감지" : "유효 rect 미확인 또는 실패 이벤트 있음"}`);
  }

  const gaps = e2e?.reportGaps ?? [];
  if (gaps.length) {
    const lowMin = gaps.some((g) => g.includes("screen_capture_total_screens_below_min"));
    if (lowMin) {
      lines.push(`- 이번 러닝은 총 캡처 장수가 기준(min)에 조금 못 미쳤을 수 있습니다.`);
    }
    const missCat = gaps.find((g) => g.startsWith("screen_capture_missing_categories"));
    if (missCat) {
      lines.push(`- 빠진 시나리오 카테고리: ${missCat.replace(/^screen_capture_missing_categories:\s*/i, "")}`);
    }
    lines.push(`- reportGaps: ${gaps.join("; ")}`);
  } else if (e2e?.ok) {
    lines.push(`- reportGaps: (없음)`);
  }

  if (e2e && !e2e.ok && e2e.missing?.length) {
    lines.push(`- e2e 하드 검증 누락: ${e2e.missing.join("; ")}`);
  }

  if (r.reportPath) {
    lines.push(`- UX 리포트: ${r.reportPath}`);
  }

  lines.push(r.ok ? `→ 결과: 성공(하드 기준 포함).` : `→ 결과: 실패 또는 검증 갭이 있습니다.`);

  return lines.join("\n");
}
