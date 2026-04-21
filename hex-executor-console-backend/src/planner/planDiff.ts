import type { WorkflowPlan } from "../workflow/types.js";

function levenshtein(a: string[], b: string[]): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost,
      );
    }
  }
  return dp[m]![n]!;
}

/**
 * 정적 플랜과 비교해 LLM 플랜 채택 여부.
 * - 완전 동일 → 채택
 * - 편집 거리 ≤ 2 이고 첫/마지막 스텝이 정적과 동일 → 채택
 * - 그 외 → 정적 fallback
 */
export function shouldAdoptLlmPlanVersusStatic(
  llmPlan: WorkflowPlan,
  staticPlan: WorkflowPlan,
): { adopt: boolean; reason: string } {
  const a = staticPlan.steps.map((s) => s.id);
  const b = llmPlan.steps.map((s) => s.id);
  if (a.length !== b.length) {
    return { adopt: false, reason: `length mismatch static=${a.length} llm=${b.length}` };
  }
  if (a.every((id, i) => id === b[i])) {
    return { adopt: true, reason: "exact sequence match" };
  }
  const dist = levenshtein(a, b);
  const endsOk = b[0] === a[0] && b[b.length - 1] === a[a.length - 1];
  if (dist <= 2 && endsOk) {
    return { adopt: true, reason: `edit distance ${dist} within tolerance` };
  }
  return { adopt: false, reason: `sequence diverges (edit distance ${dist}, endsOk=${endsOk})` };
}
