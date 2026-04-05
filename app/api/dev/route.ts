import { getSession } from "@/lib/session";
import { db, schema } from "@/lib/db";
import { sql, desc, eq } from "drizzle-orm";
import { DEV_EMAILS } from "@/lib/dev-access";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session.connected || !session.googleEmail || !DEV_EMAILS.includes(session.googleEmail)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const tz = url.searchParams.get("tz") || "America/Los_Angeles";
  // Sanitize: only allow IANA timezone names (letters, digits, underscores, slashes, hyphens)
  if (!/^[A-Za-z0-9_/+-]+$/.test(tz)) {
    return Response.json({ error: "Invalid timezone" }, { status: 400 });
  }

  // tz is already sanitized above via regex — safe to use sql.raw
  const tzLiteral = sql.raw(`'${tz}'`);
  const localDate = sql`date((${schema.operations.createdAt} AT TIME ZONE 'UTC') AT TIME ZONE ${tzLiteral})`;

  const [dailyUsage, accountOps] = await Promise.all([
    // Daily API usage for last 30 days
    db()
      .select({
        date: sql<string>`${localDate}`.as("date"),
        reads: sql<number>`count(*) filter (where ${schema.operations.opType} = 0)`.as("reads"),
        writes: sql<number>`count(*) filter (where ${schema.operations.opType} = 1)`.as("writes"),
        total: sql<number>`count(*)`.as("total"),
      })
      .from(schema.operations)
      .where(sql`${schema.operations.createdAt} >= now() - interval '30 days'`)
      .groupBy(localDate)
      .orderBy(desc(localDate)),

    // Total operations by account, with email from mcp_sessions
    db()
      .select({
        accountId: schema.operations.accountId,
        accountName: sql<string | null>`max((SELECT elem->>'name' FROM jsonb_array_elements(CASE WHEN ${schema.mcpSessions.customerIds} IS NOT NULL AND ${schema.mcpSessions.customerIds} != '' AND ${schema.mcpSessions.customerIds} != '[]' THEN ${schema.mcpSessions.customerIds}::jsonb ELSE '[]'::jsonb END) AS elem WHERE elem->>'id' = ${schema.operations.accountId} LIMIT 1))`.as("account_name"),
        email: sql<string | null>`max(${schema.mcpSessions.googleEmail})`.as("email"),
        reads: sql<number>`count(*) filter (where ${schema.operations.opType} = 0)`.as("reads"),
        writes: sql<number>`count(*) filter (where ${schema.operations.opType} = 1)`.as("writes"),
        total: sql<number>`count(*)`.as("total"),
        lastActive: sql<string>`max(${schema.operations.createdAt})`.as("last_active"),
      })
      .from(schema.operations)
      .leftJoin(
        schema.mcpSessions,
        eq(schema.operations.userId, schema.mcpSessions.userId),
      )
      .groupBy(schema.operations.accountId)
      .orderBy(desc(sql`count(*)`)),
  ]);

  return Response.json({ dailyUsage, accountOps });
}
