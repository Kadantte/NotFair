"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Poll-refresh for goal states that change server-side without user input
 * (intake running, a tick in flight). Server components re-render on
 * router.refresh(), so the page stays live without a websocket.
 */
export function GoalAutoRefresh({ intervalMs = 5000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(t);
  }, [router, intervalMs]);
  return null;
}
