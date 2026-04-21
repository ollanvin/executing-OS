import { createHash } from "node:crypto";
import fs from "node:fs/promises";

async function sha256File(p: string): Promise<string> {
  const buf = await fs.readFile(p);
  return createHash("sha256").update(buf).digest("hex");
}

/** 단일 파일: rename 우선, 실패 시 copy+검증+원본 삭제 (cross-volume). */
export async function commitFileMoveAtomic(
  src: string,
  dest: string,
  overwrite: boolean,
  logs: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (overwrite) {
      try {
        await fs.unlink(dest);
      } catch {
        /* absent */
      }
    }
    await fs.rename(src, dest);
    logs.push("[MOVE] atomic rename OK");
    return { ok: true };
  } catch (e1) {
    const msg1 = e1 instanceof Error ? e1.message : String(e1);
    logs.push(`[MOVE] rename failed, fallback copy: ${msg1}`);
    try {
      if (overwrite) {
        try {
          await fs.unlink(dest);
        } catch {
          /* absent */
        }
      }
      const srcHash = await sha256File(src);
      const srcSize = (await fs.stat(src)).size;
      await fs.copyFile(src, dest);
      const destHash = await sha256File(dest);
      const destSize = (await fs.stat(dest)).size;
      if (srcHash !== destHash || srcSize !== destSize) {
        try {
          await fs.unlink(dest);
        } catch {
          /* */
        }
        return { ok: false, error: "copy 후 해시/크기 검증 실패" };
      }
      await fs.unlink(src);
      logs.push("[MOVE] cross-volume copy+verify OK");
      return { ok: true };
    } catch (e2) {
      const msg2 = e2 instanceof Error ? e2.message : String(e2);
      return { ok: false, error: `rename 및 copy 모두 실패: ${msg2}` };
    }
  }
}
