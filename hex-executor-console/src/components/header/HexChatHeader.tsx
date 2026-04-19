import { HexLogo } from "./HexLogo";

type ModelOption = "Agent • Auto" | "Agent • GPT-4" | "Ask";

export function HexChatHeader() {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-hex-border px-3">
      <HexLogo />
      <div className="flex min-w-0 flex-1 justify-center">
        <label className="sr-only" htmlFor="model-select">
          Model
        </label>
        <select
          id="model-select"
          defaultValue="Agent • Auto"
          className="max-w-[200px] cursor-pointer rounded-md border border-white/10 bg-[#111827] px-2.5 py-1 text-[13px] font-medium text-hex-text outline-none hover:bg-white/5 focus:ring-1 focus:ring-white/20"
        >
          {(["Agent • Auto", "Agent • GPT-4", "Ask"] as ModelOption[]).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          className="rounded-md p-1.5 text-hex-muted transition hover:bg-white/5 hover:text-hex-text"
          title="History"
          aria-label="Chat history"
        >
          <ClockIcon />
        </button>
        <button
          type="button"
          className="rounded-md p-1.5 text-hex-muted transition hover:bg-white/5 hover:text-hex-text"
          title="More"
          aria-label="More options"
        >
          <MoreIcon />
        </button>
      </div>
    </header>
  );
}

function ClockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" strokeLinecap="round" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}
