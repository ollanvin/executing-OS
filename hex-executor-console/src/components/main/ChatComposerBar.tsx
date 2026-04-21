import type { KeyboardEvent } from "react";

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
};

export function ChatComposerBar({ value, onChange, onSend, disabled }: Props) {
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && value.trim()) onSend();
    }
  };

  return (
    <div className="shrink-0 border-t border-white/[0.06] bg-[#0b1120] px-4 py-3">
      <div className="mx-auto flex max-w-4xl flex-col gap-2">
        <div className="flex items-end gap-2 rounded-xl border border-white/[0.08] bg-[#111827] p-2 shadow-inner">
          <button
            type="button"
            className="mb-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#9ca3af] hover:bg-white/[0.06] hover:text-[#e5e7eb]"
            title="컨텍스트 (예정)"
            aria-label="Add context"
          >
            <span className="text-lg leading-none">+</span>
          </button>
          <div className="min-w-0 flex-1">
            <textarea
              rows={2}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="로컬 작업을 지시하세요…"
              disabled={disabled}
              className="max-h-36 min-h-[52px] w-full resize-none bg-transparent px-1 py-2 text-[13px] leading-[1.5] text-[#e5e7eb] placeholder:text-[#6b7280] focus:outline-none disabled:opacity-50"
            />
            <p className="px-1 text-[11px] leading-snug text-[#6b7280]">
              예: MyPhoneCheck 에뮬레이터 돌려줘 · 최근 실행 로그 보여줘 · 이 폴더를{" "}
              <span className="text-[#9ca3af]">D:\backup</span> 으로 옮겨줘
            </p>
          </div>
          <button
            type="button"
            onClick={onSend}
            disabled={disabled || !value.trim()}
            className="mb-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-[#e5e7eb] hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
            title="실행"
            aria-label="Send command"
          >
            <PaperPlaneIcon />
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <p className="text-[11px] text-[#6b7280]">
            Neo Local Operator · Enter 실행 · Shift+Enter 줄바꿈
          </p>
          <p className="text-[11px] text-[#525867]">외부 네트워크 미사용 · 로컬 child_process</p>
        </div>
      </div>
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
