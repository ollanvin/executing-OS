# neo_session_checkpoint — executing-OS AI 세션 체크포인트

이 파일은 `docs/ai/rule/ai_rules_neo.md`에 정의된 절차에 따라, 규칙·헌법 관련 **주요 결정과 세션 경계**를 요약해 둔다.

## SESSION CORE (canonical pointer)

세션 시작 시 운영자·에이전트가 동일한 경로를 참조하도록, 아래 한 줄을 기준으로 한다.

- 최신 SSW(latest_ssw_path): `docs/ai/ssw/2026-04-21_app_factory_ready_to_context.txt`

---

## 2026-04-21 세션 요약 (ai_rules_neo 잠금)

- `docs/ai/rule/ai_rules_neo.md`를 **신규 작성**하여, executing-OS 저장소에서 사용할 **핵심 AI 규칙**을 **고정 구조(섹션 0~5)** 로 정의했다.
- 모든 규칙 해석은 **`app-factory-constitution` v4**를 최상위 전제로 하며, 충돌 시 **헌법 v4를 우선**하는 원칙을 명문화했다.
- 실행·디버깅은 **에뮬레이터 → ADB → 화면 캡처·로그** 순으로 우선 사용하고, **물리 디바이스** 사용은 **예외**로 취급하기로 했다.
- AI 문서는 **`docs/ai/ssw`**, **`docs/ai/rule`**, **`docs/ai/checkpoint`** 세 가지 서브폴더만 사용하며, **새 아카이브 파일을 임의로 늘리지 않는다**는 원칙을 확정했다.
- 세션 시작 시 AI의 **읽기 순서**를 **`ai_rules_neo` → `neo_session_checkpoint` → 최신 SSW**로 고정하고, **세션 시작 컨텍스트 템플릿**과 함께 사용하는 것으로 합의했다.
- **`ai_rules_neo.md`는 잠긴 규칙 파일**로 취급하며, **일반 개발 세션에서는 수정하지 않고**, **규칙·헌법 변경 전용 세션**에서만 변경 가능하다는 잠금 규칙을 명시했다.
- 위 변경 사항은 **`main`** 브랜치 커밋 **`eb873d4`** (`chore: define locked ai rules neo`)로 기록되었으며, **`origin/main`**에 푸시 완료되었다.
