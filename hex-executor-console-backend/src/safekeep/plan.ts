import fs from "node:fs/promises";
import path from "node:path";
import type { ActionRequest } from "../types.js";
import type { NeoPolicy } from "../policy.js";
import { validateMutatingPath } from "../policy.js";

export type PlanItem = {
  originalPath: string;
  existsBefore: boolean;
  size: number;
  mtimeMs: number;
};

export type PlanOk = {
  ok: true;
  items: PlanItem[];
  totalBytes: number;
  summary: string;
  /** 덮어쓰기 대상 원본 경로 */
  overwriteTargets: string[];
};

export type PlanFail = { ok: false; reason: string };

export type PlanResult = PlanOk | PlanFail;

export async function buildFileMovePlan(
  action: ActionRequest,
  policy: NeoPolicy,
): Promise<PlanResult> {
  const src = action.args.source as string | null;
  const dest = action.args.destination as string | null;
  const overwrite = Boolean(action.args.overwrite);

  if (!src || !dest) {
    return {
      ok: false,
      reason: "원본·대상 경로가 명령에서 추출되지 않았습니다.",
    };
  }

  const absSrc = path.resolve(src);
  const absDest = path.resolve(dest);

  for (const p of [absSrc, absDest]) {
    const v = validateMutatingPath(p, policy);
    if (!v.ok) return { ok: false, reason: v.reason };
  }

  let st;
  try {
    st = await fs.stat(absSrc);
  } catch {
    return { ok: false, reason: `원본을 찾을 수 없습니다: ${absSrc}` };
  }
  if (st.isDirectory()) {
    return {
      ok: false,
      reason:
        "대량/디렉터리 이동은 아직 미지원입니다. 단일 파일만 이동할 수 있습니다. 폴더 단위 작업은 추후 배치 파이프라인에서 다룹니다.",
    };
  }

  const items: PlanItem[] = [
    {
      originalPath: absSrc,
      existsBefore: true,
      size: st.size,
      mtimeMs: st.mtimeMs,
    },
  ];

  const overwriteTargets: string[] = [];
  let destExists = false;
  try {
    const dst = await fs.stat(absDest);
    destExists = true;
    if (dst.isDirectory()) {
      return { ok: false, reason: "대상 경로가 디렉터리입니다. 파일 경로를 지정하세요." };
    }
    if (!overwrite) {
      return {
        ok: false,
        reason: `대상 파일이 이미 있습니다. 덮어쓰려면 명령에 '덮어쓰기'를 포함하세요: ${absDest}`,
      };
    }
    overwriteTargets.push(absDest);
    items.push({
      originalPath: absDest,
      existsBefore: true,
      size: dst.size,
      mtimeMs: dst.mtimeMs,
    });
  } catch {
    /* dest absent */
  }

  if (items.length > policy.maxFilesPerCommand) {
    return { ok: false, reason: `파일 수가 정책 한도(${policy.maxFilesPerCommand})를 초과합니다.` };
  }

  if (items.length > policy.maxItemsPerCommit) {
    return {
      ok: false,
      reason: `커밋당 항목 한도 초과 (${items.length} > ${policy.maxItemsPerCommit}). 관리자 정책을 확인하세요.`,
    };
  }

  const totalBytes = items.reduce((s, i) => s + i.size, 0);
  const maxB = policy.maxBackupSizeMB * 1024 * 1024;
  if (totalBytes > maxB) {
    return {
      ok: false,
      reason: `백업 예정 용량 ${totalBytes} bytes 가 한도 ${policy.maxBackupSizeMB} MB 를 초과합니다.`,
    };
  }

  if (totalBytes > policy.maxBytesPerCommit) {
    return {
      ok: false,
      reason: `커밋당 바이트 한도 초과 (${totalBytes} > ${policy.maxBytesPerCommit}).`,
    };
  }

  return {
    ok: true,
    items,
    totalBytes,
    overwriteTargets,
    summary: `PLAN: ${items.length}개 파일이 영향을 받습니다 (${destExists && overwrite ? "대상 덮어쓰기 포함" : "대상 신규"}). 총 ${(totalBytes / 1024).toFixed(1)} KiB`,
  };
}

export function emptyPlan(summary: string): PlanOk {
  return { ok: true, items: [], totalBytes: 0, summary, overwriteTargets: [] };
}
