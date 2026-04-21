import type { ExecuteResult } from "../types.js";
import type { WorkflowPlan, WorkflowStep, WorkflowTrace, WorkflowTraceEntry } from "./types.js";

/**
 * 내부 자동화 셀 공통 executor (Stage 1).
 *
 * 역할 요약:
 * - 입력: 계획(단계 DAG), 컨텍스트, 스텝별 핸들러 맵, 선택적 recover 훅
 * - 단계를 순서대로 실행하고 시도마다 trace·failureTag 기록
 * - 스텝 실패 시 terminal / maxAttempts / recoverBeforeRetry에 따라 재시도 또는 중단
 * - 성공 시 마지막 스텝이 낸 ExecuteResult 조각을 합쳐 반환
 */
export type WorkflowStepHandlerResult =
  | {
      ok: true;
      detail?: string;
      /** 마지막 스텝 성공 시 최종 ExecuteResult에 합쳐짐 */
      stepExecuteResult?: Partial<ExecuteResult>;
    }
  | {
      ok: false;
      detail?: string;
      failureTag?: string;
      /** true면 남은 시도 없이 워크플로 즉시 실패 */
      terminal?: boolean;
      executeResult?: ExecuteResult;
    };

export type StepHandlerArgs = {
  step: WorkflowStep;
  attempt: number;
  plan: WorkflowPlan;
};

export type WorkflowStepHandler<TCtx> = (
  ctx: TCtx,
  args: StepHandlerArgs,
) => Promise<WorkflowStepHandlerResult>;

export type RecoverBeforeRetry<TCtx> = (
  ctx: TCtx,
  args: {
    plan: WorkflowPlan;
    step: WorkflowStep;
    attempt: number;
    failure: Extract<WorkflowStepHandlerResult, { ok: false }>;
    trace: WorkflowTrace;
    logs: string[];
  },
) => Promise<
  | { recovered: true; injectEntries?: WorkflowTraceEntry[] }
  | { recovered: false; executeResult: ExecuteResult }
  | void
>;

export async function runWorkflowPlan<TCtx>(opts: {
  plan: WorkflowPlan;
  ctx: TCtx;
  logs: string[];
  trace: WorkflowTrace;
  handlers: Partial<Record<string, WorkflowStepHandler<TCtx>>>;
  recoverBeforeRetry?: RecoverBeforeRetry<TCtx>;
}): Promise<ExecuteResult> {
  const { plan, ctx, logs, trace, handlers, recoverBeforeRetry } = opts;
  const lastStepIndex = plan.steps.length - 1;

  for (let si = 0; si < plan.steps.length; si++) {
    const step = plan.steps[si]!;
    const isLast = si === lastStepIndex;
    const handler = handlers[step.id];
    if (!handler) {
      return {
        ok: false,
        status: "error",
        summary: `워크플로: 스텝 핸들러 없음 (${step.id})`,
        logs,
        workflowTrace: trace,
      };
    }

    stepLoop: for (let attempt = 1; attempt <= step.maxAttempts; attempt++) {
      const r = await handler(ctx, { step, attempt, plan });

      if (r.ok) {
        trace.entries.push({
          stepId: step.id,
          attempt,
          status: "success",
          detail: r.detail,
        });
        if (isLast) {
          return {
            ok: true,
            status: "success",
            summary: r.stepExecuteResult?.summary ?? "워크플로 완료",
            logs,
            ...r.stepExecuteResult,
            workflowTrace: trace,
          };
        }
        break stepLoop;
      }

      const fail = r;
      trace.entries.push({
        stepId: step.id,
        attempt,
        status: "failed",
        detail: fail.detail,
        failureTag: fail.failureTag,
      });

      if (fail.terminal || attempt >= step.maxAttempts) {
        const er =
          fail.executeResult ??
          ({
            ok: false,
            status: "error" as const,
            summary: fail.detail ?? "워크플로 스텝 실패",
            logs,
          } satisfies ExecuteResult);
        return { ...er, logs, workflowTrace: trace };
      }

      if (recoverBeforeRetry) {
        const rec = await recoverBeforeRetry(ctx, {
          plan,
          step,
          attempt,
          failure: fail,
          trace,
          logs,
        });
        if (rec && "recovered" in rec) {
          if (!rec.recovered) {
            return { ...rec.executeResult, workflowTrace: trace };
          }
          if (rec.injectEntries?.length) {
            trace.entries.push(...rec.injectEntries);
          }
        }
      }
    }
  }

  return {
    ok: false,
    status: "error",
    summary: "워크플로: 단계 소진 없이 종료",
    logs,
    workflowTrace: trace,
  };
}
