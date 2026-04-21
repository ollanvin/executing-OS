/**
 * 오케스트레이터 스모크: goalId=myphonecheck_capture_bundle_run 전체 플로우.
 * node scripts/runWithNeoEnv.mjs src/smoke/runMyphonecheckOrchestratorSmoke.ts
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getNeoBackendRootFromOutputRoot } from "../preflight/stage1Preflight.js";
import { buildMyphonecheckCaptureBundleRunPlan } from "../workflow/goals/myphonecheckCaptureGoal.js";
import { runOrchestratedPlan } from "../workflow/orchestratorEngine.js";
import { getDefaultWorkspaceRoot } from "../workspaceRoot.js";
import { smokeConstitutionStep0 } from "./smokeConstitutionBootstrap.js";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dir, "..", "..");
const outputRoot = path.join(backendRoot, "output");

async function main() {
  await smokeConstitutionStep0("runMyphonecheckOrchestratorSmoke");
  const ws = getDefaultWorkspaceRoot();
  const pkg = process.env.NEO_MYPHONECHECK_PACKAGE?.trim() ?? null;
  if (!pkg) {
    process.stdout.write(
      JSON.stringify({ ok: false, error: "NEO_MYPHONECHECK_PACKAGE required" }, null, 2) + "\n",
    );
    process.exit(1);
  }

  const userGoal =
    process.env.NEO_ORCH_USER_GOAL?.trim() ??
    "마이폰첵 UX 캡처 번들 다시 만들어줘 (오케스트레이터 스모크)";

  const plan = buildMyphonecheckCaptureBundleRunPlan();
  const orch = await runOrchestratedPlan(plan, {
    workspaceRoot: ws,
    outputRoot,
    backendRoot: getNeoBackendRootFromOutputRoot(outputRoot),
    runsDir: path.join(ws, "runs"),
    packageName: pkg,
    userGoalText: userGoal,
    scenarioId: null,
    writeUxReport: true,
  });

  process.stdout.write(
    JSON.stringify(
      {
        ok: orch.ok,
        goalId: orch.goalId,
        startedAt: orch.startedAt,
        finishedAt: orch.finishedAt,
        highLevelSummaryKo: orch.highLevelSummaryKo,
        bundlePath: orch.bundlePath ?? null,
        reportPath: orch.reportPath ?? null,
        summaryFields: orch.summaryFields,
        stepResults: orch.stepResults,
        e2eVerification: orch.e2eVerification ?? null,
      },
      null,
      2,
    ) + "\n",
  );

  process.stderr.write("\n--- highLevelSummaryKo ---\n" + orch.highLevelSummaryKo + "\n");

  process.exit(orch.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
