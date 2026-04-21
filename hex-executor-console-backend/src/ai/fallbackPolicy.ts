/**
 * 어떤 실패에서 AI/도구 fallback 이 허용되는지 명시 (운영 예측 가능성).
 *
 * A) AI provider
 * - Gemini 429 / 5xx / timeout / 네트워크 → Ollama fallback 허용 (auto 모드)
 * - Gemini 400 / 스키마 불일치 → fallback 금지 → deterministic parse 로만 수렴
 * - Ollama connection refused → mode 에 따라 Gemini 또는 parse 만
 * - AI_PROVIDER_MODE=ollama 이고 Ollama down → fail-closed (AI 없음, parse 만)
 *
 * B) Mutating execute
 * - parse 단계 provider fallback 허용 가능
 * - canonical plan hash 불일치 → fallback 없이 fail-closed (파이프라인)
 *
 * C) Tool layer (adb/emulator)
 * - breaker OPEN 시 해당 tool 계열 즉시 차단 (fallback 없음)
 */

export type GeminiFailureClass = "quota" | "unavailable" | "bad_request" | "network" | "unknown";

export function classifyGeminiHttpError(status: number): GeminiFailureClass {
  if (status === 429) return "quota";
  if (status >= 500) return "unavailable";
  if (status === 400 || status === 404) return "bad_request";
  return "unknown";
}

/** Gemini 실패 후 Ollama 로 넘겨도 되는지 */
export function allowOllamaFallbackAfterGemini(status: number | null): boolean {
  if (status == null) return true;
  const c = classifyGeminiHttpError(status);
  return c === "quota" || c === "unavailable" || c === "network" || c === "unknown";
}

/** 스키마/요청 오류면 다른 LLM 에 같은 잘못된 프롬프트를 복제하지 않음 */
export function allowAnyAiFallbackAfterGemini(status: number | null): boolean {
  if (status == null) return true;
  return classifyGeminiHttpError(status) !== "bad_request";
}
