# Neo Local Operator API

`hex-executor-console` 프론트가 호출하는 **로컬 전용** Express API입니다.  
`child_process`로 adb/emulator 및 파일 시스템 작업을 수행합니다.

## 실행

```bash
npm install
npm run dev
```

- 포트: `PORT` 또는 기본 **3847**
- 작업 공간: `NEO_WORKSPACE_ROOT` (미설정 시 이 패키지의 `../../` = `executing-OS` 루트로 가정)
- 산출물: `output/screenshots/` (정적 경로 `/artifacts/...`)

## 환경 변수

| 변수 | 설명 |
|------|------|
| `ANDROID_HOME` | adb / emulator 경로 |
| `NEO_MYPHONECHECK_AVD` | 우선 선택할 AVD 이름 |
| `NEO_WORKSPACE_ROOT` | `runs/` 등을 둘 루트 |
| `GEMINI_API_KEY` | (선택) Gemini API 키 — 없으면 deterministic 분류 + Ollama/auto 시 Ollama 시도 |
| `GEMINI_MODEL` | (선택) 기본 `gemini-2.0-flash` — 무료 tier·쿼터는 고정 전제가 아님 |
| `OLLAMA_BASE_URL` | (선택) 기본 `http://127.0.0.1:11434` |
| `OLLAMA_MODEL` | (선택) 예: `llama3.1:8b`, `qwen3:8b` |
| `AI_PROVIDER_MODE` | `auto` \| `gemini` \| `ollama` — auto 시 Gemini 가능하면 우선, 실패·미설정 시 Ollama |

`.env.example` 참고.

## 안전 계층 (COW)

- Mutating 명령은 **PLAN → BACKUP → COMMIT** 순으로만 진행합니다. 백업 실패 시 **실행하지 않습니다**.  
- **승인만으로는 실행되지 않습니다.** `planPreview.previewHash`는 LLM 출력이 아니라 **canonical plan object**(카테고리·intent·mutationKind·정규화된 경로·건수·바이트·승인/고위험 플래그·`workspaceRoot`)를 RFC 8785 스타일 정렬 JSON으로 직렬화한 뒤 SHA-256 한 값입니다. `execute`의 `approvalPreviewHash`와 실행 시점 재계산이 **일치할 때만** COMMIT됩니다.  
- **배치 한도·서킷 브레이커 (상태기계)**: `gemini`, `ollama`, `adb`, `emulator`, `file_move_mutation`, `mutating_pipeline` 등 **도구/프로바이더별** CLOSED → OPEN → HALF_OPEN(probe) → CLOSED 를 지원합니다. `.neo-policy.json`의 `breakers`에서 `failureThreshold`, `cooldownSeconds`, `probeSuccessesRequired`, `manualResetRequired`를 덮어쓸 수 있습니다. 전역 요약은 `GET /api/system/status`의 `toolBreakers`, `breakerBanners`, `circuitBreaker`(mutating_pipeline)를 참고하세요. 관리용: `POST /api/system/breaker/reset` + `{ "key": "gemini" }` 등.  
- **감사 로그**: `<workspace>/.neo-safekeep/audit/*.log` (JSONL) — `prevHash`/`entryHash` 체인. 무결성 검증: `GET /api/audit/verify/latest`.  
- 스냅샷: `<workspace>/.neo-safekeep/snapshots/…/manifest.json` (`integritySha256`)  
- 정책: `<workspace>/.neo-policy.json` (아티팩트 루트·보존·크기 등 포함)  
- 복구: `POST /api/restore/:restorePointId` — manifest 무결성·백업 경로 검증 후 복원, 원본 해시 재검증 및 `restore_*` 감사 이벤트 기록.

## AI provider (선택)

Neo는 **로컬 오퍼레이터**이며, 자연어 분류·요약 등에는 **Gemini API**(클라우드)와 **Ollama**(로컬) 두 축을 둡니다. `src/ai/*` 추상화를 통해 연결됩니다.

- **결정론**: 키워드 규칙(`parseCommand`)이 이미 분류하면 **AI를 호출하지 않습니다.** 그 외 `unknown` 만 LLM 시도 → `normalizeParsedAction`으로 mutating 승격 차단 → `finalizeAction`.
- **Intent 화이트리스트**: LLM 출력은 `intentAllowlist`에 있는 값만 통과합니다.
- **Fallback 정책** (`src/ai/fallbackPolicy.ts`):  
  - Gemini **429 / 5xx / 네트워크**류 → `auto` 모드에서 Ollama 시도 허용.  
  - Gemini **400 / 스키마 불일치** → 다른 provider로 **fallback 금지** (deterministic 로만 수렴).  
  - `AI_PROVIDER_MODE=ollama` 인데 Ollama down → **AI 없음**, deterministic 만.  
  - **execute** 단계에서 canonical plan hash 불일치 → **fallback 없음**, fail-closed.

- **디버그**: `NEO_PARSE_DEBUG=1` 일 때 `POST /api/command/parse-debug` 로 deterministic / Gemini / Ollama / 최종 결과를 한 번에 비교할 수 있습니다.

Gemini 무료 tier는 **고정 전제가 아님**. `GET /api/system/status`의 `ai`·`providerDetail`에 현재 모드가 표시됩니다.

## 스크립트

- `npm run dev` — `tsx watch src/index.ts`
- `npm run smoke:operator` — 운영 검증 스모크 (`src/smoke/runOperatorVerification.ts`)

## 운영 검증 (스모크 / 체크리스트)

### 자동 스모크

```bash
cd hex-executor-console-backend
npm run smoke:operator
```

기본적으로 **결정론 parse·해시 안정성·approval 바인딩·브레이커 전이·감사 체인·파일 이동+restore** 를 순서대로 검증합니다. 테스트 데이터는 워크스페이스 루트 아래 `.smoke-operator/` 에 생성됩니다.

| 환경 변수 | 의미 |
|-----------|------|
| `SMOKE_SKIP_RESTORE=1` | ⑥ 파일 이동·복구 시나리오 생략 (CI/빠른 확인) |
| `SMOKE_HTTP_BASE=http://127.0.0.1:3847` | ⑦ `GET /api/system/status`, `POST /api/system/breaker/reset` 등 HTTP 검증 (서버 기동 후) |
| `NEO_PARSE_DEBUG=1` | (서버) 활성화 시 `SMOKE_HTTP_BASE` 가 있으면 `POST /api/command/parse-debug` 로 deterministic 문장의 `finalized` 일치 확인 |

### 수동: Provider fallback

| 시나리오 | 설정 | 기대 |
|----------|------|------|
| Gemini 정상, Ollama down | `AI_PROVIDER_MODE=auto`, Ollama 미기동 | deterministic 또는 Gemini만 사용 (`/api/system/status` 의 `ai`) |
| Gemini 429/timeout | 실제 쿼터 또는 프록시 시뮬 | `auto` 에서 Ollama 가용 시 fallback 메시지 (`providerDetail`) |
| Gemini 400/스키마 깨짐 | — | `fallbackPolicy`: Ollama로 **넘기지 않음**, deterministic 수렴 |
| `AI_PROVIDER_MODE=ollama` + Ollama down | — | AI 없음·deterministic (fail-closed to local rules) |

### 수동: Breaker

1. `GET /api/system/status` → `toolBreakers[]` 에서 각 키의 `state`, `trippedAt`, `reason`, `retryAfterMs`, `manualResetRequired` 확인.  
2. 연속 실패를 유발한 뒤 `OPEN` → 쿨다운 후 `HALF_OPEN` 프로브 → 성공 시 `CLOSED` 인지 확인.  
3. `POST /api/system/breaker/reset` + `{ "key": "gemini" }` (허용 키: `gemini` \| `ollama` \| `emulator` \| `adb` \| `file_move_mutation` \| `mutating_pipeline`).

### 수동: Restore / Audit

1. `GET /api/audit/verify/latest` — `ok: true` 이면 최신 일자 로그 체인 정상.  
2. `POST /api/restore/:restorePointId` — 응답의 `restoredItems`, `failedItems`, `verificationStatus` 확인.  
3. 감사 파일 **복사본**에서 `entryHash` 한 글자만 바꾼 뒤, 앱 코드의 `verifyAuditLogFile` 또는 동일 규칙으로 `brokenAtLine` 이 나오는지 확인 (운영 로그 직접 수정 금지).

### 원칙 (요약)

- **Deterministic parse 우선**: 키워드에 걸리면 LLM을 호출하지 않는다.  
- **Mutating** 은 **canonical plan hash + approval binding** 이 틀리면 실행하지 않으며, 불일치는 감사에 `approval_hash_mismatch` 로 남긴다.  
- **Breaker / fallback / restore / audit verify** 는 운영 안전장치로 함께 동작한다.
