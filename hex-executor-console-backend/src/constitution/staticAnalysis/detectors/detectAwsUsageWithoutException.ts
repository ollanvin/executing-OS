import type { SourceFile } from "ts-morph";
import type { ConstitutionViolation } from "../../constitutionTypes.js";

const AWS_RE = /^(@aws-sdk\/|aws-sdk|@aws-cdk\/|aws-cdk)/;

export function detectAwsUsageWithoutException(
  sf: SourceFile,
  fileLabel: string,
  awsAllowed: boolean,
): ConstitutionViolation[] {
  if (awsAllowed) return [];
  const out: ConstitutionViolation[] = [];
  for (const d of sf.getImportDeclarations()) {
    const spec = d.getModuleSpecifierValue();
    if (AWS_RE.test(spec)) {
      out.push({
        code: "ast_aws_sdk_without_exception",
        message: `AWS SDK import — 예외 scope·expires 검증 필요: ${spec}`,
        mode: "warn",
        ruleId: "runtime",
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
