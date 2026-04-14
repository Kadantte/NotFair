"use client";

import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from "ai";
import { useChat } from "@ai-sdk/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowDown, Check, Copy, Link2, Send, Square, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GoogleAdsAgentUIMessage } from "@/lib/agents/google-ads-agent";
import { dispatchThreadEvent } from "@/lib/thread-events";
import type { Session } from "@/lib/session";
import { Message, ThinkingIndicator } from "@/components/chat/chat-shared";
import { McpToolsSheet } from "@/components/chat/mcp-tools-sheet";
import { useMcpTools } from "@/components/chat/use-mcp-tools";
import { ModelSelector, type ModelId } from "@/components/chat/model-selector";

type StoredAccount = {
  connected: boolean;
  customerId: string | null;
  customerName: string | null;
};

const emptyAccount: StoredAccount = {
  connected: false,
  customerId: null,
  customerName: null,
};

const starterPrompts = [
  "Audit my connected account and tell me the 3 biggest optimization opportunities.",
  "List my top 10 campaigns by spend and explain which ones are inefficient.",
  "For campaign 123456789, summarize the last 30 days and tell me what to change.",
  "Write a GAQL report to show campaign CTR, CPC, and conversions, then explain it.",
];

async function readServerSession(): Promise<Session> {
  const response = await fetch("/api/auth/session", {
    credentials: "include",
  });
  return response.json();
}

async function fetchMessages(threadId: string): Promise<GoogleAdsAgentUIMessage[]> {
  const res = await fetch(`/api/chat/threads/${threadId}/messages`, { credentials: "include" });
  const { messages } = await res.json();
  if (!messages || messages.length === 0) return [];
  return messages.map((m: { id: string; role: string; parts: unknown }) => ({
    id: m.id,
    role: m.role,
    parts: m.parts,
  })) as GoogleAdsAgentUIMessage[];
}

// ── Main chat page ──────────────────────────────────────────────────

export default function ChatPage() {
  const params = useParams();
  const threadId = params.threadId as string;
  const [input, setInput] = useState("");
  const [account, setAccount] = useState<StoredAccount>(emptyAccount);
  const [isHydrated, setIsHydrated] = useState(false);
  const [modelId, setModelId] = useState<ModelId>("gpt-5-mini");

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ id, messages, trigger, messageId }) => ({
          body: {
            id,
            messageId,
            trigger,
            messages,
          },
        }),
      }),
    [],
  );

  const { messages, sendMessage, setMessages, status, error, stop, addToolApprovalResponse } =
    useChat<GoogleAdsAgentUIMessage>({
      id: threadId,
      transport,
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    });

  // ── Hydration: fetch session + load this thread's messages ──
  useEffect(() => {
    let cancelled = false;
    readServerSession()
      .then(async session => {
        if (cancelled) return;
        if (session.connected) {
          setAccount({
            connected: true,
            customerId: session.customerId,
            customerName: session.customerName ?? "Google Ads Account",
          });
          // Load messages for this thread
          const dbMessages = await fetchMessages(threadId).catch(() => []);
          if (!cancelled && dbMessages.length > 0) {
            setMessages(dbMessages);
          }
        }
        setIsHydrated(true);
      })
      .catch(() => {
        setIsHydrated(true);
      });
    return () => { cancelled = true; };
  }, [threadId, setMessages]);


  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldScrollRef = useRef(false);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setIsAtBottom(atBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

  // Only scroll to bottom when flagged (user sends a message)
  useEffect(() => {
    if (shouldScrollRef.current) {
      shouldScrollRef.current = false;
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
    // Re-check isAtBottom as content grows during streaming
    handleScroll();
  }, [messages, handleScroll]);

  // Refresh sidebar when streaming completes (title will be in DB by then)
  const prevStatusRef = useRef(status);
  useEffect(() => {
    const wasStreaming = prevStatusRef.current === "streaming" || prevStatusRef.current === "submitted";
    const nowReady = status === "ready";
    prevStatusRef.current = status;
    if (wasStreaming && nowReady && messages.length > 0) {
      dispatchThreadEvent("refresh");
    }
  }, [status, messages.length]);

  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const {
    toolsOpen,
    setToolsOpen,
    tools,
    permissions,
    toolsLoading,
    toolsError,
    openTools,
    updatePermissions,
  } = useMcpTools();

  const isReady = isHydrated && account.connected;
  const isSending = status === "submitted" || status === "streaming";

  const currentTitle = useMemo(() => {
    const firstUserMsg = messages.find(m => m.role === "user");
    if (!firstUserMsg) return "New chat";
    const text = firstUserMsg.parts
      .filter(p => p.type === "text")
      .map(p => p.text)
      .join(" ")
      .trim()
      .slice(0, 48);
    return text || "New chat";
  }, [messages]);

  return (
    <section className="flex h-full flex-col overflow-hidden bg-[#222221]">
      <header className="shrink-0 bg-[#222221]">
        <div className="flex w-full items-center justify-between px-6 py-3">
          <h1 className="text-base font-medium text-[#E8E4DD]/80">
            {currentTitle}
          </h1>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={async () => {
                if (!threadId) return;
                try {
                  const res = await fetch(`/api/chat/threads/${threadId}/share`, {
                    method: "POST",
                    credentials: "include",
                  });
                  const data = await res.json();
                  if (data.shareUrl) {
                    setShareUrl(window.location.origin + data.shareUrl);
                    setShareOpen(true);
                    setCopied(false);
                  }
                } catch {}
              }}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-[#8b8b89] transition-colors hover:bg-[#2c2c2b] hover:text-white"
            >
              <Link2 className="h-3.5 w-3.5" />
              Share
            </button>
          )}
        </div>
      </header>

      <div ref={scrollRef} onScroll={handleScroll} className="relative min-h-0 flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex min-h-full w-full flex-col items-center justify-center px-4 md:px-6">
            <h1 className="text-2xl font-medium text-white md:text-3xl">
              What can I help with your Google Ads account today?
            </h1>
            <div className="mx-auto mt-8 grid w-full max-w-3xl gap-2 sm:grid-cols-2">
              {starterPrompts.map(prompt => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => { if (isReady) { shouldScrollRef.current = true; sendMessage({ text: prompt }); } }}
                  className="rounded-2xl border border-[#4a4a48] bg-[#2c2c2b] px-4 py-3 text-left text-sm leading-6 text-[#b0b0ae] transition-colors hover:bg-[#3a3a39] hover:text-white"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div>
            {messages.map((message, index) => (
              <Message
                key={message.id}
                message={message}
                isActivelyStreaming={
                  isSending && index === messages.length - 1 && message.role === "assistant"
                }
                onApproval={addToolApprovalResponse}
              />
            ))}
            {isSending && (messages.length === 0 || messages[messages.length - 1].role === "user") && (
              <div className="mx-auto w-full max-w-3xl px-4 py-3 md:px-6">
                <ThinkingIndicator />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="relative shrink-0 bg-[#222221] px-4 pb-4 pt-2">
        {!isAtBottom && messages.length > 0 && (
          <div className="absolute -top-12 left-1/2 z-10 -translate-x-1/2">
            <button
              type="button"
              onClick={scrollToBottom}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-[#4a4a48] bg-[#2c2c2b] text-[#b0b0ae] shadow-lg transition-colors hover:bg-[#3a3a39] hover:text-white"
            >
              <ArrowDown className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="mx-auto w-full max-w-3xl">
          {error && (
            <div className="mb-3 rounded-lg bg-[#C45D4A]/10 px-4 py-3 text-sm text-[#C45D4A]">
              {error.message}
            </div>
          )}
          <form
            onSubmit={event => {
              event.preventDefault();
              if (!input.trim() || !isReady || isSending) return;
              shouldScrollRef.current = true;
              sendMessage({ text: input });
              setInput("");
            }}
            className="rounded-2xl border border-[#4a4a48] bg-[#2c2c2b] p-3"
          >
            <Input
              value={input}
              onChange={event => setInput(event.currentTarget.value)}
              placeholder={isReady ? "Reply..." : "Connect Google Ads first..."}
              disabled={!isReady || isSending}
              className="h-11 border-0 bg-transparent px-2 text-base text-white shadow-none placeholder:text-[#8b8b89] focus-visible:ring-0"
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={openTools}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#4a4a48] bg-[#222221] px-3 py-1.5 text-xs text-[#b0b0ae] transition-colors hover:border-[#6a6a68] hover:bg-[#3a3a39] hover:text-white"
              >
                <Wrench className="h-3.5 w-3.5" />
                Google Ads MCP tools
              </button>
              <div className="flex items-center gap-2">
                <ModelSelector value={modelId} onChange={setModelId} surface="chat_page" />
              {isSending ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => stop()}
                  className="h-9 w-9 rounded-full text-[#8b8b89] hover:bg-[#3a3a39]"
                >
                  <Square className="h-4 w-4 fill-current" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={!isReady || !input.trim()}
                  className="h-9 w-9 rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30"
                >
                  <Send className="h-4 w-4" />
                </Button>
              )}
              </div>
            </div>
          </form>
        </div>
      </div>
      {/* MCP tools sheet */}
      <McpToolsSheet
        open={toolsOpen}
        onClose={() => setToolsOpen(false)}
        tools={tools}
        permissions={permissions}
        loading={toolsLoading}
        error={toolsError}
        onUpdate={updatePermissions}
      />

      {/* Share modal */}
      {shareOpen && shareUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-2xl bg-[#2c2c2b] p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium text-white">Share chat</h2>
              <button
                type="button"
                onClick={() => setShareOpen(false)}
                className="rounded-lg p-1.5 text-[#8b8b89] hover:bg-[#3a3a39] hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-sm text-[#8b8b89]">
              Anyone with this link can view this conversation.
            </p>
            <div className="mt-4 flex items-center gap-2">
              <div className="min-w-0 flex-1 rounded-lg bg-[#222221] px-3 py-2.5">
                <p className="truncate text-sm text-white">{shareUrl}</p>
              </div>
              <Button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(shareUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="h-10 shrink-0 rounded-lg bg-white px-4 text-sm font-medium text-[#222221] hover:bg-white/90"
              >
                {copied ? (
                  <span className="flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5" />
                    Copied
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </span>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
