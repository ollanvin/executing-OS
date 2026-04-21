/**
 * Windows에서 Android Emulator 창 탐지 (Win32 GetWindowRect + 프로세스 MainWindowTitle).
 * 실제 캡처는 androidEmulatorWindowCapture.ps1 과 동일한 휴리스틱을 공유한다.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

export type EmulatorWindowRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * 제목에 "Android Emulator"가 포함되고 충분히 큰 창 중 면적 최대 1개.
 * 에뮬이 없으면 null.
 */
export async function findEmulatorWindow(_hint?: string): Promise<{ hwnd: number; rect: EmulatorWindowRect } | null> {
  if (process.platform !== "win32") {
    return null;
  }
  const ps1 = path.join(SCRIPT_DIR, "findAndroidEmulatorWindow.ps1");
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", ps1],
      { encoding: "utf8", timeout: 45_000, maxBuffer: 2 * 1024 * 1024 },
    );
    const line = stdout.trim().split(/\r?\n/).find((l) => l.startsWith("NEO_EMULATOR_RECT_JSON:"));
    if (!line) return null;
    const json = line.slice("NEO_EMULATOR_RECT_JSON:".length).trim();
    if (json === "null") return null;
    const o = JSON.parse(json) as { x: number; y: number; width: number; height: number; hwnd: number };
    if (typeof o.width !== "number" || o.width < 80 || typeof o.height !== "number" || o.height < 80) {
      return null;
    }
    return {
      hwnd: typeof o.hwnd === "number" ? o.hwnd : 0,
      rect: { x: o.x, y: o.y, width: o.width, height: o.height },
    };
  } catch {
    return null;
  }
}
