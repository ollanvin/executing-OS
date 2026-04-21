import type { SourceFile } from "ts-morph";
import type { ConstitutionViolation } from "../../constitutionTypes.js";

const BAD = /(mongoose|mongodb|firebas|@google-cloud\/storage|@aws-sdk\/client-s3|ioredis)\b/i;

export function detectRemotePersistentStorage(sf: SourceFile, fileLabel: string): ConstitutionViolation[] {
  const out: ConstitutionViolation[] = [];
  for (const d of sf.getImportDeclarations()) {
    const spec = d.getModuleSpecifierValue();
    if (BAD.test(spec)) {
      out.push({
        code: "ast_remote_persistent_storage",
        message: `원격 영속 저장/클라우드 클라이언트 import 후보: ${spec}`,
        mode: "deny",
        ruleId: "privacy",
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
