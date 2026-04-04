"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Link2, Sparkles, ShieldCheck } from "lucide-react";
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
    </>
  );
}
