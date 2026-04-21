import path from "node:path";
import { resolveAwsFreeTierAllowed } from "./constitutionAwsResolution.js";
import { evaluateConstitutionText, worstMode } from "./constitutionHeuristics.js";
import { loadConstitution } from "./loadConstitution.js";
import { resolveConstitutionRules } from "./resolveConstitutionRules.js";
import type { ConstitutionAuditInput, ConstitutionAuditResult, ConstitutionEnforcementMode } from "./constitutionTypes.js";
import { enrichAllViolations } from "./constitutionViolationEnrich.js";
import { buildAuditSummaryKo } from "./constitutionSummaryKo.js";
import { writeConstitutionAuditReport } from "./constitutionReports.js";
import type { ConstitutionExecutionContext } from "./constitutionScope.js";
import { analyzeProjectForConstitution } from "./staticAnalysis/analyzeProjectForConstitution.js";

function collectAuditFixes(violations: import("./constitutionTypes.js").ConstitutionViolation[]): string[] {
  const fixes: string[] = [];
  for (const v of violations) {
    if (v.code === "hardcoded_locale_currency_timezone" || v.code.startsWith("ast_hardcoded")) {
      fixes.push("locale/currency/timezone 은 디바이스·런타임에서 유도");
    }
  }
  return fixes;
}

export async function runConstitutionAudit(input: ConstitutionAuditInput): Promise<ConstitutionAuditResult> {
  const bundle = await loadConstitution(input.workspaceRoot);
  resolveConstitutionRules(input.taskKind);

  const execCtx: ConstitutionExecutionContext = {
    environment: input.environment ?? process.env.NODE_ENV ?? "development",
    taskKind: input.taskKind,
    workerKind: input.workerKind ?? "neo",
    appId: undefined,
  };
  const awsAllowed = resolveAwsFreeTierAllowed(bundle, execCtx);

  const text = [input.rawText, input.artifactText, input.goalId && `goal:${input.goalId}`].filter(Boolean).join("\n");

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
      maxFiles: input.staticAnalysis.maxFiles ?? 200,
      astCtx: { awsAllowed },
    });
    ast = scanned.violations;
    astScannedFiles = scanned.scannedFiles;
  }

  const merged = enrichAllViolations([...heuristic, ...ast], bundle.rules);

  const driftHints = input.driftHints ?? [];
  const driftDetected =
    driftHints.length > 0 ||
    /\b(CONST_|HARDCODE|TODO:\s*manual|must\s+manually)\b/i.test(input.artifactText);

  const modes: ConstitutionEnforcementMode[] = merged.map((v) => v.mode);
  const finalMode = worstMode(modes.length ? modes : ["allow"]);

  const ok = finalMode !== "deny";

  const summaryKo = buildAuditSummaryKo(ok, merged, driftDetected, bundle.document.version);

  const rec: string[] = [];
  if (driftDetected) rec.push("산출물에서 수동 절차·하드코딩 흔적을 자동화/정책 주입으로 치환");
  rec.push(...collectAuditFixes(merged));

  const result: ConstitutionAuditResult = {
    ok,
    finalMode,
    violations: merged,
    driftDetected,
    summaryKo,
    recommendedAutoFixes: [...new Set(rec)],
    documentVersion: bundle.document.version,
    astScannedFiles,
  };

  const paths = await writeConstitutionAuditReport(bundle.root, input, result);
  result.reportPath = paths.mdPath ?? paths.jsonPath;
  return result;
}
