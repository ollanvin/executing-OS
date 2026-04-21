/**
 * 고정 고수준 오더에 대한 intent / goal / planner 해상도만 검증 (preflight 없음).
 * 전체 리포트는 npm run report:myphone-planner — preflight 통과 시에만 플래너 필드 포함.
 */
import { classifyWithAiOrFallback } from "../ai/router.js";
import { finalizeAction } from "../enrichAction.js";
import { normalizeParsedAction } from "../normalizeParsedAction.js";
import { resolveMyPhoneCheckCaptureWorkflowPlan } from "../planner/plannerProvider.js";
import { isLlmPlannerEnabled } from "../planner/plannerConfig.js";
import { loadNeoPolicy } from "../policy.js";
import { planMyPhoneCheckCapturePackage } from "../workflow/myphonecheckCapturePackagePlanner.js";
import { getDefaultWorkspaceRoot } from "../workspaceRoot.js";
import { smokeConstitutionStep0 } from "./smokeConstitutionBootstrap.js";

const USER_GOAL =
  "마이폰첵을 에뮬레이터로 온보드 화면 및 모듈 앱 화면을 사진 찍어서 컨트롤플레인에게 전달할 파일로 만들어줘";

await smokeConstitutionStep0("plannerPathProbe");

const ws = getDefaultWorkspaceRoot();
const policy = await loadNeoPolicy(ws);
const draft = await classifyWithAiOrFallback(USER_GOAL, policy);
const norm = normalizeParsedAction(USER_GOAL, draft);
const action = await finalizeAction(norm, ws);
const staticPlan = planMyPhoneCheckCapturePackage();
const resolved = await resolveMyPhoneCheckCaptureWorkflowPlan({
  userGoalText: USER_GOAL,
  policy,
  logs: [],
  llmEnabled: isLlmPlannerEnabled(),
});

process.stdout.write(
  JSON.stringify(
    {
      userGoalText: USER_GOAL,
      intent: action.intent,
      goalId: staticPlan.goalId,
      planSource: resolved.planSource,
      llmPlanRejectedReason: resolved.rejectReason ?? null,
      finalSteps: resolved.workflowPlan.steps.map((s) => s.id),
      goldenPathSteps: staticPlan.steps.map((s) => s.id),
      matchesGoldenSequence:
        resolved.workflowPlan.steps.length === staticPlan.steps.length &&
        resolved.workflowPlan.steps.every((s, i) => s.id === staticPlan.steps[i]!.id),
    },
    null,
    2,
  ) + "\n",
);
