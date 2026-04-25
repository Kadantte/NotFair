"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  ArrowUp,
  Briefcase,
  ChevronDown,
  ChevronRight,
  Check,
  Clock3,
  Eye,
  Layers,
  Loader2,
  Shield,
  Store,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useSession } from "@/components/session-provider";
import { fadeInUp, AuditCTA } from "@/components/marketing/audit-cta";
import { GitHubStarBadge } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { startGoogleConnect } from "@/lib/google-oauth";
import { trackEvent } from "@/lib/analytics";
import { PricingSection, type PricingSectionProps } from "./pricing-cards";

function ConnectClaudeCTA({
  session,
  label,
  returnTo = "/connect",
  position,
}: {
  session: { connected: boolean };
  label?: string;
  returnTo?: string;
  position: "hero" | "final";
}) {
  const [loading, setLoading] = useState(false);

  function handleClick() {
    if (loading) return;
    setLoading(true);
    trackEvent("cta_clicked", {
      page: "homepage",
      cta: "connect_claude",
      position,
      destination: returnTo,
      requires_auth: !session.connected,
    });
    if (session.connected) {
      window.location.assign(returnTo);
    } else {
      startGoogleConnect(returnTo);
    }
  }

  return (
    <Button
      onClick={handleClick}
      disabled={loading}
      className="h-12 rounded-full bg-[#4CAF6E] px-7 text-base font-semibold text-black transition-all hover:scale-[1.02] hover:bg-[#3D9A5C] disabled:opacity-70 sm:px-8"
    >
      {loading ? (
        <span className="inline-flex items-center gap-2">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-black border-t-transparent" />
          Connecting...
        </span>
      ) : (
        <>
          {label ?? "Start now"}
          {!label && <ArrowRight className="ml-1 h-5 w-5" />}
        </>
      )}
    </Button>
  );
}

const useCases = [
  {
    prompt: "Where did we waste money this week?",
    answer: "$1,847 went to search terms with zero conversions. Add 23 negatives and lower 4 bids.",
  },
  {
    prompt: "Which clients need attention today?",
    answer: "3 accounts are over CPA target. Two are search-term drift; one has a broken landing page.",
  },
  {
    prompt: "What is actually driving booked jobs?",
    answer: "Campaign A has cheap leads, but Campaign C creates 41% more closed revenue from CRM data.",
  },
];

const flowSteps = [
  {
    title: "Connect",
    desc: "Google Ads first. Add GA4, Search Console, or CRM when ready.",
    visual: "sources",
  },
  {
    title: "Ask",
    desc: "Use Claude like your ads analyst: performance, waste, budget, copy, clients.",
    visual: "prompts",
  },
  {
    title: "Approve",
    desc: "Claude proposes fixes. You approve before anything changes.",
    visual: "approve",
  },
] as const;

const capabilityCards = [
  {
    icon: Eye,
    title: "Know anything",
    desc: "Campaigns, search terms, CPA, ROAS, budgets, quality score, change impact.",
  },
  {
    icon: Zap,
    title: "Optimize tirelessly",
    desc: "Find waste, add negatives, adjust bids, draft ads, monitor drift.",
  },
  {
    icon: Layers,
    title: "Connect the stack",
    desc: "See which ad clicks become real leads, pipeline, bookings, and revenue.",
  },
];

const audienceCards = [
  {
    icon: Briefcase,
    title: "Agencies",
    desc: "Give every client the attention your best strategist gives your biggest accounts.",
    bullets: ["Weekly audits in minutes", "Consistent playbook", "More accounts per strategist"],
  },
  {
    icon: Store,
    title: "Small business owners",
    desc: "Finally know whether Google is helping you grow or quietly burning cash.",
    bullets: ["No PPC dashboard to learn", "Plain-English answers", "No retainer required"],
  },
];

const faqs = [
  {
    q: "Will AdsAgent make changes without approval?",
    a: "No. Claude can analyze freely, but write actions are shown before they run. You approve the changes.",
  },
  {
    q: "Do I need to know Google Ads?",
    a: "No. Ask plain-English questions. AdsAgent handles the Google Ads API details behind Claude.",
  },
  {
    q: "Is this for agencies or business owners?",
    a: "Both. Agencies use it to scale high-quality analysis across accounts. Owners use it to understand and improve their own spend without hiring a full agency.",
  },
  {
    q: "What systems can it analyze together?",
    a: "Google Ads today, with workflows built around GA4, Search Console, CRM, landing pages, and other MCP-compatible tools.",
  },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-[#3D3C36]">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-4 py-5 text-left"
        aria-expanded={open}
      >
        <span className="text-base font-medium text-[#E8E4DD]">{q}</span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-[#C4C0B6] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <p className="pb-5 text-sm leading-relaxed text-[#C4C0B6]">{a}</p>
      )}
    </div>
  );
}

const chatTimeline = [
  { key: "send", at: 300 },
  { key: "user", at: 500 },
  { key: "intro", at: 750 },
  { key: "tool1", at: 1000 },
  { key: "tool2", at: 1300 },
  { key: "tool1Done", at: 1550 },
  { key: "tool2Done", at: 1850 },
  { key: "toolSummary", at: 2050 },
  { key: "findings", at: 2300 },
  { key: "permission", at: 2600 },
  { key: "followUp", at: 3100 },
] as const;

type StepKey = (typeof chatTimeline)[number]["key"];

function useChatStep(): Set<StepKey> {
  const [reached, setReached] = useState<Set<StepKey>>(new Set());

  useEffect(() => {
    const timers = chatTimeline.map(({ key, at }) =>
      setTimeout(() => {
        setReached((prev) => {
          if (prev.has(key)) return prev;
          const next = new Set(prev);
          next.add(key);
          return next;
        });
      }, at),
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  return reached;
}

const fadeUp = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
};

const initialQuestion = "Where did we waste money this week?";
const followUpQuestion = "How can I fix $1,847 going to search terms with zero conversions?";

function HeroMockup() {
  const reached = useChatStep();
  const has = (k: StepKey) => reached.has(k);
  const sent = has("user");
  const inputText = !sent ? initialQuestion : has("followUp") ? followUpQuestion : "";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut", delay: 0.15 }}
      className="mx-auto w-full max-w-[480px]"
    >
      <div className="flex h-[660px] flex-col overflow-hidden rounded-[28px] border border-[#3D3C36] bg-[#24231F] shadow-[0_24px_80px_-18px_rgba(0,0,0,0.72)]">
        <div className="flex shrink-0 items-center justify-between border-b border-[#3D3C36] px-4 py-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#3D3C36] bg-[#2E2D28] px-3 py-1.5 text-sm text-[#E8E4DD]">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-[#D97757]">
              <Image src="/claude-icon.svg" alt="" width={10} height={10} className="h-2.5 w-2.5 brightness-0 invert" />
            </span>
            Claude + AdsAgent
          </div>
          <span className="rounded-full bg-[#4CAF6E]/10 px-2.5 py-1 text-xs font-medium text-[#4CAF6E]">
            Demo · mock data
          </span>
        </div>

        <div className="flex flex-1 flex-col justify-end gap-3 overflow-hidden px-4 pb-2 pt-4 sm:px-5">
          <AnimatePresence>
            {has("user") && (
              <motion.div key="user" {...fadeUp} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-[#2E2D28] px-4 py-2.5 text-sm text-[#E8E4DD]">
                  {initialQuestion}
                </div>
              </motion.div>
            )}

            {has("intro") && (
              <motion.p key="intro" {...fadeUp} className="text-sm leading-relaxed text-[#E8E4DD]">
                Let me pull your search terms and campaign performance for the last 7 days.
              </motion.p>
            )}

            {has("tool1") && (
              <motion.div
                key="tools"
                {...fadeUp}
                className="rounded-xl border border-[#3D3C36] bg-[#1F1E1A] px-3 py-2.5"
              >
                <div className="space-y-1.5 font-mono-jb text-[11px] leading-5">
                  <ToolLine
                    name="getSearchTermReport"
                    args="last 7d"
                    done={has("tool1Done")}
                  />
                  {has("tool2") && (
                    <ToolLine
                      name="getCampaignPerformance"
                      args="cost + conv"
                      done={has("tool2Done")}
                    />
                  )}
                  {has("toolSummary") && (
                    <motion.div
                      {...fadeUp}
                      className="flex items-center gap-2 text-[#9B9689]"
                    >
                      <Check className="h-3 w-3 shrink-0 text-[#4CAF6E]" />
                      <span className="truncate">Analyzed 247 search terms across 4 campaigns</span>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            )}

            {has("findings") && (
              <motion.div key="findings" {...fadeUp} className="space-y-2">
                <p className="text-sm leading-relaxed text-[#E8E4DD]">
                  Found <span className="font-semibold">3 issues</span> worth fixing this week:
                </p>
                <ul className="space-y-1.5 pl-1 text-sm leading-relaxed text-[#C4C0B6]">
                  <li className="flex items-start gap-2">
                    <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-[#C4C0B6]" />
                    <span><span className="font-mono-jb font-semibold text-[#E8E4DD]">$1,847</span> to search terms with zero conversions</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-[#C4C0B6]" />
                    <span><span className="font-mono-jb font-semibold text-[#E8E4DD]">23</span> negatives to add across 4 campaigns</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-[#C4C0B6]" />
                    <span><span className="font-mono-jb font-semibold text-[#E8E4DD]">4</span> budgets to rebalance</span>
                  </li>
                </ul>
              </motion.div>
            )}

            {has("permission") && (
              <motion.div
                key="permission"
                {...fadeUp}
                className="rounded-xl border border-[#E8B931]/30 bg-[#E8B931]/[0.04] p-3"
              >
                <p className="text-xs leading-relaxed text-[#C4C0B6]">
                  <span className="font-semibold text-[#E8E4DD]">AdsAgent</span> wants to run{" "}
                  <span className="font-mono-jb text-[#E8B931]">bulkPauseKeywords</span>{" "}
                  to pause 23 underperforming keywords with zero conversions
                </p>
                <div className="mt-3 grid grid-cols-3 gap-1.5">
                  <button className="rounded-lg bg-[#E8E4DD] px-2 py-2 text-xs font-semibold text-[#1A1917]">
                    Approve
                  </button>
                  <button className="rounded-lg border border-[#4D4C46] bg-[#2E2D28] px-2 py-2 text-xs font-medium text-[#E8E4DD]">
                    Approve once
                  </button>
                  <button className="rounded-lg border border-[#4D4C46] bg-[#2E2D28] px-2 py-2 text-xs font-medium text-[#E8E4DD]">
                    Deny
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="shrink-0 px-4 pb-4 pt-2 sm:px-5">
          <div className="rounded-2xl border border-[#3D3C36] bg-[#1F1E1A] p-3">
              <p className={`min-h-[1.25rem] text-sm leading-5 ${inputText ? "text-[#E8E4DD]" : "text-[#7A7770]"}`}>
                <AnimatePresence mode="wait">
                  <motion.span
                    key={inputText || "placeholder"}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                    className="inline-block"
                  >
                    {inputText || "Ask AdsAgent anything"}
                  </motion.span>
                </AnimatePresence>
                {!sent && (
                  <span className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[2px] animate-[pulse_1s_ease-in-out_infinite] bg-[#E8E4DD] align-middle" />
                )}
              </p>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#4CAF6E]/30 bg-[#4CAF6E]/10 px-2.5 py-1 text-[11px] font-medium text-[#4CAF6E]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#4CAF6E]" />
                  AdsAgent · Google Ads MCP
                </span>
                <div className="flex items-center gap-1.5">
                  <button className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-[#C4C0B6] transition-colors hover:bg-[#2E2D28] hover:text-[#E8E4DD]">
                    Opus 4.7 Adaptive
                    <ChevronDown className="h-3 w-3" />
                  </button>
                  <motion.button
                    animate={
                      has("send") && !sent
                        ? { scale: [1, 0.85, 1.05, 1], boxShadow: ["0 0 0 0 rgba(76,175,110,0)", "0 0 0 6px rgba(76,175,110,0.35)", "0 0 0 0 rgba(76,175,110,0)"] }
                        : { scale: 1 }
                    }
                    transition={{ duration: 0.5, ease: "easeOut" }}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E8E4DD] text-[#1A1917]"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </motion.button>
                </div>
              </div>
            </div>
          </div>
        </div>
    </motion.div>
  );
}

function ToolLine({ name, args, done }: { name: string; args: string; done: boolean }) {
  return (
    <motion.div {...fadeUp} className="flex items-center gap-2 text-[#C4C0B6]">
      {done ? (
        <ChevronRight className="h-3 w-3 shrink-0 text-[#4CAF6E]" />
      ) : (
        <Loader2 className="h-3 w-3 shrink-0 animate-spin text-[#E8B931]" />
      )}
      <span className="font-semibold text-[#E8E4DD]">{name}</span>
      <span className="truncate text-[#7A7770]">{args}</span>
    </motion.div>
  );
}

function FlowVisual({ visual }: { visual: (typeof flowSteps)[number]["visual"] }) {
  if (visual === "sources") {
    return (
      <div className="grid grid-cols-2 gap-2 text-sm">
        {["Google Ads", "GA4", "CRM", "Search Console"].map((item) => (
          <div key={item} className="rounded-xl border border-[#3D3C36] bg-[#1A1917] p-3 text-[#E8E4DD]">
            {item}
          </div>
        ))}
      </div>
    );
  }

  if (visual === "prompts") {
    return (
      <div className="space-y-2 text-sm">
        {["What changed?", "Why did CPA spike?", "Which client needs help?"].map((item) => (
          <div key={item} className="rounded-full border border-[#3D3C36] bg-[#1A1917] px-3 py-2 text-[#C4C0B6]">
            {item}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#4CAF6E]/30 bg-[#4CAF6E]/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#E8E4DD]">Pause 12 keywords?</p>
          <p className="mt-1 text-xs text-[#C4C0B6]">Projected waste removed: $640/mo</p>
        </div>
        <span className="rounded-full bg-[#4CAF6E] px-3 py-1 text-xs font-semibold text-[#1A1917]">
          Approve
        </span>
      </div>
    </div>
  );
}

export function HomePage({
  githubStars = null,
  pricing,
}: {
  githubStars?: number | null;
  pricing: Omit<PricingSectionProps, "page">;
}) {
  const session = useSession();

  return (
    <>
      <section className="relative overflow-hidden px-4 pb-16 pt-5 sm:pb-20 md:pt-6">
        <div className="container mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="mb-6 flex justify-center sm:mb-8"
          >
            <a
              href="https://github.com/nowork-studio/toprank"
              target="_blank"
              rel="noreferrer"
              className="group relative inline-flex items-center gap-3 rounded-full px-5 py-2 text-sm transition-all"
              style={{ background: "linear-gradient(90deg, rgba(76,175,110,0.08), rgba(217,119,87,0.08), rgba(232,185,49,0.08))" }}
            >
              <span
                className="pointer-events-none absolute inset-0 rounded-full"
                style={{
                  padding: "1px",
                  background: "linear-gradient(90deg, #4CAF6E, #D97757, #E8B931, #4CAF6E)",
                  backgroundSize: "200% 100%",
                  animation: "rainbow-slide 3s linear infinite",
                  WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                  WebkitMaskComposite: "xor",
                  maskComposite: "exclude",
                }}
              />
              <span className="text-[#E8E4DD]">
                Open-source Claude Code skills for SEO, SEM &amp; Google Ads — live on GitHub
              </span>
              <GitHubStarBadge stars={githubStars} />
            </a>
          </motion.div>

          <div className="grid items-center gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="text-center lg:text-left"
            >
              <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
                Google Ads MCP - Let Claude Manage Your Ads
              </p>
              <h1 className="font-display mx-auto mt-4 max-w-3xl text-5xl font-bold leading-[0.98] tracking-tight text-[#E8E4DD] sm:text-6xl lg:mx-0 lg:text-7xl">
                Stop guessing where your ad spend goes.
              </h1>
              <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-[#C4C0B6] lg:mx-0">
                Ask Claude what is working, what is wasting money, and what to fix next. AdsAgent connects Claude to your ads data and executes approved changes.
              </p>

              <div className="mt-8 flex flex-col items-center gap-4 lg:items-start">
                <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                  <ConnectClaudeCTA session={session} position="hero" />
                  <AuditCTA
                    session={session}
                    page="homepage"
                    position="hero"
                    variant="secondary"
                    disconnectedLabel="Run free audit"
                    connectedLabel="View audit"
                  />
                </div>
                <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm text-[#C4C0B6] lg:justify-start">
                  <span>Free to start</span>
                  <span>Read-only first</span>
                  <span>No credit card</span>
                </div>
              </div>
            </motion.div>

            <HeroMockup />
          </div>
        </div>
      </section>

      <section className="px-4 pb-16 sm:pb-20">
        <motion.div
          className="container mx-auto max-w-6xl"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-60px" }}
        >
          <div className="mb-8 max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
              Examples
            </p>
            <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-[#E8E4DD] sm:text-4xl">
              Ask the questions dashboards never answer.
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {useCases.map((item) => (
              <div key={item.prompt} className="rounded-3xl border border-[#3D3C36] bg-[#24231F] p-5">
                <p className="text-sm font-medium text-[#4CAF6E]">You ask</p>
                <p className="mt-2 text-lg font-semibold leading-snug text-[#E8E4DD]">“{item.prompt}”</p>
                <div className="mt-5 rounded-2xl bg-[#1A1917] p-4">
                  <p className="text-sm font-medium text-[#C4C0B6]">Claude answers</p>
                  <p className="mt-2 text-sm leading-relaxed text-[#E8E4DD]">{item.answer}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      <section className="px-4 pb-16 sm:pb-20">
        <div className="container mx-auto max-w-6xl">
          <div className="mb-8 max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
              How it works
            </p>
            <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-[#E8E4DD] sm:text-4xl">
              Connect. Ask. Approve.
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {flowSteps.map((step, index) => (
              <div key={step.title} className="rounded-3xl border border-[#3D3C36] bg-[#24231F] p-5">
                <div className="mb-5 flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#4CAF6E] text-sm font-bold text-[#1A1917]">
                    {index + 1}
                  </span>
                  <h3 className="text-xl font-semibold text-[#E8E4DD]">{step.title}</h3>
                </div>
                <FlowVisual visual={step.visual} />
                <p className="mt-5 text-sm leading-relaxed text-[#C4C0B6]">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-16 sm:pb-20">
        <div className="container mx-auto max-w-6xl">
          <div className="grid gap-4 md:grid-cols-3">
            {capabilityCards.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="rounded-3xl border border-[#3D3C36] bg-[#24231F] p-6">
                  <Icon className="h-5 w-5 text-[#4CAF6E]" />
                  <h3 className="mt-4 text-xl font-semibold text-[#E8E4DD]">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#C4C0B6]">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="px-4 pb-16 sm:pb-20">
        <div className="container mx-auto max-w-6xl">
          <div className="grid gap-4 md:grid-cols-2">
            {audienceCards.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="rounded-3xl border border-[#3D3C36] bg-[#24231F] p-6 sm:p-8">
                  <div className="flex items-center gap-3">
                    <Icon className="h-5 w-5 text-[#4CAF6E]" />
                    <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">{item.title}</p>
                  </div>
                  <h2 className="font-display mt-4 text-2xl font-semibold tracking-tight text-[#E8E4DD] sm:text-3xl">
                    {item.desc}
                  </h2>
                  <div className="mt-6 grid gap-2">
                    {item.bullets.map((bullet) => (
                      <div key={bullet} className="flex items-center gap-2 text-sm text-[#C4C0B6]">
                        <Check className="h-4 w-4 text-[#4CAF6E]" />
                        {bullet}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="px-4 pb-16 sm:pb-20">
        <div className="container mx-auto max-w-6xl rounded-3xl border border-[#3D3C36] bg-[#201F1B] p-6 sm:p-8">
          <div className="grid gap-5 md:grid-cols-3">
            {[
              { icon: Shield, title: "You approve writes", desc: "No silent campaign changes." },
              { icon: Clock3, title: "Always watching", desc: "Catch drift between check-ins." },
              { icon: TrendingUp, title: "Impact tracked", desc: "See what changed after fixes." },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="flex gap-3">
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[#4CAF6E]" />
                  <div>
                    <h3 className="font-semibold text-[#E8E4DD]">{item.title}</h3>
                    <p className="mt-1 text-sm text-[#C4C0B6]">{item.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="px-4 pb-16 sm:pb-20">
        <div className="container mx-auto max-w-5xl">
          <PricingSection {...pricing} page="homepage" />
          <p className="mt-6 text-sm text-[#C4C0B6]">
            Spending $50K+/mo?{" "}
            <Link
              href="mailto:tong@adsagent.org"
              onClick={() =>
                trackEvent("cta_clicked", {
                  page: "homepage",
                  cta: "high_spend_lead",
                  destination: "mailto:tong@adsagent.org",
                  requires_auth: false,
                })
              }
              className="inline-block py-2 font-medium text-[#4CAF6E] underline underline-offset-4 hover:text-[#3D9A5C]"
            >
              Let&rsquo;s talk
            </Link>
          </p>
        </div>
      </section>

      <section className="px-4 pb-16">
        <div className="container mx-auto max-w-3xl">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-[#E8E4DD] sm:text-4xl">
            Common questions
          </h2>
          <div className="mt-6">
            {faqs.map((faq) => (
              <FAQItem key={faq.q} q={faq.q} a={faq.a} />
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-24">
        <div className="container mx-auto max-w-5xl rounded-[32px] border border-[#4CAF6E]/25 bg-[#4CAF6E]/5 p-8 text-center sm:p-12">
          <h2 className="font-display text-3xl font-bold tracking-tight text-[#E8E4DD] sm:text-5xl">
            Know what to fix before more budget disappears.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-[#C4C0B6]">
            Start now. Ask Claude where spend is leaking and approve the first fixes.
          </p>
          <div className="mt-8 flex justify-center">
            <ConnectClaudeCTA session={session} position="final" />
          </div>
          <p className="mx-auto mt-5 max-w-md text-xs leading-relaxed text-[#C4C0B6]">
            By connecting Google Ads, you agree to our{" "}
            <Link href="/privacy" className="font-medium text-[#E8E4DD] underline underline-offset-4 hover:text-[#4CAF6E]">
              Privacy Policy
            </Link>{" "}
            and{" "}
            <Link href="/terms" className="font-medium text-[#E8E4DD] underline underline-offset-4 hover:text-[#4CAF6E]">
              Terms of Service
            </Link>
            .
          </p>
        </div>
      </section>
    </>
  );
}
