import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { loadNeoPolicy, validateArtifactPath } from "../policy.js";
import {
  adbBin,
  ensureAndroidDeviceOnline,
  friendlyAdbScreencapError,
  isNoDeviceScreencapError,
} from "../runtime/androidDevice.js";
import { recordToolFailure, recordToolSuccess } from "../toolCircuitBreaker.js";
import type { ExecuteContext, ExecuteResult } from "../types.js";
import type { RecoverBeforeRetry, WorkflowStepHandler } from "./executor.js";
import type { InternalCellBaseCtx } from "./internalCellContext.js";
import { WORKFLOW_FAILURE_NO_ADB_DEVICE, WORKFLOW_STEP_CAPTURE_SCREENCAP, WORKFLOW_STEP_ENSURE_ANDROID_DEVICE } from "./types.js";

const execFileAsync = promisify(execFile);

export async function tryScreencapCommit(ctx: ExecuteContext, logs: string[]): Promise<ExecuteResult> {
  const policy = await loadNeoPolicy(ctx.workspaceRoot);
  const adb = adbBin();
  const dir = path.join(ctx.outputRoot, "screenshots");
  await fs.mkdir(dir, { recursive: true });
  const name = `capture-${Date.now()}.png`;
  const outPath = path.join(dir, name);

  const va = validateArtifactPath(outPath, policy);
  if (!va.ok) {
    return { ok: false, status: "error", summary: va.reason, logs };
  }

  let stdout: Buffer;
  try {
    const r = await execFileAsync(adb, ["exec-out", "screencap", "-p"], {
      encoding: "buffer",
      maxBuffer: 40 * 1024 * 1024,
      timeout: 60_000,
    });
    stdout = r.stdout as Buffer;
    recordToolSuccess("adb");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    recordToolFailure("adb", policy, msg);
    const friendly = friendlyAdbScreencapError(msg);
    logs.push(msg);
    return {
      ok: false,
      status: "error",
      summary: `스크린샷 실패: ${friendly}`,
      logs,
    };
  }

  const maxArt = policy.artifactMaxSizeMB * 1024 * 1024;
  if (stdout.length > maxArt) {
    return {
      ok: false,
      status: "error",
      summary: `스크린샷 크기가 artifactMaxSizeMB(${policy.artifactMaxSizeMB}) 를 초과합니다.`,
      logs: [...logs, `size=${stdout.length}`],
    };
  }

  await fs.writeFile(outPath, stdout);
  logs.push(`saved: ${outPath}`);

  const rel = `/artifacts/screenshots/${name}`;
  return {
    ok: true,
    status: "success",
    summary: "스크린샷을 저장했습니다. (Neo 워크플로: 디바이스 확보 → 캡처)",
    logs,
    artifacts: [{ label: "PNG", path: outPath, url: rel }],
  };
}

/** capture_screencap 스텝 — composite·raw screenshot 공통 (TCtx는 InternalCellBaseCtx 이상). */
export function buildCaptureScreencapStepHandler<
  TCtx extends InternalCellBaseCtx = InternalCellBaseCtx,
>(): WorkflowStepHandler<TCtx> {
  return async (wctx, { step, attempt }) => {
    const cap = await tryScreencapCommit(wctx.executeCtx, wctx.logs);
    if (cap.ok) {
      return { ok: true, stepExecuteResult: cap };
    }
    const lastLog = cap.logs[cap.logs.length - 1] ?? "";
    const noDev = isNoDeviceScreencapError(lastLog) || cap.summary.includes("기기 없음");
    if (!noDev) {
      return { ok: false, terminal: true, executeResult: cap, detail: cap.summary };
    }
    if (attempt >= step.maxAttempts) {
      return { ok: false, terminal: true, executeResult: cap, detail: cap.summary };
    }
    return {
      ok: false,
      failureTag: WORKFLOW_FAILURE_NO_ADB_DEVICE,
      detail: cap.summary,
    };
  };
}

export function buildScreencapNoDeviceRecover<
  TCtx extends InternalCellBaseCtx,
>(): RecoverBeforeRetry<TCtx> {
  return async (wctxInner, { step, attempt, failure, trace: tr, logs: lg }) => {
    if (step.id !== WORKFLOW_STEP_CAPTURE_SCREENCAP) return;
    if (failure.failureTag !== WORKFLOW_FAILURE_NO_ADB_DEVICE) return;

    lg.push(
      `[neo-workflow] screencap no-device — replan: 디바이스 재확보 후 재시도 (${attempt + 1}/${step.maxAttempts})`,
    );
    const again = await ensureAndroidDeviceOnline({
      workspaceRoot: wctxInner.executeCtx.workspaceRoot,
      logs: lg,
      policy: wctxInner.policy,
    });
    if (!again.ok) {
      return {
        recovered: false,
        executeResult: {
          ok: false,
          status: "error",
          summary: `캡처 재시도 전 디바이스 확보 실패: ${again.reason}`,
          logs: lg,
          workflowTrace: tr,
        },
      };
    }
    return {
      recovered: true,
      injectEntries: [
        {
          stepId: WORKFLOW_STEP_ENSURE_ANDROID_DEVICE,
          attempt: attempt + 1,
          status: "success",
          detail: `replan:${again.mode}`,
        },
      ],
    };
  };
}
