import fs from "node:fs/promises";
import { finalizeMyPhoneCheckCaptureBundle } from "../orchestration/myphonecheckBundleFinalize.js";
import { runOllamaHostSmokeMini } from "../orchestration/ollamaHostSmokeMini.js";
import { runStage1MyPhoneCapturePreflight } from "../preflight/stage1Preflight.js";
import type { ExecuteResult } from "../types.js";
import { executeMyPhoneCheckCapturePackageWorkflow } from "./myphonecheckCapturePackageWorkflow.js";
import type { OrchestratedPlan, OrchestratorResult, OrchestratorStepResult } from "./orchestratorTypes.js";
import { buildOrchestratorSummaryKo } from "./orchestratorSummaryKo.js";
import {
  buildMyphonecheckCaptureBundleRunPlan,
  GOAL_MYPHONECHECK_CAPTURE_BUNDLE_RUN,
} from "./goals/myphonecheckCaptureGoal.js";

export type OrchestrationEngineContext = {
  workspaceRoot: string;
  outputRoot: string;
  backendRoot: string;
  runsDir: string;
  packageName: string | null;
  userGoalText: string;
  scenarioId: string | null;
  /** UX 마크다운 리포트 작성 (smoke·Neo 응답 경로에서 true 권장) */
  writeUxReport: boolean;
};

function nowIso(): string {
  return new Date().toISOString();
}

async function timed<T>(fn: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const t0 = Date.now();
  const value = await fn();
  return { ms: Date.now() - t0, value };
}

/**
 * MyPhoneCheck 캡처 번들 오케스트레이션 (preflight → host 스모크 → 워크플로 → e2e·리포트).
 */
export async function runOrchestratedPlan(
  plan: OrchestratedPlan,
  ctx: OrchestrationEngineContext,
): Promise<OrchestratorResult> {
  const startedAt = nowIso();
  const stepResults: OrchestratorStepResult[] = [];
  let workflowResult: ExecuteResult | undefined;
  let preflightFailure: unknown;

  const pushStep = (r: OrchestratorStepResult) => {
    stepResults.push(r);
  };

  const abortRest = (reason: string): OrchestratorResult => {
    const finishedAt = nowIso();
    const base: OrchestratorResult = {
      goalId: plan.goalId,
      startedAt,
      finishedAt,
      ok: false,
      stepResults,
      preflightFailure,
      workflowResult,
      highLevelSummaryKo: "",
      summaryFields: {},
    };
    base.highLevelSummaryKo = `${buildOrchestratorSummaryKo(base)}\n\n(중단: ${reason})`;
    return base;
  };

  for (const step of plan.steps) {
    const abort = step.abortOnFailure !== false;

    if (step.kind === "stage1_preflight") {
      const { ms, value: pf } = await timed(() =>
        runStage1MyPhoneCapturePreflight({
          backendRoot: ctx.backendRoot,
          outputRoot: ctx.outputRoot,
          workspaceRoot: ctx.workspaceRoot,
          packageName: ctx.packageName,
        }),
      );
      preflightFailure = pf.status === "FAIL" ? pf : undefined;
      const ok = pf.status === "PASS";
      pushStep({
        stepId: step.id,
        kind: step.kind,
        ok,
        durationMs: ms,
        summary: ok ? "Stage1 preflight PASS" : `Stage1 preflight FAIL (${pf.failures.length}건)`,
        detail: pf,
      });
      if (!ok && abort) {
        return abortRest("preflight failed");
      }
      continue;
    }

    if (step.kind === "ollama_host_smoke_mini") {
      const hostCtx = { workspaceRoot: ctx.workspaceRoot, backendRoot: ctx.backendRoot, outputRoot: ctx.outputRoot };
      const { ms, value: mini } = await timed(() => runOllamaHostSmokeMini(hostCtx));
      pushStep({
        stepId: step.id,
        kind: step.kind,
        ok: mini.ok,
        durationMs: ms,
        summary: mini.summary,
        detail: mini,
      });
      if (!mini.ok && abort) {
        return abortRest("ollama host smoke mini failed");
      }
      continue;
    }

    if (step.kind === "workflow_myphonecheck_capture") {
      if (!ctx.packageName?.trim()) {
        pushStep({
          stepId: step.id,
          kind: step.kind,
          ok: false,
          durationMs: 0,
          summary: "NEO_MYPHONECHECK_PACKAGE 없음",
        });
        return abortRest("package missing");
      }
      const packageName = ctx.packageName.trim();
      await fs.mkdir(ctx.runsDir, { recursive: true });
      const logs: string[] = [`orchestrator workflow step=${step.id}`];
      const { ms, value: wf } = await timed(() =>
        executeMyPhoneCheckCapturePackageWorkflow(
          {
            workspaceRoot: ctx.workspaceRoot,
            outputRoot: ctx.outputRoot,
            runsDir: ctx.runsDir,
            approved: true,
            approvalPreviewHash: null,
          },
          logs,
          {
            packageName,
            userGoalText: ctx.userGoalText,
            scenarioId: ctx.scenarioId,
          },
        ),
      );
      workflowResult = wf;
      pushStep({
        stepId: step.id,
        kind: step.kind,
        ok: wf.ok,
        durationMs: ms,
        summary: wf.summary?.slice(0, 500) ?? (wf.ok ? "workflow ok" : "workflow failed"),
        detail: { status: wf.status },
      });
      if (!wf.ok && abort) {
        const finishedAt = nowIso();
        const partial: OrchestratorResult = {
          goalId: plan.goalId,
          startedAt,
          finishedAt,
          ok: false,
          stepResults,
          workflowResult: wf,
          highLevelSummaryKo: "",
          summaryFields: {},
        };
        partial.highLevelSummaryKo = `${buildOrchestratorSummaryKo(partial)}\n\n(워크플로 실패로 e2e finalize 생략)`;
        return partial;
      }
      continue;
    }

    if (step.kind === "e2e_finalize_bundle") {
      const wf = workflowResult;
      if (!wf) {
        pushStep({
          stepId: step.id,
          kind: step.kind,
          ok: false,
          durationMs: 0,
          summary: "워크플로 결과 없음",
        });
        const finishedAt = nowIso();
        const partial: OrchestratorResult = {
          goalId: plan.goalId,
          startedAt,
          finishedAt,
          ok: false,
          stepResults,
          highLevelSummaryKo: "",
          summaryFields: {},
        };
        partial.highLevelSummaryKo = `${buildOrchestratorSummaryKo(partial)}\n\n(워크플로 미실행)`;
        return partial;
      }
      const { ms, value: fin } = await timed(() =>
        finalizeMyPhoneCheckCaptureBundle({
          result: wf,
          outputRoot: ctx.outputRoot,
          workspaceRoot: ctx.workspaceRoot,
          packageName: ctx.packageName,
          userGoalText: ctx.userGoalText,
          writeReport: ctx.writeUxReport,
        }),
      );
      const hardOk = wf.ok && fin.e2eVerification.ok;
      pushStep({
        stepId: step.id,
        kind: step.kind,
        ok: hardOk,
        durationMs: ms,
        summary: fin.summaryOut.slice(0, 400),
        detail: { bundlePath: fin.bundlePath, e2eOk: fin.e2eVerification.ok },
      });
      const finishedAt = nowIso();
      const out: OrchestratorResult = {
        goalId: plan.goalId,
        startedAt,
        finishedAt,
        ok: hardOk,
        stepResults,
        workflowResult: wf,
        bundlePath: fin.bundlePath,
        reportPath: fin.reportPath,
        e2eVerification: fin.e2eVerification,
        screenCaptureSummary: fin.screenCap ?? null,
        highLevelSummaryKo: "",
        summaryFields: {
          bundlePath: fin.bundlePath,
          totalScreensCaptured: fin.e2eVerification.totalScreensCaptured,
          distinctScreenIdsCaptured: fin.e2eVerification.distinctScreenIdsCaptured,
          emulatorWindowCropOk: fin.e2eVerification.screenCapture?.emulatorWindowCropOk,
          reportGaps: fin.e2eVerification.reportGaps,
          e2eHardOk: fin.e2eVerification.ok,
        },
      };
      out.highLevelSummaryKo = buildOrchestratorSummaryKo(out);
      return out;
    }
  }

  const finishedAt = nowIso();
  const fallback: OrchestratorResult = {
    goalId: plan.goalId,
    startedAt,
    finishedAt,
    ok: false,
    stepResults,
    workflowResult,
    highLevelSummaryKo: "",
    summaryFields: {},
  };
  fallback.highLevelSummaryKo = buildOrchestratorSummaryKo(fallback);
  return fallback;
}

/** goalId에 맞는 플랜 빌드 (현재 MyPhoneCheck 캡처 번들만) */
export function planForGoalId(goalId: string): OrchestratedPlan | null {
  if (goalId === GOAL_MYPHONECHECK_CAPTURE_BUNDLE_RUN) {
    return buildMyphonecheckCaptureBundleRunPlan();
  }
  return null;
}
