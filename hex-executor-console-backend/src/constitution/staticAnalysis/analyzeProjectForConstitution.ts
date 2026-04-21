import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import type { ConstitutionViolation } from "../constitutionTypes.js";
import { analyzeSourceFile } from "./analyzeSourceFile.js";
import { isExcludedTestOrFixturePath } from "./astTestPath.js";
import type { AstDetectorContext } from "./detectors/runAllAstDetectors.js";

async function walkTsFiles(dir: string, maxFiles: number, into: string[]): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (into.length >= maxFiles) return;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "dist" || e.name === ".git") continue;
      await walkTsFiles(p, maxFiles, into);
    } else if (/\.(ts|tsx)$/.test(e.name)) {
      into.push(p);
    }
  }
}

export type ProjectScanOptions = {
  workspaceRoot: string;
  scanRoots: string[];
  changedFiles?: string[];
  maxFiles?: number;
  astCtx: AstDetectorContext;
};

export async function analyzeProjectForConstitution(opts: ProjectScanOptions): Promise<{
  violations: ConstitutionViolation[];
  scannedFiles: string[];
}> {
  const max = opts.maxFiles ?? 120;
  let files: string[] = [];
  if (opts.changedFiles?.length) {
    files = opts.changedFiles
      .map((f) => path.resolve(f))
      .filter(
        (f) =>
          /\.(ts|tsx)$/.test(f) && !isExcludedTestOrFixturePath(f) && opts.scanRoots.some((r) => f.startsWith(path.resolve(r))),
      )
      .slice(0, max);
  } else {
    for (const r of opts.scanRoots) {
      await walkTsFiles(path.resolve(r), max - files.length, files);
      if (files.length >= max) break;
    }
  }

  const violations: ConstitutionViolation[] = [];
  for (const f of files) {
    const part = await analyzeSourceFile(f, opts.workspaceRoot, opts.astCtx);
    violations.push(...part);
  }
  return { violations, scannedFiles: files };
}
