import type { WorkflowPlan, WorkflowStep } from "../workflow/types.js";
import { planMyPhoneCheckCapturePackage } from "../workflow/myphonecheckCapturePackagePlanner.js";
import type { PlannerPlan } from "./plannerTypes.js";
import { MYPHONECHECK_CAPTURE_GOAL_ID } from "./myphonecheckCaptureCapabilities.js";

function extractJsonObject(text: string): string | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) {
    const inner = fence[1].trim();
    if (inner.startsWith("{")) return inner;
  }
  const m = text.match(/\{[\s\S]*\}/);
  return m?.[0] ?? null;
}

export function parsePlannerPlanFromLlmText(text: string): PlannerPlan | null {
  const raw = extractJsonObject(text);
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const goalId = o.goalId;
    const steps = o.steps;
    if (typeof goalId !== "string" || !Array.isArray(steps)) return null;
    const outSteps: PlannerPlan["steps"] = [];
    for (const s of steps) {
      if (!s || typeof s !== "object") return null;
      const r = s as Record<string, unknown>;
      const id = r.id;
      const name = r.name;
      const uses = r.usesCapability;
      if (typeof id !== "string" || typeof name !== "string" || typeof uses !== "string") return null;
      const params = r.params;
      if (params !== undefined && (typeof params !== "object" || params === null || Array.isArray(params)))
        return null;
      outSteps.push({
        id,
        name,
        usesCapability: uses.trim(),
        params: params as Record<string, unknown> | undefined,
      });
    }
    const notes = o.notes;
    return {
      goalId: goalId.trim(),
      steps: outSteps,
      notes: typeof notes === "string" ? notes : undefined,
    };
  } catch {
    return null;
  }
}

const STATIC_MYPHONE = planMyPhoneCheckCapturePackage();
const STEP_META = new Map(STATIC_MYPHONE.steps.map((s) => [s.id, s]));

export function validateMyPhoneCheckCapturePlannerPlan(
  plan: PlannerPlan,
  allowedCapabilityIds: ReadonlySet<string>,
): { ok: true; workflowPlan: WorkflowPlan } | { ok: false; reason: string } {
  if (plan.goalId !== MYPHONECHECK_CAPTURE_GOAL_ID) {
    return { ok: false, reason: `goalId mismatch: ${plan.goalId}` };
  }
  if (plan.steps.length === 0) {
    return { ok: false, reason: "empty steps" };
  }
  if (plan.steps.length !== STATIC_MYPHONE.steps.length) {
    return {
      ok: false,
      reason: `expected ${STATIC_MYPHONE.steps.length} steps, got ${plan.steps.length}`,
    };
  }

  const steps: WorkflowStep[] = [];
  const seen = new Set<string>();

  for (const ps of plan.steps) {
    const cap = ps.usesCapability.trim();
    if (!allowedCapabilityIds.has(cap)) {
      return { ok: false, reason: `unknown capability: ${cap}` };
    }
    if (seen.has(cap)) {
      return { ok: false, reason: `duplicate capability: ${cap}` };
    }
    seen.add(cap);
    const meta = STEP_META.get(cap);
    if (!meta) {
      return { ok: false, reason: `unmapped capability: ${cap}` };
    }
    steps.push({
      id: cap,
      description: ps.name?.trim() ? ps.name.trim() : meta.description,
      maxAttempts: meta.maxAttempts,
    });
  }

  const expectedSet = new Set(STATIC_MYPHONE.steps.map((s) => s.id));
  for (const id of expectedSet) {
    if (!seen.has(id)) {
      return { ok: false, reason: `missing capability: ${id}` };
    }
  }

  return {
    ok: true,
    workflowPlan: { goalId: STATIC_MYPHONE.goalId, steps },
  };
}

export function allowedCapabilitySet(ids: string[]): Set<string> {
  return new Set(ids);
}
