import { MYPHONECHECK_CAPTURE_EXAMPLE_PLAN_JSON } from "./myphonecheckExamplePlanJson.js";
import type { PlannerInput } from "./plannerTypes.js";

export function buildPlannerPrompt(input: PlannerInput): string {
  const capLines = input.capabilities
    .map((c) => `- ${c.id}: ${c.description}`)
    .join("\n");
  const goalHint = input.normalizedGoalId ?? "(infer from user text)";
  return `You are a workflow planner for a local Android operator ("Neo"). The user gave a high-level order in natural language.

Operating constitution (must respect): default execution and validation targets are **emulator / virtualized Android / local simulation** — not physical handsets as the default. Physical devices are only a **case-by-case UX exception** path, not the standard route. Country expansion ordering: **G20 first**, then **alphabetical** for the rest. See repository docs/OPERATING-CONSTITUTION.md.

Your job: output ONE JSON object only (no markdown fences, no commentary) that lists ordered steps using ONLY the capabilities below.

Schema:
{
  "goalId": string,
  "notes"?: string,
  "steps": [
    {
      "id": string (short id like s1, s2),
      "name": string (human-readable),
      "usesCapability": string (must be exactly one of the capability ids listed),
      "params"?: object
    }
  ]
}

Rules:
- Every usesCapability MUST be copied exactly from the allowed list (snake_case ids).
- Include all capabilities needed for the goal, in a sensible order. For goal "${goalHint}", typically follow the reference example order unless the user text clearly requires otherwise.
- Do not invent capability ids. Do not add extra steps outside the allowed list.
- params may be {} for each step unless you have structured hints (optional).

Allowed capabilities:
${capLines}

User order (verbatim):
${JSON.stringify(input.userGoalText)}

Reference example (same goal, human-written plan — match this shape and id vocabulary for similar goals):
${MYPHONECHECK_CAPTURE_EXAMPLE_PLAN_JSON}
`;
}
