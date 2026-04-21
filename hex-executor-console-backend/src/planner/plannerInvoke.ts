import type { NeoPolicy } from "../policy.js";
import { geminiGeneratePlannerText } from "../ai/geminiProvider.js";
import type { GeminiHttpError } from "../ai/geminiProvider.js";
import { ollamaGeneratePlannerText } from "../ai/ollamaProvider.js";
import { evaluateToolBreaker, recordToolFailure, recordToolSuccess } from "../toolCircuitBreaker.js";
import { getPlannerModelKind } from "./plannerConfig.js";
import { GeminiProvider } from "../ai/geminiProvider.js";
import { OllamaProvider } from "../ai/ollamaProvider.js";

const geminiProbe = new GeminiProvider();
const ollamaProbe = new OllamaProvider();

export async function invokePlannerModel(
  prompt: string,
  policy: NeoPolicy,
  logs: string[],
): Promise<{ text: string | null; kind: string; detail?: string }> {
  const kind = getPlannerModelKind();

  if (kind === "claude") {
    logs.push("[planner] claude planner not wired in this build — skip");
    return { text: null, kind: "claude", detail: "not_implemented" };
  }

  if (kind === "ollama") {
    if (!(await ollamaProbe.isAvailable())) {
      logs.push("[planner] ollama unavailable");
      return { text: null, kind: "ollama", detail: "unavailable" };
    }
    const gate = evaluateToolBreaker("ollama", policy);
    if (!gate.allowed) {
      logs.push(`[planner] ollama breaker: ${gate.reason ?? "blocked"}`);
      return { text: null, kind: "ollama", detail: "breaker" };
    }
    const out = await ollamaGeneratePlannerText(prompt);
    if (out) {
      recordToolSuccess("ollama");
      return { text: out, kind: "ollama" };
    }
    recordToolFailure("ollama", policy, "planner empty response");
    return { text: null, kind: "ollama", detail: "empty" };
  }

  if (!(await geminiProbe.isAvailable())) {
    logs.push("[planner] gemini unavailable (no API key)");
    return { text: null, kind: "gemini", detail: "unavailable" };
  }
  const gate = evaluateToolBreaker("gemini", policy);
  if (!gate.allowed) {
    logs.push(`[planner] gemini breaker: ${gate.reason ?? "blocked"}`);
    return { text: null, kind: "gemini", detail: "breaker" };
  }
  try {
    const out = await geminiGeneratePlannerText(prompt);
    if (out) {
      recordToolSuccess("gemini");
      return { text: out, kind: "gemini" };
    }
    recordToolFailure("gemini", policy, "planner empty response");
    return { text: null, kind: "gemini", detail: "empty" };
  } catch (e) {
    const http = e && typeof e === "object" && "httpStatus" in e ? (e as GeminiHttpError).httpStatus : null;
    recordToolFailure("gemini", policy, e instanceof Error ? e.message : String(e));
    logs.push(`[planner] gemini error${http != null ? ` http=${http}` : ""}`);
    return { text: null, kind: "gemini", detail: e instanceof Error ? e.message : String(e) };
  }
}
