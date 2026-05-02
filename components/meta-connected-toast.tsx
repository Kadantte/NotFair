"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { Check, X } from "lucide-react";

/**
 * Shown after a successful Meta OAuth round-trip — the callback redirects
 * to /connect/meta-ads?connected=1, this banner reads the flag, renders
 * a green confirmation, and strips the param from the URL on dismiss so
 * a refresh doesn't re-show it.
 */
export function MetaConnectedToast() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const flag = searchParams.get("connected") === "1";
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(flag);
  }, [flag]);

  function dismiss() {
    setOpen(false);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("connected");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  if (!open) return null;

  return (
    <div className="mb-6 flex items-start gap-3 rounded-xl border border-[#4CAF6E]/40 bg-[#4CAF6E]/[0.08] px-4 py-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#4CAF6E]/20">
        <Check className="h-4 w-4 text-[#4CAF6E]" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[#E8E4DD]">Meta ads accounts connected.</p>
        <p className="mt-0.5 text-xs text-[#C4C0B6]">
          Let&apos;s set up the Meta Ads MCP so Claude, Codex, and other clients can use it.
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-md p-1 text-[#C4C0B6] transition hover:bg-[#E8E4DD]/8 hover:text-[#E8E4DD]"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
