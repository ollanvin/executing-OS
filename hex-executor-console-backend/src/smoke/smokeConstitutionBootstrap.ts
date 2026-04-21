/**
 * 모든 smoke 스크립트 최상단에서 호출 — 헌법 0번 공정 (로드 + smoke_run 사전검사).
 */
import { loadConstitution } from "../constitution/loadConstitution.js";
import { runConstitutionPreflight } from "../constitution/runConstitutionPreflight.js";
import { getDefaultWorkspaceRoot } from "../workspaceRoot.js";

export async function smokeConstitutionStep0(scriptId: string): Promise<void> {
  const workspaceRoot = getDefaultWorkspaceRoot();
  await loadConstitution(workspaceRoot);
  const pre = await runConstitutionPreflight({
    workspaceRoot,
    taskKind: "smoke_run",
    workerKind: "smoke",
    rawText: `[smoke:${scriptId}]`,
  });
  if (!pre.ok) {
    process.stderr.write(`[constitution] smoke preflight blocked:\n${pre.summaryKo.fullText}\n`);
    process.exit(1);
  }
}
