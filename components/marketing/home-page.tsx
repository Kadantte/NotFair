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
import { McpSetupHero } from "@/components/marketing/mcp-setup-hero";
import { MarketingEngineSection } from "@/components/marketing/marketing-engine-section";
import { GitHubStarBadge } from "@/components/site-header";
import { ConnectClaudeCTA } from "@/components/connect-claude-cta";
import { CONTACT_EMAIL } from "@/lib/brand";
import { trackEvent } from "@/lib/analytics";
import { PricingSection, type PricingSectionProps } from "./pricing-cards";

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

function useChatStep(resetKey: unknown): Set<StepKey> {
  const [reached, setReached] = useState<Set<StepKey>>(new Set());

  useEffect(() => {
    setReached(new Set());
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
  }, [resetKey]);

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

type ChatPlatform = "google" | "meta";

function HeroMockup({
  platform,
  onSelectPlatform,
}: {
  platform: ChatPlatform;
  onSelectPlatform: (next: ChatPlatform) => void;
}) {
  const reached = useChatStep(platform);
  const t = useTranslations("Home.chat");
  const tp = useTranslations(`Home.chat.${platform}`);
  const has = (k: StepKey) => reached.has(k);
  const sent = has("user");
  const inputText = !sent ? tp("initialQuestion") : has("followUp") ? tp("followUpQuestion") : "";

  return (
    <div className="mx-auto w-full max-w-[480px]">
      <div className="flex h-[650px] flex-col overflow-hidden rounded-[28px] border border-[#3D3C36] bg-[#24231F] shadow-[0_24px_80px_-18px_rgba(0,0,0,0.72)]">
        <div className="relative flex shrink-0 items-center px-4 py-3">
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-[#FF5F57]" />
            <span className="h-3 w-3 rounded-full bg-[#FEBC2E]" />
            <span className="h-3 w-3 rounded-full bg-[#28C840]" />
          </div>
          <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2.5">
            <span className="flex items-center gap-1.5 text-xs font-medium text-[#C4C0B6]">
              <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-[#D97757]">
                <Image
                  src="/claude-icon.svg"
                  alt=""
                  width={10}
                  height={10}
                  className="h-2.5 w-2.5 brightness-0 invert"
                />
              </span>
              Claude
            </span>
            <span aria-hidden="true" className="text-[#5A5852]">·</span>
            <div
              role="tablist"
              aria-label={t("platformToggleLabel")}
              className="inline-flex rounded-full border border-[#3D3C36] bg-[#1F1E1A] p-0.5"
            >
            <button
              type="button"
              role="tab"
              aria-selected={platform === "google"}
              onClick={() => onSelectPlatform("google")}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                platform === "google"
                  ? "bg-[#E8E4DD] text-[#1A1917]"
                  : "text-[#C4C0B6] hover:text-[#E8E4DD]"
              }`}
            >
              {t("platformGoogle")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={platform === "meta"}
              onClick={() => onSelectPlatform("meta")}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                platform === "meta"
                  ? "bg-[#E8E4DD] text-[#1A1917]"
                  : "text-[#C4C0B6] hover:text-[#E8E4DD]"
              }`}
            >
              {t("platformMeta")}
            </button>
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col justify-end overflow-hidden px-4 pb-2 pt-4 sm:px-5">
          <div className="w-full space-y-3">
            <ChatReveal show={has("user")}>
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-[#2E2D28] px-4 py-2.5 text-sm text-[#E8E4DD]">
                  {tp("initialQuestion")}
                </div>
              </div>
            </ChatReveal>

            <ChatReveal show={has("intro")}>
              <p className="text-sm leading-relaxed text-[#E8E4DD]">
                <SmoothLine>
                  {tp("intro")}
                </SmoothLine>
              </p>
            </ChatReveal>

            <ChatReveal show={has("tool1")}>
              <div className="rounded-xl border border-[#3D3C36] bg-[#1F1E1A] px-3 py-2.5">
                <div className="space-y-1.5 font-mono-jb text-[11px] leading-5">
                  <ToolLine
                    name={tp("tool1Name")}
                    args={tp("tool1Args")}
                    done={has("tool1Done")}
                  />
                  <ChatReveal show={has("tool2")}>
                    <ToolLine
                      name={tp("tool2Name")}
                      args={tp("tool2Args")}
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
                    <span>{tp("finding1")}</span>
                  </SmoothListItem>
                  <SmoothListItem delay={0.24} className="flex items-start gap-2">
                    <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-[#C4C0B6]" />
                    <span>{tp("finding2")}</span>
                  </SmoothListItem>
                  <SmoothListItem delay={0.36} className="flex items-start gap-2">
                    <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-[#C4C0B6]" />
                    <span>{tp("finding3")}</span>
                  </SmoothListItem>
                </ul>
              </div>
            </ChatReveal>

            <ChatReveal show={has("permission")}>
              <div className="rounded-xl border border-[#E8B931]/30 bg-[#E8B931]/[0.04] p-3">
                <p className="text-xs leading-relaxed text-[#C4C0B6]">
                  <SmoothLine>
                    <span className="font-semibold text-[#E8E4DD]">{t("permission1")}</span>{" "}
                    <span className="font-mono-jb text-[#E8B931]">{tp("permissionAction")}</span>
                  </SmoothLine>
                  <SmoothLine delay={0.12}>
                    {tp("permission2")}
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
                  <span className="hidden sm:inline">{tp("mcpBadge")}</span>
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
    </div>
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
  const t = useTranslations("Home");
  const tChat = useTranslations("Home.chat");
  const tCta = useTranslations("CTA");
  const faqItems = t.raw("faq") as { q: string; a: string }[];
  const trustItems = t.raw("trustItems") as string[];
  const [chatPlatform, setChatPlatform] = useState<ChatPlatform>("google");
  const [chatPaused, setChatPaused] = useState(false);

  useEffect(() => {
    if (chatPaused) return;
    const id = setInterval(() => {
      setChatPlatform((p) => (p === "google" ? "meta" : "google"));
    }, 5000);
    return () => clearInterval(id);
  }, [chatPaused]);

  function selectChatPlatform(next: ChatPlatform) {
    setChatPaused(true);
    if (next === chatPlatform) return;
    setChatPlatform(next);
    trackEvent("home_chat_platform_toggled", { platform: next });
  }

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

          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16">
            <div className="text-center lg:text-left">
              <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
                {t("eyebrow")}
              </p>
              <h1 className="font-display mx-auto mt-4 max-w-3xl text-5xl font-bold leading-[0.98] tracking-tight text-[#E8E4DD] sm:text-6xl lg:mx-0 lg:text-7xl">
                <span className="block">
                  {t("headlinePrefix")}{" "}
                  <span className="relative inline-block align-baseline">
                    <span aria-hidden="true" className="invisible whitespace-nowrap">
                      {tChat("platformMeta")}
                    </span>
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.span
                        key={chatPlatform}
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -14 }}
                        transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                        className={`absolute inset-0 whitespace-nowrap ${
                          chatPlatform === "google" ? "text-[#4CAF6E]" : "text-[#5B9DF8]"
                        }`}
                      >
                        {chatPlatform === "google"
                          ? tChat("platformGoogle")
                          : tChat("platformMeta")}
                      </motion.span>
                    </AnimatePresence>
                  </span>
                </span>
                <span className="block">{t("headlineSuffix")}</span>
              </h1>
              <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-[#C4C0B6] lg:mx-0">
                {t.rich("subhead", {
                  google: (chunks) => (
                    <span className="font-semibold text-[#4CAF6E]">{chunks}</span>
                  ),
                  meta: (chunks) => (
                    <span className="font-semibold text-[#5B9DF8]">{chunks}</span>
                  ),
                  mcp: (chunks) => (
                    <span className="font-semibold text-[#E8B931]">{chunks}</span>
                  ),
                })}
              </p>

              <div className="mt-8 flex flex-col items-center gap-4 lg:items-start">
                <div className="flex w-full sm:w-auto">
                  <ConnectClaudeCTA
                    tracking={{ page: "homepage", position: "hero" }}
                    label={tCta("startTrialNow")}
                    size="xl"
                  />
                </div>
                <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm text-[#C4C0B6] lg:justify-start">
                  {trustItems.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              </div>
            </div>

            <HeroMockup
              platform={chatPlatform}
              onSelectPlatform={selectChatPlatform}
            />
          </div>
        </div>
      </section>

      <McpSetupHero surface="home" />

      <MarketingEngineSection title={t("engineTitle")} body={t("engineBody")} />

      <section className="border-t border-[#3D3C36] px-4 py-16 sm:py-20">
        <div className="container mx-auto max-w-6xl">
          <div className="rounded-3xl border border-[#4CAF6E]/30 bg-[#4CAF6E]/[0.04] p-8 md:p-10">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="max-w-2xl">
                <p className="text-xs font-medium uppercase tracking-[0.22em] text-[#4CAF6E]">
                  {t("affiliateEyebrow")}
                </p>
                <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight text-[#E8E4DD] md:text-4xl">
                  {t("affiliateTitle")}
                </h2>
                <p className="mt-3 text-base leading-relaxed text-[#C4C0B6]">
                  {t("affiliateBody")}
                </p>
              </div>
              <Link
                href="/affiliate"
                onClick={() =>
                  trackEvent("cta_clicked", {
                    page: "homepage",
                    cta: "affiliate_program",
                    destination: "/affiliate",
                    requires_auth: false,
                  })
                }
                className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-[#4CAF6E] bg-[#4CAF6E] px-6 text-sm font-semibold text-[#1A1917] transition-all hover:scale-[1.02] hover:bg-[#3D9A5C]"
              >
                {t("affiliateCta")}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

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
              <ConnectClaudeCTA
                tracking={{ page: "homepage", position: "final" }}
                label="Start Trial Now"
                size="xl"
              />
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
