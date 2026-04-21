import { randomUUID } from "node:crypto";
import type { ParsedAction } from "../types.js";
import { validateAiParsedBody } from "./intentAllowlist.js";
import type { AiProvider } from "./types.js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY?.trim();
const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";

/** 모듈 최초 로드 시점의 키 존재 여부 — 이후 `process.env`만 바꿔도 갱신되지 않음(플래너·분류기와 동일). */
export function isGeminiApiKeyConfiguredAtModuleLoad(): boolean {
  return Boolean(GEMINI_API_KEY);
}

export type GeminiHttpError = Error & { httpStatus: number };

function httpError(status: number, detail: string): GeminiHttpError {
  const e = new Error(`GEMINI_HTTP_${status}:${detail}`) as GeminiHttpError;
  e.httpStatus = status;
  return e;
}

const PLANNER_MODEL_OVERRIDE = process.env.PLANNER_MODEL_NAME?.trim();

/** Gemini 플래너 경로(`invokePlannerModel` → `geminiGeneratePlannerText`)에서 URL에 넣는 모델 ID — `PLANNER_MODEL_NAME` 우선, 없으면 `GEMINI_MODEL`. */
export function getEffectiveGeminiPlannerModelIdForTrace(): string {
  return PLANNER_MODEL_OVERRIDE || GEMINI_MODEL;
}

async function generateTextWithConfig(
  prompt: string,
  generationConfig: { temperature: number; maxOutputTokens: number },
  modelId: string,
): Promise<string | null> {
  if (!GEMINI_API_KEY) return null;
  const modelSeg = encodeURIComponent(modelId);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelSeg}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig,
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw httpError(res.status, t.slice(0, 200));
    }
    const j = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = j.candidates?.[0]?.content?.parts?.[0]?.text;
    return text ?? null;
  } catch (e) {
    if (e && typeof e === "object" && "httpStatus" in e) throw e;
    return null;
  }
}

async function generateText(prompt: string): Promise<string | null> {
  return generateTextWithConfig(prompt, { temperature: 0, maxOutputTokens: 1024 }, GEMINI_MODEL);
}

/** LLM 플래너용: 더 긴 출력, 약간의 온도. 모델은 PLANNER_MODEL_NAME 우선, 없으면 GEMINI_MODEL. */
export async function geminiGeneratePlannerText(prompt: string): Promise<string | null> {
  const modelId = PLANNER_MODEL_OVERRIDE || GEMINI_MODEL;
  return generateTextWithConfig(prompt, { temperature: 0.2, maxOutputTokens: 8192 }, modelId);
}

export class GeminiProvider implements AiProvider {
  readonly name = "gemini" as const;

  async isAvailable(): Promise<boolean> {
    return Boolean(GEMINI_API_KEY);
  }

  async classifyCommand(text: string): Promise<ParsedAction | null> {
    const prompt = `You classify user commands for a local operator. Reply with ONLY a JSON object, no markdown.
Keys (exact): category, intent, intentLabel, requiresApproval, executionSummary, args.
- category must be one of: FILE_OP, APP_OP, EMULATOR_OP, VM_OP, LOG_OP, SYSTEM_OP
- intent must be EXACTLY one of: adb_screenshot, myphonecheck_emulator, myphonecheck_app_launch, myphonecheck_app_ready_screenshot, myphonecheck_capture_package, myphonecheck_capture_bundle_run, recent_logs, vm_operation, app_install_or_download, app_launch, app_launch_generic, file_move, system_status, unknown
- Do not invent new intents. If unsure use unknown.
- args: object, use {} if none. For file_move include source, destination, overwrite when paths exist in the user text.
User command: ${JSON.stringify(text)}`;
    let out: string | null;
    try {
      out = await generateText(prompt);
    } catch (e) {
      if (e && typeof e === "object" && "httpStatus" in e) throw e;
      return null;
    }
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
    const prompt = `Summarize this local operator execution in 2-3 Korean sentences. Be factual.\n${text}`;
    try {
      return await generateText(prompt);
    } catch {
      return null;
    }
  }

  async suggestNextCommands(context: string): Promise<string[] | null> {
    const prompt = `Suggest 3 short Korean user commands as JSON array of strings only. Context:\n${context.slice(0, 2000)}`;
    let out: string | null;
    try {
      out = await generateText(prompt);
    } catch {
      return null;
    }
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
