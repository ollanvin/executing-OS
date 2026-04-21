import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { ActionRequest, ManifestItem, SnapshotManifest } from "../types.js";
import type { PlanItem } from "./plan.js";

async function sha256File(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath);
  return createHash("sha256").update(buf).digest("hex");
}

export type BackupOk = {
  restorePointId: string;
  snapshotId: string;
  manifestPath: string;
  snapshotDir: string;
};

export async function runBackupCow(
  workspaceRoot: string,
  action: ActionRequest,
  items: PlanItem[],
): Promise<{ ok: true; data: BackupOk } | { ok: false; reason: string }> {
  const now = new Date();
  const ymd = now.toISOString().slice(0, 10).replace(/-/g, "");
  const safekeep = path.join(workspaceRoot, ".neo-safekeep");
  const snapRoot = path.join(safekeep, "snapshots", ymd);

  let snapshotSeq = 1;
  try {
    const exist = await fs.readdir(snapRoot);
    snapshotSeq = exist.filter((n) => n.startsWith("snapshot-")).length + 1;
  } catch {
    await fs.mkdir(snapRoot, { recursive: true });
  }

  const snapshotId = `snapshot-${String(snapshotSeq).padStart(4, "0")}`;
  const restorePointId = `rp_${ymd}_${randomUUID().slice(0, 8)}`;
  const snapshotDir = path.join(snapRoot, snapshotId);
  const filesDir = path.join(snapshotDir, "files");

  try {
    await fs.mkdir(filesDir, { recursive: true });
  } catch (e) {
    return {
      ok: false,
      reason: `스냅샷 디렉터리 생성 실패: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const manifestItems: ManifestItem[] = [];

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const base = path.basename(it.originalPath);
    const backupRel = `${String(i).padStart(3, "0")}__${base}`;
    const backupPath = path.join(filesDir, backupRel);
    try {
      await fs.copyFile(it.originalPath, backupPath);
      const sha256 = await sha256File(backupPath);
      manifestItems.push({
        originalPath: it.originalPath,
        backupPath,
        sha256,
        size: it.size,
        mtimeMs: it.mtimeMs,
        existsBefore: it.existsBefore,
      });
    } catch (e) {
      return {
        ok: false,
        reason: `COW 복제 실패 (${it.originalPath}): ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  const draft = {
    restorePointId,
    snapshotId,
    commandId: action.id,
    createdAt: now.toISOString(),
    intent: action.intent,
    mutationKind: action.mutationKind,
    items: manifestItems,
  };
  const integritySha256 = createHash("sha256").update(JSON.stringify(draft)).digest("hex");
  const manifest: SnapshotManifest = { ...draft, integritySha256 };

  const manifestPath = path.join(snapshotDir, "manifest.json");
  try {
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  } catch (e) {
    return {
      ok: false,
      reason: `manifest 기록 실패: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  return {
    ok: true,
    data: { restorePointId, snapshotId, manifestPath, snapshotDir },
  };
}
