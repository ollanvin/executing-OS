# neo_session_checkpoint — executing-OS AI 세션 체크포인트

이 파일은 `docs/ai/rule/ai_rules_neo.md`에 정의된 절차에 따라, 규칙·헌법 관련 **주요 결정과 세션 경계**를 요약해 둔다.

## SESSION CORE (canonical pointer)

세션 시작 시 운영자·에이전트가 동일한 경로를 참조하도록, 아래 한 줄을 기준으로 한다.

- 최신 SSW(latest_ssw_path): `docs/ai/ssw/2026-04-21_app_factory_ready_to_context.txt`

---

## Ready-to-Context v1 (고정, 2026-04-21)

다음이 **executing-OS AI 운용**에 대한 ready-to-context v1 기준선으로 확정되었다.

- **규칙 파일:** `docs/ai/rule/ai_rules_neo.md` — 헌법 v4 최우선, 에뮬→ADB→캡처 우선, `docs/ai` 직속 3폴더 + `ssw/cursor` 리포트 위치, 잠금 정책, Global reporting(커밋·`origin/main` 푸시 포함), 헐크 워크오더 메타 규칙.
- **읽기 순서(저장소 + 세션):** `ai_rules_neo` → `neo_session_checkpoint` → checkpoint가 가리키는 **최신 SSW** → 채팅의 **`[SESSION CORE]`** (세션 목표·플래그·한정 규율; 헌법·비가역 제약과의 관계는 `ai_rules_neo` §4 참조).
- **역할 경계:** `ai_rules_neo` = 장기·안정 규칙 / checkpoint = 세션 경계 스냅샷·포인터 / SSW = 세션별 히스토리·합의 상세 / `ssw/cursor/*.md` = Cursor 블로그형 리포트(파일명 패턴은 `ai_rules_neo` §3).

---

## 2026-04-21 세션 요약 (ai_rules_neo 잠금 · ready-to-context v1)

- `docs/ai/rule/ai_rules_neo.md`를 **신규 작성**하여, executing-OS 저장소에서 사용할 **핵심 AI 규칙**을 **고정 구조(섹션 0~5)** 로 정의했다.
- 모든 규칙 해석은 **`app-factory-constitution` v4**를 최상위 전제로 하며, 충돌 시 **헌법 v4를 우선**하는 원칙을 명문화했다.
- 실행·디버깅은 **에뮬레이터 → ADB → 화면 캡처·로그** 순으로 우선 사용하고, **물리 디바이스** 사용은 **예외**로 취급하기로 했다.
- AI 문서는 **`docs/ai/ssw`**, **`docs/ai/rule`**, **`docs/ai/checkpoint`** 세 가지 **직속** 폴더만 사용한다. **`docs/ai/ssw/cursor/`** 는 Global reporting rule에 따른 **Cursor 리포트 전용**으로만 추가 하위를 허용한다.
- 세션 시작 시 AI의 **읽기 순서**를 **`ai_rules_neo` → `neo_session_checkpoint` → 최신 SSW → `[SESSION CORE]`** 로 고정하고, **세션 시작 컨텍스트 템플릿**과 함께 사용하는 것으로 합의했다.
- **`ai_rules_neo.md`는 잠긴 규칙 파일**로 취급하며, **일반 개발 세션에서는 수정하지 않고**, **규칙·헌법 변경 전용 세션**에서만 변경 가능하다는 잠금 규칙을 명시했다.
- Global reporting rule에 **파일명 패턴**, **리포트 후 커밋·푸시**, **result 블록 수령** 규칙을 명문화했다.
- 위 변경 사항은 **`main`** 브랜치 커밋 **`eb873d4`** (`chore: define locked ai rules neo`)로 기록되었으며, **`origin/main`**에 푸시 완료되었다. (후속 커밋은 `git log`로 확인.)

---

## 다음 세션 예고 — 네오(로컬 OS 에이전트) 1차 출범 (문서·규칙만)

**범위:** 네오를 실제로 부트스트랩/실행하지 않고, **역할 정의 · SESSION CORE v2 초안 · 워크오더 템플릿 · 결과 리포트 규격**만 문서/규칙 레벨에서 설계한다.

1. **네오 1차 역할 정의:** git·파일·빌드·실행·ADB·캡처·로컬 OS 전담 vs 헐크·대표님(전략·워크오더·리포트 리뷰).
2. **SESSION CORE v2 설계:** v1 기반으로 네오 전용 필드(에뮬·ADB 타겟·패키지/모듈 등)와 공통 필드 구분.
3. **워크오더 템플릿:** 헐크→네오 공용 1종; 입력 SESSION CORE + task summary; 출력 코드/OS 작업 + git push + 블로그형 리포트 경로; 실패/예외 시 보고 방식.
4. **네오 결과 리포트 규격:** 경로/파일명 패턴, 섹션(OS 로그, adb/에뮬, 캡처, 실패 등) — 헐크가 다음 워크오더만으로 진행 가능하도록.

상세 bullet은 `docs/ai/ssw/2026-04-21_app_factory_ready_to_context.txt` 하단 **다음 세션 목표**를 참고한다.
