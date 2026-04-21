import { applyRuleLifecycle, type RuleLifecycleStage } from "./constitutionLifecycle.js";
import { inferRuleIdFromViolationCode } from "./constitutionRuleInference.js";
import type { ConstitutionRule } from "./constitutionTypes.js";
import type { ConstitutionViolation } from "./constitutionTypes.js";

export function enrichViolationWithRuleLifecycle(
  v: ConstitutionViolation,
  rules: Map<string, ConstitutionRule>,
): ConstitutionViolation {
  const ruleId = v.ruleId ?? inferRuleIdFromViolationCode(v.code);
  const rule = rules.get(ruleId);
  const lifecycle = (rule?.lifecycleStage as RuleLifecycleStage | undefined) ?? "warn";
  const mode = applyRuleLifecycle(v.mode, lifecycle);
  return {
    ...v,
    ruleId,
    lifecycleStage: lifecycle,
    mode,
  };
}

export function enrichAllViolations(
  list: ConstitutionViolation[],
  rules: Map<string, ConstitutionRule>,
): ConstitutionViolation[] {
  return list.map((v) => enrichViolationWithRuleLifecycle(v, rules));
}
