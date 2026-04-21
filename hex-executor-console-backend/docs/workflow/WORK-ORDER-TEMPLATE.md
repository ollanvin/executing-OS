# Work order template (Neo / Stage 1)

**헌법 참조 (필수):** [OPERATING-CONSTITUTION.md](../../../../docs/OPERATING-CONSTITUTION.md)

## 메타

- **Goal / intent:** (예: `myphonecheck_capture_package`)
- **High-level order (한 문장):** …
- **Target environment:** 기본 = **emulator / virtualized Android** (실물 단말은 UX 예외 게이트 전용)

## Preflight (COMMIT 전)

`npm run report:myphone-planner` / `execute` 공통: `runStage1MyPhoneCapturePreflight` — **emulator-first** 기준.  
실물 단말만 연결된 경우 기본 루트에서는 **차단**; 예외 시 `NEO_UX_EXCEPTION_PHYSICAL_DEVICE=1` 명시.

## 실행

- **Planner:** `buildPlannerPrompt` — 헌법: 기본 타깃은 에뮬/가상 환경.
- **승인 / COMMIT:** (UI·API 정책에 따름)

## 완료 기준

- `WorkflowTrace` / failureTag 품질
- 산출물 경로: `output/control-plane-delivery/...` (정책 허용 루트)
