/**
 * MyPhoneCheck 전용 시나리오 캡처 — explore 이전에 실행해 대표 화면을 확보하고 ScreenId 시드 제공.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { validateArtifactPath } from "../policy.js";
import { adbBin } from "../runtime/androidDevice.js";
import { adbShellInputKeyEvents, sleepMs } from "../runtime/androidApp.js";
import type { NeoPolicy } from "../policy.js";
import { computeScreenId, computeStateId, screenIdFileTag, shortScreenId } from "./screenId.js";
import { dumpUiHierarchy, getResumedActivity } from "./uiHierarchyDump.js";
import { captureEmulatorScreenToPng, type EmulatorScreenCaptureEvent } from "./emulatorScreenCaptureHost.js";
import {
  DEFAULT_MYPHONECHECK_SCENARIO_STEPS,
  type MyPhoneCheckScenarioStep,
  type MyPhoneCheckScreenCategory,
} from "../policy/myphonecheckScreenPolicy.js";

export type ScenarioCaptureEntry = {
  label: string;
  category: MyPhoneCheckScreenCategory;
  screenId: string;
  relativePath: string;
};

export type MyPhoneCheckScenarioCaptureResult = {
  ok: boolean;
  /** 자동탐색 seed 용 */
  seenScreenIds: string[];
  captures: ScenarioCaptureEntry[];
  categoriesCaptured: MyPhoneCheckScreenCategory[];
  logs: string[];
  /** Host `screen_capture` task 이벤트 (에뮬/시뮬 화면 캡처) */
  emulatorScreenCaptureEvents: EmulatorScreenCaptureEvent[];
};

export async function runMyPhoneCheckScenarioCapture(opts: {
  bundleRoot: string;
  workspaceRoot: string;
  outputRoot: string;
  backendRoot: string;
  policy: NeoPolicy;
  logger?: (line: string) => void;
  steps?: MyPhoneCheckScenarioStep[];
}): Promise<MyPhoneCheckScenarioCaptureResult> {
  const logs: string[] = [];
  const log = (line: string) => {
    logs.push(line);
    opts.logger?.(line);
  };

  const adb = adbBin();
  const scenarioDir = path.join(opts.bundleRoot, "captures", "scenario");
  await fs.mkdir(scenarioDir, { recursive: true });

  const seenScreenIds = new Set<string>();
  const captures: ScenarioCaptureEntry[] = [];
  const categoriesCaptured: MyPhoneCheckScreenCategory[] = [];
  const emulatorScreenCaptureEvents: EmulatorScreenCaptureEvent[] = [];
  const stepList = opts.steps ?? DEFAULT_MYPHONECHECK_SCENARIO_STEPS;

  let seq = 1;
  for (const st of stepList) {
    if (st.delayBeforeMs && st.delayBeforeMs > 0) await sleepMs(st.delayBeforeMs);
    const before = st.keyEventsBefore ?? [];
    if (before.length > 0) {
      const k = await adbShellInputKeyEvents(opts.policy, before, logs);
      if (!k.ok) log(`[scenario] ${st.label} keyEventsBefore: ${k.message}`);
      await sleepMs(500);
    }

    const activity = (await getResumedActivity(adb)) ?? "unknown";
    const xml = await dumpUiHierarchy(adb, logs);
    if (!xml || xml.length < 80) {
      log(`[scenario] ${st.label} weak hierarchy, skip capture`);
      const after = st.keyEventsAfter ?? [];
      if (after.length > 0) await adbShellInputKeyEvents(opts.policy, after, logs);
      continue;
    }

    const screenId = computeScreenId(activity, xml);
    const stateId = computeStateId(activity, xml);

    if (seenScreenIds.has(screenId)) {
      log(`[scenario] ${st.label} duplicate screenId=${shortScreenId(screenId)} state=${stateId.slice(0, 12)} — skip`);
    } else {
      const fname = `${String(seq).padStart(3, "0")}_${screenIdFileTag(screenId)}.png`;
      const abs = path.join(scenarioDir, fname);
      const va = validateArtifactPath(abs, opts.policy);
      if (!va.ok) {
        log(`[scenario] path rejected: ${va.reason}`);
        return {
          ok: false,
          seenScreenIds: [...seenScreenIds],
          captures,
          categoriesCaptured,
          logs,
          emulatorScreenCaptureEvents,
        };
      }
      const cap = await captureEmulatorScreenToPng({
        absolutePngPath: abs,
        workspaceRoot: opts.workspaceRoot,
        outputRoot: opts.outputRoot,
        backendRoot: opts.backendRoot,
        policy: opts.policy,
        phase: "scenario",
        screenId,
        screenIdShort: screenIdFileTag(screenId),
        bundleRoot: opts.bundleRoot,
        targetWindowHint: "android_emulator",
        captureBackend: "host_window",
      });
      emulatorScreenCaptureEvents.push(cap.event);
      if (cap.ok) {
        seenScreenIds.add(screenId);
        const rel = path.relative(opts.bundleRoot, abs).split(path.sep).join("/");
        captures.push({
          label: st.label,
          category: st.category,
          screenId,
          relativePath: rel,
        });
        categoriesCaptured.push(st.category);
        seq++;
        log(`[scenario] Emulator/Simulator Screen Capture ${rel} screen=${shortScreenId(screenId)} cat=${st.category}`);
      } else {
        log(`[scenario] ${st.label} screen_capture failed: ${cap.message}`);
      }
    }

    const after = st.keyEventsAfter ?? [];
    if (after.length > 0) {
      const k = await adbShellInputKeyEvents(opts.policy, after, logs);
      if (!k.ok) log(`[scenario] ${st.label} keyEventsAfter: ${k.message}`);
      await sleepMs(400);
    }
  }

  return {
    ok: true,
    seenScreenIds: [...seenScreenIds],
    captures,
    categoriesCaptured,
    logs,
    emulatorScreenCaptureEvents,
  };
}
