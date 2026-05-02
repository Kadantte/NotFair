/**
 * Set the active Meta ad account for the signed-in user.
 *
 * The page at /connect-meta only handles which accounts are LINKED
 * (`account_ids`); the per-session default lives in `active_account_id` and
 * is changed via the navbar account switcher, which calls this endpoint.
 *
 * Same shape as `/api/auth/select-account` (Google) — single-id payload,
 * validates the chosen account is in the curated subset.
 *
 * Body: `{ accountId: string }` — must be in `account_ids`.
 */

import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/session";
import { setActivePlatformCookie } from "@/lib/auth-cookies";

export async function POST(request: Request) {
  // Use getSession() not getAuthContext() — the navbar account switcher must
  // work for users who have a Meta connection but no Google customer (ads-less
  // Google sessions). Google-strict gates would 403 them otherwise.
  const session = await getSession();
  if (!session.connected || !session.userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 403 });
  }
  const userId = session.userId;

  let body: { accountId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (typeof body.accountId !== "string" || body.accountId.length === 0) {
    return NextResponse.json({ error: "missing_accountId" }, { status: 400 });
  }
  const accountId = body.accountId;

  const [conn] = await db()
    .select({
      id: schema.adPlatformConnections.id,
      accountIds: schema.adPlatformConnections.accountIds,
    })
    .from(schema.adPlatformConnections)
    .where(
      and(
        eq(schema.adPlatformConnections.userId, userId),
        eq(schema.adPlatformConnections.platform, "meta_ads"),
      ),
    )
    .limit(1);

  if (!conn) {
    return NextResponse.json({ error: "no_meta_connection" }, { status: 404 });
  }

  // Active must be in the curated subset (not just available). Defends
  // against picking a Meta-side ad account the user has explicitly opted
  // out of managing.
  const valid = (conn.accountIds ?? []).some((a) => a.id === accountId);
  if (!valid) {
    return NextResponse.json(
      {
        error: "account_not_linked",
        error_description:
          "That account isn't in your linked Meta ad accounts. Visit /connect-meta to add it.",
      },
      { status: 400 },
    );
  }

  await db()
    .update(schema.adPlatformConnections)
    .set({
      activeAccountId: accountId,
      updatedAt: sql`now()`,
    })
    .where(eq(schema.adPlatformConnections.id, conn.id));

  const response = NextResponse.json({ ok: true, activeAccountId: accountId });
  setActivePlatformCookie(response, "meta_ads");
  return response;
}
