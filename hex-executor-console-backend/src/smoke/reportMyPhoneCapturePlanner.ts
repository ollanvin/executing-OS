/**
 * 단일 고수준 오더에 대해 parse(dry-run 계열) + LLM 플래너 해상도를 JSON으로 출력.
 * 실행: npx tsx src/smoke/reportMyPhoneCapturePlanner.ts
 *
 * `.env`는 기본으로 읽지 않습니다. 백엔드 루트 `.env`를 반영하려면 `NEO_LOAD_DOTENV=1` 이며,
 * 그 경우 본 엔트리에서 dotenv로 채운 뒤 본문 모듈을 **동적 import** 하여 `geminiProvider`가 키를 본다.
 * 또는 `node --env-file=.env`(Node 20+)로 프로세스 env를 먼저 채운 뒤 tsx 실행.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dir, "..", "..");

if ((process.env.NEO_LOAD_DOTENV ?? "").trim() === "1") {
  const r = config({ path: path.join(backendRoot, ".env") });
  if (r.error) {
    process.stderr.write(`[report] dotenv: ${r.error.message}\n`);
  } else if (r.parsed) {
    process.stderr.write(`[report] dotenv loaded ${Object.keys(r.parsed).length} keys (values hidden)\n`);
  }
}

const { smokeConstitutionStep0 } = await import("./smokeConstitutionBootstrap.js");
await smokeConstitutionStep0("reportMyPhoneCapturePlanner");

const { runPlannerReport } = await import("./reportMyPhoneCapturePlanner.impl.js");
await runPlannerReport();
