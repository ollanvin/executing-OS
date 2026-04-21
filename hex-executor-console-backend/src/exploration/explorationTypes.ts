import type { NeoPolicy } from "../policy.js";
import type { CapturePolicy } from "./capturePolicy.js";
import type { EmulatorScreenCaptureEvent } from "./emulatorScreenCaptureHost.js";
import type { ScreenId } from "./screenId.js";

export type { ScreenId } from "./screenId.js";
export type { EmulatorScreenCaptureEvent } from "./emulatorScreenCaptureHost.js";

export type CapturedState = {
  /** XML 전체 해시 — 정밀 상태·디버그용 */
  stateId: string;
  /** 질적 화면 단위 — 캡처 중복 판단의 주 기준 */
  screenId: ScreenId;
  screenshotPath: string;
  activityName?: string;
  titleText?: string;
  visitedAt: string;
};

export type CaptureExplorationStats = {
  totalSteps: number;
  /** 이번 탐색에서 새로 캡처한 서로 다른 ScreenId 수 */
  distinctScreenIdsCaptured: number;
  /** 캡처 순서대로 ScreenId (중복 없음, 탐색 구간만) */
  capturedScreenIdsOrdered: string[];
};

export type CaptureExplorationResult = {
  appId: string;
  startedAt: string;
  finishedAt: string;
  /** stateId 기준 방문(캡처 성공한 스텝 수와 동일) */
  totalStatesVisited: number;
  totalScreenshots: number;
  states: CapturedState[];
  logs: string[];
  policy: CapturePolicy;
  stats: CaptureExplorationStats;
  /** Host `screen_capture` (에뮬/시뮬 화면 캡처) 이벤트 */
  emulatorScreenCaptureEvents: EmulatorScreenCaptureEvent[];
};

export type ExploreAndCaptureOptions = {
  appId: string;
  backendRoot: string;
  workspaceRoot: string;
  outputRoot: string;
  /** 번들 루트 — captures/auto 는 그 아래에 생성 */
  bundleRoot: string;
  policy: NeoPolicy;
  capturePolicy?: CapturePolicy;
  /** 시나리오 등에서 이미 캡처한 ScreenId — 자동탐색에서 동일 화면 재촬영 억제 */
  seedSeenScreenIds?: string[];
  logger?: (line: string) => void;
};
