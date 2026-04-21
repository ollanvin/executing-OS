import { createHash } from "node:crypto";

/** PLAN 항목 요약 — 승인 해시는 `safekeep/canonicalPlan.computeCanonicalPlanHash` 사용. */

export type PreviewParts = {
  affectedPaths: string[];
  mutationKind: string;
  fileCount: number;
  totalBytes: number;
  overwriteTargets: string[];
};

export function canonicalPreviewJson(parts: PreviewParts): string {
  const canonical = {
    affectedPaths: [...parts.affectedPaths].sort(),
    mutationKind: parts.mutationKind,
    fileCount: parts.fileCount,
    totalBytes: parts.totalBytes,
    overwriteTargets: [...parts.overwriteTargets].sort(),
  };
  return JSON.stringify(canonical);
}

export function computePreviewHash(parts: PreviewParts): string {
  return createHash("sha256").update(canonicalPreviewJson(parts)).digest("hex");
}
