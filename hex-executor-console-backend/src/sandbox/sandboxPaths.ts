/**
 * Sandbox Bridge — 공유 루트 아래 inbox / outbox / …
 * 기본(프로필 없음): {outputRoot}/sandbox-bridge/
 * 선택: {outputRoot}/sandbox-bridge/{profile}/ (동시에 여러 브리지)
 */
import path from "node:path";

export type SandboxPathOptions = {
  /** …/hex-executor-console-backend/output */
  outputRoot: string;
  /** 비우면 평면 구조: sandbox-bridge/inbox 직접 */
  profile?: string;
};

export function resolveSandboxSharedRoot(opts: SandboxPathOptions): string {
  const base = path.join(opts.outputRoot, "sandbox-bridge");
  const p = opts.profile?.trim();
  return p ? path.join(base, p) : base;
}

export function resolveSandboxInboxDir(sharedRoot: string): string {
  return path.join(sharedRoot, "inbox");
}

export function resolveSandboxOutboxDir(sharedRoot: string): string {
  return path.join(sharedRoot, "outbox");
}

export function resolveSandboxArtifactsDir(sharedRoot: string): string {
  return path.join(sharedRoot, "artifacts");
}

export function resolveSandboxLocksDir(sharedRoot: string): string {
  return path.join(sharedRoot, "locks");
}

export function resolveSandboxDeadLetterDir(sharedRoot: string): string {
  return path.join(sharedRoot, "dead-letter");
}

export function jobRequestFileName(jobId: string): string {
  return `job-${jobId}.request.json`;
}

export function jobResultFileName(jobId: string): string {
  return `job-${jobId}.result.json`;
}

export function resolveJobRequestPath(sharedRoot: string, jobId: string): string {
  return path.join(resolveSandboxInboxDir(sharedRoot), jobRequestFileName(jobId));
}

export function resolveJobResultPath(sharedRoot: string, jobId: string): string {
  return path.join(resolveSandboxOutboxDir(sharedRoot), jobResultFileName(jobId));
}
