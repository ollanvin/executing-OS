import type { OrchestratedPlan } from "../orchestratorTypes.js";

/** 한 줄 목표 → 전체 플로우 (preflight → 캡처 워크플로 → e2e/리포트) */
export const GOAL_MYPHONECHECK_CAPTURE_BUNDLE_RUN = "myphonecheck_capture_bundle_run" as const;

export function buildMyphonecheckCaptureBundleRunPlan(): OrchestratedPlan {
  return {
    goalId: GOAL_MYPHONECHECK_CAPTURE_BUNDLE_RUN,
    title: "MyPhoneCheck UX 캡처 번들 (Stage1 preflight → 캡처·번들·리포트)",
    steps: [
      {
        id: "stage1-preflight",
        kind: "stage1_preflight",
        description: "Stage1 preflight (ADB·환경·패키지)",
        successCriteria: "preflight.status === PASS",
        abortOnFailure: true,
      },
      {
        id: "ollama-host-smoke-mini",
        kind: "ollama_host_smoke_mini",
        description: "Host Executor 스모크 (fs + PowerShell + primary screen_capture)",
        successCriteria: "각 HostExecutionResult.ok",
        abortOnFailure: true,
      },
      {
        id: "workflow-myphonecheck-capture",
        kind: "workflow_myphonecheck_capture",
        description: "myphonecheck_capture_package 워크플로 (시나리오·탐색·screen_capture·sandbox·manifest)",
        successCriteria: "ExecuteResult.ok",
        abortOnFailure: true,
      },
      {
        id: "e2e-finalize-bundle",
        kind: "e2e_finalize_bundle",
        description: "번들 경로 확정·e2eVerification·UX 마크다운 리포트",
        successCriteria: "리포트 파일 생성",
        abortOnFailure: false,
      },
    ],
  };
}
