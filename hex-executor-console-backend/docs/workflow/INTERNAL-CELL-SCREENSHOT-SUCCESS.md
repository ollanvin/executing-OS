# Stage 1 사례: 런타임 스크린샷 recoverable workflow

Neo를 **앱 팩토리 전체**가 아니라 **내부 워크스테이션 자동화의 첫 생산 셀**로 쓸 때의 첫 end-to-end 성공 사례다.  
목표는 “친절한 에러”가 아니라 **감지 후 복구(detect-and-recover)** 로 PNG 아티팩트까지 도달하는 것이다.

## 목표(goal)

- **goalId**: `capture_runtime_screenshot`
- **성공 조건**: 정책이 허용하는 경로에 PNG가 저장되고, 결과에 아티팩트 메타가 실린다.

## 관측하는 state

| 구간 | 관측 |
|------|------|
| ensure | `adb devices`에 `device` 상태 행이 있는지 |
| ensure (복구) | `emulator -list-avds` 설치 목록, 워크스페이스 메타데이터의 AVD 힌트 |
| capture | `adb exec-out screencap -p` 성공 여부, stderr/메시지에 “기기 없음” 류 패턴 |

메타데이터 출처(힌트): `.neo-emulator.json`, `NEO_MYPHONECHECK_AVD`, `projects/*/config.json`의 `neo_operator.emulator.preferred_avds` (자세한 우선순위는 `avdResolver.ts`).

## 계획(plan) DAG

1. **ensure_android_device** (최대 2회)
2. **capture_screencap** (최대 2회 — no-device 재시도용)

## Recover / replan 단계

1. **온라인 기기 없음** → 메타데이터·설치 목록으로 AVD 선택 → `emulator -avd …` 기동 → `adb wait-for-device`까지 대기 (circuit breaker 연동).
2. **캡처가 no-device 성격으로 실패** → 로그에 replan 메시지 → **ensure를 한 번 더** 수행 → 같은 스텝에서 screencap 재시도.

비-no-device 오류(정책, 크기 초과 등)는 **즉시 종료**(terminal); 불필요한 재시도를 하지 않는다.

## 산출 아티팩트

- **파일**: `{outputRoot}/screenshots/capture-{timestamp}.png`
- **결과 필드**: `artifacts[]`에 `PNG` 라벨, 절대 경로, URL 경로
- **추적**: `workflowTrace` — `goalId`, 각 스텝의 `attempt`, `status`, `detail`, 선택적 `failureTag`

## 실패 시나리오와 태그

| 종료 형태 | 요약 | trace / 태그 |
|-----------|------|----------------|
| ensure 소진 | 디바이스 확보 불가 | `ensure_android_device` failed, 상세 reason |
| 캡처 전 replan ensure 실패 | 재확보 실패 | `capture_screencap` failed 후 별도 요약 |
| 캡처 실패 (no-device, 시도 소진) | 스크린캡 오류 요약 | `failureTag` 예: `no_adb_device` |
| 캡처 실패 (정책/크기/기타) | 해당 ExecuteResult | terminal, 태그 없을 수 있음 |

## 코드 위치

- 계획: `src/workflow/screenshotPlanner.ts`
- 핸들러 조립 + recover 연결: `src/workflow/screenshotWorkflow.ts`
- `capture_screencap` 스텝 구현·no-device recover: `src/workflow/screencapStepShared.ts` (composite에서도 재사용)
- ensure 스텝 코어: `src/workflow/ensureAndroidDeviceShared.ts`
- 공통 실행기: `src/workflow/executor.ts` (`runWorkflowPlan`)
- 기기 복구: `src/runtime/androidDevice.ts`, `src/runtime/avdResolver.ts`
- 진입: `executeAction.ts` — `adb_screenshot` COMMIT

이 문서는 **Stage 1** 범위만 다룬다. 상위 오케스트레이션·외부 자산은 로드맵의 Stage 2–3에서 다룬다.
