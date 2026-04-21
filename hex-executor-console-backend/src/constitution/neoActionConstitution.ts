import type { ActionRequest, ExecuteContext, ExecuteResult } from "../types.js";
import { mergeConstitutionSummariesKo } from "./constitutionSummaryKo.js";
import { runConstitutionAudit } from "./runConstitutionAudit.js";
import { runConstitutionPreflight } from "./runConstitutionPreflight.js";

function artifactFromResult(r: ExecuteResult, action: ActionRequest): string {
  return [
    `summary=${r.summary}`,
    `ok=${r.ok}`,
    `status=${r.status}`,
    ...r.logs.slice(0, 80),
    `rawText=${action.rawText}`,
  ].join("\n");
}

/**
 * Neo executeAction 전체에 헌법 0번 공정(사전) + 사후 감사를 강제.
 */
export async function runNeoActionWithConstitution(
  action: ActionRequest,
  ctx: ExecuteContext,
  logs: string[],
  dispatch: () => Promise<ExecuteResult>,
): Promise<ExecuteResult> {
  const pre = await runConstitutionPreflight({
    workspaceRoot: ctx.workspaceRoot,
    taskKind: "neo_action",
    workerKind: "neo",
    rawText: action.rawText,
    actionIntent: action.intent,
  });

  if (!pre.ok) {
    return {
      ok: false,
      status: "error",
      summary: `[헌법 사전검사 차단]\n${pre.summaryKo.fullText}`,
      logs: [...logs, "[constitution] preflight deny"],
      constitutionSummaryKo: pre.summaryKo.fullText,
      constitutionPreflight: pre,
    };
  }

  const execResult = await dispatch();

  const audit = await runConstitutionAudit({
    workspaceRoot: ctx.workspaceRoot,
    taskKind: "neo_action",
    workerKind: "neo",
    rawText: action.rawText,
    actionIntent: action.intent,
    artifactText: artifactFromResult(execResult, action),
  });

  const merged = mergeConstitutionSummariesKo(pre, audit);
  const auditDeny = audit.finalMode === "deny";

  return {
    ...execResult,
    ok: Boolean(execResult.ok) && !auditDeny,
    status: auditDeny ? "error" : execResult.status,
    summary: `${execResult.summary}\n\n[헌법 요약]\n${merged.fullText}`,
    logs: [...(execResult.logs ?? logs), "[constitution] audit"],
    constitutionSummaryKo: merged.fullText,
    constitutionPreflight: pre,
    constitutionAudit: audit,
  };
}
