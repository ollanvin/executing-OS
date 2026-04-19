# MyPhoneCheck — Executor notes

- **Purpose:** Onboarding target for native Android factory runs (`projects/MyPhoneCheck/config.json`).
- **Strategy:** [Project scaffolding](../strategy/STRATEGY-PROJECT-SCAFFOLDING.md) · [Executor OS](../local-executor-os.md)
- **Local path:** `prefer_local_path` should point at the MyPhoneCheck Gradle repo root (sibling `../myphonecheck` from repo root).
- **KR smoke spec (shared Cursor/Neo):** [MYPHONECHECK-KR-SMOKE-SPEC.md](MYPHONECHECK-KR-SMOKE-SPEC.md)
- **Next round:** Run `payloads/myphonecheck_kr.json` after `ANDROID_HOME` is set and test/Paparazzi flags match the app module layout.
