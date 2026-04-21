import path from "node:path";
import { resolveAwsFreeTierAllowed } from "./constitutionAwsResolution.js";
import { evaluateConstitutionText, worstMode } from "./constitutionHeuristics.js";
import { buildConstitutionResolutionSnapshot, loadConstitution } from "./loadConstitution.js";
import { resolveConstitutionRules } from "./resolveConstitutionRules.js";
import type { ConstitutionPreflightInput, ConstitutionPreflightResult } from "./constitutionTypes.js";
import type { ConstitutionEnforcementMode } from "./constitutionTypes.js";
import { enrichAllViolations } from "./constitutionViolationEnrich.js";
import { writeConstitutionPreflightReport } from "./constitutionReports.js";
import { buildPreflightSummaryKo } from "./constitutionSummaryKo.js";
import type { ConstitutionExecutionContext } from "./constitutionScope.js";
import { analyzeProjectForConstitution } from "./staticAnalysis/analyzeProjectForConstitution.js";

function collectAutoFixes(violations: import("./constitutionTypes.js").ConstitutionViolation[]): string[] {
  const fixes: string[] = [];
  for (const v of violations) {
    if (v.code === "hardcoded_locale_currency_timezone" || v.code.startsWith("ast_hardcoded")) {
      fixes.push("device locale bootstrap / 런타임 Currency·TimeZone resolver");
    }
    if (v.code === "billing_non_store_provider" || v.code === "ast_forbidden_billing_sdk") {
      fixes.push("Google Play Billing / App Store 인앱으로 통일");
    }
    if (v.code === "persistent_remote_storage" || v.code === "ast_remote_persistent_storage") {
      fixes.push("온디바이스 에페머럴 저장 또는 정책 예외 문서화");
    }
  }
  return [...new Set(fixes)];
}

export async function runConstitutionPreflight(
  input: ConstitutionPreflightInput,
): Promise<ConstitutionPreflightResult> {
  const bundle = await loadConstitution(input.workspaceRoot);
  const evaluatedRuleIds = resolveConstitutionRules(input.taskKind);

  const execCtx: ConstitutionExecutionContext = {
    environment: input.environment ?? process.env.NODE_ENV ?? "development",
    taskKind: input.taskKind,
    workerKind: input.workerKind,
    appId: input.targetAppId,
  };
  const awsAllowed = resolveAwsFreeTierAllowed(bundle, execCtx);

  const text = [input.rawText, input.actionIntent && `intent:${input.actionIntent}`, input.goalId && `goal:${input.goalId}`]
    .filter(Boolean)
    .join("\n");

  const heuristic = evaluateConstitutionText(text, { awsFreeTierAllowed: awsAllowed });
  let ast: import("./constitutionTypes.js").ConstitutionViolation[] = [];
  let astScannedFiles: string[] | undefined;

  if (input.staticAnalysis?.backendRoot) {
    const br = path.resolve(input.staticAnalysis.backendRoot);
    const scanRoots = (input.staticAnalysis.scanRoots ?? [path.join(br, "src")]).map((r) => path.resolve(r));
    const scanned = await analyzeProjectForConstitution({
      workspaceRoot: input.workspaceRoot,
      scanRoots,
      changedFiles: input.staticAnalysis.changedFiles,
      maxFiles: input.staticAnalysis.maxFiles,
      astCtx: { awsAllowed },
    });
    ast = scanned.violations;
    astScannedFiles = scanned.scannedFiles;
  }

  const merged = enrichAllViolations([...heuristic, ...ast], bundle.rules);
  const modes: ConstitutionEnforcementMode[] = merged.map((v) => v.mode);
  const finalMode = worstMode(modes.length ? modes : ["allow"]);

  const requiredOverrides: string[] = [];
  if (merged.some((v) => v.code === "aws_without_exception" || v.code === "ast_aws_sdk_without_exception") && !awsAllowed) {
    requiredOverrides.push("exceptions/aws-free-tier.yaml · scope·expires·active 확인");
  }

  const ok = finalMode !== "deny";
  const summaryKo = buildPreflightSummaryKo(ok, merged, bundle.document.version);
  const resolutionSnapshot = buildConstitutionResolutionSnapshot(bundle, evaluatedRuleIds);

  const result: ConstitutionPreflightResult = {
    ok,
    finalMode,
    evaluatedRuleIds,
    violations: merged,
    requiredOverrides,
    recommendedAutoFixes: collectAutoFixes(merged),
    summaryKo,
    documentVersion: bundle.document.version,
    schemaDigest: bundle.schemaDigest,
    astScannedFiles,
    resolutionSnapshot,
  };

  await writeConstitutionPreflightReport(bundle.root, input, result);
  return result;
}
