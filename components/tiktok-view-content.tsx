"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

declare global {
  interface Window {
    ttq?: (...args: unknown[]) => void;
  }
}

/**
 * Fires TikTok's `ViewContent` standard funnel event on every marketing
 * page view. TikTok's vertical-funnel optimization needs explicit
 * ViewContent signals (the auto-tracked Pageview / Engaged Session don't
 * count as funnel events for bidding).
 *
 * The TikTok pixel stub in app/layout.tsx queues calls until the SDK
 * loads, so calling `ttq("track", ...)` here is safe even before the
 * real SDK hydrates.
 */
export function TikTokViewContent() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.ttq !== "function") return;
    window.ttq("track", "ViewContent", {
      content_type: "product",
      content_name: pathname,
    });
  }, [pathname]);

  return null;
}
