import type { SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { ConstitutionViolation } from "../../constitutionTypes.js";

const RX =
  /(수동\s*확인\s*필요|직접\s*클릭|사람이\s*확인|must\s+manually|human\s+must|TODO:\s*manual)/i;

export function detectManualOnlyProcessMarkers(sf: SourceFile, fileLabel: string): ConstitutionViolation[] {
  const out: ConstitutionViolation[] = [];
  for (const node of sf.getDescendantsOfKind(SyntaxKind.StringLiteral)) {
    const t = node.getLiteralValue();
    if (RX.test(t)) {
      out.push({
        code: "ast_manual_only_marker",
        message: "manual-only / 수동 절차 마커 문자열",
        mode: "warn",
        ruleId: "operations",
        detectorKind: "ast",
        filePath: fileLabel,
        line: node.getStartLineNumber(),
        column: node.getStart(),
        evidenceSnippet: t.slice(0, 120),
      });
    }
  }
  for (const c of sf.getDescendantsOfKind(SyntaxKind.MultiLineCommentTrivia)) {
    const t = c.getText();
    if (RX.test(t)) {
      out.push({
        code: "ast_manual_only_marker",
        message: "manual-only 마커 주석",
        mode: "warn",
        ruleId: "operations",
        detectorKind: "ast",
        filePath: fileLabel,
        line: c.getStartLineNumber(),
        column: c.getStart(),
        evidenceSnippet: t.slice(0, 120),
      });
    }
  }
  return out;
}
