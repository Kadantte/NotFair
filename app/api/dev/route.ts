import { getSession } from "@/lib/session";
import { db, schema } from "@/lib/db";
import { sql, desc } from "drizzle-orm";
import { DEV_EMAILS } from "@/lib/dev-access";

export async function GET() {
  const session = await getSession();
  if (!session.connected || !session.googleEmail || !DEV_EMAILS.includes(session.googleEmail)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const [dailyUsage, accountOps] = await Promise.all([
    // Daily API usage for last 30 days
    db()
      .select({
        date: sql<string>`date(${schema.operations.createdAt})`.as("date"),
        reads: sql<number>`count(*) filter (where ${schema.operations.opType} = 0)`.as("reads"),
        writes: sql<number>`count(*) filter (where ${schema.operations.opType} = 1)`.as("writes"),
        total: sql<number>`count(*)`.as("total"),
      })
      .from(schema.operations)
      .where(sql`${schema.operations.createdAt} >= now() - interval '30 days'`)
      .groupBy(sql`date(${schema.operations.createdAt})`)
      .orderBy(desc(sql`date(${schema.operations.createdAt})`)),

    // Total operations by account
    db()
      .select({
        accountId: schema.operations.accountId,
        reads: sql<number>`count(*) filter (where ${schema.operations.opType} = 0)`.as("reads"),
        writes: sql<number>`count(*) filter (where ${schema.operations.opType} = 1)`.as("writes"),
        total: sql<number>`count(*)`.as("total"),
        lastActive: sql<string>`max(${schema.operations.createdAt})`.as("last_active"),
      })
      .from(schema.operations)
      .groupBy(schema.operations.accountId)
      .orderBy(desc(sql`count(*)`)),
  ]);

  return Response.json({ dailyUsage, accountOps });
}
