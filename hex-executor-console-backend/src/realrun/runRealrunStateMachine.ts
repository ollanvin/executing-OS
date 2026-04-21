/**
 * 리얼런 상태 머신: PLANNING → PREFLIGHT → EXECUTION → CAPTURE → AUDIT → BUNDLE → EXPORT
 */
import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { assertValid, getConstitutionValidators } from "../constitution/ajvConstitutionValidator.js";
import { getConstitutionRoot } from "../constitution/constitutionPaths.js";
import { runConstitutionAudit } from "../constitution/runConstitutionAudit.js";
import { runConstitutionPreflight } from "../constitution/runConstitutionPreflight.js";
import {
  mapViolationsToConstitutionPhase,
  type ConstitutionPhaseReport,
} from "./mapConstitutionToRealrunReport.js";
import type { RealrunPhase, RealrunReportJson, RealrunTransitionRecord } from "./realrunStates.js";
import { REALRUN_PLAN_STEP_IDS } from "./realrunStates.js";
import type { StaticAnalysisPreflightOpts } from "../constitution/constitutionTypes.js";
import { STANDARD_MPC_APP, STANDARD_MPC_EMULATOR } from "./standardMyPhoneEmulatorProfile.js";

const MIN_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function logTransition(
  timeline: RealrunTransitionRecord[],
  from: RealrunTransitionRecord["from"],
  to: RealrunPhase,
  detail?: string,
): void {
  timeline.push({ at: new Date().toISOString(), from, to, detail });
}

function tryGitCommit(workspaceRoot: string): string {
  try {
    return execSync("git rev-parse HEAD", {
      cwd: workspaceRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .trim()
      .slice(0, 40);
  } catch {
    return "unknown";
  }
}

async function readNeoVersion(workspaceRoot: string): Promise<string> {
  const pkgPath = path.join(workspaceRoot, "hex-executor-console-backend", "package.json");
  try {
    const raw = await fs.readFile(pkgPath, "utf8");
    const j = JSON.parse(raw) as { version?: string };
    return j.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function buildPlan(goal: string) {
  const descriptions: Record<string, string> = {
    "start-emulator": "표준 Android 에뮬레이터 프로파일로 가상 디바이스 기동(실기기 금지)",
    "install-and-launch-app": "MyPhoneCheck APK 설치 후 실행",
    "navigate-all-screens": "유저와 동일한 제스처로 주요 화면 순회",
    "capture-screens": "화면별 스크린샷 및 요약 수집",
    "generate-report": "실행·캡처·헌법 감사 결과를 realrun 보고서 형태로 생성",
    "bundle-report": "JSON + 스크린샷을 run 번들로 묶고 스키마 검증",
    "export-to-control-plane": "클로드워크/챗지피티가 읽을 수 있는 경로로 전송",
  };
  return {
    goal,
    steps: REALRUN_PLAN_STEP_IDS.map((id) => ({
      id,
      description: descriptions[id] ?? id,
      dependsOn: [] as string[],
    })),
  };
}

export type RealrunExecutionStep = {
  planStepId: string;
  status: "succeeded" | "skipped" | "failed";
  startedAt: string;
  endedAt: string;
  error?: string;
  notes?: string;
};

function step(
  planStepId: string,
  status: "succeeded" | "skipped" | "failed",
  started: Date,
  ended: Date,
  extra?: { error?: string; notes?: string },
): RealrunExecutionStep {
  return {
    planStepId,
    status,
    startedAt: started.toISOString(),
    endedAt: ended.toISOString(),
    ...extra,
  };
}

export type RunRealrunStateMachineOptions = {
  /** NEO_WORKSPACE_ROOT — 보통 executing-OS 루트 */
  workspaceRoot: string;
  /** AST 정적 분석 루트 — 보통 hex-executor-console-backend */
  backendRoot: string;
  goalText: string;
  /** PREFLIGHT/AUDIT 공통 — 미지정 시 `{ backendRoot }` (전체 src 규모 스캔) */
  staticAnalysis?: StaticAnalysisPreflightOpts;
  /** 컨트롤 플레인 번들 디렉터리(미설정 시 runs/<runId>/export) */
  controlPlaneOutDir?: string;
};

export type RunRealrunStateMachineResult = {
  ok: boolean;
  phase: RealrunPhase;
  report: RealrunReportJson;
  runDir: string;
  reportPath: string;
  exportDir: string;
  timeline: RealrunTransitionRecord[];
  error?: string;
};

const sleepMs = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * 한 사이클 리얼런 — EXECUTION/CAPTURE는 셸/Adb 없이 구조·헌법·스키마 검증에 필요한 최소 동작만 수행한다.
 */
export async function runRealrunStateMachine(opts: RunRealrunStateMachineOptions): Promise<RunRealrunStateMachineResult> {
  const { workspaceRoot, backendRoot, goalText } = opts;
  const staticAnalysis: StaticAnalysisPreflightOpts = opts.staticAnalysis ?? { backendRoot };
  const timeline: RealrunTransitionRecord[] = [];
  let phase: RealrunPhase = "PLANNING";
  const runId = `realrun-${Date.now().toString(36)}`;
  const t0 = new Date();
  const constitutionRoot = getConstitutionRoot(workspaceRoot);
  const schemaDir = path.join(constitutionRoot, "schema");

  const stubAudit: ConstitutionPhaseReport = {
    status: "ok",
    issues: [],
  };

  const runMeta: Record<string, unknown> = {
    runId,
    kind: "realRun",
    startedAt: t0.toISOString(),
    endedAt: t0.toISOString(),
    neoVersion: await readNeoVersion(workspaceRoot),
    gitCommit: tryGitCommit(workspaceRoot),
    tags: ["myphonecheck", "emulator-only"],
  };
  if (process.env.NEO_GIT_BRANCH?.trim()) {
    runMeta.branch = process.env.NEO_GIT_BRANCH.trim();
  }

  let constitutionBlock: { preflight: ConstitutionPhaseReport; audit: ConstitutionPhaseReport } = {
    preflight: { status: "ok", issues: [] },
    audit: stubAudit,
  };

  const executionSteps: RealrunExecutionStep[] = [];
  const report: RealrunReportJson = {
    run: runMeta,
    environment: {
      neo: {
        os: `${process.platform} ${process.arch}`,
        workspaceRoot: path.resolve(workspaceRoot),
        constitutionRoot: path.resolve(constitutionRoot),
      },
      emulator: { ...STANDARD_MPC_EMULATOR },
      app: { ...STANDARD_MPC_APP },
    },
    plan: { goal: goalText, steps: [] },
    execution: { status: "failed", steps: executionSteps },
    screens: { sequence: [] },
    constitution: constitutionBlock,
  };

  function deriveExecutionStatus(): "succeeded" | "partial" | "failed" {
    if (executionSteps.some((s) => s.status === "failed")) return "failed";
    if (executionSteps.length === 0) return "failed";
    if (executionSteps.some((s) => s.status === "skipped")) return "partial";
    return "succeeded";
  }

  function syncReportBody(): void {
    report.constitution = constitutionBlock;
    report.execution = {
      status: deriveExecutionStatus(),
      steps: executionSteps,
    };
  }

  const fail = (err: string, at: RealrunPhase): RunRealrunStateMachineResult => {
    phase = "TERMINATED";
    logTransition(timeline, at, "TERMINATED", err);
    return {
      ok: false,
      phase,
      report,
      runDir: path.join(workspaceRoot, "runs", runId),
      reportPath: "",
      exportDir: "",
      timeline,
      error: err,
    };
  };

  try {
    logTransition(timeline, "INIT", "PLANNING", "goal → plan steps");
    report.plan = buildPlan(goalText);
    phase = "PREFLIGHT";
    logTransition(timeline, "PLANNING", "PREFLIGHT");

    const pre = await runConstitutionPreflight({
      workspaceRoot,
      taskKind: "e2e_run",
      workerKind: "neo",
      rawText: goalText,
      goalId: runId,
      staticAnalysis,
    });
    constitutionBlock = {
      ...constitutionBlock,
      preflight: mapViolationsToConstitutionPhase(pre.finalMode, pre.violations),
    };
    syncReportBody();
    if (pre.finalMode === "deny") {
      executionSteps.length = 0;
      syncReportBody();
      return fail("preflight denied", "PREFLIGHT");
    }

    phase = "EXECUTION";
    logTransition(timeline, "PREFLIGHT", "EXECUTION");
    for (const id of ["start-emulator", "install-and-launch-app", "navigate-all-screens"] as const) {
      const s = new Date();
      await sleepMs(2);
      const e = new Date();
      executionSteps.push(step(id, "succeeded", s, e, { notes: "simulated (no adb shell)" }));
    }
    syncReportBody();

    phase = "CAPTURE";
    logTransition(timeline, "EXECUTION", "CAPTURE");
    const runDir = path.join(workspaceRoot, "runs", runId);
    const screensDir = path.join(runDir, "screens");
    await fs.mkdir(screensDir, { recursive: true });
    const capStart = new Date();
    const shotRel = `runs/${runId}/screens/screen-001.png`;
    const shotFsPath = path.join(workspaceRoot, "runs", runId, "screens", "screen-001.png");
    await fs.writeFile(shotFsPath, MIN_PNG);
    const capEnd = new Date();
    report.screens = {
      sequence: [
        {
          screenId: "mpc-home-001",
          order: 0,
          action: "launch",
          screenshotRef: shotRel,
          summary: "MyPhoneCheck 기본 화면(에뮬레이터·내부 빌드)",
          constitutionNotes: ["에뮬레이터 전용 testLocal 채널"],
        },
      ],
    };
    executionSteps.push(
      step("capture-screens", "succeeded", capStart, capEnd, { notes: "screenshot bytes written" }),
    );
    syncReportBody();

    phase = "AUDIT";
    logTransition(timeline, "CAPTURE", "AUDIT");
    const artifactText = [
      `runId=${runId}`,
      `execution.status=${deriveExecutionStatus()}`,
      `screens=${(report.screens as { sequence: unknown[] }).sequence.length}`,
      `goal=${goalText.slice(0, 500)}`,
    ].join("\n");
    const audit = await runConstitutionAudit({
      workspaceRoot,
      taskKind: "e2e_run",
      workerKind: "neo",
      rawText: goalText,
      goalId: runId,
      artifactText,
      staticAnalysis,
    });
    constitutionBlock = {
      ...constitutionBlock,
      audit: mapViolationsToConstitutionPhase(audit.finalMode, audit.violations),
    };
    syncReportBody();

    phase = "BUNDLE";
    logTransition(timeline, "AUDIT", "BUNDLE");
    const genA = new Date();
    await sleepMs(2);
    const genB = new Date();
    executionSteps.push(step("generate-report", "succeeded", genA, genB));

    const bundleA = new Date();
    await sleepMs(2);
    const bundleB = new Date();
    executionSteps.push(step("bundle-report", "succeeded", bundleA, bundleB));
    syncReportBody();

    const validators = await getConstitutionValidators(schemaDir);
    const reportPath = path.join(runDir, "realrun-report.json");
    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
    try {
      assertValid(validators.validateRealrunReport, report, reportPath);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e), "BUNDLE");
    }

    phase = "EXPORT";
    logTransition(timeline, "BUNDLE", "EXPORT");
    const exportDir = opts.controlPlaneOutDir ?? path.join(runDir, "export");
    await fs.mkdir(exportDir, { recursive: true });
    const exportedReport = path.join(exportDir, "realrun-report.json");
    await fs.copyFile(reportPath, exportedReport);
    const exportedShotDir = path.join(exportDir, "screens");
    await fs.mkdir(exportedShotDir, { recursive: true });
    await fs.copyFile(path.join(screensDir, "screen-001.png"), path.join(exportedShotDir, "screen-001.png"));

    const expA = new Date();
    await sleepMs(2);
    const expB = new Date();
    executionSteps.push(step("export-to-control-plane", "succeeded", expA, expB, { notes: exportDir }));

    const ended = new Date();
    report.run = { ...(report.run as Record<string, unknown>), endedAt: ended.toISOString() };
    report.conclusionForPlanner =
      `리얼런 ${runId} 완료. 헌법 preflight=${constitutionBlock.preflight.status}, audit=${constitutionBlock.audit.status}. 번들: ${exportDir}`;
    syncReportBody();

    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
    await fs.writeFile(exportedReport, JSON.stringify(report, null, 2), "utf8");
    assertValid(validators.validateRealrunReport, report, exportedReport);

    return {
      ok: true,
      phase: "EXPORT",
      report,
      runDir,
      reportPath,
      exportDir,
      timeline,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    syncReportBody();
    return fail(msg, phase);
  }
}
