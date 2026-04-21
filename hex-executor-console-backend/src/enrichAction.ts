import type { ActionRequest, ParsedAction } from "./types.js";
import { isHighRiskMutationKind, loadNeoPolicy } from "./policy.js";

function mutationMetaForIntent(intent: string): Pick<
  ActionRequest,
  "isMutating" | "backupRequired" | "mutationKind" | "internalHighRisk"
> {
  switch (intent) {
    case "file_move":
      return {
        mutationKind: "FILE_MOVE",
        isMutating: true,
        backupRequired: true,
        internalHighRisk: false,
      };
    case "adb_screenshot":
      return {
        mutationKind: "FILE_CREATE",
        isMutating: true,
        backupRequired: true,
        internalHighRisk: false,
      };
    case "myphonecheck_emulator":
      return {
        mutationKind: "EMULATOR_STATE_CHANGE",
        isMutating: true,
        backupRequired: true,
        internalHighRisk: false,
      };
    case "myphonecheck_app_launch":
      return {
        mutationKind: "EMULATOR_STATE_CHANGE",
        isMutating: true,
        backupRequired: true,
        internalHighRisk: false,
      };
    case "myphonecheck_app_ready_screenshot":
    case "myphonecheck_capture_package":
    case "myphonecheck_capture_bundle_run":
      return {
        mutationKind: "FILE_CREATE",
        isMutating: true,
        backupRequired: true,
        internalHighRisk: false,
      };
    case "vm_operation":
      return {
        mutationKind: "VM_STATE_CHANGE",
        isMutating: true,
        backupRequired: true,
        internalHighRisk: false,
      };
    case "app_install_or_download":
      return {
        mutationKind: "APP_INSTALL",
        isMutating: true,
        backupRequired: true,
        internalHighRisk: false,
      };
    case "app_launch":
    case "app_launch_generic":
      return {
        mutationKind: "APP_INSTALL",
        isMutating: true,
        backupRequired: true,
        internalHighRisk: false,
      };
    default:
      return {
        mutationKind: "NONE",
        isMutating: false,
        backupRequired: false,
        internalHighRisk: false,
      };
  }
}

/** 서버 전용. 클라이언트가 보낸 isMutating 등은 무시하고 항상 재계산합니다. */
export async function finalizeAction(
  draft: ParsedAction,
  workspaceRoot: string,
): Promise<ActionRequest> {
  const policy = await loadNeoPolicy(workspaceRoot);
  const meta = mutationMetaForIntent(draft.intent);
  meta.internalHighRisk = meta.isMutating && isHighRiskMutationKind(meta.mutationKind, policy);

  let requiresApproval = draft.requiresApproval;
  if (meta.internalHighRisk && !requiresApproval) {
    requiresApproval = true;
  }

  return {
    ...draft,
    isMutating: meta.isMutating,
    backupRequired: meta.backupRequired,
    mutationKind: meta.mutationKind,
    internalHighRisk: meta.internalHighRisk,
    requiresApproval,
  };
}
