import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import type { ConstitutionViolation } from "../constitutionTypes.js";

type Cached = { violations: ConstitutionViolation[]; mtimeMs: number };

const cache = new Map<string, Cached>();

export async function getCachedFileAnalysis(
  absPath: string,
  readAndAnalyze: (mtimeMs: number) => Promise<ConstitutionViolation[]>,
): Promise<ConstitutionViolation[]> {
  const st = await fs.stat(absPath);
  const raw = await fs.readFile(absPath);
  const h = createHash("sha256").update(raw).digest("hex").slice(0, 24);
  const key = `${absPath}:${h}`;
  const hit = cache.get(key);
  if (hit && hit.mtimeMs === st.mtimeMs) {
    return hit.violations;
  }
  const violations = await readAndAnalyze(st.mtimeMs);
  cache.set(key, { violations, mtimeMs: st.mtimeMs });
  return violations;
}

export function clearConstitutionStaticCache(): void {
  cache.clear();
}
