import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { NeoPolicy } from "../policy.js";
import { recordToolFailure, recordToolSuccess } from "../toolCircuitBreaker.js";
import { adbBin } from "./androidDevice.js";

const execFileAsync = promisify(execFile);

export async function adbPackageInstalled(
  policy: NeoPolicy,
  packageName: string,
  logs: string[],
): Promise<{ ok: true } | { ok: false; message: string }> {
  const adb = adbBin();
  try {
    const { stdout, stderr } = await execFileAsync(adb, ["shell", "pm", "path", packageName], {
      encoding: "utf8",
      timeout: 45_000,
    });
    recordToolSuccess("adb");
    const out = `${stdout}\n${stderr}`.trim();
    if (/package:/i.test(out)) return { ok: true };
    logs.push(`pm path: ${out || "(empty)"}`);
    return { ok: false, message: out || "패키지가 설치되어 있지 않습니다." };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    recordToolFailure("adb", policy, msg);
    logs.push(msg);
    return { ok: false, message: msg };
  }
}

export async function adbLaunchPackageMonkey(
  policy: NeoPolicy,
  packageName: string,
  logs: string[],
): Promise<{ ok: true } | { ok: false; message: string }> {
  const adb = adbBin();
  try {
    const { stdout, stderr } = await execFileAsync(
      adb,
      ["shell", "monkey", "-p", packageName, "-c", "android.intent.category.LAUNCHER", "1"],
      { encoding: "utf8", timeout: 90_000 },
    );
    recordToolSuccess("adb");
    const out = `${stdout}\n${stderr}`;
    logs.push(out.trim().slice(0, 500));
    if (/Events injected:\s*1\b/.test(stdout) || /Events injected:\s*1\b/.test(stderr)) {
      return { ok: true };
    }
    return { ok: false, message: out.trim() || "monkey 기동 결과를 확인할 수 없습니다." };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    recordToolFailure("adb", policy, msg);
    logs.push(msg);
    return { ok: false, message: msg };
  }
}

/** dumpsys window / activity 에서 현재 포그라운드 패키지명(추정) */
export async function adbGetForegroundPackage(
  policy: NeoPolicy,
  logs: string[],
): Promise<{ ok: true; packageName: string | null } | { ok: false; message: string }> {
  const adb = adbBin();
  try {
    const { stdout: w0 } = await execFileAsync(adb, ["shell", "dumpsys", "window"], {
      encoding: "utf8",
      timeout: 30_000,
    });
    recordToolSuccess("adb");
    let fromWindow = extractForegroundFromDumpsys(w0);
    if (!fromWindow) {
      const { stdout: wd } = await execFileAsync(adb, ["shell", "dumpsys", "window", "displays"], {
        encoding: "utf8",
        timeout: 30_000,
      });
      recordToolSuccess("adb");
      fromWindow = extractForegroundFromDumpsys(wd);
    }
    if (fromWindow) return { ok: true, packageName: fromWindow };

    const { stdout: actOut } = await execFileAsync(adb, ["shell", "dumpsys", "activity", "activities"], {
      encoding: "utf8",
      timeout: 45_000,
    });
    recordToolSuccess("adb");
    const fromAct = extractForegroundFromActivities(actOut);
    return { ok: true, packageName: fromAct };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    recordToolFailure("adb", policy, msg);
    logs.push(msg);
    return { ok: false, message: msg };
  }
}

function extractForegroundFromDumpsys(text: string): string | null {
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/mCurrentFocus=Window\{[^ ]*\s+([^\/\s]+)\//);
    if (m?.[1]) return m[1]!.trim();
    const m2 = line.match(/mFocusedApp=ActivityRecord\{[^ ]+\s+([^\/\s]+)\//);
    if (m2?.[1]) return m2[1]!.trim();
  }
  return null;
}

function extractForegroundFromActivities(text: string): string | null {
  const m = text.match(/topResumedActivity.*?([a-zA-Z0-9_.]+)\/[^\s\}]+/);
  if (m?.[1]) return m[1]!.trim();
  const m2 = text.match(/Resumed:.*?([a-zA-Z0-9_.]+)\/[^\s\}]+/);
  if (m2?.[1]) return m2[1]!.trim();
  return null;
}

export function foregroundMatchesPackage(foreground: string | null, packageName: string): boolean {
  if (!foreground) return false;
  const pkgPart = foreground.includes("/") ? foreground.split("/")[0]! : foreground;
  return pkgPart === packageName;
}

export function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** adb keyevent 이름 → 코드 (일부). 확장: https://developer.android.com/reference/android/view/KeyEvent */
const ANDROID_KEYCODE: Record<string, number> = {
  KEYCODE_BACK: 4,
  KEYCODE_ENTER: 66,
  KEYCODE_DPAD_UP: 19,
  KEYCODE_DPAD_DOWN: 20,
  KEYCODE_DPAD_LEFT: 21,
  KEYCODE_DPAD_RIGHT: 22,
  KEYCODE_DPAD_CENTER: 23,
  KEYCODE_TAB: 61,
  KEYCODE_MENU: 82,
  KEYCODE_ESCAPE: 111,
};

export async function adbShellInputKeyEvents(
  policy: NeoPolicy,
  keyNames: string[],
  logs: string[],
): Promise<{ ok: true } | { ok: false; message: string }> {
  const adb = adbBin();
  for (const name of keyNames) {
    const code = ANDROID_KEYCODE[name] ?? ANDROID_KEYCODE[name.toUpperCase()] ?? Number(name);
    if (!Number.isFinite(code) || code < 0) {
      return { ok: false, message: `알 수 없는 keyevent: ${name}` };
    }
    try {
      await execFileAsync(adb, ["shell", "input", "keyevent", String(code)], {
        encoding: "utf8",
        timeout: 30_000,
      });
      recordToolSuccess("adb");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      recordToolFailure("adb", policy, msg);
      logs.push(`keyevent ${name}: ${msg}`);
      return { ok: false, message: msg };
    }
  }
  return { ok: true };
}

/** exec-out screencap 을 파일로 저장 (경로는 호출 전 policy 로 검증 권장). */
export async function adbScreencapPngToFile(
  policy: NeoPolicy,
  outPath: string,
  logs: string[],
): Promise<{ ok: true } | { ok: false; message: string }> {
  const adb = adbBin();
  try {
    const r = await execFileAsync(adb, ["exec-out", "screencap", "-p"], {
      encoding: "buffer",
      maxBuffer: 40 * 1024 * 1024,
      timeout: 60_000,
    });
    recordToolSuccess("adb");
    const buf = r.stdout as Buffer;
    const maxArt = policy.artifactMaxSizeMB * 1024 * 1024;
    if (buf.length > maxArt) {
      return { ok: false, message: `PNG가 artifactMaxSizeMB(${policy.artifactMaxSizeMB}) 초과` };
    }
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, buf);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    recordToolFailure("adb", policy, msg);
    logs.push(msg);
    return { ok: false, message: msg };
  }
}
