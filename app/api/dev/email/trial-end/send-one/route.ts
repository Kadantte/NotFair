import { requireDevEmail } from "@/lib/dev-access";
import { runTrialEndSendForUser } from "@/lib/email/trial-end-runner";

/**
 * Dev-only per-row "Send" button on /dev/email/trial-end-alert.
 *
 * POST { userId, env? } → triggers a single trial-end email to that user,
 * re-verifying eligibility against the shared filter at request time so
 * a dashboard row that's gone stale (user just paid / opted out / was
 * already emailed by a concurrent run) is skipped instead of double-sent.
 *
 * `env` is optional and lets the dashboard pin the send to the env it's
 * displaying (always 'live'). Without it we fall back to stripeMode(),
 * which matches whatever env the running cron itself targets. The dashboard
 * always passes env explicitly so local dev (stripeMode=test) doesn't
 * silently search the wrong subscription rows.
 *
 * Shares `lib/email/trial-end-runner.ts` with the cron + bulk "Send now",
 * so all three paths apply the same audience filter, the same email body,
 * and the same idempotency latch.
 */
export async function POST(request: Request) {
  const denied = await requireDevEmail();
  if (denied) return denied;

  let body: { userId?: unknown; env?: unknown };
  try {
    body = (await request.json()) as { userId?: unknown; env?: unknown };
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (!userId) {
    return Response.json({ error: "userId required" }, { status: 400 });
  }
  const env: "test" | "live" | undefined =
    body.env === "test" || body.env === "live" ? body.env : undefined;

  try {
    const result = await runTrialEndSendForUser({ userId, env });
    return Response.json(result);
  } catch (err) {
    console.error("[dev/email/trial-end/send-one] fatal:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
