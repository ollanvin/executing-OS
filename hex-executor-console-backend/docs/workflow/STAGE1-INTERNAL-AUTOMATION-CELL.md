# Stage 1: Internal Automation Cell (현재 스프린트 범위)

## 비전과의 관계

**운영 헌법 (필수 참조):** [OPERATING-CONSTITUTION.md](../../../../docs/OPERATING-CONSTITUTION.md) — **emulator / 가상화 / 시뮬레이션 우선**, 실물 단말은 **UX 예외 게이트** 전용.

**최종 비전**은 앱을 반복 생산하는 앱 팩토리 운영 시스템(외부/내부/레버리지, control plane, code worker, 마켓·SaaS 연동)이다.

**지금 단계(Stage 1)** 는 그 아래층 **내부 워크스테이션 자동화 셀**만 단단히 만든다.  
Neo는 이 단계에서 “모든 것을 하는 팩토리”가 아니라, **로컬에서 목표까지 recoverable workflow를 끝내는 실행 셀**이다. 기본 검증·golden path는 **실기기 없이 재현 가능한 에뮬/가상 셀**을 1차 기준으로 한다.

## Stage 1에서 쌓는 것

- 작은 워크플로를 **end-to-end**로 완성해 **누적**한다.
- 각 워크플로는 같은 **executor**(`runWorkflowPlan`)와 동일한 **관측·trace·failureTag** 패턴을 쓴다.
- 나중에 Stage 2(control plane)가 이 셀들을 **capability**로 호출할 수 있게 한다.

## 누적된 capability (작은 성공)

| capability | goalId | 문서 |
|------------|--------|------|
| 런타임 스크린샷 | `capture_runtime_screenshot` | [INTERNAL-CELL-SCREENSHOT-SUCCESS.md](./INTERNAL-CELL-SCREENSHOT-SUCCESS.md) |
| 에뮬/ADB 확보 | `emulator_ensure_boot` | [INTERNAL-CELL-EMULATOR-ENSURE-SUCCESS.md](./INTERNAL-CELL-EMULATOR-ENSURE-SUCCESS.md) |
| 앱 기동·foreground | `app_launch_foreground` | [INTERNAL-CELL-APP-LAUNCH-SUCCESS.md](./INTERNAL-CELL-APP-LAUNCH-SUCCESS.md) |

공통: `runWorkflowPlan`, ensure 스텝은 `ensureAndroidDeviceShared.ts`에서 공유. 앱 셀은 `src/runtime/androidApp.ts`에서 adb 조작을 캡슐화한다.

## Composite paved path (셀 조합)

| 합성 목표 | goalId | 빌딩 블록 | 문서 |
|-----------|--------|-----------|------|
| 앱 준비 후 캡처 | `app_ready_screenshot` | app launch 스텝들 + `capture_screencap` | [INTERNAL-CELL-APP-READY-SCREENSHOT-SUCCESS.md](./INTERNAL-CELL-APP-READY-SCREENSHOT-SUCCESS.md) |

개별 capability 3개는 그대로 유지되며, composite는 **같은 stepId·failureTag**로 단일 trace에 기록된다 (A안: 한 번의 `runWorkflowPlan`).

### 실전 golden path 검증 (Stage 1 종료 기준에 가깝게)

- **한 문장 고수준 오더** → 파싱 → **end-to-end** 실행 → **컨트롤플레인 전달용 파일**(manifest + 캡처 + 선택 zip).
- 대표: `myphonecheck_capture_package` — [INTERNAL-CELL-MYPHONECHECK-CAPTURE-PACKAGE-SUCCESS.md](./INTERNAL-CELL-MYPHONECHECK-CAPTURE-PACKAGE-SUCCESS.md)
- Stage 1의 완성도는 “primitive 개수”가 아니라 **이 경로가 에뮬/가상 타깃·앱에서 통과하는지**로 본다(실물 단말 검증은 UX 예외).

## 다음 확장 후보 (권장 순서)

1. **Recent log collect + summarize** — 기존 로그 아티팩트 + 요약 스텝.
2. **File move / copy / archive** — 정책 검증과 결합된 파일 공정.
3. **Basic pipeline run + result capture** — 로컬 스크립트/빌드 한 사이클 + 로그·산출물 고정.

## Stage 2 / 3 (지금 구현 범위 아님)

- **Stage 2**: 전략, desired state, 스케줄링, 멀티 워커, 라우팅.
- **Stage 3**: Play Console, 외부 API, 배포 자산 등 **외부 자산** 연동.

현재 코드 리뷰·리팩터 판단은 **항상 Stage 1 기준**으로 한다.

## 문서 맵

| 문서 | 내용 |
|------|------|
| [OPERATING-CONSTITUTION.md](../../../../docs/OPERATING-CONSTITUTION.md) | 운영 헌법 (emulator-first, G20→α, UX 예외) |
| [WORK-ORDER-TEMPLATE.md](./WORK-ORDER-TEMPLATE.md) | 워크 오더 템플릿 |
| 이 파일 | Stage 1 범위 고정 |
| [INTERNAL-CELL-SCREENSHOT-SUCCESS.md](./INTERNAL-CELL-SCREENSHOT-SUCCESS.md) | 스크린샷 생산 셀 |
| [INTERNAL-CELL-EMULATOR-ENSURE-SUCCESS.md](./INTERNAL-CELL-EMULATOR-ENSURE-SUCCESS.md) | 에뮬 확보 생산 셀 |
| [INTERNAL-CELL-APP-LAUNCH-SUCCESS.md](./INTERNAL-CELL-APP-LAUNCH-SUCCESS.md) | 앱 기동·foreground 셀 |
| [INTERNAL-CELL-APP-READY-SCREENSHOT-SUCCESS.md](./INTERNAL-CELL-APP-READY-SCREENSHOT-SUCCESS.md) | 앱 준비 → 캡처 composite |
| [INTERNAL-CELL-MYPHONECHECK-CAPTURE-PACKAGE-SUCCESS.md](./INTERNAL-CELL-MYPHONECHECK-CAPTURE-PACKAGE-SUCCESS.md) | 컨트롤플레인 패키지 golden path |
| [NEO-PLANNER-EXECUTOR-ROADMAP.md](./NEO-PLANNER-EXECUTOR-ROADMAP.md) | 완료/다음 작업 + 장기 비전 |
