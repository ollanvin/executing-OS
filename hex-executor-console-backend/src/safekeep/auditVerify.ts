import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { ChainedAuditRecord } from "./audit.js";

const GENESIS = "genesis";

function recomputeEntryHash(prevHash: string, payload: Record<string, unknown>): string {
  return createHash("sha256").update(`${prevHash}|${JSON.stringify(payload)}`).digest("hex");
}

export type AuditVerifyResult = {
  ok: boolean;
  logFile: string | null;
  linesVerified: number;
  brokenAtLine?: number;
  expectedHash?: string;
  actualHash?: string;
  detail?: string;
};

function verifyChainLines(lines: string[], logLabel: string): AuditVerifyResult {
  let prev = GENESIS;
  let lineNo = 0;
  for (const line of lines) {
    lineNo += 1;
    let rec: ChainedAuditRecord;
    try {
      rec = JSON.parse(line) as ChainedAuditRecord;
    } catch {
      return {
        ok: false,
        logFile: logLabel,
        linesVerified: lineNo - 1,
        brokenAtLine: lineNo,
        detail: "JSON 파싱 실패",
      };
    }
    const { prevHash, entryHash, ...payload } = rec;
    if (typeof prevHash !== "string" || typeof entryHash !== "string") {
      return {
        ok: false,
        logFile: logLabel,
        linesVerified: lineNo - 1,
        brokenAtLine: lineNo,
        detail: "prevHash/entryHash 없음",
      };
    }
    if (prevHash !== prev) {
      return {
        ok: false,
        logFile: logLabel,
        linesVerified: lineNo - 1,
        brokenAtLine: lineNo,
        expectedHash: prev,
        actualHash: prevHash,
        detail: "prevHash 체인 불일치",
      };
    }
    const expected = recomputeEntryHash(prevHash, payload as Record<string, unknown>);
    if (expected !== entryHash) {
      return {
        ok: false,
        logFile: logLabel,
        linesVerified: lineNo - 1,
        brokenAtLine: lineNo,
        expectedHash: expected,
        actualHash: entryHash,
        detail: "entryHash 무결성 불일치",
      };
    }
    prev = entryHash;
  }

  return { ok: true, logFile: logLabel, linesVerified: lines.length };
}

/** 단일 감사 로그 파일 경로에 대해 체인 검증 (테스트·스모크용 복사본 검증에 사용) */
export async function verifyAuditLogFile(logFilePath: string): Promise<AuditVerifyResult> {
  let raw: string;
  try {
    raw = await fs.readFile(logFilePath, "utf8");
  } catch (e) {
    return {
      ok: false,
      logFile: logFilePath,
      linesVerified: 0,
      detail: e instanceof Error ? e.message : String(e),
    };
  }
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  return verifyChainLines(lines, logFilePath);
}

/** 최신 날짜 audit 로그 파일을 찾아 체인 무결성 검증 */
export async function verifyLatestAuditChain(workspaceRoot: string): Promise<AuditVerifyResult> {
  const auditDir = path.join(workspaceRoot, ".neo-safekeep", "audit");
  let files: string[];
  try {
    const ents = await fs.readdir(auditDir);
    files = ents.filter((f) => f.endsWith(".log")).map((f) => path.join(auditDir, f));
  } catch {
    return { ok: true, logFile: null, linesVerified: 0, detail: "audit 디렉터리 없음" };
  }
  if (files.length === 0) {
    return { ok: true, logFile: null, linesVerified: 0, detail: "감사 로그 파일 없음" };
  }

  files.sort();
  const logFile = files[files.length - 1]!;
  const raw = await fs.readFile(logFile, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  const r = verifyChainLines(lines, logFile);
  return r;
}
