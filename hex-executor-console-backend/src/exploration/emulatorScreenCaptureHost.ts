/**
 * 에뮬레이터/시뮬레이터 화면 캡처 — Host Executor `screen_capture` task 호출.
 * Neo는 픽셀 버퍼를 직접 다루지 않고, 호스트 OS에서 PNG를 생성한다.
 */
import path from "node:path";
import { executeHostTask } from "../ollama/hostExecutor.js";
import type { HostExecutionResult } from "../ollama/hostExecutionTypes.js";
import type { NeoPolicy } from "../policy.js";
import { validateArtifactPath } from "../policy.js";

export type EmulatorScreenCapturePhase = "scenario" | "auto_explore";

/** 후속: adb_screencap / 시뮬 내장 캡처로 교체 가능 */
export type EmulatorCaptureBackend = "host_window" | "adb_screencap" | "emulator_builtin";

export type EmulatorScreenCaptureEvent = {
  phase: EmulatorScreenCapturePhase;
  /** 전체 ScreenId (hex) — diff/버전 비교 키 */
  screenId: string;
  /** 파일명·표시용 짧은 ID (hex 앞 8자 권장) */
  screenIdShort: string;
  relativePath: string;
  filePath?: string;
  ok: boolean;
  summary: string;
  taskKind: "screen_capture";
  captureBackend: EmulatorCaptureBackend;
  /** host_window + android_emulator 성공 시 에뮬 창 스크린 좌표; 실패 시 null */
  rect: { x: number; y: number; width: number; height: number } | null;
};

export type EmulatorScreenCaptureOptions = {
  /** 기본 MyPhoneCheck 경로: 호스트에서 Android Emulator 창만 크롭 */
  captureBackend?: EmulatorCaptureBackend;
};

export async function captureEmulatorScreenToPng(
  opts: {
    absolutePngPath: string;
    workspaceRoot: string;
    outputRoot: string;
    backendRoot: string;
    policy: NeoPolicy;
    /** Host Executor — `android_emulator` 권장 (창 매칭 + 크롭) */
    targetWindowHint?: string;
    phase: EmulatorScreenCapturePhase;
    screenId: string;
    screenIdShort: string;
    bundleRoot: string;
    captureBackend?: EmulatorCaptureBackend;
  },
): Promise<{ ok: boolean; message: string; hostResult: HostExecutionResult; event: EmulatorScreenCaptureEvent }> {
  const backend = opts.captureBackend ?? "host_window";
  const va = validateArtifactPath(opts.absolutePngPath, opts.policy);
  const rel = path.relative(opts.bundleRoot, opts.absolutePngPath).split(path.sep).join("/");
  if (!va.ok) {
    const hr: HostExecutionResult = {
      ok: false,
      taskKind: "screen_capture",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      summary: va.reason,
      error: va.reason,
    };
    return {
      ok: false,
      message: va.reason,
      hostResult: hr,
      event: {
        phase: opts.phase,
        screenId: opts.screenId,
        screenIdShort: opts.screenIdShort,
        relativePath: rel,
        filePath: opts.absolutePngPath,
        ok: false,
        summary: va.reason,
        taskKind: "screen_capture",
        captureBackend: backend,
        rect: null,
      },
    };
  }

  const ctx = {
    workspaceRoot: opts.workspaceRoot,
    backendRoot: opts.backendRoot,
    outputRoot: opts.outputRoot,
  };
  const hr = await executeHostTask(
    {
      kind: "screen_capture",
      outputPath: opts.absolutePngPath,
      targetWindowHint: opts.targetWindowHint ?? "android_emulator",
    },
    ctx,
  );

  const rect =
    hr.screenCaptureDetails?.rect && hr.screenCaptureDetails.rect.width > 0 && hr.screenCaptureDetails.rect.height > 0
      ? hr.screenCaptureDetails.rect
      : null;
  const capBackend = (hr.screenCaptureDetails?.captureBackend ?? backend) as EmulatorCaptureBackend;

  return {
    ok: hr.ok,
    message: hr.summary,
    hostResult: hr,
    event: {
      phase: opts.phase,
      screenId: opts.screenId,
      screenIdShort: opts.screenIdShort,
      relativePath: rel,
      filePath: opts.absolutePngPath,
      ok: hr.ok,
      summary: hr.summary,
      taskKind: "screen_capture",
      captureBackend: capBackend,
      rect,
    },
  };
}
