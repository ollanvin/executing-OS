# App Factory Constitution Architecture

> 역설계 기준일: 2026-04-21
> 소스: https://github.com/ollanvin/app-factory-constitution
> 작성: 비전 (GitHub 레포 전수 스캔 기반)

---

## 1. 제품 정의

App Factory Constitution은 **앱 팩토리 생태계의 정책 거버넌스 프레임워크**이다. 코드 실행·결제·로케일·프라이버시·런타임·릴리스 전반에 걸친 규칙을 정의하고, 위반을 사전 차단(preflight)하며, 사후 감사(audit)하는 시스템이다.

핵심 원칙 (constitution.yaml v1.0.0):

| 원칙 ID | 이름 | 내용 |
|---------|------|------|
| release_google_play_global_default | 글로벌 릴리스 | Google Play 지원 전 지역이 기본 배포 대상 |
| coding_no_hardcoding | 하드코딩 금지 | 환경 적응 + 정책 주입으로 해결 |
| ops_zero | Zero 운영 | Zero 비용, Zero 인력, Zero 스토리지, Zero 중앙집중, Zero 하드코딩, Zero 수동 |
| runtime_on_device | 온디바이스 우선 | 서버리스, 중앙 통제 없음 (AWS Free Tier 예외만 허용) |
| billing_store_only | 스토어 전용 결제 | Android Google Billing / iOS App Store만 허용 |

---

## 2. 디렉토리 구조

```
app-factory-constitution/
├── shared/constitution/                # 헌법 프레임워크
│   ├── constitution.yaml              # 마스터 헌법 (원칙 + 규칙 참조)
│   ├── exceptions/
│   │   ├── aws-free-tier.yaml         # AWS Free Tier 예외 (2027-04-20 만료)
│   │   └── region-regulatory-exceptions.yaml  # 지역 규제 예외 (빈 파일)
│   ├── decisions/
│   │   └── README.md                  # 헌법 수정 결정 기록 템플릿
│   └── reports/
│       ├── constitution-audit-*.json   # 사후 감사 리포트
│       ├── constitution-audit-*.md
│       ├── constitution-preflight-*.json  # 사전 검증 리포트
│       └── constitution-preflight-*.md
│
├── docs/
│   ├── OPERATING-CONSTITUTION.md      # 운영 헌법 (에뮬레이터 우선 정책)
│   ├── VERIFIER-CODE-WORKER-REF.md    # 검증자/코드워커 파이프라인 훅
│   ├── chat-session-handoff-constitution-v2.md  # 세션 핸드오프 구현 노트
│   └── FORENSICS-EXECUTOR-OS-CANDIDATES-2026-04-19.md  # 워크트리 후보 포렌식
│
└── .git/
```

---

## 3. 규칙 체계

### 3.1 규칙 범주

constitution.yaml에서 참조하는 규칙 카테고리:

| 범주 | 대상 | 예시 |
|------|------|------|
| **release** | 앱 배포 지역/채널 | Google Play 글로벌 기본, 국가별 제한 |
| **coding** | 코드 패턴 | 하드코딩 금지, 환경 적응 필수 |
| **runtime** | 실행 환경 | 온디바이스 우선, 서버리스 |
| **operations** | 인프라 운영 | Zero 원칙 6종 |
| **billing** | 결제 수단 | 스토어 전용 (Stripe 등 비스토어 차단) |
| **locale** | 로케일/국가 | 190개국 지원, G20 우선 |
| **privacy** | 개인정보 | 국가별 법률 준수 (PIPA, GDPR 등) |

### 3.2 규칙 생명주기

```
observe → warn → deny
```

- **observe**: 위반 기록만 함 (학습 단계)
- **warn**: 위반 경고 + 실행은 허용
- **deny**: 위반 시 실행 차단

### 3.3 예외 관리

예외는 구조화된 YAML로 관리:

```yaml
# aws-free-tier.yaml 예시
exception_id: smoke-dev-neo-host
principle: runtime_on_device
scope: [smoke, neo_action, host_executor, ollama_sandbox, mutation_pipeline]
justification: "development/test 환경에서 AWS Free Tier 범위 내 사용"
expires: 2027-04-20
approved_by: constitution-maintainer
```

모든 예외는 만료일 필수. 구두 합의 금지 — decisions/ 디렉토리에 문서화.

---

## 4. 검증 흐름

### 4.1 Preflight (사전 검증)

```
코드 변경 / 빌드 요청
    │
    ▼
Constitution Preflight Validator
    ├─ constitution.yaml 규칙 로드
    ├─ 활성 예외 확인 (만료 체크)
    ├─ 규칙별 평가:
    │   ├─ billing: 비스토어 결제 수단 감지
    │   ├─ coding: 하드코딩 패턴 감지 (AST 정적 분석)
    │   ├─ runtime: 서버 의존성 감지
    │   └─ locale: 미지원 로케일 감지
    │
    ├─ 위반 발견 시:
    │   ├─ observe: 기록만
    │   ├─ warn: 경고 + 허용
    │   └─ deny: 차단 + preflight DENIED
    │
    └─ → constitution-preflight-{timestamp}.json + .md

실제 사례:
- Stripe 결제 연동 시도 → billing_non_store_provider → DENIED
  "only Google Billing (Android) and App Store (iOS) allowed"
```

### 4.2 Audit (사후 감사)

```
파이프라인 실행 완료
    │
    ▼
Constitution Audit Checker
    ├─ 실행 산출물 검사
    ├─ 헌법 규칙 대비 drift 탐지
    │
    └─ → constitution-audit-{timestamp}.json + .md
        ├─ result: "allow" (위반 없음) 또는 위반 목록
        └─ task, worker, mode 기록
```

### 4.3 정적 분석

- TypeScript/JavaScript AST 기반 코드 패턴 탐지
- AJV 2020-12 JSON Schema 검증
- npm 스크립트로 실행:
  - `smoke:constitution` — 전체 검증
  - `smoke:constitution-schema` — 스키마 검증
  - `smoke:constitution-static-analysis` — AST 분석
  - `smoke:constitution-lifecycle` — 규칙 생명주기 검증

---

## 5. Executing-OS와의 관계

```
app-factory-constitution          executing-OS
(정책 정의)                        (정책 실행)
        │                                │
        ├─ constitution.yaml ────────→ executor_schema.py
        │   (원칙/규칙)                    (페이로드 검증 시 참조)
        │
        ├─ profiles/{cc}.json ───────→ executor_country.py
        │   (국가 정책)                    (국가 프로필 로드)
        │
        ├─ OPERATING-CONSTITUTION ───→ local_executor.py
        │   (에뮬레이터 우선)               (런타임 스테이지)
        │
        ├─ preflight reports ────────→ local_gatekeeper.py
        │   (사전 검증 결과)               (게이트 판정에 반영)
        │
        └─ audit reports ────────────→ executor_metrics.py
            (사후 감사 결과)               (메트릭에 기록)
```

---

## 6. 운영 헌법 주요 정책

### 6.1 에뮬레이터 우선 정책 (OPERATING-CONSTITUTION.md)

| 정책 | 내용 |
|------|------|
| 기본 테스트 환경 | 에뮬레이터/가상화가 PRIMARY |
| 물리 디바이스 | 예외적으로만 허용 |
| 예외 활성화 | `NEO_UX_EXCEPTION_PHYSICAL_DEVICE=1` 환경 변수 필요 |
| 국가 확장 순서 | G20 우선, 이후 알파벳순 |
| 적용 범위 | Neo 스테이지, 프리플라이트, 플래너, 워크 오더 전부 |

### 6.2 헌법 루트 탐지

```
getConstitutionRoot()
    ├─ 환경 변수: NEO_CONSTITUTION_ROOT
    └─ fallback: 워크스페이스/모노레포에서 shared/constitution/ 탐색
```

---

## 7. 현황

| # | 항목 | 상태 |
|---|------|------|
| 1 | constitution.yaml 마스터 정의 | **DONE** |
| 2 | AWS Free Tier 예외 | **DONE** (2027-04-20 만료) |
| 3 | Preflight 검증 (billing 차단 등) | **DONE** (리포트 존재 확인) |
| 4 | Audit 감사 (drift 탐지) | **DONE** (리포트 존재 확인) |
| 5 | AST 정적 분석 | **DONE** (npm 스크립트 정의됨) |
| 6 | 규칙 생명주기 (observe→warn→deny) | **DONE** |
| 7 | 지역 규제 예외 | **EMPTY** (region-regulatory-exceptions.yaml 빈 파일) |
| 8 | 헌법 수정 결정 기록 | **EMPTY** (decisions/README.md 템플릿만) |
| 9 | 개별 규칙 파일 (release.yaml, billing.yaml 등) | **미확인** (constitution.yaml에서 참조하나 레포에 미포함) |
