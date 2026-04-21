/**
 * Host Executor 초도 스모크:
 * output/ollama-host-smoke/ + sample.txt + PowerShell + screen_capture(primary) + screen_capture(android_emulator).
 * 에뮬이 없으면 `NEO_SKIP_EMULATOR_SCREEN_CAPTURE=1` 로 에뮬 창 크롭 단계만 건너뛸 수 있습니다.
 * node scripts/runWithNeoEnv.mjs src/smoke/runOllamaHostExecutorSmoke.ts
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runOllamaHostSmokeMini } from "../orchestration/ollamaHostSmokeMini.js";
import type { HostExecutionContext } from "../ollama/hostExecutionTypes.js";
import { getDefaultWorkspaceRoot } from "../workspaceRoot.js";
import { smokeConstitutionStep0 } from "./smokeConstitutionBootstrap.js";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dir, "..", "..");
const workspaceRoot = getDefaultWorkspaceRoot();
const outputRoot = path.join(backendRoot, "output");
const scratchDir = path.join(outputRoot, "ollama-host-smoke");

const ctx: HostExecutionContext = { workspaceRoot, backendRoot, outputRoot };

async function main() {
  await smokeConstitutionStep0("runOllamaHostExecutorSmoke");
  const mini = await runOllamaHostSmokeMini(ctx);

  process.stdout.write(
    JSON.stringify(
      {
        ok: mini.ok,
        summary: mini.summary,
        scratchDir,
        sampleFile: path.join(scratchDir, "sample.txt"),
        screenTestPrimaryPng: path.join(scratchDir, "screen-test-primary.png"),
        screenTestEmulatorPng: path.join(scratchDir, "screen-test-emulator.png"),
        screenCaptureEmulatorSkipped: mini.screenCaptureEmulatorSkipped,
        results: {
          fs_prepare: mini.results.fs_prepare,
          powershell: mini.results.powershell,
          screen_capture_primary: mini.results.screen_capture_primary,
          screen_capture_android_emulator: mini.results.screen_capture_android_emulator,
        },
      },
      null,
      2,
    ) + "\n",
  );
  process.exit(mini.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
