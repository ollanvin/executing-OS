/**
 * Host Executor 프리플라이트 수준 스모크 (fs + PowerShell + primary + android_emulator 창).
 * `runOllamaHostExecutorSmoke.ts`와 동일 로직 — 오케스트레이터 단계에서 재사용.
 */
import path from "node:path";
import { executeHostTask } from "../ollama/hostExecutor.js";
import type { HostExecutionContext } from "../ollama/hostExecutionTypes.js";

export type OllamaHostSmokeMiniResult = {
  ok: boolean;
  summary: string;
  scratchDir: string;
  results: {
    fs_prepare: Awaited<ReturnType<typeof executeHostTask>>;
    powershell: Awaited<ReturnType<typeof executeHostTask>>;
    screen_capture_primary: Awaited<ReturnType<typeof executeHostTask>>;
    screen_capture_android_emulator: Awaited<ReturnType<typeof executeHostTask>>;
  };
  screenCaptureEmulatorSkipped: boolean;
};

export async function runOllamaHostSmokeMini(ctx: HostExecutionContext): Promise<OllamaHostSmokeMiniResult> {
  const scratchDir = path.join(ctx.outputRoot, "ollama-host-smoke");

  const prep = await executeHostTask(
    {
      kind: "fs_prepare",
      createDirs: [scratchDir],
      ensureFiles: [{ path: path.join(scratchDir, "sample.txt"), content: "ollama-host-smoke sample\n" }],
    },
    ctx,
  );

  const ps = await executeHostTask(
    {
      kind: "powershell",
      command: "Get-Location | Select-Object -ExpandProperty Path",
      cwd: scratchDir,
      timeoutMs: 30_000,
    },
    ctx,
  );

  const screenPrimary = path.join(scratchDir, "screen-test-primary.png");
  const capPrimary = await executeHostTask(
    {
      kind: "screen_capture",
      outputPath: screenPrimary,
      targetWindowHint: "primary_monitor",
    },
    ctx,
  );

  const screenEmulator = path.join(scratchDir, "screen-test-emulator.png");
  const capEmu = await executeHostTask(
    {
      kind: "screen_capture",
      outputPath: screenEmulator,
      targetWindowHint: "android_emulator",
    },
    ctx,
  );

  const skipEmu = process.env.NEO_SKIP_EMULATOR_SCREEN_CAPTURE?.trim() === "1";
  const emuEffective = skipEmu || capEmu.ok;
  const ok = prep.ok && ps.ok && capPrimary.ok && emuEffective;
  const summary = ok
    ? `output/ollama-host-smoke: fs_prepare + PowerShell + screen_capture(primary) + screen_capture(android_emulator)${skipEmu ? " (emulator step skipped by NEO_SKIP_EMULATOR_SCREEN_CAPTURE=1)" : ""}.`
    : `일부 단계 실패: fs_prepare=${prep.ok}, powershell=${ps.ok}, screen_capture_primary=${capPrimary.ok}, screen_capture_emulator=${capEmu.ok}${skipEmu ? " (skipped)" : ""}.`;

  return {
    ok,
    summary,
    scratchDir,
    screenCaptureEmulatorSkipped: skipEmu,
    results: {
      fs_prepare: prep,
      powershell: ps,
      screen_capture_primary: capPrimary,
      screen_capture_android_emulator: capEmu,
    },
  };
}
