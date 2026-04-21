import { categoryLabel } from "../../lib/commandClassifier";
import type { OperatorAction, PlanPreviewPayload } from "../../lib/neoOperatorTypes";

type Props = {
  action: OperatorAction;
  offlineParse?: boolean;
  planPreview?: PlanPreviewPayload | null;
};

export function InterpretationCard({ action, offlineParse, planPreview }: Props) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#111827] px-4 py-3 text-[13px] shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2 border-b border-white/[0.06] pb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[#6b7280]">
          해석된 작업
        </span>
        {offlineParse && (
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
            로컬 해석 (API 미연결)
          </span>
        )}
        {action.isMutating && (
          <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-medium text-rose-300">
            Mutating · COW 필수
          </span>
        )}
        {action.internalHighRisk && (
          <span className="rounded bg-orange-500/15 px-1.5 py-0.5 text-[10px] font-medium text-orange-300">
            High-risk (정책)
          </span>
        )}
      </div>
      <dl className="space-y-2 text-[#d1d5db]">
        <div>
          <dt className="text-[11px] text-[#6b7280]">분류</dt>
          <dd>
            <span className="font-mono text-[12px] text-emerald-400/90">{action.category}</span>
            <span className="text-[#6b7280]"> · </span>
            <span>{categoryLabel(action.category)}</span>
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-[#6b7280]">변경 종류</dt>
          <dd className="font-mono text-[11px] text-[#9ca3af]">{action.mutationKind}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-[#6b7280]">의도</dt>
          <dd className="text-[#e5e7eb]">
            {action.intentLabel}{" "}
            <span className="font-mono text-[11px] text-[#9ca3af]">({action.intent})</span>
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-[#6b7280]">예상 실행</dt>
          <dd>{action.executionSummary}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-[#6b7280]">시스템 백업(COW)</dt>
          <dd className={action.backupRequired ? "text-sky-300" : "text-[#6b7280]"}>
            {action.backupRequired
              ? "필수 — 승인과 무관하게 PLAN→BACKUP 성공 후에만 COMMIT"
              : "해당 없음"}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-[#6b7280]">사용자 승인</dt>
          <dd className={action.requiresApproval ? "text-amber-400" : "text-emerald-400"}>
            {action.requiresApproval ? "필요함 (실행 전 확인)" : "필요 없음"}
          </dd>
        </div>
        {planPreview && action.isMutating && (
          <div className="rounded-lg border border-white/[0.06] bg-black/20 px-2 py-2">
            <p className="text-[11px] font-medium text-[#6b7280]">PLAN 미리보기 (승인·실행 해시 바인딩)</p>
            <dl className="mt-1 space-y-1">
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-[11px] text-[#6b7280]">정책</dt>
                <dd className="font-mono text-[11px] text-[#a5b4fc]">{planPreview.policyLevel}</dd>
              </div>
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-[11px] text-[#6b7280]">영향 파일</dt>
                <dd className="text-[11px] text-[#e5e7eb]">
                  {planPreview.fileCount}개 · {(planPreview.totalBytes / 1024).toFixed(1)} KiB
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-[#6b7280]">preview hash</dt>
                <dd className="break-all font-mono text-[10px] text-[#94a3b8]">
                  {planPreview.previewHash.slice(0, 20)}…{planPreview.previewHash.slice(-12)}
                </dd>
              </div>
            </dl>
          </div>
        )}
      </dl>
    </div>
  );
}
