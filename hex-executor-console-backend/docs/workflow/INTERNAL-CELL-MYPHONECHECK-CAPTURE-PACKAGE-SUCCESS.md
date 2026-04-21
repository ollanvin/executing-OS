# Stage 1 golden path: myphonecheck_capture_package

**헌법:** [OPERATING-CONSTITUTION.md](../../../../docs/OPERATING-CONSTITUTION.md) — 기본 타깃은 **에뮬/가상 Android**; 실물 단말은 **UX 예외**만.

**고수준 오더 한 문장**을 내부 셀 DAG로 분해하고, **컨트롤플레인이 소비할 패키지**(manifest + PNG + 선택 zip)까지 만드는 실전 검증 경로다.

## 대표 오더 (파싱 예)

> 마이폰첵을 에뮬레이터로 온보드 화면 및 모듈 앱 화면을 사진 찍어서 컨트롤플레인에게 전달할 파일로 만들어줘.

- **intent**: `myphonecheck_capture_package`
- **goalId**: `myphonecheck_capture_package` (상수 `WORKFLOW_GOAL_MYPHONECHECK_CAPTURE_PACKAGE`)

## DAG (플래너 분해)

| 순서 | stepId | 재사용 |
|------|--------|--------|
| 1 | `ensure_android_device` | `ensureAndroidDeviceShared` + app launch 블록 |
| 2 | `ensure_app_installed` | `appLaunchStepHandlers` |
| 3 | `launch_app` | 동일 |
| 4 | `ensure_app_foreground` | 동일 (composite용, terminal 요약 없음) |
| 5 | `capture_onboarding_sequence` | MyPhoneCheck 전용 — `.neo-myphonecheck-capture.json` |
| 6 | `navigate_to_module_screens` | MyPhoneCheck 전용 — 키 시퀀스 |
| 7 | `capture_module_sequence` | MyPhoneCheck 전용 |
| 8 | `build_control_plane_bundle` | `manifest.json` + Windows 시 `zip` |

구현은 **긴 단일 함수가 아니라** `myphonecheckCapturePackagePlanner.ts` + `myphonecheckCapturePackageWorkflow.ts` + 기존 `appLaunchStepHandlers` + `androidApp`/`myphonecheckCaptureConfig` 조합이다.

## 산출물 (번들 구조)

```
{outputRoot}/control-plane-delivery/myphonecheck-{timestamp}/
  captures/onboarding/001_*.png
  captures/module/00N_*.png
  manifest.json
myphonecheck-{timestamp}.zip   ← Windows 에서만 시도 (실패 시 manifest·폴더만)
```

### manifest.json (요지)

- `schemaVersion`, `goalId`, `appId`, `packageName`, `environment: "emulator"`
- `captureScope`: `["onboarding","module"]`
- `captures[]`: `relativePath`, `kind`, `label`, `order` (실패 시 trace의 stepId·failureTag로 어느 화면에서 막혔는지 추적)

## 설정 파일

- 워크스페이스 루트: **`.neo-myphonecheck-capture.json`**
- 예시: [neo-myphonecheck-capture.example.json](./neo-myphonecheck-capture.example.json)
- 없으면 코드 내 **기본 시퀀스**로 동작 (실전 앱 UI에 맞게 반드시 조정)

## failureTag

| 태그 | 의미 |
|------|------|
| `onboarding_capture_failed` | 온보딩 시퀀스 중 screencap/키 입력 실패 (`detail`에 label) |
| `module_navigation_failed` | 모듈 이동 키 시퀀스 실패 |
| `module_capture_failed` | 모듈 캡처 실패 |
| `bundle_build_failed` | manifest/zip 실패 |
| (기존) | `app_not_installed`, `app_launch_failed`, `app_not_foreground` 등 1~4단계 |

## 코드 위치

- 플래너: `src/workflow/myphonecheckCapturePackagePlanner.ts`
- 워크플로: `src/workflow/myphonecheckCapturePackageWorkflow.ts`
- 컨텍스트: `src/workflow/myphonecheckPackageContext.ts`
- 설정: `src/runtime/myphonecheckCaptureConfig.ts`
- adb: `adbScreencapPngToFile`, `adbShellInputKeyEvents` — `src/runtime/androidApp.ts`
- 진입: `executeAction.ts` (서킷 `adb` + `emulator`, `control-plane-delivery` 정책 경로 검증)

## 실전 검증 절차

1. **Preflight:** `runStage1MyPhoneCapturePreflight` — emulator-first(실물 단말은 `NEO_UX_EXCEPTION_PHYSICAL_DEVICE=1` UX 예외만). `GEMINI_API_KEY`, `.env`, 에뮬 가용·부팅, 패키지 설치·프로세스·screencap, `control-plane-delivery` 쓰기.
2. `NEO_MYPHONECHECK_PACKAGE` 및 (권장) `.neo-myphonecheck-capture.json` 설정.
3. **에뮬**에서 앱 UI 흐름에 맞게 `keyEventsAfter` / `moduleNavigation` 조정(기본 검증 루트).
4. 위 대표 오더로 파싱 → 승인 후 COMMIT.
5. `workflowTrace.goalId` 및 `captures`·`manifest.json` 존재 확인.

## Stage 2와의 경계

- 여기서는 **컨트롤플레인에 “파일을 넘긴다”** 까지가 범위이며, 원격 업로드·큐·정책 엔진은 하지 않는다.
