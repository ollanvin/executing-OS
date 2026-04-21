/**
 * 고도화 4 — Neo 오케스트레이션: Goal → 단계별 실행 → 결과 요약.
 */
import type { E2eMyPhoneBundleVerification, ExecuteResult, ScreenCaptureSummary } from "../types.js";

export type OrchestratorGoalId = string;

/** 단일 오케스트레이션 스텝 */
export type OrchestratedStep = {
  id: string;
  description: string;
  /** 실행기에서 분기 */
  kind:
    | "stage1_preflight"
    | "workflow_myphonecheck_capture"
    | "e2e_finalize_bundle"
    | "ollama_host_smoke_mini";
  /** 성공 판정 힌트 (로그용) */
  successCriteria?: string;
  /** 실패 시 전체 중단 여부 */
  abortOnFailure?: boolean;
};

export type OrchestratedPlan = {
  goalId: OrchestratorGoalId;
  /** 사람이 읽는 설명 */
  title: string;
  steps: OrchestratedStep[];
};

export type OrchestratorStepResult = {
  stepId: string;
  kind: OrchestratedStep["kind"];
  ok: boolean;
  durationMs: number;
  summary: string;
  detail?: unknown;
};

/** MyPhoneCheck 캡처 번들 오케스트레이션 최종 결과 */
export type OrchestratorResult = {
  goalId: OrchestratorGoalId;
  startedAt: string;
  finishedAt: string;
  ok: boolean;
  stepResults: OrchestratorStepResult[];
  /** Stage1 preflight 원본 (실패 시) */
  preflightFailure?: unknown;
  /** 워크플로 ExecuteResult (성공/부분 성공 시) */
  workflowResult?: ExecuteResult;
  bundlePath?: string | null;
  reportPath?: string | null;
  e2eVerification?: E2eMyPhoneBundleVerification;
  screenCaptureSummary?: ScreenCaptureSummary | null;
  /** 대표에게 보여줄 한국어 요약 (한 덩어리) */
  highLevelSummaryKo: string;
  /** 구조화 요약 (UI/로그) */
  summaryFields: {
    bundlePath?: string | null;
    totalScreensCaptured?: number;
    distinctScreenIdsCaptured?: number;
    emulatorWindowCropOk?: boolean;
    reportGaps?: string[];
    e2eHardOk?: boolean;
  };
};
