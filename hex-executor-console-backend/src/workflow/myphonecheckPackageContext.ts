import type { AppLaunchWorkflowCtx } from "./appLaunchContext.js";
import type { MyPhoneCheckCaptureConfig } from "../runtime/myphonecheckCaptureConfig.js";
import type { CaptureExplorationResult } from "../exploration/explorationTypes.js";
import type { EmulatorScreenCaptureEvent } from "../exploration/emulatorScreenCaptureHost.js";
import type { MyPhoneCheckScenarioCaptureResult } from "../exploration/myphonecheckScenarioCapture.js";
import type { MyPhoneCheckScreenCategory } from "../policy/myphonecheckScreenPolicy.js";
import type { ExecutionTarget } from "../execution/executionRouting.js";
import type { HostExecutionTraceEntry, SandboxBridgeJobSummary } from "../types.js";

export type CaptureRecord = {
  relativePath: string;
  kind: "onboarding" | "module" | "scenario" | "auto";
  label: string;
  order: number;
  /** 질적 화면 ID (시나리오·자동탐색에서 채움) */
  screenId?: string;
  /** 시나리오 전용 — 대표 화면 분류 */
  category?: MyPhoneCheckScreenCategory;
};

export type MyPhoneCheckPackageCtx = AppLaunchWorkflowCtx & {
  bundleRoot: string;
  mpc: MyPhoneCheckCaptureConfig;
  records: CaptureRecord[];
  /** manifest 순번 (온보딩+모듈 통합) */
  nextCaptureOrder: number;
  /** MyPhoneCheck 시나리오 캡처 직후 결과 (ScreenId 시드) */
  scenarioCaptureResult?: MyPhoneCheckScenarioCaptureResult | null;
  /** Host `screen_capture`(에뮬/시뮬 화면 캡처) 누적 */
  emulatorScreenCaptureTrace: EmulatorScreenCaptureEvent[];
  /** 마지막 자동 탐색 실행 결과 (리포트·요약용) */
  explorationResult?: CaptureExplorationResult | null;
  /** host_executor_preflight 스텝에서 누적 */
  hostExecutionTrace: HostExecutionTraceEntry[];
  /** sandbox_bridge_job 스텝 결과 */
  sandboxBridgeJob: SandboxBridgeJobSummary | null;
  /** host + sandbox 스텝에서 사용한 ExecutionTarget 목록 */
  executionTargetsUsed: string[];
  /** dispatchExecutionStep 감사 요약 */
  dispatchAudit: Array<{ routedId: string; target: ExecutionTarget; summary: string }>;
};
