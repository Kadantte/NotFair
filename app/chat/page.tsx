"use client";

import { DefaultChatTransport } from "ai";
import { useChat } from "@ai-sdk/react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bot, Loader2, Send, Sparkles, User } from "lucide-react";
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

function readStoredAccount(): StoredAccount {
  return {
    refreshToken: localStorage.getItem("google_ads_refresh_token"),
    customerId: localStorage.getItem("google_ads_customer_id"),
    customerName: localStorage.getItem("google_ads_customer_name"),
  };
}

function ToolBlock({ part }: { part: Extract<GoogleAdsAgentUIMessage["parts"][number], { type: string }> }) {
  if (!part.type.startsWith("tool-")) {
    return null;
  }

  const title = part.type.replace("tool-", "");

  if (!("state" in part) || part.state !== "output-available") {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 px-4 py-3 text-sm text-zinc-400">
        Running `{title}`...
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
        <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
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
    <div className={`flex gap-4 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
          <Bot className="h-4 w-4" />
        </div>
      )}

      <div
        className={`max-w-3xl space-y-3 rounded-[28px] border px-5 py-4 ${
          isUser
            ? "border-white/10 bg-white text-black"
            : "border-zinc-800 bg-zinc-900/70 text-zinc-100"
        }`}
      >
        {message.parts.map((part, index) => {
          switch (part.type) {
            case "text":
              return (
                <div
                  key={`${message.id}-${index}`}
                  className={`whitespace-pre-wrap text-sm leading-7 ${
                    isUser ? "text-black" : "text-zinc-100"
                  }`}
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

      {isUser && (
        <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white">
          <User className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}

const starterPrompts = [
  "Audit my connected account and tell me the 3 biggest optimization opportunities.",
  "List my top 10 campaigns by spend and explain which ones are inefficient.",
  "For campaign 123456789, summarize the last 30 days and tell me what to change.",
  "Write a GAQL report to show campaign CTR, CPC, and conversions, then explain it.",
];

export default function ChatPage() {
  const [input, setInput] = useState("");
  const [account, setAccount] = useState<StoredAccount>(emptyAccount);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setAccount(readStoredAccount());
    setIsHydrated(true);
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

  return (
    <main className="min-h-screen bg-[#050816] text-white">
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.18),transparent_30%),radial-gradient(circle_at_80%_20%,_rgba(59,130,246,0.18),transparent_28%),linear-gradient(180deg,#07111f_0%,#050816_50%,#02040a_100%)]" />

      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6 md:px-8">
        <header className="mb-6 flex flex-col gap-4 rounded-[28px] border border-white/10 bg-white/5 px-5 py-4 backdrop-blur-xl md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon" className="rounded-full text-zinc-300 hover:bg-white/10 hover:text-white">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300/80">
                Google Ads Copilot
              </p>
              <h1 className="text-2xl font-semibold tracking-tight text-white">
                Chat with your ads account
              </h1>
            </div>
          </div>

          <div className="flex flex-col items-start gap-3 md:items-end">
            <GoogleAdsAuth
              onConnect={() => {
                setAccount(readStoredAccount());
              }}
              onDisconnect={() => {
                setAccount({
                  refreshToken: null,
                  customerId: null,
                  customerName: null,
                });
              }}
              variant="outline"
              size="sm"
            />
            <p className="text-xs text-zinc-500">
              {!isHydrated
                ? "Checking Google Ads connection..."
                : isReady
                ? `Connected to ${account.customerName ?? account.customerId}`
                : "Connect a Google Ads account to start."}
            </p>
          </div>
        </header>

        <div className="flex flex-1">
          <section className="flex min-h-[70vh] w-full flex-col rounded-[32px] border border-white/10 bg-white/5 backdrop-blur-xl">
            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 md:px-6">
              {messages.length === 0 ? (
                <div className="flex h-full min-h-[420px] flex-col items-center justify-center text-center">
                  <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-[24px] border border-cyan-400/30 bg-cyan-500/10 text-cyan-300">
                    <Bot className="h-7 w-7" />
                  </div>
                  <h2 className="text-3xl font-semibold tracking-tight text-white">
                    Ask anything about your Google Ads account
                  </h2>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-400">
                    This first version is wired to real Google Ads reporting tools:
                    account context, campaigns, campaign performance, keywords,
                    and safe GAQL queries.
                  </p>
                  <div className="mt-8 w-full max-w-4xl text-left">
                    <p className="mb-3 text-center text-xs font-semibold uppercase tracking-[0.24em] text-zinc-500">
                      Suggested asks
                    </p>
                    <div className="grid gap-3 md:grid-cols-2">
                      {starterPrompts.map(prompt => (
                        <button
                          key={prompt}
                          type="button"
                          onClick={() => setInput(prompt)}
                          className="w-full rounded-2xl border border-white/8 bg-black/20 px-4 py-3 text-left text-sm leading-6 text-zinc-300 transition hover:border-cyan-400/30 hover:bg-cyan-500/5 hover:text-white"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                messages.map(message => (
                  <Message key={message.id} message={message} />
                ))
              )}
            </div>

            <div className="border-t border-white/10 px-4 py-4 md:px-6">
              {error && (
                <div className="mb-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {error.message}
                </div>
              )}

              <form
                onSubmit={event => {
                  event.preventDefault();

                  if (!input.trim() || !isReady) {
                    return;
                  }

                  sendMessage({ text: input });
                  setInput("");
                }}
                className="rounded-[28px] border border-white/10 bg-black/30 p-3"
              >
                <div className="flex flex-col gap-3 md:flex-row">
                  <Input
                    value={input}
                    onChange={event => setInput(event.currentTarget.value)}
                    placeholder={
                      isReady
                        ? "Ask for an audit, campaign summary, keyword analysis, or GAQL report..."
                        : "Connect Google Ads first..."
                    }
                    disabled={!isReady || status === "submitted" || status === "streaming"}
                    className="h-12 border-white/10 bg-transparent text-sm text-white placeholder:text-zinc-500"
                  />
                  <div className="flex gap-2">
                    {(status === "submitted" || status === "streaming") && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => stop()}
                        className="h-12 border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10"
                      >
                        Stop
                      </Button>
                    )}
                    <Button
                      type="submit"
                      disabled={!isReady || !input.trim()}
                      className="h-12 min-w-32 rounded-2xl bg-white text-black hover:bg-zinc-200"
                    >
                      {status === "submitted" || status === "streaming" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      Send
                    </Button>
                  </div>
                </div>
              </form>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
