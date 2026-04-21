/**
 * 샌드박스 에이전트 별도 프로세스 엔트리.
 * node scripts/runWithNeoEnv.mjs src/sandbox/runSandboxAgentOnce.ts --sharedRoot <path> --jobId <uuid>
 */
import { loadNeoPolicy } from "../policy.js";
import { executeSandboxAgentJob } from "./sandboxProtocol.js";
import { getDefaultWorkspaceRoot } from "../workspaceRoot.js";

function parseArg(name: string, argv: string[]): string | null {
  const i = argv.indexOf(name);
  if (i >= 0 && argv[i + 1]) return argv[i + 1]!;
  return null;
}

async function main() {
  const argv = process.argv.slice(2);
  const sharedRoot =
    parseArg("--sharedRoot", argv) ?? process.env.SANDBOX_SHARED_ROOT?.trim() ?? null;
  const jobId = parseArg("--jobId", argv) ?? process.env.SANDBOX_JOB_ID?.trim() ?? null;
  if (!sharedRoot || !jobId) {
    console.error("Usage: --sharedRoot <dir> --jobId <id> (or env SANDBOX_SHARED_ROOT, SANDBOX_JOB_ID)");
    process.exit(1);
  }
  const workspaceRoot = process.env.NEO_WORKSPACE_ROOT?.trim() || getDefaultWorkspaceRoot();
  const policy = await loadNeoPolicy(workspaceRoot);
  const r = await executeSandboxAgentJob(sharedRoot, jobId, policy);
  if (!r.ok) {
    console.error(`[sandbox-agent] ${r.reason}`);
    process.exit(1);
  }
  process.stdout.write(`[sandbox-agent] ok job=${jobId} summary=${r.result.summary}\n`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
