import type { WorkflowPlan } from "./types.js";
import {
  WORKFLOW_GOAL_APP_READY_SCREENSHOT,
  WORKFLOW_STEP_CAPTURE_SCREENCAP,
  WORKFLOW_STEP_ENSURE_ANDROID_DEVICE,
  WORKFLOW_STEP_ENSURE_APP_FOREGROUND,
  WORKFLOW_STEP_ENSURE_APP_INSTALLED,
  WORKFLOW_STEP_LAUNCH_APP,
} from "./types.js";

export type AppReadyScreenshotPlanInput = {
  scenarioId?: string | null;
};

/**
 * Composite paved path: app launch capability 스텝 + raw capture 스텝을 한 DAG로 합성.
 * 핸들러는 appLaunchStepHandlers + screencapStepShared에서 재사용(A안).
 */
export function planAppReadyScreenshot(_input?: AppReadyScreenshotPlanInput): WorkflowPlan {
  return {
    goalId: WORKFLOW_GOAL_APP_READY_SCREENSHOT,
    steps: [
      {
        id: WORKFLOW_STEP_ENSURE_ANDROID_DEVICE,
        description:
          "adb 온라인 기기 확보; 없으면 메타데이터·AVD 목록으로 emulator 기동 후 wait-for-device",
        maxAttempts: 2,
      },
      {
        id: WORKFLOW_STEP_ENSURE_APP_INSTALLED,
        description: "adb shell pm path 로 패키지 설치 여부 확인",
        maxAttempts: 2,
      },
      {
        id: WORKFLOW_STEP_LAUNCH_APP,
        description: "adb shell monkey 로 LAUNCHER 카테고리 기동",
        maxAttempts: 3,
      },
      {
        id: WORKFLOW_STEP_ENSURE_APP_FOREGROUND,
        description: "dumpsys 로 foreground 패키지가 대상과 일치하는지 확인 (composite 중간 스텝)",
        maxAttempts: 3,
      },
      {
        id: WORKFLOW_STEP_CAPTURE_SCREENCAP,
        description: "adb exec-out screencap → 정책 허용 경로에 PNG 저장",
        maxAttempts: 2,
      },
    ],
  };
}
