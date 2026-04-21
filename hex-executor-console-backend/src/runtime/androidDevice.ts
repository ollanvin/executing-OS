import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { recordToolFailure, recordToolSuccess } from "../toolCircuitBreaker.js";
import type { NeoPolicy } from "../policy.js";
import { loadPreferredAvdHints, pickAvdToLaunch } from "./avdResolver.js";

const execFileAsync = promisify(execFile);

export function adbBin(): string {
  const home = process.env.ANDROID_HOME;
  if (!home) throw new Error("ANDROID_HOME 이 설정되어 있지 않습니다.");
  return path.join(home, "platform-tools", "adb.exe");
}

export function emulatorBin(): string {
  const home = process.env.ANDROID_HOME;
  if (!home) throw new Error("ANDROID_HOME 이 설정되어 있지 않습니다.");
  return path.join(home, "emulator", "emulator.exe");
}

/** `adb devices` 에서 `device` 상태(온라인) 기기가 하나라도 있는지 */
export async function adbHasOnlineDevice(adb: string): Promise<{ ok: true } | { ok: false; devicesOutput: string }> {
  try {
    const { stdout } = await execFileAsync(adb, ["devices"], {
      encoding: "utf8",
      timeout: 20_000,
    });
    const lines = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const online = lines.filter((l) => !l.startsWith("List of devices") && /\tdevice\s*$/.test(l));
    if (online.length > 0) return { ok: true };
    return { ok: false, devicesOutput: stdout.trim() || "(adb devices 출력 없음)" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, devicesOutput: msg };
  }
}

/** 온라인 기기 시리얼 목록 (`device` 상태만). */
export async function adbListOnlineSerials(adb: string): Promise<string[]> {
  const { stdout } = await execFileAsync(adb, ["devices"], {
    encoding: "utf8",
    timeout: 20_000,
  });
  const lines = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const serials: string[] = [];
  for (const line of lines) {
    if (line.startsWith("List of devices")) continue;
    const m = line.match(/^(\S+)\tdevice\s*$/);
    if (m) serials.push(m[1]!);
  }
  return serials;
}

/** 에뮬레이터/가상 타깃 여부 — 실물 단말 기본 루트와 구분(운영 헌법: emulator-first). */
export async function adbSerialLooksLikeEmulator(adb: string, serial: string): Promise<boolean> {
  if (serial.startsWith("emulator-")) return true;
  try {
    const { stdout } = await execFileAsync(adb, ["-s", serial, "shell", "getprop", "ro.kernel.qemu"], {
      encoding: "utf8",
      timeout: 15_000,
    });
    return stdout.trim() === "1";
  } catch {
    return false;
  }
}

/**
 * 기본 루트: 에뮬/가상 타깃 시리얼을 고른다.
 * `NEO_UX_EXCEPTION_PHYSICAL_DEVICE=1` 이면 실물 단말 1대를 UX 예외로 허용(헌법 §UX 예외 게이트).
 */
export async function adbPickTargetSerialForPreflight(adb: string): Promise<
  | { ok: true; serial: string; mode: "emulator" | "ux_exception_physical" }
  | { ok: false; detail: string }
> {
  const serials = await adbListOnlineSerials(adb);
  if (serials.length === 0) {
    return { ok: false, detail: "온라인 adb 대상 없음 — 에뮬레이터를 기동하세요." };
  }
  for (const s of serials) {
    if (await adbSerialLooksLikeEmulator(adb, s)) {
      return { ok: true, serial: s, mode: "emulator" };
    }
  }
  if ((process.env.NEO_UX_EXCEPTION_PHYSICAL_DEVICE ?? "").trim() === "1") {
    return { ok: true, serial: serials[0]!, mode: "ux_exception_physical" };
  }
  return {
    ok: false,
    detail:
      "연결된 기기가 에뮬레이터/가상 환경으로 보이지 않습니다. 기본 루트는 emulator-first 입니다. 실물 단말은 NEO_UX_EXCEPTION_PHYSICAL_DEVICE=1 UX 예외 게이트에서만 허용됩니다.",
  };
}

export type EnsureAndroidDeviceResult =
  | { ok: true; mode: "already_online" | "started_emulator"; avd?: string; adb: string }
  | { ok: false; reason: string };

/**
 * Neo recoverable 경로: 온라인 기기가 없으면 메타데이터·설치 목록으로 AVD를 고른 뒤 emulator를 띄우고 adb ready까지 대기합니다.
 */
export async function ensureAndroidDeviceOnline(opts: {
  workspaceRoot: string;
  logs: string[];
  policy: NeoPolicy;
}): Promise<EnsureAndroidDeviceResult> {
  const { workspaceRoot, logs, policy } = opts;
  const adb = adbBin();
  const emu = emulatorBin();

  const pre = await adbHasOnlineDevice(adb);
  if (pre.ok) {
    logs.push("[neo-device] adb 온라인 기기 있음 — 추가 에뮬 기동 생략");
    return { ok: true, mode: "already_online", adb };
  }

  logs.push(`[neo-device] 온라인 기기 없음 — 복구: AVD 선택 후 emulator 기동\n${pre.devicesOutput}`);

  let listOut: string;
  try {
    const r = await execFileAsync(emu, ["-list-avds"], {
      encoding: "utf8",
      timeout: 30_000,
    });
    listOut = r.stdout;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    recordToolFailure("emulator", policy, msg);
    return { ok: false, reason: `에뮬레이터 목록 조회 실패: ${msg}` };
  }

  const installed = listOut
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  logs.push(`[neo-device] 설치된 AVD: ${installed.join(", ") || "(없음)"}`);

  const hints = await loadPreferredAvdHints(workspaceRoot);
  if (hints.length) logs.push(`[neo-device] 선호 힌트: ${hints.join(", ")}`);

  const preferred = pickAvdToLaunch(hints, installed);
  if (!preferred) {
    recordToolFailure("emulator", policy, "no AVD");
    return {
      ok: false,
      reason:
        "사용 가능한 AVD가 없습니다. Android Studio에서 AVD를 생성하거나 `.neo-emulator.json`에 `preferredAvds`를 설정하세요.",
    };
  }

  logs.push(`[neo-device] 기동 AVD: ${preferred}`);
  const child = spawn(emu, ["-avd", preferred], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();

  try {
    await execFileAsync(adb, ["wait-for-device"], { timeout: 180_000 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logs.push(`[neo-device] wait-for-device: ${msg}`);
    recordToolFailure("adb", policy, msg);
    return {
      ok: false,
      reason: `에뮬레이터 기동 후 adb 연결 대기 실패 (${preferred}): ${msg}`,
    };
  }

  const { stdout: devOut } = await execFileAsync(adb, ["devices", "-l"], {
    encoding: "utf8",
    timeout: 20_000,
  });
  logs.push(...devOut.split(/\r?\n/).filter(Boolean));

  recordToolSuccess("emulator");
  recordToolSuccess("adb");

  return { ok: true, mode: "started_emulator", avd: preferred, adb };
}

export function friendlyAdbScreencapError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("no devices/emulators") || lower.includes("no devices")) {
    return "adb에 연결된 기기 없음 (screencap 거부)";
  }
  if (lower.includes("unauthorized")) {
    return "기기가 adb 인증 대기(unauthorized) 상태입니다.";
  }
  if (lower.includes("offline")) {
    return "기기가 offline 상태입니다.";
  }
  const m = raw.match(/error:\s*(.+)/i);
  if (m) return m[1]!.trim();
  return raw.replace(/^Command failed:\s*/i, "").trim().slice(0, 400);
}

export function isNoDeviceScreencapError(raw: string): boolean {
  const lower = raw.toLowerCase();
  return lower.includes("no devices/emulators") || lower.includes("no devices");
}
