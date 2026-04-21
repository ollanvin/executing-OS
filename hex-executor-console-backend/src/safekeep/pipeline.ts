import path from "node:path";
import { runConstitutionPreflight } from "../constitution/runConstitutionPreflight.js";
import type { ActionRequest, ExecuteContext, ExecuteResult, PipelineStages } from "../types.js";
import { computeCanonicalPlanHash } from "./canonicalPlan.js";
import { loadNeoPolicy } from "../policy.js";
import { appendAudit } from "./audit.js";
import { runBackupCow } from "./backup.js";
import type { PlanResult } from "./plan.js";
import { restoreByRestorePointId } from "../restore.js";

export async function runMutationPipeline(
  action: ActionRequest,
  ctx: ExecuteContext,
  logs: string[],
  makePlan: (policy: Awaited<ReturnType<typeof loadNeoPolicy>>) => Promise<PlanResult>,
  commit: () => Promise<ExecuteResult>,
): Promise<ExecuteResult> {
  const stages: PipelineStages = {};
  const policy = await loadNeoPolicy(ctx.workspaceRoot);
  const safekeepRoot = path.join(ctx.workspaceRoot, ".neo-safekeep");

  const mPref = await runConstitutionPreflight({
    workspaceRoot: ctx.workspaceRoot,
    taskKind: "mutation_pipeline",
    workerKind: "neo",
    rawText: action.rawText,
    actionIntent: action.intent,
  });
  if (!mPref.ok) {
    return {
      ok: false,
      status: "error",
      summary: `[헌법 mutation 사전검사 차단]\n${mPref.summaryKo.fullText}`,
      logs: [...logs, "[constitution] mutation_pipeline preflight deny"],
      constitutionMutationPreflight: mPref,
      constitutionSummaryKo: mPref.summaryKo.fullText,
    };
  }

  const planResult = await makePlan(policy);
  if (!planResult.ok) {
    stages.plan = {
      status: "failed",
      summary: planResult.reason,
      affectedCount: 0,
    };
    await appendAudit(ctx.workspaceRoot, {
      timestamp: new Date().toISOString(),
      user: "local",
      commandId: action.id,
      category: action.category,
      intent: action.intent,
      isMutating: true,
      backupStatus: "failed",
      affectedPaths: [],
      result: "plan_failed",
      detail: planResult.reason,
    });
    return {
      ok: false,
      status: "error",
      summary: "PLAN 단계에서 거부되었습니다.",
      logs: [...logs, planResult.reason],
      pipelineStages: stages,
      constitutionMutationPreflight: mPref,
    };
  }

  const plan = planResult;
  stages.plan = {
    status: "success",
    summary: plan.summary,
    affectedCount: plan.items.length,
    totalBytes: plan.totalBytes,
  };
  logs.push(`[PLAN] ${plan.summary}`);

  if (action.isMutating) {
    const parts = {
      affectedPaths: plan.items.map((i) => i.originalPath),
      mutationKind: action.mutationKind,
      fileCount: plan.items.length,
      totalBytes: plan.totalBytes,
      overwriteTargets: plan.overwriteTargets,
    };
    const h = computeCanonicalPlanHash(action, parts, ctx.workspaceRoot);
    if (!ctx.approvalPreviewHash?.trim()) {
      stages.approvalHashVerified = {
        status: "failed",
        summary: "approvalPreviewHash 가 없습니다.",
        previewHash: h,
      };
      return {
        ok: false,
        status: "error",
        summary:
          "PLAN 미리보기 해시가 전달되지 않아 실행할 수 없습니다. parse 응답의 planPreview 를 확인하세요.",
        logs: [...logs, `expected hash ${h}`],
        pipelineStages: stages,
        constitutionMutationPreflight: mPref,
      };
    }
    if (ctx.approvalPreviewHash !== h) {
      stages.approvalHashVerified = {
        status: "failed",
        summary: "parse 시점 PLAN 과 실행 시점 PLAN 불일치",
        previewHash: h,
      };
      await appendAudit(ctx.workspaceRoot, {
        timestamp: new Date().toISOString(),
        user: "local",
        commandId: action.id,
        category: action.category,
        intent: action.intent,
        isMutating: true,
        backupStatus: "n/a",
        affectedPaths: plan.items.map((i) => i.originalPath),
        result: "approval_hash_mismatch",
        detail: `승인된 계획과 현재 실행 계획이 일치하지 않아 중단 · current=${h.slice(0, 16)}… approval=${String(ctx.approvalPreviewHash).slice(0, 16)}…`,
        eventType: "approval_hash_mismatch",
      });
      return {
        ok: false,
        status: "error",
        summary: "승인이 현재 실행 계획과 일치하지 않아 작업을 중단했습니다.",
        logs: [
          ...logs,
          `approvalPreviewHash=${ctx.approvalPreviewHash}`,
          `currentPreviewHash=${h}`,
        ],
        pipelineStages: stages,
        constitutionMutationPreflight: mPref,
      };
    }
    stages.approvalHashVerified = {
      status: "success",
      summary: "APPROVAL HASH VERIFIED — parse·실행 시점 PLAN 일치",
      previewHash: h,
    };
    logs.push(`[APPROVAL] hash verified ${h.slice(0, 16)}…`);
  }

  let restorePointId: string | undefined;
  let snapshotId: string | undefined;
  let manifestPath: string | undefined;

  if (plan.items.length === 0) {
    stages.backup = {
      status: "skipped",
      summary: "보존할 기존 파일 없음 — COW 생략",
      backupStatus: "success",
    };
    logs.push("[BACKUP] skipped (no existing files to preserve)");
  } else {
    const bak = await runBackupCow(ctx.workspaceRoot, action, plan.items);
    if (!bak.ok) {
      stages.backup = {
        status: "failed",
        summary: bak.reason,
        backupStatus: "failed",
      };
      logs.push(`[BACKUP] failed: ${bak.reason}`);
      await appendAudit(ctx.workspaceRoot, {
        timestamp: new Date().toISOString(),
        user: "local",
        commandId: action.id,
        category: action.category,
        intent: action.intent,
        isMutating: true,
        backupStatus: "failed",
        affectedPaths: plan.items.map((i) => i.originalPath),
        result: "backup_failed",
        detail: bak.reason,
      });
      return {
        ok: false,
        status: "error",
        summary: "원본 보존 실패로 인해 작업을 실행하지 않았습니다.",
        logs,
        pipelineStages: stages,
        safekeepRoot,
        constitutionMutationPreflight: mPref,
      };
    }
    restorePointId = bak.data.restorePointId;
    snapshotId = bak.data.snapshotId;
    manifestPath = bak.data.manifestPath;
    stages.backup = {
      status: "success",
      summary: `${plan.items.length}개 원본을 안전 영역에 보존했습니다.`,
      restorePointId,
      manifestPath,
      backupStatus: "success",
    };
    logs.push(`[BACKUP] restorePointId=${restorePointId} manifest=${manifestPath}`);
  }

  let commitResult: ExecuteResult;
  try {
    commitResult = await commit();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    stages.commit = { status: "failed", summary: msg };
    logs.push(`[COMMIT] error: ${msg}`);
    if (restorePointId) {
      logs.push("[ROLLBACK] snapshot 기준 복구 시도");
      const rb = await restoreByRestorePointId(ctx.workspaceRoot, restorePointId);
      logs.push(rb.summary);
    }
    const chained = await appendAudit(ctx.workspaceRoot, {
      timestamp: new Date().toISOString(),
      user: "local",
      commandId: action.id,
      category: action.category,
      intent: action.intent,
      isMutating: true,
      backupStatus: stages.backup?.backupStatus === "success" ? "success" : "skipped",
      restorePointId,
      affectedPaths: plan.items.map((i) => i.originalPath),
      result: "commit_failed",
      detail: msg,
    });
    stages.auditChain = {
      status: "success",
      summary: "AUDIT CHAIN APPENDED",
      entryHash: chained.entryHash,
    };
    return {
      ok: false,
      status: "error",
      summary: `COMMIT 실패: ${msg}`,
      logs,
      pipelineStages: stages,
      restorePointId,
      snapshotId,
      manifestPath,
      safekeepRoot,
      constitutionMutationPreflight: mPref,
    };
  }

  stages.commit = {
    status: commitResult.ok ? "success" : "failed",
    summary: commitResult.summary,
  };
  logs.push(`[COMMIT] ${commitResult.summary}`);

  if (!commitResult.ok && restorePointId) {
    logs.push("[ROLLBACK] COMMIT 실패 — snapshot 기준 복구 시도");
    const rb = await restoreByRestorePointId(ctx.workspaceRoot, restorePointId);
    logs.push(rb.summary);
  }

  const chained = await appendAudit(ctx.workspaceRoot, {
    timestamp: new Date().toISOString(),
    user: "local",
    commandId: action.id,
    category: action.category,
    intent: action.intent,
    isMutating: true,
    backupStatus: stages.backup?.backupStatus ?? "success",
    restorePointId,
    affectedPaths: plan.items.map((i) => i.originalPath),
    result: commitResult.ok ? "success" : "commit_error",
    detail: commitResult.summary,
  });
  stages.auditChain = {
    status: "success",
    summary: "AUDIT CHAIN APPENDED",
    entryHash: chained.entryHash,
  };

  return {
    ...commitResult,
    logs: [...logs, ...(commitResult.logs ?? [])],
    pipelineStages: stages,
    restorePointId,
    snapshotId,
    manifestPath,
    safekeepRoot,
    constitutionMutationPreflight: mPref,
  };
}

export { buildFileMovePlan, emptyPlan } from "./plan.js";
