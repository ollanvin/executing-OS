# Neo Planner / Executor 로드맵



## 현재 스프린트 범위 (Stage 1)



**지금 구현·리팩터의 기준축은 “Internal Automation Cell”이다.**  

앱 팩토리 전체를 한 번에 앞당기지 않는다. 범위 고정은 [STAGE1-INTERNAL-AUTOMATION-CELL.md](./STAGE1-INTERNAL-AUTOMATION-CELL.md)를 본문으로 삼는다.



---



## 상태 요약 (이 문서에서만 “완료 / 진행 / 다음” 구분)



### 완료 (Stage 1, executor paved path)



- 공통 **`runWorkflowPlan`** (`src/workflow/executor.ts`) — trace, `failureTag`, retry, `terminal`, `recoverBeforeRetry`.

- **`capture_runtime_screenshot`** — planner + 핸들러 + recover; 사례: [INTERNAL-CELL-SCREENSHOT-SUCCESS.md](./INTERNAL-CELL-SCREENSHOT-SUCCESS.md).

- **`emulator_ensure_boot`** — 독립 planner/workflow; intent `myphonecheck_emulator` 정렬; ensure 코어 공유; 사례: [INTERNAL-CELL-EMULATOR-ENSURE-SUCCESS.md](./INTERNAL-CELL-EMULATOR-ENSURE-SUCCESS.md).

- **`app_launch_foreground`** — device → 설치 확인 → monkey 기동 → foreground 검증; intent `myphonecheck_app_launch`; 사례: [INTERNAL-CELL-APP-LAUNCH-SUCCESS.md](./INTERNAL-CELL-APP-LAUNCH-SUCCESS.md).

- **`app_ready_screenshot` (composite)** — 위 3 capability의 스텝을 **플래너 합성**; `appLaunchStepHandlers` + `screencapStepShared` 재사용(A안); intent `myphonecheck_app_ready_screenshot`; 사례: [INTERNAL-CELL-APP-READY-SCREENSHOT-SUCCESS.md](./INTERNAL-CELL-APP-READY-SCREENSHOT-SUCCESS.md).

- **`myphonecheck_capture_package` (golden path)** — 고수준 오더 → 8스텝 DAG → manifest + PNG + (zip); intent `myphonecheck_capture_package`; 사례: [INTERNAL-CELL-MYPHONECHECK-CAPTURE-PACKAGE-SUCCESS.md](./INTERNAL-CELL-MYPHONECHECK-CAPTURE-PACKAGE-SUCCESS.md).

- **`ensure_android_device` 스텝 공유** — `ensureAndroidDeviceShared.ts`.

**단계 전환**: “개별 셀 추가”에 더해 **셀 조합(composition)** 으로 internal paved path를 두껍게 만드는 중이다. B안(서브워크플로·trace 중첩)은 Stage 2 전후 검토.

**Stage 1의 끝을 무엇으로 볼 것인가**: primitive 셀을 많이 모은 것이 아니라, **고수준 오더 하나를 내부 셀 조합으로 end-to-end 완수**하고 **컨트롤플레인·운영 측이 다음 단계에서 쓸 산출물**까지 만드는 것. 대표 구현: `myphonecheck_capture_package` ([INTERNAL-CELL-MYPHONECHECK-CAPTURE-PACKAGE-SUCCESS.md](./INTERNAL-CELL-MYPHONECHECK-CAPTURE-PACKAGE-SUCCESS.md)).



### 진행 중이 아님 (의도적으로 보류)



- Goal extraction 전면, control plane, 멀티 워커 오케스트레이션 (Stage 2).

- 외부 자산 연동 (Stage 3).



### 다음 (Stage 1 우선순위 제안)



1. **Recent log collect + summarize**.

2. **File move / copy / archive** (executor 기반으로 정책·trace 정렬).

3. **Basic pipeline run + result capture**.



---



## 장기 비전 (참고용 — Stage 2+)



사용자 오더를 받으면 Neo가 **로컬·상위 시스템을 아우르는** 목표 달성 플로우를 수행한다.  

`detect-and-bail`이 아니라 **`detect-and-recover`** 이며, EMULATOR_OP 성격의 단계는 **복구 가능한 워크플로 스텝**으로 취급한다.



목표 파이프라인(장기):



1. **User order**

2. **Goal extraction**

3. **Plan synthesis**

4. **Validation**

5. **Execution**

6. **Replan**



## Stage 1 구현 맵 (요약)



| 구성요소 | 역할 | 위치 |

|----------|------|------|

| 메타데이터 기반 AVD 힌트 | ensure 입력 | `src/runtime/avdResolver.ts` |

| 기기 온라인 보장 | recover | `src/runtime/androidDevice.ts` |

| ensure 스텝 (공유) | 핸들러 코어 | `src/workflow/ensureAndroidDeviceShared.ts` |

| 스크린샷 계획·실행 | DAG + capture + replan | `screenshotPlanner.ts`, `screenshotWorkflow.ts` |

| 에뮬 확보 계획·실행 | 단일 ensure DAG | `emulatorEnsurePlanner.ts`, `emulatorEnsureWorkflow.ts` |

| 앱 기동·foreground | 4스텝 DAG + recover | `appLaunchPlanner.ts`, `appLaunchWorkflow.ts` |

| 앱 스텝 빌딩 블록 | 핸들러·recover 공유 | `appLaunchStepHandlers.ts`, `appLaunchContext.ts` |

| 캡처 빌딩 블록 | screencap + no-device recover | `screencapStepShared.ts` |

| composite 앱→캡처 | 5스텝 DAG | `appReadyScreenshotPlanner.ts`, `appReadyScreenshotWorkflow.ts` |

| golden path 패키지 | 8스텝 DAG + manifest/zip | `myphonecheckCapturePackagePlanner.ts`, `myphonecheckCapturePackageWorkflow.ts` |

| MyPhoneCheck 캡처 설정 | 온보딩/모듈 시퀀스 | `myphonecheckCaptureConfig.ts`, `.neo-myphonecheck-capture.json` |

| adb 앱 조작 헬퍼 | pm / monkey / dumpsys | `src/runtime/androidApp.ts` |

| 공통 실행기 | Stage 1 누적의 축 | `src/workflow/executor.ts` |

| 진입점 | COMMIT | `executeAction.ts` (… `myphonecheck_capture_package` 포함) |



## 다음 리팩터 단계 (Stage 1 안에서)



### Phase B — Goal / Planner 경계



- 목표별 `planXxx()` 추가 + 동일 `runWorkflowPlan`에 핸들러 등록 (지금 패턴 반복).



### Phase C — Validation 레이어



- 실행 전 `validatePlan(plan, policy, ctx)` (경로, `ANDROID_HOME`, breaker 등).



### Phase D — Replan 정책 표준화



- `failureTag` → (재시도 / ensure 재실행 / 중단) 테이블화; 스크린샷 no-device replan은 첫 사례.



### Phase E — User order 통합 (Stage 2와 경계)



- 라우터가 intent를 **Stage 1 goal**에 매핑; LLM은 파라미터·goal 후보, DAG는 코드 플래너가 책임지는 하이브리드.



## 코드 변경 맵 (요약)



| 파일 | 변경 방향 |

|------|-----------|

| `src/workflow/executor.ts` | 공통 실행 루프 유지·소폭 확장 |

| `src/workflow/types.ts` | goal/스텝/실패 태그 상수 |

| `src/workflow/*Workflow.ts` | 핸들러 + recover만 (얇게) |

| `src/workflow/*Planner.ts` | DAG만 |

| `src/workflow/ensureAndroidDeviceShared.ts` | ensure 스텝 공유 |

| `src/executeAction.ts` | 액션 → 워크플로 진입 |



## JSDoc 주의



블록 주석 안의 `/*` 또는 백틱 경로 표기는 TypeScript 파서를 깨뜨릴 수 있다.



## Stage 1 완료 기준 (체크리스트)



1. 자연어·액션으로 **내부 워크스테이션**에서 목표가 끝까지 처리되는가.

2. 중간 실패 시 **recover 경로**가 있는가.

3. **동일 executor**로 다른 internal workflow를 추가할 수 있는가. (**개별 3건 + composite 1건으로 검증됨.**)

4. 작은 성공이 **다음 단계(control plane, external assets)의 capability 기반**이 되는가.



Stage 2(control plane) 이상은 이 문서의 “장기 비전”에 두고, **별 스프린트**에서 다룬다.


