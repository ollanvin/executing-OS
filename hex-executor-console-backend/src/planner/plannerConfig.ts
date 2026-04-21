export type PlannerModelKind = "gemini" | "ollama" | "claude";

export function getPlannerModelKind(): PlannerModelKind {
  const v = (process.env.PLANNER_MODEL_KIND ?? "gemini").trim().toLowerCase();
  if (v === "ollama" || v === "claude") return v;
  return "gemini";
}

/** 플래너 전용 모델 이름 (미설정 시 provider 기본값). */
export function getPlannerModelNameForTrace(): string | undefined {
  const n = process.env.PLANNER_MODEL_NAME?.trim();
  return n || undefined;
}

export function isLlmPlannerEnabled(): boolean {
  return (process.env.NEO_LLM_PLANNER_ENABLED ?? "1").trim() !== "0";
}

export function isPlannerDevLogEnabled(): boolean {
  return (process.env.NEO_PLANNER_DEV_LOG ?? "").trim() === "1";
}
