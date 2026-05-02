"use client";

import Link from "next/link";
import { useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shown when a user with Meta selected as their active platform tries to
 * open one of the Google-only sidebar surfaces (Campaigns, Audit, Impact
 * Monitor, Operations). Points them at /connect/meta-ads where Meta is
 * fully supported via MCP.
 */
export function MetaUnsupportedModal({
  open,
  feature,
  onClose,
}: {
  open: boolean;
  feature: string;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-md rounded-2xl border border-[#3D3C36] bg-[#24231F] p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-md p-1 text-[#C4C0B6] transition hover:bg-[#E8E4DD]/8 hover:text-[#E8E4DD]"
        >
          <X className="h-4 w-4" />
        </button>
        <h2 className="text-lg font-semibold text-[#E8E4DD]">
          {feature} isn&apos;t available for Meta Ads yet
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[#C4C0B6]">
          Your Meta Ads account is connected, but this in-app surface is
          currently Google Ads only. The fully functioning Meta Ads MCP lets
          you do everything from Claude, Codex, or any MCP client.
        </p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            className="h-9 rounded-lg px-3 text-sm text-[#C4C0B6] hover:bg-[#E8E4DD]/8 hover:text-[#E8E4DD]"
          >
            Dismiss
          </Button>
          <Link
            href="/connect/meta-ads"
            prefetch
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-lg bg-[#4CAF6E] px-4 text-sm font-semibold text-[#1A1917] hover:bg-[#3D9A5C]"
          >
            Set up Meta Ads MCP
          </Link>
        </div>
      </div>
    </div>
  );
}
