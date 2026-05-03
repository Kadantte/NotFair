import { db, schema } from "@/lib/db";
import { sql, desc, eq, and, gte } from "drizzle-orm";
import { requireDevEmail } from "@/lib/dev-access";
import { dedupeCount, dedupeErrorCount } from "@/lib/dev-ops-filter";
import { errorRate } from "@/lib/dev-format-pure";

/**
 * Per-account activity endpoint for the /dev/[accountId] Activity section.
 * Returns:
 *   - aggregated stats (calls, errors, error rate, p50 latency, last call)
 *   - recent calls (errors-first, limit 50), with expandable args/error message
 *
 * Dedupes by request_id to prevent fan-out inflation.
 * Gated by requireDevEmail() — same as all dev-admin routes.
 *
 * GET /api/dev/[accountId]/activity?days=30
 * ?platform=      — optional platform filter: "google_ads" | "meta_ads" (default: all)
 * ?includeDev=1   — admin escape hatch: parse + cache-key only (no new filter added)
 */

type Platform = "google_ads" | "meta_ads";

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { data: unknown; ts: number }>();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  const denied = await requireDevEmail();
  if (denied) return denied;

  const { accountId } = await params;
  const url = new URL(request.url);

  const rawDays = parseInt(url.searchParams.get("days") || "30", 10);
  const days = Number.isFinite(rawDays) ? Math.min(Math.max(rawDays, 1), 90) : 30;
  const fresh = url.searchParams.get("fresh") === "1";
  const includeDev = url.searchParams.get("includeDev") === "1";

  // Validate platform param
  const rawPlatform = url.searchParams.get("platform") || null;
  if (rawPlatform !== null && rawPlatform !== "google_ads" && rawPlatform !== "meta_ads") {
    return Response.json({ error: "Invalid platform. Must be 'google_ads' or 'meta_ads'." }, { status: 400 });
  }
  const platform = rawPlatform as Platform | null;

  const cacheKey = `${accountId}|${days}|${platform ?? "all"}|${includeDev ? "1" : "0"}`;
  if (!fresh) {
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
      return Response.json(hit.data);
    }
  }

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const baseClauses = [
    eq(schema.operations.accountId, accountId),
    gte(schema.operations.createdAt, since),
  ];
  if (platform) baseClauses.push(eq(schema.operations.platform, platform));
  const whereBase = and(...baseClauses);

  const [statsRow, recentCalls] = await Promise.all([
    // Aggregate stats for the window. Dedupe by request_id.
    db()
      .select({
        calls: dedupeCount(schema.operations),
        errors: dedupeErrorCount(schema.operations),
        p50: sql<number>`coalesce(percentile_disc(0.5) within group (order by ${schema.operations.latencyMs}), 0)::int`,
        lastCallAt: sql<string | null>`max(${schema.operations.createdAt})`,
      })
      .from(schema.operations)
      .where(whereBase),

    // Recent calls, errors-first then by time. Limit 50.
    db()
      .select({
        id: schema.operations.id,
        toolName: schema.operations.toolName,
        opType: schema.operations.opType,
        clientSource: schema.operations.clientSource,
        latencyMs: schema.operations.latencyMs,
        bytesOut: schema.operations.bytesOut,
        errorClass: schema.operations.errorClass,
        errorMessage: schema.operations.errorMessage,
        args: schema.operations.args,
        createdAt: schema.operations.createdAt,
        requestId: schema.operations.requestId,
      })
      .from(schema.operations)
      .where(whereBase)
      .orderBy(
        // Errors first (NULL sorts last for NULLS LAST = errors first when we flip)
        sql`case when ${schema.operations.errorClass} is not null then 0 else 1 end`,
        desc(schema.operations.createdAt),
      )
      .limit(50),
  ]);

  const stats = statsRow[0] ?? { calls: 0, errors: 0, p50: 0, lastCallAt: null };

  // Compute lastCallAgo in seconds for display
  const lastCallAgoMs = stats.lastCallAt
    ? Date.now() - new Date(stats.lastCallAt).getTime()
    : null;

  const payload = {
    days,
    stats: {
      calls: stats.calls,
      errors: stats.errors,
      errorRate: errorRate(stats.calls, stats.errors),
      p50: stats.p50,
      lastCallAt: stats.lastCallAt,
      lastCallAgoMs,
    },
    recentCalls: recentCalls.map((c) => ({
      id: c.id,
      toolName: c.toolName,
      opType: c.opType === 1 ? "write" : "read",
      clientSource: c.clientSource,
      latencyMs: c.latencyMs,
      bytesOut: c.bytesOut,
      errorClass: c.errorClass,
      errorMessage: c.errorMessage,
      args: c.args,
      createdAt: c.createdAt,
      requestId: c.requestId,
    })),
  };

  cache.set(cacheKey, { data: payload, ts: Date.now() });
  return Response.json(payload);
}
