/**
 * LLM 플래너 입출력 타입 (고수준 오더 → JSON 플랜 → executor).
 */

export type PlannerCapabilitySpec = {
  id: string;
  description: string;
};

export type PlannerInput = {
  userGoalText: string;
  normalizedGoalId?: string;
  capabilities: PlannerCapabilitySpec[];
  /** 장기 확장: 디바이스/앱 상태 등 */
  currentState?: Record<string, unknown>;
};

export type PlannerStep = {
  id: string;
  name: string;
  /** 내부 워크플로 step id와 동일한 capability 토큰 (예: ensure_android_device). */
  usesCapability: string;
  params?: Record<string, unknown>;
};

export type PlannerPlan = {
  goalId: string;
  steps: PlannerStep[];
  notes?: string;
};
