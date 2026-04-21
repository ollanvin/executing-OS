import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

const EXT = /\.(md|json)$/i;

async function walkFiles(dir: string, acc: string[]): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walkFiles(p, acc);
    else if (EXT.test(e.name)) acc.push(p);
  }
}

export async function readRecentLogArtifact(
  runsDir: string,
  maxLines: number,
): Promise<{ path: string | null; excerpt: string; logs: string[] }> {
  const files: string[] = [];
  await walkFiles(runsDir, files);
  if (files.length === 0) {
    return {
      path: null,
      excerpt: `${runsDir} 아래에서 md/json 파일을 찾지 못했습니다.`,
      logs: [],
    };
  }

  const withStat = await Promise.all(
    files.map(async (f) => {
      const st = await fs.stat(f);
      return { f, m: st.mtimeMs };
    }),
  );
  withStat.sort((a, b) => b.m - a.m);
  const top = withStat[0].f;
  const raw = await fs.readFile(top, "utf8");
  const lines = raw.split(/\r?\n/);
  const head = lines.slice(0, maxLines);
  return {
    path: top,
    excerpt: head.join("\n"),
    logs: [`파일: ${top}`, `크기: ${raw.length} bytes`, ...head.map((l, i) => `${i + 1}| ${l}`)],
  };
}
