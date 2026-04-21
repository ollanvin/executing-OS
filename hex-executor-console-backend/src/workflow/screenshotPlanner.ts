import type { WorkflowPlan } from "./types.js";
import {
  WORKFLOW_GOAL_RUNTIME_SCREENSHOT,
  WORKFLOW_STEP_CAPTURE_SCREENCAP,
  WORKFLOW_STEP_ENSURE_ANDROID_DEVICE,
} from "./types.js";

/** 런타임 스크린샷 목표에 대한 고정 DAG (Stage 1 첫 생산 셀 사례). */
export function planRuntimeScreenshot(): WorkflowPlan {
  return {
    goalId: WORKFLOW_GOAL_RUNTIME_SCREENSHOT,
    steps: [
      {
        id: WORKFLOW_STEP_ENSURE_ANDROID_DEVICE,
        description:
          "adb 온라인 기기 확보; 없으면 메타데이터·AVD 목록으로 emulator 기동 후 wait-for-device",
        maxAttempts: 2,
      },
      {
        id: WORKFLOW_STEP_CAPTURE_SCREENCAP,
        description: "adb exec-out screencap → 정책 허용 경로에 PNG 저장",
        maxAttempts: 2,
      },
    ],
  };
}
