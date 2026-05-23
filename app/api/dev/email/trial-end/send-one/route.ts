import { requireDevEmail } from "@/lib/dev-access";
import { runTrialEndSendForUser } from "@/lib/email/trial-end-runner";

/**
 * Dev-only per-row "Send" button on /dev/email/trial-end-alert.
 *
 * POST { userId } → triggers a single trial-end email to that user,
 * re-verifying eligibility against the shared filter at request time so
 * a dashboard row that's gone stale (user just paid / opted out / was
 * already emailed by a concurrent run) is skipped instead of double-sent.
 *
 * Shares `lib/email/trial-end-runner.ts` with the cron + bulk "Send now",
 * so all three paths apply the same audience filter, the same email body,
 * and the same idempotency latch.
 */
export async function POST(request: Request) {
  const denied = await requireDevEmail();
  if (denied) return denied;

  let body: { userId?: unknown };
  try {
    body = (await request.json()) as { userId?: unknown };
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (!userId) {
    return Response.json({ error: "userId required" }, { status: 400 });
  }

  try {
    const result = await runTrialEndSendForUser({ userId });
    return Response.json(result);
  } catch (err) {
    console.error("[dev/email/trial-end/send-one] fatal:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
