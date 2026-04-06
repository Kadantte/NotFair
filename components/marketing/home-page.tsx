"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Link2,
  Sparkles,
  ShieldCheck,
  Terminal,
  DollarSign,
  FlaskConical,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/components/session-provider";
import { startGoogleConnect } from "@/lib/google-oauth";

const CYCLING_WORDS = ["Claude Code", "Claude", "AI agent"];
const CYCLE_INTERVAL_MS = 2500;

const intentCards = [
  {
    title: "Google Ads MCP for Claude",
    description:
      "Give Claude direct access to your Google Ads data through MCP. Campaign performance, keywords, search terms, bids — all available in natural language.",
    icon: Link2,
  },
  {
    title: "AI-powered campaign management",
    description:
      "Claude audits your campaigns, surfaces wasted spend, recommends optimizations, and executes changes — with your approval at every step.",
    icon: Sparkles,
  },
  {
    title: "Reviewable, trackable changes",
    description:
      "Every AI-made change is logged with before/after snapshots. Measure the impact of each optimization. Full audit trail.",
    icon: ShieldCheck,
  },
];

const claudeWorkflows = [
  {
    icon: Terminal,
    title: "Claude Code",
    description:
      "Connect AdsAgent as an MCP server in Claude Code. Run campaign audits, bulk keyword operations, and spend analysis directly from your terminal.",
  },
  {
    icon: Users,
    title: "Claude for Work",
    description:
      "Add AdsAgent to your team's Claude workspace. Share campaign insights, collaborate on optimizations, and maintain a shared audit trail.",
  },
  {
    icon: DollarSign,
    title: "Wasted spend recovery",
    description:
      "Ask Claude to analyze 90 days of search terms. It finds irrelevant queries bleeding budget and recommends negative keywords — typically recovering 15-25% of wasted spend.",
  },
  {
    icon: FlaskConical,
    title: "A/B test setup",
    description:
      "Describe an experiment in plain English. Claude creates the campaign structure, sets up the variants, and monitors statistical significance.",
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
      window.location.assign("/connect");
    } else {
      try {
        await startGoogleConnect("/connect");
      } catch {
        window.location.assign("/login?error=auth_failed");
      }
    }
  }

  return (
    <>
      {/* Hero */}
      <section className="relative flex min-h-[90vh] flex-col items-center justify-center overflow-hidden px-4 pb-20 pt-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="z-10 mx-auto flex max-w-3xl flex-col items-center space-y-8 text-center"
        >
          {/* Built for Claude badge */}
          <div className="flex items-center gap-2.5 rounded-full border border-[#3D3C36] bg-[#24231F] px-4 py-2">
            <Image
              src="/claude-icon.svg"
              alt="Claude"
              width={18}
              height={18}
              className="opacity-90"
            />
            <span className="text-sm font-medium tracking-wide text-[#9B9689]">
              Built for Claude
            </span>
          </div>

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
              The Google Ads MCP server for Claude. Connect your ad account,
              and let Claude analyze campaigns, optimize spend, and manage
              changes — all through natural conversation.
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
              By connecting Google Ads, you agree to our{" "}
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
              { step: "1", text: "Connect your Google Ads account" },
              {
                step: "2",
                text: "Add AdsAgent MCP server to Claude",
              },
              { step: "3", text: "Ask Claude to audit your campaigns" },
            ].map((item) => (
              <div
                key={item.step}
                className="flex items-start gap-3 text-left"
              >
                <span className="text-2xl font-bold text-[#3D3C36]">
                  {item.step}
                </span>
                <p className="pt-1 text-sm leading-relaxed text-[#9B9689]">
                  {item.text}
                </p>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* Video demo */}
      <section className="px-4 pb-20">
        <div className="container mx-auto max-w-5xl">
          <div className="mb-10 max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
              See it in action
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-4xl">
              AdsAgent MCP in Claude Code
            </h2>
          </div>
          <div className="overflow-hidden rounded-lg border border-[#3D3C36]">
            <div
              className="relative w-full"
              style={{ paddingBottom: "56.25%" }}
            >
              <iframe
                className="absolute inset-0 h-full w-full"
                src="https://www.youtube-nocookie.com/embed/_QM01o0N-TY"
                title="AdsAgent MCP in Claude Code"
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
                allow="encrypted-media; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      </section>

      {/* Claude workflows */}
      <section className="px-4 pb-20">
        <div className="container mx-auto max-w-5xl">
          <div className="mb-10 max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
              Built for Claude
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-4xl">
              Manage Google Ads from Claude Code
            </h2>
            <p className="mt-4 text-base leading-relaxed text-[#9B9689]">
              AdsAgent is a native MCP server designed for Claude. Connect it
              to Claude Code, Claude for Work, or any Claude-powered workflow
              and give your AI direct access to campaign data, optimization
              actions, and performance tracking.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {claudeWorkflows.map((card) => {
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

      {/* Conversation demo */}
      <section className="px-4 pb-20">
        <div className="container mx-auto max-w-5xl">
          <div className="rounded-lg border border-[#3D3C36] bg-[#24231F] p-6">
            <p className="font-mono text-sm text-[#9B9689]">
              <span className="text-[#4CAF6E]">you &rarr;</span>{" "}
              &quot;Pause all keywords with CPA above $50 and less than 2
              conversions in the last 30 days&quot;
            </p>
            <p className="mt-3 font-mono text-sm text-[#9B9689]">
              <span className="text-[#4CAF6E]">claude &rarr;</span>{" "}
              Found 23 keywords matching criteria. Pausing&hellip; done.
              Estimated monthly savings: $1,847.
            </p>
          </div>
        </div>
      </section>

      {/* What AdsAgent does */}
      <section className="px-4 pb-20">
        <div className="container mx-auto max-w-5xl">
          <div className="mb-10 max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
              What AdsAgent does
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-4xl">
              Google Ads MCP server for AI agents
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

      {/* Also works with */}
      <section className="px-4 pb-20">
        <div className="container mx-auto max-w-5xl">
          <div className="rounded-3xl border border-[#3D3C36] bg-[#24231F] p-8 text-center md:p-12">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#9B9689]">
              Also works with
            </p>
            <p className="mt-4 text-lg leading-relaxed text-[#E8E4DD]">
              AdsAgent uses the open MCP protocol. It works with any
              MCP-compatible AI client — including Cursor, Windsurf, and custom
              agents built with the Claude Agent SDK.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-6 text-sm text-[#9B9689]">
              <span>Cursor</span>
              <span className="h-1 w-1 rounded-full bg-[#3D3C36]" />
              <span>Windsurf</span>
              <span className="h-1 w-1 rounded-full bg-[#3D3C36]" />
              <span>Claude Agent SDK</span>
              <span className="h-1 w-1 rounded-full bg-[#3D3C36]" />
              <span>Any MCP client</span>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
