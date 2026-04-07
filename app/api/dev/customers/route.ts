import { getAuthContext } from "@/lib/session";
import { db, schema } from "@/lib/db";
import { sql, desc } from "drizzle-orm";
import { DEV_EMAILS } from "@/lib/dev-access";

export async function GET() {
  let googleEmail: string | null = null;
  try {
    const ctx = await getAuthContext();
    googleEmail = ctx.auth.realGoogleEmail ?? ctx.session.googleEmail;
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
  if (!googleEmail || !DEV_EMAILS.includes(googleEmail)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get unique customers from mcp_sessions, ordered by most recent session creation
  const customers = await db()
    .select({
      userId: schema.mcpSessions.userId,
      googleEmail: sql<string | null>`max(${schema.mcpSessions.googleEmail})`.as("google_email"),
      customerId: sql<string>`max(${schema.mcpSessions.customerId})`.as("customer_id"),
      customerIds: sql<string>`max(${schema.mcpSessions.customerIds})`.as("customer_ids"),
      sessions: sql<number>`count(*)`.as("sessions"),
      lastActive: sql<string>`max(${schema.mcpSessions.createdAt})`.as("last_active"),
      firstSeen: sql<string>`min(${schema.mcpSessions.createdAt})`.as("first_seen"),
    })
    .from(schema.mcpSessions)
    .groupBy(schema.mcpSessions.userId)
    .orderBy(desc(sql`max(${schema.mcpSessions.createdAt})`));

  // Parse customerIds JSON and count connected accounts
  const result = customers.map((c) => {
    let accounts: { id: string; name: string }[] = [];
    try {
      const parsed = JSON.parse(c.customerIds || "[]");
      if (Array.isArray(parsed)) accounts = parsed;
    } catch {
      // ignore
    }
    return {
      userId: c.userId,
      googleEmail: c.googleEmail,
      primaryAccountId: c.customerId,
      accounts,
      accountCount: accounts.length,
      sessions: c.sessions,
      lastActive: c.lastActive,
      firstSeen: c.firstSeen,
    };
  });

  return Response.json({ customers: result });
}
