/**
 * 앱 무관 UI 탐색·캡처 정책 — 하드코딩된 화면 이름 대신 한도·백 전략으로 조절.
 */
export type BackNavigationStrategy = "adb_back" | "home_then_relaunch" | "none";

export type CapturePolicy = {
  /** 상태 그래프 탐색 깊이 상한 (탭 시퀀스 길이에 대응) */
  maxDepth: number;
  /** 스크린샷 장수 상한 */
  maxShots: number;
  backNavigationStrategy: BackNavigationStrategy;
  /** (향후) 화면 텍스트가 이 패턴을 포함할 때 우선 캡처 */
  mustIncludePatterns?: string[];
  /** (향후) 제외 */
  excludePatterns?: string[];
  /** 단일 탭 시도 후 대기 ms */
  tapSettleMs: number;
  /** 전체 탐색 상한 스텝 (무한 루프 방지) */
  maxExploreSteps: number;
};

export const defaultCapturePolicy = (): CapturePolicy => ({
  maxDepth: 4,
  maxShots: 24,
  backNavigationStrategy: "adb_back",
  tapSettleMs: 650,
  /** 상한이 너무 크면 스모크·로컬 실행 시간이 과도해짐 — 정책으로 조정 */
  maxExploreSteps: 96,
});
