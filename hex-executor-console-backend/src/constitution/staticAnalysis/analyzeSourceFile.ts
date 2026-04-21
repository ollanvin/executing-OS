import { Project } from "ts-morph";
import type { ConstitutionViolation } from "../constitutionTypes.js";
import { getCachedFileAnalysis } from "./constitutionStaticCache.js";
import { isExcludedTestOrFixturePath, relativeWorkspace } from "./astTestPath.js";
import { type AstDetectorContext, runAllAstDetectors } from "./detectors/runAllAstDetectors.js";

export async function analyzeSourceFile(
  absPath: string,
  workspaceRoot: string,
  ctx: AstDetectorContext,
): Promise<ConstitutionViolation[]> {
  if (isExcludedTestOrFixturePath(absPath)) return [];
  const label = relativeWorkspace(absPath, workspaceRoot);
  return getCachedFileAnalysis(absPath, async () => {
    const project = new Project({
      compilerOptions: { allowJs: true, target: 99, module: 99 },
      skipAddingFilesFromTsConfig: true,
    });
    const sf = project.addSourceFileAtPath(absPath);
    return runAllAstDetectors(sf, label, ctx);
  });
}
