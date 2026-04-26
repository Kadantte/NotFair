import { db, schema } from "@/lib/db";
import { sql, desc, inArray, isNotNull } from "drizzle-orm";
import { requireDevEmail } from "@/lib/dev-access";
import { devEmailSqlList } from "@/lib/dev-ops-filter";
import { parseCustomerIds } from "@/lib/google-ads";

// Single-tenant admin cache: dev dashboard is hit by a tiny set of authorized
// users, and the underlying data (sessions, ops counts, account snapshots)
// changes on the order of minutes. A 60s TTL turns repeat refreshes into a
// memory hit — DB time goes from ~250ms to <1ms.
const CACHE_TTL_MS = 60_000;
let cache: { data: unknown; ts: number } | null = null;

export async function GET(request: Request) {
  const denied = await requireDevEmail();
  if (denied) return denied;

  const fresh = new URL(request.url).searchParams.get("fresh") === "1";
  if (!fresh && cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return Response.json(cache.data);
  }

  // Get unique customers from mcp_sessions. Exclude dev users so their sessions
  // and operations are never counted in customer-level aggregates.
  const customers = await db()
    .select({
      userId: schema.mcpSessions.userId,
      googleEmail: sql<string | null>`max(${schema.mcpSessions.googleEmail})`.as("google_email"),
      customerId: sql<string>`max(${schema.mcpSessions.customerId})`.as("customer_id"),
      customerIds: sql<string>`max(${schema.mcpSessions.customerIds})`.as("customer_ids"),
      sessions: sql<number>`count(*)::int`.as("sessions"),
      lastSessionAt: sql<string>`max(${schema.mcpSessions.createdAt})`.as("last_session_at"),
      firstSeen: sql<string>`min(${schema.mcpSessions.createdAt})`.as("first_seen"),
    })
    .from(schema.mcpSessions)
    .groupBy(schema.mcpSessions.userId)
    .having(
      sql`coalesce(lower(max(${schema.mcpSessions.googleEmail})), '') not in (${devEmailSqlList()})`,
    )
    .orderBy(desc(sql`max(${schema.mcpSessions.createdAt})`));

  // Collect all unique account IDs across all customers
  const allAccountIds = new Set<string>();
  const parsed = customers.map((c) => {
    const accounts = parseCustomerIds(c.customerIds);
    for (const a of accounts) allAccountIds.add(a.id);
    return { ...c, accounts };
  });

  // Batch-fetch account snapshots, operation counts, and contacts (for
  // outreach status) in parallel. Gmail draft recipients are deferred to
  // /api/dev/customers/drafts so the table can render without waiting on
  // multi-second Gmail round-trips.
  const [snapshots, opsCounts, contactsByEmail] = await Promise.all([
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
    // Contacts keyed by email — surfaces drafted/contacted state from the
    // outreach panel writes.
    (async () => {
      const map = new Map<string, { status: string; hasDraft: boolean; lastContactedAt: string | null }>();
      const rows = await db()
        .select({
          email: schema.contacts.email,
          status: schema.contacts.status,
          draftBody: schema.contacts.draftBody,
          lastContactedAt: schema.contacts.lastContactedAt,
        })
        .from(schema.contacts)
        .where(isNotNull(schema.contacts.email));
      for (const r of rows) {
        map.set(r.email.toLowerCase(), {
          status: r.status,
          hasDraft: !!r.draftBody,
          lastContactedAt: r.lastContactedAt ? r.lastContactedAt.toISOString() : null,
        });
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

    // Outreach status from contacts table only — out-of-band Gmail drafts
    // are merged client-side from /api/dev/customers/drafts.
    const emailKey = c.googleEmail?.toLowerCase() ?? null;
    const contact = emailKey ? contactsByEmail.get(emailKey) : undefined;
    let outreachStatus: "contacted" | "drafted" | "none" = "none";
    if (contact?.status === "contacted") outreachStatus = "contacted";
    else if (contact?.hasDraft) outreachStatus = "drafted";

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
      outreachStatus,
      lastContactedAt: contact?.lastContactedAt ?? null,
    };
  });

  // Re-sort by lastActive (SQL only sorted by session time, JS computed the true lastActive)
  result.sort((a, b) => (b.lastActive ?? "").localeCompare(a.lastActive ?? ""));

  const payload = { customers: result };
  cache = { data: payload, ts: Date.now() };
  return Response.json(payload);
}
