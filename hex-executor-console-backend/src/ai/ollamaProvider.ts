/**
 * Ollama HTTP LLM 전용 (chat/generate/classify).
 * 호스트 OS 실행은 {@link ../ollama/hostExecutor.js executeHostTask},
 * 샌드박스 job은 {@link ../ollama/sandboxOperator.js runSandboxJobWithPolling} — 동일 "Ollama" 브랜드이나 책임 분리.
 */
import { randomUUID } from "node:crypto";
import type { ParsedAction } from "../types.js";
import { validateAiParsedBody } from "./intentAllowlist.js";
import type { AiProvider } from "./types.js";

const OLLAMA_BASE = (process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");
const OLLAMA_MODEL = process.env.OLLAMA_MODEL?.trim() || "llama3.1:8b";
const OLLAMA_PLANNER_MODEL = process.env.PLANNER_MODEL_NAME?.trim() || OLLAMA_MODEL;

export type OllamaHttpError = Error & { httpStatus: number };

function httpError(status: number, detail: string): OllamaHttpError {
  const e = new Error(`OLLAMA_HTTP_${status}:${detail}`) as OllamaHttpError;
  e.httpStatus = status;
  return e;
}

async function ollamaGenerate(
  prompt: string,
  forClassify: boolean,
  opts?: { model?: string; temperature?: number; numPredict?: number },
): Promise<string | null> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: opts?.model ?? OLLAMA_MODEL,
        prompt,
        stream: false,
        options: {
          temperature: opts?.temperature ?? 0,
          num_predict: opts?.numPredict ?? 2048,
        },
      }),
    });
    if (!res.ok) {
      if (forClassify) throw httpError(res.status, await res.text().then((t) => t.slice(0, 200)));
      return null;
    }
    const j = (await res.json()) as { response?: string };
    return j.response ?? null;
  } catch (e) {
    if (forClassify && e && typeof e === "object" && "httpStatus" in e) throw e;
    return null;
  }
}

/** LLM 플래너 전용 호출 (분류용 forClassify와 분리). */
export async function ollamaGeneratePlannerText(prompt: string): Promise<string | null> {
  return ollamaGenerate(prompt, false, {
    model: OLLAMA_PLANNER_MODEL,
    temperature: 0.2,
    numPredict: 4096,
  });
}

export class OllamaProvider implements AiProvider {
  readonly name = "ollama" as const;

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${OLLAMA_BASE}/api/tags`, { method: "GET" });
      return res.ok;
    } catch {
      return false;
    }
  }

  async classifyCommand(text: string): Promise<ParsedAction | null> {
    const prompt = `You classify user commands for a local operator. Reply with ONLY JSON, no markdown.
Keys: category, intent, intentLabel, requiresApproval, executionSummary, args.
category: FILE_OP|APP_OP|EMULATOR_OP|VM_OP|LOG_OP|SYSTEM_OP
intent EXACTLY one of: adb_screenshot, myphonecheck_emulator, myphonecheck_app_launch, myphonecheck_app_ready_screenshot, myphonecheck_capture_package, myphonecheck_capture_bundle_run, recent_logs, vm_operation, app_install_or_download, app_launch, app_launch_generic, file_move, system_status, unknown
Do not invent intents. If unsure use unknown. args is object, {} if empty.
Command: ${JSON.stringify(text)}`;
    const out = await ollamaGenerate(prompt, true);
    if (!out) return null;
    try {
      const jsonMatch = out.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch?.[0] ?? out) as Record<string, unknown>;
      const body = validateAiParsedBody({
        category: parsed.category,
        intent: parsed.intent,
        rawText: text,
        intentLabel: parsed.intentLabel,
        args: parsed.args,
        requiresApproval: parsed.requiresApproval,
        executionSummary: parsed.executionSummary,
      });
      if (!body) return null;
      return { ...body, id: randomUUID() };
    } catch {
      return null;
    }
  }

  async summarizeExecution(text: string): Promise<string | null> {
    return ollamaGenerate(
      `다음 실행 결과를 한국어로 2~3문장 요약:\n${text.slice(0, 4000)}`,
      false,
    );
  }

  async suggestNextCommands(context: string): Promise<string[] | null> {
    const out = await ollamaGenerate(
      `다음 맥락에서 사용자가 입력할 만한 다음 명령 3가지를 JSON 문자열 배열만 출력:\n${context.slice(0, 2000)}`,
      false,
    );
    if (!out) return null;
    try {
      const m = out.match(/\[[\s\S]*\]/);
      const arr = JSON.parse(m?.[0] ?? out) as unknown;
      if (!Array.isArray(arr)) return null;
      return arr.filter((x): x is string => typeof x === "string").slice(0, 5);
    } catch {
      return null;
    }
  }
}
