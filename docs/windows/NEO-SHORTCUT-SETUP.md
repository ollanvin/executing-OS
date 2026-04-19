# Neo 바로가기(.lnk) 복구 — Executor OS (Windows)

**대상 경로:** `C:\Users\user\Dev\ollanvin\executing-OS`  
**실행 스크립트:** `run_neo.bat` (루트)

## 1. 고장 난 Neo 바로가기 제거

1. 바탕화면(또는 고정해 둔 위치)에서 기존 **Neo / Executor OS** 관련 아이콘을 찾습니다.
2. 아이콘 **우클릭** → **삭제** (휴지통 비우기는 선택).

> “대상이 없습니다” 오류가 나는 바로가기는 대상 `.bat` 경로가 바뀌었거나 파일이 없을 때 흔합니다. 삭제 후 아래 절차로 새로 만듭니다.

## 2. 새 바탕화면 바로가기 만들기

1. 바탕화면 **빈 곳** 우클릭 → **새로 만들기** → **바로 가기**.
2. **항목 위치**에 다음을 **그대로** 입력합니다 (따옴표 포함 권장):

   ```text
   "C:\Users\user\Dev\ollanvin\executing-OS\run_neo.bat"
   ```

3. **다음** → 이름 예: `Neo - Executor OS` → **마침**.

## 3. 바로가기 속성 점검

1. 새 바로가기 **우클릭** → **속성**.
2. 확인할 항목:
   - **대상:** `"C:\Users\user\Dev\ollanvin\executing-OS\run_neo.bat"`
   - **시작 위치:** `C:\Users\user\Dev\ollanvin\executing-OS`
3. 레포를 다른 드라이브/폴더로 옮겼다면 위 두 값을 **실제 경로**에 맞게 수정합니다.

### 관리자 권한 (필요할 때만)

ADB/특정 도구가 관리자 권한을 요구하면:

1. 바로가기 **속성** → **고급**.
2. **관리자 권한으로 실행** 체크 → 확인.

일반적인 `local_pipeline.py` / `executor.py` 개발 실행에는 보통 필요 없습니다.

## 4. 작업 표시줄 / 시작 메뉴에 고정

- 바탕화면의 **`Neo - Executor OS`** 바로가기를 **우클릭** → **작업 표시줄에 고정**  
  또는 **시작 화면에 고정** (Windows 11 표기는 버전에 따라 “시작에 고정” 등).

> 작업 표시줄에 **직접** `run_neo.bat`를 끌어다 놓으면 동작은 할 수 있으나, **시작 위치**가 달라질 수 있습니다. **바로가기(.lnk)**를 만든 뒤 고정하는 방식을 권장합니다.

## 5. `run_neo.bat` 안에서 바꿀 수 있는 것

- **`ANDROID_HOME` / `JAVA_HOME`:** 본인 PC SDK·JDK 경로에 맞게 수정.
- **기본 동작:** 현재는 더블클릭 시 **환경 변수가 설정된 CMD**가 열리고, 예시 명령이 출력됩니다.  
  한 번에 특정 파이프라인만 돌리려면 배치 파일 안의 주석(`:run_default`)을 참고해 `python local_pipeline.py ...` 등으로 바꿉니다.

## 6. 동작 확인 체크리스트

- [ ] 바로가기를 **더블클릭**했을 때 **콘솔 창**이 뜬다.
- [ ] 창 제목 또는 출력에 `Executor OS` / 현재 폴더가 보인다.
- [ ] 같은 창에서 `python local_pipeline.py payloads\web_stub_us.json` 등을 입력해 실행할 수 있다.
- [ ] 오류가 나면:
  - `run_neo.bat`를 탐색기에서 **직접 더블클릭**해 메시지를 확인한다.
  - **대상 경로**, `ANDROID_HOME`, `JAVA_HOME`, Python이 PATH에 있는지 점검한다.

## 7. 관련 문서

- Executor OS 개요: [`../local-executor-os.md`](../local-executor-os.md)
- Neo 동등성(M1): [`../reports/NEO-EQUIVALENCE-PLAN-WEBSTUB-KR-G20.md`](../reports/NEO-EQUIVALENCE-PLAN-WEBSTUB-KR-G20.md)
