import { db, schema } from "@/lib/db";
import { sql, desc, inArray, isNotNull, and, gte } from "drizzle-orm";
import { requireDevEmail } from "@/lib/dev-access";
import { OP_TYPE } from "@/lib/db/tracking";
import { devEmailSqlList, excludeDevOpsFilter, operationErrorRowCount, operationRowCount, operationTypeRowCount } from "@/lib/dev-ops-filter";
import { parseCustomerIds } from "@/lib/google-ads";
import { getUsdRates, getCurrencyInfo, toUsd } from "@/lib/currency";

type Attribution = {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  term: string | null;
  content: string | null;
  referrer: string | null;
  label: string;
  detail: string | null;
};

function safeString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function formatReferrer(referrer: string | null): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).hostname.replace(/^www\./, "");
  } catch {
    return referrer.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || referrer;
  }
}

function deriveAttribution(meta: Record<string, unknown> | null | undefined): Attribution {
  const source = safeString(meta?.utm_source);
  const medium = safeString(meta?.utm_medium);
  const campaign = safeString(meta?.utm_campaign);
  const term = safeString(meta?.utm_term);
  const content = safeString(meta?.utm_content);
  const referrer = safeString(meta?.signup_referrer);
  const referrerHost = formatReferrer(referrer);

  const label = source && medium
    ? `${source} / ${medium}`
    : source
      ? source
      : referrerHost
        ? referrerHost
        : "Unknown source";

  const detail = campaign
    ? `campaign: ${campaign}`
    : term
      ? `term: ${term}`
      : content
        ? `content: ${content}`
        : referrerHost && referrer
          ? referrer
          : null;

  return { source, medium, campaign, term, content, referrer, label, detail };
}

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
  const userIds = [...new Set(parsed.map((c) => c.userId).filter((id): id is string => !!id))];

  // Batch-fetch account snapshots, operation counts, contacts (for outreach
  // status), first-touch attribution, and FX rates in parallel. Gmail draft
  // recipients are deferred to /api/dev/customers/drafts so the table can render
  // without waiting on multi-second Gmail round-trips.
  const [snapshots, opsCounts, errorCounts30d, contactsByEmail, attributionByUser, usdRates] = await Promise.all([
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
    // Operations counts per account (all time)
    (async () => {
      const map = new Map<string, { reads: number; writes: number; lastOp: string | null }>();
      if (allAccountIds.size > 0) {
        const rows = await db()
          .select({
            accountId: schema.operations.accountId,
            reads: operationTypeRowCount(schema.operations, OP_TYPE.READ),
            writes: operationTypeRowCount(schema.operations, OP_TYPE.WRITE),
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
    // Error counts per account for the last 30 days. Count operation rows so
    // bulk fan-out tools match the all-time Operations column and billing.
    (async () => {
      const map = new Map<string, { calls: number; errorsCount: number }>();
      if (allAccountIds.size > 0) {
        const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const rows = await db()
          .select({
            accountId: schema.operations.accountId,
            calls: operationRowCount(schema.operations),
            errorsCount: operationErrorRowCount(schema.operations),
          })
          .from(schema.operations)
          .where(
            and(
              inArray(schema.operations.accountId, [...allAccountIds]),
              gte(schema.operations.createdAt, since30d),
              excludeDevOpsFilter(),
            ),
          )
          .groupBy(schema.operations.accountId);
        for (const { accountId, calls, errorsCount } of rows) {
          map.set(accountId, { calls: Number(calls), errorsCount: Number(errorsCount) });
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
    // Supabase Auth stores first-touch UTM/referrer on user metadata during the
    // OAuth callback. Querying auth.users here keeps attribution visible without
    // adding a new app-table migration.
    (async () => {
      const map = new Map<string, Attribution>();
      if (userIds.length === 0) return map;
      try {
        const rows = await db().execute(sql<{ id: string; raw_user_meta_data: Record<string, unknown> | null }>`
          select id::text as id, raw_user_meta_data
          from auth.users
          where id::text in (${sql.join(userIds.map((id) => sql`${id}`), sql`,`)})
        `);
        for (const r of rows as unknown as Array<{ id: string; raw_user_meta_data: Record<string, unknown> | null }>) {
          map.set(r.id, deriveAttribution(r.raw_user_meta_data));
        }
      } catch (err) {
        console.warn("[dev/customers] Failed to read auth.users attribution:", err);
      }
      return map;
    })(),
    getUsdRates(),
  ]);

  const result = parsed.map((c) => {
    // Aggregate operations across all accounts for this customer
    let totalReads = 0;
    let totalWrites = 0;
    let lastOp: string | null = null;
    let totalDailyBudgetUsd: number | null = null;
    let totalCalls30d = 0;
    let totalErrors30d = 0;
    const accounts = c.accounts.map((a) => {
      const ops = opsCounts.get(a.id);
      if (ops) {
        totalReads += ops.reads;
        totalWrites += ops.writes;
        if (ops.lastOp && (!lastOp || ops.lastOp > lastOp)) lastOp = ops.lastOp;
      }
      const errs = errorCounts30d.get(a.id);
      if (errs) {
        totalCalls30d += errs.calls;
        totalErrors30d += errs.errorsCount;
      }
      const snap = snapshots.get(a.id);
      const dailyBudgetUsd =
        snap?.dailyBudget != null ? toUsd(snap.dailyBudget, snap.currencyCode, usdRates) : null;
      if (dailyBudgetUsd != null) totalDailyBudgetUsd = (totalDailyBudgetUsd ?? 0) + dailyBudgetUsd;
      const info = getCurrencyInfo(snap?.currencyCode);
      return {
        ...a,
        ...(snap ?? {}),
        dailyBudgetUsd,
        country: info?.country ?? null,
        flag: info?.flag ?? null,
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

    const errorRate = totalCalls30d > 0 ? (totalErrors30d / totalCalls30d) * 100 : 0;

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
      dailyBudgetUsd: totalDailyBudgetUsd,
      attribution: c.userId ? attributionByUser.get(c.userId) ?? deriveAttribution(null) : deriveAttribution(null),
      outreachStatus,
      lastContactedAt: contact?.lastContactedAt ?? null,
      errorsCount: totalErrors30d,
      calls30d: totalCalls30d,
      errorRate,
    };
  });

  // Re-sort by lastActive (SQL only sorted by session time, JS computed the true lastActive)
  result.sort((a, b) => (b.lastActive ?? "").localeCompare(a.lastActive ?? ""));

  const payload = { customers: result };
  cache = { data: payload, ts: Date.now() };
  return Response.json(payload);
}
