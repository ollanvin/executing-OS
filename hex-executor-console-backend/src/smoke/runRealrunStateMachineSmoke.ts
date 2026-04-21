/**
 * 리얼런 상태 머신 E2E 스모크 — 타임라인 순서 + realrun-report.json + AJV2020
 * node scripts/runWithNeoEnv.mjs src/smoke/runRealrunStateMachineSmoke.ts
 */
import fs from "node:fs/promises";
import path from "node:path";
import { runRealrunStateMachine } from "../realrun/runRealrunStateMachine.js";
import type { RealrunPhase } from "../realrun/realrunStates.js";
import { getDefaultWorkspaceRoot } from "../workspaceRoot.js";
import { smokeConstitutionStep0 } from "./smokeConstitutionBootstrap.js";

async function main() {
  await smokeConstitutionStep0("realrun_state_machine");
  const workspaceRoot = getDefaultWorkspaceRoot();
  const backendRoot = path.join(workspaceRoot, "hex-executor-console-backend");
  const goalText =
    "마이폰체크 리얼런 1회 수행: 에뮬레이터에서 앱 실행 → 유저 기준 주요 화면 스와이프/클릭 → 캡처 → 리얼런 결과보고서 생성 후 번들 저장 및 컨트롤 플레인 전송";

  const result = await runRealrunStateMachine({
    workspaceRoot,
    backendRoot,
    goalText,
    staticAnalysis: {
      backendRoot,
      scanRoots: [path.join(backendRoot, "src", "realrun")],
      maxFiles: 80,
    },
  });

  if (!result.ok) {
    throw new Error(result.error ?? "realrun state machine failed");
  }

  const expected: RealrunPhase[] = [
    "PLANNING",
    "PREFLIGHT",
    "EXECUTION",
    "CAPTURE",
    "AUDIT",
    "BUNDLE",
    "EXPORT",
  ];
  const tos = result.timeline.map((t) => t.to).filter((x): x is RealrunPhase => x !== "TERMINATED");
  if (tos.length !== expected.length) {
    throw new Error(`timeline length ${tos.length} !== ${expected.length}: ${JSON.stringify(tos)}`);
  }
  for (let i = 0; i < expected.length; i++) {
    if (tos[i] !== expected[i]) {
      throw new Error(`timeline mismatch at [${i}]: got ${tos[i]}, want ${expected[i]} (full: ${JSON.stringify(result.timeline)})`);
    }
  }

  await fs.access(result.reportPath);
  const exported = path.join(result.exportDir, "realrun-report.json");
  await fs.access(exported);

  const report = result.report as { run?: { runId?: string }; constitution?: unknown };
  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        runId: report.run?.runId,
        phasesVisited: tos.length,
        reportPath: result.reportPath,
        exportDir: result.exportDir,
        constitution: report.constitution,
      },
      null,
      2,
    ) + "\n",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
