"use client";

import { useState } from "react";
import Image from "next/image";
import { Check, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";
import { ManageAdsAccountsShell } from "@/components/manage-ads-accounts-shell";

const WAITLIST_KEY = "meta_ads";

type JoinState = "idle" | "joining" | "joined" | "error";

async function postJoin(source: string): Promise<{ alreadyOnList: boolean }> {
  const res = await fetch("/api/waitlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      key: WAITLIST_KEY,
      metadata: { source },
    }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Failed to join waitlist");
  }
  return (await res.json()) as { joined: boolean; alreadyOnList: boolean };
}

/**
 * Inline platform card used on the manage-ads-accounts hub. Replaces the
 * Meta "Add account" link while Meta App Review is still pending — clicking
 * "Join waitlist" records the signup + posthog event without navigating.
 */
export function MetaWaitlistCard({
  initialJoined,
  source,
}: {
  initialJoined: boolean;
  source: string;
}) {
  const [state, setState] = useState<JoinState>(initialJoined ? "joined" : "idle");
  const [error, setError] = useState<string | null>(null);

  const handleJoin = async () => {
    setState("joining");
    setError(null);
    try {
      const { alreadyOnList } = await postJoin(source);
      if (!alreadyOnList) {
        trackEvent("waitlist_joined", { key: WAITLIST_KEY, source });
      }
      setState("joined");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join waitlist");
      setState("error");
    }
  };

  return (
    <div className="flex items-center gap-4 rounded-xl border border-[#3D3C36] bg-[#24231F] px-5 py-4">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#1A1917]">
        <Image src="/meta-icon.svg" alt="" width={28} height={28} aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-base font-medium text-[#E8E4DD]">Meta Ads</p>
          <span className="inline-flex items-center gap-1 rounded-md border border-[#D4882A]/40 bg-[#D4882A]/[0.08] px-2 py-0.5 text-[11px] font-medium text-[#D4882A]">
            <Clock className="h-3 w-3" />
            Coming soon
          </span>
        </div>
        <p className="mt-0.5 text-sm text-[#C4C0B6]">
          Pending Meta App Review. Join the waitlist and we&apos;ll email when it&apos;s live.
        </p>
        {state === "error" && error && (
          <p className="mt-2 text-xs text-[#C45D4A]">{error}</p>
        )}
      </div>
      <JoinButton state={state} onClick={handleJoin} compact />
    </div>
  );
}

/**
 * Full-bleed wall used on /manage-ads-accounts/meta-ads to block the
 * connect/manage UI behind the waitlist. Rendered inside the shared
 * ManageAdsAccountsShell so the back link to the hub still works.
 */
export function MetaWaitlistWall({
  initialJoined,
  source,
}: {
  initialJoined: boolean;
  source: string;
}) {
  const [state, setState] = useState<JoinState>(initialJoined ? "joined" : "idle");
  const [error, setError] = useState<string | null>(null);

  const handleJoin = async () => {
    setState("joining");
    setError(null);
    try {
      const { alreadyOnList } = await postJoin(source);
      if (!alreadyOnList) {
        trackEvent("waitlist_joined", { key: WAITLIST_KEY, source });
      }
      setState("joined");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join waitlist");
      setState("error");
    }
  };

  return (
    <ManageAdsAccountsShell error={state === "error" ? error : null}>
      <div className="rounded-2xl border border-[#3D3C36] bg-[#24231F] p-8 sm:p-10">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#1877F2]/15">
            <Image src="/meta-icon.svg" alt="" width={36} height={36} aria-hidden="true" />
          </div>
          <span className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-[#D4882A]/40 bg-[#D4882A]/[0.08] px-3 py-1 text-xs font-medium text-[#D4882A]">
            <Clock className="h-3.5 w-3.5" />
            Coming soon
          </span>
          <h1 className="mt-4 text-3xl font-bold text-[#E8E4DD]">Meta Ads is on the way</h1>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-[#C4C0B6]">
            We&apos;re finishing up Meta App Review. Join the waitlist and we&apos;ll send you
            an email the moment NotFair can connect to your Facebook + Instagram ad accounts.
          </p>
          <div className="mt-6">
            <JoinButton state={state} onClick={handleJoin} />
          </div>
          <p className="mt-4 text-xs text-[#C4C0B6]/70">
            In the meantime, NotFair fully supports Google Ads.
          </p>
        </div>
      </div>
    </ManageAdsAccountsShell>
  );
}

function JoinButton({
  state,
  onClick,
  compact,
}: {
  state: JoinState;
  onClick: () => void;
  compact?: boolean;
}) {
  if (state === "joined") {
    return (
      <span
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#4CAF6E]/40 bg-[#4CAF6E]/[0.08] px-4 ${
          compact ? "h-10" : "h-11"
        } text-sm font-semibold text-[#4CAF6E]`}
      >
        <Check className="h-4 w-4" />
        You&apos;re on the list
      </span>
    );
  }
  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={state === "joining"}
      className={`shrink-0 rounded-lg bg-[#4CAF6E] px-5 ${
        compact ? "h-10" : "h-11"
      } text-sm font-semibold text-[#1A1917] hover:bg-[#3D9A5C] disabled:opacity-60`}
    >
      {state === "joining" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Join waitlist"}
    </Button>
  );
}
