#!/usr/bin/env node
/**
 * Neo 백엔드 표준 기동: `.env` 가 있으면 `node --env-file=<path>` 로 프로세스 env를
 * tsx보다 먼저 채움 → `geminiProvider` 등 모듈 import 시점에 GEMINI_API_KEY가 보임.
 * `.env` 없으면 경고 후 tsx만 실행(기존 셸 env만 사용).
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const envFile = path.join(root, ".env");
const useEnv = fs.existsSync(envFile);

const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
if (!fs.existsSync(tsxCli)) {
  console.error("[neo-env] tsx not found; run npm install");
  process.exit(1);
}

const nodeArgs = useEnv ? [`--env-file=${envFile}`] : [];
const rest = process.argv.slice(2);
const childArgs = [...nodeArgs, tsxCli, ...rest];

if (!useEnv) {
  console.error(
    "[neo-env] no .env in backend root — using shell env only. Put GEMINI_API_KEY in backend/.env and use npm run start (see .env.example).",
  );
}

const child = spawn(process.execPath, childArgs, { stdio: "inherit", cwd: root, shell: false });
child.on("exit", (code, sig) => {
  if (sig) process.kill(process.pid, sig);
  else process.exit(code ?? 1);
});
