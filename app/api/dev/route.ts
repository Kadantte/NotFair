import { db, schema } from "@/lib/db";
import { sql, desc } from "drizzle-orm";
import { requireDevEmail } from "@/lib/dev-access";
import { excludeDevOpsFilter } from "@/lib/dev-ops-filter";

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
  const sourceFilter = source === "chat"
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
        reads: sql<number>`(count(*) filter (where ${schema.operations.opType} = 0))::int`.as("reads"),
        writes: sql<number>`(count(*) filter (where ${schema.operations.opType} = 1))::int`.as("writes"),
        total: sql<number>`count(*)::int`.as("total"),
      })
      .from(schema.operations)
      .where(whereClause)
      .groupBy(localDate)
      .orderBy(desc(localDate)),
    // Distinct sources with counts (cheap — no JOIN needed)
    db()
      .select({
        source: sql<string>`coalesce(${schema.operations.clientSource}, 'chat')`.as("source"),
        ops: sql<number>`count(*)::int`.as("ops"),
      })
      .from(schema.operations)
      .where(sql`${timeFilter} and ${excludeDevs}`)
      .groupBy(sql`coalesce(${schema.operations.clientSource}, 'chat')`)
      .orderBy(desc(sql`count(*)`)),
  ]);

  const payload = { dailyUsage, sources };
  cache.set(cacheKey, { data: payload, ts: Date.now() });
  return Response.json(payload);
}
