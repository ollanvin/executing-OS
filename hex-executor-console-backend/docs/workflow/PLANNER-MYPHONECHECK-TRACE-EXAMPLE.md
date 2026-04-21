# MyPhoneCheck capture: 플랜 JSON + trace 예시

## 사용자 오더 (예시)

> 마이폰첵을 캡처해서 컨트롤플레인에게 전달할 파일로 만들어줘

`parseCommand` / AI 분류 후 intent는 `myphonecheck_capture_package`로 고정되고, 실행 시 `action.rawText`가 `PlannerInput.userGoalText`로 전달된다.

## LLM이 반환할 수 있는 PlannerPlan (검증 통과 케이스)

정적 8단계와 순서가 같으면 `planSource: "llm"`으로 채택된다.

```json
{
  "goalId": "myphonecheck_capture_package",
  "notes": "온보딩·모듈 캡처 후 manifest/zip 번들",
  "steps": [
    { "id": "s1", "name": "기기 확보", "usesCapability": "ensure_android_device", "params": {} },
    { "id": "s2", "name": "앱 설치 확인", "usesCapability": "ensure_app_installed", "params": {} },
    { "id": "s3", "name": "앱 기동", "usesCapability": "launch_app", "params": {} },
    { "id": "s4", "name": "포그라운드 확인", "usesCapability": "ensure_app_foreground", "params": {} },
    { "id": "s5", "name": "온보딩 캡처", "usesCapability": "capture_onboarding_sequence", "params": {} },
    { "id": "s6", "name": "모듈 네비", "usesCapability": "navigate_to_module_screens", "params": {} },
    { "id": "s7", "name": "모듈 캡처", "usesCapability": "capture_module_sequence", "params": {} },
    { "id": "s8", "name": "번들 빌드", "usesCapability": "build_control_plane_bundle", "params": {} }
  ]
}
```

## `workflowTrace` 조각 (개념 예시)

성공 시 엔트리는 기존과 같이 스텝별로 쌓이며, 상단에 플래너 메타가 붙는다.

```json
{
  "goalId": "myphonecheck_capture_package",
  "planSource": "llm",
  "plannerModelKind": "gemini",
  "plannerModelName": "gemini-2.0-flash",
  "plannerNotes": "온보딩·모듈 캡처 후 manifest/zip 번들",
  "entries": [
    { "stepId": "ensure_android_device", "attempt": 1, "status": "success", "detail": "…" }
  ]
}
```

Fallback 시:

```json
{
  "goalId": "myphonecheck_capture_package",
  "planSource": "llm+fallback",
  "plannerModelKind": "gemini",
  "llmPlanRejectedReason": "sequence diverges (edit distance 4, endsOk=true)",
  "entries": []
}
```

실제 `entries`는 실행이 진행되면서 채워진다. `NEO_PLANNER_DEV_LOG=1`이면 서버 로그에 프롬프트/응답 일부가 추가된다.
