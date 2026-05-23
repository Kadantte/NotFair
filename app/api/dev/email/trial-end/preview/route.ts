import { requireDevEmail } from "@/lib/dev-access";
import { stripeMode } from "@/lib/stripe/config";
import { loadTrialEndCandidates } from "@/lib/email/trial-end-runner";
import { buildTrialEndEmail } from "@/lib/email/trial-end";

/**
 * Per-recipient preview of the trial-end email. Backs the confirm-modal on
 * the dashboard's per-row Send button — the dev can see exactly what will
 * land in that user's inbox, with their real first name substituted in,
 * before sending.
 *
 * GET ?userId=… → re-runs eligibility (same shared filter the cron uses)
 * and returns the rendered subject / html / text. 404 when the user is no
 * longer eligible (paid up, opted out, already emailed) — that's also the
 * signal for the modal to refuse to send.
 */
export async function GET(request: Request) {
  const denied = await requireDevEmail();
  if (denied) return denied;

  const userId = new URL(request.url).searchParams.get("userId")?.trim();
  if (!userId) {
    return Response.json({ error: "userId required" }, { status: 400 });
  }

  // Dashboard is pinned to env=live; the per-row send uses stripeMode() to
  // match what the cron itself sees. Use stripeMode() here too so preview
  // and actual send agree.
  const env = stripeMode();
  const [cand] = await loadTrialEndCandidates({ env, limit: 1, userId });
  if (!cand) {
    return Response.json(
      { error: "not_eligible", message: "User no longer eligible (paid, opted out, or already emailed)" },
      { status: 404 },
    );
  }

  const { subject, html, text } = buildTrialEndEmail({ firstName: cand.firstName });
  return Response.json({
    subject,
    html,
    text,
    recipient: cand.email,
    firstName: cand.firstName,
    userId: cand.userId,
  });
}
