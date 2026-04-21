import type { SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { ConstitutionViolation } from "../../constitutionTypes.js";

const LOCALE_RE = /^[a-z]{2}-[A-Z]{2}$/;

export function detectHardcodedLocale(sf: SourceFile, fileLabel: string): ConstitutionViolation[] {
  const out: ConstitutionViolation[] = [];
  for (const node of sf.getDescendantsOfKind(SyntaxKind.StringLiteral)) {
    const t = node.getLiteralValue();
    if (LOCALE_RE.test(t)) {
      out.push({
        code: "ast_hardcoded_locale",
        message: `하드코딩 locale 리터럴 후보: "${t}"`,
        mode: "warn",
        ruleId: "locale",
        detectorKind: "ast",
        filePath: fileLabel,
        line: node.getStartLineNumber(),
        column: node.getStartLinePos(),
        evidenceSnippet: t.slice(0, 80),
      });
    }
  }
  return out;
}
