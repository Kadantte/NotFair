import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { setGoogleConnectionActiveAccount } from "@/lib/connections/google";
import { compareForShadowRead, loadGoogleConnection } from "@/lib/connections/google-read";
import { readGoogleFromConnections } from "@/lib/connections/feature-flags";
import { db, schema } from "@/lib/db";
import { eq, and, gte } from "drizzle-orm";
import { COOKIE_NAMES, setActivePlatformCookie, setSessionCookies } from "@/lib/auth-cookies";
import { deriveCustomerName, parseCustomerIds } from "@/lib/google-ads";

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

  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAMES.token)?.value;
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const [session] = await db()
    .select({
      id: schema.mcpSessions.id,
      accessToken: schema.mcpSessions.accessToken,
      refreshToken: schema.mcpSessions.refreshToken,
      customerId: schema.mcpSessions.customerId,
      customerIds: schema.mcpSessions.customerIds,
      loginCustomerId: schema.mcpSessions.loginCustomerId,
      googleEmail: schema.mcpSessions.googleEmail,
      userId: schema.mcpSessions.userId,
    })
    .from(schema.mcpSessions)
    .where(
      and(
        eq(schema.mcpSessions.accessToken, token),
        gte(schema.mcpSessions.expiresAt, new Date().toISOString()),
      ),
    )
    .limit(1);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Phase-2 read split: validate the requested account against the connection
  // row when READ_GOOGLE_FROM_CONNECTIONS is on; otherwise validate against
  // mcp_sessions.customerIds. Always shadow-read so dual-write divergence is
  // surfaced at switch time too — this path is high-signal because the user
  // is actively curating accounts.
  const conn = session.userId ? await loadGoogleConnection(session.userId) : null;
  if (session.userId) {
    compareForShadowRead({
      userId: session.userId,
      fromSession: {
        refreshToken: session.refreshToken,
        customerId: session.customerId,
        customerIds: session.customerIds,
        loginCustomerId: session.loginCustomerId ?? null,
        googleEmail: session.googleEmail ?? null,
      },
      fromConnection: conn,
      source: "switch-account",
    });
  }

  // Verify the requested account is in the connected accounts list
  const accounts = readGoogleFromConnections() && conn
    ? conn.customerIds
    : parseCustomerIds(session.customerIds);
  if (!accounts.some((a) => a.id === customerId)) {
    return NextResponse.json({ error: "Account not connected" }, { status: 403 });
  }

  await db().transaction(async (tx) => {
    await tx
      .update(schema.mcpSessions)
      .set({ customerId })
      .where(eq(schema.mcpSessions.id, session.id));

    if (session.userId) {
      await setGoogleConnectionActiveAccount(
        { userId: session.userId, activeAccountId: customerId },
        tx,
      );
    }
  });

  const accountNames = deriveCustomerName(session.customerIds);
  const response = NextResponse.json({ ok: true });
  setSessionCookies(response, session.accessToken, accountNames);
  setActivePlatformCookie(response, "google_ads");
  return response;
}
