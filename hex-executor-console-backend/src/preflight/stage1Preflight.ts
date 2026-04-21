import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  adbBin,
  adbPickTargetSerialForPreflight,
} from "../runtime/androidDevice.js";
import { loadNeoPolicy, validateMutatingPath } from "../policy.js";

const execFileAsync = promisify(execFile);

/**
 * Stage 1 preflight — OPERATING-CONSTITUTION.md: **emulator-first**.
 * 실물 단말은 `NEO_UX_EXCEPTION_PHYSICAL_DEVICE=1` UX 예외 게이트에서만 기본 검사를 통과할 수 있다.
 */
export const Stage1PreflightCode = {
  ENV_FILE_MISSING: "ENV_FILE_MISSING",
  GEMINI_KEY_MISSING: "GEMINI_KEY_MISSING",
  PACKAGE_MISSING: "PACKAGE_MISSING",
  ADB_NOT_CONFIGURED: "ADB_NOT_CONFIGURED",
  EMULATOR_NOT_AVAILABLE: "EMULATOR_NOT_AVAILABLE",
  EMULATOR_BOOT_INCOMPLETE: "EMULATOR_BOOT_INCOMPLETE",
  APP_NOT_INSTALLED_ON_EMULATOR: "APP_NOT_INSTALLED_ON_EMULATOR",
  APP_FOREGROUND_NOT_MET: "APP_FOREGROUND_NOT_MET",
  SCREENSHOT_PIPELINE_UNAVAILABLE: "SCREENSHOT_PIPELINE_UNAVAILABLE",
  DELIVERY_NOT_WRITABLE: "DELIVERY_NOT_WRITABLE",
} as const;

export type Stage1PreflightCode = (typeof Stage1PreflightCode)[keyof typeof Stage1PreflightCode];

export type Stage1PreflightFailure = { code: Stage1PreflightCode; line: string };

export type Stage1PreflightResult =
  | { status: "PASS" }
  | { status: "FAIL"; failures: Stage1PreflightFailure[] };

export function getNeoBackendRootFromOutputRoot(outputRoot: string): string {
  return path.resolve(outputRoot, "..");
}

async function shellProp(
  adb: string,
  serial: string,
  name: string,
): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(adb, ["-s", serial, "shell", "getprop", name], {
      encoding: "utf8",
      timeout: 20_000,
    });
    return stdout.trim();
  } catch {
    return null;
  }
}

export async function runStage1MyPhoneCapturePreflight(opts: {
  backendRoot: string;
  outputRoot: string;
  workspaceRoot: string;
  packageName?: string | null;
}): Promise<Stage1PreflightResult> {
  const failures: Stage1PreflightFailure[] = [];

  const envPath = path.join(opts.backendRoot, ".env");
  try {
    await fs.access(envPath);
  } catch {
    failures.push({
      code: Stage1PreflightCode.ENV_FILE_MISSING,
      line: ".env 가 백엔드 루트에 없습니다. .env.example 을 복사해 채우세요.",
    });
  }

  if (!process.env.GEMINI_API_KEY?.trim()) {
    failures.push({
      code: Stage1PreflightCode.GEMINI_KEY_MISSING,
      line: "GEMINI_API_KEY 가 설정되지 않았습니다(process.env).",
    });
  }

  const pkg =
    typeof opts.packageName === "string" && opts.packageName.trim().length > 0
      ? opts.packageName.trim()
      : process.env.NEO_MYPHONECHECK_PACKAGE?.trim() ?? "";
  if (!pkg) {
    failures.push({
      code: Stage1PreflightCode.PACKAGE_MISSING,
      line: "NEO_MYPHONECHECK_PACKAGE(또는 action.args.package)가 비어 있습니다.",
    });
  }

  let adb: string;
  try {
    adb = adbBin();
  } catch (e) {
    failures.push({
      code: Stage1PreflightCode.ADB_NOT_CONFIGURED,
      line: `ANDROID_HOME 없음 또는 adb 경로 실패: ${e instanceof Error ? e.message : String(e)}`,
    });
    adb = "";
  }

  let serial: string | null = null;
  if (adb) {
    const pick = await adbPickTargetSerialForPreflight(adb);
    if (!pick.ok) {
      failures.push({
        code: Stage1PreflightCode.EMULATOR_NOT_AVAILABLE,
        line: pick.detail,
      });
    } else {
      serial = pick.serial;
      if (pick.mode === "ux_exception_physical") {
        process.stderr.write(
          "[preflight] UX exception: physical device serial in use (NEO_UX_EXCEPTION_PHYSICAL_DEVICE=1). See docs/OPERATING-CONSTITUTION.md §B.\n",
        );
      }
    }
  }

  if (adb && serial) {
    const boot = await shellProp(adb, serial, "sys.boot_completed");
    if (boot !== "1") {
      failures.push({
        code: Stage1PreflightCode.EMULATOR_BOOT_INCOMPLETE,
        line: `에뮬/대상 부팅 미완료(sys.boot_completed=${boot ?? "null"}) — adb wait-for-device 또는 Neo emulator ensure 후 재시도.`,
      });
    }
  }

  if (adb && serial && pkg) {
    try {
      const r = await execFileAsync(adb, ["-s", serial, "shell", "pm", "path", pkg], {
        encoding: "utf8",
        timeout: 30_000,
      });
      const out = (r.stdout || "").trim();
      if (!out.includes("package:")) {
        failures.push({
          code: Stage1PreflightCode.APP_NOT_INSTALLED_ON_EMULATOR,
          line: `에뮬/대상에 앱 미설치 또는 pm path 실패: ${out.slice(0, 200)}`,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      failures.push({
        code: Stage1PreflightCode.APP_NOT_INSTALLED_ON_EMULATOR,
        line: `pm path 실행 실패: ${msg.slice(0, 250)}`,
      });
    }
  }

  if (adb && serial && pkg) {
    try {
      const { stdout } = await execFileAsync(adb, ["-s", serial, "shell", "pidof", pkg], {
        encoding: "utf8",
        timeout: 15_000,
      });
      if (!stdout.trim()) {
        failures.push({
          code: Stage1PreflightCode.APP_FOREGROUND_NOT_MET,
          line: "앱 프로세스가 대상에 없습니다(pidof 빈 값). 에뮬에서 앱을 기동·포그라운드로 둔 뒤 COMMIT 하거나 Neo app_launch 경로를 먼저 실행하세요.",
        });
      }
    } catch (e) {
      failures.push({
        code: Stage1PreflightCode.APP_FOREGROUND_NOT_MET,
        line: `pidof 검사 실패: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  if (adb && serial) {
    try {
      const r = await execFileAsync(adb, ["-s", serial, "exec-out", "screencap", "-p"], {
        encoding: "buffer",
        maxBuffer: 6 * 1024 * 1024,
        timeout: 25_000,
      });
      const buf = r.stdout as Buffer;
      if (!buf || buf.length < 8 || buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) {
        failures.push({
          code: Stage1PreflightCode.SCREENSHOT_PIPELINE_UNAVAILABLE,
          line: "screencap 파이프라인이 PNG를 반환하지 않습니다.",
        });
      }
    } catch (e) {
      failures.push({
        code: Stage1PreflightCode.SCREENSHOT_PIPELINE_UNAVAILABLE,
        line: `screencap 실패: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  const delivery = path.join(opts.outputRoot, "control-plane-delivery");
  try {
    const policy = await loadNeoPolicy(opts.workspaceRoot);
    const vo = validateMutatingPath(delivery, policy);
    if (!vo.ok) {
      failures.push({
        code: Stage1PreflightCode.DELIVERY_NOT_WRITABLE,
        line: `control-plane-delivery 정책 경로 거부: ${vo.reason}`,
      });
    } else {
      await fs.mkdir(delivery, { recursive: true });
      const probe = path.join(delivery, ".neo-preflight-write-probe");
      await fs.writeFile(probe, "ok", "utf8");
      await fs.rm(probe, { force: true });
    }
  } catch (e) {
    failures.push({
      code: Stage1PreflightCode.DELIVERY_NOT_WRITABLE,
      line: `control-plane-delivery 쓰기 실패: ${e instanceof Error ? e.message : String(e)}`,
    });
  }

  if (failures.length > 0) return { status: "FAIL", failures };
  return { status: "PASS" };
}
