import { db, schema } from "@/lib/db";
import { sql, desc, and, gte, lt, isNotNull } from "drizzle-orm";
import { requireDevEmail } from "@/lib/dev-access";
import { excludeDevOpsFilter, devEmailSqlList } from "@/lib/dev-ops-filter";

/**
 * Dev-gated telemetry endpoint. Returns aggregate views over the operations
 * table that answer "how are users using NotFair?": top tools with p50/p95
 * latency, previous-period tool call counts for trend badges, top arg-shape
 * buckets, a funnel of reads vs writes + errors by day, and the last 100 raw
 * calls with args and error messages. Full args and error messages are gated to
 * DEV_EMAILS so the payload never leaks outside the admin group.
 */
export async function GET(request: Request) {
  const denied = await requireDevEmail();
  if (denied) return denied;

  const url = new URL(request.url);
  const rawDays = parseInt(url.searchParams.get("days") || "7", 10);
  const days = Number.isFinite(rawDays) ? Math.min(Math.max(rawDays, 1), 90) : 7;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const sinceIso = since.toISOString();
  const prevSince = new Date(Date.now() - 2 * days * 24 * 60 * 60 * 1000);

  // Exclude ops attributed to dev users so internal testing doesn't skew telemetry.
  const notDev = excludeDevOpsFilter();
  const whereRecent = and(gte(schema.operations.createdAt, since), notDev);
  const wherePrev = and(gte(schema.operations.createdAt, prevSince), lt(schema.operations.createdAt, since), notDev);

  const [topTools, prevTopTools, topArgShapes, recentCalls, dailyCounts, errorBreakdown] = await Promise.all([
    // Bulk write tools (bulkPauseKeywords, bulkAddKeywords, moveKeywords, ...)
    // fan out logging so each fan-out item lands as its own row. All rows from
    // one MCP invocation share `request_id`, so `COUNT(*)` inflated call counts
    // 5-7× for those tools. Dedupe by request_id; fall back to the row's own
    // id when request_id is null (pre-telemetry rows, or chat/agent paths).
    // Latency percentiles are taken from a per-invocation MAX so one slow bulk
    // call can't be weighted 25× in the p50/p95.
    db()
      .select({
        toolName: schema.operations.toolName,
        calls: sql<number>`count(distinct coalesce(${schema.operations.requestId}, ${schema.operations.id}::text))::int`,
        p50: sql<number>`coalesce((
          SELECT percentile_disc(0.5) WITHIN GROUP (ORDER BY t.lat)
          FROM (
            SELECT MAX(latency_ms) AS lat
            FROM operations o2
            WHERE o2.tool_name = ${schema.operations.toolName}
              AND o2.created_at >= ${sinceIso}::timestamp
              AND NOT EXISTS (SELECT 1 FROM mcp_sessions s WHERE s.user_id = o2.user_id AND lower(s.google_email) IN (${devEmailSqlList()}))
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
              AND NOT EXISTS (SELECT 1 FROM mcp_sessions s WHERE s.user_id = o2.user_id AND lower(s.google_email) IN (${devEmailSqlList()}))
            GROUP BY COALESCE(o2.request_id, o2.id::text)
          ) t
        ), 0)::int`,
        avgBytes: sql<number>`coalesce(avg(${schema.operations.bytesOut}), 0)::int`,
        errors: sql<number>`count(distinct case when ${schema.operations.errorClass} is not null then coalesce(${schema.operations.requestId}, ${schema.operations.id}::text) end)::int`,
      })
      .from(schema.operations)
      .where(and(whereRecent, isNotNull(schema.operations.toolName)))
      .groupBy(schema.operations.toolName)
      .orderBy(desc(sql`count(distinct coalesce(${schema.operations.requestId}, ${schema.operations.id}::text))`))
      .limit(40),

    // Previous period tool stats for trend comparison (current period vs prev period).
    // Only calls needed — trend badge is call-volume-only, not error-rate trend.
    db()
      .select({
        toolName: schema.operations.toolName,
        calls: sql<number>`count(distinct coalesce(${schema.operations.requestId}, ${schema.operations.id}::text))::int`,
      })
      .from(schema.operations)
      .where(and(wherePrev, isNotNull(schema.operations.toolName)))
      .groupBy(schema.operations.toolName)
      .orderBy(desc(sql`count(distinct coalesce(${schema.operations.requestId}, ${schema.operations.id}::text))`))
      .limit(200),

    // Grouped call counts per (tool_name, args_sha256). Fan-out rows share
    // one args_sha256 within a request_id, so dedupe by request_id here too.
    // The sample args are fetched via a lateral subquery — `array_agg(...
    // order by ...)[1]` materializes the entire partition into memory, which
    // OOMs once popular arg shapes cross ~100K rows. The subquery with
    // LIMIT 1 lets Postgres use the ops_args_sha_idx to seek straight to the
    // most recent row.
    db()
      .select({
        toolName: schema.operations.toolName,
        argsSha256: schema.operations.argsSha256,
        calls: sql<number>`count(distinct coalesce(${schema.operations.requestId}, ${schema.operations.id}::text))::int`,
        sampleArgs: sql<unknown>`(
          SELECT o2.args FROM operations o2
          WHERE o2.args_sha256 = ${schema.operations.argsSha256}
          ORDER BY o2.created_at DESC
          LIMIT 1
        )`,
      })
      .from(schema.operations)
      .where(and(whereRecent, isNotNull(schema.operations.argsSha256), isNotNull(schema.operations.toolName)))
      .groupBy(schema.operations.toolName, schema.operations.argsSha256)
      .orderBy(desc(sql`count(distinct coalesce(${schema.operations.requestId}, ${schema.operations.id}::text))`))
      .limit(30),

    db()
      .select({
        id: schema.operations.id,
        toolName: schema.operations.toolName,
        userId: schema.operations.userId,
        sessionId: schema.operations.sessionId,
        clientSource: schema.operations.clientSource,
        latencyMs: schema.operations.latencyMs,
        bytesOut: schema.operations.bytesOut,
        errorClass: schema.operations.errorClass,
        errorMessage: schema.operations.errorMessage,
        opType: schema.operations.opType,
        args: schema.operations.args,
        createdAt: schema.operations.createdAt,
      })
      .from(schema.operations)
      .where(whereRecent)
      .orderBy(desc(schema.operations.createdAt))
      .limit(100),

    // Fan-out rows would double-count writes here, swamping the reads column
    // and making the read/write ratio meaningless. Dedupe by (op_type, request_id)
    // so each invocation contributes once per day regardless of fan-out width.
    db()
      .select({
        day: sql<string>`to_char(date_trunc('day', ${schema.operations.createdAt}), 'YYYY-MM-DD')`,
        reads: sql<number>`count(distinct case when ${schema.operations.opType} = 0 then coalesce(${schema.operations.requestId}, ${schema.operations.id}::text) end)::int`,
        writes: sql<number>`count(distinct case when ${schema.operations.opType} = 1 then coalesce(${schema.operations.requestId}, ${schema.operations.id}::text) end)::int`,
        errors: sql<number>`count(distinct case when ${schema.operations.errorClass} is not null then coalesce(${schema.operations.requestId}, ${schema.operations.id}::text) end)::int`,
      })
      .from(schema.operations)
      .where(whereRecent)
      .groupBy(sql`date_trunc('day', ${schema.operations.createdAt})`)
      .orderBy(sql`date_trunc('day', ${schema.operations.createdAt})`),

    db()
      .select({
        errorClass: schema.operations.errorClass,
        calls: sql<number>`count(distinct coalesce(${schema.operations.requestId}, ${schema.operations.id}::text))::int`,
      })
      .from(schema.operations)
      .where(and(whereRecent, isNotNull(schema.operations.errorClass)))
      .groupBy(schema.operations.errorClass)
      .orderBy(desc(sql`count(distinct coalesce(${schema.operations.requestId}, ${schema.operations.id}::text))`)),
  ]);

  return Response.json({
    days,
    topTools,
    prevTopTools,
    topArgShapes,
    recentCalls,
    dailyCounts,
    errorBreakdown,
  });
}
