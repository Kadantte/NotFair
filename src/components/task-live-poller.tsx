"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import type { TaskStatus } from "@/types";

/**
 * While the task is in flight (status: running or proposed-with-thread),
 * refresh the page every few seconds so the user sees the agent's
 * progress (status flips, activity log, persisted transcript) without
 * having to hit the reload button. Server components re-render on
 * router.refresh; the AgentChat client component is keyed on the
 * statusKey prop so it remounts exactly once when status flips to a
 * terminal state — that pulls in the agent's final reply from JSONL.
 *
 * Cap polling at 10 minutes per mount so we don't burn cycles if the
 * agent gets stuck. The page can be reloaded manually after that.
 */
const POLL_INTERVAL_MS = 3_000;
const POLL_MAX_DURATION_MS = 10 * 60 * 1000;

const POLL_STATUSES: TaskStatus[] = ["running", "proposed", "approved"];

export function TaskLivePoller({ status }: { status: TaskStatus }) {
  const router = useRouter();
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    // Only poll while the task is in an in-flight state. As soon as it
    // flips to done/failed/cancelled, the effect's cleanup tears down
    // the interval.
    if (!POLL_STATUSES.includes(status)) return;
    if (startedAtRef.current === null) startedAtRef.current = Date.now();

    const interval = setInterval(() => {
      const elapsed = Date.now() - (startedAtRef.current ?? Date.now());
      if (elapsed > POLL_MAX_DURATION_MS) {
        clearInterval(interval);
        return;
      }
      router.refresh();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [status, router]);

  return null;
}
