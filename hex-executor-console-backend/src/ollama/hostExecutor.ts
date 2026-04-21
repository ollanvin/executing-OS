/**
 * 호스트 로컬 실행 — PowerShell / bash / fs / adb / screen_capture(에뮬·시뮬 화면 캡처).
 * fs_prepare 및 셸 cwd는 workspaceRoot 하위만 허용 (초도작업 안전 범위).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { assertHostExecutorConstitution } from "../constitution/workerConstitutionGate.js";
import { isPathUnderRoot } from "../policy.js";
import type {
  HostExecutionContext,
  HostExecutionResult,
  HostExecutionTask,
  ScreenCaptureDetails,
} from "./hostExecutionTypes.js";

const HOST_WINDOWS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "host", "windows");
const PS_EMULATOR_CAPTURE = path.join(HOST_WINDOWS_DIR, "androidEmulatorWindowCapture.ps1");

const execFileAsync = promisify(execFile);
const TAIL_LINES = 20;

function tailLines(text: string, n: number): string[] {
  const lines = text.split(/\r?\n/);
  return lines.slice(Math.max(0, lines.length - n));
}

/** fs·작업 디렉터리는 워크스페이스 루트 안에서만 (삭제/덮어쓰기 포함). */
function assertWorkspacePath(filePath: string, ctx: HostExecutionContext): { ok: true } | { ok: false; reason: string } {
  const resolved = path.resolve(filePath);
  const root = path.resolve(ctx.workspaceRoot);
  if (!isPathUnderRoot(resolved, root)) {
    return {
      ok: false,
      reason: `경로가 workspaceRoot 밖입니다: ${resolved}`,
    };
  }
  return { ok: true };
}

/** screen_capture 출력 PNG — workspaceRoot 또는 outputRoot(백엔드 output) 하위만 허용. */
function assertScreenCaptureOutputPath(
  filePath: string,
  ctx: HostExecutionContext,
): { ok: true } | { ok: false; reason: string } {
  const resolved = path.resolve(filePath);
  const w = path.resolve(ctx.workspaceRoot);
  const o = path.resolve(ctx.outputRoot);
  if (isPathUnderRoot(resolved, w) || isPathUnderRoot(resolved, o)) {
    return { ok: true };
  }
  return {
    ok: false,
    reason: `screen_capture outputPath는 workspaceRoot 또는 outputRoot 하위여야 합니다: ${resolved}`,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

async function runShellCapture(
  cmd: string,
  args: string[],
  cwd: string | undefined,
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  try {
    const r = await execFileAsync(cmd, args, {
      cwd,
      timeout: timeoutMs,
      encoding: "utf8",
      maxBuffer: 12 * 1024 * 1024,
    });
    return { stdout: r.stdout ?? "", stderr: r.stderr ?? "", code: 0 };
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: string | number | null };
    return {
      stdout: typeof err.stdout === "string" ? err.stdout : "",
      stderr: typeof err.stderr === "string" ? err.stderr : err.message ?? String(e),
      code: typeof err.code === "number" ? err.code : 1,
    };
  }
}

export async function executeHostTask(
  task: HostExecutionTask,
  ctx: HostExecutionContext,
): Promise<HostExecutionResult> {
  const startedAt = nowIso();
  const base = (): Omit<HostExecutionResult, "finishedAt"> => ({
    ok: false,
    taskKind: task.kind,
    startedAt,
    summary: "",
  });

  const gate = await assertHostExecutorConstitution(task, ctx);
  if (!gate.ok) {
    return {
      ...base(),
      finishedAt: nowIso(),
      summary: gate.reason,
      error: gate.reason,
    };
  }

  try {
    if (task.kind === "powershell") {
      const timeoutMs = task.timeoutMs ?? 120_000;
      const cwd = task.cwd ? path.resolve(task.cwd) : undefined;
      if (cwd) {
        const a = assertWorkspacePath(cwd, ctx);
        if (!a.ok) {
          return { ...base(), finishedAt: nowIso(), summary: a.reason, error: a.reason };
        }
      }
      const cmd = process.platform === "win32" ? "powershell.exe" : "pwsh";
      const args =
        process.platform === "win32"
          ? ["-NoProfile", "-NonInteractive", "-Command", task.command]
          : ["-NoProfile", "-Command", task.command];
      const r = await runShellCapture(cmd, args, cwd, timeoutMs);
      const ok = r.code === 0;
      return {
        ok,
        taskKind: "powershell",
        startedAt,
        finishedAt: nowIso(),
        stdoutTail: tailLines(r.stdout, TAIL_LINES),
        stderrTail: tailLines(r.stderr, TAIL_LINES),
        summary: ok
          ? "PowerShell 로컬 명령이 성공적으로 끝났습니다 (종료 코드 0)."
          : `PowerShell 실패 (code=${r.code}). stderr 참고.`,
        error: ok ? undefined : r.stderr.slice(0, 500) || `exit ${r.code}`,
      };
    }

    if (task.kind === "bash") {
      const timeoutMs = task.timeoutMs ?? 120_000;
      const cwd = task.cwd ? path.resolve(task.cwd) : undefined;
      if (cwd) {
        const a = assertWorkspacePath(cwd, ctx);
        if (!a.ok) {
          return { ...base(), finishedAt: nowIso(), summary: a.reason, error: a.reason };
        }
      }
      const bashCmd = process.platform === "win32" ? "bash.exe" : "bash";
      const r = await runShellCapture(bashCmd, ["-lc", task.command], cwd, timeoutMs);
      const ok = r.code === 0;
      return {
        ok,
        taskKind: "bash",
        startedAt,
        finishedAt: nowIso(),
        stdoutTail: tailLines(r.stdout, TAIL_LINES),
        stderrTail: tailLines(r.stderr, TAIL_LINES),
        summary: ok ? "bash -lc 명령이 종료 코드 0으로 완료되었습니다." : `bash 실패 (code=${r.code}).`,
        error: ok ? undefined : r.stderr.slice(0, 500) || `exit ${r.code}`,
      };
    }

    if (task.kind === "fs_prepare") {
      const ops =
        (task.createDirs?.length ?? 0) +
        (task.ensureFiles?.length ?? 0) +
        (task.deletePaths?.length ?? 0);
      if (ops === 0) {
        return {
          ok: true,
          taskKind: "fs_prepare",
          startedAt,
          finishedAt: nowIso(),
          summary: "fs_prepare: 수행할 항목이 없습니다.",
        };
      }
      const changed: string[] = [];
      for (const d of task.createDirs ?? []) {
        const p = path.resolve(d);
        const a = assertWorkspacePath(p, ctx);
        if (!a.ok) {
          return { ...base(), finishedAt: nowIso(), summary: a.reason, error: a.reason, changedPaths: changed };
        }
        await fs.mkdir(p, { recursive: true });
        changed.push(p);
      }
      for (const f of task.ensureFiles ?? []) {
        const p = path.resolve(f.path);
        const a = assertWorkspacePath(p, ctx);
        if (!a.ok) {
          return { ...base(), finishedAt: nowIso(), summary: a.reason, error: a.reason, changedPaths: changed };
        }
        await fs.mkdir(path.dirname(p), { recursive: true });
        await fs.writeFile(p, f.content, "utf8");
        changed.push(p);
      }
      for (const d of task.deletePaths ?? []) {
        const p = path.resolve(d);
        const a = assertWorkspacePath(p, ctx);
        if (!a.ok) {
          return { ...base(), finishedAt: nowIso(), summary: a.reason, error: a.reason, changedPaths: changed };
        }
        await fs.rm(p, { recursive: true, force: true });
        changed.push(`(deleted) ${p}`);
      }
      return {
        ok: true,
        taskKind: "fs_prepare",
        startedAt,
        finishedAt: nowIso(),
        changedPaths: changed,
        summary: `워크스페이스 안에 디렉터리·파일을 준비했습니다 (${changed.length}개 경로).`,
      };
    }

    if (task.kind === "program_install") {
      return {
        ok: false,
        taskKind: "program_install",
        startedAt,
        finishedAt: nowIso(),
        summary:
          `program_install은 아직 스텁입니다 (hint=${task.installerHint}). winget/choco 수동 설치를 권장합니다.`,
        error: "stub_not_implemented",
      };
    }

    if (task.kind === "screen_capture") {
      const absOut = path.resolve(task.outputPath);
      const a = assertScreenCaptureOutputPath(absOut, ctx);
      if (!a.ok) {
        return {
          ...base(),
          taskKind: "screen_capture",
          finishedAt: nowIso(),
          summary: a.reason,
          error: a.reason,
        };
      }
      await fs.mkdir(path.dirname(absOut), { recursive: true });

      const hintRaw = task.targetWindowHint?.trim() ?? "";
      const hintNorm = hintRaw.toLowerCase().replace(/\s+/g, "_");
      const hint = hintRaw ? ` targetWindowHint=${hintRaw}` : "";
      const regionNote = task.regionHint ? " regionHint=ignored_in_v1" : "";

      if (process.platform !== "win32") {
        return {
          ok: false,
          taskKind: "screen_capture",
          startedAt,
          finishedAt: nowIso(),
          summary: `screen_capture: android_emulator 창 크롭은 현재 Windows만 지원합니다.${hint}${regionNote}`,
          error: "unsupported_platform",
        };
      }

      /**
       * Windows DPI: CopyFromScreen은 일반적으로 물리 픽셀 기준.
       * 125%/150% 배율에서 창 rect와 불일치가 날 수 있음 — 후속 Iteration에서 Per-Monitor DPI 대응.
       */

      const isAndroidEmulatorHint =
        hintNorm === "android_emulator" || hintNorm === "android_emulator_window" || hintRaw === "Android Emulator";

      if (isAndroidEmulatorHint) {
        const r = await runShellCapture(
          "powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            PS_EMULATOR_CAPTURE,
            "-OutputPath",
            absOut,
          ],
          undefined,
          120_000,
        );
        let fileOk = false;
        try {
          const st = await fs.stat(absOut);
          fileOk = st.isFile() && st.size > 0;
        } catch {
          fileOk = false;
        }
        const notFound = r.code === 2 || /NEO_EMULATOR_WINDOW_NOT_FOUND/i.test(r.stderr + r.stdout);
        if (notFound) {
          const summary =
            `emulator window not found: title에 'Android Emulator'가 포함된 표시 창이 없습니다.${hint} (stderr: ${r.stderr.slice(0, 300)})`;
          return {
            ok: false,
            taskKind: "screen_capture",
            startedAt,
            finishedAt: nowIso(),
            stdoutTail: tailLines(r.stdout, TAIL_LINES),
            stderrTail: tailLines(r.stderr, TAIL_LINES),
            summary,
            error: "emulator_window_not_found",
            screenCaptureDetails: {
              rect: { x: 0, y: 0, width: 0, height: 0 },
              captureBackend: "host_window",
              emulatorWindowFound: false,
            },
          };
        }
        const shellOk = r.code === 0;
        const ok = shellOk && fileOk;
        let details: ScreenCaptureDetails | undefined;
        const metaLine = r.stdout.split(/\r?\n/).find((l) => l.startsWith("NEO_SCREEN_CAPTURE_META_JSON:"));
        if (metaLine) {
          try {
            const j = JSON.parse(metaLine.slice("NEO_SCREEN_CAPTURE_META_JSON:".length)) as {
              x: number;
              y: number;
              width: number;
              height: number;
              captureBackend?: string;
              emulatorWindowFound?: boolean;
            };
            details = {
              rect: { x: j.x, y: j.y, width: j.width, height: j.height },
              captureBackend: "host_window",
              emulatorWindowFound: j.emulatorWindowFound !== false,
            };
          } catch {
            details = undefined;
          }
        }
        const summary = ok
          ? `Emulator/Simulator Screen Capture: Android Emulator 창 영역만 PNG로 저장 (${absOut}). rect=${details ? `${details.rect.width}x${details.rect.height}` : "?"}.${hint}`
          : `screen_capture 실패: powershell code=${r.code}, fileOk=${fileOk}.${hint} stderr=${r.stderr.slice(0, 200)}`;
        return {
          ok,
          taskKind: "screen_capture",
          startedAt,
          finishedAt: nowIso(),
          stdoutTail: tailLines(r.stdout, TAIL_LINES),
          stderrTail: tailLines(r.stderr, TAIL_LINES),
          changedPaths: ok ? [absOut] : undefined,
          summary,
          error: ok ? undefined : summary,
          screenCaptureDetails: details,
        };
      }

      /* primary_monitor / 기타: 전체 화면 (스모크·레거시) */
      const psPath = absOut.replace(/'/g, "''");
      const psCommand =
        "Add-Type -AssemblyName System.Windows.Forms,System.Drawing; " +
        "$b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; " +
        "$bmp=New-Object System.Drawing.Bitmap $b.Width,$b.Height; " +
        "$g=[System.Drawing.Graphics]::FromImage($bmp); " +
        "$g.CopyFromScreen($b.Location,[System.Drawing.Point]::Empty,$b.Size); " +
        `$bmp.Save('${psPath}',[System.Drawing.Imaging.ImageFormat]::Png); ` +
        "$g.Dispose();$bmp.Dispose()";
      const r = await runShellCapture(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Command", psCommand],
        undefined,
        90_000,
      );
      let fileOk = false;
      try {
        const st = await fs.stat(absOut);
        fileOk = st.isFile() && st.size > 0;
      } catch {
        fileOk = false;
      }
      const shellOk = r.code === 0;
      const ok = shellOk && fileOk;
      const summary = ok
        ? `Emulator/Simulator Screen Capture: Windows primary monitor 전체 PNG (${absOut}).${hint}${regionNote}`
        : `screen_capture 실패: powershell code=${r.code}, fileOk=${fileOk}.${hint} stderr=${r.stderr.slice(0, 200)}`;
      return {
        ok,
        taskKind: "screen_capture",
        startedAt,
        finishedAt: nowIso(),
        stdoutTail: tailLines(r.stdout, TAIL_LINES),
        stderrTail: tailLines(r.stderr, TAIL_LINES),
        changedPaths: ok ? [absOut] : undefined,
        summary,
        error: ok ? undefined : summary,
      };
    }

    if (task.kind === "adb") {
      const timeoutMs = task.timeoutMs ?? 90_000;
      const adbBin = process.env.ADB_PATH?.trim() || "adb";
      const r = await runShellCapture(adbBin, task.args, undefined, timeoutMs);
      const ok = r.code === 0;
      return {
        ok,
        taskKind: "adb",
        startedAt,
        finishedAt: nowIso(),
        stdoutTail: tailLines(r.stdout, TAIL_LINES),
        stderrTail: tailLines(r.stderr, TAIL_LINES),
        summary: ok ? "adb 명령이 종료 코드 0으로 완료되었습니다." : `adb 실패 (code=${r.code}).`,
        error: ok ? undefined : r.stderr.slice(0, 500) || `exit ${r.code}`,
      };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ...base(),
      finishedAt: nowIso(),
      summary: `실행 예외: ${msg.slice(0, 200)}`,
      error: msg,
    };
  }

  return { ...base(), finishedAt: nowIso(), summary: "내부 오류: 처리되지 않은 작업 종류입니다." };
}
