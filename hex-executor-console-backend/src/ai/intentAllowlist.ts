import type { ActionCategory, ParsedAction } from "../types.js";

/** AI·deterministic 공통 허용 intent (임의 문자열 금지). */
export const ALLOWED_AI_INTENTS = new Set([
  "adb_screenshot",
  "myphonecheck_emulator",
  "myphonecheck_app_launch",
  "myphonecheck_app_ready_screenshot",
  "myphonecheck_capture_package",
  "myphonecheck_capture_bundle_run",
  "recent_logs",
  "vm_operation",
  "app_install_or_download",
  "app_launch",
  "app_launch_generic",
  "file_move",
  "system_status",
  "unknown",
]);

export const ALLOWED_AI_CATEGORIES = new Set<ActionCategory>([
  "FILE_OP",
  "APP_OP",
  "EMULATOR_OP",
  "VM_OP",
  "LOG_OP",
  "SYSTEM_OP",
]);

export type ParsedBody = Omit<ParsedAction, "id">;

export function validateAiParsedBody(p: {
  category: unknown;
  intent: unknown;
  rawText: string;
  intentLabel?: unknown;
  args?: unknown;
  requiresApproval?: unknown;
  executionSummary?: unknown;
}): ParsedBody | null {
  if (typeof p.category !== "string" || typeof p.intent !== "string") return null;
  if (!ALLOWED_AI_CATEGORIES.has(p.category as ActionCategory)) return null;
  if (!ALLOWED_AI_INTENTS.has(p.intent)) return null;
  const args =
    typeof p.args === "object" && p.args !== null && !Array.isArray(p.args)
      ? (p.args as Record<string, unknown>)
      : {};
  return {
    rawText: p.rawText,
    category: p.category as ActionCategory,
    intent: p.intent,
    intentLabel: typeof p.intentLabel === "string" ? p.intentLabel : p.intent,
    args,
    requiresApproval: Boolean(p.requiresApproval),
    executionSummary: typeof p.executionSummary === "string" ? p.executionSummary : "",
  };
}
