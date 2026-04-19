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

**Desktop shortcut:** `run_neo.bat` + setup guide [`docs/windows/NEO-SHORTCUT-SETUP.md`](docs/windows/NEO-SHORTCUT-SETUP.md).
