import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { db, schema } from "@/lib/db";
import { eq, gte, and } from "drizzle-orm";
import { COOKIE_NAMES, setSessionCookies } from "@/lib/auth-cookies";
import { deriveCustomerName } from "@/lib/google-ads";

export async function POST() {
  const cookieStore = await cookies();
  const oldToken = cookieStore.get(COOKIE_NAMES.token)?.value;

  if (!oldToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const [session] = await db()
    .select()
    .from(schema.mcpSessions)
    .where(
      and(
        eq(schema.mcpSessions.accessToken, oldToken),
        gte(schema.mcpSessions.expiresAt, new Date().toISOString()),
      ),
    )
    .limit(1);

  if (!session) {
    return NextResponse.json({ error: "Session not found or expired" }, { status: 404 });
  }

  const newToken = randomBytes(32).toString("hex");
  const newExpiresAt = new Date();
  newExpiresAt.setFullYear(newExpiresAt.getFullYear() + 1);

  await db()
    .update(schema.mcpSessions)
    .set({
      accessToken: newToken,
      expiresAt: newExpiresAt.toISOString(),
    })
    .where(eq(schema.mcpSessions.id, session.id));

  const response = NextResponse.json({ token: newToken });
  setSessionCookies(response, newToken, deriveCustomerName(session.customerIds));
  return response;
}
