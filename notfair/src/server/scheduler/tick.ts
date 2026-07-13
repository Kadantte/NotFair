import { runDueGoalTicks } from "@/server/goals/tick";

/**
 * The heartbeat loop. Started once on boot (src/instrumentation.ts); a
 * 30s interval sweeps active goals whose next_tick_at has passed and
 * runs their ticks. This is the ONLY scheduler in the product — goals
 * are the one thing that recurs.
 */
let started = false;
let timer: NodeJS.Timeout | null = null;
const TICK_INTERVAL_MS = 30_000;

export function ensureSchedulerRunning(): void {
  if (started) return;
  started = true;
  timer = setInterval(() => {
    runDueGoalTicks().catch((err) =>
      console.error("[scheduler] goal tick sweep failed:", err),
    );
  }, TICK_INTERVAL_MS);
  // First sweep on the next event-loop turn so callers return immediately.
  setImmediate(() =>
    runDueGoalTicks().catch((err) =>
      console.error("[scheduler] goal tick sweep failed:", err),
    ),
  );
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
}
