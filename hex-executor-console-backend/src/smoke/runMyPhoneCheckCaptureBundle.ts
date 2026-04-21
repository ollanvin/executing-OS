/**
 * Stage 1: 고정 고수준 오더 → preflight PASS 시 캡처 번들 생성 (mutation pipeline / 감사 COMMIT 미사용).
 * 실행: node scripts/runWithNeoEnv.mjs src/smoke/runMyPhoneCheckCaptureBundle.ts
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { finalizeMyPhoneCheckCaptureBundle } from "../orchestration/myphonecheckBundleFinalize.js";
import {
  getNeoBackendRootFromOutputRoot,
  runStage1MyPhoneCapturePreflight,
} from "../preflight/stage1Preflight.js";
import { executeMyPhoneCheckCapturePackageWorkflow } from "../workflow/myphonecheckCapturePackageWorkflow.js";
import { getDefaultWorkspaceRoot } from "../workspaceRoot.js";
import { smokeConstitutionStep0 } from "./smokeConstitutionBootstrap.js";

const USER_GOAL =
  "마이폰첵을 에뮬레이터로 온보드 화면 및 모듈 앱 화면을 사진 찍어서 컨트롤플레인에게 전달할 파일로 만들어줘";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dir, "..", "..");
const outputRoot = path.join(backendRoot, "output");

async function main() {
  await smokeConstitutionStep0("runMyPhoneCheckCaptureBundle");
  const ws = getDefaultWorkspaceRoot();
  const pkg = process.env.NEO_MYPHONECHECK_PACKAGE?.trim() ?? null;

  const pf = await runStage1MyPhoneCapturePreflight({
    backendRoot: getNeoBackendRootFromOutputRoot(outputRoot),
    outputRoot,
    workspaceRoot: ws,
    packageName: pkg,
  });

  if (pf.status === "FAIL") {
    process.stdout.write(
      JSON.stringify({ ok: false, stage: "preflight", stage1Preflight: pf, bundle: null }, null, 2) + "\n",
    );
    process.exit(1);
  }

  if (!pkg) {
    process.stdout.write(JSON.stringify({ ok: false, error: "NEO_MYPHONECHECK_PACKAGE required" }, null, 2) + "\n");
    process.exit(1);
  }

  await fs.mkdir(path.join(ws, "runs"), { recursive: true });
  const runsDir = path.join(ws, "runs");

  const result = await executeMyPhoneCheckCapturePackageWorkflow(
    {
      workspaceRoot: ws,
      outputRoot,
      runsDir,
      approved: true,
      approvalPreviewHash: null,
    },
    [],
    { packageName: pkg, userGoalText: USER_GOAL, scenarioId: null },
  );

  const fin = await finalizeMyPhoneCheckCaptureBundle({
    result,
    outputRoot,
    workspaceRoot: ws,
    packageName: pkg,
    userGoalText: USER_GOAL,
    writeReport: true,
  });

  if (fin.reportPath) {
    process.stderr.write(`[code-worker-report] ${fin.reportPath}\n`);
  }

  process.stdout.write(
    JSON.stringify(
      {
        ok: result.ok,
        summary: fin.summaryOut,
        workflowTrace: result.workflowTrace,
        hostExecutionTrace: result.hostExecutionTrace,
        sandboxBridgeJob: result.sandboxBridgeJob,
        executionTargetsUsed: result.executionTargetsUsed,
        dispatchAudit: result.dispatchAudit,
        screenCaptureSummary: fin.screenCap ?? null,
        emulatorScreenCaptureTrace: result.emulatorScreenCaptureTrace ?? null,
        e2eVerification: fin.e2eVerification,
        bundlePath: fin.bundlePath,
        captureCounts: {
          onboarding: fin.captureCounts.onboarding,
          module: fin.captureCounts.module,
          scenario: fin.captureCounts.scenario,
          auto: fin.captureCounts.auto,
          total: fin.captureCounts.total,
        },
        manifestExists: fin.bundlePath
          ? await fs
              .access(path.join(fin.bundlePath, "manifest.json"))
              .then(() => true)
              .catch(() => false)
          : false,
        logsTail: (result.logs ?? []).slice(-40),
      },
      null,
      2,
    ) + "\n",
  );

  const exitOk = result.ok && fin.e2eVerification.ok;
  process.exit(exitOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
