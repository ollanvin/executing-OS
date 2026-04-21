# ai_rules_neo — executing-OS 핵심 AI 규칙

## 0. 헤더 및 잠금(locked) 선언

이 파일은 **ollanvin executing-OS**(`github.com/ollanvin/executing-OS`) 저장소용 **핵심 AI 규칙(core AI rules)** 문서이다.

- 본 파일은 **잠금 규칙 파일(locked rules file)** 이다.
- 일반 개발 세션(사람·AI 도구 모두)에서는 **읽기 전용**으로 취급한다.
- 내용 수정은 **전용 “rules / constitution 변경” 세션**에서만 수행한다.

---

## 1. Constitution v4를 최상위 전제로

- 이 파일의 모든 규칙은 **`app-factory-constitution`(Constitution v4)** 에 종속된다.
- 충돌이 있으면 **Constitution v4가 우선**한다.
- 여기서 다루지 않은 사항은 **헌법 저장소(`github.com/ollanvin/app-factory-constitution`)** 를 따른다.
- 본 파일 변경은 **헌법 저장소에서 관련 변경이 반영·합의된 뒤**, 전용 세션에서만 허용한다.
- 변경 사항은 **`docs/ai/checkpoint/`** 아래에 기록한다(예: `neo_session_checkpoint.md`).

---

## 2. 실행·디버깅 우선순위 (에뮬레이터 / ADB / 캡처)

앱 실행·디버깅·시연의 **기본 경로**는 다음 순서이다.

1. **에뮬레이터(Emulator)**
2. **ADB**
3. **화면 캡처·녹화·로그(Screen capture / recording / logs)**

- **실물 단말**과 **수동 조작**은 예외적이며 기본이 아니다.
- AI 에이전트(Cursor 등)는 워크플로를 제안할 때 **에뮬레이터 + ADB + 캡처 도구가 준비되어 있다**고 가정한다.
- 실물 단말을 예외로 쓰는 경우에는 **사유를 명확히 밝히고**, 해당 세션의 **SSW**에 기록한다.

---

## 3. 문서·아카이브 운영 규칙

- AI 관련 문서는 **`docs/ai`** 아래에 두며, **`docs/ai` 직속 하위는 고정된 세 폴더만** 사용한다.
  - `docs/ai/ssw`
  - `docs/ai/rule`
  - `docs/ai/checkpoint`
- **`docs/ai` 직속에 네 번째 폴더를 새로 만들지 않는다.**
- `docs/ai/ssw` 안에서는 **Global reporting rule(§3 하단)** 에 따라 **`cursor/`** 하위만 Cursor 블로그형 리포트용으로 사용한다. 그 외 **`ssw` 아래 임의의 새 하위 폴더를 만들지 않는다.**
- 플래그 **`create_new_archive_files_freely: off`** 에 따라, 에이전트는 **임의의 새 아카이브 파일을 남발하지 않는다.**
- **`docs/ai`** 아래의 **고정 경로·패턴**만 사용한다.

역할 구분:

| 구분 | 역할 |
|------|------|
| **`ai_rules_neo.md` (rule)** | 수명이 길고 변경은 드물며, 안정적인 규칙을 정의한다. |
| **checkpoint** | 세션 경계에서의 상태·규칙 변경·주요 결정 스냅샷. |
| **ssw** | 세션별 작업 로그·맥락(per-session working logs / context). |

### Global reporting rule (블로그형 개발일지)

작업이 끝나면 에이전트는 **`docs/ai/ssw/cursor/`** 아래, 아래 **파일명 패턴**으로 **블로그 스타일** 개발일지 리포트를 남긴다.

- **파일명 패턴:** `YYYY-MM-DD_session-<nn>_cursor-<slug>_report.md`
  - 예: `2026-04-21_session-02_cursor-ready-to-context-v1_report.md`
  - `<slug>`는 짧은 영문·하이픈(주제 식별용).

**Constraints**

- 리포트는 “블로그·개발일지”처럼 읽기 좋아야 한다.
- 헐크/대표님이 내용을 그대로 복사해 블로그나 문서에 옮겨도 될 정도의 품질을 목표로 한다.
- 작업이 아주 사소하더라도, 최소 3~4개 섹션 정도는 채워서 남긴다.
- 리포트 파일을 작성한 뒤에는, 관련 변경 사항(리포트 및 코드·문서)을 항상 커밋하고 `origin/main`까지 푸시한다.
- 작업 **Result**(요약·수령 포인터·경로 목록 등)는 채팅에 동일 본문을 길게 반복하지 않고, **해당 세션 Cursor 리포트**에 `result` 언어 태그를 쓴 fenced 코드 블록으로만 수령한다.

---

## 4. 세션 시작 시 AI 읽기 순서

새 AI 세션을 시작할 때 에이전트는 아래 순서로 문서를 읽는다.

1. **`docs/ai/rule/ai_rules_neo.md`** (본 파일)
2. **`docs/ai/checkpoint/neo_session_checkpoint.md`** (최신 체크포인트; 여기에 **latest SSW 경로**가 있으면 그것을 우선)
3. **`docs/ai/ssw/`** 아래 **checkpoint가 가리키는 최신 SSW 파일**(또는 합의된 날짜·주제의 SSW; 예: `2026-04-21_app_factory_ready_to_context.txt`)
4. 운영자가 채팅에 붙여 넣는 **`[SESSION CORE]` 블록**(프로젝트 메타, 플래그, 이번 세션 목표, 고정 경로 포인터 등) — 저장소 밖에서 오는 **이번 세션의 공식 맥락**이다. 1~3과 표면상 모순될 때는 **헌법 v4**와 본 파일의 **비가역 제약**(예: 잠금 규칙 파일 정책)은 유지하고, 그 외 **세션 범위·목표·한정 규율**은 **SESSION CORE**를 우선한다.

운영자는 세션 시작 시 위 4번에 해당하는 **세션 시작 context 템플릿**을 제공하는 것을 권장한다. 에이전트는 이를 **해당 턴의 공식 세션 맥락**으로 취급한다.

---

## 5. 잠금 규칙(no-edit 정책)

- **`ai_rules_neo.md`는 잠금(locked) 파일**이다.
- 일반 개발·리팩터·디버깅 세션에서는 **이 파일을 수정하지 않는다.**
- AI 에이전트는 **임의로 이 파일을 편집·삭제·이동하라는 요청을 거절**한다.
- 변경이 허용되는 경우는 오직 다음을 모두 만족할 때이다.
  - Constitution v4(또는 그 이후)가 **헌법 저장소에서 갱신·논의**되었다.
  - **전용 “rules / constitution” 세션**이 시작되었고, **SSW와 checkpoint에 명시**되었다.
  - 변경 내용과 근거가 **`docs/ai/checkpoint/`** 에 기록되었다.

---

### 헐크 워크오더 메타 규칙

- 헐크가 제안하는 모든 워크오더는, **코드·문서 변경 → 커밋 → `origin/main` 푸시 → 결과 리포트 작성**까지를 포함해야 **완료**된 것으로 본다.
- 사람(대표님)에게 터미널 명령이나 수동 git 조작을 요구하지 않고, 코드 워커(Cursor·로컬 OS 에이전트)가 전 과정을 책임지는 것을 원칙으로 한다.
- 헐크와 대표님은 워크오더와 Cursor 리포트를 기준으로 전략·목표·피드백을 설계하고, **실제 조작은 항상 코드 워커가 수행**한다.
