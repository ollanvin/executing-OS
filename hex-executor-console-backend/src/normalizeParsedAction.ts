import { parseCommand } from "./parseCommand.js";
import type { ParsedAction } from "./types.js";

/** finalize 이전에도 동일 집합 유지 (enrichAction mutationMeta 와 맞출 것). */
const MUTATING_INTENTS = new Set<string>([
  "file_move",
  "adb_screenshot",
  "myphonecheck_emulator",
  "myphonecheck_app_launch",
  "myphonecheck_app_ready_screenshot",
  "myphonecheck_capture_package",
  "myphonecheck_capture_bundle_run",
  "vm_operation",
  "app_install_or_download",
  "app_launch",
  "app_launch_generic",
]);

/**
 * AI 분류 후 결정론 레이어: 키워드·정규식이 맞으면 항상 그 결과를 채택하고,
 * 규칙으로 mutating을 입증할 수 없으면 mutating 승격을 막는다.
 */
export function normalizeParsedAction(rawText: string, draft: ParsedAction): ParsedAction {
  const det = parseCommand(rawText);
  const text = rawText.trim();

  if (det.intent !== "unknown") {
    return {
      ...draft,
      id: draft.id,
      rawText: text,
      category: det.category,
      intent: det.intent,
      intentLabel: det.intentLabel,
      args: { ...det.args },
      requiresApproval: det.requiresApproval,
      executionSummary: det.executionSummary,
    };
  }

  if (MUTATING_INTENTS.has(draft.intent)) {
    return {
      ...draft,
      id: draft.id,
      rawText: text,
      category: "SYSTEM_OP",
      intent: "unknown",
      intentLabel: "미분류",
      args: {
        hint: "mutating 작업은 Neo 규칙(키워드·경로 패턴 등)으로 확인될 때만 허용됩니다. 명령을 더 구체적으로 입력하세요.",
      },
      requiresApproval: false,
      executionSummary: "규칙 검증을 통과하지 못했습니다.",
    };
  }

  return {
    ...draft,
    id: draft.id,
    rawText: text,
  };
}
