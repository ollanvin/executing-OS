/**
 * Few-shot용: 정적 DAG와 동일한 목표의 참조 PlannerPlan JSON (프롬프트에 삽입).
 */
export const MYPHONECHECK_CAPTURE_EXAMPLE_PLAN_JSON = `{
  "goalId": "myphonecheck_capture_package",
  "notes": "Reference: emulator (or virtualized Android) first — ensure target → app → onboarding/module captures → control-plane bundle. Constitution: docs/OPERATING-CONSTITUTION.md.",
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
}`;
