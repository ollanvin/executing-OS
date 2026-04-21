# Neo Local Operator Console

**Hex Executor Console** 브랜드의 UI를 넘어, **Neo Local Operator**(로컬 워크스테이션 오퍼레이터 에이전트) 콘솔입니다.  
단순 채팅 스킨이 아니라 **자연어 → 명령 분류 → (승인) → 로컬 실행 → 결과·로그·산출물** 흐름을 지향합니다.

- **로컬 실행 중심**: 기본 UX는 로컬 API + `child_process` 기반 실행입니다. (선택) 명령 분류에 Gemini API 또는 로컬 Ollama를 쓸 수 있습니다.
- **사이드바**: 기본 **접힘**(보조 패널). 빠른 명령 템플릿만 입력창에 프리필합니다.
- **중심 UI**: 하단 **Command Composer**와 명령 스트림(해석 카드 · 승인 · 결과 카드).

## 필요 환경

- Node.js 18+
- (에뮬/스크린샷) `ANDROID_HOME` 및 `platform-tools/adb`, `emulator`
- 선택: `NEO_MYPHONECHECK_AVD` — 사용할 AVD 이름. 미설정 시 목록에서 휴리스틱 선택.
- 선택: 백엔드 `.env`에 `GEMINI_*`, `OLLAMA_*`, `AI_PROVIDER_MODE` — 자연어 분류·라우팅( `hex-executor-console-backend/.env.example` 참고).

## 실행 방법

### 1) 백엔드 (필수 — 실제 실행)

```bash
cd hex-executor-console-backend
npm install
npm run dev
```

기본 포트 **3847**. `NEO_WORKSPACE_ROOT`로 `executing-OS` 루트를 바꿀 수 있습니다 (미설정 시 백엔드 기준 상위 폴더).

### 2) 프론트

```bash
cd hex-executor-console
npm install
npm run dev
```

Vite가 `/api`, `/artifacts`를 백엔드로 프록시합니다.

## 명령 분류 (프론트·백엔드 동일 규칙)

| 카테고리     | 설명        |
|-------------|-------------|
| `FILE_OP`   | 이동·복사·삭제 등 |
| `APP_OP`    | 프로그램 실행·설치 |
| `EMULATOR_OP` | 에뮬레이터·ADB·스크린샷 |
| `VM_OP`     | VM 작업 (승인 필요) |
| `LOG_OP`    | runs 로그 탐색 |
| `SYSTEM_OP` | 상태·adb 등 조회 |

오프라인 폴백 규칙은 `src/lib/commandClassifier.ts`에 있으며, API가 떠 있을 때는 백엔드가 **키워드 규칙 우선 → (필요 시) Gemini/Ollama** 순으로 `parse`를 처리합니다.

### 상단 배너 / 배지 의미

- **providerDetail / message**: 예) `AI: Gemini (auto)`, `AI: Ollama (forced local)`, `AI: Ollama (fallback) — Gemini breaker OPEN` — 현재 라우팅과 모드.
- **breakerBanners**: 도구별 브레이커(예: adb OPEN → 스크린샷 차단) 한 줄 요약.
- **해석 카드의 preview hash**: LLM 원문이 아니라 **canonical plan** 기준 해시 일부만 표시됩니다.
- **실행 결과 카드**: `APPROVAL HASH VERIFIED` / `AUDIT CHAIN` / `CIRCUIT BREAKER` 단계와 `breakerBlocked` 시 서버가 준 이유를 표시합니다.

## 초기 지원 실동작 (백엔드)

1. **MyPhoneCheck / 에뮬레이터 기동**  
   키워드: `마이폰첵`, `myphonecheck`, `에뮬레이터` 등 → `emulator -avd …` 후 `adb wait-for-device`.

2. **스크린샷**  
   키워드: `스크린샷`, `화면 캡처`, `screencap` 등 → `adb exec-out screencap -p` → `output/screenshots/*.png` 및 `/artifacts/...` URL.

3. **최근 로그**  
   키워드: `최근 로그`, `neo runs`, `executor logs` 등 → `runs/` 이하 최신 `.md` / `.json` 상위 줄 요약.

4. **파일 이동 (예시)**  
   키워드: `옮겨`, `이동` + Windows 경로 → **정책 허용 루트 내**에서만 동작. **사용자 승인** + **PLAN→BACKUP(COW)→COMMIT** 이 모두 성공한 뒤에만 `fs.rename`.

## 시스템 기본: Copy-on-Write & Fail-Closed (옵션이 아님)

Mutating 작업(`FILE_*` 쓰기, 에뮬/VM 상태 변경, 설치류 등)은 **사용자 승인과 무관하게** 다음 순서를 **강제**합니다.

1. **PLAN** — 영향 파일·용량·정책(허용 루트·금지 루트·최대 백업 크기) 검증.  
2. **BACKUP** — `.neo-safekeep/snapshots/…` 에 원본을 복제하고 `manifest.json` 기록. **실패 시 COMMIT 금지 (fail-closed).**  
3. **COMMIT** — 백업 성공 후에만 실제 변경(이동·스크린샷 저장·에뮬 기동 등).

- **restorePointId** / manifest 경로가 실행 결과에 포함됩니다.  
- 감사 로그: `.neo-safekeep/audit/YYYYMMDD.log` (JSONL).  
- 작업 루트·금지 경로·고위험 mutation 종류: 저장소 루트의 **`.neo-policy.json`** (없으면 백엔드 기본값 + `executing-OS`·`hex-executor-console-backend/output` 허용).

## 승인(Approval) vs 시스템 백업 vs PLAN 해시

- **Approval**: 사람이 “실행할지”를 확인합니다. **승인만으로는 mutating 실행이 완료되지 않습니다.** `parse`가 준 `planPreview.previewHash`를 `execute`의 `approvalPreviewHash`로 보내야 하며, 서버가 실행 시점에 PLAN을 다시 계산해 **해시가 일치할 때만** COMMIT합니다.  
- **백업/COW**: PLAN·해시 검증이 끝난 뒤, 대상이 있으면 **BACKUP**이 선행됩니다.  
- **고위험 mutation**(정책 `highRiskActions`)은 **사용자 승인 + 해시 바인딩 + COW**가 함께 필요합니다.

- **무승인 가능(읽기 위주)**: `recent_logs`, `system_status`, `unknown` 해석 등.  
- **스크린샷(`FILE_CREATE`)**: 고위험 목록에 없으면 UI 승인 없이도 실행될 수 있지만, **mutating이므로 PLAN 해시(`approvalPreviewHash`)는 여전히 필요**합니다. 아티팩트 경로·크기는 `.neo-policy.json`의 `artifactAllowedRoots` 등으로 제한됩니다.

## 감사·배치·복구

- 감사 JSONL은 **hash chain**(`prevHash`, `entryHash`)으로 무결성 검증이 가능합니다.  
- `.neo-policy.json`의 배치 한도와 **circuit breaker**가 비정상적인 대량 mutating을 실행 전·실행 중에 차단합니다. 콘솔 상단 배너와 `GET /api/system/status`에서 AI provider·브레이커 상태를 확인할 수 있습니다.  
- `POST /api/restore/:restorePointId`는 manifest·백업 존재 검증과 복구 후 해시 검증을 포함합니다.

## API 개요

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/command/parse` | `{ text }` → `action`, mutating이면 `planPreview`(previewHash 등) |
| POST | `/api/command/execute` | `{ action, approved, approvalPreviewHash? }` → `{ result }` (mutating 시 해시 필수) |
| POST | `/api/restore/:restorePointId` | 스냅샷 manifest 기준 파일 복구 |
| GET | `/api/logs/recent` | 최근 로그 파일 요약 |
| GET | `/api/system/status` | ANDROID_HOME·adb·**toolBreakers**·AI 상태 |
| GET | `/api/audit/verify/latest` | 감사 로그 체인 검증 |
| POST | `/api/system/breaker/reset` | `{ key }` 브레이커 수동 리셋 (로컬 관리용) |
| GET | `/api/health` | 헬스체크 |

## 구조 (프론트)

- `src/components/layout/HexExecutorLayout.tsx` — 레이아웃 · 사이드바 기본 접힘
- `src/components/main/MainWorkArea.tsx` — 명령 턴 · API 연동
- `src/components/main/ChatComposerBar.tsx` — Command Composer
- `src/components/operator/*` — 빈 상태, 해석 카드, 승인, 결과 카드
- `src/lib/commandClassifier.ts`, `neoApi.ts`, `neoOperatorTypes.ts`

## 빌드

```bash
npm run build
npm run preview
```

## 운영 검증 (백엔드 스모크)

UI는 `MainWorkArea` 상단 배너로 `ai.providerDetail`·`breakerBanners` 를 표시합니다. API·파이프라인·감사 체인까지 포함한 **자동 스모크**는 백엔드에서 실행합니다.

```bash
cd ../hex-executor-console-backend
npm run smoke:operator
```

선택: 백엔드를 띄운 뒤 `SMOKE_HTTP_BASE=http://127.0.0.1:3847` 로 HTTP 상태·브레이커 reset·(서버 `NEO_PARSE_DEBUG=1` 시) parse-debug 를 추가 검증합니다. 자세한 절차는 `hex-executor-console-backend/README.md` 의 «운영 검증» 을 참고하세요.
