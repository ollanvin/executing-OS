/**
 * Neo 내부 자동화 셀(Stage 1) — 공통 워크플로 타입.
 * 장기 비전(user order → … → replan)은 docs/workflow/NEO-PLANNER-EXECUTOR-ROADMAP.md 참고.
 */

/** 알려진 목표 ID (문자열로 확장 가능). */
export const WORKFLOW_GOAL_RUNTIME_SCREENSHOT = "capture_runtime_screenshot" as const;
export const WORKFLOW_GOAL_EMULATOR_ENSURE_BOOT = "emulator_ensure_boot" as const;
export const WORKFLOW_GOAL_APP_LAUNCH_FOREGROUND = "app_launch_foreground" as const;
/** 앱 foreground 확보 후 스크린샷 — app launch 빌딩 블록 + capture 빌딩 블록 합성 */
export const WORKFLOW_GOAL_APP_READY_SCREENSHOT = "app_ready_screenshot" as const;
/** MyPhoneCheck 온보딩·모듈 화면 캡처 → 컨트롤플레인 전달용 manifest/번들 (Stage 1 golden path) */
export const WORKFLOW_GOAL_MYPHONECHECK_CAPTURE_PACKAGE = "myphonecheck_capture_package" as const;

export const WORKFLOW_STEP_ENSURE_ANDROID_DEVICE = "ensure_android_device" as const;
/** Ollama Host Executor — 번들 경로 준비·ADB 버전 등 로컬 작업 (ExecutionTarget: ollama_host) */
export const WORKFLOW_STEP_HOST_EXECUTOR_PREFLIGHT = "host_executor_preflight" as const;
export const WORKFLOW_STEP_CAPTURE_SCREENCAP = "capture_screencap" as const;
export const WORKFLOW_STEP_ENSURE_APP_INSTALLED = "ensure_app_installed" as const;
export const WORKFLOW_STEP_LAUNCH_APP = "launch_app" as const;
export const WORKFLOW_STEP_ENSURE_APP_FOREGROUND = "ensure_app_foreground" as const;
export const WORKFLOW_STEP_CAPTURE_ONBOARDING_SEQUENCE = "capture_onboarding_sequence" as const;
export const WORKFLOW_STEP_NAVIGATE_MODULE_SCREENS = "navigate_to_module_screens" as const;
export const WORKFLOW_STEP_CAPTURE_MODULE_SEQUENCE = "capture_module_sequence" as const;
/** 앱 무관 UI 자동 탐색 + 새 상태마다 captures/auto 스크린샷 */
export const WORKFLOW_STEP_EXPLORE_CAPTURE_APP_STATES = "explore_capture_app_states" as const;
export const WORKFLOW_STEP_BUILD_CONTROL_PLANE_BUNDLE = "build_control_plane_bundle" as const;
/** sandbox-bridge inbox/outbox 로 job 1건 왕복 (ExecutionTarget: ollama_sandbox) */
export const WORKFLOW_STEP_SANDBOX_BRIDGE_JOB = "sandbox_bridge_job" as const;

/** 스크린샷 recover 경로 등에서 쓰는 실패 분류 태그 (확장 가능). */
export const WORKFLOW_FAILURE_NO_ADB_DEVICE = "no_adb_device" as const;
export const WORKFLOW_FAILURE_POLICY = "policy_blocked" as const;
export const WORKFLOW_FAILURE_ENVIRONMENT = "environment" as const;
export const WORKFLOW_FAILURE_APP_NOT_INSTALLED = "app_not_installed" as const;
export const WORKFLOW_FAILURE_APP_LAUNCH_FAILED = "app_launch_failed" as const;
export const WORKFLOW_FAILURE_APP_NOT_FOREGROUND = "app_not_foreground" as const;
export const WORKFLOW_FAILURE_ONBOARDING_CAPTURE = "onboarding_capture_failed" as const;
export const WORKFLOW_FAILURE_MODULE_NAVIGATION = "module_navigation_failed" as const;
export const WORKFLOW_FAILURE_MODULE_CAPTURE = "module_capture_failed" as const;
export const WORKFLOW_FAILURE_BUNDLE_BUILD = "bundle_build_failed" as const;
export const WORKFLOW_FAILURE_HOST_EXECUTOR = "host_executor_failed" as const;
export const WORKFLOW_FAILURE_SANDBOX_BRIDGE = "sandbox_bridge_failed" as const;

export type WorkflowStep = {
  id: string;
  description: string;
  maxAttempts: number;
};

export type WorkflowPlan = {
  goalId: string;
  steps: WorkflowStep[];
};

export type WorkflowTraceEntry = {
  stepId: string;
  attempt: number;
  status: "success" | "failed" | "skipped";
  detail?: string;
  /** 분석·replan·관측용 (UI/로그 소비). */
  failureTag?: string;
};

/** 고수준 플래너(정적 DAG vs LLM) 출처 — trace/UI용. */
export type WorkflowPlanSource = "static" | "llm" | "llm+fallback";

export type WorkflowTrace = {
  goalId: string;
  entries: WorkflowTraceEntry[];
  planSource?: WorkflowPlanSource;
  plannerModelKind?: string;
  plannerModelName?: string;
  /** LLM 플랜의 notes(선택). */
  plannerNotes?: string;
  /** validator·diff·모델 실패 시 사유. */
  llmPlanRejectedReason?: string;
};
