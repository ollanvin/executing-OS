import type { KeyboardEvent } from "react";

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
};

export function ChatInputBar({ value, onChange, onSend, disabled }: Props) {
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && value.trim()) onSend();
    }
  };

  return (
    <div className="border-t border-hex-border bg-[#0a0f1a] p-3">
      <div className="mx-auto flex max-w-3xl gap-2 rounded-xl border border-white/[0.08] bg-[#111827]/90 p-2 shadow-inner">
        <textarea
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Plan, search, build anything…"
          disabled={disabled}
          className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-[13px] leading-[1.5] text-hex-text placeholder:text-hex-muted/70 focus:outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={onSend}
          disabled={disabled || !value.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center self-end rounded-lg bg-white/10 text-hex-text transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
          title="Send"
          aria-label="Send message"
        >
          <PaperPlaneIcon />
        </button>
      </div>
      <p className="mt-2 text-center text-[11px] text-hex-muted/80">
        Enter to send · Shift+Enter for new line
      </p>
    </div>
  );
}

function PaperPlaneIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 11.5L21 4l-7 16-2.5-6.5L3 11.5z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M11.5 13.5L21 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
