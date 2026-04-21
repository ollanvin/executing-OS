export type BubbleRole = "user" | "assistant";

type Props = {
  role: BubbleRole;
  content: string;
  loading?: boolean;
};

export function ChatMessageBubble({ role, content, loading }: Props) {
  const isUser = role === "user";

  return (
    <div className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={[
          "max-w-[min(85%,560px)] rounded-xl px-3.5 py-2.5 text-[13px] leading-[1.5]",
          isUser
            ? "bg-[#1f2937] text-[#e5e7eb]"
            : "border border-white/[0.06] bg-[#111827] text-[#e5e7eb]",
        ].join(" ")}
      >
        {loading ? <TypingDots /> : <p className="whitespace-pre-wrap break-words">{content}</p>}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-0.5 text-[#9ca3af]" aria-label="Loading">
      <span className="animate-bounce [animation-delay:-0.2s]">.</span>
      <span className="animate-bounce [animation-delay:-0.1s]">.</span>
      <span className="animate-bounce">.</span>
    </div>
  );
}
