import { NextResponse } from "next/server";

import { runTrialEndSend } from "@/lib/email/trial-end-runner";

/**
 * Daily Vercel Cron: notify customers whose 7-day trial has lapsed and who
 * remain on the Free plan.
 *
 * The send loop, audience filter, idempotency latch, ordering, and cap all
 * live in `lib/email/trial-end-runner.ts` so this route and the dev-only
 * "Send now" endpoint (`/api/dev/email/trial-end/run`) share one
 * implementation. Send priority is `trial_ends_at DESC` — recently-ended
 * trials go first because conversion intent decays with time.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runTrialEndSend();
    return NextResponse.json({
      success: true,
      ...summary,
      ...(summary.errorDetails.length === 0 ? { errorDetails: undefined } : {}),
    });
  } catch (err) {
    console.error("[cron/trial-end-emails] fatal:", err);
    return NextResponse.json(
      { error: "Trial-end email cron failed" },
      { status: 500 },
    );
  }
}
