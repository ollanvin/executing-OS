# Neo 바로가기(.lnk) 복구 — Executor OS (Windows)

**대상 경로:** `C:\Users\user\Dev\ollanvin\executing-OS`  
**런처 배치:** `run_neo.bat` (루트) — 배너 + 시나리오 메뉴 `[0]`~`[4]` + `[Q]`  
**우주선 아이콘:** `assets\icons\neo_rocket.ico`

## 1. 고장 난 Neo 바로가기 제거

1. 바탕화면(또는 고정해 둔 위치)에서 기존 **Neo / Executor OS** 관련 아이콘을 찾습니다.
2. 아이콘 **우클릭** → **삭제** (휴지통 비우기는 선택).

> “대상이 없습니다” 오류는 대상 `.bat` 경로가 바뀌었거나 파일이 없을 때 납니다. 삭제 후 아래로 새로 만듭니다.

## 2. 새 바탕화면 바로가기 만들기

1. 바탕화면 **빈 곳** 우클릭 → **새로 만들기** → **바로 가기**.
2. **항목 위치**에 다음을 **그대로** 입력합니다 (따옴표 포함):

   ```text
   "C:\Users\user\Dev\ollanvin\executing-OS\run_neo.bat"
   ```

3. **다음** → 이름: **`Neo - Executor OS`** → **마침**.

## 3. 바로가기 속성 점검 (대상 / 시작 위치 / 우주선 아이콘)

1. 새 바로가기 **우클릭** → **속성**.
2. **대상** (정확히):

   ```text
   "C:\Users\user\Dev\ollanvin\executing-OS\run_neo.bat"
   ```

3. **시작 위치**:

   ```text
   C:\Users\user\Dev\ollanvin\executing-OS
   ```

4. **아이콘 변경**
   - **아이콘 변경(C)…** → **찾아보기…**
   - 레포의 **`C:\Users\user\Dev\ollanvin\executing-OS\assets\icons\neo_rocket.ico`** 선택 → 확인.
   - 저장 후 바로가기에 **우주선(로켓)** 아이콘이 보이면 성공입니다.

### 관리자 권한 (필요할 때만)

1. 바로가기 **속성** → **고급**.
2. **관리자 권한으로 실행** 체크 → 확인.

## 4. 작업 표시줄 / 시작 — 우주선 바로가기만 고정

1. 바탕화면의 **`Neo - Executor OS`** (우주선 아이콘) 바로가기를 **우클릭** → **작업 표시줄에 고정** 또는 **시작에 고정**.
2. **검은 CMD 아이콘**이나 **톱니바퀴(기본 앱)** 로 고정된 예전 항목은 **우클릭** → **작업 표시줄에서 제거** / **시작에서 제거** — **우주선 하나만** 남기는 것을 권장합니다.

> 작업 표시줄에 `run_neo.bat` 파일을 **직접** 끌어다 놓으면 아이콘이 기본 배치 아이콘으로 보일 수 있습니다. **`.lnk` 바로가기**를 만든 뒤 아이콘을 `neo_rocket.ico`로 바꾸고 고정하세요.

## 5. 더블클릭 시 동작 (Neo 런처 UX)

1. 콘솔에 **`NEO EXECUTOR OS LAUNCHER`** 배너와 메뉴가 표시됩니다.
2. **`[1]`~`[4]`**: 해당 시나리오의 `python` 명령이 실행되고, 끝나면 **일시 정지** 후 메뉴로 돌아갑니다.
3. **`[0]`**: 메뉴 없이 **환경 변수가 이미 설정된 CMD**가 열립니다 (`exit`로 닫기).
4. **`[Q]`**: 런처를 종료합니다.

환경 변수는 배치 상단과 동일합니다: `LOCAL_EXECUTOR_DRY_RUN=0`, `ANDROID_HOME`, `JAVA_HOME` (필요 시 `run_neo.bat`에서 수정).

## 6. 동작 확인 체크리스트

- [ ] 우주선 바로가기 **더블클릭** → 배너 + 메뉴 표시.
- [ ] `[1]` → WebStub US 파이프라인이 실행된다.
- [ ] `[0]` → 일반 CMD 프롬프트에서 `echo %ANDROID_HOME%` 가 기대 경로다.
- [ ] 오류 시: `run_neo.bat`를 탐색기에서 직접 실행해 메시지를 확인하고, Python PATH / SDK 경로를 점검한다.

## 7. 기존 깨진 바로가기 · 아이콘 정리

바탕화면, 작업 표시줄, 시작 메뉴에 남아 있는 아래는 **제거(삭제 / 고정 해제)** 하고, **`Neo - Executor OS` 우주선 `.lnk` 하나**만 쓰는 것이 좋습니다.

| 증상 | 조치 |
|------|------|
| 검은 **CMD** 아이콘만 있고 대상이 옛 경로 | 바로가기 삭제 후 §2~§3으로 재생성 |
| **톱니바퀴** / 알 수 없는 기본 아이콘 | `.exe`가 아닌 `.bat` 직접 고정이면 생길 수 있음 → `.lnk` + `neo_rocket.ico` 로 교체 |
| 작업 표시줄에 같은 Neo가 여러 개 | 사용하지 않는 항목 **작업 표시줄에서 제거** |

## 8. 관련 문서

- 우주선 일러스트(문서용): [`../assets/images/neo_launcher_rocket.png`](../assets/images/neo_launcher_rocket.png)
- Executor OS 개요: [`../local-executor-os.md`](../local-executor-os.md)
- Neo 동등성(M1): [`../reports/NEO-EQUIVALENCE-PLAN-WEBSTUB-KR-G20.md`](../reports/NEO-EQUIVALENCE-PLAN-WEBSTUB-KR-G20.md)
