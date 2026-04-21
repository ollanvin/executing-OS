/**
 * MyPhoneCheck 전용 "대표 화면" 시나리오·최소 장수 정책.
 * 실제 앱 네비게이션은 DPAD/백 등 보수적 키 시퀀스 — 완전 커버는 후속 Iteration.
 */

/** 리포트·e2e missingCategories 에 사용 */
export type MyPhoneCheckScreenCategory =
  | "onboarding"
  | "home"
  | "settings"
  | "timeline"
  | "call_check"
  | "sms_check"
  | "camera_check"
  | "mic_check"
  | "overlay"
  | "module"
  | "auto_explore"
  | "unknown";

/** 시나리오로 한 번씩 시도할 대표 카테고리 (온보딩은 워크플로 온보딩 스텝과 별도) */
export const MYPHONECHECK_SCENARIO_EXPECTED_CATEGORIES: MyPhoneCheckScreenCategory[] = [
  "home",
  "settings",
  "timeline",
  "call_check",
  "sms_check",
  "camera_check",
  "mic_check",
  "overlay",
];

/** 번들 전체(온보딩+모듈+시나리오+자동탐색) 최소 목표 장수 — 부족 시 e2e 리포트에 표시 */
export const MYPHONECHECK_MIN_TOTAL_CAPTURES = 12;

/**
 * 앱 포그라운드에서 순차 시도 — 키는 에뮬/포커스에 따라 실패할 수 있음.
 * keyEventsBefore: 캡처 직전 네비게이션, keyEventsAfter: 다음 화면으로 진행.
 */
export type MyPhoneCheckScenarioStep = {
  category: MyPhoneCheckScreenCategory;
  label: string;
  delayBeforeMs?: number;
  keyEventsBefore?: string[];
  keyEventsAfter?: string[];
};

export const DEFAULT_MYPHONECHECK_SCENARIO_STEPS: MyPhoneCheckScenarioStep[] = [
  {
    category: "home",
    label: "scenario_home",
    delayBeforeMs: 900,
    keyEventsBefore: ["KEYCODE_BACK", "KEYCODE_BACK"],
    keyEventsAfter: ["KEYCODE_DPAD_DOWN"],
  },
  {
    category: "timeline",
    label: "scenario_timeline_tab",
    delayBeforeMs: 700,
    keyEventsBefore: ["KEYCODE_DPAD_LEFT", "KEYCODE_DPAD_LEFT"],
    keyEventsAfter: ["KEYCODE_DPAD_RIGHT", "KEYCODE_ENTER"],
  },
  {
    category: "settings",
    label: "scenario_settings",
    delayBeforeMs: 800,
    keyEventsBefore: ["KEYCODE_MENU"],
    keyEventsAfter: ["KEYCODE_DPAD_DOWN", "KEYCODE_ENTER"],
  },
  {
    category: "call_check",
    label: "scenario_call_check",
    delayBeforeMs: 800,
    keyEventsBefore: ["KEYCODE_BACK", "KEYCODE_DPAD_RIGHT", "KEYCODE_ENTER"],
    keyEventsAfter: ["KEYCODE_BACK"],
  },
  {
    category: "sms_check",
    label: "scenario_sms_check",
    delayBeforeMs: 800,
    keyEventsBefore: ["KEYCODE_DPAD_RIGHT", "KEYCODE_ENTER"],
    keyEventsAfter: ["KEYCODE_BACK"],
  },
  {
    category: "camera_check",
    label: "scenario_camera_check",
    delayBeforeMs: 900,
    keyEventsBefore: ["KEYCODE_DPAD_RIGHT", "KEYCODE_ENTER"],
    keyEventsAfter: ["KEYCODE_BACK"],
  },
  {
    category: "mic_check",
    label: "scenario_mic_check",
    delayBeforeMs: 900,
    keyEventsBefore: ["KEYCODE_DPAD_RIGHT", "KEYCODE_ENTER"],
    keyEventsAfter: ["KEYCODE_BACK"],
  },
  {
    category: "overlay",
    label: "scenario_permission_overlay",
    delayBeforeMs: 600,
    keyEventsBefore: ["KEYCODE_TAB", "KEYCODE_ENTER"],
    keyEventsAfter: [],
  },
];
