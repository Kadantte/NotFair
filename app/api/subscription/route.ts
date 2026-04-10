import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getUserSubscription } from "@/lib/subscription";

/**
 * Lightweight client-facing subscription summary. Used by the sidebar
 * UserMenu to decide whether to enable "Manage subscription".
 */
export async function GET() {
  const session = await getSession();
  if (!session.connected) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const sub = await getUserSubscription(session.userId);
  return NextResponse.json({
    plan: sub.plan,
    status: sub.status,
    stripeCustomerId: sub.stripeCustomerId,
    scheduledCancelAt: sub.scheduledCancelAt?.toISOString() ?? null,
  });
}
