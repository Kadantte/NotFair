// Next.js boots this once per server process via the instrumentation hook.
// We use it to start the goal-tick loop — without that call, goal
// heartbeats never fire.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { ensureSchedulerRunning } = await import("@/server/scheduler/tick");
  ensureSchedulerRunning();
}
