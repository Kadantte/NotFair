"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";

// 2026-04-23 00:00 PT (PDT = UTC-7)
const TARGET_MS = Date.UTC(2026, 3, 23, 7, 0, 0);

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function useCountdown() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (now === null) return null;
  const diff = Math.max(0, TARGET_MS - now);
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff / 60_000) % 60);
  const seconds = Math.floor((diff / 1000) % 60);
  return { hours, minutes, seconds, expired: diff === 0 };
}

function CountdownCell({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span
        className="font-mono text-[13px] font-bold leading-none tracking-tight text-[#D4882A] tabular-nums sm:text-[15px]"
        suppressHydrationWarning
      >
        {value}
      </span>
      <span className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.18em] text-[#D4882A]/70">
        {label}
      </span>
    </div>
  );
}

function Countdown() {
  const c = useCountdown();
  const hours = c ? pad(c.hours) : "--";
  const minutes = c ? pad(c.minutes) : "--";
  const seconds = c ? pad(c.seconds) : "--";

  if (c?.expired) {
    return (
      <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[#1A1917]">
        Offer ended
      </span>
    );
  }

  return (
    <div className="inline-flex shrink-0 items-center gap-2 rounded-md bg-[#1A1917] px-2.5 py-1.5 sm:gap-3 sm:px-3">
      <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.22em] text-[#E8E4DD]">
        Ends in
      </span>
      <span className="h-4 w-px bg-[#E8E4DD]/20" />
      <CountdownCell value={hours} label="Hrs" />
      <span className="font-mono text-[13px] font-bold leading-none text-[#D4882A]/40 sm:text-[14px]">:</span>
      <CountdownCell value={minutes} label="Min" />
      <span className="font-mono text-[13px] font-bold leading-none text-[#D4882A]/40 sm:text-[14px]">:</span>
      <CountdownCell value={seconds} label="Sec" />
    </div>
  );
}

export function ProductHuntBanner() {
  return (
    <a
      href="https://www.producthunt.com/products/adsagent-google-ads-claude-connector?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-adsagent-google-ads-claude-connector"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Upvote AdsAgent on Product Hunt and get 50% off"
      className="group relative block w-full overflow-hidden border-b border-[#D4882A]/50 bg-[#D4882A] text-[#1A1917] transition-colors hover:bg-[#C07A22]"
    >
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-center gap-x-3 gap-y-2 px-4 py-2.5 sm:gap-x-4 sm:px-6 sm:py-3">
        {/* LIVE pill */}
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#1A1917] px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#D4882A]">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#D4882A]/70" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#D4882A]" />
          </span>
          Live
        </span>

        {/* Headline */}
        <p className="text-center text-[13px] leading-tight text-[#1A1917] sm:text-[14px] md:text-[15px]">
          <span className="font-display font-semibold">Upvote on Product Hunt</span>
          <span className="mx-1.5 text-[#1A1917]/60">→</span>
          <span className="whitespace-nowrap">
            get a{" "}
            <span className="inline-flex items-center rounded-sm bg-[#1A1917] px-1.5 py-0.5 font-mono text-[11px] font-bold tracking-tight text-[#D4882A] sm:px-2 sm:text-[12px]">
              50% OFF
            </span>{" "}
            coupon
          </span>{" "}
          <span className="hidden sm:inline">on your subscription</span>
        </p>

        {/* Right cluster: countdown + PH badge + CTA */}
        <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 sm:gap-3">
          <Countdown />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt="AdsAgent - Google Ads Claude Connector - Turn Claude into your Google Ads manager | Product Hunt"
            width={180}
            height={39}
            src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1129319&theme=light&t=1776816286254"
            className="block h-[36px] w-auto rounded-md shadow-[0_2px_8px_rgba(26,25,23,0.2)] transition-transform duration-200 ease-out group-hover:-translate-y-px sm:h-[43px]"
          />
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#1A1917] px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-[#D4882A] transition-transform duration-200 ease-out group-hover:-translate-y-px sm:px-3 sm:py-1.5 sm:text-[11px]">
            Upvote
            <ArrowUpRight className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
          </span>
        </div>
      </div>
    </a>
  );
}
