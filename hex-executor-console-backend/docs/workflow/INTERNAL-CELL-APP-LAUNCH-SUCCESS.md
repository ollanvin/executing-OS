# Stage 1 사례: app_launch_foreground (앱 기동 + foreground)

에뮬만 띄우는 `emulator_ensure_boot`와 구분되는 **앱까지 foreground로 올리는** capability이다.  
동일한 **`runWorkflowPlan`** · **`ensure_android_device` stepId** · trace/`failureTag` 규칙을 따른다.

## 목표(goal)

- **goalId**: `app_launch_foreground` (`WORKFLOW_GOAL_APP_LAUNCH_FOREGROUND`)
- **성공 조건**: 대상 패키지가 설치되어 있고, `monkey` 기동 후 dumpsys 상 현재 foreground 패키지가 대상과 일치한다.

## State (관측)

| 단계 | State |
|------|--------|
| device | adb 온라인 `device` |
| installed | `pm path <package>` 에 `package:` 응답 |
| launched | `monkey -p … -c android.intent.category.LAUNCHER 1` 성공 (`Events injected: 1`) |
| foreground | `dumpsys window` / `activity activities` 에서 추출한 패키지 == 대상 |

## Recover path

| 실패 맥락 | 조치 |
|-----------|------|
| `launch_app` + `app_launch_failed` (재시도 전) | `ensureAndroidDeviceOnline` 재실행 후 같은 스텝 재시도 (trace에 replan ensure 주입) |
| `ensure_app_foreground` + `app_not_foreground` | `monkey` 재기동 → 대기 → foreground 재검사 |
| `app_not_installed` | **terminal** — Stage 1에서 자동 설치 없음; APK/환경 안내 |

## Artifact

- 파일 산출 없음(기기 UI 상태 변경).
- **결과**: 성공 시 요약 문자열, `workflowTrace` 전체, `nextSuggestedCommands`.

## Failure tags (`types.ts` 상수)

| failureTag | 의미 |
|------------|------|
| `app_not_installed` | `pm path` 실패 — 설치 필요 |
| `app_launch_failed` | monkey/기동 실패 |
| `app_not_foreground` | 기동 후에도 foreground 패키지 불일치 |
| `environment` | dumpsys 등 조회 실패 (adb/기기 일시 오류) |

`ensure_android_device` 실패 문구는 스크린샷·에뮬 워크플로와 동일하게 **`Neo 워크플로 중단(디바이스 확보 실패): …`** 체계를 유지한다.

## 패키지 해석

- `action.args.package` (문자열) 우선
- 없으면 환경 변수 **`NEO_MYPHONECHECK_PACKAGE`**
- 둘 다 없으면 COMMIT 전에 명시적 오류 (워크플로 미진입)

## 라우팅

- **intent**: `myphonecheck_app_launch`
- **parse**: MyPhoneCheck 계열 + (`실행` / `앱` / `launch` / `띄워` 등) → 앱 워크플로  
  동일 계열 + 에뮬 키워드 위주(앱 실행 표현 없음) → `myphonecheck_emulator`

## 코드 위치

- 런타임: `src/runtime/androidApp.ts`
- 계획: `src/workflow/appLaunchPlanner.ts`
- 실행: `src/workflow/appLaunchWorkflow.ts`
- ensure 공유: `src/workflow/ensureAndroidDeviceShared.ts`
- executor: `src/workflow/executor.ts`
- 진입: `executeAction.ts` (서킷: `adb` + `emulator`)

## 테스트 (수동)

1. `.env`에 `NEO_MYPHONECHECK_PACKAGE=<실제 패키지>` 설정.
2. 에뮬/디바이스 연결 후 자연어 **「MyPhoneCheck 앱 실행해줘」** 로 파싱 → intent `myphonecheck_app_launch`.
3. COMMIT 후 `workflowTrace.goalId === "app_launch_foreground"`, 스텝 순서가 `ensure_android_device` → `ensure_app_installed` → `launch_app` → `ensure_app_foreground` 인지 확인.
