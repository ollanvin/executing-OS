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
} from "../workflow/types.js";
import type { PlannerCapabilitySpec, PlannerInput } from "./plannerTypes.js";

/** MyPhoneCheck capture package — Stage 1에서 LLM 플래닝 실험 대상 (이 목표만). */
export const MYPHONECHECK_CAPTURE_GOAL_ID = WORKFLOW_GOAL_MYPHONECHECK_CAPTURE_PACKAGE;

export const MYPHONECHECK_CAPTURE_CAPABILITIES: PlannerCapabilitySpec[] = [
  {
    id: WORKFLOW_STEP_ENSURE_ANDROID_DEVICE,
    description: "ADB 온라인 Android 기기(에뮬 포함) 확보 및 필요 시 recover",
  },
  {
    id: WORKFLOW_STEP_HOST_EXECUTOR_PREFLIGHT,
    description: "호스트에서 ADB 버전·번들 디렉터리 준비(executeHostTask)",
  },
  {
    id: WORKFLOW_STEP_ENSURE_APP_INSTALLED,
    description: "대상 패키지가 기기에 설치되어 있는지 pm path로 확인",
  },
  {
    id: WORKFLOW_STEP_LAUNCH_APP,
    description: "monkey로 앱 LAUNCHER 기동",
  },
  {
    id: WORKFLOW_STEP_ENSURE_APP_FOREGROUND,
    description: "현재 foreground 패키지가 대상과 일치하는지 확인",
  },
  {
    id: WORKFLOW_STEP_CAPTURE_ONBOARDING_SEQUENCE,
    description: "설정된 온보딩 화면 시퀀스를 순서대로 스크린샷·키 입력",
  },
  {
    id: WORKFLOW_STEP_NAVIGATE_MODULE_SCREENS,
    description: "모듈 화면으로 최소 네비게이션(키 시퀀스)",
  },
  {
    id: WORKFLOW_STEP_CAPTURE_MODULE_SEQUENCE,
    description: "모듈 화면 시퀀스 캡처",
  },
  {
    id: WORKFLOW_STEP_EXPLORE_CAPTURE_APP_STATES,
    description:
      "MyPhoneCheck 시나리오(captures/scenario)로 대표 화면 시도 후 ScreenId 기반 자동탐색(captures/auto, 시드로 중복 억제)",
  },
  {
    id: WORKFLOW_STEP_SANDBOX_BRIDGE_JOB,
    description: "sandbox-bridge로 격리 job 1건 요청·수집(enqueue + real/stub agent + poll)",
  },
  {
    id: WORKFLOW_STEP_BUILD_CONTROL_PLANE_BUNDLE,
    description: "manifest.json 및 선택적 zip으로 컨트롤플레인 전달 번들 생성",
  },
];

export function buildMyPhoneCheckCapturePlannerInput(userGoalText: string): PlannerInput {
  return {
    userGoalText,
    normalizedGoalId: MYPHONECHECK_CAPTURE_GOAL_ID,
    capabilities: MYPHONECHECK_CAPTURE_CAPABILITIES,
  };
}
