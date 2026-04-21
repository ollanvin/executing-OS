import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export type AuditRecord = {
  timestamp: string;
  user: string;
  commandId: string;
  category: string;
  intent: string;
  isMutating: boolean;
  backupStatus: string;
  restorePointId?: string;
  affectedPaths: string[];
  result: string;
  detail?: string;
  eventType?: string;
};

export type ChainedAuditRecord = AuditRecord & {
  prevHash: string;
  entryHash: string;
};

const GENESIS = "genesis";

export async function appendAudit(workspaceRoot: string, record: AuditRecord): Promise<ChainedAuditRecord> {
  const safekeep = path.join(workspaceRoot, ".neo-safekeep", "audit");
  await fs.mkdir(safekeep, { recursive: true });
  const ymd = record.timestamp.slice(0, 10).replace(/-/g, "");
  const logFile = path.join(safekeep, `${ymd}.log`);
  const headPath = path.join(safekeep, ".chain-head");

  let prevHash = GENESIS;
  try {
    prevHash = (await fs.readFile(headPath, "utf8")).trim() || GENESIS;
  } catch {
    /* first entry */
  }

  const entryHash = createHash("sha256")
    .update(`${prevHash}|${JSON.stringify(record)}`)
    .digest("hex");
  const chained: ChainedAuditRecord = { ...record, prevHash, entryHash };

  await fs.appendFile(logFile, `${JSON.stringify(chained)}\n`, "utf8");
  await fs.writeFile(headPath, entryHash, "utf8");

  return chained;
}
