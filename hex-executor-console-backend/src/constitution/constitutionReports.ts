import fs from "node:fs/promises";
import path from "node:path";
import { appendConstitutionReportIndex } from "./constitutionReportIndex.js";
import type { ConstitutionAuditInput, ConstitutionAuditResult } from "./constitutionTypes.js";
import type { ConstitutionPreflightInput, ConstitutionPreflightResult } from "./constitutionTypes.js";

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export async function writeConstitutionPreflightReport(
  constitutionRoot: string,
  input: ConstitutionPreflightInput,
  result: ConstitutionPreflightResult,
): Promise<{ jsonPath: string }> {
  const dir = path.join(constitutionRoot, "reports");
  await fs.mkdir(dir, { recursive: true });
  const id = stamp();
  const jsonPath = path.join(dir, `constitution-preflight-${id}.json`);
  const payload = {
    kind: "preflight",
    at: new Date().toISOString(),
    input,
    result: {
      ok: result.ok,
      finalMode: result.finalMode,
      evaluatedRuleIds: result.evaluatedRuleIds,
      violations: result.violations,
      summaryKo: result.summaryKo,
      documentVersion: result.documentVersion,
      schemaDigest: result.schemaDigest,
      astScannedFiles: result.astScannedFiles,
      resolutionSnapshot: result.resolutionSnapshot,
    },
  };
  await fs.writeFile(jsonPath, JSON.stringify(payload, null, 2), "utf8");
  await appendConstitutionReportIndex(dir, {
    at: payload.at,
    kind: "preflight",
    jsonPath,
    finalMode: result.finalMode,
    violationCount: result.violations.length,
    ruleIdsTouched: [...new Set(result.violations.map((v) => v.ruleId).filter(Boolean) as string[])],
  });
  return { jsonPath };
}

export async function writeConstitutionAuditReport(
  constitutionRoot: string,
  input: ConstitutionAuditInput,
  result: ConstitutionAuditResult,
): Promise<{ jsonPath: string; mdPath: string }> {
  const dir = path.join(constitutionRoot, "reports");
  await fs.mkdir(dir, { recursive: true });
  const id = stamp();
  const jsonPath = path.join(dir, `constitution-audit-${id}.json`);
  const mdPath = path.join(dir, `constitution-audit-${id}.md`);

  const payload = {
    kind: "audit",
    at: new Date().toISOString(),
    input: { ...input, artifactText: input.artifactText.slice(0, 16_000) },
    result: {
      ok: result.ok,
      finalMode: result.finalMode,
      violations: result.violations,
      driftDetected: result.driftDetected,
      summaryKo: result.summaryKo,
      recommendedAutoFixes: result.recommendedAutoFixes,
      documentVersion: result.documentVersion,
      astScannedFiles: result.astScannedFiles,
    },
  };
  await fs.writeFile(jsonPath, JSON.stringify(payload, null, 2), "utf8");

  const md = `# Constitution audit

- **at:** ${payload.at}
- **taskKind:** ${input.taskKind}
- **verdict ok:** ${result.ok}
- **finalMode:** ${result.finalMode}
- **driftDetected:** ${result.driftDetected}
- **documentVersion:** ${result.documentVersion}

## Summary (KO)

${result.summaryKo.fullText}

## Violations

${result.violations.length ? result.violations.map((v) => `- **${v.mode}** \`${v.code}\`: ${v.message}`).join("\n") : "(none)"}

## Auto-fix hints

${result.recommendedAutoFixes.map((x) => `- ${x}`).join("\n") || "(none)"}
`;
  await fs.writeFile(mdPath, md, "utf8");
  await appendConstitutionReportIndex(dir, {
    at: payload.at,
    kind: "audit",
    jsonPath,
    mdPath,
    finalMode: result.finalMode,
    violationCount: result.violations.length,
    ruleIdsTouched: [...new Set(result.violations.map((v) => v.ruleId).filter(Boolean) as string[])],
  });
  return { jsonPath, mdPath };
}
