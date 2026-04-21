# Executing-OS Architecture

> 역설계 기준일: 2026-04-21
> 작성: 비전 (코드베이스 전수 스캔 기반)

---

## 1. 제품 정의

Executing-OS는 **Windows 로컬 실행 오케스트레이션 프레임워크**이다. 앱 팩토리 파이프라인에서 Android/Web/iOS 앱을 190개국 정책 기반으로 빌드·테스트·스크린샷 검증·런타임 검사하는 시스템이다.

핵심 원칙:
- **Policy-as-Code** — 국가 프로필(JSON) + 프로젝트 설정(JSON) + 페이로드(JSON) 3계층 병합으로 실행 정책 결정
- **Stateless 실행** — 페이로드 JSON + 레포 상태 + 잡 메타데이터로 실행 결과가 결정됨. 숨겨진 글로벌 변경 상태 없음
- **Windows-Native** — 외부 브로커(Redis/RabbitMQ) 없이 SQLite WAL + 멀티스레드 워커 풀
- **실패 지능** — TRANSIENT(재시도 가능) vs STRUCTURAL(에스컬레이션) 2-class 분류 + 자동 레시피 적용
- **감사 추적** — 구조화 JSON + Markdown 미러 + JSONL 이벤트 로그

---

## 2. 디렉토리 구조

```
executing-OS/
├── agent/                          # 핵심 실행 모듈 (Python)
│   ├── local_executor.py          # 파이프라인 엔진 (1,353줄) — PRIMARY
│   ├── local_validator.py         # 증거 검증
│   ├── local_gatekeeper.py        # 품질 게이트
│   ├── executor_schema.py         # 페이로드 병합 + 검증
│   ├── executor_country.py        # 국가 프로필 + G20 순서
│   ├── executor_device.py         # 디바이스 초기 스캔
│   ├── executor_fingerprint.py    # 환경 스냅샷
│   ├── executor_screenshot.py     # Paparazzi + diff 휴리스틱
│   ├── executor_failure.py        # 실패 분류
│   ├── executor_recipes.py        # TRANSIENT 전용 자동 수정
│   ├── executor_queue.py          # SQLite 잡 큐
│   ├── executor_worker.py         # 워커 풀 (멀티스레드)
│   ├── executor_metrics.py        # JSONL 이벤트 + KPI 집계
│   ├── executor_daily_report.py   # 배치 리포팅
│   ├── executor_init_project.py   # 프로젝트 스캐폴딩
│   ├── task_ops.py                # 유틸리티 (UTC ↔ KST)
│   └── contracts.py               # WorkOrder 데이터클래스
│
├── executor.py                     # 팩토리 CLI (enqueue-batch / worker / init-project)
├── local_pipeline.py               # 순차/큐 배치 오케스트레이터
│
├── projects/                       # 프로젝트 설정
│   ├── WebStub/config.json
│   ├── Fooapp/config.json
│   ├── MyPhoneCheck/config.json
│   ├── AndroidPaparazziDemo/config.json
│   └── IosStubFrontEnd/config.json
│
├── profiles/                       # 국가 프로필 (190+)
│   ├── kr.json, us.json, jp.json, cn.json, de.json, gb.json ...
│
├── payloads/                       # 실행 페이로드
│   ├── fooapp_sample_kr.json
│   ├── g20_batch_webstub_5.json
│   └── myphonecheck_kr.json
│
├── fixtures/                       # 테스트 스텁
│   ├── web_stub/  fooapp/  ios_stub/  myphonecheck/
│
├── runs/                           # 런타임 산출물
│   ├── executor_queue.db           # SQLite WAL 잡 큐
│   ├── metrics/run_events.jsonl    # 이벤트 로그
│   ├── daily_global_report.md      # KPI 요약
│   └── {ProjectId}/{run_id}/       # 실행별 디렉토리
│       ├── build/ test/ runtime/ screenshots/ logs/ recipes/
│       └── reports/
│           ├── task_result_report.json  # 메인 리포트
│           ├── validation_report.json
│           ├── gate_report.json
│           ├── device_context.json
│           ├── runtime_profile.json
│           └── environment_snapshot.json
│
├── data/iso3166_alpha2.json        # ISO 국가 코드
├── docs/                           # 문서 + ADR + 전략
├── scripts/                        # PowerShell 헬퍼
├── hex-executor-console/           # 웹 UI (React/TS)
└── hex-executor-console-backend/   # 백엔드 API
```

---

## 3. 모듈 맵

| # | 모듈 | 줄 수 | 역할 |
|---|------|-------|------|
| 1 | **local_executor.py** | 1,353 | 7-Stage 파이프라인 엔진 (SOURCE → ENV → DEVICE_MERGE → BUILD → TEST → SCREENSHOT → RUNTIME → REPORT) |
| 2 | **executor.py** | 89 | 팩토리 CLI 엔트리포인트 (3 서브커맨드) |
| 3 | **local_pipeline.py** | 140 | 순차 배치 오케스트레이터 (국가별 루프) |
| 4 | **executor_worker.py** | ~200 | 멀티스레드 워커 풀 (SQLite 잡 소비) |
| 5 | **executor_queue.py** | ~150 | SQLite 잡 큐 상태 머신 (queued → running → done/failed/retry) |
| 6 | **executor_schema.py** | ~176 | 페이로드 3계층 딥 머지 + 검증 |
| 7 | **executor_country.py** | ~200 | G20 우선 국가 순서, 국가 프로필 로드, 디바이스↔정책 병합 |
| 8 | **executor_device.py** | ~150 | adb getprop → env override → fallback 디바이스 스캔 |
| 9 | **executor_screenshot.py** | ~144 | Paparazzi 아티팩트 수집 + diff 휴리스틱 |
| 10 | **executor_failure.py** | ~116 | 2-class 실패 분류 (TRANSIENT vs STRUCTURAL) |
| 11 | **executor_recipes.py** | ~84 | TRANSIENT 전용 자동 수정 (gradle_clean, npm_ci, adb_reconnect) |
| 12 | **local_validator.py** | ~150 | 증거 검증 (아티팩트 존재 + 정책 충족) |
| 13 | **local_gatekeeper.py** | ~150 | 비즈니스 게이트 (APPROVED / REJECTED_HARD) |
| 14 | **executor_metrics.py** | ~150 | JSONL 이벤트 로그 + KPI 집계 |
| 15 | **executor_daily_report.py** | ~100 | 일일 글로벌 리포트 (Markdown 테이블 + KPI) |
| 16 | **executor_init_project.py** | — | 프로젝트 스캐폴딩 (webstub/native/backend 템플릿) |

---

## 4. 데이터 흐름

### 4.1 순차 실행 흐름

```
사용자
    │ python local_pipeline.py payloads/myphonecheck_kr.json
    ▼
local_pipeline.main()
    ├─ 페이로드 JSON 파싱
    ├─ 프로젝트 설정 로드 (projects/{id}/config.json)
    ├─ resolve_country_codes_for_invocation()
    │   └─ G20 우선 → ISO 알파벳순 (country_limit 적용)
    │
    └─ 국가별 루프: CC ∈ [KR, US, JP, ...]
        │
        ▼
    run_local_executor(payload, global_cfg)
        │
        ├─ PipelineContext 생성 (run_id=UUID, run_root 디렉토리)
        ├─ validate_and_normalize_executor_payload()
        │   └─ 3계층 병합: 프로젝트 기본값 + 페이로드 + 국가 프로필
        │
        ├─ Stage 1: SOURCE_PREPARE
        │   └─ git clone 또는 prefer_local_path 사용
        │
        ├─ Stage 2: ENV_CHECK
        │   └─ 도구 검증 (git/gradle/npm/java) + environment_snapshot.json
        │
        ├─ Stage 3: DEVICE_RUNTIME_MERGE
        │   ├─ collect_device_context() → device_context.json
        │   └─ build_merged_runtime_execution_profile()
        │       ├─ 디바이스 우선: locale, timezone, formats, network
        │       └─ 정책 우선: search_providers, legal, store, payment
        │       → runtime_profile.json
        │
        ├─ Stage 4: IOS_FRONTEND (iOS만)
        │   └─ flows.json + string 리소스 검증
        │
        ├─ Stage 5: BUILD (재시도 가능)
        │   ├─ Android: gradlew + tasks → APK 수집
        │   ├─ Web: npm install → npm run build
        │   └─ iOS: skip (Mac/CI 위임)
        │
        ├─ Stage 6: TEST (재시도 가능)
        │   ├─ Android: gradlew + JUnit tasks
        │   └─ Web: npm run test
        │
        ├─ Stage 7: SCREENSHOT
        │   ├─ Paparazzi verify/record
        │   └─ detect_paparazzi_diff() → diff 휴리스틱
        │
        ├─ Stage 8: RUNTIME
        │   └─ adb devices + screencap (optional)
        │
        ├─ Stage 9: REPORT
        │   └─ task_result_report.json + .md
        │
        └─ finalize_production()
            ├─ validate_executor_run() → validation_verdict
            ├─ evaluate_gate() → gate_verdict
            ├─ evidence_complete = (PASS && APPROVED)
            └─ record_run_metrics() → run_events.jsonl 추가
```

### 4.2 병렬 큐 실행 흐름

```
사용자
    │ python executor.py enqueue-batch --payload payloads/g20_batch.json
    ▼
enqueue_batch_jobs()
    ├─ 국가 코드 해석 → [US, CN, JP, ..., ZA]
    └─ 국가당 1 잡 → SQLite INSERT (status='queued')

사용자
    │ python executor.py worker --count 3
    ▼
run_worker_pool(worker_count=3)
    ├─ 3 데몬 스레드 생성
    │
    └─ 각 스레드 _worker_loop:
        ├─ fetch_next_job() — BEGIN IMMEDIATE 원자적 claim
        ├─ status='running', worker_id=tag
        ├─ _execute_job_payload()
        │   └─ 페이로드에 country_code 주입 → run_local_executor()
        │
        ├─ 성공: mark_job_done()
        └─ 실패: mark_job_failed()
            └─ retry_scheduled + 기하급수 백오프 (60s → 300s → 900s)

    메인 스레드: 큐 폴링 → 3초간 안정 + (queued+running+retry=0) → 종료
    └─ append_kpi_section_only() → daily_global_report.md 갱신
```

---

## 5. 실패 분류 체계

| 분류 | 재시도 | 에스컬레이션 | 레시피 | 예시 |
|------|--------|------------|--------|------|
| ENV_TRANSIENT | O | X | gradle_clean, adb_reconnect | 타임아웃, 네트워크 타임아웃 |
| BUILD_TRANSIENT | O | X | gradle_clean | Gradle 데몬 락, 네트워크 resolve |
| NETWORK_TRANSIENT | O | X | adb_reconnect | 연결 리셋, 도달 불가 |
| BUILD_STRUCTURAL | X | O (code_worker) | — | 컴파일 에러, 누락 의존성 |
| TEST_STRUCTURAL | X | O (code_worker) | — | 테스트 실패, 어설션 |
| VISUAL_STRUCTURAL | X | O (code_worker) | — | Paparazzi 스냅샷 불일치 |
| RUNTIME_STRUCTURAL | X | O (code_worker) | — | 디바이스/앱 크래시, adb 오프라인 |

STRUCTURAL 실패는 `structural_max_attempts`(기본 1)로 재시도 상한 제한.

---

## 6. 3계층 정책 병합

```
┌─────────────────────────────────────────┐
│ Layer 1: 프로젝트 설정                    │
│ projects/{id}/config.json                │
│ (platform, build_profile, test_profile,  │
│  quality_gate, screenshot 기본값)         │
├─────────────────────────────────────────┤
│ Layer 2: 실행 페이로드                    │
│ payloads/{name}.json                     │
│ (운영자가 제공하는 오버라이드)              │
├─────────────────────────────────────────┤
│ Layer 3: 국가 프로필                      │
│ profiles/{cc}.json                       │
│ (locale, timezone, currency, search,     │
│  legal, store, payment, feature_flags)   │
└─────────────────────────────────────────┘
         │ validate_and_normalize_executor_payload()
         ▼
    Merged Payload (모든 정책 블록 보장)
         │
         ├─ quality_gate: build/test/screenshot/runtime 요구사항
         ├─ retry_policy: 스테이지별 최대 재시도 + 레시피
         ├─ stage_timeouts: 스테이지별 타임아웃 (초)
         ├─ runtime_profile: mode + min_screenshots
         └─ artifact_policy: APK glob, 매니페스트 해시
```

---

## 7. 디바이스 ↔ 정책 병합

```
collect_device_context()          load_merged_country_profile()
(adb getprop / env / fallback)    (profiles/{cc}.json)
         │                                 │
         ▼                                 ▼
    device_context.json            country_profile
         │                                 │
         └──────────┬──────────────────────┘
                    │
    build_merged_runtime_execution_profile()
                    │
         ┌──────────┴──────────┐
         │  디바이스 우선 필드   │  정책 우선 필드
         │  locale              │  search_providers
         │  timezone            │  legal
         │  formats             │  store
         │  network             │  payment_methods
         └──────────┬──────────┘
                    │
                    ▼
            runtime_profile.json
    (policy_overrides.force_* 적용 시 정책이 디바이스 오버라이드)
```

---

## 8. 리포트 산출물 체계

| 리포트 | 형식 | 생성 시점 | 내용 |
|--------|------|----------|------|
| task_result_report | JSON + MD | Stage 9 REPORT | 전체 실행 결과 (빌드/테스트/스크린샷/런타임/git/환경) |
| validation_report | JSON + MD | finalize | 증거 검증 결과 (PASS/FAIL + 상세 블록) |
| gate_report | JSON + MD | finalize | 비즈니스 게이트 (APPROVED/REJECTED_HARD + 사유) |
| device_context | JSON | Stage 3 | 디바이스 스캔 결과 (OS/locale/network/formats) |
| runtime_profile | JSON | Stage 3 | 디바이스+정책 병합 결과 |
| environment_snapshot | JSON | Stage 2 | 호스트 환경 (OS/Python/Java/Gradle/SDK) |
| artifacts/manifest | JSON | finalize | APK/AAB SHA-256 해시 + 경로 |
| run_events.jsonl | JSONL | finalize | 이벤트 로그 (KPI 집계 원본) |
| daily_global_report | MD | 배치 종료 | 일일 KPI 요약 (7일 윈도우) |

---

## 9. 기능 현황표

| # | 기능 | 상태 | 근거 |
|---|------|------|------|
| 1 | 7-Stage 파이프라인 (SOURCE→REPORT) | **DONE** | local_executor.py 1,353줄 완전 구현 |
| 2 | Android 빌드 (Gradle) | **DONE** | gradlew 호출 + APK 수집 |
| 3 | Web 빌드 (npm) | **DONE** | npm install + npm run build/test |
| 4 | iOS 프리플라이트 | **DONE** | flows.json + string 리소스 검증. 네이티브 빌드는 Mac/CI 위임 |
| 5 | Paparazzi 스크린샷 diff | **DONE** | verify/record + 4-axis 휴리스틱 diff 탐지 |
| 6 | SQLite 잡 큐 | **DONE** | WAL 모드 + BEGIN IMMEDIATE 원자적 claim |
| 7 | 멀티스레드 워커 풀 | **DONE** | N 데몬 스레드 + 안정 종료 로직 |
| 8 | 190개국 프로필 | **DONE** | G20 우선 순서 + ISO 알파벳순 |
| 9 | 3계층 정책 병합 | **DONE** | 프로젝트 + 페이로드 + 국가 딥 머지 |
| 10 | 디바이스↔정책 병합 | **DONE** | 디바이스 우선/정책 우선 필드 분리 |
| 11 | 실패 분류 (TRANSIENT/STRUCTURAL) | **DONE** | 7-class 분류 + 에스컬레이션 힌트 |
| 12 | 자동 레시피 (gradle_clean, npm_ci, adb) | **DONE** | TRANSIENT 전용 적용 |
| 13 | 증거 검증 (Validator) | **DONE** | 아티팩트 존재 + 정책 충족 체크 |
| 14 | 품질 게이트 (Gatekeeper) | **DONE** | APPROVED/REJECTED_HARD 판정 |
| 15 | JSONL 메트릭 + KPI 집계 | **DONE** | 일별/프로젝트별/국가별 집계 |
| 16 | 프로젝트 스캐폴딩 | **DONE** | webstub/native/backend 3 템플릿 |
| 17 | 웹 콘솔 UI | **PARTIAL** | hex-executor-console 존재하나 상세 미확인 |
| 18 | 백엔드 API | **PARTIAL** | hex-executor-console-backend 존재하나 상세 미확인 |
| 19 | iOS 네이티브 빌드 (xcodebuild) | **DEFERRED** | Mac/CI 위임 설계. Windows에서는 프리플라이트만 |

---

## 10. ADR (Architecture Decision Records)

### ADR-001: 멀티 런 병렬화
- G20 배치 처리를 위한 병렬화 필요성 정의
- ADR-002로 구체화 위임

### ADR-002: 워커 풀 & 로컬 잡 큐
- 외부 브로커 없이 SQLite WAL로 잡 큐 구현
- BEGIN IMMEDIATE 트랜잭션으로 원자적 잡 claim
- 기하급수 백오프 재시도 (60s → 300s → 900s)
- 글로벌 상태 감사: ROOT(상수), ctx(인스턴스별), 환경 변수(호스트 범위, 문서화됨)
