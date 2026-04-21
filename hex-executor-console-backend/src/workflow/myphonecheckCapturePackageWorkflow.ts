import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { loadNeoPolicy, validateArtifactPath } from "../policy.js";
import {
  dispatchExecutionStep,
  type DispatchExecutionContext,
  type SandboxJobDispatchPayload,
} from "../execution/dispatchExecutionStep.js";
import { inferExecutionTargetFromPayload } from "../execution/executionRouting.js";
import type { RoutedExecutionStep } from "../execution/executionRouting.js";
import { exploreAndCaptureAppStates } from "../exploration/exploreAndCaptureAppStates.js";
import { defaultCapturePolicy } from "../exploration/capturePolicy.js";
import { runMyPhoneCheckScenarioCapture } from "../exploration/myphonecheckScenarioCapture.js";
import { screenIdFileTag, shortScreenId } from "../exploration/screenId.js";
import {
  MYPHONECHECK_MIN_TOTAL_CAPTURES,
  MYPHONECHECK_SCENARIO_EXPECTED_CATEGORIES,
} from "../policy/myphonecheckScreenPolicy.js";
import { getNeoBackendRootFromOutputRoot } from "../preflight/stage1Preflight.js";
import {
  adbShellInputKeyEvents,
  adbScreencapPngToFile,
  sleepMs,
} from "../runtime/androidApp.js";
import { loadMyPhoneCheckCaptureConfig } from "../runtime/myphonecheckCaptureConfig.js";
import type { ExecuteContext, ExecuteResult, ScreenCaptureSummary } from "../types.js";
import { appLaunchRecoverBeforeRetry, buildAppLaunchStepHandlers } from "./appLaunchStepHandlers.js";
import { planMyPhoneCheckCapturePackage } from "./myphonecheckCapturePackagePlanner.js";
import type { MyPhoneCheckPackageCtx } from "./myphonecheckPackageContext.js";
import { runWorkflowPlan, type WorkflowStepHandler } from "./executor.js";
import type { WorkflowTrace } from "./types.js";
import {
  describePlannerModelForTrace,
  resolveMyPhoneCheckCaptureWorkflowPlan,
} from "../planner/plannerProvider.js";
import { isLlmPlannerEnabled } from "../planner/plannerConfig.js";
import {
  WORKFLOW_FAILURE_BUNDLE_BUILD,
  WORKFLOW_FAILURE_HOST_EXECUTOR,
  WORKFLOW_FAILURE_MODULE_CAPTURE,
  WORKFLOW_FAILURE_MODULE_NAVIGATION,
  WORKFLOW_FAILURE_ONBOARDING_CAPTURE,
  WORKFLOW_FAILURE_SANDBOX_BRIDGE,
  WORKFLOW_GOAL_MYPHONECHECK_CAPTURE_PACKAGE,
  WORKFLOW_STEP_BUILD_CONTROL_PLANE_BUNDLE,
  WORKFLOW_STEP_CAPTURE_MODULE_SEQUENCE,
  WORKFLOW_STEP_CAPTURE_ONBOARDING_SEQUENCE,
  WORKFLOW_STEP_EXPLORE_CAPTURE_APP_STATES,
  WORKFLOW_STEP_HOST_EXECUTOR_PREFLIGHT,
  WORKFLOW_STEP_NAVIGATE_MODULE_SCREENS,
  WORKFLOW_STEP_SANDBOX_BRIDGE_JOB,
} from "./types.js";

const execFileAsync = promisify(execFile);

function buildScreenCaptureSummary(ctx: MyPhoneCheckPackageCtx): ScreenCaptureSummary {
  const totalScreensCaptured = ctx.records.length;
  const screenIds = ctx.records.map((r) => r.screenId).filter((x): x is string => Boolean(x));
  const distinctScreenIds = new Set(screenIds).size;
  const perCategoryCounts: Record<string, number> = {};
  for (const r of ctx.records) {
    const key =
      r.category ??
      (r.kind === "onboarding"
        ? "onboarding"
        : r.kind === "module"
          ? "module"
          : r.kind === "scenario"
            ? "scenario"
            : "auto_explore");
    perCategoryCounts[key] = (perCategoryCounts[key] ?? 0) + 1;
  }
  const capturedScenarioCats = new Set(
    ctx.records.filter((x) => x.kind === "scenario" && x.category).map((x) => x.category!),
  );
  const missingCategories = MYPHONECHECK_SCENARIO_EXPECTED_CATEGORIES.filter((c) => !capturedScenarioCats.has(c));
  const screenIdsBySource = ctx.records
    .filter((r) => r.screenId)
    .map((r) => ({
      screenId: r.screenId!,
      shortId: screenIdFileTag(r.screenId!),
      source: r.kind,
      label: r.label,
      category: r.category,
    }));
  return {
    minScreensRequired: MYPHONECHECK_MIN_TOTAL_CAPTURES,
    totalScreensCaptured,
    distinctScreenIds,
    perCategoryCounts,
    missingCategories,
    screenIdsBySource,
  };
}

function sanitizeLabel(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
}

async function runScreenSequence(
  ctx: MyPhoneCheckPackageCtx,
  subdir: "onboarding" | "module",
  attempt: number,
  maxAttempts: number,
): Promise<
  | { ok: true }
  | { ok: false; detail: string; terminal: boolean }
> {
  const steps =
    subdir === "onboarding" ? ctx.mpc.onboarding.steps : ctx.mpc.moduleScreens.steps;
  let idx = 0;
  for (const st of steps) {
    idx++;
    if (st.delayBeforeMs && st.delayBeforeMs > 0) await sleepMs(st.delayBeforeMs);
    const fname = `${String(ctx.nextCaptureOrder + 1).padStart(3, "0")}_${sanitizeLabel(st.label)}.png`;
    const abs = path.join(ctx.bundleRoot, "captures", subdir, fname);
    const va = validateArtifactPath(abs, ctx.policy);
    if (!va.ok) {
      return { ok: false, detail: `${subdir}[${st.label}]: ${va.reason}`, terminal: attempt >= maxAttempts };
    }
    const cap = await adbScreencapPngToFile(ctx.policy, abs, ctx.logs);
    if (!cap.ok) {
      return {
        ok: false,
        detail: `${subdir}[${st.label}]: ${cap.message}`,
        terminal: attempt >= maxAttempts,
      };
    }
    ctx.nextCaptureOrder++;
    const rel = path.relative(ctx.bundleRoot, abs).split(path.sep).join("/");
    ctx.records.push({
      relativePath: rel,
      kind: subdir === "onboarding" ? "onboarding" : "module",
      label: st.label,
      order: ctx.nextCaptureOrder,
    });
    const after = st.keyEventsAfter ?? [];
    if (after.length > 0) {
      const k = await adbShellInputKeyEvents(ctx.policy, after, ctx.logs);
      if (!k.ok) {
        return {
          ok: false,
          detail: `${subdir}[${st.label}] keyEventsAfter: ${k.message}`,
          terminal: attempt >= maxAttempts,
        };
      }
    }
  }
  return { ok: true };
}

function buildMyPhoneCheckHandlers(): Record<string, WorkflowStepHandler<MyPhoneCheckPackageCtx>> {
  const base = buildAppLaunchStepHandlers({ foregroundStepTerminalSummary: false }) as Record<
    string,
    WorkflowStepHandler<MyPhoneCheckPackageCtx>
  >;

  const onboarding: WorkflowStepHandler<MyPhoneCheckPackageCtx> = async (ctx, { step, attempt }) => {
    const r = await runScreenSequence(ctx, "onboarding", attempt, step.maxAttempts);
    if (!r.ok) {
      return {
        ok: false,
        failureTag: WORKFLOW_FAILURE_ONBOARDING_CAPTURE,
        detail: r.detail,
        terminal: r.terminal,
        executeResult:
          r.terminal
            ? {
                ok: false,
                status: "error",
                summary: `온보딩 캡처 실패: ${r.detail}`,
                logs: ctx.logs,
              }
            : undefined,
      };
    }
    return { ok: true, detail: `onboarding_frames=${ctx.mpc.onboarding.steps.length}` };
  };

  const navigateModule: WorkflowStepHandler<MyPhoneCheckPackageCtx> = async (ctx, { step, attempt }) => {
    const nav = ctx.mpc.moduleNavigation;
    if (nav.delayBeforeMs && nav.delayBeforeMs > 0) await sleepMs(nav.delayBeforeMs);
    const keys = nav.keyEvents ?? [];
    if (keys.length === 0) {
      return { ok: true, detail: "module_nav_skipped" };
    }
    const k = await adbShellInputKeyEvents(ctx.policy, keys, ctx.logs);
    if (!k.ok) {
      return {
        ok: false,
        failureTag: WORKFLOW_FAILURE_MODULE_NAVIGATION,
        detail: k.message,
        terminal: attempt >= step.maxAttempts,
        executeResult:
          attempt >= step.maxAttempts
            ? {
                ok: false,
                status: "error",
                summary: `모듈 네비게이션 실패: ${k.message}`,
                logs: ctx.logs,
              }
            : undefined,
      };
    }
    return { ok: true, detail: "module_nav_ok" };
  };

  const moduleCap: WorkflowStepHandler<MyPhoneCheckPackageCtx> = async (ctx, { step, attempt }) => {
    const r = await runScreenSequence(ctx, "module", attempt, step.maxAttempts);
    if (!r.ok) {
      return {
        ok: false,
        failureTag: WORKFLOW_FAILURE_MODULE_CAPTURE,
        detail: r.detail,
        terminal: r.terminal,
        executeResult:
          r.terminal
            ? {
                ok: false,
                status: "error",
                summary: `모듈 캡처 실패: ${r.detail}`,
                logs: ctx.logs,
              }
            : undefined,
      };
    }
    return { ok: true, detail: `module_frames=${ctx.mpc.moduleScreens.steps.length}` };
  };

  const hostPreflight: WorkflowStepHandler<MyPhoneCheckPackageCtx> = async (ctx, { step, attempt }) => {
    const backendRoot = getNeoBackendRootFromOutputRoot(ctx.executeCtx.outputRoot);
    const dctx: DispatchExecutionContext = {
      backendRoot,
      workspaceRoot: ctx.executeCtx.workspaceRoot,
      outputRoot: ctx.executeCtx.outputRoot,
      policy: ctx.policy,
      logger: (line) => ctx.logs.push(line),
    };

    const adbPayload = { kind: "adb" as const, args: ["version"] };
    const adbStep: RoutedExecutionStep = {
      id: "myphonecheck-preflight-adb",
      title: "ADB version (dispatcher)",
      target: inferExecutionTargetFromPayload(adbPayload),
      payload: adbPayload,
    };
    const adbDispatch = await dispatchExecutionStep(adbStep, dctx);
    ctx.executionTargetsUsed.push(adbDispatch.target);
    ctx.dispatchAudit.push({
      routedId: adbStep.id,
      target: adbDispatch.target,
      summary: adbDispatch.summary,
    });

    const fsDirs = [
      ctx.bundleRoot,
      path.join(ctx.bundleRoot, "captures", "onboarding"),
      path.join(ctx.bundleRoot, "captures", "module"),
      path.join(ctx.bundleRoot, "captures", "auto"),
    ];
    const fsPayload = { kind: "fs_prepare" as const, createDirs: fsDirs };
    const fsStep: RoutedExecutionStep = {
      id: "myphonecheck-preflight-fs",
      title: "Bundle captures dirs (dispatcher)",
      target: inferExecutionTargetFromPayload(fsPayload),
      payload: fsPayload,
    };
    const fsDispatch = await dispatchExecutionStep(fsStep, dctx);
    ctx.executionTargetsUsed.push(fsDispatch.target);
    ctx.dispatchAudit.push({
      routedId: fsStep.id,
      target: fsDispatch.target,
      summary: fsDispatch.summary,
    });

    ctx.hostExecutionTrace.push({
      workflowStepId: WORKFLOW_STEP_HOST_EXECUTOR_PREFLIGHT,
      executionTarget: "ollama_host",
      routedPayload: { adb: adbPayload, fs_prepare: fsPayload, dispatcher: true },
      results: [
        {
          taskKind: adbDispatch.hostResult?.taskKind ?? "adb",
          ok: adbDispatch.ok,
          summary: adbDispatch.summary,
          stdoutTail: adbDispatch.hostResult?.stdoutTail,
        },
        {
          taskKind: fsDispatch.hostResult?.taskKind ?? "fs_prepare",
          ok: fsDispatch.ok,
          summary: fsDispatch.summary,
          changedPaths: fsDispatch.hostResult?.changedPaths,
        },
      ],
    });

    if (!adbDispatch.ok || !fsDispatch.ok) {
      const detail = !adbDispatch.ok
        ? `adb: ${adbDispatch.error ?? adbDispatch.summary}`
        : `fs_prepare: ${fsDispatch.error ?? fsDispatch.summary}`;
      return {
        ok: false,
        failureTag: WORKFLOW_FAILURE_HOST_EXECUTOR,
        detail,
        terminal: attempt >= step.maxAttempts,
        executeResult:
          attempt >= step.maxAttempts
            ? {
                ok: false,
                status: "error",
                summary: `Host Executor preflight 실패: ${detail}`,
                logs: ctx.logs,
              }
            : undefined,
      };
    }
    return { ok: true, detail: "host_preflight_dispatcher_ok" };
  };

  const sandboxBridge: WorkflowStepHandler<MyPhoneCheckPackageCtx> = async (ctx, { step, attempt }) => {
    const backendRoot = getNeoBackendRootFromOutputRoot(ctx.executeCtx.outputRoot);
    const dctx: DispatchExecutionContext = {
      backendRoot,
      workspaceRoot: ctx.executeCtx.workspaceRoot,
      outputRoot: ctx.executeCtx.outputRoot,
      policy: ctx.policy,
      logger: (line) => ctx.logs.push(line),
    };
    const sandboxPayload: SandboxJobDispatchPayload = {
      task: "generic_script",
      params: { bundle: path.basename(ctx.bundleRoot), workflow: "myphonecheck_capture_package" },
      profile: "myphonecheck",
      timeoutMs: 120_000,
      completeWithAgent: "real-process",
    };
    const sandboxStep: RoutedExecutionStep = {
      id: "myphonecheck-sandbox-bridge",
      title: "Sandbox bridge (dispatcher, real-process agent)",
      target: inferExecutionTargetFromPayload({ task: sandboxPayload.task }),
      payload: sandboxPayload,
    };
    const dr = await dispatchExecutionStep(sandboxStep, dctx);
    ctx.executionTargetsUsed.push(dr.target);
    ctx.dispatchAudit.push({
      routedId: sandboxStep.id,
      target: dr.target,
      summary: dr.summary,
    });

    if (!dr.ok || !dr.sandboxMeta || !dr.sandboxResult) {
      return {
        ok: false,
        failureTag: WORKFLOW_FAILURE_SANDBOX_BRIDGE,
        detail: dr.error ?? dr.summary,
        terminal: attempt >= step.maxAttempts,
        executeResult:
          attempt >= step.maxAttempts
            ? {
                ok: false,
                status: "error",
                summary: `sandbox-bridge 실패: ${dr.error ?? dr.summary}`,
                logs: ctx.logs,
              }
            : undefined,
      };
    }
    ctx.sandboxBridgeJob = {
      jobId: dr.sandboxMeta.jobId,
      sharedRoot: dr.sandboxMeta.sharedRoot,
      status: dr.sandboxResult.status,
      summary: dr.sandboxResult.summary,
      logs: dr.sandboxResult.logs,
      artifacts: dr.sandboxResult.artifacts,
    };
    ctx.logs.push(`[sandbox-bridge] ${dr.sandboxResult.summary}`);
    return { ok: true, detail: `sandbox_job=${dr.sandboxMeta.jobId}` };
  };

  const exploreAuto: WorkflowStepHandler<MyPhoneCheckPackageCtx> = async (ctx) => {
    const backendRoot = getNeoBackendRootFromOutputRoot(ctx.executeCtx.outputRoot);
    try {
      const scenario = await runMyPhoneCheckScenarioCapture({
        bundleRoot: ctx.bundleRoot,
        workspaceRoot: ctx.executeCtx.workspaceRoot,
        outputRoot: ctx.executeCtx.outputRoot,
        backendRoot,
        policy: ctx.policy,
        logger: (line) => ctx.logs.push(line),
      });
      ctx.scenarioCaptureResult = scenario;
      ctx.emulatorScreenCaptureTrace.push(...scenario.emulatorScreenCaptureEvents);
      for (const cap of scenario.captures) {
        ctx.nextCaptureOrder++;
        ctx.records.push({
          relativePath: cap.relativePath,
          kind: "scenario",
          label: cap.label,
          order: ctx.nextCaptureOrder,
          screenId: cap.screenId,
          category: cap.category,
        });
      }

      const r = await exploreAndCaptureAppStates({
        appId: ctx.packageName,
        backendRoot,
        workspaceRoot: ctx.executeCtx.workspaceRoot,
        outputRoot: ctx.executeCtx.outputRoot,
        bundleRoot: ctx.bundleRoot,
        policy: ctx.policy,
        capturePolicy: defaultCapturePolicy(),
        seedSeenScreenIds: scenario.seenScreenIds,
        logger: (line) => ctx.logs.push(line),
      });
      ctx.explorationResult = r;
      ctx.emulatorScreenCaptureTrace.push(...r.emulatorScreenCaptureEvents);
      for (const st of r.states) {
        ctx.nextCaptureOrder++;
        const rel = path.relative(ctx.bundleRoot, st.screenshotPath).split(path.sep).join("/");
        ctx.records.push({
          relativePath: rel,
          kind: "auto",
          label: `screen-${screenIdFileTag(st.screenId)}`,
          order: ctx.nextCaptureOrder,
          screenId: st.screenId,
          category: "auto_explore",
        });
      }
      const distinct = r.stats.distinctScreenIdsCaptured;
      return {
        ok: true,
        detail: `scenario=${scenario.captures.length} auto_explore=${r.states.length} distinctScreenIds(explore)=${distinct}`,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      ctx.logs.push(`[explore] fatal: ${msg}`);
      ctx.explorationResult = null;
      ctx.scenarioCaptureResult = null;
      return { ok: true, detail: `auto_explore skipped: ${msg}` };
    }
  };

  const buildBundle: WorkflowStepHandler<MyPhoneCheckPackageCtx> = async (ctx) => {
    const manifestPath = path.join(ctx.bundleRoot, "manifest.json");
    const va = validateArtifactPath(manifestPath, ctx.policy);
    if (!va.ok) {
      return {
        ok: false,
        terminal: true,
        failureTag: WORKFLOW_FAILURE_BUNDLE_BUILD,
        detail: va.reason,
        executeResult: {
          ok: false,
          status: "error",
          summary: `manifest 경로 거부: ${va.reason}`,
          logs: ctx.logs,
        },
      };
    }
    const manifest = {
      schemaVersion: 1,
      goalId: WORKFLOW_GOAL_MYPHONECHECK_CAPTURE_PACKAGE,
      appId: "MyPhoneCheck",
      packageName: ctx.packageName,
      environment: "emulator",
      captureScope: ["onboarding", "module", "scenario", "auto"],
      generatedAt: new Date().toISOString(),
      bundleRootRelative: path.relative(ctx.executeCtx.outputRoot, ctx.bundleRoot).split(path.sep).join("/"),
      captures: ctx.records,
      screenCaptureSummary: buildScreenCaptureSummary(ctx),
      emulatorScreenCaptureTrace: ctx.emulatorScreenCaptureTrace,
      scenarioCapture:
        ctx.scenarioCaptureResult == null
          ? undefined
          : {
              ok: ctx.scenarioCaptureResult.ok,
              seenScreenIdsCount: ctx.scenarioCaptureResult.seenScreenIds.length,
              categoriesCaptured: ctx.scenarioCaptureResult.categoriesCaptured,
            },
      autoExploration:
        ctx.explorationResult == null
          ? undefined
          : {
              totalStatesVisited: ctx.explorationResult.totalStatesVisited,
              totalScreenshots: ctx.explorationResult.totalScreenshots,
              finishedAt: ctx.explorationResult.finishedAt,
              totalExploreSteps: ctx.explorationResult.stats.totalSteps,
              distinctScreenIdsCaptured: ctx.explorationResult.stats.distinctScreenIdsCaptured,
              capturedScreenIdsOrdered: ctx.explorationResult.stats.capturedScreenIdsOrdered.map((id) =>
                id.slice(0, 12),
              ),
            },
    };
    try {
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        terminal: true,
        failureTag: WORKFLOW_FAILURE_BUNDLE_BUILD,
        detail: msg,
        executeResult: {
          ok: false,
          status: "error",
          summary: `manifest 작성 실패: ${msg}`,
          logs: ctx.logs,
        },
      };
    }

    let zipPath: string | null = null;
    if (process.platform === "win32") {
      zipPath = `${ctx.bundleRoot}.zip`;
      const vaz = validateArtifactPath(zipPath, ctx.policy);
      if (vaz.ok) {
        const br = ctx.bundleRoot.replace(/'/g, "''");
        const zp = zipPath.replace(/'/g, "''");
        try {
          await execFileAsync(
            "powershell.exe",
            [
              "-NoProfile",
              "-Command",
              `Compress-Archive -LiteralPath '${br}' -DestinationPath '${zp}' -Force`,
            ],
            { timeout: 180_000 },
          );
        } catch (e) {
          ctx.logs.push(`[bundle] zip: ${e instanceof Error ? e.message : String(e)}`);
          zipPath = null;
        }
      } else {
        ctx.logs.push(`[bundle] zip 경로 정책 거부: ${vaz.reason}`);
        zipPath = null;
      }
    } else {
      ctx.logs.push("[bundle] zip 생략 (Windows 외 — manifest 만 전달)");
    }

    const relDir = path.relative(ctx.executeCtx.outputRoot, ctx.bundleRoot).split(path.sep).join("/");
    const manifestRel = `${relDir}/manifest.json`.replace(/^\/+/, "");
    const artifacts: NonNullable<ExecuteResult["artifacts"]> = [
      {
        label: "control_plane_manifest",
        path: manifestPath,
        url: `/artifacts/${manifestRel}`,
      },
    ];
    if (zipPath) {
      const zrel = path.relative(ctx.executeCtx.outputRoot, zipPath).split(path.sep).join("/");
      artifacts.push({ label: "control_plane_bundle_zip", path: zipPath, url: `/artifacts/${zrel}` });
    }

    const autoN = ctx.explorationResult?.totalScreenshots ?? 0;
    const scenarioN = ctx.scenarioCaptureResult?.captures.length ?? 0;
    const screenCap = buildScreenCaptureSummary(ctx);
    return {
      ok: true,
      detail: `manifest+captures=${ctx.records.length}`,
      stepExecuteResult: {
        summary: `컨트롤플레인 전달 패키지 준비 완료 (${ctx.records.length}장${scenarioN ? `, 시나리오 ${scenarioN}` : ""}${autoN ? `, 자동탐색 ${autoN}` : ""}, manifest + ${zipPath ? "zip" : "폴더"})`,
        artifacts,
        nextSuggestedCommands: ["최근 로그 보여줘", "MyPhoneCheck 에뮬레이터 돌려줘"],
        hostExecutionTrace: ctx.hostExecutionTrace,
        sandboxBridgeJob: ctx.sandboxBridgeJob ?? undefined,
        executionTargetsUsed: ctx.executionTargetsUsed,
        dispatchAudit: ctx.dispatchAudit,
        screenCaptureSummary: screenCap,
        emulatorScreenCaptureTrace: ctx.emulatorScreenCaptureTrace,
      },
    };
  };

  return {
    ...base,
    [WORKFLOW_STEP_HOST_EXECUTOR_PREFLIGHT]: hostPreflight,
    [WORKFLOW_STEP_CAPTURE_ONBOARDING_SEQUENCE]: onboarding,
    [WORKFLOW_STEP_NAVIGATE_MODULE_SCREENS]: navigateModule,
    [WORKFLOW_STEP_CAPTURE_MODULE_SEQUENCE]: moduleCap,
    [WORKFLOW_STEP_EXPLORE_CAPTURE_APP_STATES]: exploreAuto,
    [WORKFLOW_STEP_SANDBOX_BRIDGE_JOB]: sandboxBridge,
    [WORKFLOW_STEP_BUILD_CONTROL_PLANE_BUNDLE]: buildBundle,
  };
}

/**
 * Stage 1 golden path: 고수준 “온보딩+모듈 캡처 → 컨트롤플레인 파일” 오더.
 */
export async function executeMyPhoneCheckCapturePackageWorkflow(
  ctx: ExecuteContext,
  logs: string[],
  opts: { packageName: string; scenarioId?: string | null; userGoalText?: string },
): Promise<ExecuteResult> {
  const policy = await loadNeoPolicy(ctx.workspaceRoot);
  const mpc = await loadMyPhoneCheckCaptureConfig(ctx.workspaceRoot);
  const bundleRoot = path.join(
    ctx.outputRoot,
    "control-plane-delivery",
    `myphonecheck-${Date.now()}`,
  );

  const staticPlan = planMyPhoneCheckCapturePackage();
  const llmOn = isLlmPlannerEnabled();
  const resolved = await resolveMyPhoneCheckCaptureWorkflowPlan({
    userGoalText: opts.userGoalText,
    policy,
    logs,
    llmEnabled: llmOn,
  });
  const modelMeta = llmOn ? describePlannerModelForTrace() : null;
  const trace: WorkflowTrace = {
    goalId: staticPlan.goalId,
    entries: [],
    planSource: resolved.planSource,
    plannerModelKind: modelMeta?.kind,
    plannerModelName: modelMeta?.name,
    plannerNotes: resolved.plannerPlan?.notes,
    llmPlanRejectedReason: resolved.rejectReason,
  };
  const wctx: MyPhoneCheckPackageCtx = {
    executeCtx: ctx,
    logs,
    policy,
    packageName: opts.packageName,
    scenarioId: opts.scenarioId,
    bundleRoot,
    mpc,
    records: [],
    nextCaptureOrder: 0,
    explorationResult: null,
    scenarioCaptureResult: null,
    emulatorScreenCaptureTrace: [],
    hostExecutionTrace: [],
    sandboxBridgeJob: null,
    executionTargetsUsed: [],
    dispatchAudit: [],
  };

  return runWorkflowPlan({
    plan: resolved.workflowPlan,
    ctx: wctx,
    logs,
    trace,
    handlers: buildMyPhoneCheckHandlers(),
    recoverBeforeRetry: appLaunchRecoverBeforeRetry,
  });
}
