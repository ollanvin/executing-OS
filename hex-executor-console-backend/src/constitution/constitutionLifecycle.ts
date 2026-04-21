import type { ConstitutionEnforcementMode } from "./constitutionTypes.js";

export type RuleLifecycleStage = "observe" | "warn" | "deny";

/** 탐지기 제안 모드에 rule.lifecycleStage를 반영 (observe는 차단으로 승격하지 않음) */
export function applyRuleLifecycle(
  suggested: ConstitutionEnforcementMode,
  ruleLifecycle: RuleLifecycleStage | undefined,
): ConstitutionEnforcementMode {
  const r = ruleLifecycle ?? "warn";
  if (r === "observe") {
    if (suggested === "deny" || suggested === "warn") return "observe";
    return "allow";
  }
  if (r === "warn") {
    if (suggested === "deny") return "warn";
    return suggested;
  }
  return suggested;
}

export function worstMode(modes: ConstitutionEnforcementMode[]): ConstitutionEnforcementMode {
  if (modes.includes("deny")) return "deny";
  if (modes.includes("warn")) return "warn";
  if (modes.includes("observe")) return "observe";
  return "allow";
}
