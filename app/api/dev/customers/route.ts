import { getAuthContext } from "@/lib/session";
import { db, schema } from "@/lib/db";
import { sql, desc, inArray } from "drizzle-orm";
import { DEV_EMAILS } from "@/lib/dev-access";
import { parseCustomerIds } from "@/lib/google-ads";

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

  // Collect all unique account IDs across all customers
  const allAccountIds = new Set<string>();
  const parsed = customers.map((c) => {
    const accounts = parseCustomerIds(c.customerIds);
    for (const a of accounts) allAccountIds.add(a.id);
    return { ...c, accounts };
  });

  // Batch-fetch account snapshots from the accounts table
  const snapshots = new Map<string, { dailyBudget: number | null; activeCampaigns: number | null; currencyCode: string | null }>();
  if (allAccountIds.size > 0) {
    const rows = await db()
      .select({
        accountId: schema.accounts.accountId,
        dailyBudget: schema.accounts.dailyBudget,
        activeCampaigns: schema.accounts.activeCampaigns,
        currencyCode: schema.accounts.currencyCode,
      })
      .from(schema.accounts)
      .where(inArray(schema.accounts.accountId, [...allAccountIds]));
    for (const { accountId, ...snap } of rows) {
      snapshots.set(accountId, snap);
    }
  }

  const result = parsed.map((c) => ({
    userId: c.userId,
    googleEmail: c.googleEmail,
    primaryAccountId: c.customerId,
    accounts: c.accounts.map((a) => ({
      ...a,
      ...(snapshots.get(a.id) ?? {}),
    })),
    accountCount: c.accounts.length,
    sessions: c.sessions,
    lastActive: c.lastActive,
    firstSeen: c.firstSeen,
  }));

  return Response.json({ customers: result });
}
