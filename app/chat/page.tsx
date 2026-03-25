"use client";

import { DefaultChatTransport } from "ai";
import { useChat } from "@ai-sdk/react";
import type { ElementType, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Loader2,
  Send,
  Sparkles,
  Square,
  User,
} from "lucide-react";
import { AppSidebar, type SidebarThread } from "@/components/app-sidebar";
import { GoogleAdsAuth } from "@/components/google-ads-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GoogleAdsAgentUIMessage } from "@/lib/agents/google-ads-agent";
import { ACTIVE_CHAT_THREAD_KEY, CHAT_HISTORY_KEY } from "@/lib/chat-history";

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

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const pattern =
    /(\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_)/g;
  const matches = text.split(pattern).filter(Boolean);

  return matches.map((part, index) => {
    const key = `${keyPrefix}-${index}`;

    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={key}
          className="rounded-md bg-white/8 px-1.5 py-0.5 font-mono text-[0.95em] text-zinc-100"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    if (
      (part.startsWith("**") && part.endsWith("**")) ||
      (part.startsWith("__") && part.endsWith("__"))
    ) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }

    if (
      (part.startsWith("*") && part.endsWith("*")) ||
      (part.startsWith("_") && part.endsWith("_"))
    ) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }

    const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);

    if (linkMatch) {
      return (
        <a
          key={key}
          href={linkMatch[2]}
          target="_blank"
          rel="noreferrer"
          className="text-blue-300 underline underline-offset-4 hover:text-blue-200"
        >
          {linkMatch[1]}
        </a>
      );
    }

    return part;
  });
}

function renderMarkdown(text: string): ReactNode[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const nodes: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const codeFenceMatch = /^```(\w+)?\s*$/.exec(line);
    if (codeFenceMatch) {
      const language = codeFenceMatch[1];
      index += 1;
      const codeLines: string[] = [];

      while (index < lines.length && !/^```/.test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }

      if (index < lines.length) {
        index += 1;
      }

      nodes.push(
        <pre
          key={`code-${nodes.length}`}
          className="overflow-x-auto rounded-2xl border border-zinc-800 bg-black/40 p-4 text-sm leading-6 text-zinc-200"
        >
          {language ? (
            <div className="mb-3 text-[11px] uppercase tracking-[0.16em] text-zinc-500">
              {language}
            </div>
          ) : null}
          <code>{codeLines.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const className =
        level === 1
          ? "text-3xl font-semibold text-white"
          : level === 2
            ? "text-2xl font-semibold text-white"
            : level === 3
              ? "text-xl font-semibold text-white"
              : "text-base font-semibold text-zinc-100";
      const Tag = `h${Math.min(level, 6)}` as ElementType;

      nodes.push(
        <Tag key={`heading-${nodes.length}`} className={className}>
          {renderInlineMarkdown(headingMatch[2], `heading-${nodes.length}`)}
        </Tag>,
      );
      index += 1;
      continue;
    }

    if (/^([-*_]){3,}\s*$/.test(line.trim())) {
      nodes.push(
        <hr key={`hr-${nodes.length}`} className="border-zinc-800" />,
      );
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];

      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }

      nodes.push(
        <blockquote
          key={`quote-${nodes.length}`}
          className="border-l-2 border-zinc-700 pl-4 text-zinc-300"
        >
          {quoteLines.map((quoteLine, quoteIndex) => (
            <p key={`quote-line-${quoteIndex}`}>
              {renderInlineMarkdown(quoteLine, `quote-${quoteIndex}`)}
            </p>
          ))}
        </blockquote>,
      );
      continue;
    }

    if (/^[-*+]\s+/.test(line)) {
      const items: string[] = [];

      while (index < lines.length && /^[-*+]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^[-*+]\s+/, ""));
        index += 1;
      }

      nodes.push(
        <ul
          key={`ul-${nodes.length}`}
          className="list-disc space-y-2 pl-6 text-zinc-100"
        >
          {items.map((item, itemIndex) => (
            <li key={`ul-item-${itemIndex}`}>
              {renderInlineMarkdown(item, `ul-${itemIndex}`)}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];

      while (index < lines.length && /^\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\d+\.\s+/, ""));
        index += 1;
      }

      nodes.push(
        <ol
          key={`ol-${nodes.length}`}
          className="list-decimal space-y-2 pl-6 text-zinc-100"
        >
          {items.map((item, itemIndex) => (
            <li key={`ol-item-${itemIndex}`}>
              {renderInlineMarkdown(item, `ol-${itemIndex}`)}
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    const paragraphLines: string[] = [];

    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^```/.test(lines[index]) &&
      !/^(#{1,6})\s+/.test(lines[index]) &&
      !/^>\s?/.test(lines[index]) &&
      !/^[-*+]\s+/.test(lines[index]) &&
      !/^\d+\.\s+/.test(lines[index]) &&
      !/^([-*_]){3,}\s*$/.test(lines[index].trim())
    ) {
      paragraphLines.push(lines[index]);
      index += 1;
    }

    nodes.push(
      <p key={`p-${nodes.length}`} className="text-[15px] leading-7 text-zinc-100">
        {renderInlineMarkdown(paragraphLines.join(" "), `p-${nodes.length}`)}
      </p>,
    );
  }

  return nodes;
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
                  className="space-y-4 text-[15px] leading-7 text-zinc-100"
                >
                  {renderMarkdown(part.text)}
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
      const preferredThreadId = localStorage.getItem(ACTIVE_CHAT_THREAD_KEY);
      const initialActiveThreadId =
        preferredThreadId &&
        initialThreads.some(thread => thread.id === preferredThreadId)
          ? preferredThreadId
          : initialThreads[0].id;

      setAccount(readStoredAccount());
      setThreads(initialThreads);
      setActiveThreadId(initialActiveThreadId);
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
    localStorage.setItem(ACTIVE_CHAT_THREAD_KEY, newThread.id);
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
    localStorage.setItem(ACTIVE_CHAT_THREAD_KEY, threadId);
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
        localStorage.setItem(ACTIVE_CHAT_THREAD_KEY, fallbackThreads[0].id);
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
        <AppSidebar
          currentPath="/chat"
          isCollapsed={isSidebarCollapsed}
          onToggleCollapsed={() => setIsSidebarCollapsed(current => !current)}
          onCreateThread={handleCreateThread}
          threads={sortedThreads.map<SidebarThread>(thread => ({
            id: thread.id,
            title: thread.title,
            updatedAt: thread.updatedAt,
            messageCount: thread.messages.length,
          }))}
          activeThreadId={activeThreadId}
          onSelectThread={handleSelectThread}
          onDeleteThread={handleDeleteThread}
        />

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
