import type { ParsedAction } from "../types.js";

export type AiProviderName = "gemini" | "ollama";

export type AiProviderStatus = {
  name: AiProviderName;
  available: boolean;
  detail?: string;
  model?: string;
};

export interface AiProvider {
  readonly name: AiProviderName;
  isAvailable(): Promise<boolean>;
  /** JSON 구조화 분류 시도 — 실패 시 null */
  classifyCommand(text: string): Promise<ParsedAction | null>;
  summarizeExecution(text: string): Promise<string | null>;
  suggestNextCommands(context: string): Promise<string[] | null>;
}
