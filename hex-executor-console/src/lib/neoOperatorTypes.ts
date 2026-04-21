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
    backupStatus?: "pending" | "success" | "failed";
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

export type PlanPreviewPayload = {
  previewHash: string;
  summary: string;
  affectedPaths: string[];
  fileCount: number;
  totalBytes: number;
  overwriteTargets: string[];
  mutationKind: string;
  policyLevel: string;
};

/** parse / 로컬 분류 직후 (mutation 메타는 finalize에서만 채움) */
export type OperatorParsedAction = {
  id: string;
  rawText: string;
  category: ActionCategory;
  intent: string;
  intentLabel: string;
  args: Record<string, unknown>;
  requiresApproval: boolean;
  executionSummary: string;
};

export type OperatorAction = OperatorParsedAction & {
  isMutating: boolean;
  backupRequired: boolean;
  mutationKind: MutationKind;
  internalHighRisk: boolean;
};

export type OperatorExecuteResult = {
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
};

export type OperatorTurn = {
  id: string;
  userText: string;
  phase:
    | "parsing"
    | "await_approval"
    | "running"
    | "done"
    | "error"
    | "cancelled";
  action?: OperatorAction;
  offlineParse?: boolean;
  planPreview?: PlanPreviewPayload | null;
  result?: OperatorExecuteResult;
  error?: string;
};
