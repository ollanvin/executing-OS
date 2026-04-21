import fs from "node:fs/promises";
import path from "node:path";

/**
 * 워크스페이스 메타데이터에서 선호 AVD 이름을 수집합니다.
 * 우선순위: .neo-emulator.json → NEO_MYPHONECHECK_AVD → projects 아래 각 프로젝트의 config.json 의 neo_operator.emulator.preferred_avds
 */
export async function loadPreferredAvdHints(workspaceRoot: string): Promise<string[]> {
  const hints: string[] = [];

  const neoPath = path.join(workspaceRoot, ".neo-emulator.json");
  try {
    const raw = await fs.readFile(neoPath, "utf8");
    const j = JSON.parse(raw) as { preferredAvds?: string[]; preferred_avds?: string[] };
    const arr = j.preferredAvds ?? j.preferred_avds ?? [];
    hints.push(...arr.filter((x): x is string => typeof x === "string" && x.trim().length > 0));
  } catch {
    /* optional */
  }

  const envAvd = process.env.NEO_MYPHONECHECK_AVD?.trim();
  if (envAvd) hints.push(envAvd);

  const projectsDir = path.join(workspaceRoot, "projects");
  try {
    const ents = await fs.readdir(projectsDir, { withFileTypes: true });
    for (const e of ents) {
      if (!e.isDirectory()) continue;
      const cfgPath = path.join(projectsDir, e.name, "config.json");
      try {
        const raw = await fs.readFile(cfgPath, "utf8");
        const cfg = JSON.parse(raw) as {
          neo_operator?: { emulator?: { preferred_avds?: string[] } };
        };
        const avs = cfg.neo_operator?.emulator?.preferred_avds;
        if (Array.isArray(avs)) {
          hints.push(...avs.filter((x): x is string => typeof x === "string" && x.trim().length > 0));
        }
      } catch {
        /* */
      }
    }
  } catch {
    /* no projects */
  }

  return [...new Set(hints.map((h) => h.trim()).filter(Boolean))];
}

/** 설치된 AVD 목록과 힌트를 맞춰 실제 기동할 AVD 하나를 고릅니다. */
export function pickAvdToLaunch(preferredHints: string[], installedAvds: string[]): string | null {
  for (const h of preferredHints) {
    if (installedAvds.includes(h)) return h;
  }
  const heur = installedAvds.find((a) => /phone|myphone|pixel|check/i.test(a));
  if (heur) return heur;
  return installedAvds[0] ?? null;
}
