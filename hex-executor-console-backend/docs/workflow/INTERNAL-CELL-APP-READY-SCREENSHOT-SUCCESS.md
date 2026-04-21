# Stage 1 composite: app_ready_screenshot (앱 준비 → 캡처)

개별 셀 3개(에뮬 확보, 앱 launch/foreground, raw 스크린샷)를 **한 DAG로 합성**한 첫 paved path이다.

## Composition 정책 (A안 vs B안)

- **현재 구현: A안** — 단일 `runWorkflowPlan` 안에서  
  `buildAppLaunchStepHandlers({ foregroundStepTerminalSummary: false })` 와  
  `buildCaptureScreencapStepHandler` 를 **같은 trace**에 이어 붙인다.  
  하위 capability 코드를 중복하지 않고, `appLaunchStepHandlers.ts` / `screencapStepShared.ts` 경계에서 재사용한다.
- **향후 B안** — `executeAppLaunchForegroundWorkflow` 를 서브호출하고 `workflowTrace`를 중첩·병합하는 방식.  
  control plane 근처에서 trace 스키마를 확장할 때 검토한다.

## goalId

- `app_ready_screenshot` (`WORKFLOW_GOAL_APP_READY_SCREENSHOT`)

## Steps (기존 stepId 재사용)

1. `ensure_android_device`
2. `ensure_app_installed`
3. `launch_app`
4. `ensure_app_foreground` (composite에서는 **중간 스텝** — terminal `stepExecuteResult` 없음)
5. `capture_screencap`

## State / recover

- 앱 구간: [INTERNAL-CELL-APP-LAUNCH-SUCCESS.md](./INTERNAL-CELL-APP-LAUNCH-SUCCESS.md) 와 동일한 실패 태그·recover (`appLaunchRecoverBeforeRetry`).
- 캡처 구간: [INTERNAL-CELL-SCREENSHOT-SUCCESS.md](./INTERNAL-CELL-SCREENSHOT-SUCCESS.md) 의 `no_adb_device` replan (`buildScreencapNoDeviceRecover`).
- **trace**: 단일 `goalId` 아래 위 스텝들이 순서대로 쌓이며, 어느 구간에서 실패했는지 `stepId`·`failureTag`로 식별한다.

## Artifact

- 성공 시 PNG — raw 스크린샷과 동일 경로 규칙 (`outputRoot/screenshots/…`).
- 요약 문구에 `앱 준비 후 캡처` 맥락을 덧붙인다.

## 라우팅

- **intent**: `myphonecheck_app_ready_screenshot`
- **parse**: MyPhoneCheck 계열 + (온보딩|onboarding|첫 화면|앱 준비|app ready) + (캡처|스크린샷|…).
- **raw 캡처**: 키워드만 맞으면 기존 `adb_screenshot` / `capture_runtime_screenshot` 유지.

## 코드

- 플래너: `src/workflow/appReadyScreenshotPlanner.ts`
- 워크플로: `src/workflow/appReadyScreenshotWorkflow.ts`
- 앱 핸들러 빌딩 블록: `src/workflow/appLaunchStepHandlers.ts`
- 캡처 빌딩 블록: `src/workflow/screencapStepShared.ts`
- 진입: `executeAction.ts` (서킷 `adb` + `emulator`, 출력 경로 검증은 `adb_screenshot`과 동일)

## 수동 테스트

1. `NEO_MYPHONECHECK_PACKAGE` 설정.
2. 「MyPhoneCheck 온보딩 첫 화면 캡처해줘」→ intent `myphonecheck_app_ready_screenshot`.
3. COMMIT 후 `workflowTrace.goalId === "app_ready_screenshot"` 및 5스텝 순서 확인.
