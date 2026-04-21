import type { ConstitutionEnforcementMode, ConstitutionViolation } from "../constitution/constitutionTypes.js";

export type ConstitutionPhaseReport = {
  status: "ok" | "warn" | "deny";
  issues: Array<{
    ruleId: string;
    level: "observe" | "warn" | "deny";
    message: string;
  }>;
};

export function finalModeToPhaseStatus(m: ConstitutionEnforcementMode): "ok" | "warn" | "deny" {
  if (m === "deny") return "deny";
  if (m === "warn") return "warn";
  return "ok";
}

function violationToIssueLevel(v: ConstitutionViolation): "observe" | "warn" | "deny" {
  if (v.lifecycleStage) return v.lifecycleStage;
  if (v.mode === "deny") return "deny";
  if (v.mode === "warn") return "warn";
  return "observe";
}

export function mapViolationsToConstitutionPhase(
  finalMode: ConstitutionEnforcementMode,
  violations: ConstitutionViolation[],
): ConstitutionPhaseReport {
  return {
    status: finalModeToPhaseStatus(finalMode),
    issues: violations.map((v) => ({
      ruleId: v.ruleId ?? v.code,
      level: violationToIssueLevel(v),
      message: v.message,
    })),
  };
}
