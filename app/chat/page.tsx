"use client";

import { DefaultChatTransport } from "ai";
import { useChat } from "@ai-sdk/react";
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Send,
  Sparkles,
  Square,
  Trash2,
  User,
} from "lucide-react";
import { GoogleAdsAuth } from "@/components/google-ads-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GoogleAdsAgentUIMessage } from "@/lib/agents/google-ads-agent";

type StoredAccount = {
  refreshToken: string | null;
  customerId: string | null;
  customerName: string | null;
};

type ChatThread = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: GoogleAdsAgentUIMessage[];
};

const CHAT_HISTORY_KEY = "adsagent_chat_history_v1";
const emptyAccount: StoredAccount = {
  refreshToken: null,
  customerId: null,
  customerName: null,
};

const starterPrompts = [
  "Audit my connected account and tell me the 3 biggest optimization opportunities.",
  "List my top 10 campaigns by spend and explain which ones are inefficient.",
  "For campaign 123456789, summarize the last 30 days and tell me what to change.",
  "Write a GAQL report to show campaign CTR, CPC, and conversions, then explain it.",
];

function readStoredAccount(): StoredAccount {
  return {
    refreshToken: localStorage.getItem("google_ads_refresh_token"),
    customerId: localStorage.getItem("google_ads_customer_id"),
    customerName: localStorage.getItem("google_ads_customer_name"),
  };
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
  const raw = localStorage.getItem(CHAT_HISTORY_KEY);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(thread =>
      thread &&
      typeof thread.id === "string" &&
      typeof thread.title === "string" &&
      Array.isArray(thread.messages),
    );
  } catch {
    return [];
  }
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

  if (!text) {
    return "New chat";
  }

  return text.slice(0, 48);
}

function formatThreadTime(isoString: string): string {
  const date = new Date(isoString);

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
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

function ToolBlock({
  part,
}: {
  part: Extract<GoogleAdsAgentUIMessage["parts"][number], { type: string }>;
}) {
  const [isOpen, setIsOpen] = useState(false);

  if (!part.type.startsWith("tool-")) {
    return null;
  }

  const title = part.type.replace("tool-", "");

  if (!("state" in part) || part.state !== "output-available") {
    return (
      <button
        type="button"
        className="flex w-full items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-left text-sm text-zinc-400"
      >
        <Sparkles className="h-3.5 w-3.5 text-blue-400" />
        <span className="font-medium text-zinc-200">{title}</span>
        <span className="text-zinc-500">Running...</span>
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70">
      <button
        type="button"
        onClick={() => setIsOpen(current => !current)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-zinc-500" />
        ) : (
          <ChevronRight className="h-4 w-4 text-zinc-500" />
        )}
        <Sparkles className="h-3.5 w-3.5 text-blue-400" />
        <span className="text-sm font-medium text-zinc-100">{title}</span>
      </button>

      {isOpen && (
        <div className="border-t border-zinc-800 px-4 py-4">
          <pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs leading-6 text-zinc-300">
            {JSON.stringify("output" in part ? part.output : null, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function Message({ message }: { message: GoogleAdsAgentUIMessage }) {
  const isUser = message.role === "user";

  return (
    <div className="flex w-full gap-4 px-6 py-6">
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
          isUser
            ? "border-zinc-700 bg-zinc-800 text-zinc-200"
            : "border-blue-500/30 bg-blue-500/10 text-blue-300"
        }`}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      <div className="min-w-0 flex-1 space-y-3 pt-0.5">
        {message.parts.map((part, index) => {
          switch (part.type) {
            case "text":
              return (
                <div
                  key={`${message.id}-${index}`}
                  className="whitespace-pre-wrap text-[15px] leading-7 text-zinc-100"
                >
                  {part.text}
                </div>
              );
            default:
              if (!part.type.startsWith("tool-")) {
                return null;
              }

              return (
                <ToolBlock
                  key={`${message.id}-${index}`}
                  part={part as Extract<
                    GoogleAdsAgentUIMessage["parts"][number],
                    { type: string }
                  >}
                />
              );
          }
        })}
      </div>
    </div>
  );
}

export default function ChatPage() {
  const [input, setInput] = useState("");
  const [account, setAccount] = useState<StoredAccount>(emptyAccount);
  const [isHydrated, setIsHydrated] = useState(false);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string>("");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ id, messages, trigger, messageId }) => ({
          headers: (() => {
            const currentAccount =
              typeof window === "undefined" ? emptyAccount : readStoredAccount();

            return {
              "X-Google-Ads-Refresh-Token": currentAccount.refreshToken ?? "",
              "X-Google-Ads-Customer-Id": currentAccount.customerId ?? "",
            };
          })(),
          body: {
            id,
            messageId,
            trigger,
            messages,
            refreshToken:
              typeof window === "undefined"
                ? null
                : readStoredAccount().refreshToken,
            customerId:
              typeof window === "undefined"
                ? null
                : readStoredAccount().customerId,
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

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const storedThreads = loadThreads();
      const initialThreads = storedThreads.length > 0 ? storedThreads : [createThread()];

      setAccount(readStoredAccount());
      setThreads(initialThreads);
      setActiveThreadId(initialThreads[0].id);
      setIsHydrated(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!isHydrated || !activeThreadId) {
      return;
    }

    const activeThread = threads.find(thread => thread.id === activeThreadId);

    const frame = window.requestAnimationFrame(() => {
      setMessages(activeThread?.messages ?? []);
      setInput("");
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeThreadId, isHydrated, setMessages, threads]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    const nextThreads = activeThreadId
      ? applyActiveThreadSnapshot(threads, activeThreadId, messages)
      : threads;

    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(nextThreads));
  }, [activeThreadId, isHydrated, messages, threads]);

  const isReady = isHydrated && Boolean(account.refreshToken && account.customerId);
  const isSending = status === "submitted" || status === "streaming";
  const displayThreads = activeThreadId
    ? applyActiveThreadSnapshot(threads, activeThreadId, messages)
    : threads;
  const sortedThreads = [...displayThreads].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  function handleCreateThread() {
    stop();
    const newThread = createThread();

    setThreads(currentThreads => {
      const syncedThreads = activeThreadId
        ? applyActiveThreadSnapshot(currentThreads, activeThreadId, messages)
        : currentThreads;
      const nextThreads = [newThread, ...syncedThreads];
      localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(nextThreads));
      return nextThreads;
    });
    setActiveThreadId(newThread.id);
    setInput("");
  }

  function handleSelectThread(threadId: string) {
    if (threadId === activeThreadId) {
      return;
    }

    stop();
    setThreads(currentThreads =>
      applyActiveThreadSnapshot(currentThreads, activeThreadId, messages),
    );
    setActiveThreadId(threadId);
  }

  function handleDeleteThread(threadId: string) {
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

      localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(fallbackThreads));
      return fallbackThreads;
    });
  }

  return (
    <main className="h-screen overflow-hidden bg-black text-white">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] opacity-[0.08]" />
        <div className="absolute left-[-8rem] top-20 h-80 w-80 rounded-full bg-blue-600/20 blur-[120px]" />
        <div className="absolute bottom-16 right-[-8rem] h-80 w-80 rounded-full bg-emerald-600/20 blur-[120px]" />
      </div>

      <div
        className={`relative grid h-screen w-full overflow-hidden transition-[grid-template-columns] duration-300 ease-out ${
          isSidebarCollapsed
            ? "lg:grid-cols-[72px_minmax(0,1fr)]"
            : "lg:grid-cols-[280px_minmax(0,1fr)]"
        }`}
      >
        <aside className="border-b border-white/8 bg-[#171717] transition-all duration-300 ease-out lg:border-b-0 lg:border-r lg:border-r-white/8">
          <div className="flex h-screen flex-col">
            <div className="shrink-0 p-4">
              <div
                className={`group relative flex items-center transition-all duration-300 ease-out ${
                  isSidebarCollapsed ? "justify-center" : "justify-between gap-2"
                }`}
              >
                <Link
                  href="/"
                  className={`inline-flex items-center rounded-xl px-1 py-1 transition ${
                    isSidebarCollapsed
                      ? "opacity-100 group-hover:opacity-0"
                      : "hover:bg-white/5"
                  }`}
                >
                  <Image src="/logo.svg" alt="AdsAgent" width={24} height={24} />
                </Link>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setIsSidebarCollapsed(current => !current)}
                  className={`rounded-full text-zinc-400 transition-all duration-300 ease-out hover:bg-white/5 hover:text-white ${
                    isSidebarCollapsed
                      ? "pointer-events-none absolute left-1/2 -translate-x-1/2 opacity-0 group-hover:pointer-events-auto group-hover:opacity-100"
                      : ""
                  }`}
                >
                  {isSidebarCollapsed ? (
                    <PanelLeftOpen className="h-4 w-4" />
                  ) : (
                    <PanelLeftClose className="h-4 w-4" />
                  )}
                </Button>
              </div>

              <div
                className={`mt-6 space-y-1 ${
                  isSidebarCollapsed ? "flex flex-col items-center" : ""
                }`}
              >
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleCreateThread}
                  className={`h-12 rounded-2xl px-3 text-white transition-all duration-300 ease-out hover:bg-white/6 hover:text-white ${
                    isSidebarCollapsed
                      ? "w-12 justify-center gap-0 self-center px-0"
                      : "w-full justify-start"
                  }`}
                >
                  <Plus className="h-5 w-5" />
                  <span
                    className={`overflow-hidden whitespace-nowrap text-[15px] transition-all duration-300 ease-out ${
                      isSidebarCollapsed ? "max-w-0 opacity-0" : "ml-4 max-w-32 opacity-100"
                    }`}
                  >
                    New chat
                  </span>
                </Button>
              </div>
            </div>

            <div
              className={`min-h-0 flex-1 overflow-y-auto px-3 pb-4 transition-opacity duration-200 ${
                isSidebarCollapsed ? "hidden" : "block"
              }`}
            >
              {sortedThreads.map(thread => (
                <div
                  key={thread.id}
                  onClick={() => {
                    if (isSidebarCollapsed) {
                      handleSelectThread(thread.id);
                    }
                  }}
                  className={`mb-1 rounded-2xl transition ${
                    thread.id === activeThreadId
                      ? "bg-white/8"
                      : "bg-transparent hover:bg-white/[0.05]"
                  }`}
                >
                  <div
                    className={`flex min-h-12 p-3 transition-all duration-300 ease-out ${
                      isSidebarCollapsed ? "items-center justify-center" : "items-start gap-2"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectThread(thread.id)}
                      className={`min-w-0 flex-1 text-left ${
                        isSidebarCollapsed ? "hidden" : "block"
                      }`}
                    >
                      {!isSidebarCollapsed && (
                        <>
                          <div className="truncate text-[14px] font-medium text-zinc-100">
                            {thread.title}
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-500">
                            <span>{formatThreadTime(thread.updatedAt)}</span>
                            <span>·</span>
                            <span>{thread.messages.length} messages</span>
                          </div>
                        </>
                      )}
                    </button>
                    {!isSidebarCollapsed && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={event => {
                          event.stopPropagation();
                          handleDeleteThread(thread.id);
                        }}
                        className="shrink-0 rounded-full text-zinc-500 hover:bg-white/10 hover:text-zinc-200"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <section className="flex min-h-0 h-screen flex-col overflow-hidden">
          <header className="shrink-0 border-b border-white/10 bg-black/50 backdrop-blur-xl">
            <div className="flex w-full items-center justify-between gap-4 px-6 py-3">
              <div>
                <div className="text-sm font-medium text-white">
                  {displayThreads.find(thread => thread.id === activeThreadId)?.title ??
                    "New chat"}
                </div>
                <div className="text-xs text-zinc-500">
                  {isReady
                    ? account.customerName ?? account.customerId
                    : "Connect Google Ads to begin"}
                </div>
              </div>

              <GoogleAdsAuth
                onConnect={() => {
                  setAccount(readStoredAccount());
                }}
                onDisconnect={() => {
                  setAccount(emptyAccount);
                }}
                variant="outline"
                size="sm"
                className="rounded-full border-white/15 bg-white/5 text-white hover:bg-white/10"
              />
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {messages.length === 0 ? (
              <div className="flex min-h-full w-full flex-col items-center justify-center px-6 py-12 text-center">
                <div className="mb-6 inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-sm text-blue-300 shadow-[0_0_20px_rgba(59,130,246,0.16)]">
                  <span className="mr-2 h-2 w-2 rounded-full bg-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
                  ADSAGENT COPILOT
                </div>
                <h1 className="text-3xl font-semibold tracking-tight text-white md:text-5xl">
                  How can I help with your Google Ads account?
                </h1>
                <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">
                  Ask for audits, campaign summaries, keyword analysis, or GAQL
                  reports.
                </p>

                <div className="mt-8 grid w-full max-w-4xl gap-3 sm:grid-cols-2">
                  {starterPrompts.map(prompt => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => setInput(prompt)}
                      className="rounded-3xl border border-zinc-800 bg-zinc-900/50 px-4 py-4 text-left text-sm leading-6 text-zinc-300 transition hover:border-zinc-700 hover:bg-zinc-900/80"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {messages.map(message => (
                  <Message key={message.id} message={message} />
                ))}
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-white/10 bg-black/70 px-4 py-4 backdrop-blur-xl">
            <div className="w-full px-2">
              {error && (
                <div className="mb-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {error.message}
                </div>
              )}

              <form
                onSubmit={event => {
                  event.preventDefault();

                  if (!input.trim() || !isReady || isSending) {
                    return;
                  }

                  sendMessage({ text: input });
                  setInput("");
                }}
                className="rounded-[28px] border border-zinc-800 bg-zinc-900/80 p-3 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]"
              >
                <div className="flex items-end gap-3">
                  <Input
                    value={input}
                    onChange={event => setInput(event.currentTarget.value)}
                    placeholder={
                      isReady
                        ? "Message AdsAgent"
                        : "Connect Google Ads first..."
                    }
                    disabled={!isReady || isSending}
                    className="h-12 border-0 bg-transparent px-2 text-[15px] text-white shadow-none placeholder:text-zinc-500 focus-visible:ring-0"
                  />

                  {isSending ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => stop()}
                      className="h-10 w-10 rounded-full text-zinc-300 hover:bg-white/5"
                    >
                      <Square className="h-4 w-4 fill-current" />
                    </Button>
                  ) : (
                    <Button
                      type="submit"
                      disabled={!isReady || !input.trim()}
                      className="h-10 w-10 rounded-full bg-white text-black hover:bg-zinc-200"
                    >
                      {isSending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                </div>
              </form>

            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
