/**
 * rule lifecycle(observe/warn/deny) 반영 스모크
 */
import { applyRuleLifecycle } from "../constitution/constitutionLifecycle.js";
import { smokeConstitutionStep0 } from "./smokeConstitutionBootstrap.js";

async function main() {
  await smokeConstitutionStep0("constitution_lifecycle");

  const a = applyRuleLifecycle("deny", "observe");
  if (a !== "observe") throw new Error(`observe stage should soften deny, got ${a}`);

  const b = applyRuleLifecycle("deny", "deny");
  if (b !== "deny") throw new Error(`deny stage keeps deny`);

  const c = applyRuleLifecycle("warn", "warn");
  if (c !== "warn") throw new Error("warn+warn");

  process.stdout.write(JSON.stringify({ ok: true, samples: { a, b, c } }, null, 2) + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
