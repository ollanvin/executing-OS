import type { ConstitutionAuditResult, ConstitutionPreflightResult } from "./constitution/constitutionTypes.js";
import type { ExecutionTarget } from "./execution/executionRouting.js";
import type { EmulatorScreenCaptureEvent } from "./exploration/emulatorScreenCaptureHost.js";
import type { WorkflowTrace } from "./workflow/types.js";

export type ActionCategory =
  | "FILE_OP"
  | "APP_OP"
  | "EMULATOR_OP"
  | "VM_OP"
  | "LOG_OP"
  | "SYSTEM_OP";

export type ExecuteStatus = "queued" | "running" | "success" | "error";

export type MutationKind =
  | "NONE"
  | "FILE_CREATE"
  | "FILE_MODIFY"
  | "FILE_DELETE"
  | "FILE_MOVE"
  | "APP_INSTALL"
  | "APP_UPDATE"
  | "VM_STATE_CHANGE"
  | "EMULATOR_STATE_CHANGE";

export type BackupStatus = "pending" | "success" | "failed";

/** parse 직후 (mutation 메타 없음) */
export type ParsedAction = {
  id: string;
  rawText: string;
  category: ActionCategory;
  intent: string;
  intentLabel: string;
  args: Record<string, unknown>;
  requiresApproval: boolean;
  executionSummary: string;
};

/** finalize 이후 — 클라이언트가 mutation 필드를 낮출 수 없음 */
export type ActionRequest = ParsedAction & {
  isMutating: boolean;
  backupRequired: boolean;
  mutationKind: MutationKind;
  internalHighRisk: boolean;
};

export type PipelineStageStatus = "pending" | "running" | "success" | "skipped" | "failed";

export type PipelineStages = {
  plan?: {
    status: PipelineStageStatus;
    summary: string;
    affectedCount: number;
    totalBytes?: number;
  };
  approvalHashVerified?: {
    status: PipelineStageStatus;
    summary: string;
    previewHash?: string;
  };
  backup?: {
    status: PipelineStageStatus;
    summary: string;
    restorePointId?: string;
    manifestPath?: string;
    backupStatus?: BackupStatus;
  };
  commit?: {
    status: PipelineStageStatus;
    summary: string;
  };
  auditChain?: {
    status: PipelineStageStatus;
    summary: string;
    entryHash?: string;
  };
  circuitBreaker?: {
    status: PipelineStageStatus;
    summary: string;
  };
};

export type ExecuteResult = {
  ok: boolean;
  status: ExecuteStatus;
  summary: string;
  logs: string[];
  artifacts?: { label: string; path: string; url?: string }[];
  nextSuggestedCommands?: string[];
  pipelineStages?: PipelineStages;
  restorePointId?: string;
  snapshotId?: string;
  manifestPath?: string;
  safekeepRoot?: string;
  breakerBlocked?: boolean;
  /** Planner/Executor 워크플로 추적 (예: 런타임 스크린샷 recover 단계) */
  workflowTrace?: WorkflowTrace;
  /** Iteration 2+: MyPhoneCheck 등에서 Host Executor 실행 결과 요약 */
  hostExecutionTrace?: HostExecutionTraceEntry[];
  /** Iteration 2+: sandbox-bridge job 왕복 결과 */
  sandboxBridgeJob?: SandboxBridgeJobSummary;
  /** Iteration 3: dispatcher에서 사용한 target 순서 */
  executionTargetsUsed?: string[];
  dispatchAudit?: Array<{ routedId: string; target: ExecutionTarget; summary: string }>;
  /**
   * smoke:e2e-myphone-bundle 강화 검증 (host trace / sandbox ok / ScreenId·최소 장수 등).
   * 스모크 스크립트가 워크플로 결과와 번들을 합쳐 채움.
   */
  e2eVerification?: E2eMyPhoneBundleVerification;
  /** MyPhoneCheck build 번들 단계에서 집계 — 질적 화면·카테고리 요약 */
  screenCaptureSummary?: ScreenCaptureSummary;
  /** Host Executor `screen_capture` (Emulator/Simulator Screen Capture) 이벤트 누적 */
  emulatorScreenCaptureTrace?: EmulatorScreenCaptureEvent[];
  /** 앱팩토리 헌법 1.0 — 대표용 한 줄 요약(사전+사후 합본) */
  constitutionSummaryKo?: string;
  constitutionPreflight?: ConstitutionPreflightResult;
  constitutionAudit?: ConstitutionAuditResult;
  /** mutation pipeline 전용 사전검사 (중첩) */
  constitutionMutationPreflight?: ConstitutionPreflightResult;
};

/** build_control_plane_bundle 성공 시 MyPhoneCheck 캡처 요약 */
export type ScreenCaptureSummary = {
  minScreensRequired: number;
  totalScreensCaptured: number;
  distinctScreenIds: number;
  perCategoryCounts: Record<string, number>;
  missingCategories: string[];
  screenIdsBySource: Array<{
    screenId: string;
    shortId: string;
    source: string;
    label?: string;
    category?: string;
  }>;
};

/** smoke:e2e-myphone-bundle — 에뮬 창 크롭·백엔드 요약 */
export type E2eScreenCaptureVerification = {
  minScreensRequired: number;
  totalScreensCaptured: number;
  distinctScreenIdsCaptured: number;
  perCategoryCounts: Record<string, number>;
  backendsUsed: string[];
  /** host_window + 유효 rect 가 한 건 이상이면 true */
  emulatorWindowCropOk: boolean;
};

export type E2eMyPhoneBundleVerification = {
  ok: boolean;
  /** exit 1을 유발하는 필수 누락(host/sandbox/auto≥1 등) */
  missing: string[];
  minScreensRequired?: number;
  totalScreensCaptured?: number;
  distinctScreenIds?: number;
  distinctScreenIdsCaptured?: number;
  perCategoryCounts?: Record<string, number>;
  missingCategories?: string[];
  /** 최소 장수·시나리오 카테고리 등 — 참고용(이번 Iteration에서는 exit와 무관할 수 있음) */
  reportGaps?: string[];
  screenCapture?: E2eScreenCaptureVerification;
};

/** MyPhoneCheck Stage 1 등에서 host_executor_preflight 스텝 로그용 */
export type HostExecutionTraceEntry = {
  workflowStepId: string;
  executionTarget: "ollama_host";
  routedPayload: unknown;
  results: Array<{
    taskKind: string;
    ok: boolean;
    summary: string;
    changedPaths?: string[];
    stdoutTail?: string[];
  }>;
};

export type SandboxBridgeJobSummary = {
  jobId: string;
  sharedRoot: string;
  status: string;
  summary: string;
  logs?: string[];
  artifacts?: string[];
};

export type ManifestItem = {
  originalPath: string;
  backupPath: string;
  sha256: string;
  size: number;
  mtimeMs: number;
  existsBefore: boolean;
};

export type SnapshotManifest = {
  restorePointId: string;
  snapshotId: string;
  commandId: string;
  createdAt: string;
  intent: string;
  mutationKind: MutationKind;
  items: ManifestItem[];
  integritySha256?: string;
};

export type ExecuteContext = {
  workspaceRoot: string;
  outputRoot: string;
  runsDir: string;
  approved: boolean;
  approvalPreviewHash?: string | null;
};
