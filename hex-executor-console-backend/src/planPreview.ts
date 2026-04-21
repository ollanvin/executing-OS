import path from "node:path";
import type { PreviewParts } from "./previewHash.js";
import { computeCanonicalPlanHash } from "./safekeep/canonicalPlan.js";
import { loadNeoPolicy, validateMutatingPath } from "./policy.js";
import { buildFileMovePlan, emptyPlan } from "./safekeep/plan.js";
import type { ActionRequest } from "./types.js";

export type PlanPreviewPayload = {
  previewHash: string;
  summary: string;
  affectedPaths: string[];
  fileCount: number;
  totalBytes: number;
  overwriteTargets: string[];
  mutationKind: string;
  policyLevel: string;
};

export async function buildPlanPreview(
  action: ActionRequest,
  workspaceRoot: string,
  outputRoot: string,
): Promise<{ ok: true; preview: PlanPreviewPayload } | { ok: false; reason: string } | null> {
  if (!action.isMutating) return null;

  const policy = await loadNeoPolicy(workspaceRoot);

  const makePlan = async (): Promise<
    | { ok: true; parts: PreviewParts; summary: string }
    | { ok: false; reason: string }
  > => {
    switch (action.intent) {
      case "file_move": {
        const r = await buildFileMovePlan(action, policy);
        if (!r.ok) return r;
        return {
          ok: true,
          summary: r.summary,
          parts: {
            affectedPaths: r.items.map((i) => i.originalPath),
            mutationKind: action.mutationKind,
            fileCount: r.items.length,
            totalBytes: r.totalBytes,
            overwriteTargets: r.overwriteTargets,
          },
        };
      }
      case "adb_screenshot": {
        const vo = validateMutatingPath(outputRoot, policy);
        if (!vo.ok) return { ok: false, reason: vo.reason };
        const dir = path.join(outputRoot, "screenshots");
        const vd = validateMutatingPath(dir, policy);
        if (!vd.ok) return { ok: false, reason: vd.reason };
        const ep = emptyPlan("PLAN: 스크린샷 PNG 신규 저장.");
        return {
          ok: true,
          summary: ep.summary,
          parts: {
            affectedPaths: [],
            mutationKind: action.mutationKind,
            fileCount: 0,
            totalBytes: 0,
            overwriteTargets: [],
          },
        };
      }
      case "myphonecheck_emulator": {
        const ep = emptyPlan(
          "PLAN: emulator_ensure_boot — Neo 워크플로(디바이스 확보·필요 시 AVD 자동 기동).",
        );
        return {
          ok: true,
          summary: ep.summary,
          parts: {
            affectedPaths: [],
            mutationKind: action.mutationKind,
            fileCount: 0,
            totalBytes: 0,
            overwriteTargets: [],
          },
        };
      }
      case "myphonecheck_app_launch": {
        const ep = emptyPlan(
          "PLAN: app_launch_foreground — Neo 워크플로(디바이스 확보 → 설치 확인 → 기동 → foreground).",
        );
        return {
          ok: true,
          summary: ep.summary,
          parts: {
            affectedPaths: [],
            mutationKind: action.mutationKind,
            fileCount: 0,
            totalBytes: 0,
            overwriteTargets: [],
          },
        };
      }
      case "myphonecheck_capture_package": {
        const vo = validateMutatingPath(outputRoot, policy);
        if (!vo.ok) return { ok: false, reason: vo.reason };
        const delivery = path.join(outputRoot, "control-plane-delivery");
        const vd = validateMutatingPath(delivery, policy);
        if (!vd.ok) return { ok: false, reason: vd.reason };
        const ep = emptyPlan(
          "PLAN: myphonecheck_capture_package — 컨트롤플레인 전달 PNG+manifest(+zip).",
        );
        return {
          ok: true,
          summary: ep.summary,
          parts: {
            affectedPaths: [],
            mutationKind: action.mutationKind,
            fileCount: 0,
            totalBytes: 0,
            overwriteTargets: [],
          },
        };
      }
      case "myphonecheck_capture_bundle_run": {
        const vo = validateMutatingPath(outputRoot, policy);
        if (!vo.ok) return { ok: false, reason: vo.reason };
        const delivery = path.join(outputRoot, "control-plane-delivery");
        const vd = validateMutatingPath(delivery, policy);
        if (!vd.ok) return { ok: false, reason: vd.reason };
        const ep = emptyPlan(
          "PLAN: myphonecheck_capture_bundle_run — 오케스트레이션(preflight·host·캡처·번들·리포트).",
        );
        return {
          ok: true,
          summary: ep.summary,
          parts: {
            affectedPaths: [],
            mutationKind: action.mutationKind,
            fileCount: 0,
            totalBytes: 0,
            overwriteTargets: [],
          },
        };
      }
      case "myphonecheck_app_ready_screenshot": {
        const vo = validateMutatingPath(outputRoot, policy);
        if (!vo.ok) return { ok: false, reason: vo.reason };
        const dir = path.join(outputRoot, "screenshots");
        const vd = validateMutatingPath(dir, policy);
        if (!vd.ok) return { ok: false, reason: vd.reason };
        const ep = emptyPlan(
          "PLAN: app_ready_screenshot — Neo composite(디바이스·앱·foreground·PNG).",
        );
        return {
          ok: true,
          summary: ep.summary,
          parts: {
            affectedPaths: [],
            mutationKind: action.mutationKind,
            fileCount: 0,
            totalBytes: 0,
            overwriteTargets: [],
          },
        };
      }
      case "vm_operation":
      case "app_install_or_download":
      case "app_launch":
      case "app_launch_generic": {
        const ep = emptyPlan(`PLAN: ${action.intent}`);
        return {
          ok: true,
          summary: ep.summary,
          parts: {
            affectedPaths: [],
            mutationKind: action.mutationKind,
            fileCount: 0,
            totalBytes: 0,
            overwriteTargets: [],
          },
        };
      }
      default:
        return { ok: false, reason: "mutating 이지만 PLAN 미정의 intent" };
    }
  };

  const built = await makePlan();
  if (!built.ok) return { ok: false, reason: built.reason };

  const previewHash = computeCanonicalPlanHash(action, built.parts, workspaceRoot);
  return {
    ok: true,
    preview: {
      previewHash,
      summary: built.summary,
      affectedPaths: built.parts.affectedPaths,
      fileCount: built.parts.fileCount,
      totalBytes: built.parts.totalBytes,
      overwriteTargets: built.parts.overwriteTargets,
      mutationKind: built.parts.mutationKind,
      policyLevel: policy.policyLevel,
    },
  };
}
