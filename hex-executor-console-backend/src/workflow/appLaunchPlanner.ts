import type { WorkflowPlan } from "./types.js";
import {
  WORKFLOW_GOAL_APP_LAUNCH_FOREGROUND,
  WORKFLOW_STEP_ENSURE_ANDROID_DEVICE,
  WORKFLOW_STEP_ENSURE_APP_FOREGROUND,
  WORKFLOW_STEP_ENSURE_APP_INSTALLED,
  WORKFLOW_STEP_LAUNCH_APP,
} from "./types.js";

export type AppLaunchPlanInput = {
  /** 시나리오 메타 연동 예약 (Stage 2+); 플랜 DAG는 동일 */
  scenarioId?: string | null;
};

/** 패키지 기동 + foreground 보장 — device ensure부터 순차 실행. */
export function planAppLaunchForeground(_input?: AppLaunchPlanInput): WorkflowPlan {
  return {
    goalId: WORKFLOW_GOAL_APP_LAUNCH_FOREGROUND,
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
        description: "dumpsys 로 현재 foreground 패키지가 대상과 일치하는지 확인",
        maxAttempts: 3,
      },
    ],
  };
}
