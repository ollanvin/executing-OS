import fs from "node:fs/promises";
import path from "node:path";
import { commitFileMoveAtomic } from "./fileMoveAtomic.js";
import { loadNeoPolicy, validateArtifactPath, validateMutatingPath } from "./policy.js";
import type { ToolBreakerKey } from "./policy.js";
import { readRecentLogArtifact } from "./recentLogs.js";
import { getSystemStatus } from "./systemStatus.js";
import { buildFileMovePlan, emptyPlan, runMutationPipeline } from "./safekeep/pipeline.js";
import { runStage1MyPhoneCapturePreflight, getNeoBackendRootFromOutputRoot } from "./preflight/stage1Preflight.js";
import { buildMyphonecheckCaptureBundleRunPlan } from "./workflow/goals/myphonecheckCaptureGoal.js";
import { runOrchestratedPlan } from "./workflow/orchestratorEngine.js";
import { executeMyPhoneCheckCapturePackageWorkflow } from "./workflow/myphonecheckCapturePackageWorkflow.js";
import { executeAppReadyScreenshotWorkflow } from "./workflow/appReadyScreenshotWorkflow.js";
import {
  executeAppLaunchForegroundWorkflow,
  resolveLaunchPackageFromActionArgs,
} from "./workflow/appLaunchWorkflow.js";
import { executeEmulatorEnsureWorkflow } from "./workflow/emulatorEnsureWorkflow.js";
import { executeRuntimeScreenshotWorkflow } from "./workflow/screenshotWorkflow.js";
import {
  evaluateToolBreaker,
  recordToolFailure,
  recordToolSuccess,
} from "./toolCircuitBreaker.js";
import { runNeoActionWithConstitution } from "./constitution/neoActionConstitution.js";
import type { ActionRequest, ExecuteContext, ExecuteResult } from "./types.js";

async function blockIfToolBreaker(
  key: ToolBreakerKey,
  workspaceRoot: string,
): Promise<ExecuteResult | null> {
  const policy = await loadNeoPolicy(workspaceRoot);
  const ev = evaluateToolBreaker(key, policy);
  if (!ev.allowed) {
    return {
      ok: false,
      status: "error",
      summary: ev.reason ?? `${key} circuit breaker`,
      logs: [],
      breakerBlocked: true,
      pipelineStages: {
        circuitBreaker: { status: "failed", summary: `${key}: ${ev.reason ?? ev.phase}` },
      },
    };
  }
  return null;
}

export async function executeAction(
  action: ActionRequest,
  ctx: ExecuteContext,
): Promise<ExecuteResult> {
  const logs: string[] = [`intent=${action.intent}`, `category=${action.category}`];

  try {
    if (action.requiresApproval && !ctx.approved) {
      return {
        ok: false,
        status: "error",
        summary: "이 작업은 승인이 필요합니다. UI에서 승인 후 다시 실행하세요.",
        logs: [...logs, "blocked: approval required"],
      };
    }

    return await runNeoActionWithConstitution(action, ctx, logs, () => executeActionDispatch(action, ctx, logs));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      status: "error",
      summary: `실행 오류: ${msg}`,
      logs: [...logs, msg],
    };
  }
}

async function executeActionDispatch(
  action: ActionRequest,
  ctx: ExecuteContext,
  logs: string[],
): Promise<ExecuteResult> {
  switch (action.intent) {
      case "myphonecheck_capture_package": {
        const bAdb = await blockIfToolBreaker("adb", ctx.workspaceRoot);
        if (bAdb) return bAdb;
        const bEmu = await blockIfToolBreaker("emulator", ctx.workspaceRoot);
        if (bEmu) return bEmu;
        const pkg = resolveLaunchPackageFromActionArgs(action.args as Record<string, unknown>);
        const pf = await runStage1MyPhoneCapturePreflight({
          backendRoot: getNeoBackendRootFromOutputRoot(ctx.outputRoot),
          outputRoot: ctx.outputRoot,
          workspaceRoot: ctx.workspaceRoot,
          packageName: pkg,
        });
        if (pf.status === "FAIL") {
          return {
            ok: false,
            status: "error",
            summary: `Stage1 preflight 실패 (${pf.failures.length}건)`,
            logs: [
              ...logs,
              ...pf.failures.map((f) => `[preflight:${f.code}] ${f.line}`),
            ],
          };
        }
        if (!pkg) {
          return {
            ok: false,
            status: "error",
            summary: "Stage1 preflight 이후 패키지명이 비어 있습니다(내부 불변식 위반).",
            logs: [...logs, "invariant: package missing after preflight PASS"],
          };
        }
        const scenarioId =
          typeof action.args.scenarioId === "string" ? action.args.scenarioId : null;
        return await runMutationPipeline(
          action,
          ctx,
          logs,
          async (policy) => {
            const vo = validateMutatingPath(ctx.outputRoot, policy);
            if (!vo.ok) return { ok: false, reason: vo.reason };
            const delivery = path.join(ctx.outputRoot, "control-plane-delivery");
            const vd = validateMutatingPath(delivery, policy);
            if (!vd.ok) return { ok: false, reason: vd.reason };
            return emptyPlan(
              "PLAN: myphonecheck_capture_package — 에뮬·앱·온보딩/모듈 캡처·manifest·(zip) 컨트롤플레인 패키지.",
            );
          },
          async () =>
            executeMyPhoneCheckCapturePackageWorkflow(ctx, logs, {
              packageName: pkg,
              scenarioId,
              userGoalText: action.rawText,
            }),
        );
      }
      case "myphonecheck_capture_bundle_run": {
        const bAdb = await blockIfToolBreaker("adb", ctx.workspaceRoot);
        if (bAdb) return bAdb;
        const bEmu = await blockIfToolBreaker("emulator", ctx.workspaceRoot);
        if (bEmu) return bEmu;
        const pkg = resolveLaunchPackageFromActionArgs(action.args as Record<string, unknown>);
        if (!pkg) {
          return {
            ok: false,
            status: "error",
            summary:
              "패키지명이 필요합니다. NEO_MYPHONECHECK_PACKAGE 환경 변수를 설정하거나 요청에 패키지를 포함하세요. (capture_bundle_run)",
            logs: [...logs, "missing package for myphonecheck_capture_bundle_run"],
          };
        }
        const scenarioId =
          typeof action.args.scenarioId === "string" ? action.args.scenarioId : null;
        return await runMutationPipeline(
          action,
          ctx,
          logs,
          async (policy) => {
            const vo = validateMutatingPath(ctx.outputRoot, policy);
            if (!vo.ok) return { ok: false, reason: vo.reason };
            const delivery = path.join(ctx.outputRoot, "control-plane-delivery");
            const vd = validateMutatingPath(delivery, policy);
            if (!vd.ok) return { ok: false, reason: vd.reason };
            return emptyPlan(
              "PLAN: myphonecheck_capture_bundle_run — 오케스트레이션(preflight·host·캡처·번들·리포트).",
            );
          },
          async () => {
            const orch = await runOrchestratedPlan(buildMyphonecheckCaptureBundleRunPlan(), {
              workspaceRoot: ctx.workspaceRoot,
              outputRoot: ctx.outputRoot,
              backendRoot: getNeoBackendRootFromOutputRoot(ctx.outputRoot),
              runsDir: path.join(ctx.workspaceRoot, "runs"),
              packageName: pkg,
              userGoalText: action.rawText,
              scenarioId,
              writeUxReport: true,
            });
            const wf = orch.workflowResult;
            const stepLogs = orch.stepResults.map((s) => `[${s.stepId}] ${s.summary}`);
            if (!wf) {
              return {
                ok: false,
                status: "error",
                summary: orch.highLevelSummaryKo,
                logs: [...logs, ...stepLogs],
              };
            }
            return {
              ok: orch.ok,
              status: orch.ok ? "success" : "error",
              summary: orch.highLevelSummaryKo,
              logs: [...logs, ...stepLogs],
              workflowTrace: wf.workflowTrace,
              hostExecutionTrace: wf.hostExecutionTrace,
              sandboxBridgeJob: wf.sandboxBridgeJob,
              executionTargetsUsed: wf.executionTargetsUsed,
              dispatchAudit: wf.dispatchAudit,
              screenCaptureSummary: orch.screenCaptureSummary ?? wf.screenCaptureSummary,
              emulatorScreenCaptureTrace: wf.emulatorScreenCaptureTrace,
              e2eVerification: orch.e2eVerification,
              manifestPath: wf.manifestPath,
            };
          },
        );
      }
      case "myphonecheck_app_ready_screenshot": {
        const bAdb = await blockIfToolBreaker("adb", ctx.workspaceRoot);
        if (bAdb) return bAdb;
        const bEmu = await blockIfToolBreaker("emulator", ctx.workspaceRoot);
        if (bEmu) return bEmu;
        const pkg = resolveLaunchPackageFromActionArgs(action.args as Record<string, unknown>);
        if (!pkg) {
          return {
            ok: false,
            status: "error",
            summary:
              "패키지명을 알 수 없습니다. NEO_MYPHONECHECK_PACKAGE 환경 변수를 설정하세요. (app_ready_screenshot)",
            logs: [...logs, "missing package for myphonecheck_app_ready_screenshot"],
          };
        }
        const scenarioId =
          typeof action.args.scenarioId === "string" ? action.args.scenarioId : null;
        return await runMutationPipeline(
          action,
          ctx,
          logs,
          async (policy) => {
            const vo = validateMutatingPath(ctx.outputRoot, policy);
            if (!vo.ok) return { ok: false, reason: vo.reason };
            const dir = path.join(ctx.outputRoot, "screenshots");
            const vd = validateMutatingPath(dir, policy);
            if (!vd.ok) return { ok: false, reason: vd.reason };
            return emptyPlan(
              "PLAN: app_ready_screenshot — Neo composite(디바이스 → 앱 foreground → PNG).",
            );
          },
          async () =>
            executeAppReadyScreenshotWorkflow(ctx, logs, {
              packageName: pkg,
              scenarioId,
            }),
        );
      }
      case "myphonecheck_app_launch": {
        const bAdb = await blockIfToolBreaker("adb", ctx.workspaceRoot);
        if (bAdb) return bAdb;
        const bEmu = await blockIfToolBreaker("emulator", ctx.workspaceRoot);
        if (bEmu) return bEmu;
        const pkg = resolveLaunchPackageFromActionArgs(action.args as Record<string, unknown>);
        if (!pkg) {
          return {
            ok: false,
            status: "error",
            summary:
              "패키지명을 알 수 없습니다. NEO_MYPHONECHECK_PACKAGE 환경 변수를 설정하거나 요청에 패키지를 포함하세요.",
            logs: [...logs, "missing package for myphonecheck_app_launch"],
          };
        }
        const scenarioId =
          typeof action.args.scenarioId === "string" ? action.args.scenarioId : null;
        return await runMutationPipeline(
          action,
          ctx,
          logs,
          async () =>
            emptyPlan(
              "PLAN: app_launch_foreground — Neo 워크플로(디바이스 확보 → 설치 확인 → 기동 → foreground). 로컬 기기 상태 변경.",
            ),
          async () =>
            executeAppLaunchForegroundWorkflow(ctx, logs, {
              packageName: pkg,
              scenarioId,
            }),
        );
      }
      case "myphonecheck_emulator": {
        const b = await blockIfToolBreaker("emulator", ctx.workspaceRoot);
        if (b) return b;
        return await runMutationPipeline(
          action,
          ctx,
          logs,
          async () =>
            emptyPlan(
              "PLAN: emulator_ensure_boot — Neo 워크플로(디바이스 확보·필요 시 AVD 자동 기동). 워크스페이스 파일 변경 없음, 로컬 OS/프로세스 상태 변경 있음.",
            ),
          async () => executeEmulatorEnsureWorkflow(ctx, logs),
        );
      }
      case "adb_screenshot": {
        const b = await blockIfToolBreaker("adb", ctx.workspaceRoot);
        if (b) return b;
        return await runMutationPipeline(
          action,
          ctx,
          logs,
          async (policy) => {
            const vo = validateMutatingPath(ctx.outputRoot, policy);
            if (!vo.ok) return { ok: false, reason: vo.reason };
            const dir = path.join(ctx.outputRoot, "screenshots");
            const vd = validateMutatingPath(dir, policy);
            if (!vd.ok) return { ok: false, reason: vd.reason };
            return emptyPlan(
              "PLAN: 런타임 스크린샷 — Neo 워크플로(디바이스 확보·필요 시 AVD 자동 기동 → screencap).",
            );
          },
          async () => runAdbScreenshotCommit(ctx, logs),
        );
      }
      case "recent_logs":
        return await runRecentLogs(ctx, logs);
      case "file_move": {
        const b = await blockIfToolBreaker("file_move_mutation", ctx.workspaceRoot);
        if (b) return b;
        return await runMutationPipeline(
          action,
          ctx,
          logs,
          (pol) => buildFileMovePlan(action, pol),
          async () => runFileMoveCommit(action, ctx, logs),
        );
      }
      case "system_status":
        return await runSystemStatus(logs, ctx.workspaceRoot);
      case "unknown":
        return {
          ok: false,
          status: "error",
          summary: String(action.args.hint ?? "명령을 해석하지 못했습니다."),
          logs,
          nextSuggestedCommands: [
            "MyPhoneCheck 온보딩 첫 화면 캡처해줘",
            "MyPhoneCheck 앱 실행해줘",
            "MyPhoneCheck 에뮬레이터 돌려줘",
            "최근 로그 보여줘",
            "온보딩 화면 캡처",
          ],
        };
      case "vm_operation":
      case "app_install_or_download":
      case "app_launch":
      case "app_launch_generic":
        return await runMutationPipeline(
          action,
          ctx,
          logs,
          async () =>
            emptyPlan(
              `PLAN: ${action.intent} — 고위험·mutating 작업 (실행기 미연결, 백업 파이프라인만 선행).`,
            ),
          async () => ({
            ok: false,
            status: "error",
            summary: `아직 로컬 실행기에 연결되지 않은 작업입니다: ${action.intent}`,
            logs: [
              "고위험 작업은 PLAN·BACKUP 단계 후 COMMIT에서 실제 실행됩니다. 현재 COMMIT 핸들러가 없습니다.",
            ],
          }),
        );
      default:
        return {
          ok: false,
          status: "error",
          summary: `아직 실행기에 연결되지 않은 intent: ${action.intent}`,
          logs: [...logs, "no handler"],
          nextSuggestedCommands: ["최근 로그 보여줘", "adb devices 상태 확인해줘"],
        };
    }
}

async function runAdbScreenshotCommit(ctx: ExecuteContext, logs: string[]): Promise<ExecuteResult> {
  const out = await executeRuntimeScreenshotWorkflow(ctx, logs);
  if (out.ok && !out.nextSuggestedCommands?.length) {
    return {
      ...out,
      nextSuggestedCommands: ["다음 화면 캡처", "최근 로그 보여줘"],
    };
  }
  return out;
}

async function runRecentLogs(ctx: ExecuteContext, logs: string[]): Promise<ExecuteResult> {
  await fs.mkdir(ctx.runsDir, { recursive: true });
  const { path: p, excerpt, logs: scanLogs } = await readRecentLogArtifact(ctx.runsDir, 20);
  logs.push(...scanLogs.slice(0, 22));

  return {
    ok: true,
    status: "success",
    summary: p
      ? `가장 최근 로그 파일: ${p}`
      : "runs 폴더에 로그 파일이 아직 없습니다.",
    logs,
    artifacts: p ? [{ label: "로그 파일", path: p }] : undefined,
    nextSuggestedCommands: ["최근 Neo runs 요약만 다시 보여줘", "executor logs"],
  };
}

async function runFileMoveCommit(
  action: ActionRequest,
  ctx: ExecuteContext,
  logs: string[],
): Promise<ExecuteResult> {
  const policy = await loadNeoPolicy(ctx.workspaceRoot);
  const src = path.resolve(action.args.source as string);
  const dest = path.resolve(action.args.destination as string);
  const overwrite = Boolean(action.args.overwrite);

  logs.push(`COMMIT: ${src} -> ${dest}`, `overwrite=${overwrite}`);

  const mv = await commitFileMoveAtomic(src, dest, overwrite, logs);
  if (!mv.ok) {
    recordToolFailure("file_move_mutation", policy, mv.error ?? "move failed");
    return {
      ok: false,
      status: "error",
      summary: `파일 이동 실패: ${mv.error}`,
      logs,
    };
  }

  recordToolSuccess("file_move_mutation");

  return {
    ok: true,
    status: "success",
    summary: `이동 완료: ${src} → ${dest}`,
    logs,
    nextSuggestedCommands: ["최근 로그 보여줘"],
  };
}

async function runSystemStatus(logs: string[], workspaceRoot: string): Promise<ExecuteResult> {
  const st = await getSystemStatus(workspaceRoot);
  const lines = [
    `ANDROID_HOME: ${st.androidHome ?? "(없음)"}`,
    `adb: ${st.adbPath ?? "(없음)"}`,
    ...st.adbDevices,
    `메모: ${st.emulatorHint}`,
  ];
  logs.push(...lines);
  return {
    ok: true,
    status: "success",
    summary: "로컬 시스템·adb 상태를 조회했습니다.",
    logs,
    nextSuggestedCommands: ["MyPhoneCheck 에뮬레이터 돌려줘", "화면 캡처"],
  };
}
