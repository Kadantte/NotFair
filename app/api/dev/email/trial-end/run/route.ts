import { requireDevEmail } from "@/lib/dev-access";
import { runTrialEndSend } from "@/lib/email/trial-end-runner";

/**
 * Dev-only manual trigger for the trial-end send loop, wired to the
 * "Send now" button on /dev/email/trial-end-alert.
 *
 * Shares the runner with /api/cron/trial-end-emails — same audience filter,
 * same cap, same idempotency latch. Running this and the daily cron back to
 * back won't double-send because trial_end_email_sent_at is stamped after
 * each successful Resend acceptance.
 */
export async function POST() {
  const denied = await requireDevEmail();
  if (denied) return denied;

  try {
    const summary = await runTrialEndSend();
    return Response.json({ success: true, ...summary });
  } catch (err) {
    console.error("[dev/email/trial-end/run] fatal:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
