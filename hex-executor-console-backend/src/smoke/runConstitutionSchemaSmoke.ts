/**
 * AJV schema 실검증 스모크 — 잘못된 문서는 즉시 실패
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getConstitutionValidators } from "../constitution/ajvConstitutionValidator.js";
import { smokeConstitutionStep0 } from "./smokeConstitutionBootstrap.js";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dir, "..", "..");
const shared = path.join(backendRoot, "..", "..", "shared", "constitution");
const schemaDir = path.join(shared, "schema");

async function main() {
  await smokeConstitutionStep0("constitution_schema");

  const v = await getConstitutionValidators(schemaDir);
  const badConst = { version: "not-semver" };
  const v1 = v.validateConstitution(badConst);
  if (v1) throw new Error("expected invalid constitution to fail");
  console.log("[ok] invalid constitution rejected");

  const badRule = { id: "x" };
  const v2 = v.validateRule(badRule);
  if (v2) throw new Error("expected invalid rule to fail");
  console.log("[ok] invalid rule rejected");

  const badEx = { kind: "aws_free_tier", exceptions: [{ id: "only" }] };
  const v3 = v.validateExceptionBundle(badEx);
  if (v3) throw new Error("expected invalid exception to fail");
  console.log("[ok] invalid exception bundle rejected");

  const badRealRun = { run: { runId: "x" } };
  if (v.validateRealrunReport(badRealRun)) throw new Error("expected invalid realrun report to fail");
  console.log("[ok] invalid realrun report rejected");

  const minimalRealRun = {
    run: {
      runId: "smoke-realrun-1",
      kind: "realRun",
      startedAt: "2026-04-21T10:00:00.000Z",
      endedAt: "2026-04-21T10:05:00.000Z",
      neoVersion: "0.0.0-smoke",
      gitCommit: "deadbeef",
    },
    environment: {
      neo: { os: "linux", workspaceRoot: "/w", constitutionRoot: "/c" },
      emulator: {
        platform: "android",
        deviceModel: "sdk_gphone64",
        osVersion: "34",
        locale: "ko-KR",
        timezone: "Asia/Seoul",
        currency: "KRW",
      },
      app: {
        name: "SmokeApp",
        packageId: "com.smoke.app",
        versionName: "1.0",
        versionCode: "1",
        store: "testLocal",
        channel: "internal",
      },
    },
    plan: { goal: "smoke", steps: [] },
    execution: { status: "succeeded", steps: [] },
    screens: { sequence: [] },
    constitution: {
      preflight: { status: "ok", issues: [] },
      audit: { status: "ok", issues: [] },
    },
  };
  if (!v.validateRealrunReport(minimalRealRun)) throw new Error("expected minimal realrun report to validate");
  console.log("[ok] minimal realrun report accepted");

  process.stdout.write(JSON.stringify({ ok: true, schemaDir }, null, 2) + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
