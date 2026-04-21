import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { parse as parseYaml } from "yaml";
import { assertConstitutionDirReadable, getConstitutionRoot } from "./constitutionPaths.js";
import { assertValid, getConstitutionValidators } from "./ajvConstitutionValidator.js";
import type {
  ConstitutionDocument,
  ConstitutionResolutionSnapshot,
  ConstitutionRule,
} from "./constitutionTypes.js";
import type { ExceptionScope } from "./constitutionScope.js";

export type ExceptionEntryRecord = {
  id: string;
  relatedRuleId: string;
  reason: string;
  owner: string;
  approvedBy: string;
  approvedAt: string;
  expiresAt: string;
  scope: ExceptionScope;
  modeOverride: "observe" | "warn" | "deny";
  evidenceLinks: string[];
  active?: boolean;
  services?: string[];
  note?: string;
};

export type ExceptionBundleParsed = {
  kind: "aws_free_tier" | "region_regulatory";
  exceptions: ExceptionEntryRecord[];
};

export type LoadedConstitutionBundle = {
  root: string;
  document: ConstitutionDocument;
  rules: Map<string, ConstitutionRule>;
  exceptionBundles: {
    aws: ExceptionBundleParsed;
    region: ExceptionBundleParsed;
  };
  expiredExceptionIds: string[];
  /** @deprecated 호환 — resolveAwsFreeTierAllowed 사용 */
  awsExceptionActive: boolean;
  loadedAt: string;
  schemaDigest: string;
};

let cache: { root: string; mtimeMs: number; bundle: LoadedConstitutionBundle } | null = null;

async function readYamlFile<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, "utf8");
  const doc = parseYaml(raw) as T;
  if (doc === null || typeof doc !== "object") {
    throw new Error(`헌법 YAML 파싱 실패(루트가 object 아님): ${filePath}`);
  }
  return doc;
}

function digestFiles(schemaDir: string, paths: string[]): Promise<string> {
  const h = createHash("sha256");
  return (async () => {
    for (const p of paths.sort()) {
      const rel = path.join(schemaDir, p);
      const st = await fs.readFile(rel);
      h.update(st);
    }
    return h.digest("hex").slice(0, 16);
  })();
}

function filterExpiredExceptions(
  bundle: ExceptionBundleParsed,
  now: number,
): { active: ExceptionBundleParsed; expiredIds: string[] } {
  const expiredIds: string[] = [];
  const exceptions = bundle.exceptions.filter((e) => {
    const exp = new Date(e.expiresAt).getTime();
    if (exp < now) {
      expiredIds.push(e.id);
      return false;
    }
    if (e.active === false) return false;
    return true;
  });
  return { active: { ...bundle, exceptions }, expiredIds };
}

export function buildConstitutionResolutionSnapshot(
  bundle: LoadedConstitutionBundle,
  evaluatedRuleIds: string[],
): ConstitutionResolutionSnapshot {
  return {
    documentVersion: bundle.document.version,
    schemaDigest: bundle.schemaDigest,
    evaluatedRuleIds,
    exceptionBundleKinds: [bundle.exceptionBundles.aws.kind, bundle.exceptionBundles.region.kind],
    expiredExceptionIds: bundle.expiredExceptionIds,
  };
}

/**
 * shared/constitution 로드 — AJV schema 실패 시 throw (hard fail)
 */
export async function loadConstitution(workspaceRoot: string): Promise<LoadedConstitutionBundle> {
  const root = getConstitutionRoot(workspaceRoot);
  await assertConstitutionDirReadable(root);

  const mainStat = await fs.stat(path.join(root, "constitution.yaml"));
  if (cache && cache.root === root && cache.mtimeMs === mainStat.mtimeMs) {
    return cache.bundle;
  }

  const schemaDir = path.join(root, "schema");
  const v = await getConstitutionValidators(schemaDir);
  const schemaDigest = await digestFiles(schemaDir, [
    "constitution.schema.json",
    "rule.schema.json",
    "exception-bundle.schema.json",
    "realrun-report.schema.json",
  ]);

  const mainPath = path.join(root, "constitution.yaml");
  const rawMain = await readYamlFile<Record<string, unknown>>(mainPath);
  await assertValid(v.validateConstitution, rawMain, mainPath);

  const document = rawMain as unknown as ConstitutionDocument;

  const rules = new Map<string, ConstitutionRule>();
  for (const ref of document.ruleRefs) {
    const rp = path.join(root, ref);
    const ruleObj = await readYamlFile<Record<string, unknown>>(rp);
    await assertValid(v.validateRule, ruleObj, rp);
    const rule = ruleObj as ConstitutionRule;
    const id = String(rule.id);
    rules.set(id, rule);
  }

  const awsPath = path.join(root, "exceptions", "aws-free-tier.yaml");
  const regionPath = path.join(root, "exceptions", "region-regulatory-exceptions.yaml");

  const rawAws = await readYamlFile<Record<string, unknown>>(awsPath);
  await assertValid(v.validateExceptionBundle, rawAws, awsPath);
  const rawRegion = await readYamlFile<Record<string, unknown>>(regionPath);
  await assertValid(v.validateExceptionBundle, rawRegion, regionPath);

  const now = Date.now();
  const awsParsed = rawAws as unknown as ExceptionBundleParsed;
  const regionParsed = rawRegion as unknown as ExceptionBundleParsed;

  const expired: string[] = [];
  const awsF = filterExpiredExceptions(awsParsed, now);
  const regionF = filterExpiredExceptions(regionParsed, now);
  expired.push(...awsF.expiredIds, ...regionF.expiredIds);

  if (expired.length) {
    console.error(`[constitution] 만료된 예외 제외: ${expired.join(", ")}`);
  }

  const bundle: LoadedConstitutionBundle = {
    root,
    document,
    rules,
    exceptionBundles: { aws: awsF.active, region: regionF.active },
    expiredExceptionIds: expired,
    awsExceptionActive: awsF.active.exceptions.length > 0,
    loadedAt: new Date().toISOString(),
    schemaDigest,
  };

  cache = { root, mtimeMs: mainStat.mtimeMs, bundle };
  return bundle;
}

export function invalidateConstitutionCache(): void {
  cache = null;
}
