import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, and, gte, desc } from "drizzle-orm";
import { setImpersonateCookie, clearImpersonateCookie } from "@/lib/auth-cookies";
import { requireDevEmail } from "@/lib/dev-access";

/** Start impersonating another account's session. Dev-only. */
export async function POST(request: Request) {
  const denied = await requireDevEmail();
  if (denied) return denied;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { accountId } = body;
  if (!accountId || typeof accountId !== "string") {
    return NextResponse.json({ error: "Missing accountId" }, { status: 400 });
  }

  // Find the most recent valid session for the target account
  const [targetSession] = await db()
    .select({
      id: schema.mcpSessions.id,
      customerId: schema.mcpSessions.customerId,
      googleEmail: schema.mcpSessions.googleEmail,
    })
    .from(schema.mcpSessions)
    .where(
      and(
        eq(schema.mcpSessions.customerId, accountId),
        gte(schema.mcpSessions.expiresAt, new Date().toISOString()),
      ),
    )
    .orderBy(desc(schema.mcpSessions.createdAt))
    .limit(1);

  if (!targetSession) {
    return NextResponse.json({ error: "No valid session found for this account" }, { status: 404 });
  }

  const response = NextResponse.json({
    ok: true,
    customerId: targetSession.customerId,
    email: targetSession.googleEmail,
  });
  setImpersonateCookie(response, String(targetSession.id));
  return response;
}

/** Stop impersonating. */
export async function DELETE() {
  const denied = await requireDevEmail();
  if (denied) return denied;

  const response = NextResponse.json({ ok: true });
  clearImpersonateCookie(response);
  return response;
}
