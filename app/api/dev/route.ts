import { db, schema } from "@/lib/db";
import { sql, desc } from "drizzle-orm";
import { requireDevEmail } from "@/lib/dev-access";
import { OP_TYPE } from "@/lib/db/tracking";
import { excludeDevOpsFilter, operationRowCount, operationTypeRowCount } from "@/lib/dev-ops-filter";

// 60s admin cache keyed by tz+source. Usage stats roll up 30 days, so a
// minute of staleness is invisible.
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { data: unknown; ts: number }>();

export async function GET(request: Request) {
  const denied = await requireDevEmail();
  if (denied) return denied;

  const url = new URL(request.url);
  const tz = url.searchParams.get("tz") || "America/Los_Angeles";
  // Sanitize: only allow IANA timezone names (letters, digits, underscores, slashes, hyphens)
  if (!/^[A-Za-z0-9_/+-]+$/.test(tz)) {
    return Response.json({ error: "Invalid timezone" }, { status: 400 });
  }

  const source = url.searchParams.get("source"); // optional: "claude-code", "claude-desktop", "chat"
  const fresh = url.searchParams.get("fresh") === "1";
  const cacheKey = `${tz}|${source ?? ""}`;
  if (!fresh) {
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
      return Response.json(hit.data);
    }
  }

  // tz is already sanitized above via regex — safe to use sql.raw
  const tzLiteral = sql.raw(`'${tz}'`);
  const localDate = sql`date((${schema.operations.createdAt} AT TIME ZONE 'UTC') AT TIME ZONE ${tzLiteral})`;

  const timeFilter = sql`${schema.operations.createdAt} >= now() - interval '30 days'`;
  const normalizedSource = sql<string>`case
    when ${schema.operations.clientSource} in ('chat', 'adsagent-chat') then 'chat'
    when ${schema.operations.clientSource} is null then 'unknown'
    else ${schema.operations.clientSource}
  end`;
  const sourceFilter = source === "chat" || source === "adsagent-chat"
    ? sql`${schema.operations.clientSource} in ('chat', 'adsagent-chat')`
    : source === "unknown"
      ? sql`${schema.operations.clientSource} is null`
    : source
      ? sql`${schema.operations.clientSource} = ${source}`
      : undefined;
  // Exclude ops attributed to dev users so internal testing doesn't skew stats.
  const excludeDevs = excludeDevOpsFilter();
  const whereClause = sourceFilter
    ? sql`${timeFilter} and ${sourceFilter} and ${excludeDevs}`
    : sql`${timeFilter} and ${excludeDevs}`;

  const [dailyUsage, sources] = await Promise.all([
    db()
      .select({
        date: sql<string>`${localDate}`.as("date"),
        reads: operationTypeRowCount(schema.operations, OP_TYPE.READ),
        writes: operationTypeRowCount(schema.operations, OP_TYPE.WRITE),
        total: operationRowCount(schema.operations),
      })
      .from(schema.operations)
      .where(whereClause)
      .groupBy(localDate)
      .orderBy(desc(localDate)),
    // Distinct sources with counts (cheap — no JOIN needed)
    db()
      .select({
        source: normalizedSource.as("source"),
        ops: operationRowCount(schema.operations),
      })
      .from(schema.operations)
      .where(sql`${timeFilter} and ${excludeDevs}`)
      .groupBy(normalizedSource)
      .orderBy(desc(operationRowCount(schema.operations))),
  ]);

  const payload = { dailyUsage, sources };
  cache.set(cacheKey, { data: payload, ts: Date.now() });
  return Response.json(payload);
}
