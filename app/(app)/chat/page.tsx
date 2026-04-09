"use client";

import { DefaultChatTransport } from "ai";
import { useChat } from "@ai-sdk/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, Send, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GoogleAdsAgentUIMessage } from "@/lib/agents/google-ads-agent";
import { onThreadEvent } from "@/lib/thread-events";
import {
  getStoredActiveThreadId,
  getStoredChatThreads,
  persistChatThreads,
  setStoredActiveThreadId,
  type StoredChatThread,
} from "@/lib/chat-thread-store";
import type { Session } from "@/lib/session";
import { Message, ThinkingIndicator } from "@/components/chat/chat-shared";

type StoredAccount = {
  connected: boolean;
  customerId: string | null;
  customerName: string | null;
};

type ChatThread = StoredChatThread<GoogleAdsAgentUIMessage>;

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

function createThread(): ChatThread {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: "New chat",
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}

function loadThreads(): ChatThread[] {
  return getStoredChatThreads<GoogleAdsAgentUIMessage>();
}

function getMessageText(message: GoogleAdsAgentUIMessage): string {
  return message.parts
    .filter(part => part.type === "text")
    .map(part => part.text)
    .join(" ")
    .trim();
}

function getThreadTitle(messages: GoogleAdsAgentUIMessage[]): string {
  const firstUserMessage = messages.find(message => message.role === "user");
  const text = firstUserMessage ? getMessageText(firstUserMessage) : "";
  if (!text) return "New chat";
  return text.slice(0, 48);
}

function applyActiveThreadSnapshot(
  threads: ChatThread[],
  activeThreadId: string,
  messages: GoogleAdsAgentUIMessage[],
): ChatThread[] {
  return threads.map(thread =>
    thread.id === activeThreadId
      ? {
          ...thread,
          title: getThreadTitle(messages),
          updatedAt: new Date().toISOString(),
          messages,
        }
      : thread,
  );
}

// ── Main chat page ──────────────────────────────────────────────────

export default function ChatPage() {
  const [input, setInput] = useState("");
  const [account, setAccount] = useState<StoredAccount>(emptyAccount);
  const [isHydrated, setIsHydrated] = useState(false);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string>("");

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

  const { messages, sendMessage, setMessages, status, error, stop } =
    useChat<GoogleAdsAgentUIMessage>({
      id: activeThreadId || undefined,
      transport,
    });

  // Helper: notify layout sidebar that threads changed
  function syncToSidebar(nextThreads: ChatThread[], nextActiveId: string) {
    persistChatThreads(nextThreads, nextActiveId);
  }

  // ── Hydration ──
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const storedThreads = loadThreads();
      const initialThreads = storedThreads.length > 0 ? storedThreads : [createThread()];
      const preferredThreadId = getStoredActiveThreadId();
      const initialActiveThreadId =
        preferredThreadId && initialThreads.some(thread => thread.id === preferredThreadId)
          ? preferredThreadId
          : initialThreads[0].id;

      setAccount(emptyAccount);
      setThreads(initialThreads);
      setActiveThreadId(initialActiveThreadId);
      setIsHydrated(true);

      // Sync to sidebar
      syncToSidebar(initialThreads, initialActiveThreadId);

      readServerSession()
        .then(session => {
          if (session.connected) {
            setAccount({
              connected: true,
              customerId: session.customerId,
              customerName: session.customerName ?? "Google Ads Account",
            });
          }
        })
        .catch(() => {});
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  // ── Listen for sidebar events ──
  useEffect(() => {
    const unsubs = [
      onThreadEvent("select", (threadId) => {
        if (!threadId || threadId === activeThreadId) return;
        stop();
        setThreads(currentThreads =>
          applyActiveThreadSnapshot(currentThreads, activeThreadId, messages),
        );
        setActiveThreadId(threadId);
        setStoredActiveThreadId(threadId);
      }),
      onThreadEvent("create", () => {
        stop();
        const newThread = createThread();
        setThreads(currentThreads => {
          const syncedThreads = activeThreadId
            ? applyActiveThreadSnapshot(currentThreads, activeThreadId, messages)
            : currentThreads;
          return [newThread, ...syncedThreads];
        });
        setActiveThreadId(newThread.id);
        setInput("");
      }),
      onThreadEvent("delete", (threadId) => {
        if (!threadId) return;
        stop();
        setThreads(currentThreads => {
          const syncedThreads = activeThreadId
            ? applyActiveThreadSnapshot(currentThreads, activeThreadId, messages)
            : currentThreads;
          const nextThreads = syncedThreads.filter(thread => thread.id !== threadId);
          const fallbackThreads = nextThreads.length > 0 ? nextThreads : [createThread()];
          if (threadId === activeThreadId) {
            setActiveThreadId(fallbackThreads[0].id);
            setInput("");
          }
          return fallbackThreads;
        });
      }),
    ];
    return () => unsubs.forEach(u => u());
  }, [activeThreadId, messages, stop]);

  // ── Load messages when active thread changes ──
  useEffect(() => {
    if (!isHydrated || !activeThreadId) return;
    const activeThread = threads.find(thread => thread.id === activeThreadId);
    const frame = window.requestAnimationFrame(() => {
      setMessages(activeThread?.messages ?? []);
      setInput("");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeThreadId, isHydrated, setMessages, threads]);

  // ── Persist thread data on message changes ──
  useEffect(() => {
    if (!isHydrated) return;
    const nextThreads = activeThreadId
      ? applyActiveThreadSnapshot(threads, activeThreadId, messages)
      : threads;
    persistChatThreads(nextThreads, activeThreadId);
  }, [activeThreadId, isHydrated, messages, threads]);

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
    if (!shouldScrollRef.current) return;
    shouldScrollRef.current = false;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  const isReady = isHydrated && account.connected;
  const isSending = status === "submitted" || status === "streaming";
  const displayThreads = activeThreadId
    ? applyActiveThreadSnapshot(threads, activeThreadId, messages)
    : threads;

  return (
    <section className="flex h-full flex-col overflow-hidden bg-[#222221]">
      <header className="shrink-0 bg-[#222221]">
        <div className="flex w-full items-center gap-4 px-6 py-3">
          <h1 className="text-base font-medium text-[#E8E4DD]/80">
            {displayThreads.find(thread => thread.id === activeThreadId)?.title ??
              "New chat"}
          </h1>
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
            <div className="flex items-end gap-3">
              <Input
                value={input}
                onChange={event => setInput(event.currentTarget.value)}
                placeholder={isReady ? "Reply..." : "Connect Google Ads first..."}
                disabled={!isReady || isSending}
                className="h-11 border-0 bg-transparent px-2 text-base text-white shadow-none placeholder:text-[#8b8b89] focus-visible:ring-0"
              />
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
          </form>
        </div>
      </div>
    </section>
  );
}
