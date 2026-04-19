@echo off
rem Neo / Executor OS launcher — 바로가기 대상으로 사용

cd /d "%~dp0"

set LOCAL_EXECUTOR_DRY_RUN=0

rem 이 PC 기준 경로 (필요 시 수정)
set "ANDROID_HOME=C:\Users\user\AppData\Local\Android\Sdk"
set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"

title Neo - Executor OS
echo.
echo  [Neo] Executor OS  ^|  %CD%
echo  ANDROID_HOME=%ANDROID_HOME%
echo  JAVA_HOME=%JAVA_HOME%
echo.
echo  예시 명령:
echo    python local_pipeline.py payloads\web_stub_us.json
echo    python executor.py enqueue-batch --payload payloads\g20_batch_webstub_5.json
echo    python executor.py worker --count 2
echo.
echo  executor.py 는 서브커맨드^(enqueue-batch / worker / init-project^)가 필요합니다.
echo  더블클릭 시 자동 실행할 명령으로 바꾸려면 이 파일 끝의 cmd /k 를 해당 python 줄로 교체하세요.
echo.

cmd /k
