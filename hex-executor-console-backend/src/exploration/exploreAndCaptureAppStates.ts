/**
 * 앱 ID 기준 UI 자동 탐색 — 질적 ScreenId 가 새로 나올 때마다 스크린샷 1장.
 * stateId(XML 해시)는 정밀 상태·디버그용으로 레코드에 병행 저장.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { validateArtifactPath } from "../policy.js";
import { adbBin } from "../runtime/androidDevice.js";
import { adbShellInputKeyEvents, sleepMs } from "../runtime/androidApp.js";
import { captureEmulatorScreenToPng, type EmulatorScreenCaptureEvent } from "./emulatorScreenCaptureHost.js";
import { defaultCapturePolicy } from "./capturePolicy.js";
import type { CaptureExplorationResult, CapturedState, ExploreAndCaptureOptions } from "./explorationTypes.js";
import { computeScreenId, computeStateId, screenIdFileTag, shortScreenId, shortStateId } from "./screenId.js";
import { dumpUiHierarchy, getResumedActivity } from "./uiHierarchyDump.js";

const execFileAsync = promisify(execFile);

export { computeStateId } from "./screenId.js";

function logLine(opts: ExploreAndCaptureOptions, line: string, logs: string[]) {
  logs.push(line);
  opts.logger?.(line);
}

/** uiautomator XML에서 clickable/focusable 노드의 중심 좌표. */
export function parseClickableCenters(xml: string): Array<{ x: number; y: number; label: string }> {
  const out: Array<{ x: number; y: number; label: string }> = [];
  const re = /<node\b[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const tag = m[0]!;
    if (!/clickable="true"/.test(tag) && !/focusable="true"/.test(tag)) continue;
    const bm = tag.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (!bm) continue;
    const x1 = Number(bm[1]);
    const y1 = Number(bm[2]);
    const x2 = Number(bm[3]);
    const y2 = Number(bm[4]);
    if (x2 <= x1 || y2 <= y1) continue;
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    if (cy < 72) continue;
    const tm = tag.match(/text="([^"]*)"/);
    const label = (tm?.[1] ?? "").slice(0, 48);
    out.push({ x: cx, y: cy, label });
  }
  return out;
}

export async function exploreAndCaptureAppStates(opts: ExploreAndCaptureOptions): Promise<CaptureExplorationResult> {
  const cap = opts.capturePolicy ?? defaultCapturePolicy();
  const logs: string[] = [];
  const states: CapturedState[] = [];
  const capturedScreenIdsOrdered: string[] = [];
  const emulatorScreenCaptureEvents: EmulatorScreenCaptureEvent[] = [];
  const startedAt = new Date().toISOString();
  const adb = adbBin();
  const autoDir = path.join(opts.bundleRoot, "captures", "auto");
  await fs.mkdir(autoDir, { recursive: true });

  /** 질적 화면 단위 — 캡처 여부 판단 */
  const capturedScreenIds = new Set<string>();
  for (const id of opts.seedSeenScreenIds ?? []) {
    if (id) capturedScreenIds.add(id);
  }

  let seq = 1;
  let steps = 0;
  let depth = 0;

  logLine(
    opts,
    `[explore] start appId=${opts.appId} maxShots=${cap.maxShots} maxDepth=${cap.maxDepth} seededScreenIds=${capturedScreenIds.size}`,
    logs,
  );

  while (states.length < cap.maxShots && steps < cap.maxExploreSteps) {
    if (depth > cap.maxDepth) {
      if (cap.backNavigationStrategy === "adb_back") {
        await adbShellInputKeyEvents(opts.policy, ["KEYCODE_BACK"], logs);
        await sleepMs(cap.tapSettleMs);
        depth = Math.max(0, depth - 1);
      }
      steps++;
      continue;
    }

    const activity = (await getResumedActivity(adb)) ?? "unknown";
    const xml = await dumpUiHierarchy(adb, logs);
    if (!xml || xml.length < 80) {
      logLine(opts, `[explore] weak or empty hierarchy (step ${steps})`, logs);
      if (cap.backNavigationStrategy === "adb_back") {
        await adbShellInputKeyEvents(opts.policy, ["KEYCODE_BACK"], logs);
        await sleepMs(cap.tapSettleMs);
      }
      steps++;
      continue;
    }

    const stateId = computeStateId(activity, xml);
    const screenId = computeScreenId(activity, xml);

    if (!capturedScreenIds.has(screenId)) {
      const fname = `${String(seq).padStart(3, "0")}_${screenIdFileTag(screenId)}.png`;
      const abs = path.join(autoDir, fname);
      const va = validateArtifactPath(abs, opts.policy);
      if (!va.ok) {
        logLine(opts, `[explore] artifact path rejected: ${va.reason}`, logs);
        break;
      }
      const capRes = await captureEmulatorScreenToPng({
        absolutePngPath: abs,
        workspaceRoot: opts.workspaceRoot,
        outputRoot: opts.outputRoot,
        backendRoot: opts.backendRoot,
        policy: opts.policy,
        phase: "auto_explore",
        screenId,
        screenIdShort: screenIdFileTag(screenId),
        bundleRoot: opts.bundleRoot,
        targetWindowHint: "android_emulator",
        captureBackend: "host_window",
      });
      emulatorScreenCaptureEvents.push(capRes.event);
      if (capRes.ok) {
        capturedScreenIds.add(screenId);
        capturedScreenIdsOrdered.push(screenId);
        states.push({
          stateId,
          screenId,
          screenshotPath: abs,
          activityName: activity,
          titleText: undefined,
          visitedAt: new Date().toISOString(),
        });
        const rel = path.relative(opts.bundleRoot, abs).split(path.sep).join("/");
        logLine(
          opts,
          `[explore] Emulator/Simulator Screen Capture ${rel} screenId=${shortScreenId(screenId)} stateId=${shortStateId(stateId)}`,
          logs,
        );
        seq++;
      } else {
        logLine(opts, `[explore] screen_capture failed: ${capRes.message}`, logs);
      }
    } else {
      logLine(
        opts,
        `[explore] skip duplicate screenId=${shortScreenId(screenId)} stateId=${shortStateId(stateId)} (step ${steps})`,
        logs,
      );
    }

    const clickables = parseClickableCenters(xml);
    if (clickables.length === 0) {
      if (cap.backNavigationStrategy === "adb_back") {
        await adbShellInputKeyEvents(opts.policy, ["KEYCODE_BACK"], logs);
        await sleepMs(cap.tapSettleMs);
        depth = Math.max(0, depth - 1);
      }
      steps++;
      continue;
    }

    const c = clickables[steps % clickables.length]!;
    try {
      await execFileAsync(
        adb,
        ["shell", "input", "tap", String(Math.round(c.x)), String(Math.round(c.y))],
        { timeout: 25_000 },
      );
    } catch (e) {
      logLine(opts, `[explore] tap failed: ${e instanceof Error ? e.message : String(e)}`, logs);
    }
    await sleepMs(cap.tapSettleMs);
    depth++;
    steps++;
  }

  const finishedAt = new Date().toISOString();
  const distinctInExplore = capturedScreenIdsOrdered.length;
  logLine(
    opts,
    `[explore] done screenshots=${states.length} steps=${steps} distinctScreenIds(this run)=${distinctInExplore} totalSeenScreenIds=${capturedScreenIds.size}`,
    logs,
  );

  return {
    appId: opts.appId,
    startedAt,
    finishedAt,
    totalStatesVisited: states.length,
    totalScreenshots: states.length,
    states,
    logs,
    policy: cap,
    stats: {
      totalSteps: steps,
      distinctScreenIdsCaptured: distinctInExplore,
      capturedScreenIdsOrdered,
    },
    emulatorScreenCaptureEvents,
  };
}
