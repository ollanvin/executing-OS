/**
 * Stage 1: 동일 고수준 오더에 대한 smoke 요약 + dry-run(파싱·planPreview·플래너) 요약.
 * COMMIT/실디바이스/ADB 실행 없음.
 *
 * 실행: npx tsx src/smoke/stage1MyPhoneCaptureOrderVerification.ts
 * (.env 선로딩은 report와 동일: NEO_LOAD_DOTENV=1)
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dir, "..", "..");

if ((process.env.NEO_LOAD_DOTENV ?? "").trim() === "1") {
  const r = config({ path: path.join(backendRoot, ".env") });
  if (r.error) process.stderr.write(`[stage1] dotenv: ${r.error.message}\n`);
  else if (r.parsed) process.stderr.write(`[stage1] dotenv key count=${Object.keys(r.parsed).length}\n`);
}

const { smokeConstitutionStep0 } = await import("./smokeConstitutionBootstrap.js");
await smokeConstitutionStep0("stage1MyPhoneCaptureOrderVerification");

const { buildPlannerReportPayload } = await import("./reportMyPhoneCapturePlanner.impl.js");

const base = await buildPlannerReportPayload();
if (base.blocked) {
  process.stdout.write(JSON.stringify({ stage1Preflight: base.stage1Preflight, blocked: true }, null, 2) + "\n");
  process.exit(1);
}

const rep = base;

const smokePass =
  rep.compare.intentMatchesDryRun &&
  rep.compare.goalIdMatches &&
  rep.compare.stepSequenceEqualsStaticReference;

const smoke = {
  orderText: rep.userText,
  intent: rep.smokeStyleParse.intent,
  goalId: rep.goalId,
  planSource: rep.planner.planSource,
  llmPlanRejectedReason: rep.planner.llmPlanRejectedReason,
  finalSteps: rep.planner.finalStepSequence,
  expectedStepsReference: rep.dryRunReference.staticStepSequence,
  expectedVsActualStepsDiff: smokePass ? "none (matches static 8-step reference)" : "see planner.finalStepSequence vs staticStepSequence",
  failureTag: null as string | null,
  traceQualityNote:
    "failureTag·WorkflowTrace.entries는 mutation 실행(execute) 시에만 채워짐 — 본 스크립트는 파싱·planPreview·플래너만.",
  pass: smokePass && rep.smokeStyleParse.intent === "myphonecheck_capture_package",
};

const dryRun = {
  planPreviewSummary: rep.smokeStyleParse.planPreviewSummary,
  planPreviewHash: rep.smokeStyleParse.planPreviewHash,
  affectedPathsFromPreview: [] as string[],
  outputRootRelative: "output",
  controlPlaneDeliveryPattern: rep.dryRunReference.predictedControlPlaneBundleDirPattern,
  manifestRelative: rep.dryRunReference.predictedManifestRelative,
  zipNote: rep.dryRunReference.predictedZipOptional,
  recoverBeforeRetryNote:
    "appLaunchRecoverBeforeRetry — `runWorkflowPlan` 실행 시 step 실패마다 호출; dry-run에서는 호출되지 않음",
  plannerFallbackIndicator:
    rep.planner.planSource === "llm" ? "llm plan adopted (no static fallback for sequence)" : `source=${rep.planner.planSource}`,
};

process.stdout.write(
  JSON.stringify({ stage1Preflight: rep.stage1Preflight, smoke, dryRun, executionMeta: rep.executionMeta }, null, 2) +
    "\n",
);
