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

  // Get unique customers from mcp_sessions
  const customers = await db()
    .select({
      userId: schema.mcpSessions.userId,
      googleEmail: sql<string | null>`max(${schema.mcpSessions.googleEmail})`.as("google_email"),
      customerId: sql<string>`max(${schema.mcpSessions.customerId})`.as("customer_id"),
      customerIds: sql<string>`max(${schema.mcpSessions.customerIds})`.as("customer_ids"),
      sessions: sql<number>`count(*)`.as("sessions"),
      lastSessionAt: sql<string>`max(${schema.mcpSessions.createdAt})`.as("last_session_at"),
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

  // Batch-fetch account snapshots and operation counts in parallel
  const [snapshots, opsCounts] = await Promise.all([
    // Account snapshots (budgets, campaigns)
    (async () => {
      const map = new Map<string, { dailyBudget: number | null; activeCampaigns: number | null; currencyCode: string | null }>();
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
          map.set(accountId, snap);
        }
      }
      return map;
    })(),
    // Operations counts per account
    (async () => {
      const map = new Map<string, { reads: number; writes: number; lastOp: string | null }>();
      if (allAccountIds.size > 0) {
        const rows = await db()
          .select({
            accountId: schema.operations.accountId,
            reads: sql<number>`count(*) filter (where ${schema.operations.opType} = 0)`.as("reads"),
            writes: sql<number>`count(*) filter (where ${schema.operations.opType} = 1)`.as("writes"),
            lastOp: sql<string | null>`max(${schema.operations.createdAt})`.as("last_op"),
          })
          .from(schema.operations)
          .where(inArray(schema.operations.accountId, [...allAccountIds]))
          .groupBy(schema.operations.accountId);
        for (const { accountId, reads, writes, lastOp } of rows) {
          map.set(accountId, { reads: Number(reads), writes: Number(writes), lastOp });
        }
      }
      return map;
    })(),
  ]);

  const result = parsed.map((c) => {
    // Aggregate operations across all accounts for this customer
    let totalReads = 0;
    let totalWrites = 0;
    let lastOp: string | null = null;
    const accounts = c.accounts.map((a) => {
      const ops = opsCounts.get(a.id);
      if (ops) {
        totalReads += ops.reads;
        totalWrites += ops.writes;
        if (ops.lastOp && (!lastOp || ops.lastOp > lastOp)) lastOp = ops.lastOp;
      }
      return {
        ...a,
        ...(snapshots.get(a.id) ?? {}),
      };
    });

    // lastActive = most recent of session creation or any operation on their accounts
    const lastActive = lastOp && (lastOp as string) > c.lastSessionAt ? lastOp : c.lastSessionAt;

    return {
      userId: c.userId,
      googleEmail: c.googleEmail,
      primaryAccountId: c.customerId,
      accounts,
      accountCount: c.accounts.length,
      sessions: Number(c.sessions),
      lastActive,
      firstSeen: c.firstSeen,
      reads: totalReads,
      writes: totalWrites,
      totalOps: totalReads + totalWrites,
    };
  });

  // Re-sort by lastActive (SQL only sorted by session time, JS computed the true lastActive)
  result.sort((a, b) => (b.lastActive ?? "").localeCompare(a.lastActive ?? ""));

  return Response.json({ customers: result });
}
