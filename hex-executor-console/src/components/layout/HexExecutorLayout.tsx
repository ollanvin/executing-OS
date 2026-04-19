import { useCallback, useState } from "react";
import { CursorLikeChatPanel } from "../chat/CursorLikeChatPanel";

const PREFILL = {
  m1: `Run M1 WebStub US smoke:\npython local_pipeline.py payloads\\web_stub_us.json\n\n(LOCAL_EXECUTOR_DRY_RUN=0, Node/npm on PATH)`,
  m2: `Run M2 MyPhoneCheck KR:\npython local_pipeline.py payloads\\myphonecheck_kr.json\n\n(ANDROID_HOME + sibling ../myphonecheck)`,
  logs: `Show recent Neo / Executor logs path:\nruns\\daily_global_report.md\nruns\\<Project>\\<run_id>\\reports\\`,
  neo: `Neo launcher:\nrun_neo.bat\n\nMenu [1] WebStub [2] Fooapp [3] G20 [4] MyPhoneCheck [0] shell [Q] quit`,
} as const;

type SectionKey = keyof typeof PREFILL;

export function HexExecutorLayout() {
  const [prefill, setPrefill] = useState<string | null>(null);

  const onSection = useCallback((key: SectionKey) => {
    setPrefill(PREFILL[key]);
  }, []);

  const consumePrefill = useCallback(() => {
    setPrefill(null);
  }, []);

  return (
    <div
      className="grid h-screen w-screen text-hex-text"
      style={{
        gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)",
        background: "linear-gradient(180deg, #020617 0%, #0f172a 100%)",
      }}
    >
      <aside className="flex min-h-0 flex-col border-r border-hex-border bg-[#0b1120]/95">
        <div className="border-b border-hex-border px-4 py-3">
          <h1 className="text-[13px] font-medium text-hex-muted">Executor OS / Neo Runs</h1>
          <p className="mt-1 text-[12px] leading-relaxed text-hex-muted/90">
            코드 · 로그 · 콘솔 영역 (placeholder). 우측은 Cursor 스타일 에이전트 채팅입니다.
          </p>
        </div>
        <nav className="flex flex-col gap-2 p-4">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-hex-muted/70">
            Scenarios
          </p>
          <NavButton label="M1 — WebStub / parity" onClick={() => onSection("m1")} />
          <NavButton label="M2 — MyPhoneCheck KR" onClick={() => onSection("m2")} />
          <p className="mb-1 mt-4 text-[11px] font-medium uppercase tracking-wide text-hex-muted/70">
            Workspace
          </p>
          <NavButton label="Logs" onClick={() => onSection("logs")} />
          <NavButton label="Neo Runs" onClick={() => onSection("neo")} />
        </nav>
        <div className="mt-auto border-t border-hex-border p-4">
          <div className="rounded-lg border border-dashed border-white/10 bg-black/20 p-3 text-[12px] text-hex-muted">
            향후: 좌측에 Monaco / 터미널 임베드, Neo run_neo 출력 스트림 연결.
          </div>
        </div>
      </aside>
      <CursorLikeChatPanel prefillRequest={prefill} onConsumePrefill={consumePrefill} />
    </div>
  );
}

function NavButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 text-left text-[13px] font-medium text-hex-text transition hover:border-white/10 hover:bg-white/[0.06]"
    >
      {label}
    </button>
  );
}
