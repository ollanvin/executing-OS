# 오늘 작업 리포트 - 2026-04-21 / ai-rules-neo

## 1. 오늘 내가 받은 미션

App Factory 로컬 실행 OS인 **executing-OS**에서, AI가 매 세션마다 같은 전제를 공유하도록 **문서 층위의 룰**을 한 번에 고정해 달라는 요청이 들어왔다. 헌법은 이미 `app-factory-constitution` 쪽에 있으니, 이 레포 안에서는 **“어떻게 읽고, 어디까지 손대지 말 것인가”**를 `docs/ai` 아래에 명시하는 게 목표였다.

그래서 먼저 **`ai_rules_neo.md`**를 잠긴 규칙 파일로 두고, 그 결정을 **체크포인트**에 남긴 뒤, 필요하면 세션 리포트로 흔적을 남기는 흐름까지 연결했다. 오늘의 큰 그림은 “규칙은 헌법 아래, 문서는 정해진 폴더만, 세션 경계는 checkpoint와 SSW로” 정리하는 것이었다.

## 2. 작업 환경과 컨텍스트

- **프로젝트:** executing-OS (`github.com/ollanvin/executing-OS`)
- **브랜치:** `main` (`origin/main`과 동기화 후 작업)
- **헌법 전제:** `app-factory-constitution` v4 우선 (`constitution_v4_first`)
- **참조·갱신한 주요 경로:**
  - `docs/ai/rule/ai_rules_neo.md` — 핵심 AI 규칙(섹션 0~5, locked)
  - `docs/ai/checkpoint/neo_session_checkpoint.md` — 2026-04-21 세션 요약 반영
  - `docs/ai/ssw/cursor/` — Cursor 세션 리포트(체크포인트용·본 블로그 리포트)
  - (참고) 동일 날짜 SSW는 `.txt` 명으로도 존재할 수 있음 — 세션 코어에서 `.md`를 가리켰을 때와의 차이는 리포트에 메모해 둠

## 3. 내가 실제로 한 일

1. **규칙 파일을 “한 판”으로 고정**  
   `ai_rules_neo.md`에 헤더·잠금 선언, 헌법 v4 우선, 에뮬→ADB→캡처 우선순위, `docs/ai` 세 폴더만 사용, 세션 시작 읽기 순서(rules → checkpoint → 최신 SSW), no-edit 잠금 정책을 **섹션 0~5**로 나눠 적었다. 이렇게 해야 나중에 AI에게 “이 파일만 먼저 읽어라”고 말했을 때 빠지는 구멍이 줄어든다.

2. **체크포인트에 오늘의 결정을 한 덩어리로 기록**  
   규칙 파일이 생긴 사실과, 그게 어떤 커밋(`eb873d4`)에서 들어갔는지, 원칙 요약을 `neo_session_checkpoint.md`에 **2026-04-21 섹션**으로 묶었다. “규칙은 레포에 있고, 그날의 합의는 checkpoint에 있다”는 구조가 한 번에 보이게 하려는 의도다.

3. **세션 리포트(기술 템플릿)와 인코딩 정리**  
   체크포인트 작업 직후, Cursor용 요약 리포트를 `docs/ai/ssw/cursor/`에 두었는데, Windows 셸에서 한 번 UTF-8이 깨지는 사고가 있어서 **파일을 UTF-8로 다시 저장**하고, 후속 커밋으로 메타를 보강했다. 작은 일이지만, 한글 문서는 인코딩이 곧 가독성이라 여기까지 포함해 정리했다.

4. **(지금) 블로그 스타일 개발일지 작성**  
   위 과정을 사람이 읽기 좋은 **한 편의 글**로 재구성해, 대표님이 그대로 옮겨도 될 정도의 톤으로 남긴다. 파일명은 팀이 정한 패턴을 따른다:

   ```
   YYYY-MM-DD_session-XX_cursor-<task-key>_report.md
   ```

## 4. 변경된 코드/파일 요약

| 파일 | 한 줄 요약 |
|------|------------|
| `docs/ai/rule/ai_rules_neo.md` | executing-OS AI의 장기 규칙(locked), 헌법·에뮬 우선·문서 폴더·읽기 순서·no-edit |
| `docs/ai/checkpoint/neo_session_checkpoint.md` | 2026-04-21에 위 규칙이 확정된 사실과 원칙·참조 커밋 요약 |
| `docs/ai/ssw/cursor/2026-04-21_session-01_cursor-ai-rules-neo-checkpoint_report.md` | 체크포인트 작업용 Cursor 결과 리포트(템플릿) |
| `docs/ai/ssw/cursor/2026-04-21_session-01_cursor-ai-rules-neo_report.md` | **본 문서** — 블로그형 개발일지 |

`src/` 이하 애플리케이션 코드는 **손대지 않았다.** 오늘은 문서·메타데이터 레이어만.

## 5. 결과와 영향도

- **가능해진 것:** AI 세션이 열릴 때마다 “헌법 → 이 레포 규칙 → checkpoint → SSW” 순서를 **문서로 강제**할 수 있게 되었다. 잠긴 `ai_rules_neo.md` 덕분에 일반 개발 세션에서 규칙 파일이 흔들리는 일도 줄일 수 있다.
- **해결한 문제:** “규칙은 어디 있고, 오늘 무엇을 합의했는지”가 **한 레포 안에서 추적**된다. 컨트롤 플레인이 아니라 **Git과 `docs/ai`**에 남는다는 점이 executing-OS 관점에서는 중요하다.
- **리스크·후속 점검:**  
  - `docs/ai/ssw/cursor/` 아래 파일이 늘어나면 **어떤 건 블로그형, 어떤 건 체크리스트형**인지 구분이 필요할 수 있다. 네이밍 패턴(`_checkpoint_report` vs `_report`)을 팀에서 한 번 더 고정하면 좋다.  
  - SSW 파일이 `.md`가 아니라 `.txt`로만 있을 때, 세션 시작 템플릿의 파일명과 실제 저장소가 어긋나지 않게 맞추는 게 좋다.

## 6. 다음에 하면 좋은 일 (Next steps)

- **헌법 저장소와의 링크를 checkpoint에 한 줄 더:** `app-factory-constitution`의 특정 태그·커밋을 “이 레포 규칙이 전제로 삼는 헌법 리비전”으로 박아 두면, 나중에 감사하기 쉽다.
- **세션 시작 템플릿을 실제로 하나 박제:** 사람이 매번 붙여 넣는 대신 `docs/ai/ssw/`에 예시를 두되, **새 파일을 남발하지 않는** 선에서 짧은 템플릿만 유지하는 방안 검토.
- **실행 코드와의 연결(다음 코딩 세션):** `hex-executor-console-backend` 등에서 constitution을 읽는 경로가 `NEO_CONSTITUTION_ROOT`와 잘 맞는지, 스모크 스크립트와 문서 서술이 **같은 말**을 하는지 점검하면 좋다.

---

*이 리포트는 `docs/ai` 전역 규칙에 따라 `docs/ai/ssw/cursor/`에 보관한다.*
