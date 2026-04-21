import { loadNeoPolicy } from "../policy.js";
import type { ExecuteContext, ExecuteResult } from "../types.js";
import { appLaunchRecoverBeforeRetry, buildAppLaunchStepHandlers } from "./appLaunchStepHandlers.js";
import type { AppLaunchWorkflowCtx } from "./appLaunchContext.js";
import { planAppReadyScreenshot } from "./appReadyScreenshotPlanner.js";
import { runWorkflowPlan, type WorkflowStepHandler } from "./executor.js";
import { buildCaptureScreencapStepHandler, buildScreencapNoDeviceRecover } from "./screencapStepShared.js";
import type { WorkflowTrace } from "./types.js";
import { WORKFLOW_STEP_CAPTURE_SCREENCAP } from "./types.js";

/**
 * Composition(A안): 단일 runWorkflowPlan 안에서 app launch 핸들러 맵 + capture 핸들러를 합친다.
 * B안(서브워크플로 + trace 중첩)은 Stage 2 전후로 검토 — docs/workflow/INTERNAL-CELL-APP-READY-SCREENSHOT-SUCCESS.md 참고.
 */
export async function executeAppReadyScreenshotWorkflow(
  ctx: ExecuteContext,
  logs: string[],
  opts: { packageName: string; scenarioId?: string | null },
): Promise<ExecuteResult> {
  const policy = await loadNeoPolicy(ctx.workspaceRoot);
  const plan = planAppReadyScreenshot({ scenarioId: opts.scenarioId });
  const trace: WorkflowTrace = { goalId: plan.goalId, entries: [] };
  const wctx: AppLaunchWorkflowCtx = {
    executeCtx: ctx,
    logs,
    policy,
    packageName: opts.packageName,
    scenarioId: opts.scenarioId,
  };

  const baseCapture = buildCaptureScreencapStepHandler<AppLaunchWorkflowCtx>();
  const captureWithSummary: WorkflowStepHandler<AppLaunchWorkflowCtx> = async (w, a) => {
    const r = await baseCapture(w, a);
    if (r.ok && r.stepExecuteResult?.ok) {
      return {
        ...r,
        stepExecuteResult: {
          ...r.stepExecuteResult,
          summary: `앱 준비 후 캡처 완료 (${opts.packageName}). ${r.stepExecuteResult.summary ?? ""}`.trim(),
        },
      };
    }
    return r;
  };

  const handlers = {
    ...buildAppLaunchStepHandlers({ foregroundStepTerminalSummary: false }),
    [WORKFLOW_STEP_CAPTURE_SCREENCAP]: captureWithSummary,
  };

  const screencapRecover = buildScreencapNoDeviceRecover<AppLaunchWorkflowCtx>();

  return runWorkflowPlan({
    plan,
    ctx: wctx,
    logs,
    trace,
    handlers,
    recoverBeforeRetry: async (inner, args) => {
      const appR = await appLaunchRecoverBeforeRetry(inner, args);
      if (appR !== undefined) return appR;
      return screencapRecover(inner, args);
    },
  });
}
