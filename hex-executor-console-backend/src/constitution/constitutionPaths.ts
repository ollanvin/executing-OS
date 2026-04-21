import fs from "node:fs/promises";
import path from "node:path";

/** 단일 원본: `ollanvin/shared/constitution` (NEO_CONSTITUTION_ROOT 로 오버라이드) */
export function getConstitutionRoot(workspaceRoot: string): string {
  const env = process.env.NEO_CONSTITUTION_ROOT?.trim();
  if (env) {
    return path.resolve(env);
  }
  const fromExeOs = path.join(workspaceRoot, "..", "shared", "constitution");
  return path.resolve(fromExeOs);
}

export async function assertConstitutionDirReadable(root: string): Promise<void> {
  const main = path.join(root, "constitution.yaml");
  await fs.access(main);
}
