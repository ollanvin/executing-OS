import { loadNeoPolicy } from "../policy.js";
import type { ExecuteContext, ExecuteResult } from "../types.js";
import type { AppLaunchWorkflowCtx } from "./appLaunchContext.js";
export type { AppLaunchWorkflowCtx } from "./appLaunchContext.js";
import { appLaunchRecoverBeforeRetry, buildAppLaunchStepHandlers } from "./appLaunchStepHandlers.js";
import { planAppLaunchForeground } from "./appLaunchPlanner.js";
import { runWorkflowPlan } from "./executor.js";
import type { WorkflowTrace } from "./types.js";

export function resolveLaunchPackageFromActionArgs(args: Record<string, unknown>): string | null {
  const p = args.package;
  if (typeof p === "string" && p.trim().length > 0) return p.trim();
  const env = process.env.NEO_MYPHONECHECK_PACKAGE?.trim();
  return env && env.length > 0 ? env : null;
}

/**
 * Stage 1: 패키지 기동 + foreground 검증 (device ensure 공유).
 * intent myphonecheck_app_launch COMMIT.
 */
export async function executeAppLaunchForegroundWorkflow(
  ctx: ExecuteContext,
  logs: string[],
  opts: { packageName: string; scenarioId?: string | null },
): Promise<ExecuteResult> {
  const policy = await loadNeoPolicy(ctx.workspaceRoot);
  const plan = planAppLaunchForeground({ scenarioId: opts.scenarioId });
  const trace: WorkflowTrace = { goalId: plan.goalId, entries: [] };
  const wctx: AppLaunchWorkflowCtx = {
    executeCtx: ctx,
    logs,
    policy,
    packageName: opts.packageName,
    scenarioId: opts.scenarioId,
  };

  return runWorkflowPlan({
    plan,
    ctx: wctx,
    logs,
    trace,
    handlers: buildAppLaunchStepHandlers({ foregroundStepTerminalSummary: true }),
    recoverBeforeRetry: appLaunchRecoverBeforeRetry,
  });
}
