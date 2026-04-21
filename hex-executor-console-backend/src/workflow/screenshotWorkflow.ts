import { loadNeoPolicy } from "../policy.js";
import type { ExecuteContext, ExecuteResult } from "../types.js";
import { runWorkflowPlan, type WorkflowStepHandler } from "./executor.js";
import type { InternalCellBaseCtx } from "./internalCellContext.js";
import { planRuntimeScreenshot } from "./screenshotPlanner.js";
import {
  buildCaptureScreencapStepHandler,
  buildScreencapNoDeviceRecover,
} from "./screencapStepShared.js";
import { runEnsureAndroidDeviceStepCore } from "./ensureAndroidDeviceShared.js";
import type { WorkflowTrace } from "./types.js";
import { WORKFLOW_STEP_CAPTURE_SCREENCAP, WORKFLOW_STEP_ENSURE_ANDROID_DEVICE } from "./types.js";

/** @deprecated InternalCellBaseCtx 별칭 — 외부 import 호환용 */
export type ScreenshotWorkflowCtx = InternalCellBaseCtx;

/**
 * Stage 1: 런타임 PNG 캡처 (ensure + capture 빌딩 블록만 합성).
 */
export async function executeRuntimeScreenshotWorkflow(
  ctx: ExecuteContext,
  logs: string[],
): Promise<ExecuteResult> {
  const policy = await loadNeoPolicy(ctx.workspaceRoot);
  const plan = planRuntimeScreenshot();
  const trace: WorkflowTrace = { goalId: plan.goalId, entries: [] };
  const wctx: InternalCellBaseCtx = { executeCtx: ctx, logs, policy };

  const ensureHandler: WorkflowStepHandler<InternalCellBaseCtx> = (wctxInner, { step, attempt }) =>
    runEnsureAndroidDeviceStepCore(wctxInner, step, attempt);

  const handlers = {
    [WORKFLOW_STEP_ENSURE_ANDROID_DEVICE]: ensureHandler,
    [WORKFLOW_STEP_CAPTURE_SCREENCAP]: buildCaptureScreencapStepHandler<InternalCellBaseCtx>(),
  };

  return runWorkflowPlan({
    plan,
    ctx: wctx,
    logs,
    trace,
    handlers,
    recoverBeforeRetry: buildScreencapNoDeviceRecover<InternalCellBaseCtx>(),
  });
}
