import type { WorkflowPlan } from "./types.js";
import {
  WORKFLOW_GOAL_EMULATOR_ENSURE_BOOT,
  WORKFLOW_STEP_ENSURE_ANDROID_DEVICE,
} from "./types.js";

/** MyPhoneCheck / “에뮬만 띄워줘”류 오더용 Stage 1 capability (단일 ensure DAG). */
export function planEmulatorEnsureBoot(): WorkflowPlan {
  return {
    goalId: WORKFLOW_GOAL_EMULATOR_ENSURE_BOOT,
    steps: [
      {
        id: WORKFLOW_STEP_ENSURE_ANDROID_DEVICE,
        description:
          "adb 온라인 기기 확보; 없으면 메타데이터·AVD 목록으로 emulator 기동 후 wait-for-device",
        maxAttempts: 2,
      },
    ],
  };
}
