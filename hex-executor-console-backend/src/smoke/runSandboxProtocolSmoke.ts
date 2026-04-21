/**
 * Sandbox bridge 스모크: stub / in-process real / 별도 프로세스 real-process.
 * node scripts/runWithNeoEnv.mjs src/smoke/runSandboxProtocolSmoke.ts
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadNeoPolicy } from "../policy.js";
import { runSandboxJobWithPolling } from "../ollama/sandboxOperator.js";
import { resolveSandboxSharedRoot } from "../sandbox/sandboxPaths.js";
import { getDefaultWorkspaceRoot } from "../workspaceRoot.js";
import { smokeConstitutionStep0 } from "./smokeConstitutionBootstrap.js";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dir, "..", "..");
const outputRoot = path.join(backendRoot, "output");

async function main() {
  await smokeConstitutionStep0("runSandboxProtocolSmoke");
  const workspaceRoot = getDefaultWorkspaceRoot();
  const policy = await loadNeoPolicy(workspaceRoot);

  const stubRun = await runSandboxJobWithPolling({
    outputRoot,
    policy,
    task: "generic_script",
    params: { smokeCase: "stub-path" },
    timeoutMs: 30_000,
    completeWithAgent: "stub",
  });

  const realRun = await runSandboxJobWithPolling({
    outputRoot,
    policy,
    task: "generic_script",
    params: { smokeCase: "real-inprocess" },
    timeoutMs: 30_000,
    completeWithAgent: "real",
  });

  const procRun = await runSandboxJobWithPolling({
    outputRoot,
    policy,
    task: "generic_script",
    params: { smokeCase: "real-process" },
    timeoutMs: 60_000,
    completeWithAgent: "real-process",
    workspaceRoot,
    backendRoot,
  });

  const sharedRoot = resolveSandboxSharedRoot({ outputRoot });
  const ok = stubRun.ok && realRun.ok && procRun.ok;
  process.stdout.write(
    JSON.stringify(
      {
        ok,
        sharedRoot,
        modes: {
          stub: stubRun.ok
            ? { jobId: stubRun.jobId, summary: stubRun.result.summary }
            : { error: stubRun.reason },
          realInProcess: realRun.ok
            ? { jobId: realRun.jobId, summary: realRun.result.summary }
            : { error: realRun.reason },
          realProcess: procRun.ok
            ? {
                jobId: procRun.jobId,
                summary: procRun.result.summary,
                artifacts: procRun.result.artifacts,
              }
            : { error: procRun.reason },
        },
      },
      null,
      2,
    ) + "\n",
  );
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
