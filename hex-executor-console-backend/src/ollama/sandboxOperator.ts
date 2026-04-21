/**
 * 호스트 측 Sandbox Operator API — job 큐잉·폴링·(선택) 스텁 완료.
 * Ollama Sandbox Operator 런타임은 이 프로토콜을 소비하는 쪽과 분리.
 */
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { NeoPolicy } from "../policy.js";
import type { SandboxJobRequest, SandboxJobResult } from "./sandboxJobTypes.js";
import {
  ensureSandboxBridgeDirs,
  newSandboxJobId,
  readSandboxJobResult,
  runRealSandboxAgentOnce,
  runStubSandboxAgentOnce,
  writeSandboxJobRequest,
} from "../sandbox/sandboxProtocol.js";
import { assertSandboxJobConstitution } from "../constitution/workerConstitutionGate.js";
import { resolveSandboxSharedRoot } from "../sandbox/sandboxPaths.js";
import { getDefaultWorkspaceRoot } from "../workspaceRoot.js";

const execFileAsync = promisify(execFile);

export type SandboxOperatorPathOptions = {
  outputRoot: string;
  profile?: string;
};

async function spawnSandboxAgentChildProcess(
  backendRoot: string,
  workspaceRoot: string,
  sharedRoot: string,
  jobId: string,
): Promise<{ ok: boolean; reason: string }> {
  const runner = path.join(backendRoot, "scripts", "runWithNeoEnv.mjs");
  const script = path.join(backendRoot, "src", "sandbox", "runSandboxAgentOnce.ts");
  try {
    await execFileAsync(process.execPath, [runner, script, "--sharedRoot", sharedRoot, "--jobId", jobId], {
      cwd: backendRoot,
      timeout: 120_000,
      env: { ...process.env, NEO_WORKSPACE_ROOT: workspaceRoot },
    });
    return { ok: true, reason: "" };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function enqueueSandboxJob(
  opts: SandboxOperatorPathOptions & {
    policy: NeoPolicy;
    task: SandboxJobRequest["task"];
    params?: Record<string, unknown>;
    jobId?: string;
  },
): Promise<{ ok: true; jobId: string; sharedRoot: string } | { ok: false; reason: string }> {
  const sharedRoot = resolveSandboxSharedRoot({ outputRoot: opts.outputRoot, profile: opts.profile });
  await ensureSandboxBridgeDirs(sharedRoot);
  const jobId = opts.jobId ?? newSandboxJobId();
  const req: SandboxJobRequest = {
    jobId,
    task: opts.task,
    createdAt: new Date().toISOString(),
    params: opts.params ?? {},
  };
  const w = await writeSandboxJobRequest(sharedRoot, req, opts.policy);
  if (!w.ok) return { ok: false, reason: w.reason };
  return { ok: true, jobId, sharedRoot };
}

export async function waitForSandboxJobResult(
  sharedRoot: string,
  jobId: string,
  opts: { timeoutMs: number; pollMs?: number },
): Promise<SandboxJobResult | null> {
  const deadline = Date.now() + opts.timeoutMs;
  const poll = opts.pollMs ?? 250;
  while (Date.now() < deadline) {
    const r = await readSandboxJobResult(sharedRoot, jobId);
    if (r) return r;
    await sleepMs(poll);
  }
  return null;
}

export async function runSandboxJobWithPolling(
  opts: SandboxOperatorPathOptions & {
    policy: NeoPolicy;
    task: SandboxJobRequest["task"];
    params?: Record<string, unknown>;
    timeoutMs: number;
    /** 스모크/E2E: inbox 직후 동일 프로세스에서 outbox 채움 */
    completeWithStubAgent?: boolean;
    /** stub | in-process real | 별도 프로세스 runSandboxAgentOnce.ts */
    completeWithAgent?: "stub" | "real" | "real-process";
    /** real-process 시 필수 */
    workspaceRoot?: string;
    backendRoot?: string;
  },
): Promise<
  | { ok: true; jobId: string; result: SandboxJobResult; sharedRoot: string }
  | { ok: false; jobId: string; reason: string; sharedRoot: string; timedOut?: boolean }
> {
  const ws = opts.workspaceRoot?.trim() || getDefaultWorkspaceRoot();
  const cg = await assertSandboxJobConstitution({ task: opts.task, workspaceRoot: ws });
  if (!cg.ok) {
    const sharedRoot = resolveSandboxSharedRoot({ outputRoot: opts.outputRoot, profile: opts.profile });
    return { ok: false, jobId: "", reason: cg.reason, sharedRoot };
  }

  const enq = await enqueueSandboxJob(opts);
  if (!enq.ok) {
    return {
      ok: false,
      jobId: "",
      reason: enq.reason,
      sharedRoot: resolveSandboxSharedRoot({ outputRoot: opts.outputRoot, profile: opts.profile }),
    };
  }
  const { jobId, sharedRoot } = enq;

  const agentKind = opts.completeWithAgent ?? (opts.completeWithStubAgent ? "stub" : undefined);
  if (agentKind === "stub") {
    const stub = await runStubSandboxAgentOnce(sharedRoot, jobId, opts.policy);
    if (!stub.ok) {
      return { ok: false, jobId, reason: stub.reason, sharedRoot };
    }
    return { ok: true, jobId, result: stub.result, sharedRoot };
  }
  if (agentKind === "real") {
    const real = await runRealSandboxAgentOnce(sharedRoot, jobId, opts.policy);
    if (!real.ok) {
      return { ok: false, jobId, reason: real.reason, sharedRoot };
    }
    return { ok: true, jobId, result: real.result, sharedRoot };
  }
  if (agentKind === "real-process") {
    const ws = opts.workspaceRoot;
    const br = opts.backendRoot;
    if (!ws?.trim() || !br?.trim()) {
      return {
        ok: false,
        jobId,
        reason: "real-process requires workspaceRoot and backendRoot",
        sharedRoot,
      };
    }
    const sp = await spawnSandboxAgentChildProcess(br, ws, sharedRoot, jobId);
    if (!sp.ok) {
      return { ok: false, jobId, reason: `sandbox agent process: ${sp.reason}`, sharedRoot };
    }
    const result = await waitForSandboxJobResult(sharedRoot, jobId, { timeoutMs: opts.timeoutMs });
    if (!result) {
      return { ok: false, jobId, reason: "timeout after real-process agent", sharedRoot, timedOut: true };
    }
    return { ok: true, jobId, result, sharedRoot };
  }

  const result = await waitForSandboxJobResult(sharedRoot, jobId, { timeoutMs: opts.timeoutMs });
  if (!result) {
    return { ok: false, jobId, reason: "timeout waiting for sandbox result", sharedRoot, timedOut: true };
  }
  return { ok: true, jobId, result, sharedRoot };
}
