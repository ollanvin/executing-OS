/** 마이폰체크 리얼런 — 단일 정의 상태 머신 */

export const REALRUN_PLAN_STEP_IDS = [
  "start-emulator",
  "install-and-launch-app",
  "navigate-all-screens",
  "capture-screens",
  "generate-report",
  "bundle-report",
  "export-to-control-plane",
] as const;

export type RealrunPlanStepId = (typeof REALRUN_PLAN_STEP_IDS)[number];

export type RealrunPhase =
  | "PLANNING"
  | "PREFLIGHT"
  | "EXECUTION"
  | "CAPTURE"
  | "AUDIT"
  | "BUNDLE"
  | "EXPORT"
  | "TERMINATED";

export type RealrunTransitionRecord = {
  at: string;
  from: RealrunPhase | "INIT";
  to: RealrunPhase;
  detail?: string;
};

export type RealrunReportJson = Record<string, unknown>;
