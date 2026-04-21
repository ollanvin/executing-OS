/**
 * RoutedExecutionStep → Host / Sandbox / (remote 스킵) 공통 디스패치.
 */
import type { NeoPolicy } from "../policy.js";
import { executeHostTask } from "../ollama/hostExecutor.js";
import type { HostExecutionContext, HostExecutionResult, HostExecutionTask } from "../ollama/hostExecutionTypes.js";
import type { SandboxJobResult } from "../ollama/sandboxJobTypes.js";
import { runSandboxJobWithPolling } from "../ollama/sandboxOperator.js";
import type { RoutedExecutionStep, ExecutionTarget } from "./executionRouting.js";

export type DispatchExecutionContext = {
  backendRoot: string;
  workspaceRoot: string;
  outputRoot: string;
  policy: NeoPolicy;
  logger?: (line: string) => void;
};

export type SandboxJobDispatchPayload = {
  task: import("../ollama/sandboxJobTypes.js").SandboxJobTask;
  params?: Record<string, unknown>;
  profile?: string;
  timeoutMs: number;
  completeWithAgent?: "stub" | "real" | "real-process";
  completeWithStubAgent?: boolean;
};

export type DispatchExecutionResult = {
  ok: boolean;
  target: ExecutionTarget;
  summary: string;
  hostResult?: HostExecutionResult;
  sandboxResult?: SandboxJobResult;
  sandboxMeta?: { jobId: string; sharedRoot: string };
  error?: string;
};

function hostCtxFromDispatch(d: DispatchExecutionContext): HostExecutionContext {
  return {
    workspaceRoot: d.workspaceRoot,
    backendRoot: d.backendRoot,
    outputRoot: d.outputRoot,
  };
}

function isHostTaskPayload(p: unknown): p is HostExecutionTask {
  return (
    typeof p === "object" &&
    p !== null &&
    "kind" in p &&
    typeof (p as { kind: unknown }).kind === "string"
  );
}

function isSandboxDispatchPayload(p: unknown): p is SandboxJobDispatchPayload {
  return (
    typeof p === "object" &&
    p !== null &&
    "task" in p &&
    "timeoutMs" in p &&
    typeof (p as { timeoutMs: unknown }).timeoutMs === "number"
  );
}

/**
 * 단일 라우팅 스텝 실행. `step.target` 과 payload 가 일치하지 않으면 payload 기준으로 경고 로그만 남김.
 */
export async function dispatchExecutionStep(
  step: RoutedExecutionStep,
  ctx: DispatchExecutionContext,
): Promise<DispatchExecutionResult> {
  const log = (line: string) => ctx.logger?.(line);

  if (step.target === "gemini_remote") {
    const msg = "dispatcher skipped remote reasoning step (gemini_remote)";
    log?.(`[dispatch] ${step.id}: ${msg}`);
    return { ok: true, target: "gemini_remote", summary: msg };
  }

  if (step.target === "ollama_host") {
    if (!isHostTaskPayload(step.payload)) {
      return {
        ok: false,
        target: "ollama_host",
        summary: "invalid host payload",
        error: "expected HostExecutionTask shape { kind, ... }",
      };
    }
    const hr = await executeHostTask(step.payload, hostCtxFromDispatch(ctx));
    log?.(`[dispatch] ${step.id} host ${hr.taskKind} ok=${hr.ok}`);
    return {
      ok: hr.ok,
      target: "ollama_host",
      summary: hr.summary,
      hostResult: hr,
      error: hr.error,
    };
  }

  if (step.target === "ollama_sandbox") {
    if (!isSandboxDispatchPayload(step.payload)) {
      return {
        ok: false,
        target: "ollama_sandbox",
        summary: "invalid sandbox dispatch payload",
        error: "expected SandboxJobDispatchPayload { task, timeoutMs, ... }",
      };
    }
    const p = step.payload;
    const poll = await runSandboxJobWithPolling({
      outputRoot: ctx.outputRoot,
      profile: p.profile,
      policy: ctx.policy,
      task: p.task,
      params: p.params,
      timeoutMs: p.timeoutMs,
      completeWithAgent: p.completeWithAgent,
      completeWithStubAgent: p.completeWithStubAgent,
      workspaceRoot: ctx.workspaceRoot,
      backendRoot: ctx.backendRoot,
    });
    if (!poll.ok) {
      log?.(`[dispatch] ${step.id} sandbox failed: ${poll.reason}`);
      return {
        ok: false,
        target: "ollama_sandbox",
        summary: poll.reason,
        error: poll.reason,
      };
    }
    log?.(`[dispatch] ${step.id} sandbox job=${poll.jobId} ok`);
    return {
      ok: true,
      target: "ollama_sandbox",
      summary: poll.result.summary,
      sandboxResult: poll.result,
      sandboxMeta: { jobId: poll.jobId, sharedRoot: poll.sharedRoot },
    };
  }

  return {
    ok: false,
    target: step.target,
    summary: `unknown execution target: ${step.target}`,
    error: "unsupported target",
  };
}

/** 페이로드로 target 을 추론해 RoutedExecutionStep 생성 (플래너 연동용). */
export function buildRoutedStep(
  id: string,
  title: string,
  payload: unknown,
  inferTarget: (p: unknown) => ExecutionTarget,
): RoutedExecutionStep {
  return {
    id,
    title,
    target: inferTarget(payload),
    payload,
  };
}
