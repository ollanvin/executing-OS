/**
 * App launch 관련 스텝 핸들러 building block.
 * Stage 1 composition(A안): app_launch 워크플로와 app_ready_screenshot이 동일 핸들러 맵을 공유한다.
 * 향후 B안(서브워크플로 호출)으로 옮길 때 이 모듈 경계가 자연스러운 분리점이 된다.
 */
import {
  adbGetForegroundPackage,
  adbLaunchPackageMonkey,
  adbPackageInstalled,
  foregroundMatchesPackage,
  sleepMs,
} from "../runtime/androidApp.js";
import { ensureAndroidDeviceOnline } from "../runtime/androidDevice.js";
import type { RecoverBeforeRetry, WorkflowStepHandler } from "./executor.js";
import { runEnsureAndroidDeviceStepCore } from "./ensureAndroidDeviceShared.js";
import type { AppLaunchWorkflowCtx } from "./appLaunchContext.js";
import type { WorkflowTrace } from "./types.js";
import {
  WORKFLOW_FAILURE_APP_LAUNCH_FAILED,
  WORKFLOW_FAILURE_APP_NOT_FOREGROUND,
  WORKFLOW_FAILURE_APP_NOT_INSTALLED,
  WORKFLOW_FAILURE_ENVIRONMENT,
  WORKFLOW_STEP_ENSURE_ANDROID_DEVICE,
  WORKFLOW_STEP_ENSURE_APP_FOREGROUND,
  WORKFLOW_STEP_ENSURE_APP_INSTALLED,
  WORKFLOW_STEP_LAUNCH_APP,
} from "./types.js";

export type AppLaunchHandlerOptions = {
  /**
   * true: app_launch_foreground 단독 워크플로 — 마지막 스텝이 foreground이므로 성공 시 ExecuteResult 요약을 붙인다.
   * false: composite 등 — 이후 스텝(예: screencap)이 있으므로 foreground는 중간 성공만 기록.
   */
  foregroundStepTerminalSummary: boolean;
};

export function buildAppLaunchStepHandlers(
  opts: AppLaunchHandlerOptions,
): Record<string, WorkflowStepHandler<AppLaunchWorkflowCtx>> {
  const ensureDevice: WorkflowStepHandler<AppLaunchWorkflowCtx> = (wctx, { step, attempt }) =>
    runEnsureAndroidDeviceStepCore(wctx, step, attempt);

  const ensureInstalled: WorkflowStepHandler<AppLaunchWorkflowCtx> = async (wctx) => {
    const r = await adbPackageInstalled(wctx.policy, wctx.packageName, wctx.logs);
    if (r.ok) return { ok: true, detail: "pm_path_ok" };
    return {
      ok: false,
      detail: r.message,
      failureTag: WORKFLOW_FAILURE_APP_NOT_INSTALLED,
      terminal: true,
      executeResult: {
        ok: false,
        status: "error",
        summary: `앱이 설치되어 있지 않습니다 (${wctx.packageName}). APK 설치 후 다시 시도하거나 NEO_MYPHONECHECK_PACKAGE 를 확인하세요.`,
        logs: wctx.logs,
      },
    };
  };

  const launchApp: WorkflowStepHandler<AppLaunchWorkflowCtx> = async (wctx, { step, attempt }) => {
    const r = await adbLaunchPackageMonkey(wctx.policy, wctx.packageName, wctx.logs);
    if (r.ok) {
      await sleepMs(1200);
      return { ok: true, detail: "monkey_ok" };
    }
    if (attempt >= step.maxAttempts) {
      return {
        ok: false,
        terminal: true,
        failureTag: WORKFLOW_FAILURE_APP_LAUNCH_FAILED,
        detail: r.message,
        executeResult: {
          ok: false,
          status: "error",
          summary: `앱 기동 실패: ${r.message}`,
          logs: wctx.logs,
        },
      };
    }
    return { ok: false, failureTag: WORKFLOW_FAILURE_APP_LAUNCH_FAILED, detail: r.message };
  };

  const ensureFg: WorkflowStepHandler<AppLaunchWorkflowCtx> = async (wctx, { step, attempt }) => {
    const fg = await adbGetForegroundPackage(wctx.policy, wctx.logs);
    if (!fg.ok) {
      return {
        ok: false,
        failureTag: WORKFLOW_FAILURE_ENVIRONMENT,
        detail: fg.message,
        terminal: attempt >= step.maxAttempts,
        executeResult:
          attempt >= step.maxAttempts
            ? {
                ok: false,
                status: "error",
                summary: `foreground 조회 실패: ${fg.message}`,
                logs: wctx.logs,
              }
            : undefined,
      };
    }
    if (foregroundMatchesPackage(fg.packageName, wctx.packageName)) {
      const base = {
        ok: true as const,
        detail: `foreground_ok:${fg.packageName ?? ""}`,
      };
      if (opts.foregroundStepTerminalSummary) {
        return {
          ...base,
          stepExecuteResult: {
            summary: `앱이 foreground에 있습니다 (${wctx.packageName}).`,
            nextSuggestedCommands: ["온보딩 화면 캡처", "최근 로그 보여줘", "MyPhoneCheck 에뮬레이터 돌려줘"],
          },
        };
      }
      return base;
    }
    const detail = fg.packageName
      ? `expected=${wctx.packageName} actual=${fg.packageName}`
      : "foreground_unknown";
    if (attempt >= step.maxAttempts) {
      return {
        ok: false,
        terminal: true,
        failureTag: WORKFLOW_FAILURE_APP_NOT_FOREGROUND,
        detail,
        executeResult: {
          ok: false,
          status: "error",
          summary: `foreground 불일치: ${detail}`,
          logs: wctx.logs,
        },
      };
    }
    return { ok: false, failureTag: WORKFLOW_FAILURE_APP_NOT_FOREGROUND, detail };
  };

  return {
    [WORKFLOW_STEP_ENSURE_ANDROID_DEVICE]: ensureDevice,
    [WORKFLOW_STEP_ENSURE_APP_INSTALLED]: ensureInstalled,
    [WORKFLOW_STEP_LAUNCH_APP]: launchApp,
    [WORKFLOW_STEP_ENSURE_APP_FOREGROUND]: ensureFg,
  };
}

/** app_launch_foreground 및 composite에서 동일 recover 정책 재사용 */
export const appLaunchRecoverBeforeRetry: RecoverBeforeRetry<AppLaunchWorkflowCtx> = async (
  wctxInner,
  { step, attempt, failure, trace: tr, logs: lg },
) => {
  if (step.id === WORKFLOW_STEP_LAUNCH_APP && failure.failureTag === WORKFLOW_FAILURE_APP_LAUNCH_FAILED) {
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
          summary: `기동 재시도 전 디바이스 확보 실패: ${again.reason}`,
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
  }

  if (
    step.id === WORKFLOW_STEP_ENSURE_APP_FOREGROUND &&
    failure.failureTag === WORKFLOW_FAILURE_APP_NOT_FOREGROUND
  ) {
    const rel = await adbLaunchPackageMonkey(wctxInner.policy, wctxInner.packageName, lg);
    if (!rel.ok) {
      return {
        recovered: false,
        executeResult: {
          ok: false,
          status: "error",
          summary: `foreground 재시도 전 앱 기동 실패: ${rel.message}`,
          logs: lg,
          workflowTrace: tr,
        },
      };
    }
    await sleepMs(1200);
    return {
      recovered: true,
      injectEntries: [
        {
          stepId: WORKFLOW_STEP_LAUNCH_APP,
          attempt,
          status: "success",
          detail: "replan:monkey",
        },
      ],
    };
  }
};
