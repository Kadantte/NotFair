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

  const newToken = randomBytes(32).toString("hex");
  const newExpiresAt = new Date();
  newExpiresAt.setFullYear(newExpiresAt.getFullYear() + 1);

  // Atomic: UPDATE only if the old token still matches and hasn't expired.
  // If two concurrent requests race, only one will match — the other gets 0 rows.
  const [updated] = await db()
    .update(schema.mcpSessions)
    .set({
      accessToken: newToken,
      expiresAt: newExpiresAt.toISOString(),
    })
    .where(
      and(
        eq(schema.mcpSessions.accessToken, oldToken),
        gte(schema.mcpSessions.expiresAt, new Date().toISOString()),
      ),
    )
    .returning({ customerIds: schema.mcpSessions.customerIds });

  if (!updated) {
    return NextResponse.json({ error: "Session not found or expired" }, { status: 404 });
  }

  const response = NextResponse.json({ token: newToken });
  setSessionCookies(response, newToken, deriveCustomerName(updated.customerIds));
  return response;
}
