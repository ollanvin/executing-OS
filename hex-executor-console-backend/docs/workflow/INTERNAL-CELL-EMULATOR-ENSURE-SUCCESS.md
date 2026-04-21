# Stage 1 사례: emulator_ensure_boot (에뮬/ADB 확보)

독립 capability — 스크린샷의 “앞단 보조”가 아니라 **같은 executor 패턴**으로 단일 goal을 끝까지 수행한다.

## 목표(goal)

- **goalId**: `emulator_ensure_boot`
- **성공 조건**: `adb devices`에 온라인 `device`가 있거나, Neo가 AVD를 기동한 뒤 `wait-for-device`까지 완료했다.

## 관측하는 state

| 구간 | 관측 |
|------|------|
| ensure | `adb devices` 온라인 행 존재 여부 |
| recover | `emulator -list-avds`, 워크스페이스 AVD 메타데이터 (`.neo-emulator.json`, env, `config.json`) |

## 계획(plan)

- 단일 스텝 **ensure_android_device** (최대 2회 시도) — 스크린샷 워크플로와 **동일 stepId·retry·terminal 규칙**.

## Recover path

- 온라인 기기 없음 → 힌트·설치 목록으로 AVD 선택 → `emulator -avd …` → `adb wait-for-device` (서킷 브레이커·정책은 `androidDevice.ts`).

## 산출 아티팩트

- 파일 산출은 없음(로컬 OS/프로세스 상태 변경).
- **결과**: `summary`에 이미 온라인인지 / 새로 기동했는지·AVD 이름.
- **trace**: `workflowTrace.goalId === "emulator_ensure_boot"`, 스텝 `ensure_android_device`의 attempt·status·detail.

## 실패 태그 / 종료

- ensure 소진 시 `Neo 워크플로 중단(디바이스 확보 실패): …` (스크린샷 워크플로의 ensure 실패와 동일 문구 체계).
- 별도 `failureTag` 상수는 두지 않음(필요 시 `no_avd` 등 확장).

## 코드 위치

- 계획: `src/workflow/emulatorEnsurePlanner.ts`
- 실행: `src/workflow/emulatorEnsureWorkflow.ts` → `runWorkflowPlan`
- ensure 스텝 구현 공유: `src/workflow/ensureAndroidDeviceShared.ts` (`runEnsureAndroidDeviceStepCore`, 에뮬 전용 요약은 `runEmulatorEnsureBootOnlyStepHandler`)
- 런타임: `src/runtime/androidDevice.ts`, `src/runtime/avdResolver.ts`
- 진입: `executeAction.ts` — intent `myphonecheck_emulator` COMMIT (서킷: `emulator`)

## 성공 기준 (문서)

- “MyPhoneCheck 에뮬레이터 돌려줘”류 오더가 **direct `ensureAndroidDeviceOnline` 전용 분기 없이** 위 워크플로로 실행된다.
- 스크린샷의 ensure와 **같은 코어 + 같은 executor 의미**를 공유한다.
