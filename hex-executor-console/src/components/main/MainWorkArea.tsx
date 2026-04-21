import { useCallback, useEffect, useRef, useState } from "react";
import { ChatMessageBubble } from "../chat/ChatMessageBubble";
import { ApprovalPrompt } from "../operator/ApprovalPrompt";
import { ExecutionResultCard } from "../operator/ExecutionResultCard";
import { InterpretationCard } from "../operator/InterpretationCard";
import { OperatorEmptyState } from "../operator/OperatorEmptyState";
import { classifyOperatorCommand, finalizeOperatorAction } from "../../lib/commandClassifier";
import { neoExecute, neoHealth, neoParse } from "../../lib/neoApi";
import type { OperatorAction, OperatorTurn } from "../../lib/neoOperatorTypes";
import { ChatComposerBar } from "./ChatComposerBar";

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

type Props = {
  prefillRequest?: string | null;
  onConsumePrefill?: () => void;
};

export function MainWorkArea({ prefillRequest, onConsumePrefill }: Props) {
  const [turns, setTurns] = useState<OperatorTurn[]>([]);
  const [input, setInput] = useState("");
  const [apiUp, setApiUp] = useState<boolean | null>(null);
  const [systemBanner, setSystemBanner] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const busy = turns.some((t) => t.phase === "parsing" || t.phase === "running");

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [turns, scrollToBottom]);

  useEffect(() => {
    if (prefillRequest != null && prefillRequest !== "") {
      setInput(prefillRequest);
      onConsumePrefill?.();
    }
  }, [prefillRequest, onConsumePrefill]);

  useEffect(() => {
    void neoHealth().then(setApiUp);
    const id = window.setInterval(() => {
      void neoHealth().then(setApiUp);
    }, 12_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (apiUp !== true) {
      setSystemBanner(null);
      return;
    }
    const load = async () => {
      try {
        const r = await fetch("/api/system/status");
        if (!r.ok) return;
        const j = (await r.json()) as {
          ai?: { message?: string; providerDetail?: string };
          breakerBanners?: string[];
          circuitBreaker?: { open?: boolean; state?: string; mutatingLastMinute?: number };
        };
        const aiMsg = j.ai?.providerDetail ?? j.ai?.message;
        const br =
          j.circuitBreaker?.open && j.circuitBreaker?.state !== "HALF_OPEN"
            ? `Mutating pipeline ${j.circuitBreaker?.state ?? "OPEN"} (1분 ${j.circuitBreaker?.mutatingLastMinute ?? 0}회)`
            : null;
        const line = [aiMsg, br, ...(j.breakerBanners ?? [])].filter(Boolean).join(" · ");
        setSystemBanner(line || null);
      } catch {
        setSystemBanner(null);
      }
    };
    void load();
    const id = window.setInterval(load, 15_000);
    return () => window.clearInterval(id);
  }, [apiUp]);

  const runExecuteTurn = useCallback(
    async (
      turnId: string,
      action: OperatorAction,
      approved: boolean,
      approvalPreviewHash: string | null | undefined,
    ) => {
      setTurns((t) => t.map((x) => (x.id === turnId ? { ...x, phase: "running" } : x)));
      try {
        const { result } = await neoExecute(action, approved, approvalPreviewHash);
        setTurns((t) =>
          t.map((x) =>
            x.id === turnId ? { ...x, result, phase: "done", error: undefined } : x,
          ),
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setTurns((t) =>
          t.map((x) => (x.id === turnId ? { ...x, phase: "error", error: msg } : x)),
        );
      }
    },
    [],
  );

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    const turnId = uid();
    setTurns((t) => [...t, { id: turnId, userText: text, phase: "parsing" }]);

    let action: OperatorAction;
    let offline = false;
    let planPreview: OperatorTurn["planPreview"] = null;
    try {
      const r = await neoParse(text);
      action = r.action;
      planPreview = r.planPreview;
    } catch {
      action = finalizeOperatorAction(classifyOperatorCommand(text));
      offline = true;
    }

    if (offline && action.isMutating) {
      setTurns((t) =>
        t.map((x) =>
          x.id === turnId
            ? {
                ...x,
                action,
                offlineParse: true,
                planPreview: null,
                phase: "error",
                error:
                  "변경(mutating) 작업은 Neo API의 PLAN 미리보기·해시 바인딩이 필요합니다. 백엔드를 실행한 뒤 다시 시도하세요.",
              }
            : x,
        ),
      );
      return;
    }

    const nextPhase: OperatorTurn["phase"] = action.requiresApproval
      ? "await_approval"
      : "running";

    setTurns((t) =>
      t.map((x) =>
        x.id === turnId
          ? { ...x, action, offlineParse: offline, planPreview, phase: nextPhase }
          : x,
      ),
    );

    if (!action.requiresApproval) {
      await runExecuteTurn(
        turnId,
        action,
        false,
        action.isMutating ? planPreview?.previewHash : null,
      );
    }
  }, [input, busy, runExecuteTurn]);

  const cancelTurn = useCallback((turnId: string) => {
    setTurns((t) =>
      t.map((x) => (x.id === turnId ? { ...x, phase: "cancelled" } : x)),
    );
  }, []);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#020617]">
      {apiUp === false && (
        <div className="shrink-0 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-center text-[12px] text-amber-200">
          Neo 로컬 API에 연결되지 않았습니다.{" "}
          <code className="rounded bg-black/30 px-1">hex-executor-console-backend</code>를 실행
          하세요 (기본 포트 3847).
        </div>
      )}
      {apiUp === true && systemBanner && (
        <div className="shrink-0 border-b border-sky-500/15 bg-sky-500/5 px-4 py-1.5 text-center text-[11px] text-sky-100/90">
          {systemBanner}
        </div>
      )}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-6 py-5"
        role="region"
        aria-label="Operator command stream"
      >
        <div className="mx-auto max-w-4xl space-y-5">
          {turns.length === 0 && <OperatorEmptyState />}

          {turns.map((turn) => (
            <div key={turn.id} className="space-y-3">
              <section aria-label="User command">
                <ChatMessageBubble role="user" content={turn.userText} />
              </section>

              {turn.action && (
                <InterpretationCard
                  action={turn.action}
                  offlineParse={turn.offlineParse}
                  planPreview={turn.planPreview}
                />
              )}

              {turn.phase === "await_approval" && turn.action && (
                <ApprovalPrompt
                  disabled={busy}
                  onApprove={() =>
                    void runExecuteTurn(
                      turn.id,
                      turn.action!,
                      true,
                      turn.action!.isMutating ? turn.planPreview?.previewHash : null,
                    )
                  }
                  onCancel={() => cancelTurn(turn.id)}
                />
              )}

              {turn.phase === "running" && (
                <p className="text-[12px] text-[#6b7280]">실행 중…</p>
              )}

              {turn.phase === "cancelled" && (
                <p className="text-[12px] text-[#6b7280]">사용자가 실행을 취소했습니다.</p>
              )}

              {turn.error && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-200">
                  {turn.error}
                </div>
              )}

              {turn.result && <ExecutionResultCard result={turn.result} />}
            </div>
          ))}
        </div>
      </div>
      <ChatComposerBar value={input} onChange={setInput} onSend={handleSend} disabled={busy} />
    </div>
  );
}
