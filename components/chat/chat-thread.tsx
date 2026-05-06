"use client";

import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from "ai";
import { useChat } from "@ai-sdk/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, Check, Copy, Link2, Send, Square, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GoogleAdsAgentUIMessage } from "@/lib/agents/google-ads-agent";
import { dispatchThreadEvent } from "@/lib/thread-events";
import { Message, ThinkingIndicator } from "@/components/chat/chat-shared";
import { McpToolsSheet } from "@/components/chat/mcp-tools-sheet";
import { useMcpTools } from "@/components/chat/use-mcp-tools";
import { UseInYourClaudePill } from "@/components/chat/model-selector";

export type ChatThreadInitialAccount = {
  customerId: string | null;
  customerName: string;
  platform: "google_ads" | "meta_ads";
};

type ChatThreadProps = {
  threadId: string;
  initialAccount: ChatThreadInitialAccount;
  initialMessages: GoogleAdsAgentUIMessage[];
};

const primaryPrompt = "Run an audit on my account and suggest the 3 biggest fixes with dollar impact.";
const secondaryPrompts = [
  "List my top 10 campaigns by spend and explain which are inefficient.",
  "For campaign 123456789, diagnose the last 30 days and recommend fixes.",
  "Write a GAQL report showing CTR, CPC, conversions, then explain it.",
];

export default function ChatThread({ threadId, initialAccount, initialMessages }: ChatThreadProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [input, setInput] = useState("");

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

  const { messages, sendMessage, status, error, stop, addToolApprovalResponse } =
    useChat<GoogleAdsAgentUIMessage>({
      id: threadId,
      transport,
      messages: initialMessages,
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    });

  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldScrollRef = useRef(false);
  const [isAtBottom, setIsAtBottom] = useState(true);

  // Auto-submit audit when redirected with ?auto=audit (first-signup OAuth flow)
  const autoFiredRef = useRef(false);
  useEffect(() => {
    if (autoFiredRef.current) return;
    if (messages.length !== 0) return;
    if (searchParams.get("auto") !== "audit") return;
    autoFiredRef.current = true;
    shouldScrollRef.current = true;
    sendMessage({ text: primaryPrompt });
    // Strip query param so refresh doesn't re-fire on navigation
    router.replace(`/chat/${threadId}`);
  }, [messages.length, searchParams, sendMessage, router, threadId]);

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
  } = useMcpTools(initialAccount.platform);

  const isSending = status === "submitted" || status === "streaming";
  const isEmpty = messages.length === 0;

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

  const handleSend = useCallback(
    (text: string) => {
      shouldScrollRef.current = true;
      sendMessage({ text });
    },
    [sendMessage],
  );

  const composer = (
    <form
      onSubmit={event => {
        event.preventDefault();
        if (!input.trim() || isSending) return;
        handleSend(input);
        setInput("");
      }}
      className="rounded-2xl border border-[#4a4a48] bg-[#2c2c2b] p-3"
    >
      <Input
        value={input}
        onChange={event => setInput(event.currentTarget.value)}
        placeholder={isEmpty ? "Ask anything…" : "Reply..."}
        disabled={isSending}
        autoFocus={isEmpty}
        className="h-11 border-0 bg-transparent px-2 text-base text-white shadow-none placeholder:text-[#8b8b89] focus-visible:ring-0"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={openTools}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#4a4a48] bg-[#222221] px-3 py-1.5 text-xs text-[#b0b0ae] transition-colors hover:border-[#6a6a68] hover:bg-[#3a3a39] hover:text-white"
        >
          <Wrench className="h-3.5 w-3.5" />
          {initialAccount.platform === "meta_ads" ? "Meta Ads MCP tools" : "Google Ads MCP tools"}
        </button>
        <div className="flex items-center gap-2">
          <UseInYourClaudePill platform={initialAccount.platform} surface="chat_page" />
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
              disabled={!input.trim()}
              className="h-9 w-9 rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </form>
  );

  return (
    <section className="flex h-full flex-col overflow-hidden bg-[#222221]">
      <header className="shrink-0 bg-[#222221]">
        <div className="flex w-full items-center justify-between px-6 py-3">
          <h1 className="text-base font-medium text-[#E8E4DD]/80">{currentTitle}</h1>
          {!isEmpty && (
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

      {isEmpty ? (
        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 md:px-6">
          <div className="mx-auto w-full max-w-3xl pb-10">
            <h1 className="text-center text-2xl font-medium text-white md:text-3xl">
              {initialAccount.platform === "meta_ads"
                ? "What can I help with your Meta Ads account today?"
                : "What can I help with your Google Ads account today?"}
            </h1>
            <div className="mt-8">{composer}</div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => handleSend(primaryPrompt)}
                className="rounded-xl border border-[#4a4a48] bg-[#2c2c2b] px-3 py-2 text-left text-xs leading-5 text-[#b0b0ae] transition-colors hover:bg-[#3a3a39] hover:text-white sm:col-span-2"
              >
                {primaryPrompt}
              </button>
              {secondaryPrompts.map(prompt => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handleSend(prompt)}
                  className="rounded-xl border border-[#4a4a48] bg-[#2c2c2b] px-3 py-2 text-left text-xs leading-5 text-[#b0b0ae] transition-colors hover:bg-[#3a3a39] hover:text-white"
                >
                  {prompt}
                </button>
              ))}
            </div>
            {error && (
              <div className="mt-3 rounded-lg bg-[#C45D4A]/10 px-4 py-3 text-sm text-[#C45D4A]">
                {error.message}
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          <div ref={scrollRef} onScroll={handleScroll} className="relative min-h-0 flex-1 overflow-y-auto">
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
              {isSending && messages[messages.length - 1].role === "user" && (
                <div className="mx-auto w-full max-w-3xl px-4 py-3 md:px-6">
                  <ThinkingIndicator />
                </div>
              )}
            </div>
          </div>

          <div className="relative shrink-0 bg-[#222221] px-4 pb-4 pt-2">
            {!isAtBottom && (
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
              {composer}
            </div>
          </div>
        </>
      )}

      <McpToolsSheet
        open={toolsOpen}
        onClose={() => setToolsOpen(false)}
        tools={tools}
        permissions={permissions}
        loading={toolsLoading}
        error={toolsError}
        onUpdate={updatePermissions}
      />

      {shareUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-2xl bg-[#2c2c2b] p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium text-white">Share chat</h2>
              <button
                type="button"
                onClick={() => setShareUrl(null)}
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
