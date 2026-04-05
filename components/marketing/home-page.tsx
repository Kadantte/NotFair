"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Link2, Sparkles, ShieldCheck, Terminal, DollarSign, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/components/session-provider";
import { startGoogleConnect } from "@/lib/google-oauth";

const CYCLING_WORDS = ["Claude", "ChatGPT", "OpenClaw", "AI agent"];
const CYCLE_INTERVAL_MS = 2000;

const intentCards = [
  {
    title: "Google Ads MCP server",
    description: "Give your AI agent the capability to manage your Google Ads.",
    icon: Link2,
  },
  {
    title: "AI Google Ads agent",
    description: "Chat with an AI agent that audits campaigns, spots waste, and improves ads.",
    icon: Sparkles,
  },
  {
    title: "Safer optimization workflow",
    description: "Track every AI-made change, measure impact, and optimize on a platform you can trust.",
    icon: ShieldCheck,
  },
];

export function HomePage() {
  const session = useSession();
  const [wordIndex, setWordIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setWordIndex((i) => (i + 1) % CYCLING_WORDS.length);
    }, CYCLE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  async function handleCTA() {
    if (session.connected) {
      window.location.assign('/connect');
    } else {
      try {
        await startGoogleConnect('/connect');
      } catch {
        window.location.assign('/login?error=auth_failed');
      }
    }
  }

  return (
    <>
      <section className="relative flex min-h-[90vh] flex-col items-center justify-center overflow-hidden px-4 pb-20 pt-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="z-10 mx-auto flex max-w-3xl flex-col items-center space-y-8 text-center"
        >
          <h1 className="text-5xl font-bold leading-[1.0] tracking-tight drop-shadow-2xl md:text-7xl lg:text-8xl">
            <span className="block text-[#E8E4DD]">Let your</span>
            <span className="block h-[1.05em] overflow-hidden">
              <AnimatePresence mode="wait">
                <motion.span
                  key={wordIndex}
                  initial={{ opacity: 0, y: "100%" }}
                  animate={{ opacity: 1, y: "0%" }}
                  exit={{ opacity: 0, y: "-100%" }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  className="block text-[#4CAF6E]"
                >
                  {CYCLING_WORDS[wordIndex]}
                </motion.span>
              </AnimatePresence>
            </span>
            <span className="block text-[#E8E4DD]">manage your ads</span>
          </h1>

          <div className="max-w-2xl space-y-3">
            <p className="mx-auto max-w-xl text-lg font-light leading-relaxed tracking-wide text-[#9B9689] md:text-xl">
              Connect Google Ads to your AI via MCP and let it analyze, optimize, and improve your campaigns.
            </p>
          </div>

          <div className="flex flex-col items-center gap-4">
            <Button
              size="lg"
              onClick={handleCTA}
              className="h-14 rounded-full bg-[#4CAF6E] px-10 text-lg font-semibold text-[#1A1917] transition-all hover:scale-105 hover:bg-[#3D9A5C]"
            >
              {session.connected ? "Go to Connect" : "Connect Google Ads"}{" "}
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>

            <div className="flex items-center gap-6 text-sm text-[#9B9689]">
              <span>3 steps</span>
              <span className="h-1 w-1 rounded-full bg-[#3D3C36]" />
              <span>30 seconds</span>
              <span className="h-1 w-1 rounded-full bg-[#3D3C36]" />
              <span>Free</span>
            </div>

            <p className="max-w-md text-center text-sm leading-relaxed text-[#9B9689]">
              By connecting Google Ads, you agree to our{' '}
              {" "}
              <Link
                href="/privacy"
                className="font-medium text-[#E8E4DD] underline underline-offset-4 transition-colors hover:text-[#4CAF6E]"
              >
                Privacy Policy
              </Link>{" "}
              and{" "}
              <Link
                href="/terms"
                className="font-medium text-[#E8E4DD] underline underline-offset-4 transition-colors hover:text-[#4CAF6E]"
              >
                Terms of Service
              </Link>
              .
            </p>
          </div>

          <div className="mt-16 grid w-full max-w-2xl grid-cols-1 gap-6 md:grid-cols-3">
            {[
              { step: "1", text: "Connect Google Ads" },
              { step: "2", text: "Paste the setup prompt" },
              { step: "3", text: "Review and approve changes" },
            ].map((item) => (
              <div key={item.step} className="flex items-start gap-3 text-left">
                <span className="text-2xl font-bold text-[#3D3C36]">{item.step}</span>
                <p className="pt-1 text-sm leading-relaxed text-[#9B9689]">
                  {item.text}
                </p>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      <section className="px-4 pb-20">
        <div className="container mx-auto max-w-5xl">
          <div className="mb-10 max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
              See it in action
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-4xl">
              How to use AdsAgent MCP in Claude
            </h2>
          </div>
          <div className="overflow-hidden rounded-lg border border-[#3D3C36]">
            <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
              <iframe
                className="absolute inset-0 h-full w-full"
                src="https://www.youtube-nocookie.com/embed/_QM01o0N-TY"
                title="How to use AdsAgent MCP in Claude"
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
                allow="encrypted-media; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 pb-20">
        <div className="container mx-auto max-w-5xl">
          <div className="mb-10 max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
              What AdsAgent helps with
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-4xl">
              Google Ads access for AI agents
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {intentCards.map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.title}
                  className="rounded-3xl border border-[#3D3C36] bg-[#24231F] p-6"
                >
                  <Icon className="h-5 w-5 text-[#4CAF6E]" />
                  <h3 className="mt-4 text-xl font-semibold text-[#E8E4DD]">
                    {card.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-[#9B9689]">
                    {card.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 10X Efficiency with Claude Code */}
      <section className="px-4 pb-24">
        <div className="container mx-auto max-w-5xl">
          <div className="mb-10 max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
              10X your efficiency
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-4xl">
              Manage Google Ads from Claude Code
            </h2>
            <p className="mt-4 text-base leading-relaxed text-[#9B9689]">
              Stop clicking through the Google Ads UI. With AdsAgent MCP connected to Claude Code, you manage campaigns by describing what you want in plain English.
            </p>
          </div>

          <div className="grid gap-px overflow-hidden rounded-lg border border-[#3D3C36] bg-[#3D3C36] md:grid-cols-2">
            {[
              {
                icon: Terminal,
                title: "Bulk operations in seconds",
                description:
                  "Pause 50 underperforming keywords, adjust bids across ad groups, add negatives in bulk — one sentence instead of 30 minutes of clicking.",
              },
              {
                icon: Terminal,
                title: "Campaign audits on demand",
                description:
                  "Ask Claude to audit your account. It pulls search terms, flags wasted spend, finds missing negatives, and suggests bid changes — all in one conversation.",
              },
              {
                icon: Terminal,
                title: "Ad copy iteration at speed",
                description:
                  "Generate RSA variants, test new headlines, swap descriptions — Claude writes the copy and pushes it live, you just approve.",
              },
              {
                icon: Terminal,
                title: "Scheduled workflows",
                description:
                  "Set up recurring checks: weekly search term reviews, daily budget monitoring, monthly performance reports. Claude Code runs them on autopilot.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="flex gap-4 bg-[#24231F] p-6"
              >
                <item.icon className="mt-0.5 h-5 w-5 shrink-0 text-[#4CAF6E]" />
                <div>
                  <h3 className="text-lg font-semibold text-[#E8E4DD]">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#9B9689]">
                    {item.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-lg border border-[#3D3C36] bg-[#24231F] p-6">
            <p className="font-mono text-sm text-[#9B9689]">
              <span className="text-[#4CAF6E]">you →</span>{" "}
              &quot;Pause all keywords with CPA above $50 and less than 2 conversions in the last 30 days&quot;
            </p>
            <p className="mt-3 font-mono text-sm text-[#9B9689]">
              <span className="text-[#4CAF6E]">claude →</span>{" "}
              Found 23 keywords matching criteria. Pausing… done. Estimated monthly savings: $1,847.
            </p>
          </div>
        </div>
      </section>

      {/* Save Money */}
      <section className="px-4 pb-24">
        <div className="container mx-auto max-w-5xl">
          <div className="mb-10 max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
              Cut wasted spend
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-4xl">
              Stop bleeding money on bad clicks
            </h2>
            <p className="mt-4 text-base leading-relaxed text-[#9B9689]">
              Most Google Ads accounts waste 20–40% of budget on irrelevant search terms, overbid keywords, and zombie campaigns. AdsAgent finds the leaks.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                icon: DollarSign,
                title: "Search term mining",
                description:
                  "Claude reviews your search term reports, identifies irrelevant queries burning budget, and adds them as negatives — weekly, automatically.",
              },
              {
                icon: DollarSign,
                title: "Bid optimization",
                description:
                  "Spot keywords where you're overpaying for position 1 when position 2 converts the same. Lower bids, same results, less spend.",
              },
              {
                icon: DollarSign,
                title: "Zombie campaign cleanup",
                description:
                  "Find campaigns and ad groups with spend but no conversions. Pause them, reallocate budget to what works, and stop funding dead weight.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-lg border border-[#3D3C36] bg-[#24231F] p-6"
              >
                <item.icon className="h-5 w-5 text-[#4CAF6E]" />
                <h3 className="mt-4 text-lg font-semibold text-[#E8E4DD]">
                  {item.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-[#9B9689]">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Experiments & Iteration */}
      <section className="px-4 pb-24">
        <div className="container mx-auto max-w-5xl">
          <div className="mb-10 max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
              Iterate faster
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-4xl">
              Set up experiments in minutes, not days
            </h2>
            <p className="mt-4 text-base leading-relaxed text-[#9B9689]">
              The fastest way to improve Google Ads is to run more experiments. AdsAgent makes the setup instant so you can focus on learning, not logistics.
            </p>
          </div>

          <div className="space-y-4">
            {[
              {
                step: "1",
                title: "Describe the experiment",
                description:
                  "Tell Claude what you want to test: \"Split test my top campaign — same keywords, two ad groups with different landing pages.\"",
              },
              {
                step: "2",
                title: "Claude sets it up",
                description:
                  "It creates the campaign structure, duplicates keywords, writes ad variants, sets budgets — you review and approve each change before it goes live.",
              },
              {
                step: "3",
                title: "Monitor and decide",
                description:
                  "Ask Claude for a daily performance comparison. When you have a winner, it pauses the loser and scales the winner — one sentence.",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="flex gap-6 rounded-lg border border-[#3D3C36] bg-[#24231F] p-6"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#4CAF6E] font-mono text-sm font-semibold text-[#4CAF6E]">
                  {item.step}
                </span>
                <div>
                  <h3 className="text-lg font-semibold text-[#E8E4DD]">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#9B9689]">
                    {item.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-col items-center gap-4">
            <Button
              size="lg"
              onClick={handleCTA}
              className="h-14 rounded-full bg-[#4CAF6E] px-10 text-lg font-semibold text-[#1A1917] transition-all hover:scale-105 hover:bg-[#3D9A5C]"
            >
              {session.connected ? "Go to Connect" : "Get Started — Free"}{" "}
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
