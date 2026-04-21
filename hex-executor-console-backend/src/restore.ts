import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { appendAudit } from "./safekeep/audit.js";
import type { ManifestItem, SnapshotManifest } from "./types.js";

async function sha256File(p: string): Promise<string> {
  const buf = await fs.readFile(p);
  return createHash("sha256").update(buf).digest("hex");
}

function verifyManifestIntegrity(m: SnapshotManifest): { ok: true } | { ok: false; reason: string } {
  if (!m.integritySha256) return { ok: true };
  const { integritySha256, ...rest } = m;
  const h = createHash("sha256").update(JSON.stringify(rest)).digest("hex");
  if (h !== integritySha256) {
    return { ok: false, reason: "manifest integritySha256 불일치 (변조 가능성)" };
  }
  return { ok: true };
}

async function readManifestAt(filePath: string): Promise<SnapshotManifest | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as SnapshotManifest;
  } catch {
    return null;
  }
}

async function findManifestPath(
  workspaceRoot: string,
  restorePointId: string,
): Promise<string | null> {
  const root = path.join(workspaceRoot, ".neo-safekeep", "snapshots");

  async function walk(dir: string): Promise<string | null> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        const candidate = path.join(p, "manifest.json");
        const m = await readManifestAt(candidate);
        if (m?.restorePointId === restorePointId) return candidate;
        const nested = await walk(p);
        if (nested) return nested;
      }
    }
    return null;
  }

  return walk(root);
}

async function verifyBackupItem(item: ManifestItem): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    await fs.access(item.backupPath);
  } catch {
    return { ok: false, reason: `backupPath 없음: ${item.backupPath}` };
  }
  const h = await sha256File(item.backupPath);
  if (h !== item.sha256) {
    return { ok: false, reason: `백업 파일 해시 불일치: ${item.backupPath}` };
  }
  return { ok: true };
}

export type RestoreResult = {
  ok: boolean;
  summary: string;
  restoredItems?: string[];
  failedItems?: string[];
  verificationStatus: "skipped" | "passed" | "failed";
};

export async function restoreByRestorePointId(
  workspaceRoot: string,
  restorePointId: string,
): Promise<RestoreResult> {
  await appendAudit(workspaceRoot, {
    timestamp: new Date().toISOString(),
    user: "local",
    commandId: `restore-${restorePointId}`,
    category: "RESTORE",
    intent: "restore",
    isMutating: true,
    backupStatus: "n/a",
    affectedPaths: [],
    result: "restore_started",
    detail: restorePointId,
    eventType: "restore_started",
  });

  const manifestPath = await findManifestPath(workspaceRoot, restorePointId);
  if (!manifestPath) {
    await appendAudit(workspaceRoot, {
      timestamp: new Date().toISOString(),
      user: "local",
      commandId: `restore-${restorePointId}`,
      category: "RESTORE",
      intent: "restore",
      isMutating: true,
      backupStatus: "n/a",
      affectedPaths: [],
      result: "restore_failed",
      detail: "manifest not found",
      eventType: "restore_failed",
    });
    return {
      ok: false,
      summary: `restorePointId 를 찾을 수 없습니다: ${restorePointId}`,
      verificationStatus: "failed",
    };
  }
  const manifest = await readManifestAt(manifestPath);
  if (!manifest?.items?.length) {
    return {
      ok: false,
      summary: "manifest 가 비어 있습니다.",
      verificationStatus: "failed",
    };
  }

  const integ = verifyManifestIntegrity(manifest);
  if (!integ.ok) {
    await appendAudit(workspaceRoot, {
      timestamp: new Date().toISOString(),
      user: "local",
      commandId: manifest.commandId,
      category: "RESTORE",
      intent: "restore",
      isMutating: true,
      backupStatus: "n/a",
      affectedPaths: [],
      result: "restore_failed",
      detail: integ.reason,
      eventType: "restore_failed",
    });
    return { ok: false, summary: integ.reason, verificationStatus: "failed" };
  }

  const restored: string[] = [];
  const failed: string[] = [];

  for (const item of manifest.items) {
    const vb = await verifyBackupItem(item);
    if (!vb.ok) {
      failed.push(item.originalPath);
      await appendAudit(workspaceRoot, {
        timestamp: new Date().toISOString(),
        user: "local",
        commandId: manifest.commandId,
        category: "RESTORE",
        intent: "restore",
        isMutating: true,
        backupStatus: "n/a",
        affectedPaths: [item.originalPath],
        result: "restore_failed",
        detail: vb.reason,
        eventType: "restore_failed",
      });
      return {
        ok: false,
        summary: vb.reason,
        restoredItems: restored,
        failedItems: failed,
        verificationStatus: "failed",
      };
    }
    try {
      await fs.mkdir(path.dirname(item.originalPath), { recursive: true });
      await fs.copyFile(item.backupPath, item.originalPath);
      const nh = await sha256File(item.originalPath);
      if (nh !== item.sha256) {
        failed.push(item.originalPath);
        return {
          ok: false,
          summary: `복구 후 검증 실패: ${item.originalPath}`,
          restoredItems: restored,
          failedItems: failed,
          verificationStatus: "failed",
        };
      }
      restored.push(item.originalPath);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      failed.push(item.originalPath);
      await appendAudit(workspaceRoot, {
        timestamp: new Date().toISOString(),
        user: "local",
        commandId: manifest.commandId,
        category: "RESTORE",
        intent: "restore",
        isMutating: true,
        backupStatus: "n/a",
        affectedPaths: [item.originalPath],
        result: "restore_failed",
        detail: msg,
        eventType: "restore_failed",
      });
      return {
        ok: false,
        summary: `복구 중단 (${item.originalPath}): ${msg}`,
        restoredItems: restored,
        failedItems: failed,
        verificationStatus: "failed",
      };
    }
  }

  await appendAudit(workspaceRoot, {
    timestamp: new Date().toISOString(),
    user: "local",
    commandId: manifest.commandId,
    category: "RESTORE",
    intent: "restore",
    isMutating: true,
    backupStatus: "n/a",
    affectedPaths: restored,
    result: "restore_succeeded",
    detail: restorePointId,
    eventType: "restore_succeeded",
  });

  return {
    ok: true,
    summary: `복구 완료: ${restored.length}개 경로 (restorePointId=${restorePointId}), 검증 통과`,
    restoredItems: restored,
    failedItems: failed,
    verificationStatus: "passed",
  };
}
