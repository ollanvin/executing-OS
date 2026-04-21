import type { SourceFile } from "ts-morph";
import type { ConstitutionViolation } from "../../constitutionTypes.js";

const BAD = /(stripe|paypal|@stripe\/|braintree)/i;

export function detectForbiddenBillingProvider(sf: SourceFile, fileLabel: string): ConstitutionViolation[] {
  const out: ConstitutionViolation[] = [];
  for (const d of sf.getImportDeclarations()) {
    const spec = d.getModuleSpecifierValue();
    if (BAD.test(spec)) {
      out.push({
        code: "ast_forbidden_billing_sdk",
        message: `비허용 결제 provider import: ${spec}`,
        mode: "deny",
        ruleId: "billing",
        detectorKind: "ast",
        filePath: fileLabel,
        line: d.getStartLineNumber(),
        column: d.getStart(),
        evidenceSnippet: `import "${spec}"`,
      });
    }
  }
  return out;
}
