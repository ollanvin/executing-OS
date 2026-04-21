/**
 * 플래너 리포트 본문 — 반드시 {@link reportMyPhoneCapturePlanner.ts}가 env를 선로딩한 뒤 동적 import 한다.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getEffectiveGeminiPlannerModelIdForTrace,
  isGeminiApiKeyConfiguredAtModuleLoad,
} from "../ai/geminiProvider.js";
import { classifyWithAiOrFallback } from "../ai/router.js";
import { finalizeAction } from "../enrichAction.js";
import { normalizeParsedAction } from "../normalizeParsedAction.js";
import { buildPlanPreview } from "../planPreview.js";
import { isLlmPlannerEnabled } from "../planner/plannerConfig.js";
import {
  describePlannerModelForTrace,
  resolveMyPhoneCheckCaptureWorkflowPlan,
} from "../planner/plannerProvider.js";
import { runStage1MyPhoneCapturePreflight } from "../preflight/stage1Preflight.js";
import { loadNeoPolicy } from "../policy.js";
import { planMyPhoneCheckCapturePackage } from "../workflow/myphonecheckCapturePackagePlanner.js";
import { getDefaultWorkspaceRoot } from "../workspaceRoot.js";

export const USER_TEXT =
  "마이폰첵을 에뮬레이터로 온보드 화면 및 모듈 앱 화면을 사진 찍어서 컨트롤플레인에게 전달할 파일로 만들어줘";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dir, "..", "..");
const outputRoot = path.join(backendRoot, "output");

function maskEnvBool(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export type PlannerReportSuccessPayload = {
  blocked: false;
  stage1Preflight: { status: "PASS" };
  userText: string;
  executionMeta: {
    workingDirectory: string;
    backendRoot: string;
    neoLoadDotenv: string;
    geminiApiKeyTruthyInProcessEnv: boolean;
    geminiApiKeySeenByGeminiModule: boolean;
    processEnvAndModuleMatch: boolean;
    plannerModelKindRaw: string | null;
    plannerModelNameRaw: string | null;
    note: string;
  };
  smokeStyleParse: {
    intent: string;
    category: string;
    isMutating: boolean;
    planPreviewSummary: string | null;
    planPreviewHash: string | null;
  };
  goalId: string;
  planner: {
    llmPlannerEnabledEnv: boolean;
    plannerModelKind: string | null;
    plannerModelName: string | null;
    effectiveGeminiPlannerModelId: string | null;
    planSource: string;
    llmPlanRejectedReason: string | null;
    plannerNotes: string | null;
    plannerLogsTail: string[];
    finalStepSequence: string[];
  };
  dryRunReference: {
    note: string;
    staticStepSequence: string[];
    predictedControlPlaneBundleDirPattern: string;
    predictedManifestRelative: string;
    predictedZipOptional: string;
  };
  compare: {
    intentMatchesDryRun: boolean;
    goalIdMatches: boolean;
    stepSequenceEqualsStaticReference: boolean;
  };
};

export type PlannerReportPayloadResult =
  | { blocked: true; stage1Preflight: { status: "FAIL"; failures: { code: string; line: string }[] } }
  | PlannerReportSuccessPayload;

export async function buildPlannerReportPayload(): Promise<PlannerReportPayloadResult> {
  const ws = getDefaultWorkspaceRoot();

  const pkgEnv = process.env.NEO_MYPHONECHECK_PACKAGE?.trim() ?? null;
  const pf = await runStage1MyPhoneCapturePreflight({
    backendRoot,
    outputRoot,
    workspaceRoot: ws,
    packageName: pkgEnv,
  });
  if (pf.status === "FAIL") {
    return { blocked: true, stage1Preflight: pf };
  }

  const policy = await loadNeoPolicy(ws);

  const geminiProcessEnv = maskEnvBool();
  const geminiModuleLoad = isGeminiApiKeyConfiguredAtModuleLoad();

  const draft = await classifyWithAiOrFallback(USER_TEXT, policy);
  const norm = normalizeParsedAction(USER_TEXT, draft);
  const action = await finalizeAction(norm, ws);

  let planPreviewSummary: string | null = null;
  let planPreviewHash: string | null = null;
  if (action.isMutating) {
    const prev = await buildPlanPreview(action, ws, outputRoot);
    if (prev?.ok) {
      planPreviewSummary = prev.preview.summary;
      planPreviewHash = prev.preview.previewHash;
    }
  }

  const staticPlan = planMyPhoneCheckCapturePackage();
  const staticSequence = staticPlan.steps.map((s) => s.id);

  const plannerLogs: string[] = [];
  const llmOn = isLlmPlannerEnabled();
  const resolved = await resolveMyPhoneCheckCaptureWorkflowPlan({
    userGoalText: USER_TEXT,
    policy,
    logs: plannerLogs,
    llmEnabled: llmOn,
  });

  const modelTrace = llmOn ? describePlannerModelForTrace() : null;

  const finalSequence = resolved.workflowPlan.steps.map((s) => s.id);

  const plannerKind = (process.env.PLANNER_MODEL_KIND ?? "").trim() || "(unset→gemini)";
  const plannerName = (process.env.PLANNER_MODEL_NAME ?? "").trim() || "(unset)";

  process.stderr.write(
    `[stage1-env] GEMINI_API_KEY_loaded=${geminiModuleLoad} process.env_truthy=${geminiProcessEnv} match=${geminiProcessEnv === geminiModuleLoad}\n`,
  );
  process.stderr.write(
    `[stage1-planner] PLANNER_MODEL_KIND=${plannerKind} PLANNER_MODEL_NAME=${plannerName} planSource=${resolved.planSource} llmPlanRejectedReason=${resolved.rejectReason ?? "null"}\n`,
  );

  return {
    blocked: false,
    stage1Preflight: { status: "PASS" as const },
    userText: USER_TEXT,
    executionMeta: {
      workingDirectory: process.cwd(),
      backendRoot,
      neoLoadDotenv: (process.env.NEO_LOAD_DOTENV ?? "").trim() || "0",
      geminiApiKeyTruthyInProcessEnv: geminiProcessEnv,
      geminiApiKeySeenByGeminiModule: geminiModuleLoad,
      processEnvAndModuleMatch: geminiProcessEnv === geminiModuleLoad,
      plannerModelKindRaw: process.env.PLANNER_MODEL_KIND ?? null,
      plannerModelNameRaw: process.env.PLANNER_MODEL_NAME ?? null,
      note:
        "GEMINI 모듈은 import 시점에 키를 읽습니다. NEO_LOAD_DOTENV=1 이거나 node --env-file 로 선행 로드해야 모듈이 키를 봅니다.",
    },
    smokeStyleParse: {
      intent: action.intent,
      category: action.category,
      isMutating: action.isMutating,
      planPreviewSummary,
      planPreviewHash,
    },
    goalId: staticPlan.goalId,
    planner: {
      llmPlannerEnabledEnv: llmOn,
      plannerModelKind: modelTrace?.kind ?? null,
      plannerModelName: modelTrace?.name ?? null,
      effectiveGeminiPlannerModelId:
        llmOn && modelTrace?.kind === "gemini" ? getEffectiveGeminiPlannerModelIdForTrace() : null,
      planSource: resolved.planSource,
      llmPlanRejectedReason: resolved.rejectReason ?? null,
      plannerNotes: resolved.plannerPlan?.notes ?? null,
      plannerLogsTail: plannerLogs.slice(-12),
      finalStepSequence: finalSequence,
    },
    dryRunReference: {
      note: "Neo /parse dry-run은 planPreview 요약·해시만 제공; 단계 DAG는 정적 planner 기준이 참조.",
      staticStepSequence: staticSequence,
      predictedControlPlaneBundleDirPattern: "output/control-plane-delivery/myphonecheck-<timestamp>/",
      predictedManifestRelative: "manifest.json",
      predictedZipOptional: "myphonecheck-<timestamp>.zip (Windows)",
    },
    compare: {
      intentMatchesDryRun: action.intent === "myphonecheck_capture_package",
      goalIdMatches: staticPlan.goalId === "myphonecheck_capture_package",
      stepSequenceEqualsStaticReference:
        finalSequence.length === staticSequence.length &&
        finalSequence.every((id, i) => id === staticSequence[i]),
    },
  };
}

export async function runPlannerReport(): Promise<void> {
  const out = await buildPlannerReportPayload();
  if (out.blocked) {
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
    process.exit(1);
  }
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
}
