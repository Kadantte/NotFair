import { getAuthContext } from "@/lib/session";
import { db, schema } from "@/lib/db";
import { sql, desc } from "drizzle-orm";
import { DEV_EMAILS } from "@/lib/dev-access";
import { getAccountBudgetSummary } from "@/lib/google-ads";

export async function GET(request: Request) {
  let auth: { refreshToken: string };
  let googleEmail: string | null = null;
  try {
    const ctx = await getAuthContext();
    auth = ctx.auth;
    // When impersonating, use the real dev's email for the dev gate check
    googleEmail = ctx.auth.realGoogleEmail ?? ctx.session.googleEmail;
  } catch (err) {
    if (err instanceof Error && err.message === "Not authenticated") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
  if (!googleEmail || !DEV_EMAILS.includes(googleEmail)) {
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

    // All accounts from mcp_sessions, with operation counts (0 if none)
    db().execute<{
      account_id: string;
      account_name: string | null;
      email: string | null;
      reads: number;
      writes: number;
      total: number;
      last_active: string | null;
    }>(sql`
      WITH all_accounts AS (
        SELECT DISTINCT ON (elem->>'id')
          elem->>'id' AS account_id,
          elem->>'name' AS account_name,
          ${schema.mcpSessions.googleEmail} AS email
        FROM ${schema.mcpSessions},
          jsonb_array_elements(
            CASE WHEN ${schema.mcpSessions.customerIds} IS NOT NULL
              AND ${schema.mcpSessions.customerIds} != ''
              AND ${schema.mcpSessions.customerIds} != '[]'
            THEN ${schema.mcpSessions.customerIds}::jsonb ELSE '[]'::jsonb END
          ) AS elem
        ORDER BY elem->>'id', ${schema.mcpSessions.createdAt} DESC
      ),
      ops_counts AS (
        SELECT
          ${schema.operations.accountId} AS account_id,
          count(*) FILTER (WHERE ${schema.operations.opType} = 0) AS reads,
          count(*) FILTER (WHERE ${schema.operations.opType} = 1) AS writes,
          count(*) AS total,
          max(${schema.operations.createdAt}) AS last_active
        FROM ${schema.operations}
        GROUP BY ${schema.operations.accountId}
      )
      SELECT
        a.account_id,
        a.account_name,
        a.email,
        COALESCE(o.reads, 0)::int AS reads,
        COALESCE(o.writes, 0)::int AS writes,
        COALESCE(o.total, 0)::int AS total,
        o.last_active
      FROM all_accounts a
      LEFT JOIN ops_counts o ON a.account_id = o.account_id
      ORDER BY COALESCE(o.total, 0) DESC, a.account_name ASC
    `),
  ]);

  const accountOpsMapped = accountOps.map((row) => ({
    accountId: row.account_id,
    accountName: row.account_name,
    email: row.email,
    reads: row.reads,
    writes: row.writes,
    total: row.total,
    lastActive: row.last_active,
  }));

  // Fetch budget summaries for each account using the current session's refresh token
  const budgets: Record<string, { totalDailyBudget: number; activeCampaigns: number; currencyCode: string | null }> = {};
  const activeAccounts = accountOpsMapped.filter((acc) => acc.total > 0);
  const budgetResults = await Promise.allSettled(
    activeAccounts.map(async (acc) => {
      const summary = await getAccountBudgetSummary({
        refreshToken: auth.refreshToken,
        customerId: acc.accountId,
      });
      return { accountId: acc.accountId, ...summary };
    }),
  );
  for (const result of budgetResults) {
    if (result.status === "fulfilled") {
      budgets[result.value.accountId] = {
        totalDailyBudget: result.value.totalDailyBudget,
        activeCampaigns: result.value.activeCampaigns,
        currencyCode: result.value.currencyCode,
      };
    }
  }

  return Response.json({ dailyUsage, accountOps: accountOpsMapped, budgets });
}
