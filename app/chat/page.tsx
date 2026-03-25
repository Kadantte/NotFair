"use client";

import { DefaultChatTransport } from "ai";
import { useChat } from "@ai-sdk/react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bot,
  Loader2,
  Send,
  Sparkles,
  Square,
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

function ToolBlock({
  part,
}: {
  part: Extract<GoogleAdsAgentUIMessage["parts"][number], { type: string }>;
}) {
  if (!part.type.startsWith("tool-")) {
    return null;
  }

  const title = part.type.replace("tool-", "");

  if (!("state" in part) || part.state !== "output-available") {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-400">
        Running `{title}`...
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
      <div className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-blue-300">
        <Sparkles className="h-3.5 w-3.5 text-blue-400" />
        {title}
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs leading-6 text-zinc-300">
        {JSON.stringify("output" in part ? part.output : null, null, 2)}
      </pre>
    </div>
  );
}

function Message({ message }: { message: GoogleAdsAgentUIMessage }) {
  const isUser = message.role === "user";

  return (
    <div className="mx-auto flex w-full max-w-3xl gap-4 px-4 py-6">
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

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setAccount(readStoredAccount());
      setIsHydrated(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

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

  const { messages, sendMessage, status, error, stop } =
    useChat<GoogleAdsAgentUIMessage>({
      transport,
    });

  const isReady = isHydrated && Boolean(account.refreshToken && account.customerId);
  const isSending = status === "submitted" || status === "streaming";

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] opacity-[0.08]" />
        <div className="absolute left-[-8rem] top-20 h-80 w-80 rounded-full bg-blue-600/20 blur-[120px]" />
        <div className="absolute bottom-16 right-[-8rem] h-80 w-80 rounded-full bg-emerald-600/20 blur-[120px]" />
      </div>
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col">
        <header className="sticky top-0 z-10 border-b border-white/10 bg-black/50 backdrop-blur-xl">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
            <div className="flex items-center gap-3">
              <Link href="/">
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full text-zinc-400 hover:bg-white/5 hover:text-white"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div>
                <div className="text-sm font-medium text-white">AdsAgent Chat</div>
                <div className="text-xs text-zinc-500">
                  {isReady
                    ? account.customerName ?? account.customerId
                    : "Connect Google Ads to begin"}
                </div>
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

        <section className="flex flex-1 flex-col">
          <div className="flex-1">
            {messages.length === 0 ? (
              <div className="mx-auto flex min-h-[calc(100vh-180px)] w-full max-w-3xl flex-col items-center justify-center px-4 py-12 text-center">
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

                <div className="mt-8 grid w-full gap-3 sm:grid-cols-2">
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

          <div className="sticky bottom-0 border-t border-white/10 bg-black/70 px-4 py-4 backdrop-blur-xl">
            <div className="mx-auto max-w-3xl">
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

              <p className="mt-2 text-center text-xs text-zinc-500">
                {isReady
                  ? "Connected to live Google Ads data."
                  : !isHydrated
                    ? "Checking Google Ads connection..."
                    : "Connect a Google Ads account to send messages."}
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
