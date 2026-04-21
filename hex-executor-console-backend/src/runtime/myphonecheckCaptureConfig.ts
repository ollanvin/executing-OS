import fs from "node:fs/promises";
import path from "node:path";

export type MpcScreenStep = {
  label: string;
  delayBeforeMs?: number;
  /** 캡처 후 순서대로 입력 (예: 다음 화면으로) */
  keyEventsAfter?: string[];
};

export type MyPhoneCheckCaptureConfig = {
  onboarding: { steps: MpcScreenStep[] };
  /** 모듈 영역으로 최소 이동 (키 이벤트 시퀀스) */
  moduleNavigation: { delayBeforeMs?: number; keyEvents?: string[] };
  moduleScreens: { steps: MpcScreenStep[] };
};

export const DEFAULT_MYPHONECHECK_CAPTURE_CONFIG: MyPhoneCheckCaptureConfig = {
  onboarding: {
    steps: [
      { label: "onboarding_1_initial", delayBeforeMs: 2500, keyEventsAfter: [] },
      {
        label: "onboarding_2_after_next",
        delayBeforeMs: 800,
        keyEventsAfter: ["KEYCODE_DPAD_RIGHT", "KEYCODE_ENTER"],
      },
      {
        label: "onboarding_3",
        delayBeforeMs: 800,
        keyEventsAfter: ["KEYCODE_DPAD_RIGHT", "KEYCODE_ENTER"],
      },
      {
        label: "onboarding_4",
        delayBeforeMs: 800,
        keyEventsAfter: ["KEYCODE_DPAD_RIGHT", "KEYCODE_ENTER"],
      },
      {
        label: "onboarding_5_finish",
        delayBeforeMs: 800,
        keyEventsAfter: ["KEYCODE_ENTER"],
      },
    ],
  },
  moduleNavigation: {
    delayBeforeMs: 1200,
    keyEvents: ["KEYCODE_BACK", "KEYCODE_DPAD_DOWN", "KEYCODE_ENTER"],
  },
  moduleScreens: {
    steps: [
      { label: "module_1_main", delayBeforeMs: 2000, keyEventsAfter: [] },
    ],
  },
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function parseSteps(raw: unknown): MpcScreenStep[] {
  if (!Array.isArray(raw)) return [];
  const out: MpcScreenStep[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const label = typeof item.label === "string" ? item.label : "";
    if (!label.trim()) continue;
    const delayBeforeMs = typeof item.delayBeforeMs === "number" ? item.delayBeforeMs : 0;
    const keyEventsAfter = Array.isArray(item.keyEventsAfter)
      ? item.keyEventsAfter.filter((k): k is string => typeof k === "string")
      : [];
    out.push({ label: label.trim(), delayBeforeMs, keyEventsAfter });
  }
  return out;
}

function normalizeConfig(raw: unknown): MyPhoneCheckCaptureConfig {
  if (!isRecord(raw)) return { ...DEFAULT_MYPHONECHECK_CAPTURE_CONFIG };
  const ob = isRecord(raw.onboarding) ? raw.onboarding : {};
  const mn = isRecord(raw.moduleNavigation) ? raw.moduleNavigation : {};
  const ms = isRecord(raw.moduleScreens) ? raw.moduleScreens : {};
  const steps = parseSteps(ob.steps);
  const modSteps = parseSteps(ms.steps);
  const keyEvents = Array.isArray(mn.keyEvents)
    ? mn.keyEvents.filter((k): k is string => typeof k === "string")
    : [];
  const delayNav = typeof mn.delayBeforeMs === "number" ? mn.delayBeforeMs : 800;
  if (steps.length === 0 && modSteps.length === 0) {
    return { ...DEFAULT_MYPHONECHECK_CAPTURE_CONFIG };
  }
  return {
    onboarding: { steps: steps.length > 0 ? steps : DEFAULT_MYPHONECHECK_CAPTURE_CONFIG.onboarding.steps },
    moduleNavigation: {
      delayBeforeMs: delayNav,
      keyEvents: keyEvents.length > 0 ? keyEvents : DEFAULT_MYPHONECHECK_CAPTURE_CONFIG.moduleNavigation.keyEvents,
    },
    moduleScreens: {
      steps:
        modSteps.length > 0 ? modSteps : DEFAULT_MYPHONECHECK_CAPTURE_CONFIG.moduleScreens.steps,
    },
  };
}

export async function loadMyPhoneCheckCaptureConfig(
  workspaceRoot: string,
): Promise<MyPhoneCheckCaptureConfig> {
  const cfgPath = path.join(workspaceRoot, ".neo-myphonecheck-capture.json");
  try {
    const raw = await fs.readFile(cfgPath, "utf8");
    return normalizeConfig(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULT_MYPHONECHECK_CAPTURE_CONFIG };
  }
}
