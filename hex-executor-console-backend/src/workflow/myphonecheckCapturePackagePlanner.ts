import type { WorkflowPlan } from "./types.js";
import {
  WORKFLOW_GOAL_MYPHONECHECK_CAPTURE_PACKAGE,
  WORKFLOW_STEP_BUILD_CONTROL_PLANE_BUNDLE,
  WORKFLOW_STEP_CAPTURE_MODULE_SEQUENCE,
  WORKFLOW_STEP_CAPTURE_ONBOARDING_SEQUENCE,
  WORKFLOW_STEP_ENSURE_ANDROID_DEVICE,
  WORKFLOW_STEP_ENSURE_APP_FOREGROUND,
  WORKFLOW_STEP_ENSURE_APP_INSTALLED,
  WORKFLOW_STEP_EXPLORE_CAPTURE_APP_STATES,
  WORKFLOW_STEP_HOST_EXECUTOR_PREFLIGHT,
  WORKFLOW_STEP_LAUNCH_APP,
  WORKFLOW_STEP_NAVIGATE_MODULE_SCREENS,
  WORKFLOW_STEP_SANDBOX_BRIDGE_JOB,
} from "./types.js";

/**
 * 고수준 오더 → Stage 1 셀 조합 DAG.
 * 1~4: app launch 빌딩 블록 | host preflight | MyPhoneCheck 시퀀스 | explore | sandbox-bridge | manifest/zip
 */
export function planMyPhoneCheckCapturePackage(): WorkflowPlan {
  return {
    goalId: WORKFLOW_GOAL_MYPHONECHECK_CAPTURE_PACKAGE,
    steps: [
      {
        id: WORKFLOW_STEP_ENSURE_ANDROID_DEVICE,
        description: "adb 온라인 **에뮬/가상 타깃** 확보 (recover; 실물 단말 기본 전제 아님 — 헌법 docs/OPERATING-CONSTITUTION.md)",
        maxAttempts: 2,
      },
      {
        id: WORKFLOW_STEP_HOST_EXECUTOR_PREFLIGHT,
        description: "Ollama Host Executor: ADB 버전 확인 + 번들/captures 디렉터리 fs_prepare (ExecutionTarget=ollama_host)",
        maxAttempts: 2,
      },
      {
        id: WORKFLOW_STEP_ENSURE_APP_INSTALLED,
        description: "pm path 패키지 설치 확인",
        maxAttempts: 2,
      },
      {
        id: WORKFLOW_STEP_LAUNCH_APP,
        description: "monkey LAUNCHER 기동",
        maxAttempts: 3,
      },
      {
        id: WORKFLOW_STEP_ENSURE_APP_FOREGROUND,
        description: "foreground 패키지 일치 (composite 중간)",
        maxAttempts: 3,
      },
      {
        id: WORKFLOW_STEP_CAPTURE_ONBOARDING_SEQUENCE,
        description: ".neo-myphonecheck-capture.json 온보딩 스텝별 캡처·키 입력",
        maxAttempts: 2,
      },
      {
        id: WORKFLOW_STEP_NAVIGATE_MODULE_SCREENS,
        description: "모듈 화면으로 최소 네비게이션 (키 시퀀스)",
        maxAttempts: 2,
      },
      {
        id: WORKFLOW_STEP_CAPTURE_MODULE_SEQUENCE,
        description: "모듈 화면 시퀀스 캡처",
        maxAttempts: 2,
      },
      {
        id: WORKFLOW_STEP_EXPLORE_CAPTURE_APP_STATES,
        description:
          "시나리오 캡처(captures/scenario) 후 ScreenId 기준 자동 탐색(captures/auto) — 질적 화면 전환마다 1장",
        maxAttempts: 2,
      },
      {
        id: WORKFLOW_STEP_SANDBOX_BRIDGE_JOB,
        description: "sandbox-bridge inbox/outbox job 1건 왕복 (ExecutionTarget=ollama_sandbox, real agent 동일 프로세스)",
        maxAttempts: 2,
      },
      {
        id: WORKFLOW_STEP_BUILD_CONTROL_PLANE_BUNDLE,
        description: "manifest.json 생성 및 선택적 zip 번들",
        maxAttempts: 1,
      },
    ],
  };
}
