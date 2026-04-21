import type { NeoPolicy, ToolBreakerKey } from "./policy.js";

export type BreakerPhase = "CLOSED" | "OPEN" | "HALF_OPEN";

export type OneBreakerConfig = {
  failureThreshold: number;
  cooldownSeconds: number;
  probeSuccessesRequired: number;
  manualResetRequired: boolean;
};

type BucketState = {
  phase: BreakerPhase;
  consecutiveFailures: number;
  openedAt: number | null;
  lastReason: string | null;
  mutatingTimestamps: number[];
  halfOpenProbeStartedAt: number | null;
};

const buckets = new Map<ToolBreakerKey, BucketState>();

/** 운영 검증/스모크 테스트 전용 — 프로세스 내 브레이커 상태 초기화 */
export function resetToolBreakerBucketsForVerification(): void {
  buckets.clear();
}

function bucket(key: ToolBreakerKey): BucketState {
  let b = buckets.get(key);
  if (!b) {
    b = {
      phase: "CLOSED",
      consecutiveFailures: 0,
      openedAt: null,
      lastReason: null,
      mutatingTimestamps: [],
      halfOpenProbeStartedAt: null,
    };
    buckets.set(key, b);
  }
  return b;
}

function cfgFor(key: ToolBreakerKey, policy: NeoPolicy): OneBreakerConfig {
  const d = policy.breakers?.[key];
  return {
    failureThreshold: d?.failureThreshold ?? defaultThreshold(key, policy),
    cooldownSeconds: d?.cooldownSeconds ?? 60,
    probeSuccessesRequired: d?.probeSuccessesRequired ?? 1,
    manualResetRequired: d?.manualResetRequired ?? false,
  };
}

function defaultThreshold(key: ToolBreakerKey, policy: NeoPolicy): number {
  if (key === "mutating_pipeline") return policy.maxConsecutiveFailures;
  return 5;
}

function transitionOpen(b: BucketState, reason: string, now: number): void {
  b.phase = "OPEN";
  b.openedAt = now;
  b.lastReason = reason;
  b.halfOpenProbeStartedAt = null;
}

/** OPEN 이후 cooldown 경과 시 HALF_OPEN 으로 한 번 시도 허용 */
export function evaluateToolBreaker(
  key: ToolBreakerKey,
  policy: NeoPolicy,
): { allowed: boolean; reason?: string; retryAfterMs?: number; phase: BreakerPhase } {
  const b = bucket(key);
  const c = cfgFor(key, policy);
  const now = Date.now();

  if (c.manualResetRequired && b.phase === "OPEN" && b.lastReason?.startsWith("MANUAL")) {
    return { allowed: false, reason: b.lastReason, phase: "OPEN" };
  }

  if (b.phase === "OPEN" && b.openedAt != null) {
    const elapsed = now - b.openedAt;
    if (elapsed < c.cooldownSeconds * 1000) {
      return {
        allowed: false,
        reason: b.lastReason ?? `${key} breaker OPEN`,
        retryAfterMs: c.cooldownSeconds * 1000 - elapsed,
        phase: "OPEN",
      };
    }
    b.phase = "HALF_OPEN";
    b.halfOpenProbeStartedAt = now;
    b.lastReason = `${key} HALF_OPEN probe 허용`;
    return { allowed: true, phase: "HALF_OPEN" };
  }

  if (b.phase === "HALF_OPEN") {
    return { allowed: true, phase: "HALF_OPEN" };
  }

  return { allowed: true, phase: "CLOSED" };
}

export function recordToolFailure(key: ToolBreakerKey, policy: NeoPolicy, reason: string): void {
  const b = bucket(key);
  const c = cfgFor(key, policy);
  const now = Date.now();
  b.consecutiveFailures += 1;
  b.lastReason = reason;

  if (b.phase === "HALF_OPEN") {
    transitionOpen(b, `${key} HALF_OPEN probe 실패: ${reason}`, now);
    return;
  }

  if (b.consecutiveFailures >= c.failureThreshold) {
    transitionOpen(b, `${key} 연속 실패 ${b.consecutiveFailures}: ${reason}`, now);
  }
}

export function recordToolSuccess(key: ToolBreakerKey): void {
  const b = bucket(key);
  b.consecutiveFailures = 0;
  b.phase = "CLOSED";
  b.openedAt = null;
  b.halfOpenProbeStartedAt = null;
  b.lastReason = null;
}

/** mutating_pipeline 전용: 분당 시도 횟수 */
export function recordMutatingPipelineAttempt(policy: NeoPolicy): void {
  const b = bucket("mutating_pipeline");
  const now = Date.now();
  b.mutatingTimestamps.push(now);
  b.mutatingTimestamps = b.mutatingTimestamps.filter((t) => now - t < 60_000);
  const max = policy.maxMutatingCommandsPerMinute;
  if (b.mutatingTimestamps.length > max) {
    transitionOpen(
      b,
      `분당 mutating 한도 초과 (${b.mutatingTimestamps.length}/${max})`,
      now,
    );
  }
}

export function evaluateMutatingPipelineBreaker(policy: NeoPolicy): {
  blocked: boolean;
  reason?: string;
  retryAfterMs?: number;
  phase: BreakerPhase;
} {
  const ev = evaluateToolBreaker("mutating_pipeline", policy);
  if (!ev.allowed) {
    return { blocked: true, reason: ev.reason, retryAfterMs: ev.retryAfterMs, phase: ev.phase };
  }
  const b = bucket("mutating_pipeline");
  return { blocked: false, phase: b.phase };
}

export function recordMutatingPipelineSuccess(): void {
  recordToolSuccess("mutating_pipeline");
}

export function recordMutatingPipelineFailure(policy: NeoPolicy, reason: string): void {
  recordToolFailure("mutating_pipeline", policy, reason);
}

export type ToolBreakerSnapshot = {
  key: ToolBreakerKey;
  state: BreakerPhase;
  trippedAt: string | null;
  reason: string | null;
  cooldownSeconds: number;
  retryAfterMs: number | null;
  consecutiveFailures: number;
  manualResetRequired: boolean;
  mutatingLastMinute?: number;
};

export function getToolBreakerSnapshot(key: ToolBreakerKey, policy: NeoPolicy): ToolBreakerSnapshot {
  const b = bucket(key);
  const c = cfgFor(key, policy);
  const now = Date.now();
  let retryAfterMs: number | null = null;
  if (b.phase === "OPEN" && b.openedAt != null) {
    const elapsed = now - b.openedAt;
    const left = c.cooldownSeconds * 1000 - elapsed;
    retryAfterMs = left > 0 ? left : 0;
  }
  const recent =
    key === "mutating_pipeline"
      ? b.mutatingTimestamps.filter((t) => now - t < 60_000).length
      : undefined;
  return {
    key,
    state: b.phase,
    trippedAt: b.openedAt ? new Date(b.openedAt).toISOString() : null,
    reason: b.lastReason,
    cooldownSeconds: c.cooldownSeconds,
    retryAfterMs,
    consecutiveFailures: b.consecutiveFailures,
    manualResetRequired: c.manualResetRequired,
    mutatingLastMinute: recent,
  };
}

export function getAllToolBreakerSnapshots(policy: NeoPolicy): ToolBreakerSnapshot[] {
  const keys: ToolBreakerKey[] = [
    "gemini",
    "ollama",
    "emulator",
    "adb",
    "file_move_mutation",
    "mutating_pipeline",
  ];
  return keys.map((k) => getToolBreakerSnapshot(k, policy));
}

export function manualResetToolBreaker(key: ToolBreakerKey): void {
  recordToolSuccess(key);
}

export function buildBreakerBannerMessages(policy: NeoPolicy): string[] {
  const lines: string[] = [];
  const snap = (k: ToolBreakerKey) => getToolBreakerSnapshot(k, policy);
  const g = snap("gemini");
  const o = snap("ollama");
  const a = snap("adb");
  const m = snap("mutating_pipeline");

  if (g.state === "OPEN") lines.push(`Gemini breaker ${g.state} → Ollama·deterministic 위주`);
  if (o.state === "OPEN") lines.push(`Ollama breaker ${o.state} → 로컬 모델 호출 일시 중단`);
  if (a.state === "OPEN") lines.push(`adb breaker ${a.state} → 스크린샷·adb 의존 명령 일시 차단`);
  if (m.state === "OPEN") lines.push(`mutating pipeline breaker ${m.state} → 변경 작업 일시 차단`);
  return lines;
}
