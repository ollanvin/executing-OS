# Ollama 역할 분리 (초도작업 메모)

## 1) 왜 Ollama를 두 역할로 나누는가

- **단일 바이너리/브랜드**로 “로컬 추론”과 “로컬 실행”이 한 덩어리로 묶이면, 정책·감사·격리 경계를 세기 어렵다.
- **Host Executor**는 사용자 머신(또는 NEO 호스트) 안에서만 PowerShell·ADB·파일 등 **폐쇄된** 작업을 수행한다.
- **Sandbox Operator**는 Windows Sandbox·VM 등 **격리 환경**과의 유일한 통로로, inbox/outbox 파일 프로토콜만 다룬다.
- **Gemini**는 원격 추론·플래닝·정책 해석에 두고, 실행은 위 두 경로로만 라우팅하는 것이 목표다.

## 2) 이번 초도작업에서 구현된 것

| 레이어 | 위치 | 내용 |
|--------|------|------|
| LLM 전용 | `src/ai/ollamaProvider.ts` | HTTP `/api/generate` 등 모델 호출만 |
| Host Executor | `src/ollama/hostExecutor.ts`, `hostExecutionTypes.ts` | `executeHostTask` — powershell, bash, fs_prepare(workspaceRoot 하위), adb, **screen_capture**(에뮬/시뮬 화면 캡처, Windows 1차), program_install 스텁 |
| Sandbox Operator | `src/ollama/sandboxOperator.ts`, `sandboxJobTypes.ts` | `enqueueSandboxJob`, `waitForSandboxJobResult`, `runSandboxJobWithPolling` |
| Sandbox Bridge | `src/sandbox/sandboxPaths.ts`, `sandboxProtocol.ts` | `output/sandbox-bridge/` 아래 inbox/outbox/…, JSON request/result, 스텁 에이전트 |
| 라우팅 힌트 | `src/execution/executionRouting.ts` | `ExecutionTarget`, `inferExecutionTargetFromPayload` (전면 적용 아님) |
| 스모크 | `src/smoke/runOllamaHostExecutorSmoke.ts`, `runSandboxProtocolSmoke.ts` | 최소 실행 증명 |

## 3) 아직 하지 않은 것

- Windows Sandbox 부팅·공유 폴더 자동 마운트
- 샌드박스 **내부** Ollama/에이전트 프로세스
- `gmail_check` 등 실제 브라우저 자동화
- Gemini 플래너와 실행 단계의 **전면** 라우팅 배선
- `program_install` 실제 구현
- 호스트 권한 상승·시스템 디렉터리 수정

## 4) 다음 반복에서 할 일 (제안)

1. 플래너 출력 스텝에 `ExecutionTarget` + payload 를 붙이고, `executeHostTask` / `enqueueSandboxJob` 로 디스패치.
2. 샌드박스 VM 안에서 inbox 폴링 루프만 있는 **얇은 에이전트** 바이너리.
3. `artifactAllowedRoots`·워크스페이스 정책과 Host Executor 경로 규칙을 한 표로 정리.
4. 스텁 대신 실제 outbox 를 쓰는 통합 테스트(로컬 폴더 공유 가정).

---

## Iteration 2 — Host Executor Wiring & Sandbox Bridge E2E

### 1) `ExecutionTarget=ollama_host` 로 연결된 스텝

- 워크플로 상수 `WORKFLOW_STEP_HOST_EXECUTOR_PREFLIGHT` (`host_executor_preflight`).
- `ensure_android_device` 직후 실행: `inferExecutionTargetFromPayload` 로 `adb` / `fs_prepare` payload 가 `ollama_host` 임을 로그에 기록.
- `executeHostTask`: (1) `adb version`, (2) `fs_prepare` 로 번들 루트 및 `captures/onboarding|module|auto` 생성 (기존 `fs.mkdir` 선생성 제거).
- 결과는 `ctx.hostExecutionTrace` 및 최종 `ExecuteResult.hostExecutionTrace` 에 포함.

### 2) sandbox-bridge real agent 왕복

- 워크플로 상수 `WORKFLOW_STEP_SANDBOX_BRIDGE_JOB` (`sandbox_bridge_job`), `explore` 다음·`build_control_plane_bundle` 직전.
- `enqueueSandboxJob` + `runRealSandboxAgentOnce` (동일 프로세스) + `runSandboxJobWithPolling(..., completeWithAgent: "real")` 경로.
- `runRealSandboxAgentOnce`: inbox `job-*.request.json` 읽기 → `artifacts/job-<id>-out.txt` 작성 → outbox result JSON (summary에 `sandbox smoke: executed …`).
- 프로필 `myphonecheck`: `output/sandbox-bridge/myphonecheck/` 아래 inbox/outbox.

### 3) smoke / e2e 에서 본 결과

- `npm run smoke:ollama-host` — Host Executor 단독 (유지).
- `npm run smoke:sandbox-protocol` — **stub** 경로와 **real** 경로 각 1회 (`stubPath` / `realAgentPath` JSON).
- `npm run smoke:e2e-myphone-bundle` — 성공 시 stdout JSON 에 `hostExecutionTrace`, `sandboxBridgeJob` 포함; 마크다운 리포트에 "Host Executor & sandbox-bridge" 절 추가.

### 4) 실행 명령 요약

| 명령 | 설명 |
|------|------|
| `npm run smoke:ollama-host` | Host Executor 전용 |
| `npm run smoke:sandbox-protocol` | stub + real agent 각각 |
| `npm run smoke:e2e-myphone-bundle` | MyPhoneCheck Stage 1 전체 (preflight·sandbox·번들); `NEO_MYPHONECHECK_PACKAGE` 필요 |

### 5) Iteration 3에서 이어짐

- 아래 **Iteration 3** 섹션 참고 (dispatcher, `real-process` 에이전트, e2e 검증 강화).

---

## Iteration 3 — Dispatcher & real-process sandbox agent

### 1) e2e / 실전 증명

- `npm run smoke:e2e-myphone-bundle` 는 `NEO_MYPHONECHECK_PACKAGE` + 에뮬/ADB 가 갖춰진 환경에서 전체 스텝을 돌릴 때 완주 증명용.
- stdout JSON 에 `hostExecutionTrace`, `sandboxBridgeJob`, `executionTargetsUsed`, `dispatchAudit`, `e2eVerification` 포함.
- `e2eVerification` 은 (1) `hostExecutionTrace` ≥1, (2) `sandboxBridgeJob.status===ok`, (3) `captureCounts.auto>=1` 을 동시에 만족해야 `ok: true` — 하나라도 실패 시 `missing[]` 에 사유.
- 마크다운 리포트: Host Executor trace, Sandbox bridge, Execution targets, Dispatcher audit, Final bundle contents 절.

### 2) in-process real vs real-process (별도 프로세스)

| 모드 | 설명 |
|------|------|
| `completeWithAgent: "stub"` | inbox → 즉시 stub result |
| `completeWithAgent: "real"` | 동일 프로세스에서 `executeSandboxAgentJob` |
| `completeWithAgent: "real-process"` | `node scripts/runWithNeoEnv.mjs src/sandbox/runSandboxAgentOnce.ts --sharedRoot … --jobId …` 자식 프로세스 |

- 공통 구현: `executeSandboxAgentJob` (`sandboxProtocol.ts`) — `generic_script` / `browser_open`·`gmail_check` 플레이스홀더.

### 3) dispatcher 공통화

- `src/execution/dispatchExecutionStep.ts`: `dispatchExecutionStep(RoutedExecutionStep, DispatchExecutionContext)`.
- `ollama_host` → `executeHostTask`; `ollama_sandbox` → `runSandboxJobWithPolling` (+ `workspaceRoot`/`backendRoot` 로 `real-process`); `gemini_remote` → 스킵 요약만.
- MyPhoneCheck `host_executor_preflight` / `sandbox_bridge_job` 은 위 디스패처 경유 (수동 `executeHostTask` 직접 호출 제거).

### 4) 아직 남은 것 (Iteration 4 제안)

1. Windows Sandbox `.wsb` + 공유 폴더로 **실제** 격리 VM 에서 에이전트만 실행.
2. `gmail_check` / `browser_open` 실 UI 자동화.
3. 다른 워크플로에 dispatcher 패턴 복제.
4. 플래너 JSON 스키마에 `ExecutionTarget` 정식 필드.
5. 자식 프로세스 에이전트 타임아웃·재시도·헬스체크.

---

## Iteration 3-2 — Emulator/Simulator Screen Capture (호스트 OS 캡처)

### 용어

- Neo 표준 캡처 방식: **Emulator/Simulator Screen Capture** (에뮬 화면 캡처 / 시뮬 화면 캡처).
- Neo가 픽셀 버퍼를 직접 다루지 않고, **Host Executor** 의 `kind: "screen_capture"` 로 호스트에서 PNG를 저장한다.

### Android 에뮬 창만 크롭 (Windows)

- `targetWindowHint=android_emulator` 일 때: `src/host/windows/androidEmulatorWindowCapture.ps1` — `Get-Process` + `MainWindowTitle` 에 `Android Emulator` 포함 + `GetWindowRect` 로 창 좌표를 구한 뒤, **해당 rect만** `CopyFromScreen` 으로 PNG 저장 (무손실 PNG).
- 창을 못 찾으면 `HostExecutionResult.ok=false`, `error=emulator_window_not_found`, `screenCaptureDetails.emulatorWindowFound=false`.
- `targetWindowHint=primary_monitor` 등 그 외: 기존처럼 PrimaryScreen 전체 (스모크·레거시).
- DPI: 코드 주석으로 125%/150% 배율 이슈는 후속 Iteration으로 명시.

### Capture backend (확장용)

- `emulatorScreenCaptureHost.ts` 에 `EmulatorCaptureBackend`: `host_window` | `adb_screencap` | `emulator_builtin` — 기본값 `host_window`. adb/시뮬 내장은 후속.

### 구현 위치

- 창 탐지 보조: `src/host/windows/windowLocator.ts` + `findAndroidEmulatorWindow.ps1` (JSON rect).
- 타입: `hostExecutionTypes.ts` — `screen_capture`, `HostExecutionResult.screenCaptureDetails` (rect, captureBackend).
- MyPhoneCheck: 시나리오·탐색 파일명 `NNN_<screenIdFileTag>.png` (hex 8자).
- trace: `emulatorScreenCaptureTrace` 항목에 `screenId`, `rect`, `captureBackend` 포함.
- e2e 리포트: `e2eVerification.screenCapture` (`emulatorWindowCropOk`, `backendsUsed` 등).
- 스모크: `runOllamaHostExecutorSmoke.ts` — `screen_capture(primary)` + `screen_capture(android_emulator)`; 에뮬 없을 때 `NEO_SKIP_EMULATOR_SCREEN_CAPTURE=1` 로 에뮬 단계 생략 가능.

### 디스패처

- `inferExecutionTargetFromPayload` 에 `screen_capture` 포함 → `ollama_host`.

### 남은 것

- macOS/Linux, Per-Monitor DPI, iOS Simulator 창 매칭, `adb_screencap` 백엔드 스위치 구현.
