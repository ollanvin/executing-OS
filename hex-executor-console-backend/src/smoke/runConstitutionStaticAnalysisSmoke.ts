/**
 * AST 정적 분석 스모크 — fixture에서 비허용 billing 탐지
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeSourceFile } from "../constitution/staticAnalysis/analyzeSourceFile.js";
import { getDefaultWorkspaceRoot } from "../workspaceRoot.js";
import { smokeConstitutionStep0 } from "./smokeConstitutionBootstrap.js";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = getDefaultWorkspaceRoot();

async function main() {
  await smokeConstitutionStep0("constitution_static_analysis");

  const bad = path.join(__dir, "constitutionAstProbe", "badBilling.ts");
  const good = path.join(__dir, "constitutionAstProbe", "okFile.ts");

  const vBad = await analyzeSourceFile(bad, workspaceRoot, { awsAllowed: false });
  const billingHit = vBad.some((v) => v.code === "ast_forbidden_billing_sdk");
  if (!billingHit) throw new Error("expected forbidden billing in badBilling.ts");

  const vGood = await analyzeSourceFile(good, workspaceRoot, { awsAllowed: false });
  const billingInGood = vGood.some((v) => v.code === "ast_forbidden_billing_sdk");
  if (billingInGood) throw new Error("did not expect billing violation in okFile");

  process.stdout.write(
    JSON.stringify({ ok: true, badViolations: vBad.length, goodViolations: vGood.length }, null, 2) + "\n",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
