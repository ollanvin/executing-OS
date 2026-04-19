@echo off
setlocal EnableExtensions
cd /d "%~dp0"

rem ---- Neo / Executor OS launcher (rocket shortcut target) ----
rem 끝 동작: 시나리오 실행 후 pause → 메뉴로 복귀. [0]은 환경 잡힌 CMD 유지(cmd /k).
rem 시나리오만 돌리고 창을 닫으려면 해당 :run_* 블록 끝의 pause/goto :menu 대신 exit /b 0 로 바꿉니다.

set LOCAL_EXECUTOR_DRY_RUN=0
set "ANDROID_HOME=C:\Users\user\AppData\Local\Android\Sdk"
set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"

title Neo - Executor OS
color 0B
cls

:banner
echo.
echo   ============================================================
echo            NEO EXECUTOR OS LAUNCHER
echo   ============================================================
echo.
echo   Workspace: %CD%
echo   ANDROID_HOME=%ANDROID_HOME%
echo   JAVA_HOME=%JAVA_HOME%
echo.
echo   [1] M1 - WebStub US          (local_pipeline)
echo   [2] M1 - Fooapp KR           (local_pipeline, needs myphonecheck sibling)
echo   [3] M1 - G20 batch           (enqueue-batch + worker x2)
echo   [4] M2 - MyPhoneCheck KR     (local_pipeline)
echo   [0] Shell only               (skip menu / interactive CMD, env preset)
echo   [Q] Quit
echo.
echo   ------------------------------------------------------------

:pick
choice /c 01234Q /n /m "   Select [0-4] or Q: "
rem NOTE: if errorlevel means >= — 반드시 큰 값(Q=6)부터 검사
if errorlevel 6 goto :quit
if errorlevel 5 goto :run_m2_myphone
if errorlevel 4 goto :run_m1_g20
if errorlevel 3 goto :run_m1_fooapp
if errorlevel 2 goto :run_m1_webstub
if errorlevel 1 goto :shell_only
goto :pick

:shell_only
echo.
echo   [Neo] Opening shell with env preset. Type exit to close.
echo.
cmd /k
goto :eof

:run_m1_webstub
echo.
echo   [1] WebStub US ...
python local_pipeline.py payloads\web_stub_us.json
goto :after_run

:run_m1_fooapp
echo.
echo   [2] Fooapp KR ...
python local_pipeline.py payloads\fooapp_sample_kr.json
goto :after_run

:run_m1_g20
echo.
echo   [3] G20 batch (fresh queue DB) ...
if exist "runs\neo_launcher_g20.db" del /f /q "runs\neo_launcher_g20.db"
python executor.py enqueue-batch --payload payloads\g20_batch_webstub_5.json --queue-db runs\neo_launcher_g20.db
if errorlevel 1 (
  echo   [Neo] enqueue-batch failed.
  goto :after_run
)
python executor.py worker --count 2 --queue-db runs\neo_launcher_g20.db
goto :after_run

:run_m2_myphone
echo.
echo   [4] MyPhoneCheck KR ...
python local_pipeline.py payloads\myphonecheck_kr.json
goto :after_run

:after_run
echo.
echo   ------------------------------------------------------------
pause
cls
goto :banner

:quit
echo.
echo   Bye.
exit /b 0
