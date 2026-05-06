"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import {
  ArrowRight,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Check,
  Loader2,
} from "lucide-react";
import { useSession } from "@/components/session-provider";
import { McpSetupHero } from "@/components/marketing/mcp-setup-hero";
import { MarketingEngineSection } from "@/components/marketing/marketing-engine-section";
import { GitHubStarBadge } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { startGoogleConnect } from "@/lib/google-oauth";
import { CONTACT_EMAIL } from "@/lib/brand";
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
  const t = useTranslations("CTA");

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
          {t("connecting")}
        </span>
      ) : (
        <>
          {label ?? t("connectGoogleAds")}
          {!label && <ArrowRight className="ml-1 h-5 w-5" />}
        </>
      )}
    </Button>
  );
}

function AccordionFaqItem({ q, a, defaultOpen }: { q: string; a: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="border-b border-[#3D3C36]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-baseline justify-between gap-6 py-6 text-left transition-colors hover:bg-[#1F1E1A]/40"
      >
        <span className="font-display text-lg font-semibold text-[#E8E4DD] md:text-xl">
          {q}
        </span>
        <span
          aria-hidden="true"
          className={`mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#3D3C36] text-[#C4C0B6] transition-transform duration-200 ${
            open ? "rotate-45 border-[#4CAF6E]/40 text-[#4CAF6E]" : ""
          }`}
        >
          <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <line x1="6" y1="1" x2="6" y2="11" />
            <line x1="1" y1="6" x2="11" y2="6" />
          </svg>
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="answer"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <p className="max-w-2xl pb-6 pr-12 text-base leading-relaxed text-[#C4C0B6]">
              {a}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
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

const fadeInPlace = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
};

const lineTransition = {
  duration: 0.36,
  ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
};

function ChatReveal({ show, children }: { show: boolean; children: ReactNode }) {
  return (
    <div className="relative">
      <div aria-hidden="true" className="pointer-events-none invisible select-none">
        {children}
      </div>
      <AnimatePresence initial={false}>
        {show && (
          <motion.div {...fadeInPlace} className="absolute inset-x-0 top-0">
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SmoothLine({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.span
      initial={{ opacity: 0, filter: "blur(4px)" }}
      animate={{ opacity: 1, filter: "blur(0px)" }}
      transition={{ ...lineTransition, delay }}
      className={["block", className].filter(Boolean).join(" ")}
    >
      {children}
    </motion.span>
  );
}

function SmoothListItem({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.li
      initial={{ opacity: 0, filter: "blur(4px)" }}
      animate={{ opacity: 1, filter: "blur(0px)" }}
      transition={{ ...lineTransition, delay }}
      className={className}
    >
      {children}
    </motion.li>
  );
}

function HeroMockup() {
  const reached = useChatStep();
  const t = useTranslations("Home.chat");
  const has = (k: StepKey) => reached.has(k);
  const sent = has("user");
  const inputText = !sent ? t("initialQuestion") : has("followUp") ? t("followUpQuestion") : "";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut", delay: 0.15 }}
      className="mx-auto w-full max-w-[480px]"
    >
      <div className="flex h-[650px] flex-col overflow-hidden rounded-[28px] border border-[#3D3C36] bg-[#24231F] shadow-[0_24px_80px_-18px_rgba(0,0,0,0.72)]">
        <div className="relative flex shrink-0 items-center px-4 py-3">
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-[#FF5F57]" />
            <span className="h-3 w-3 rounded-full bg-[#FEBC2E]" />
            <span className="h-3 w-3 rounded-full bg-[#28C840]" />
          </div>
          <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 text-xs font-medium text-[#C4C0B6]">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-[#D97757]">
              <Image src="/claude-icon.svg" alt="" width={10} height={10} className="h-2.5 w-2.5 brightness-0 invert" />
            </span>
            <span>Claude + NotFair</span>
            <span className="text-[#5A5852]">·</span>
            <span className="text-[#4CAF6E]">{t("demo")}</span>
          </div>
        </div>

        <div className="flex flex-1 flex-col justify-end overflow-hidden px-4 pb-2 pt-4 sm:px-5">
          <div className="w-full space-y-3">
            <ChatReveal show={has("user")}>
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-[#2E2D28] px-4 py-2.5 text-sm text-[#E8E4DD]">
                  {t("initialQuestion")}
                </div>
              </div>
            </ChatReveal>

            <ChatReveal show={has("intro")}>
              <p className="text-sm leading-relaxed text-[#E8E4DD]">
                <SmoothLine>
                  {t("intro")}
                </SmoothLine>
              </p>
            </ChatReveal>

            <ChatReveal show={has("tool1")}>
              <div className="rounded-xl border border-[#3D3C36] bg-[#1F1E1A] px-3 py-2.5">
                <div className="space-y-1.5 font-mono-jb text-[11px] leading-5">
                  <ToolLine
                    name="getSearchTermReport"
                    args="last 30d"
                    done={has("tool1Done")}
                  />
                  <ChatReveal show={has("tool2")}>
                    <ToolLine
                      name="getKeywords"
                      args="quality + cost"
                      done={has("tool2Done")}
                    />
                  </ChatReveal>
                  <ChatReveal show={has("toolSummary")}>
                    <div className="flex items-center gap-2 text-[#9B9689]">
                      <Check className="h-3 w-3 shrink-0 text-[#4CAF6E]" />
                      <span className="truncate">{t("foundSummary")}</span>
                    </div>
                  </ChatReveal>
                </div>
              </div>
            </ChatReveal>

            <ChatReveal show={has("findings")}>
              <div className="space-y-2">
                <p className="text-sm leading-relaxed text-[#E8E4DD]">
                  <SmoothLine>
                    {t("findingsTitle", { count: 3 })}
                  </SmoothLine>
                </p>
                <ul className="space-y-1.5 pl-1 text-sm leading-relaxed text-[#C4C0B6]">
                  <SmoothListItem delay={0.12} className="flex items-start gap-2">
                    <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-[#C4C0B6]" />
                    <span>{t("finding1")}</span>
                  </SmoothListItem>
                  <SmoothListItem delay={0.24} className="flex items-start gap-2">
                    <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-[#C4C0B6]" />
                    <span>{t("finding2")}</span>
                  </SmoothListItem>
                  <SmoothListItem delay={0.36} className="flex items-start gap-2">
                    <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-[#C4C0B6]" />
                    <span>{t("finding3")}</span>
                  </SmoothListItem>
                </ul>
              </div>
            </ChatReveal>

            <ChatReveal show={has("permission")}>
              <div className="rounded-xl border border-[#E8B931]/30 bg-[#E8B931]/[0.04] p-3">
                <p className="text-xs leading-relaxed text-[#C4C0B6]">
                  <SmoothLine>
                    <span className="font-semibold text-[#E8E4DD]">{t("permission1")}</span>{" "}
                    <span className="font-mono-jb text-[#E8B931]">applyRecommendedFixes</span>
                  </SmoothLine>
                  <SmoothLine delay={0.12}>
                    {t("permission2")}
                  </SmoothLine>
                </p>
                <motion.div
                  initial={{ opacity: 0, filter: "blur(4px)" }}
                  animate={{ opacity: 1, filter: "blur(0px)" }}
                  transition={{ ...lineTransition, delay: 0.24 }}
                  className="mt-3 grid grid-cols-3 gap-1.5"
                >
                  <button className="rounded-lg bg-[#E8E4DD] px-2 py-2 text-xs font-semibold text-[#1A1917]">
                    {t("approve")}
                  </button>
                  <button className="rounded-lg border border-[#4D4C46] bg-[#2E2D28] px-2 py-2 text-xs font-medium text-[#E8E4DD]">
                    {t("approveOnce")}
                  </button>
                  <button className="rounded-lg border border-[#4D4C46] bg-[#2E2D28] px-2 py-2 text-xs font-medium text-[#E8E4DD]">
                    {t("deny")}
                  </button>
                </motion.div>
              </div>
            </ChatReveal>
          </div>
        </div>

        <div className="shrink-0 px-4 pb-4 pt-2 sm:px-5">
          <div className="rounded-2xl border border-[#3D3C36] bg-[#1F1E1A] p-3">
              <p className={`min-h-10 text-sm leading-5 ${inputText ? "text-[#E8E4DD]" : "text-[#7A7770]"}`}>
                <AnimatePresence mode="wait">
                  <motion.span
                    key={inputText || "placeholder"}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                    className="inline-block"
                  >
                    {inputText || t("placeholder")}
                  </motion.span>
                </AnimatePresence>
                {!sent && (
                  <span className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[2px] animate-[pulse_1s_ease-in-out_infinite] bg-[#E8E4DD] align-middle" />
                )}
              </p>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#4CAF6E]/30 bg-[#4CAF6E]/10 px-2.5 py-1 text-[11px] font-medium text-[#4CAF6E]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#4CAF6E]" />
                  <span className="sm:hidden">NotFair MCP</span>
                  <span className="hidden sm:inline">NotFair · Google Ads MCP</span>
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
    <div className="flex items-center gap-2 text-[#C4C0B6]">
      {done ? (
        <ChevronRight className="h-3 w-3 shrink-0 text-[#4CAF6E]" />
      ) : (
        <Loader2 className="h-3 w-3 shrink-0 animate-spin text-[#E8B931]" />
      )}
      <span className="font-semibold text-[#E8E4DD]">{name}</span>
      <span className="truncate text-[#7A7770]">{args}</span>
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
  const t = useTranslations("Home");
  const faqItems = t.raw("faq") as { q: string; a: string }[];
  const trustItems = t.raw("trustItems") as string[];

  return (
    <>
      <section className="relative overflow-hidden border-b border-[#3D3C36] px-4 pb-20 pt-6 sm:pb-24 sm:pt-8">
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
                {t("githubBanner")}
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
                {t("eyebrow")}
              </p>
              <h1 className="font-display mx-auto mt-4 max-w-3xl text-5xl font-bold leading-[0.98] tracking-tight text-[#E8E4DD] sm:text-6xl lg:mx-0 lg:text-7xl">
                {t("headline")}
              </h1>
              <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-[#C4C0B6] lg:mx-0">
                {t("subhead")}
              </p>

              <div className="mt-8 flex flex-col items-center gap-4 lg:items-start">
                <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                  <ConnectClaudeCTA session={session} position="hero" />
                </div>
                <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm text-[#C4C0B6] lg:justify-start">
                  {trustItems.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              </div>
            </motion.div>

            <HeroMockup />
          </div>
        </div>
      </section>

      <McpSetupHero surface="home" />

      <MarketingEngineSection title={t("engineTitle")} body={t("engineBody")} />

      <section className="border-t border-[#3D3C36] px-4 py-16 sm:py-20">
        <div className="container mx-auto max-w-6xl">
          <PricingSection {...pricing} page="homepage" />
          <p className="mt-6 text-sm text-[#C4C0B6]">
            {t("highSpend")}{" "}
            <Link
              href={`mailto:${CONTACT_EMAIL}`}
              onClick={() =>
                trackEvent("cta_clicked", {
                  page: "homepage",
                  cta: "high_spend_lead",
                  destination: `mailto:${CONTACT_EMAIL}`,
                  requires_auth: false,
                })
              }
              className="inline-block py-2 font-medium text-[#4CAF6E] underline underline-offset-4 hover:text-[#3D9A5C]"
            >
              {t("letsTalk")}
            </Link>
          </p>
        </div>
      </section>


      {/* ── FAQ accordion ── */}
      <section className="border-t border-[#3D3C36] px-4 py-20 md:py-28">
        <div className="container mx-auto max-w-6xl">
          <div className="flex items-center gap-4 text-[11px] font-medium uppercase tracking-[0.22em] text-[#C4C0B6]/70">
            <span>{t("faqLabel")}</span>
            <span className="h-px flex-1 bg-[#3D3C36]" />
            <span className="font-mono">{t("answers", { count: faqItems.length })}</span>
          </div>
          <h2 className="font-display mt-8 max-w-3xl text-3xl font-bold uppercase leading-[1.05] tracking-tight text-[#E8E4DD] md:text-4xl">
            {t("faqTitle")}
          </h2>

          <div className="mt-10 border-t border-[#3D3C36]">
            {faqItems.map((item, i) => (
              <AccordionFaqItem
                key={item.q}
                q={item.q}
                a={item.a}
                defaultOpen={i === 0}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── Closing — final CTA ── */}
      <section className="border-t border-[#3D3C36] px-4 py-20 md:py-28">
        <div className="container mx-auto max-w-6xl">
          {/* Editorial closer */}
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#C4C0B6]/70">
              {t("closingLabel")}
            </p>
            <h2
              className="mt-6 text-3xl leading-snug text-[#E8E4DD] md:text-5xl md:leading-[1.1]"
              style={{ fontFamily: "Newsreader, Georgia, serif", fontStyle: "italic" }}
            >
              {t("closingHeadline")}
            </h2>
            <div className="mt-10 flex justify-center">
              <ConnectClaudeCTA session={session} position="final" />
            </div>
            <p className="mx-auto mt-6 max-w-md text-[11px] leading-relaxed text-[#C4C0B6]">
              {t("legalPrefix")}{" "}
              <Link
                href="/privacy"
                className="text-[#E8E4DD] underline underline-offset-4 hover:text-[#4CAF6E]"
              >
                Privacy Policy
              </Link>{" "}
              {t("legalAnd")}{" "}
              <Link
                href="/terms"
                className="text-[#E8E4DD] underline underline-offset-4 hover:text-[#4CAF6E]"
              >
                Terms
              </Link>
              .
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
