"use client";

import { DefaultChatTransport } from "ai";
import { useChat } from "@ai-sdk/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, Send, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GoogleAdsAgentUIMessage } from "@/lib/agents/google-ads-agent";
import { Message } from "@/components/chat/chat-shared";

// ── Types ───────────────────────────────────────────────────────────

export type AuditChatContext = {
  accountName: string;
  overallScore: number | null;
  category: string | null;
  dimensions: Array<{
    label: string;
    score: number;
    status: string;
    finding: string;
  }>;
};

// ── Drawer Component ────────────────────────────────────────────────

export function AuditChatDrawer({
  open,
  onClose,
  pendingPrompt,
  onPromptConsumed,
  context,
}: {
  open: boolean;
  onClose: () => void;
  pendingPrompt: string | null;
  onPromptConsumed: () => void;
  context: AuditChatContext | null;
}) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const threadId = useRef(crypto.randomUUID());

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ id, messages, trigger, messageId }) => ({
          body: { id, messageId, trigger, messages },
        }),
      }),
    [],
  );

  const { messages, sendMessage, status, error, stop } =
    useChat<GoogleAdsAgentUIMessage>({
      id: threadId.current,
      transport,
    });

  const isSending = status === "submitted" || status === "streaming";

  // Build a system-context prefix so the AI knows what the user is looking at
  const contextPrefix = useMemo(() => {
    if (!context) return "";
    const lines = [
      `I'm looking at the audit report for "${context.accountName}".`,
      context.overallScore !== null
        ? `Overall score: ${context.overallScore}/100 (${context.category}).`
        : "",
      "Dimension scores:",
      ...context.dimensions.map(
        (d) => `- ${d.label}: ${d.score}/5 (${d.status}) — ${d.finding}`,
      ),
      "",
    ];
    return lines.filter(Boolean).join("\n");
  }, [context]);

  // Send pending prompt when it arrives
  const sendPending = useCallback(
    (prompt: string) => {
      const fullMessage = contextPrefix
        ? `${contextPrefix}\n${prompt}`
        : prompt;
      sendMessage({ text: fullMessage });
      onPromptConsumed();
    },
    [contextPrefix, sendMessage, onPromptConsumed],
  );

  useEffect(() => {
    if (pendingPrompt && open) {
      sendPending(pendingPrompt);
    }
  }, [pendingPrompt, open, sendPending]);

  // Auto-scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <>
      {/* Backdrop on mobile */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed bottom-0 right-0 top-0 z-50 flex w-full flex-col border-l border-[#3D3C36] bg-[#1A1917] transition-transform duration-300 ease-in-out sm:w-[440px] ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[#3D3C36] bg-[#24231F]/80 px-4 py-3 backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-[#4CAF6E]" />
            <span className="text-[14px] font-medium text-[#E8E4DD]">
              Audit Help
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-[#9B9689] transition hover:bg-[#2E2D28] hover:text-[#E8E4DD]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
              <MessageCircle className="mb-3 h-8 w-8 text-[#4CAF6E]/40" />
              <p className="text-[14px] font-medium text-[#E8E4DD]">
                Ask about your audit
              </p>
              <p className="mt-1 max-w-[280px] text-[12px] leading-5 text-[#9B9689]">
                Click &ldquo;Ask AI&rdquo; on any finding, or type a question
                below.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#3D3C36]/50">
              {messages.map((message) => (
                <Message key={message.id} message={message} />
              ))}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="shrink-0 border-t border-[#3D3C36] bg-[#1A1917]/95 px-3 py-3 backdrop-blur-xl">
          {error && (
            <div className="mb-2 rounded border border-[#C45D4A]/20 bg-[#C45D4A]/10 px-3 py-2 text-[12px] text-[#C45D4A]">
              {error.message}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!input.trim() || isSending) return;
              const fullMessage = contextPrefix
                ? `${contextPrefix}\n${input}`
                : input;
              sendMessage({ text: fullMessage });
              setInput("");
            }}
            className="rounded-lg border border-[#3D3C36] bg-[#24231F] p-2"
          >
            <div className="flex items-end gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.currentTarget.value)}
                placeholder="Ask about this audit..."
                disabled={isSending}
                className="h-10 border-0 bg-transparent px-2 text-[14px] text-[#E8E4DD] shadow-none placeholder:text-[#9B9689] focus-visible:ring-0"
              />
              {isSending ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => stop()}
                  className="h-9 w-9 shrink-0 rounded-full text-[#E8E4DD] hover:bg-[#2E2D28]"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={!input.trim()}
                  className="h-9 w-9 shrink-0 rounded-full bg-[#4CAF6E] text-[#1A1917] hover:bg-[#3D9A5C]"
                >
                  <Send className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

// ── Floating "Discuss Audit" Button ─────────────────────────────────

export function AuditChatFab({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed bottom-6 right-6 z-30 flex items-center gap-2 rounded-full border border-[#4CAF6E]/30 bg-[#24231F] px-4 py-3 text-[13px] font-medium text-[#4CAF6E] shadow-lg shadow-black/30 transition hover:border-[#4CAF6E]/50 hover:bg-[#2E2D28]"
    >
      <MessageCircle className="h-4 w-4" />
      Discuss Audit
    </button>
  );
}
