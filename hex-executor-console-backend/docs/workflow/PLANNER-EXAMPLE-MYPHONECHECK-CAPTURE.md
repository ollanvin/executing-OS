# 참조 플랜: MyPhoneCheck capture package

**헌법:** [OPERATING-CONSTITUTION.md](../../../../docs/OPERATING-CONSTITUTION.md)

정적 DAG `planMyPhoneCheckCapturePackage()`와 동일한 목표에 대한 **PlannerPlan(JSON)** 예시이다. LLM 프롬프트 few-shot으로도 사용된다 (`src/planner/myphonecheckExamplePlanJson.ts`와 동일 내용).

```json
{
  "goalId": "myphonecheck_capture_package",
  "notes": "Reference: emulator-first target → app → onboarding/module captures → control-plane bundle. See docs/OPERATING-CONSTITUTION.md.",
  "steps": [
    { "id": "s1", "name": "Ensure Android target (emulator-first)", "usesCapability": "ensure_android_device", "params": {} },
    { "id": "s2", "name": "Ensure app installed", "usesCapability": "ensure_app_installed", "params": {} },
    { "id": "s3", "name": "Launch app", "usesCapability": "launch_app", "params": {} },
    { "id": "s4", "name": "Ensure app foreground", "usesCapability": "ensure_app_foreground", "params": {} },
    { "id": "s5", "name": "Capture onboarding sequence", "usesCapability": "capture_onboarding_sequence", "params": {} },
    { "id": "s6", "name": "Navigate to module screens", "usesCapability": "navigate_to_module_screens", "params": {} },
    { "id": "s7", "name": "Capture module sequence", "usesCapability": "capture_module_sequence", "params": {} },
    { "id": "s8", "name": "Build control-plane bundle", "usesCapability": "build_control_plane_bundle", "params": {} }
  ]
}
```

`usesCapability` 값은 반드시 위 목록의 id와 **정확히 일치**해야 한다 (별칭 없음).
