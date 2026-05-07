import { NextResponse } from "next/server";
import { setGoogleConnectionActiveAccount } from "@/lib/connections/google";
import { loadGoogleConnection } from "@/lib/connections/google-read";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { setActivePlatformCookie, setSessionCookies } from "@/lib/auth-cookies";
import { identifyUser } from "@/lib/auth/identify-user";

export async function POST(request: Request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { customerId } = body;
  if (!customerId || typeof customerId !== "string") {
    return NextResponse.json({ error: "Missing customerId" }, { status: 400 });
  }

  // Phase-4 step 2: identity from Supabase (with cookie fallback). Validate
  // the requested account against the connection's accountIds. mcp_sessions
  // UPDATE only fires for legacy cookie-resolved users.
  const identity = await identifyUser({ source: "switch-account" });
  if (!identity) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const conn = await loadGoogleConnection(identity.userId);
  if (!conn) {
    return NextResponse.json(
      { error: "No Google Ads connection found" },
      { status: 404 },
    );
  }

  // Verify the requested account is in the connected accounts list
  if (!conn.customerIds.some((a) => a.id === customerId)) {
    return NextResponse.json({ error: "Account not connected" }, { status: 403 });
  }

  await db().transaction(async (tx) => {
    // Connection: source of truth, always update.
    await setGoogleConnectionActiveAccount(
      { userId: identity.userId, activeAccountId: customerId },
      tx,
    );

    // Legacy mcp_sessions UPDATE only when the user came in via cookie.
    if (identity.legacySessionId !== null) {
      await tx
        .update(schema.mcpSessions)
        .set({ customerId })
        .where(eq(schema.mcpSessions.id, identity.legacySessionId));
    }
  });

  const response = NextResponse.json({ ok: true });
  // Re-issue the legacy cookie only for cookie-resolved users.
  if (identity.legacySessionId !== null) {
    const [legacyRow] = await db()
      .select({ accessToken: schema.mcpSessions.accessToken })
      .from(schema.mcpSessions)
      .where(eq(schema.mcpSessions.id, identity.legacySessionId))
      .limit(1);
    if (legacyRow) setSessionCookies(response, legacyRow.accessToken);
  }
  setActivePlatformCookie(response, "google_ads");
  return response;
}
