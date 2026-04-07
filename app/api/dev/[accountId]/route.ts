import { getSession } from "@/lib/session";
import { db, schema } from "@/lib/db";
import { sql, desc, eq, and } from "drizzle-orm";
import { OP_TYPE, CODE_TO_TOOL, CODE_TO_ENTITY, ENTITY_CODE } from "@/lib/db/tracking";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> },
) {
  const session = await getSession();
  if (!session.connected || !session.isDev) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { accountId } = await params;
  const url = new URL(request.url);
  const tz = url.searchParams.get("tz") || "America/Los_Angeles";
  if (!/^[A-Za-z0-9_/+-]+$/.test(tz)) {
    return Response.json({ error: "Invalid timezone" }, { status: 400 });
  }

  const [accountInfo, recentOps, dailyUsage, campaignStats] = await Promise.all([
    // Account info from most recent session
    db()
      .select({
        email: schema.mcpSessions.googleEmail,
        customerId: schema.mcpSessions.customerId,
        customerIds: schema.mcpSessions.customerIds,
        lastLogin: schema.mcpSessions.createdAt,
      })
      .from(schema.mcpSessions)
      .where(eq(schema.mcpSessions.customerId, accountId))
      .orderBy(desc(schema.mcpSessions.createdAt))
      .limit(1),

    // Recent write operations (last 50)
    db()
      .select()
      .from(schema.operations)
      .where(
        and(
          eq(schema.operations.accountId, accountId),
          eq(schema.operations.opType, OP_TYPE.WRITE),
        ),
      )
      .orderBy(desc(schema.operations.createdAt))
      .limit(50),

    // Daily usage for last 14 days
    (() => {
      // tz is already sanitized via regex — safe to inline as literal
      const tzLiteral = sql.raw(`'${tz}'`);
      const localDate = sql`date((${schema.operations.createdAt} AT TIME ZONE 'UTC') AT TIME ZONE ${tzLiteral})`;
      return db()
        .select({
          date: sql<string>`${localDate}`.as("date"),
          reads: sql<number>`count(*) filter (where ${schema.operations.opType} = 0)`.as("reads"),
          writes: sql<number>`count(*) filter (where ${schema.operations.opType} = 1)`.as("writes"),
          total: sql<number>`count(*)`.as("total"),
        })
        .from(schema.operations)
        .where(
          and(
            eq(schema.operations.accountId, accountId),
            sql`${schema.operations.createdAt} >= now() - interval '14 days'`,
          ),
        )
        .groupBy(localDate)
        .orderBy(desc(localDate));
    })(),

    // Distinct campaigns touched in operations
    db()
      .select({
        campaignId: schema.operations.campaignId,
        ops: sql<number>`count(*)`.as("ops"),
        writes: sql<number>`count(*) filter (where ${schema.operations.opType} = 1)`.as("writes"),
        lastOp: sql<string>`max(${schema.operations.createdAt})`.as("last_op"),
      })
      .from(schema.operations)
      .where(
        and(
          eq(schema.operations.accountId, accountId),
          sql`${schema.operations.campaignId} is not null`,
        ),
      )
      .groupBy(schema.operations.campaignId)
      .orderBy(desc(sql`count(*)`))
      .limit(50),
  ]);

  const info = accountInfo[0] ?? null;

  // Parse customerIds to get connected account names
  let connectedAccounts: { id: string; name: string }[] = [];
  if (info?.customerIds) {
    try {
      connectedAccounts = JSON.parse(info.customerIds);
    } catch { /* ignore */ }
  }

  return Response.json({
    accountId,
    email: info?.email ?? null,
    connectedAccounts,
    lastLogin: info?.lastLogin ?? null,
    recentOperations: recentOps.map((op) => ({
      id: op.id,
      action: CODE_TO_TOOL[op.toolCode] ?? `unknown_${op.toolCode}`,
      entityType: CODE_TO_ENTITY[op.entityCode ?? ENTITY_CODE.unknown] ?? "unknown",
      entityId: op.entityId ?? "",
      campaignId: op.campaignId,
      beforeValue: op.beforeValue ?? "",
      afterValue: op.afterValue ?? "",
      reasoning: op.reasoning,
      rolledBack: op.rolledBack === 1,
      timestamp: op.createdAt,
    })),
    dailyUsage,
    campaigns: campaignStats.map((c) => ({
      campaignId: c.campaignId,
      totalOps: Number(c.ops),
      writes: Number(c.writes),
      lastOp: c.lastOp,
    })),
  });
}
