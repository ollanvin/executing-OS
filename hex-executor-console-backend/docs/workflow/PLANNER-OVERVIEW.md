# LLM Planner API (1차)

**헌법:** [OPERATING-CONSTITUTION.md](../../../../docs/OPERATING-CONSTITUTION.md) — planner 프롬프트는 emulator-first·G20→α 순서를 반영한다.

고수준 오더를 **JSON 플랜(`PlannerPlan`)**으로 만든 뒤, 검증·정적 플랜과 비교하고, 통과하면 그 순서로 `runWorkflowPlan`이 실행한다. **이번 스프린트에서는 `myphonecheck_capture_package` 목표만** LLM 플래닝 대상이며, 나머지 Stage 1 goal은 기존 정적 `*Planner.ts` DAG를 그대로 쓴다.

## 모듈

| 파일 | 역할 |
|------|------|
| `src/planner/plannerTypes.ts` | `PlannerInput`, `PlannerStep`, `PlannerPlan` |
| `src/planner/plannerConfig.ts` | `PLANNER_MODEL_KIND`, 모델명, 플래너 on/off, dev 로그 |
| `src/planner/plannerPrompt.ts` | 프롬프트 조립 (capabilities + few-shot) |
| `src/planner/plannerInvoke.ts` | Gemini / Ollama / (Claude 미연동) 호출 + circuit breaker |
| `src/planner/plannerProvider.ts` | MyPhoneCheck capture 전용 `resolveMyPhoneCheckCaptureWorkflowPlan` |
| `src/planner/planValidator.ts` | JSON 파싱, capability 화이트리스트, `WorkflowPlan` 매핑 |
| `src/planner/planDiff.ts` | 정적 8단계와 순서 비교 → LLM 채택 vs fallback |

## 환경 변수

| 변수 | 설명 |
|------|------|
| `NEO_LLM_PLANNER_ENABLED` | `0`이면 LLM 호출 없이 항상 정적 플랜 (`planSource: static`). 기본 `1`. |
| `PLANNER_MODEL_KIND` | `gemini` \| `ollama` \| `claude` (claude는 현재 스텁). 기본 `gemini`. |
| `PLANNER_MODEL_NAME` | 플래너 전용 모델명. Gemini면 `GEMINI_MODEL` 대신 우선, Ollama면 `OLLAMA_MODEL` 대신 우선. |
| `NEO_PLANNER_DEV_LOG` | `1`이면 프롬프트 길이·응답 일부를 실행 로그에 남김 (민감 문구 주의). |

Gemini/Ollama 본연의 `GEMINI_API_KEY`, `OLLAMA_BASE_URL` 등은 기존과 동일.

## Trace: `planSource`

`ExecuteResult.workflowTrace` (`src/workflow/types.ts`)에 메타가 붙는다.

- `static` — LLM 미사용 또는 사용자 문장 없음.
- `llm` — LLM JSON이 검증·diff까지 통과해 LLM이 만든 순서로 실행.
- `llm+fallback` — 파싱/검증 실패, 모델 오류, 또는 정적 플랜과 **순서가 과도하게 다름** → 정적 8단계로 실행.

추가 필드: `plannerModelKind`, `plannerModelName`, `plannerNotes`, `llmPlanRejectedReason`.

## Fallback 규칙 (diff)

정적 `planMyPhoneCheckCapturePackage()`와 스텝 id 시퀀스를 비교한다.

- 완전 일치 → LLM 플랜 채택.
- Levenshtein 편집 거리 ≤ 2 **그리고** 첫·마지막 스텝이 정적과 동일 → 채택.
- 그 외 → `llm+fallback` + 정적 플랜.

## 참고

- Few-shot 예시 JSON: [PLANNER-EXAMPLE-MYPHONECHECK-CAPTURE.md](./PLANNER-EXAMPLE-MYPHONECHECK-CAPTURE.md)
- Trace 샘플: [PLANNER-MYPHONECHECK-TRACE-EXAMPLE.md](./PLANNER-MYPHONECHECK-TRACE-EXAMPLE.md)
