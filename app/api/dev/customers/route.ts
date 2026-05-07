import { db, schema } from "@/lib/db";
import { sql, desc, inArray, isNotNull, and, gte } from "drizzle-orm";
import { after } from "next/server";
import { requireDevEmail } from "@/lib/dev-access";
import { OP_TYPE } from "@/lib/db/tracking";
import { devEmailSqlList, excludeDevOpsFilter, operationErrorRowCount, operationRowCount, operationTypeRowCount } from "@/lib/dev-ops-filter";
import { parseCustomerIds } from "@/lib/google-ads";
import { getUsdRates, getCurrencyInfo, toUsd } from "@/lib/currency";
import { refreshStaleAccountSnapshots } from "@/lib/google-ads/account-snapshot-refresh";

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
  return deriveAttributionFromFields({
    source: safeString(meta?.utm_source),
    medium: safeString(meta?.utm_medium),
    campaign: safeString(meta?.utm_campaign),
    term: safeString(meta?.utm_term),
    content: safeString(meta?.utm_content),
    referrer: safeString(meta?.signup_referrer),
    referrerDomain: safeString(meta?.signup_referrer_domain),
  });
}

function deriveAttributionFromFields(fields: {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  term: string | null;
  content: string | null;
  referrer: string | null;
  referrerDomain?: string | null;
}): Attribution {
  const { source, medium, campaign, term, content, referrer } = fields;
  const referrerHost = formatReferrer(referrer);
  const referrerDomain = safeString(fields.referrerDomain) ?? referrerHost;

  const label = source && medium
    ? `${source} / ${medium}`
    : source
      ? source
      : referrerDomain
        ? referrerDomain
        : "Unknown source";

  const detail = campaign
    ? `campaign: ${campaign}`
    : term
      ? `term: ${term}`
      : content
      ? `content: ${content}`
        : referrerDomain && referrer
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

const SNAPSHOT_REFRESH_DEBOUNCE_MS = 5 * 60_000;
const MAX_DEV_VIEW_SNAPSHOT_REFRESHES = 10;
const queuedSnapshotRefreshes = new Map<string, number>();

function coalesceZero(value: number | null | undefined) {
  return value ?? 0;
}

function timestampMs(value: Date | string | null | undefined) {
  if (!value) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function enqueueSuspiciousSnapshotRefresh(accountIds: string[]) {
  const now = Date.now();
  const uniqueIds = [...new Set(accountIds)]
    .filter((accountId) => {
      const queuedAt = queuedSnapshotRefreshes.get(accountId) ?? 0;
      return now - queuedAt >= SNAPSHOT_REFRESH_DEBOUNCE_MS;
    })
    .slice(0, MAX_DEV_VIEW_SNAPSHOT_REFRESHES);

  if (uniqueIds.length === 0) return;
  for (const accountId of uniqueIds) queuedSnapshotRefreshes.set(accountId, now);

  after(async () => {
    try {
      const result = await refreshStaleAccountSnapshots({
        accountIds: uniqueIds,
        limit: uniqueIds.length,
        minOps: 20,
      });
      if (result.refreshed > 0 || result.failed > 0) {
        console.log(
          `[dev/customers] refreshed stale account snapshots: refreshed=${result.refreshed}; failed=${result.failed}; accounts=${uniqueIds.join(",")}`,
        );
      }
    } catch (error) {
      console.warn("[dev/customers] Failed to refresh suspicious account snapshots:", error);
    }
  });
}

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
      const map = new Map<string, { dailyBudget: number | null; activeCampaigns: number | null; currencyCode: string | null; lastSyncedAt: Date | null }>();
      if (allAccountIds.size > 0) {
        const rows = await db()
          .select({
            accountId: schema.accounts.accountId,
            dailyBudget: schema.accounts.dailyBudget,
            activeCampaigns: schema.accounts.activeCampaigns,
            currencyCode: schema.accounts.currencyCode,
            lastSyncedAt: schema.accounts.lastSyncedAt,
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
    // Canonical first-touch attribution. This table is backfilled from
    // auth.users and then written directly by the auth callbacks.
    (async () => {
      const map = new Map<string, Attribution>();
      if (userIds.length === 0) return map;
      try {
        const rows = await db()
          .select({
            userId: schema.userAttribution.userId,
            source: schema.userAttribution.source,
            medium: schema.userAttribution.medium,
            campaign: schema.userAttribution.campaign,
            term: schema.userAttribution.term,
            content: schema.userAttribution.content,
            referrer: schema.userAttribution.signupReferrer,
            referrerDomain: schema.userAttribution.signupReferrerDomain,
          })
          .from(schema.userAttribution)
          .where(inArray(schema.userAttribution.userId, userIds));
        for (const r of rows) {
          map.set(r.userId, deriveAttributionFromFields(r));
        }
      } catch (err) {
        console.warn("[dev/customers] Failed to read user attribution:", err);
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
    const suspiciousSnapshotAccountIds: string[] = [];
    const accounts = c.accounts.map((a) => {
      const ops = opsCounts.get(a.id);
      const opTotal = (ops?.reads ?? 0) + (ops?.writes ?? 0);
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
      const snapshotMissing = !snap;
      const snapshotSyncedAtMs = timestampMs(snap?.lastSyncedAt);
      const lastOpMs = timestampMs(ops?.lastOp);
      const snapshotOlderThanUsage = lastOpMs != null
        && (snapshotSyncedAtMs == null || snapshotSyncedAtMs < lastOpMs);
      const zeroWithUsage = !!snap
        && coalesceZero(snap.dailyBudget) === 0
        && coalesceZero(snap.activeCampaigns) === 0
        && opTotal >= 20
        && snapshotOlderThanUsage;
      if ((snapshotMissing && opTotal > 0) || zeroWithUsage) {
        suspiciousSnapshotAccountIds.push(a.id);
      }
      return {
        ...a,
        ...(snap ?? {}),
        dailyBudgetUsd,
        country: info?.country ?? null,
        flag: info?.flag ?? null,
        snapshotStatus: snapshotMissing ? "missing" : zeroWithUsage ? "stale" : "ok",
      };
    });

    enqueueSuspiciousSnapshotRefresh(suspiciousSnapshotAccountIds);

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
