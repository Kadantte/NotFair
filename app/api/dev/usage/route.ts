import { db, schema } from "@/lib/db";
import { sql, desc, and, eq, gte, lt, isNotNull, inArray, type SQL } from "drizzle-orm";
import { requireDevEmail } from "@/lib/dev-access";
import { excludeDevOpsFilter, excludeDevOpsFilterForAlias, dedupeCount, dedupeErrorCount } from "@/lib/dev-ops-filter";

/**
 * Unified usage+errors endpoint for the /dev Usage tab.
 * Returns stat tiles (totals + prev-period for trends), a per-day breakdown
 * for the volume+errors chart, top 10 users by error count, and top 20 tools.
 *
 * All counts dedupe by coalesce(request_id, id::text) so bulk fan-out tools
 * (bulkAddKeywords, moveKeywords, etc.) don't inflate call totals.
 *
 * ?days=30   — window size, 1–90 (default 30)
 * ?tz=...    — IANA timezone name for the day boundaries in `daily`
 * ?source=   — optional client_source filter, applied ONLY to `daily`
 * ?platform= — optional ad-platform filter (`google_ads` | `meta_ads`),
 *              applied to ALL queries so the whole tab reflects one platform
 */

const PLATFORM_START = new Date("2026-03-25T00:00:00Z");
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { data: unknown; ts: number }>();

export async function GET(request: Request) {
  const denied = await requireDevEmail();
  if (denied) return denied;

  const url = new URL(request.url);

  const rawDays = parseInt(url.searchParams.get("days") || "30", 10);
  const days = Number.isFinite(rawDays) ? Math.min(Math.max(rawDays, 1), 90) : 30;

  const tz = url.searchParams.get("tz") || "America/Los_Angeles";
  if (!/^[A-Za-z0-9_/+-]+$/.test(tz)) {
    return Response.json({ error: "Invalid timezone" }, { status: 400 });
  }

  const source = url.searchParams.get("source") || null;
  const rawPlatform = url.searchParams.get("platform");
  const platform =
    rawPlatform === "google_ads" || rawPlatform === "meta_ads"
      ? rawPlatform
      : null;
  const fresh = url.searchParams.get("fresh") === "1";

  // Admin escape hatch — `?includeDev=1` keeps DEV_EMAILS rows in the result
  // so devs can verify their own activity (e.g. integration tests). Default
  // behavior excludes them so the dashboard isn't dominated by internal
  // testing.
  const includeDev = url.searchParams.get("includeDev") === "1";

  const cacheKey = `${tz}|${days}|${platform ?? "all"}|${includeDev ? "dev" : "prod"}`;
  if (!fresh) {
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
      // If a source filter is requested, still serve from cache for totals/top-users/top-tools
      // but compute daily live. For simplicity, skip cache when source is specified.
      if (!source) return Response.json(hit.data);
    }
  }

  const now = new Date();
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const prevSince = new Date(now.getTime() - 2 * days * 24 * 60 * 60 * 1000);

  const sinceIso = since.toISOString();
  const nowIso = now.toISOString();

  // Build WHERE clauses for current and previous windows.
  // excludeDevOpsFilter() uses an EXISTS subquery on mcp_sessions, which is
  // stable across both windows — so dev users are excluded from both halves.
  // When `includeDev` is true, skip the dev exclusion so the dashboard shows
  // activity from DEV_EMAILS (used to verify integration-test traffic).
  const platformFilter = platform ? eq(schema.operations.platform, platform) : null;
  const devExcludeForAlias = (alias: SQL) =>
    includeDev ? sql`` : sql`AND ${excludeDevOpsFilterForAlias(alias)}`;

  const whereRecent = and(
    gte(schema.operations.createdAt, since),
    ...(includeDev ? [] : [excludeDevOpsFilter()]),
    ...(platformFilter ? [platformFilter] : []),
  );
  const wherePrev = and(
    gte(schema.operations.createdAt, prevSince),
    lt(schema.operations.createdAt, since),
    ...(includeDev ? [] : [excludeDevOpsFilter()]),
    ...(platformFilter ? [platformFilter] : []),
  );

  const tzLiteral = sql.raw(`'${tz}'`);
  const localDate = sql`date((${schema.operations.createdAt} AT TIME ZONE 'UTC') AT TIME ZONE ${tzLiteral})`;

  // Source filter for the daily breakdown only. NOT applied to totals or top-users.
  const dailySourceFilter =
    source === "chat"
      ? sql`${schema.operations.clientSource} is null`
      : source
        ? sql`${schema.operations.clientSource} = ${source}`
        : null;

  const whereDaily = dailySourceFilter
    ? and(whereRecent, dailySourceFilter)
    : whereRecent;

  const [totalsRow, prevTotalsRow, newUsersRow, dailyCounts, topUsers, topTools] = await Promise.all([
    // ── Current-window totals ──────────────────────────────────────────────────
    db()
      .select({
        calls: dedupeCount(schema.operations),
        errors: dedupeErrorCount(schema.operations),
        activeUsers: sql<number>`count(distinct ${schema.operations.userId}) filter (where ${schema.operations.userId} is not null)::int`,
      })
      .from(schema.operations)
      .where(whereRecent),

    // ── Previous-window totals ────────────────────────────────────────────────
    db()
      .select({
        calls: dedupeCount(schema.operations),
        errors: dedupeErrorCount(schema.operations),
        activeUsers: sql<number>`count(distinct ${schema.operations.userId}) filter (where ${schema.operations.userId} is not null)::int`,
      })
      .from(schema.operations)
      .where(wherePrev),

    // ── New users: user_id whose FIRST appearance is inside this window ───────
    // Apply excludeDevOpsFilter to the outer query AND the inner "first seen" check.
    db()
      .select({
        newUsers: sql<number>`count(distinct ${schema.operations.userId})::int`,
      })
      .from(schema.operations)
      .where(
        and(
          whereRecent,
          isNotNull(schema.operations.userId),
          sql`not exists (
            select 1 from operations older
            where older.user_id = ${schema.operations.userId}
              and older.created_at < ${sinceIso}::timestamp
              ${devExcludeForAlias(sql`older.user_id`)}
              ${platform ? sql`and older.platform = ${platform}` : sql``}
          )`,
        ),
      ),

    // ── Per-day breakdown (source-filtered for chart only) ────────────────────
    // Dedupe by (op_type, request_id) so fan-out writes don't double-count.
    db()
      .select({
        day: sql<string>`to_char(${localDate}, 'YYYY-MM-DD')`,
        reads: sql<number>`count(distinct case when ${schema.operations.opType} = 0 then coalesce(${schema.operations.requestId}, ${schema.operations.id}::text) end)::int`,
        writes: sql<number>`count(distinct case when ${schema.operations.opType} = 1 then coalesce(${schema.operations.requestId}, ${schema.operations.id}::text) end)::int`,
        errors: dedupeErrorCount(schema.operations),
        dau: sql<number>`count(distinct ${schema.operations.userId}) filter (where ${schema.operations.userId} is not null)::int`,
      })
      .from(schema.operations)
      .where(whereDaily)
      .groupBy(localDate)
      .orderBy(localDate),

    // ── Top 10 users by error count ───────────────────────────────────────────
    // JOIN mcp_sessions to get googleEmail and primaryAccountId.
    db()
      .select({
        userId: schema.operations.userId,
        calls: dedupeCount(schema.operations),
        errors: dedupeErrorCount(schema.operations),
        googleEmail: sql<string | null>`max(${schema.mcpSessions.googleEmail})`,
        primaryAccountId: sql<string | null>`max(${schema.mcpSessions.customerId})`,
      })
      .from(schema.operations)
      .leftJoin(
        schema.mcpSessions,
        sql`${schema.mcpSessions.userId} = ${schema.operations.userId}`,
      )
      .where(and(whereRecent, isNotNull(schema.operations.userId)))
      .groupBy(schema.operations.userId)
      .having(sql`${dedupeErrorCount(schema.operations)} > 0`)
      .orderBy(desc(dedupeErrorCount(schema.operations)))
      .limit(10),

    // ── Top 20 tools by call volume ───────────────────────────────────────────
    db()
      .select({
        toolName: schema.operations.toolName,
        calls: dedupeCount(schema.operations),
        errors: dedupeErrorCount(schema.operations),
        p50: sql<number>`coalesce((
          SELECT percentile_disc(0.5) WITHIN GROUP (ORDER BY t.lat)
          FROM (
            SELECT MAX(latency_ms) AS lat
            FROM operations o2
            WHERE o2.tool_name = ${schema.operations.toolName}
              AND o2.created_at >= ${sinceIso}::timestamp
              ${devExcludeForAlias(sql`o2.user_id`)}
              ${platform ? sql`AND o2.platform = ${platform}` : sql``}
            GROUP BY COALESCE(o2.request_id, o2.id::text)
          ) t
        ), 0)::int`,
        p95: sql<number>`coalesce((
          SELECT percentile_disc(0.95) WITHIN GROUP (ORDER BY t.lat)
          FROM (
            SELECT MAX(latency_ms) AS lat
            FROM operations o2
            WHERE o2.tool_name = ${schema.operations.toolName}
              AND o2.created_at >= ${sinceIso}::timestamp
              ${devExcludeForAlias(sql`o2.user_id`)}
              ${platform ? sql`AND o2.platform = ${platform}` : sql``}
            GROUP BY COALESCE(o2.request_id, o2.id::text)
          ) t
        ), 0)::int`,
      })
      .from(schema.operations)
      .where(and(whereRecent, isNotNull(schema.operations.toolName)))
      .groupBy(schema.operations.toolName)
      .orderBy(desc(dedupeCount(schema.operations)))
      .limit(20),
  ]);

  // ── Per-user top error classes (top 3 per user) ───────────────────────────
  // Fetch error class breakdown for the top-erroring users, then attach in JS.
  const topUserIds = topUsers
    .map((u) => u.userId)
    .filter((id): id is string => id != null);

  const errorClassByUser = new Map<string, string[]>();
  if (topUserIds.length > 0) {
    const errorClassRows = await db()
      .select({
        userId: schema.operations.userId,
        errorClass: schema.operations.errorClass,
        cnt: dedupeCount(schema.operations),
      })
      .from(schema.operations)
      .where(
        and(
          whereRecent,
          isNotNull(schema.operations.errorClass),
          inArray(schema.operations.userId, topUserIds),
        ),
      )
      .groupBy(schema.operations.userId, schema.operations.errorClass)
      .orderBy(desc(dedupeCount(schema.operations)));

    for (const row of errorClassRows) {
      if (!row.userId || !row.errorClass) continue;
      const arr = errorClassByUser.get(row.userId) ?? [];
      if (arr.length < 3) arr.push(row.errorClass);
      errorClassByUser.set(row.userId, arr);
    }
  }

  const totals = totalsRow[0] ?? { calls: 0, errors: 0, activeUsers: 0 };
  const prev = prevTotalsRow[0] ?? { calls: 0, errors: 0, activeUsers: 0 };
  const newUsers = newUsersRow[0]?.newUsers ?? 0;

  // If the prior window predates the platform start, null out those fields so
  // the UI can show "new" instead of "▲ ∞%".
  const priorWindowPredatesPlatform = prevSince < PLATFORM_START;

  const prevTotals = priorWindowPredatesPlatform
    ? { calls: null, errors: null, activeUsers: null }
    : { calls: prev.calls, errors: prev.errors, activeUsers: prev.activeUsers };

  const payload = {
    days,
    range: { from: sinceIso, to: nowIso },
    totals: {
      calls: totals.calls,
      errors: totals.errors,
      activeUsers: totals.activeUsers,
      newUsers,
    },
    prevTotals,
    daily: dailyCounts,
    topUsersByErrors: topUsers.map((u) => ({
      userId: u.userId,
      googleEmail: u.googleEmail,
      primaryAccountId: u.primaryAccountId,
      calls: u.calls,
      errors: u.errors,
      topErrorClasses: errorClassByUser.get(u.userId ?? "") ?? [],
    })),
    topTools: topTools.map((t) => ({
      toolName: t.toolName,
      calls: t.calls,
      errors: t.errors,
      p50: t.p50,
      p95: t.p95,
    })),
  };

  // Only cache when no source filter is applied (source-filtered calls are
  // the minority path and shouldn't pollute the shared cache).
  if (!source) {
    cache.set(cacheKey, { data: payload, ts: Date.now() });
  }

  return Response.json(payload);
}
