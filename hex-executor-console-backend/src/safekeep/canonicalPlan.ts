import { createHash } from "node:crypto";
import path from "node:path";
import type { ActionRequest } from "../types.js";
import type { PreviewParts } from "../previewHash.js";

/**
 * Canonical plan object for approval hash only (not LLM text, not summaries).
 * Paths and workspace are normalized so provider/JSON key order does not affect the hash.
 */
export type CanonicalPlanV1 = {
  category: string;
  intent: string;
  mutationKind: string;
  affectedPaths: string[];
  overwriteTargets: string[];
  fileCount: number;
  totalBytes: number;
  requiresApproval: boolean;
  internalHighRisk: boolean;
  workspaceRoot: string;
};

const isWin = process.platform === "win32";

/** Absolute path, forward slashes, Windows drive letter lowercased. */
export function normalizePathForPlan(p: string, _workspaceRoot: string): string {
  const resolved = path.resolve(p);
  let s = resolved.split(path.sep).join("/");
  if (isWin && /^[A-Za-z]:\//.test(s)) {
    s = s.charAt(0).toLowerCase() + s.slice(1);
  }
  return s;
}

export function normalizeWorkspaceRootForPlan(workspaceRoot: string): string {
  return normalizePathForPlan(workspaceRoot, workspaceRoot);
}

/** RFC 8785–style: deterministic JSON (sorted object keys, no undefined). */
export function canonicalJsonStringify(value: unknown): string {
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalJsonStringify(v)).join(",")}]`;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const parts = keys.map((k) => `${JSON.stringify(k)}:${canonicalJsonStringify(obj[k])}`);
    return `{${parts.join(",")}}`;
  }
  return JSON.stringify(String(value));
}

export function buildCanonicalPlan(
  action: ActionRequest,
  parts: PreviewParts,
  workspaceRoot: string,
): CanonicalPlanV1 {
  const ws = normalizeWorkspaceRootForPlan(workspaceRoot);
  const aff = [...parts.affectedPaths].map((p) => normalizePathForPlan(p, workspaceRoot)).sort();
  const owt = [...parts.overwriteTargets].map((p) => normalizePathForPlan(p, workspaceRoot)).sort();
  return {
    category: action.category,
    intent: action.intent,
    mutationKind: action.mutationKind,
    affectedPaths: aff,
    overwriteTargets: owt,
    fileCount: Number(parts.fileCount) | 0,
    totalBytes: Number(parts.totalBytes) | 0,
    requiresApproval: Boolean(action.requiresApproval),
    internalHighRisk: Boolean(action.internalHighRisk),
    workspaceRoot: ws,
  };
}

export function computeCanonicalPlanHash(action: ActionRequest, parts: PreviewParts, workspaceRoot: string): string {
  const canonical = buildCanonicalPlan(action, parts, workspaceRoot);
  return createHash("sha256").update(canonicalJsonStringify(canonical)).digest("hex");
}
