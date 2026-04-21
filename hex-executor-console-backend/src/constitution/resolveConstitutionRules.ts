import type { ConstitutionTaskKind } from "./constitutionTypes.js";

/** 작업 종류 → 적용 규칙 파일 id 목록 */
export function resolveConstitutionRules(taskKind: ConstitutionTaskKind): string[] {
  const base = ["coding", "operations", "privacy", "locale", "runtime", "release", "billing"];

  switch (taskKind) {
    case "payment_integration":
      return ["billing", "coding", "runtime"];
    case "storage_access":
      return ["privacy", "runtime", "coding"];
    case "release_prepare":
      return ["release", "coding", "operations"];
    case "neo_action":
    case "planner_parse":
    case "mutation_pipeline":
      return base;
    case "host_executor":
    case "ollama_sandbox":
      return ["runtime", "operations", "privacy", "coding"];
    case "smoke_run":
    case "e2e_run":
    case "orchestrator":
    case "bundle_finalize":
      return base;
    case "code_mutation":
    case "app_scaffold":
      return ["coding", "locale", "release", "billing", "runtime"];
    default:
      return base;
  }
}
