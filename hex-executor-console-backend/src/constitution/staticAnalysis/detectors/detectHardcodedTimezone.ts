import type { SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { ConstitutionViolation } from "../../constitutionTypes.js";

const TZ_RE = /^[A-Z][a-z]+\/[A-Za-z_]+$/;

export function detectHardcodedTimezone(sf: SourceFile, fileLabel: string): ConstitutionViolation[] {
  const out: ConstitutionViolation[] = [];
  for (const node of sf.getDescendantsOfKind(SyntaxKind.StringLiteral)) {
    const t = node.getLiteralValue();
    if (TZ_RE.test(t) && t.includes("/")) {
      out.push({
        code: "ast_hardcoded_timezone",
        message: `하드코딩 IANA timezone 후보: "${t}"`,
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
