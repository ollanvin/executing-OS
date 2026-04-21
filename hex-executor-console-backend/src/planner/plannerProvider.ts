import type { NeoPolicy } from "../policy.js";
import { planMyPhoneCheckCapturePackage } from "../workflow/myphonecheckCapturePackagePlanner.js";
import type { WorkflowPlan, WorkflowPlanSource } from "../workflow/types.js";
import {
  buildMyPhoneCheckCapturePlannerInput,
  MYPHONECHECK_CAPTURE_CAPABILITIES,
} from "./myphonecheckCaptureCapabilities.js";
import {
  getPlannerModelKind,
  getPlannerModelNameForTrace,
  isPlannerDevLogEnabled,
} from "./plannerConfig.js";
import { buildPlannerPrompt } from "./plannerPrompt.js";
import { invokePlannerModel } from "./plannerInvoke.js";
import {
  allowedCapabilitySet,
  parsePlannerPlanFromLlmText,
  validateMyPhoneCheckCapturePlannerPlan,
} from "./planValidator.js";
import { shouldAdoptLlmPlanVersusStatic } from "./planDiff.js";
import type { PlannerPlan } from "./plannerTypes.js";

const allowedMyPhone = allowedCapabilitySet(MYPHONECHECK_CAPTURE_CAPABILITIES.map((c) => c.id));

export type MyPhonePlannerResolution = {
  workflowPlan: WorkflowPlan;
  plannerPlan?: PlannerPlan;
  rawLlmText?: string;
  planSource: WorkflowPlanSource;
  rejectReason?: string;
};

/**
 * MyPhoneCheck capture package 전용: LLM 플랜 시도 → 검증·diff → 실패 시 정적 플랜.
 */
export async function resolveMyPhoneCheckCaptureWorkflowPlan(opts: {
  userGoalText: string | undefined;
  policy: NeoPolicy;
  logs: string[];
  llmEnabled: boolean;
}): Promise<MyPhonePlannerResolution> {
  const staticPlan = planMyPhoneCheckCapturePackage();

  if (!opts.llmEnabled || !opts.userGoalText?.trim()) {
    return { workflowPlan: staticPlan, planSource: "static" };
  }

  const input = buildMyPhoneCheckCapturePlannerInput(opts.userGoalText.trim());
  const prompt = buildPlannerPrompt(input);

  if (isPlannerDevLogEnabled()) {
    opts.logs.push(`[planner:dev] prompt chars=${prompt.length}`);
  }

  const inv = await invokePlannerModel(prompt, opts.policy, opts.logs);

  if (isPlannerDevLogEnabled() && inv.text) {
    opts.logs.push(`[planner:dev] response chars=${inv.text.length} preview=${JSON.stringify(inv.text.slice(0, 400))}`);
  }

  if (!inv.text) {
    return {
      workflowPlan: staticPlan,
      planSource: "llm+fallback",
      rejectReason: inv.detail ?? "no_llm_response",
    };
  }

  const parsed = parsePlannerPlanFromLlmText(inv.text);
  if (!parsed) {
    opts.logs.push("[planner] failed to parse PlannerPlan JSON");
    return {
      workflowPlan: staticPlan,
      rawLlmText: inv.text,
      planSource: "llm+fallback",
      rejectReason: "parse_failed",
    };
  }

  const validated = validateMyPhoneCheckCapturePlannerPlan(parsed, allowedMyPhone);
  if (!validated.ok) {
    opts.logs.push(`[planner] validate rejected: ${validated.reason}`);
    return {
      workflowPlan: staticPlan,
      plannerPlan: parsed,
      rawLlmText: inv.text,
      planSource: "llm+fallback",
      rejectReason: validated.reason,
    };
  }

  const diff = shouldAdoptLlmPlanVersusStatic(validated.workflowPlan, staticPlan);
  if (!diff.adopt) {
    opts.logs.push(`[planner] diff fallback: ${diff.reason}`);
    return {
      workflowPlan: staticPlan,
      plannerPlan: parsed,
      rawLlmText: inv.text,
      planSource: "llm+fallback",
      rejectReason: diff.reason,
    };
  }

  return {
    workflowPlan: validated.workflowPlan,
    plannerPlan: parsed,
    rawLlmText: inv.text,
    planSource: "llm",
  };
}

export function describePlannerModelForTrace(): { kind: string; name?: string } {
  return {
    kind: getPlannerModelKind(),
    name: getPlannerModelNameForTrace(),
  };
}
