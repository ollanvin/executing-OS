# local-agent



Windows용 로컬 에이전트(TaskSpec → gradle/adb 자동화)와 **Local Agent Bot**(브라우저 채팅 UI)이 포함되어 있습니다.



## 요구 사항



- Python 3.10+

- PowerShell, Android SDK `adb`(경로에 있을 것)

- MyPhoneCheck 등 `config.json`의 `projects`에 등록된 리포지토리



## 설정



`config.json`에서 `rootDir`, `tasksDir`, `artifactsDir`, `scriptsDir`, `projects`를 확인합니다.



## 로컬 에이전트(폴링) 실행



프로젝트 루트(`local-agent`)에서:



```powershell

python agent\main.py

```



`tasks\tasks.json`의 `RUN_PENDING` 작업을 처리합니다.



## CLI (`tasks.json` 직접 편집 없이 큐에 넣기)



```powershell

python agent\cli.py enqueue myphonecheck_build_test

python agent\cli.py list --limit 10

python agent\cli.py show-last-build-prompt

```



## Local Agent Bot (웹 채팅)



브라우저에서 자연어(규칙 기반)로 큐 넣기·목록·실패 프롬프트 조회·마지막 실패 재시도를 할 수 있습니다.



### 실행



```powershell

python agent\bot_server.py

```



브라우저에서 **http://127.0.0.1:7860/** 로 접속합니다.



### HTTP API



| Method | Path | 설명 |

|--------|------|------|

| GET | `/api/health` | 서버 상태 |

| GET | `/api/tasks?limit=10` | 최근 작업 목록 |

| GET | `/api/last-build-prompt` | 마지막 FAILED + `buildPromptPath` 내용 |

| POST | `/api/chat` | JSON `{"message":"..."}` — 의도에 따라 enqueue / list / 프롬프트 / retry |



### 채팅 예시 (한국어)



- 「마이폰첵 빌드 돌려」「빌드 돌려」「build」→ MyPhoneCheck 빌드 큐 (`enqueue`)

- 「최근 작업 보여줘」「상태 보여줘」→ 최근 작업 목록

- 「마지막 실패 원인 보여줘」「build prompt」→ `build_fix_prompt.txt` 내용

- 「다시 실행」「retry last failed」→ 가장 최근 FAILED 작업 복제 후 `RUN_PENDING`



에이전트 폴링(`python agent\main.py`)이 같이 돌아가 있어야 큐에 넣은 작업이 실행됩니다.



---



## NeO (바탕화면 런처)



**최초 진입점은 브라우저 URL이 아니라 바탕화면의 NeO 아이콘**을 권장합니다. **NeO** 바로가기를 더블클릭하면 **Local Agent Engine (`main.py`)** + **Bot Server (`bot_server.py`)** + **브라우저 UI (`http://127.0.0.1:7860/`)** 가 함께 올라갑니다.



### 아이콘 재생성



```powershell

cd C:\Users\user\Dev\local-agent

powershell -ExecutionPolicy Bypass -File .\scripts\generate-perpy-ico.ps1

```



성공 시 `assets\neo.ico` 절대 경로가 한 줄 출력됩니다. 기본 설치 경로면 `C:\Users\user\Dev\local-agent\assets\neo.ico` 입니다.



### 바탕화면 바로가기 생성



```powershell

cd C:\Users\user\Dev\local-agent

powershell -ExecutionPolicy Bypass -File .\scripts\create-desktop-shortcut.ps1

```



생성된 **NeO.lnk** 전체 경로가 한 줄 출력됩니다. 대상: `scripts\start-perpy.bat`, 아이콘: `assets\neo.ico`(실행 시마다 재생성), 작업 폴더: 저장소 루트. 예전 **Perpy.lnk**는 스크립트가 있으면 삭제합니다.

아이콘이 옛 이미지로 남으면 **NeO.lnk를 삭제한 뒤** 위 스크립트를 다시 실행하세요. 작업 표시줄에는 실행 중인 `cmd` 창이 아니라 **바로가기 파일**을 끌어다 고정해야 우주선 아이콘이 유지됩니다.



### Bot만 바로가기 생성



```powershell

powershell -ExecutionPolicy Bypass -File .\scripts\create-desktop-shortcut.ps1 -BotOnly

```



대상이 `scripts\start-bot.bat`으로 바뀝니다. Engine은 별도로 `start-agent.bat` 등을 실행해야 합니다.



### 배치 파일 직접 실행



```powershell

cd C:\Users\user\Dev\local-agent

.\scripts\start-perpy.bat

.\scripts\start-bot.bat

.\scripts\start-agent.bat

```



- **`start-perpy.bat`**: 새 창에서 Engine → 약 2초 대기 → 기본 브라우저로 `http://127.0.0.1:7860/` → 현재 창에서 Bot Server.

- **`start-bot.bat`**: 약 2초 대기 → 동일 URL → Bot Server만.

- **`start-agent.bat`**: Engine만.



`C:\Users\user\Dev\local-agent\config.json`이 있으면 배치는 그 경로로 이동하고, 없으면 `scripts` 기준 상위 폴더(`%~dp0..`)를 루트로 씁니다.



### 자산



- `assets\perpy.svg` — 벡터 마스터(Hex Ring Station 우주 정거장 아이콘, 선명한 퍼플 액센트)

- `assets\neo.ico` — Windows 바로가기용(16~256 다중 PNG 임베드 `.ico`, 스크립트로 재생성)


