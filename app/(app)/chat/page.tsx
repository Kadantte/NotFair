"use client";

import { DefaultChatTransport } from "ai";
import { useChat } from "@ai-sdk/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Send, Square } from "lucide-react";
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

  // Auto-scroll to bottom when messages change (streaming or new message)
  useEffect(() => {
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
    <section className="flex h-full flex-col overflow-hidden">
      <header className="shrink-0 border-b border-[#3D3C36] bg-[#24231F]/80 backdrop-blur-xl">
        <div className="flex w-full items-center gap-4 px-6 py-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#E8E4DD]">
              {displayThreads.find(thread => thread.id === activeThreadId)?.title ??
                "New chat"}
            </h1>
          </div>
        </div>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex min-h-full w-full flex-col items-center justify-center px-6 py-12 text-center">
            <div className="mb-6 inline-flex items-center rounded-full border border-[#4CAF6E]/30 bg-[#4CAF6E]/10 px-4 py-1.5 text-sm text-[#4CAF6E] shadow-[0_0_20px_rgba(76,175,110,0.16)]">
              <span className="mr-2 h-2 w-2 rounded-full bg-[#4CAF6E] shadow-[0_0_10px_rgba(76,175,110,0.5)]" />
              ADSAGENT COPILOT
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-5xl">
              How can I help with your Google Ads account?
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[#9B9689]">
              Ask for audits, campaign summaries, keyword analysis, or GAQL reports.
            </p>
            <div className="mt-8 grid w-full max-w-4xl gap-3 sm:grid-cols-2">
              {starterPrompts.map(prompt => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => setInput(prompt)}
                  className="rounded border border-[#3D3C36] bg-[#24231F] px-4 py-4 text-left text-sm leading-6 text-[#E8E4DD] transition hover:border-[#4CAF6E]/30 hover:bg-[#2E2D28]"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="divide-y divide-[#3D3C36]/50">
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
              <div className="flex w-full gap-4 px-6 py-6">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#4CAF6E]/30 bg-[#4CAF6E]/10 text-[#4CAF6E]">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="pt-0.5">
                  <ThinkingIndicator />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-[#3D3C36] bg-[#1A1917]/95 px-4 py-4 backdrop-blur-xl">
        <div className="w-full px-2">
          {error && (
            <div className="mb-3 rounded border border-[#C45D4A]/20 bg-[#C45D4A]/10 px-4 py-3 text-sm text-[#C45D4A]">
              {error.message}
            </div>
          )}
          <form
            onSubmit={event => {
              event.preventDefault();
              if (!input.trim() || !isReady || isSending) return;
              sendMessage({ text: input });
              setInput("");
            }}
            className="rounded-lg border border-[#3D3C36] bg-[#24231F] p-3 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]"
          >
            <div className="flex items-end gap-3">
              <Input
                value={input}
                onChange={event => setInput(event.currentTarget.value)}
                placeholder={isReady ? "Message AdsAgent" : "Connect Google Ads first..."}
                disabled={!isReady || isSending}
                className="h-12 border-0 bg-transparent px-2 text-[15px] text-[#E8E4DD] shadow-none placeholder:text-[#9B9689] focus-visible:ring-0"
              />
              {isSending ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => stop()}
                  className="h-10 w-10 rounded-full text-[#E8E4DD] hover:bg-[#2E2D28]"
                >
                  <Square className="h-4 w-4 fill-current" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={!isReady || !input.trim()}
                  className="h-10 w-10 rounded-full bg-[#4CAF6E] text-[#1A1917] hover:bg-[#3D9A5C]"
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
