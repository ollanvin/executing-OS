/**
 * 헌법 엔진 스모크 — load / preflight / audit 시나리오.
 * node scripts/runWithNeoEnv.mjs src/smoke/runConstitutionEngineSmoke.ts
 */
import { loadConstitution } from "../constitution/loadConstitution.js";
import { runConstitutionAudit } from "../constitution/runConstitutionAudit.js";
import { runConstitutionPreflight } from "../constitution/runConstitutionPreflight.js";
import { getDefaultWorkspaceRoot } from "../workspaceRoot.js";
import { smokeConstitutionStep0 } from "./smokeConstitutionBootstrap.js";

async function main() {
  await smokeConstitutionStep0("constitution_engine");

  const ws = getDefaultWorkspaceRoot();
  const bundle = await loadConstitution(ws);
  if (!bundle.document.version) throw new Error("load sanity");

  const pass = await runConstitutionPreflight({
    workspaceRoot: ws,
    taskKind: "neo_action",
    workerKind: "neo",
    rawText: "MyPhoneCheck 화면 캡처해줘",
    actionIntent: "adb_screenshot",
  });
  if (!pass.ok) throw new Error("expected pass for benign text");

  const deny = await runConstitutionPreflight({
    workspaceRoot: ws,
    taskKind: "payment_integration",
    workerKind: "neo",
    rawText: "add stripe checkout sdk billing integration for subscriptions",
  });
  if (deny.ok) throw new Error("expected deny for stripe");

  const audit = await runConstitutionAudit({
    workspaceRoot: ws,
    taskKind: "bundle_finalize",
    workerKind: "neo",
    artifactText: "summary=ok ok=true",
  });

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        version: bundle.document.version,
        preflightBenign: pass.finalMode,
        preflightStripeBlocked: deny.finalMode === "deny",
        audit: { finalMode: audit.finalMode, drift: audit.driftDetected },
      },
      null,
      2,
    ) + "\n",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
