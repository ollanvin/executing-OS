import { useState } from "react";
import type { OperatorExecuteResult, PipelineStageStatus } from "../../lib/neoOperatorTypes";

type Props = {
  result: OperatorExecuteResult;
};

const statusStyle: Record<string, string> = {
  queued: "text-sky-400",
  running: "text-amber-400",
  success: "text-emerald-400",
  error: "text-red-400",
};

const stageStyle = (s: PipelineStageStatus | undefined) => {
  if (s === "success") return "text-emerald-400";
  if (s === "failed") return "text-red-400";
  if (s === "skipped") return "text-[#9ca3af]";
  return "text-sky-400";
};

export function ExecutionResultCard({ result }: Props) {
  const [open, setOpen] = useState(false);
  const logs = result.logs ?? [];
  const tail = open ? logs : logs.slice(-20);
  const ps = result.pipelineStages;

  return (
    <div
      className={[
        "rounded-xl border px-4 py-3 text-[13px]",
        result.ok
          ? "border-emerald-500/20 bg-emerald-500/[0.06]"
          : "border-red-500/25 bg-red-500/[0.06]",
      ].join(" ")}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[#6b7280]">
          실행 결과
        </span>
        <span className={`text-[12px] font-medium ${statusStyle[result.status] ?? "text-[#9ca3af]"}`}>
          {result.status}
        </span>
        <span className={result.ok ? "text-emerald-400/90" : "text-red-400/90"}>
          {result.ok ? "ok" : "failed"}
        </span>
      </div>
      <p className="leading-relaxed text-[#e5e7eb]">{result.summary}</p>

      {(ps || result.restorePointId) && (
        <div className="mt-3 space-y-2 rounded-lg border border-white/[0.06] bg-black/25 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b7280]">
            안전 파이프라인
          </p>
          {ps?.plan && (
            <p className={`text-[12px] ${stageStyle(ps.plan.status)}`}>
              <span className="text-[#9ca3af]">PLAN </span>
              {ps.plan.status}: {ps.plan.summary}
              {ps.plan.affectedCount != null && (
                <span className="text-[#6b7280]">
                  {" "}
                  ({ps.plan.affectedCount}개,{" "}
                  {ps.plan.totalBytes != null
                    ? `${(ps.plan.totalBytes / 1024).toFixed(1)} KiB`
                    : "—"}
                  )
                </span>
              )}
            </p>
          )}
          {ps?.backup && (
            <p className={`text-[12px] ${stageStyle(ps.backup.status)}`}>
              <span className="text-[#9ca3af]">BACKUP </span>
              {ps.backup.status}: {ps.backup.summary}
              {ps.backup.restorePointId && (
                <span className="mt-0.5 block font-mono text-[11px] text-[#94a3b8]">
                  restorePointId: {ps.backup.restorePointId}
                </span>
              )}
              {ps.backup.manifestPath && (
                <span className="block break-all font-mono text-[11px] text-[#94a3b8]">
                  manifest: {ps.backup.manifestPath}
                </span>
              )}
            </p>
          )}
          {ps?.approvalHashVerified && (
            <p className={`text-[12px] ${stageStyle(ps.approvalHashVerified.status)}`}>
              <span className="text-[#9ca3af]">APPROVAL HASH </span>
              {ps.approvalHashVerified.status}: {ps.approvalHashVerified.summary}
              {ps.approvalHashVerified.previewHash && (
                <span className="mt-0.5 block font-mono text-[10px] text-[#64748b]">
                  {ps.approvalHashVerified.previewHash.slice(0, 18)}…
                </span>
              )}
            </p>
          )}
          {ps?.commit && (
            <p className={`text-[12px] ${stageStyle(ps.commit.status)}`}>
              <span className="text-[#9ca3af]">COMMIT </span>
              {ps.commit.status}: {ps.commit.summary}
            </p>
          )}
          {ps?.auditChain && (
            <p className={`text-[12px] ${stageStyle(ps.auditChain.status)}`}>
              <span className="text-[#9ca3af]">AUDIT CHAIN </span>
              {ps.auditChain.status}: {ps.auditChain.summary}
              {ps.auditChain.entryHash && (
                <span className="mt-0.5 block font-mono text-[10px] text-[#64748b]">
                  entry: {ps.auditChain.entryHash.slice(0, 18)}…
                </span>
              )}
            </p>
          )}
          {ps?.circuitBreaker && (
            <p className={`text-[12px] ${stageStyle(ps.circuitBreaker.status)}`}>
              <span className="text-[#9ca3af]">CIRCUIT BREAKER </span>
              {ps.circuitBreaker.status}: {ps.circuitBreaker.summary}
            </p>
          )}
          {result.breakerBlocked && (
            <p className="text-[12px] text-red-400">
              mutating 실행이 circuit breaker에 의해 차단되었습니다.
            </p>
          )}
          {(result.restorePointId || result.safekeepRoot) && (
            <div className="border-t border-white/[0.05] pt-2 text-[11px] text-[#9ca3af]">
              <p className="font-medium text-[#6b7280]">RESTORE POINT</p>
              {result.restorePointId && (
                <p className="font-mono text-[#d1d5db]">{result.restorePointId}</p>
              )}
              {result.snapshotId && (
                <p className="font-mono text-[#94a3b8]">snapshot: {result.snapshotId}</p>
              )}
              {result.safekeepRoot && (
                <p className="break-all font-mono text-[#94a3b8]">{result.safekeepRoot}</p>
              )}
              {result.manifestPath && (
                <p className="break-all font-mono text-[#94a3b8]">{result.manifestPath}</p>
              )}
              <p className="mt-1 text-[#6b7280]">
                복구 API: <code className="text-[#9ca3af]">POST /api/restore/:restorePointId</code>
              </p>
            </div>
          )}
        </div>
      )}

      {result.artifacts && result.artifacts.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] font-medium text-[#6b7280]">산출물</p>
          <ul className="space-y-2">
            {result.artifacts.map((a, i) => (
              <li key={i} className="flex flex-wrap items-start gap-2 text-[12px] text-[#d1d5db]">
                <span className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 text-[11px] text-[#9ca3af]">
                  {a.label}
                </span>
                <span className="break-all font-mono text-[11px] text-[#94a3b8]">{a.path}</span>
                {a.url?.match(/\.png$/i) && (
                  <img
                    src={a.url}
                    alt=""
                    className="mt-1 max-h-40 rounded-lg border border-white/10"
                  />
                )}
                {a.url && !a.url.match(/\.png$/i) && (
                  <a
                    href={a.url}
                    className="text-sky-400 underline hover:text-sky-300"
                    target="_blank"
                    rel="noreferrer"
                  >
                    열기
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {tail.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="mb-1 text-[11px] font-medium text-[#9ca3af] hover:text-[#e5e7eb]"
          >
            세부 로그 {open ? "접기" : `펼치기 (${logs.length}줄)`}
          </button>
          <pre className="max-h-48 overflow-auto rounded-lg bg-black/35 p-2 font-mono text-[11px] leading-snug text-[#94a3b8]">
            {tail.join("\n")}
          </pre>
        </div>
      )}

      {result.nextSuggestedCommands && result.nextSuggestedCommands.length > 0 && (
        <div className="mt-3 border-t border-white/[0.06] pt-2">
          <p className="mb-1 text-[11px] text-[#6b7280]">다음 제안</p>
          <div className="flex flex-wrap gap-1.5">
            {result.nextSuggestedCommands.map((c) => (
              <span
                key={c}
                className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-[#d1d5db]"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
