import { useCallback, useEffect, useRef, useState } from "react";
import { HexChatHeader } from "../header/HexChatHeader";
import { ChatInputBar } from "./ChatInputBar";
import { ChatMessageBubble } from "./ChatMessageBubble";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  loading?: boolean;
};

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function mockAssistantReply(userText: string): string {
  return [
    "이건 데모 응답입니다. 실제 LLM 연결 전까지 Cursor 스타일 레이아웃만 검증합니다.",
    "",
    `요청 요약: «${userText.slice(0, 120)}${userText.length > 120 ? "…" : ""}»`,
    "",
    "Executor OS / Neo 런처와 연동하려면 이 패널을 백엔드 WebSocket 또는 로컬 API에 붙이면 됩니다.",
  ].join("\n");
}

type Props = {
  /** Left pane: inject template into input when set */
  prefillRequest?: string | null;
  onConsumePrefill?: () => void;
};

export function CursorLikeChatPanel({ prefillRequest, onConsumePrefill }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: uid(),
      role: "assistant",
      content:
        "Hex Executor Console에 오신 것을 환영합니다. 왼쪽에서 M1/M2 시나리오를 선택하면 입력창에 워크오더 템플릿이 채워집니다.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (prefillRequest != null && prefillRequest !== "") {
      setInput(prefillRequest);
      onConsumePrefill?.();
    }
  }, [prefillRequest, onConsumePrefill]);

  const send = useCallback(() => {
    const text = input.trim();
    if (!text || busy) return;

    const userId = uid();
    const loadingId = uid();

    setInput("");
    setBusy(true);
    setMessages((m) => [...m, { id: userId, role: "user", content: text }]);
    setMessages((m) => [...m, { id: loadingId, role: "assistant", content: "", loading: true }]);

    window.setTimeout(() => {
      const reply = mockAssistantReply(text);
      setMessages((m) =>
        m.map((msg) =>
          msg.id === loadingId ? { ...msg, content: reply, loading: false } : msg,
        ),
      );
      setBusy(false);
    }, 1400);
  }, [input, busy]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-hex-panel border-l border-hex-border">
      <HexChatHeader />
      <div
        ref={listRef}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4"
        role="log"
        aria-live="polite"
      >
        {messages.map((msg) => (
          <ChatMessageBubble
            key={msg.id}
            role={msg.role}
            content={msg.content}
            loading={msg.loading}
          />
        ))}
      </div>
      <ChatInputBar value={input} onChange={setInput} onSend={send} disabled={busy} />
    </div>
  );
}
