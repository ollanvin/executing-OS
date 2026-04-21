import fs from "node:fs/promises";
import path from "node:path";
import type { MutationKind } from "./types.js";

export type ToolBreakerKey =
  | "gemini"
  | "ollama"
  | "emulator"
  | "adb"
  | "file_move_mutation"
  | "mutating_pipeline";

export type OneBreakerPolicy = {
  failureThreshold?: number;
  cooldownSeconds?: number;
  probeSuccessesRequired?: number;
  manualResetRequired?: boolean;
};

export type NeoPolicy = {
  allowedRoots: string[];
  forbiddenRoots: string[];
  maxBackupSizeMB: number;
  maxFilesPerCommand: number;
  highRiskActions: string[];
  /** UI / 감사용 라벨 */
  policyLevel: string;
  maxItemsPerCommit: number;
  maxBytesPerCommit: number;
  maxMutatingCommandsPerMinute: number;
  maxConsecutiveFailures: number;
  artifactAllowedRoots: string[];
  artifactRetentionDays: number;
  artifactMaxSizeMB: number;
  /** tool/provider별 circuit breaker (OPEN/HALF_OPEN/CLOSED) */
  breakers?: Partial<Record<ToolBreakerKey, OneBreakerPolicy>>;
};

export function workspaceAllowedRoots(workspaceRoot: string): string[] {
  return [
    path.resolve(workspaceRoot),
    path.resolve(workspaceRoot, "hex-executor-console-backend", "output"),
  ];
}

/** Neo `output` 아래에서 스크린샷·컨트롤플레인 번들만 아티팩트로 허용 (백엔드 루트 밖으로는 나가지 않음). */
export function defaultArtifactRootsUnderOutput(outputDir: string): string[] {
  return [
    path.join(outputDir, "screenshots"),
    path.join(outputDir, "control-plane-delivery"),
    /** 샌드박스 inbox/outbox·bridge 아티팩트 (호스트 NEO ↔ 격리 환경) */
    path.join(outputDir, "sandbox-bridge"),
  ];
}

export function defaultPolicy(workspaceRoot: string): NeoPolicy {
  const roots = workspaceAllowedRoots(workspaceRoot);
  const maxBackup = 1024;
  return {
    allowedRoots: roots,
    forbiddenRoots: [
      path.resolve("C:\\Windows"),
      path.resolve("C:\\Program Files"),
      path.resolve("C:\\Program Files (x86)"),
    ],
    maxBackupSizeMB: maxBackup,
    maxFilesPerCommand: 1000,
    highRiskActions: [
      "FILE_DELETE",
      "FILE_MOVE",
      "APP_INSTALL",
      "APP_UPDATE",
      "VM_STATE_CHANGE",
      "EMULATOR_STATE_CHANGE",
    ],
    policyLevel: "default",
    maxItemsPerCommit: 1000,
    maxBytesPerCommit: maxBackup * 1024 * 1024,
    maxMutatingCommandsPerMinute: 30,
    maxConsecutiveFailures: 5,
    artifactAllowedRoots: defaultArtifactRootsUnderOutput(roots[1]),
    artifactRetentionDays: 30,
    artifactMaxSizeMB: 25,
    breakers: {},
  };
}

export async function loadNeoPolicy(workspaceRoot: string): Promise<NeoPolicy> {
  const policyPath = path.join(workspaceRoot, ".neo-policy.json");
  const base = defaultPolicy(workspaceRoot);
  try {
    const raw = await fs.readFile(policyPath, "utf8");
    const j = JSON.parse(raw) as Partial<NeoPolicy>;
    const extra = (j.allowedRoots ?? []).map((p) => path.resolve(p));
    const allowedRoots = [...new Set([...workspaceAllowedRoots(workspaceRoot), ...extra])];
    const artRoots = (j.artifactAllowedRoots?.length ? j.artifactAllowedRoots : base.artifactAllowedRoots).map(
      (p) => path.resolve(p),
    );
    const breakers = {
      ...base.breakers,
      ...(typeof j.breakers === "object" && j.breakers ? j.breakers : {}),
    };
    return {
      allowedRoots,
      forbiddenRoots: (j.forbiddenRoots?.length ? j.forbiddenRoots : base.forbiddenRoots).map(
        (p) => path.resolve(p),
      ),
      maxBackupSizeMB: j.maxBackupSizeMB ?? base.maxBackupSizeMB,
      maxFilesPerCommand: j.maxFilesPerCommand ?? base.maxFilesPerCommand,
      highRiskActions: j.highRiskActions?.length ? j.highRiskActions : base.highRiskActions,
      policyLevel: j.policyLevel ?? base.policyLevel,
      maxItemsPerCommit: j.maxItemsPerCommit ?? base.maxItemsPerCommit,
      maxBytesPerCommit: j.maxBytesPerCommit ?? base.maxBytesPerCommit,
      maxMutatingCommandsPerMinute:
        j.maxMutatingCommandsPerMinute ?? base.maxMutatingCommandsPerMinute,
      maxConsecutiveFailures: j.maxConsecutiveFailures ?? base.maxConsecutiveFailures,
      artifactAllowedRoots: [...new Set([...base.artifactAllowedRoots, ...artRoots])],
      artifactRetentionDays: j.artifactRetentionDays ?? base.artifactRetentionDays,
      artifactMaxSizeMB: j.artifactMaxSizeMB ?? base.artifactMaxSizeMB,
      breakers,
    };
  } catch {
    return base;
  }
}

function norm(p: string): string {
  return path.normalize(path.resolve(p)).toLowerCase();
}

export function isPathUnderRoot(filePath: string, root: string): boolean {
  const f = norm(filePath);
  const r = norm(root);
  return f === r || f.startsWith(r + path.sep);
}

export function validateMutatingPath(
  filePath: string,
  policy: NeoPolicy,
): { ok: true } | { ok: false; reason: string } {
  const resolved = path.resolve(filePath);
  const forb = policy.forbiddenRoots.find((r) => isPathUnderRoot(resolved, r));
  if (forb) {
    return { ok: false, reason: `금지 루트 안의 경로입니다: ${resolved} (forbidden: ${forb})` };
  }
  const allowed = policy.allowedRoots.some((r) => isPathUnderRoot(resolved, r));
  if (!allowed) {
    return {
      ok: false,
      reason: `허용된 작업 루트 밖입니다: ${resolved}. .neo-policy.json 의 allowedRoots 를 확인하세요.`,
    };
  }
  return { ok: true };
}

export function validateArtifactPath(
  filePath: string,
  policy: NeoPolicy,
): { ok: true } | { ok: false; reason: string } {
  const resolved = path.resolve(filePath);
  const ok = policy.artifactAllowedRoots.some((r) => isPathUnderRoot(resolved, r));
  if (!ok) {
    return {
      ok: false,
      reason: `스크린샷/아티팩트 경로가 artifactAllowedRoots 밖입니다: ${resolved}`,
    };
  }
  return { ok: true };
}

export function isHighRiskMutationKind(kind: MutationKind, policy: NeoPolicy): boolean {
  return policy.highRiskActions.includes(kind);
}
