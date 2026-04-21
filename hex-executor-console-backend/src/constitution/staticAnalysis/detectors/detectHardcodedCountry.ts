import type { SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { ConstitutionViolation } from "../../constitutionTypes.js";

/** 매우 소극적: ISO 3166-1 alpha-2 대문자 2자만 */
const COUNTRY_RE = /^[A-Z]{2}$/;

export function detectHardcodedCountry(sf: SourceFile, fileLabel: string): ConstitutionViolation[] {
  const out: ConstitutionViolation[] = [];
  for (const node of sf.getDescendantsOfKind(SyntaxKind.StringLiteral)) {
    const t = node.getLiteralValue();
    if (t.length === 2 && COUNTRY_RE.test(t) && t !== "OK" && t !== "ID") {
      out.push({
        code: "ast_hardcoded_country",
        message: `국가 코드 후보 리터럴: "${t}" (오탐 가능 — 맥락 검토)`,
        mode: "observe",
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
