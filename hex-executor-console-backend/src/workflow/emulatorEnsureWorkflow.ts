import { loadNeoPolicy } from "../policy.js";
import type { ExecuteContext, ExecuteResult } from "../types.js";
import { runEmulatorEnsureBootOnlyStepHandler } from "./ensureAndroidDeviceShared.js";
import { runWorkflowPlan } from "./executor.js";
import { planEmulatorEnsureBoot } from "./emulatorEnsurePlanner.js";
import type { InternalCellBaseCtx } from "./internalCellContext.js";
import type { WorkflowTrace } from "./types.js";
import { WORKFLOW_STEP_ENSURE_ANDROID_DEVICE } from "./types.js";

/**
 * Stage 1 capability: 에뮬레이터/ADB 디바이스 확보만 목표로 end-to-end 실행.
 * intent myphonecheck_emulator COMMIT 진입점.
 */
export async function executeEmulatorEnsureWorkflow(
  ctx: ExecuteContext,
  logs: string[],
): Promise<ExecuteResult> {
  const policy = await loadNeoPolicy(ctx.workspaceRoot);
  const plan = planEmulatorEnsureBoot();
  const trace: WorkflowTrace = { goalId: plan.goalId, entries: [] };
  const wctx: InternalCellBaseCtx = { executeCtx: ctx, logs, policy };

  return runWorkflowPlan({
    plan,
    ctx: wctx,
    logs,
    trace,
    handlers: {
      [WORKFLOW_STEP_ENSURE_ANDROID_DEVICE]: runEmulatorEnsureBootOnlyStepHandler,
    },
  });
}
