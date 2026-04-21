import { getDefaultWorkspaceRoot } from "../workspaceRoot.js";
import { runConstitutionPreflight } from "./runConstitutionPreflight.js";
import type { ConstitutionResolutionSnapshot } from "./constitutionTypes.js";
import type { HostExecutionContext, HostExecutionTask } from "../ollama/hostExecutionTypes.js";

export async function assertHostExecutorConstitution(
  task: HostExecutionTask,
  ctx: HostExecutionContext,
): Promise<{ ok: true; constitutionResolutionSnapshot: ConstitutionResolutionSnapshot } | { ok: false; reason: string }> {
  const raw = JSON.stringify({ kind: task.kind });
  const pre = await runConstitutionPreflight({
    workspaceRoot: ctx.workspaceRoot,
    taskKind: "host_executor",
    workerKind: "host",
    rawText: raw,
  });
  if (!pre.ok) {
    return { ok: false, reason: `[헌법] Host 0번 공정 실패\n${pre.summaryKo.fullText}` };
  }
  if (!pre.resolutionSnapshot) {
    return { ok: false, reason: "[헌법] resolutionSnapshot 없음(내부 오류)" };
  }
  return { ok: true, constitutionResolutionSnapshot: pre.resolutionSnapshot };
}

export async function assertSandboxJobConstitution(opts: {
  task: string;
  workspaceRoot?: string;
}): Promise<{ ok: true; constitutionResolutionSnapshot: ConstitutionResolutionSnapshot } | { ok: false; reason: string }> {
  const workspaceRoot = opts.workspaceRoot?.trim() || getDefaultWorkspaceRoot();
  const pre = await runConstitutionPreflight({
    workspaceRoot,
    taskKind: "ollama_sandbox",
    workerKind: "sandbox",
    rawText: `sandbox:${opts.task}`,
  });
  if (!pre.ok) {
    return { ok: false, reason: `[헌법] Sandbox 0번 공정 실패\n${pre.summaryKo.fullText}` };
  }
  if (!pre.resolutionSnapshot) {
    return { ok: false, reason: "[헌법] resolutionSnapshot 없음(내부 오류)" };
  }
  return { ok: true, constitutionResolutionSnapshot: pre.resolutionSnapshot };
}
