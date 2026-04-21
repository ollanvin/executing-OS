import type { SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { ConstitutionViolation } from "../../constitutionTypes.js";

const CCY = new Set(["USD", "KRW", "EUR", "JPY", "GBP"]);

export function detectHardcodedCurrency(sf: SourceFile, fileLabel: string): ConstitutionViolation[] {
  const out: ConstitutionViolation[] = [];
  for (const node of sf.getDescendantsOfKind(SyntaxKind.StringLiteral)) {
    const t = node.getLiteralValue();
    if (CCY.has(t)) {
      out.push({
        code: "ast_hardcoded_currency",
        message: `하드코딩 통화 리터럴 후보: "${t}"`,
        mode: "warn",
        ruleId: "locale",
        detectorKind: "ast",
        filePath: fileLabel,
        line: node.getStartLineNumber(),
        column: node.getStartLinePos(),
        evidenceSnippet: t,
      });
    }
  }
  return out;
}
