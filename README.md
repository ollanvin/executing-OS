# executing-OS (Executor OS)

Windows-first **Executor OS** factory pipeline: payloads → queue/workers → build/test/screenshot/gate reports.

- **Entrypoints:** `python local_pipeline.py payloads\…` · `python executor.py enqueue-batch` · `python executor.py worker`
- **Docs:** [`docs/local-executor-os.md`](docs/local-executor-os.md)
- **Factory snapshot tag:** `executor-os-factory-m1`

This repository is aligned with the Cursor **local-agent** tree; after M1, **GitHub `ollanvin/executing-OS` is the canonical copy** for Neo and CI clones.

## Quick start (Windows)

```powershell
cd <clone-root>
$env:ANDROID_HOME = "<Android Sdk>"   # Android payloads only
$env:LOCAL_EXECUTOR_DRY_RUN = "0"
python local_pipeline.py payloads\web_stub_us.json
```

Neo / parity checklist: [`docs/reports/NEO-EQUIVALENCE-PLAN-WEBSTUB-KR-G20.md`](docs/reports/NEO-EQUIVALENCE-PLAN-WEBSTUB-KR-G20.md).

## Windows에서 Neo 런처 쓰기

**`run_neo.bat`** (repo 루트)은 더블클릭용 **Neo 런처**입니다.

- **콘솔:** `color 0B` + **`NEO EXECUTOR OS LAUNCHER`** 배너.
- **환경:** `LOCAL_EXECUTOR_DRY_RUN=0`, `ANDROID_HOME`, `JAVA_HOME` (배치 파일 안 경로를 본인 PC에 맞게 수정).
- **메뉴:**
  - **`[1]`** M1 WebStub US · **`[2]`** M1 Fooapp KR · **`[3]`** M1 G20 batch · **`[4]`** M2 MyPhoneCheck KR
  - **`[0]`** 시나리오 없이 **환경만 잡힌 CMD** (`cmd /k`)
  - **`[Q]`** 종료

바탕화면/작업 표시줄에는 **`Neo - Executor OS`** 바로가기를 만들고, 아이콘을 **`assets\icons\neo_rocket.ico`** 로 지정하는 것을 권장합니다. 자세한 절차: [`docs/windows/NEO-SHORTCUT-SETUP.md`](docs/windows/NEO-SHORTCUT-SETUP.md).

### 우주선 아이콘 · 런처 모양 (문서용)

![Neo rocket launcher icon](docs/assets/images/neo_launcher_rocket.png)

*위 이미지는 레포에 포함된 로켓 마크(`neo_rocket.ico`와 동일 디자인)입니다. 실제 바로가기는 Windows에서 `.ico`를 적용합니다.*
