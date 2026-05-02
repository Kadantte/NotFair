import { NextResponse } from "next/server";
import { cookies } from "next/headers";
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
      customerIds: schema.mcpSessions.customerIds,
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

  // Verify the requested account is in the connected accounts list
  const accounts = parseCustomerIds(session.customerIds);
  if (!accounts.some((a) => a.id === customerId)) {
    return NextResponse.json({ error: "Account not connected" }, { status: 403 });
  }

  await db()
    .update(schema.mcpSessions)
    .set({ customerId })
    .where(eq(schema.mcpSessions.id, session.id));

  const accountNames = deriveCustomerName(session.customerIds);
  const response = NextResponse.json({ ok: true });
  setSessionCookies(response, session.accessToken, accountNames);
  setActivePlatformCookie(response, "google_ads");
  return response;
}
