import fs from "node:fs/promises";
import path from "node:path";

export type ConstitutionReportIndexEntry = {
  at: string;
  kind: "preflight" | "audit";
  jsonPath: string;
  mdPath?: string;
  finalMode: string;
  violationCount: number;
  ruleIdsTouched: string[];
};

const MAX = 100;

export async function appendConstitutionReportIndex(
  reportsDir: string,
  entry: ConstitutionReportIndexEntry,
): Promise<void> {
  const indexPath = path.join(reportsDir, "index.json");
  let list: ConstitutionReportIndexEntry[] = [];
  try {
    const raw = await fs.readFile(indexPath, "utf8");
    const parsed = JSON.parse(raw) as
      | ConstitutionReportIndexEntry[]
      | { entries?: ConstitutionReportIndexEntry[] };
    if (Array.isArray(parsed)) {
      list = parsed;
    } else if (Array.isArray(parsed?.entries)) {
      list = parsed.entries;
    } else {
      list = [];
    }
  } catch {
    list = [];
  }
  list.unshift(entry);
  list = list.slice(0, MAX);
  await fs.writeFile(indexPath, JSON.stringify({ generatedAt: new Date().toISOString(), entries: list }, null, 2), "utf8");
}
