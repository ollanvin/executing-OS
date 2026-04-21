import { ensureAndroidDeviceOnline } from "../runtime/androidDevice.js";
import type { WorkflowStepHandlerResult } from "./executor.js";
import type { InternalCellBaseCtx } from "./internalCellContext.js";
import type { WorkflowStep } from "./types.js";

/**
 * ensure_android_device 스텝의 공통 구현 (스크린샷·에뮬 전용 워크플로가 재사용).
 * 성공 시 detail 형식: `${mode}` 또는 `${mode}:${avd}`
 */
export async function runEnsureAndroidDeviceStepCore(
  wctx: InternalCellBaseCtx,
  step: WorkflowStep,
  attempt: number,
): Promise<WorkflowStepHandlerResult> {
  const res = await ensureAndroidDeviceOnline({
    workspaceRoot: wctx.executeCtx.workspaceRoot,
    logs: wctx.logs,
    policy: wctx.policy,
  });
  if (res.ok) {
    return {
      ok: true,
      detail: res.mode + (res.avd ? `:${res.avd}` : ""),
    };
  }
  return {
    ok: false,
    detail: res.reason,
    terminal: attempt >= step.maxAttempts,
    executeResult:
      attempt >= step.maxAttempts
        ? {
            ok: false,
            status: "error",
            summary: `Neo 워크플로 중단(디바이스 확보 실패): ${res.reason}`,
            logs: wctx.logs,
          }
        : undefined,
  };
}

function parseEnsureDetail(detail: string): { mode: string; avd?: string } {
  const i = detail.indexOf(":");
  if (i === -1) return { mode: detail };
  return { mode: detail.slice(0, i), avd: detail.slice(i + 1) };
}

/**
 * emulator_ensure_boot 전용: 마지막 스텝이므로 사용자 요약·nextSuggestedCommands를 붙인다.
 */
export async function runEmulatorEnsureBootOnlyStepHandler(
  wctx: InternalCellBaseCtx,
  args: { step: WorkflowStep; attempt: number },
): Promise<WorkflowStepHandlerResult> {
  const core = await runEnsureAndroidDeviceStepCore(wctx, args.step, args.attempt);
  if (!core.ok) return core;
  const { mode, avd } = parseEnsureDetail(core.detail ?? "");
  const summary =
    mode === "already_online"
      ? "adb 연결된 기기가 이미 있습니다. (추가 에뮬 기동 없음)"
      : `Neo가 에뮬레이터를 기동하고 adb 연결을 확보했습니다${avd ? ` (${avd})` : ""}.`;
  return {
    ok: true,
    detail: core.detail,
    stepExecuteResult: {
      summary,
      nextSuggestedCommands: ["온보딩 화면 캡처", "최근 로그 보여줘"],
    },
  };
}
