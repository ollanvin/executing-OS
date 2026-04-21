import { parseCommand } from "../parseCommand.js";
import type { NeoPolicy } from "../policy.js";
import type { ParsedAction } from "../types.js";
import {
  evaluateToolBreaker,
  getToolBreakerSnapshot,
  recordToolFailure,
  recordToolSuccess,
} from "../toolCircuitBreaker.js";
import { allowOllamaFallbackAfterGemini } from "./fallbackPolicy.js";
import type { GeminiHttpError } from "./geminiProvider.js";
import { GeminiProvider } from "./geminiProvider.js";
import { OllamaProvider } from "./ollamaProvider.js";
import type { AiProviderStatus } from "./types.js";

export type AiMode = "auto" | "gemini" | "ollama";

const mode = (process.env.AI_PROVIDER_MODE?.trim().toLowerCase() || "auto") as AiMode;

const gemini = new GeminiProvider();
const ollama = new OllamaProvider();

/** tryGemini / tryOllama 진입 횟수 (deterministic 경로에서는 0) */
let llmProviderInvocationCount = 0;

export function resetLlmInvocationCountForVerification(): void {
  llmProviderInvocationCount = 0;
}

export function getLlmInvocationCountForVerification(): number {
  return llmProviderInvocationCount;
}

function extractHttpStatus(e: unknown): number | null {
  if (
    e &&
    typeof e === "object" &&
    "httpStatus" in e &&
    typeof (e as GeminiHttpError).httpStatus === "number"
  ) {
    return (e as GeminiHttpError).httpStatus;
  }
  return null;
}

async function tryGemini(text: string, policy: NeoPolicy): Promise<ParsedAction | null> {
  if (!(await gemini.isAvailable())) return null;
  const gate = evaluateToolBreaker("gemini", policy);
  if (!gate.allowed) return null;
  llmProviderInvocationCount += 1;
  try {
    const r = await gemini.classifyCommand(text);
    if (r) {
      recordToolSuccess("gemini");
      return r;
    }
    recordToolFailure("gemini", policy, "schema invalid or empty response");
    return null;
  } catch (e) {
    recordToolFailure("gemini", policy, e instanceof Error ? e.message : String(e));
    throw e;
  }
}

async function tryOllama(text: string, policy: NeoPolicy): Promise<ParsedAction | null> {
  if (!(await ollama.isAvailable())) return null;
  const gate = evaluateToolBreaker("ollama", policy);
  if (!gate.allowed) return null;
  llmProviderInvocationCount += 1;
  try {
    const r = await ollama.classifyCommand(text);
    if (r) {
      recordToolSuccess("ollama");
      return r;
    }
    recordToolFailure("ollama", policy, "schema invalid or empty response");
    return null;
  } catch (e) {
    recordToolFailure("ollama", policy, e instanceof Error ? e.message : String(e));
    throw e;
  }
}

/**
 * deterministic 규칙이 맞으면 AI를 호출하지 않음.
 * unknown 만 Gemini→(fallback 정책)Ollama.
 */
export async function classifyWithAiOrFallback(text: string, policy: NeoPolicy): Promise<ParsedAction> {
  const det = parseCommand(text);
  if (det.intent !== "unknown") {
    return det;
  }

  if (mode === "ollama") {
    try {
      const o = await tryOllama(text, policy);
      if (o) return o;
    } catch {
      /* breaker / HTTP */
    }
    return det;
  }

  if (mode === "gemini") {
    try {
      const g = await tryGemini(text, policy);
      if (g) return g;
    } catch {
      return det;
    }
    return det;
  }

  try {
    const g = await tryGemini(text, policy);
    if (g) return g;
  } catch (e) {
    const st = extractHttpStatus(e);
    if (!allowOllamaFallbackAfterGemini(st)) {
      return det;
    }
  }

  try {
    const o = await tryOllama(text, policy);
    if (o) return o;
  } catch {
    /* */
  }

  return det;
}

export async function getAiRouterStatus(policy: NeoPolicy): Promise<{
  mode: AiMode;
  activeProvider: string;
  message: string;
  providerDetail: string;
  providers: AiProviderStatus[];
}> {
  const gOk = await gemini.isAvailable();
  const oOk = await ollama.isAvailable();
  const gBr = getToolBreakerSnapshot("gemini", policy);
  const oBr = getToolBreakerSnapshot("ollama", policy);

  const providers: AiProviderStatus[] = [
    {
      name: "gemini",
      available: gOk,
      detail: gOk ? "GEMINI_API_KEY 설정됨" : "GEMINI_API_KEY 없음",
      model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
    },
    {
      name: "ollama",
      available: oOk,
      detail: oOk ? `연결됨 ${process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434"}` : "Ollama 미기동",
      model: process.env.OLLAMA_MODEL || "llama3.1:8b",
    },
  ];

  let active = "deterministic";
  let message = "키워드 규칙만 사용 (AI 미호출)";
  let providerDetail = message;

  if (mode === "gemini" && gOk && gBr.state === "CLOSED") {
    active = "Gemini";
    message = `AI: Gemini (forced) · ${process.env.GEMINI_MODEL || "gemini-2.0-flash"}`;
    providerDetail = message;
  } else if (mode === "gemini" && !gOk) {
    active = "none";
    message = "AI_PROVIDER_MODE=gemini 이지만 Gemini 사용 불가 → deterministic";
    providerDetail = message;
  } else if (mode === "gemini" && gBr.state !== "CLOSED") {
    active = "none";
    message = `Gemini breaker ${gBr.state} → deterministic`;
    providerDetail = message;
  } else if (mode === "ollama" && oOk && oBr.state === "CLOSED") {
    active = "Ollama";
    message = `AI: Ollama (forced local) · ${process.env.OLLAMA_MODEL || "llama3.1:8b"}`;
    providerDetail = message;
  } else if (mode === "ollama" && !oOk) {
    active = "none";
    message = "AI_PROVIDER_MODE=ollama 이지만 Ollama 사용 불가 → fail-closed to deterministic";
    providerDetail = message;
  } else if (mode === "ollama" && oBr.state !== "CLOSED") {
    active = "none";
    message = `Ollama breaker ${oBr.state} → deterministic`;
    providerDetail = message;
  } else if (mode === "auto") {
    if (gOk && gBr.state === "CLOSED") {
      active = "Gemini";
      message = `AI: Gemini (auto) · ${process.env.GEMINI_MODEL || "gemini-2.0-flash"}`;
      providerDetail = message;
    } else if (gOk && gBr.state !== "CLOSED" && oOk && oBr.state === "CLOSED") {
      active = "Ollama";
      message = `AI: Ollama (fallback) — Gemini breaker ${gBr.state}`;
      providerDetail = message;
    } else if (!gOk && oOk && oBr.state === "CLOSED") {
      active = "Ollama";
      message = `AI: Ollama (fallback) — Gemini unavailable`;
      providerDetail = message;
    } else {
      message = "Gemini/Ollama 모두 불가 또는 breaker OPEN — deterministic";
      providerDetail = message;
    }
  }

  return { mode, activeProvider: active, message, providerDetail, providers };
}
